/**
 * MCP 学习记忆服务器（stdio，独立入口）
 * MCP Learning-Memory Server (stdio, standalone entry)
 *
 * @ai-context: 宪法 P2 内层防御——熵减作为 MCP Server，把本地学习记忆
 * 暴露给用户自己的 AI 代理（Claude Desktop 等宿主）。实现约束
 * （docs/product/mcp-learning-memory-interface.md §五）：
 *   1. 默认关闭：userData 下必须存在 memory-server-consent 标记文件
 *   2. 本地 stdio only：不监听任何网络端口
 *   3. 只读：better-sqlite3 readonly 打开 keban.db
 *   4. 调用留痕：每次工具调用追加 memory-server-access.log
 *
 * 宿主启动方式（Electron 原生模块 ABI 兼容）：
 *   command: <path-to>/entropy-decrease.exe（或 electron 可执行文件）
 *   env: { ELECTRON_RUN_AS_NODE: "1" }
 *   args: [ "<dist>/electron/mcpMemoryServer.js" ]
 *
 * @ai-context: Standalone stdio MCP server exposing read-only learning
 * memory summaries. Consent marker required; every call is logged.
 */
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// ================================================================
// 路径解析（无 electron 依赖：独立进程内手动推导 userData）
// ================================================================

const APP_DIR_NAME = 'entropy-decrease';
const CONSENT_MARKER = 'memory-server-consent';
const ACCESS_LOG = 'memory-server-access.log';

function resolveUserDataDir(): string {
  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), APP_DIR_NAME);
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', APP_DIR_NAME);
    default:
      return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), APP_DIR_NAME);
  }
}

/** 与 storageConfig.resolveDbPath 同口径：优先自定义路径，回退 userData/keban.db */
function resolveDbPath(userDataDir: string): string {
  try {
    const cfgPath = path.join(userDataDir, 'storage-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as { customStoragePath?: string | null };
      if (cfg.customStoragePath) return path.join(cfg.customStoragePath, 'keban.db');
    }
  } catch { /* 配置损坏时回退默认路径 */ }
  return path.join(userDataDir, 'keban.db');
}

function logAccess(userDataDir: string, tool: string): void {
  try {
    fs.appendFileSync(
      path.join(userDataDir, ACCESS_LOG),
      `${new Date().toISOString()} learning_memory.${tool}\n`,
    );
  } catch { /* 日志失败不影响服务 */ }
}

// ================================================================
// 主流程
// ================================================================

async function main(): Promise<void> {
  const userDataDir = resolveUserDataDir();

  // 约束 1：默认关闭——无显式授权标记即拒绝启动
  if (!fs.existsSync(path.join(userDataDir, CONSENT_MARKER))) {
    console.error(
      '[keban-memory] 学习记忆接口未授权。\n' +
      '此接口会把你的学习摘要暴露给外部 AI 代理，需要你显式同意。\n' +
      `若确认开启，请创建标记文件：${path.join(userDataDir, CONSENT_MARKER)}\n` +
      '（应用内设置页的授权开关将在后续批次提供）',
    );
    process.exit(1);
  }

  const dbPath = resolveDbPath(userDataDir);
  if (!fs.existsSync(dbPath)) {
    console.error(`[keban-memory] 未找到学习数据库：${dbPath}（请先启动一次熵减应用）`);
    process.exit(1);
  }

  // 约束 3：只读打开
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  const {
    queryProfile, queryMastery, queryReviewCandidates, queryFocusStats,
    queryStreak, queryDiscoveries, queryRecentSessions, queryWorldState,
  } = await import('./mcp/memoryQueries.js');

  /** 工具表：name → 描述 + JSON Schema + 处理函数（全部只读摘要） */
  const tools: Record<string, {
    description: string;
    inputSchema: Record<string, unknown>;
    run: (args: Record<string, unknown>) => Record<string, unknown>;
  }> = {
    profile: {
      description: '学习画像摘要：累计深潜时长、模块足迹、最佳专注时段',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: () => queryProfile(db),
    },
    mastery: {
      description: '概念掌握度档位（牢固/成长中/朦胧），可按主题模糊过滤；不含倒计时',
      inputSchema: {
        type: 'object',
        properties: { topic: { type: 'string', description: '主题关键词（可选，模糊匹配）' } },
        additionalProperties: false,
      },
      run: (a) => queryMastery(db, typeof a.topic === 'string' ? a.topic : undefined),
    },
    review_candidates: {
      description: '待唤醒知识列表（朦胧度档位表达，无截止日期）',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number', description: '返回上限（1-100，默认 20）' } },
        additionalProperties: false,
      },
      run: (a) => queryReviewCandidates(db, a.limit),
    },
    focus_stats: {
      description: '专注历史统计：总时长/均长/完成率/最佳时段',
      inputSchema: {
        type: 'object',
        properties: { rangeDays: { type: 'number', description: '统计天数（默认 30，上限 365）' } },
        additionalProperties: false,
      },
      run: (a) => queryFocusStats(db, a.rangeDays),
    },
    streak: {
      description: '连击状态（含休息日语义——可逆原则，断裂非惩罚）',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: () => queryStreak(db),
    },
    discoveries: {
      description: '深海发现图鉴（跨进程接线建设中，当前返回占位）',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: () => queryDiscoveries(db),
    },
    recent_sessions: {
      description: '最近学习会话摘要（深潜与费曼）',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number', description: '返回上限（1-100，默认 20）' } },
        additionalProperties: false,
      },
      run: (a) => queryRecentSessions(db, a.limit),
    },
    world_state: {
      description: '世界状态快照：潜航深度与朦胧占比（派生值，含 provenance 标注）',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: () => queryWorldState(db),
    },
  };

  // SDK 低层 Server API（避免对传递依赖 zod 的直接引用）
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');

  const server = new Server(
    { name: 'keban-learning-memory', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.entries(tools).map(([name, t]) => ({
      name: `learning_memory.${name}`,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const rawName = req.params.name ?? '';
    const name = rawName.startsWith('learning_memory.') ? rawName.slice('learning_memory.'.length) : rawName;
    const tool = tools[name];
    if (!tool) {
      return { content: [{ type: 'text', text: `未知工具：${rawName}` }], isError: true };
    }
    // 约束 4：调用留痕（宿主与用户均可审计"谁读过你的记忆"）
    logAccess(userDataDir, name);
    try {
      const result = tool.run((req.params.arguments ?? {}) as Record<string, unknown>);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `查询失败：${msg}` }], isError: true };
    }
  });

  // 约束 2：stdio only——transport 即 stdin/stdout，无任何网络监听
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[keban-memory] learning-memory server ready (stdio, read-only)');
}

main().catch((err) => {
  console.error('[keban-memory] fatal:', err);
  process.exit(1);
});
