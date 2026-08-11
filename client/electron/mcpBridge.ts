/**
 * MCP Bridge — 纯 Node.js 子进程
 *
 * 由主进程的 mcpManager.ts 通过 child_process.fork() 启动，
 * 在独立的 Node.js 运行环境中加载 MCP SDK 并管理 server 连接。
 *
 * 为什么需要 Bridge：
 *   Electron 主进程是 CJS 环境，而 MCP SDK 的 StdioClientTransport
 *   仅提供 ESM 导出。Electron 的模块系统不支持 new Function + import() 技巧。
 *   Bridge 运行在纯 Node.js 中，原生支持 ESM dynamic import()。
 *
 * 通信协议（JSON over IPC）：
 *   主进程 → Bridge：{ id, method, params }
 *   Bridge → 主进程：{ id, result?, error? }
 *
 * 注意：此文件不应 import 任何 Electron 模块（app, BrowserWindow 等）。
 *
 * @ai-context Electron MCP 集成 — Bridge 子进程
 */

// ================================================================
// IPC 消息类型
// ================================================================

interface BridgeRequest {
  id: string;
  method: 'init' | 'listTools' | 'callTool' | 'shutdown';
  params?: Record<string, unknown>;
}

interface BridgeResponse {
  id: string;
  result?: unknown;
  error?: string;
}

// ================================================================
// MCP SDK 类型（运行时）
// ================================================================

interface McpClient {
  connect(transport: unknown): Promise<void>;
  listTools(): Promise<{ tools: McpToolInfo[] }>;
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
  close(): Promise<void>;
}

interface McpTransport {
  close(): Promise<void>;
}

interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface StdioServerParameters {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  stderr?: 'pipe' | 'overlapped' | 'inherit' | 'ignore';
  cwd?: string;
}

// ================================================================
// SDK 构造器（init 时加载）
// ================================================================

let ClientCtor: (new (opts: { name: string; version: string }) => McpClient) | null = null;
let StdioTransportCtor: (new (params: StdioServerParameters) => McpTransport) | null = null;

// ================================================================
// Server 管理
// ================================================================

interface ServerEntry {
  name: string;
  client: McpClient | null;
  transport: McpTransport | null;
  connected: boolean;
}

const servers = new Map<string, ServerEntry>();

// ================================================================
// 核心方法
// ================================================================

async function handleInit(params: Record<string, unknown>): Promise<Record<string, boolean>> {
  // 1a. CJS 加载 Client
  const clientMod = require('@modelcontextprotocol/sdk/client') as {
    Client: new (opts: { name: string; version: string }) => McpClient;
  };
  ClientCtor = clientMod.Client;
  log('Client loaded via CJS require');

  // 1b. 原生 import() 加载 StdioClientTransport
  //     在纯 Node.js (v22+) 中，new Function 保留原生 ESM dynamic import
  const nativeImport = new Function('specifier', 'return import(specifier)') as (s: string) => Promise<unknown>;
  const stdioMod = await nativeImport('@modelcontextprotocol/sdk/client/stdio.js') as {
    StdioClientTransport: new (params: StdioServerParameters) => McpTransport;
  };
  StdioTransportCtor = stdioMod.StdioClientTransport;
  log('StdioClientTransport loaded via native dynamic import');

  // 2. 启动各 server
  const serverConfigs = params.servers as Array<{
    name: string;
    command: string;
    args: string[];
  }>;

  for (const config of serverConfigs) {
    await startServer(config);
  }

  // 3. 返回状态
  const status: Record<string, boolean> = {};
  for (const [name, entry] of servers) {
    status[name] = entry.connected;
  }

  const connected = Object.values(status).filter(Boolean).length;
  log(`Init complete: ${connected}/${serverConfigs.length} servers connected`);
  return status;
}

// CL-M7: MCP server 子进程最小环境白名单（仅传运行必需的基础变量）
const MINIMAL_ENV_KEYS = [
  'PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE',
  'APPDATA', 'LOCALAPPDATA', 'COMSPEC', 'PATHEXT', 'NODE_PATH', 'LANG', 'LC_ALL',
];

