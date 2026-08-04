# MCP 学习记忆服务器 · 接口清单草案（P2 战略项）

> **状态**: 已实施主体（2026-08-03，`client/electron/mcpMemoryServer.ts` + `client/electron/mcp/memoryQueries.ts`）
> **上位文档**: `docs/product/ai-era-survival-positioning.md`（内层防御：成为用户个人 AI 的学习记忆基座）
> **约束来源**: `docs/product/entropy-visualization-constitution.md` 第二条焦虑防线（本草案所有输出字段必须通过该防线）

---

## 一、背景与现状

- **现状**：`client/electron/mcpBridge.ts` + `mcpManager.ts` 已实现 **MCP 客户端**方向——fork 子进程加载 ESM MCP SDK，通过 StdioClientTransport 连接外部 MCP server 为 AI 功能供能。
- **本提案**：反方向——熵减自身作为 **MCP Server**，把本地学习记忆暴露给用户自己的 AI 代理（Claude Desktop、各类个人 Agent 等）。
- **战略意义**：Agent 时代软件分两种——能被用户的个人 AI 读取的，和被绕过的。本地学习数据一旦成为用户所有 AI 的输入源，熵减就从"一个应用"变成"记忆基座"，不可替换。

## 二、架构复用

| 既有资产 | 复用方式 |
|---------|---------|
| fork 子进程 Bridge 模式 | 反向复用：新增 server 模式子进程（MCP Server SDK 同为 ESM，CJS 主进程问题同构） |
| JSON over IPC 协议 | server 进程与主进程间沿用请求-响应管线读取 SQLite |
| `mcpEnv.ts` 配置体系 | 新增 `server.enabled` 开关（默认关闭） |

新增工作量集中在：server 进程内的 tool 定义层 + 数据聚合层（只读 SQL 视图），无新基建。

## 三、工具清单（只读先行，共 8 个）

命名空间 `learning_memory.*`，全部只读，全部返回 JSON 摘要（不返回原始行级数据）。

| 工具 | 输入 | 输出 | 数据源 |
|------|------|------|--------|
| `learning_memory.profile` | — | 学习画像摘要：累计深潜时长、模块偏好、活跃时段 | `LearningProfile` / profileEngine |
| `learning_memory.mastery` | `topic?` | 各概念掌握度（牢固/成长中/朦胧三档） | flashcard_reviews + feynman 评估 |
| `learning_memory.review_candidates` | `limit?` | 待唤醒知识列表——**只给朦胧度档位，不给倒计时天数**（宪法第二条） | 间隔重复状态 |
| `learning_memory.focus_stats` | `range?` | 专注历史统计：总时长/均长/最佳时段/中断模式 | pomodoro_sessions |
| `learning_memory.streak` | — | 连击状态（含本周已用洋流休息日） | streakEngine |
| `learning_memory.discoveries` | — | 深海发现图鉴（已解锁物种与解锁语境） | discoveryEngine |
| `learning_memory.recent_sessions` | `limit?` | 最近学习会话摘要（模块/时长/结果） | 各模块会话表 |
| `learning_memory.world_state` | — | 世界状态快照：珊瑚高度/星点亮度/混沌浓度——供 Agent 用用户的语言对话 | retention 各 store |

## 四、Resources（可选，二期）

以 MCP Resource 形式暴露只读摘要端点（如 `keban://profile/summary`），供支持 resource 的宿主直接订阅；一期仅做 tools。

## 五、安全与原则（硬约束）

1. **默认关闭**：设置中显式开启 + 首次开启时展示"你的哪些记忆将被读取"清单。
2. **本地 stdio only**：不监听任何网络端口，不经过云端——与记忆主权叙事一致。
3. **只读先行**：一期不开放任何写入工具；写入（如"代理建议生成复习计划"）需二期单独安全裁决。
4. **焦虑防线传导**：所有输出禁止包含倒计时、赤字、与他人比较字段（宪法第二条 §2/§3/§4）。
5. **调用留痕**：每次外部代理调用记录日志并在设置页可见——"谁读过你的记忆"必须透明。
6. **粒度上限**：单次响应 ≤ 100 条摘要级记录，防止整库被批量抽取。

## 六、验收标准

1. Claude Desktop / 任一标准 MCP 宿主可通过 stdio 配置连接并成功调用全部 8 个工具。
2. 关闭开关后 server 进程不启动，零暴露面。
3. 输出字段全量过宪法第二条焦虑审计。
4. 断网环境下全部工具可用（本地优先承诺）。

## 七、依赖与排期

- **实施现状**（P2 已完成）：服务器入口与 8 个只读工具已落地；授权提供双通道：userData 下 `memory-server-consent` 标记文件 + 应用内设置页开关（数据与存储→学习记忆接口）；`discoveries`/`world_state` 精确态经世界快照跨进程桥（useWorldSnapshotSync → world_snapshots 表）接入，无快照时回退派生值并标注 provenance。
- **关联短板**：前序战略文档「短板3：本地向量检索缺位」若先落地，可追加 `learning_memory.semantic_search` 工具，本草案预留扩展位。

## 八、宿主接入方式（用户侧配置）

因 better-sqlite3 为 Electron ABI 原生模块，外部宿主需以 `ELECTRON_RUN_AS_NODE` 方式启动：

```json
{
  "mcpServers": {
    "keban-learning-memory": {
      "command": "<熵减安装目录>/entropy-decrease.exe",
      "args": ["<安装目录>/resources/app/dist-electron/electron/mcpMemoryServer.js"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

首次使用前需授权（二选一）：应用内「设置→数据与存储→学习记忆接口」开启，或手动创建标记文件
`%APPDATA%/Entropy decrease/memory-server-consent`（Windows，目录名 = Electron `productName`；
服务器按 `productName` → `name` 顺序推导候选 userData 目录，取首个真实存在者）。服务器无授权即拒绝启动并提示。