/** 构建传给 MCP server 子进程的最小环境（显式白名单，绝不透传宿主全部环境变量） */
function buildMinimalEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of MINIMAL_ENV_KEYS) {
    const val = process.env[key];
    if (typeof val === 'string' && val) {
      env[key] = val;
    }
  }
  return env;
}

async function startServer(config: { name: string; command: string; args: string[] }): Promise<void> {
  if (!ClientCtor || !StdioTransportCtor) return;

  const entry: ServerEntry = {
    name: config.name,
    client: null,
    transport: null,
    connected: false,
  };
  servers.set(config.name, entry);

  try {
    log(`Starting server "${config.name}": ${config.command} ${config.args.join(' ')}`);

    const transport = new StdioTransportCtor({
      command: config.command,
      args: config.args,
      // CL-M7: 最小环境白名单——绝不把主进程全部环境变量传给第三方 MCP
      // server 子进程（供应链污染可读取宿主凭据）；仅传运行必需的基础变量
      env: buildMinimalEnv(),
      stderr: 'pipe',
    });

    entry.transport = transport;

    const client = new ClientCtor({
      name: `entropydecrease-${config.name}`,
      version: '1.0.0',
    });

    await client.connect(transport);
    entry.client = client;
    entry.connected = true;

    log(`Server "${config.name}" connected successfully`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log(`Failed to start server "${config.name}": ${errMsg}`);
    if (entry.transport) {
      entry.transport.close().catch(() => {});
    }
    entry.transport = null;
    entry.client = null;
    entry.connected = false;
  }
}

async function handleListTools(params: Record<string, unknown>): Promise<McpToolInfo[]> {
  const serverName = params.serverName as string;
  const entry = servers.get(serverName);
  if (!entry?.connected || !entry.client) {
    throw new Error(`MCP server "${serverName}" is not connected`);
  }
  const result = await entry.client.listTools();
  return result.tools;
}

async function handleCallTool(params: Record<string, unknown>): Promise<unknown> {
  const serverName = params.serverName as string;
  const toolName = params.toolName as string;
  const args = params.args as Record<string, unknown> | undefined;

  const entry = servers.get(serverName);
  if (!entry?.connected || !entry.client) {
    throw new Error(`MCP server "${serverName}" is not connected`);
  }

  log(`Calling tool "${toolName}" on server "${serverName}"`);
  return await entry.client.callTool({ name: toolName, arguments: args });
}

async function handleShutdown(): Promise<void> {
  log('Shutting down all MCP servers...');

  const promises: Promise<void>[] = [];

  for (const entry of servers.values()) {
    if (entry.client) {
      promises.push(entry.client.close().catch(() => {}));
    }
    if (entry.transport) {
      promises.push(entry.transport.close().catch(() => {}));
    }
    entry.connected = false;
    entry.client = null;
    entry.transport = null;
  }

  await Promise.allSettled(promises);
  servers.clear();
  log('All MCP servers shut down');
}

// ================================================================
// IPC 消息处理
// ================================================================

function log(msg: string): void {
  // 通过 IPC 发送日志到主进程（stderr 保留给错误）
  process.stdout.write(`[MCP-Bridge] ${msg}\n`);
}

process.on('message', async (msg: BridgeRequest) => {
  const response: BridgeResponse = { id: msg.id };

  try {
    switch (msg.method) {
      case 'init':
        response.result = await handleInit(msg.params ?? {});
        break;
      case 'listTools':
        response.result = await handleListTools(msg.params ?? {});
        break;
      case 'callTool':
        response.result = await handleCallTool(msg.params ?? {});
        break;
      case 'shutdown':
        await handleShutdown();
        response.result = { ok: true };
        break;
      default:
        throw new Error(`Unknown method: ${msg.method}`);
    }
  } catch (err) {
    response.error = err instanceof Error ? err.message : String(err);
  }

  process.send!(response);
});

// 优雅退出：父进程断开时自行退出
process.on('disconnect', () => {
  log('Parent disconnected, exiting');
  handleShutdown().finally(() => process.exit(0));
});

// 未捕获异常不要崩溃，发日志后继续
process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.message}`);
});

log(`Bridge process started, env keys: ${Object.keys(process.env).length}, PATH: ${(process.env.PATH || process.env.Path || '').slice(0, 80)}`);
log('Waiting for commands...');
