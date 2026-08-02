# AI 深海学伴助手 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现全局浮动水母 AI 学伴助手 MVP——自由对话 + 流式输出 + 主动触发 + TTS 语音 + SQLite 持久化。

**Architecture:** 渲染进程 React 组件（水母动画 + 对话面板 + 主动引擎 + 音频控制）通过 IPC 与主进程 chatHandler 通信，chatHandler 流式代理到 ai-gateway 新增 `/api/v1/ai/chat/stream` SSE 端点；对话历史持久化到本地 SQLite。

**Tech Stack:** React 18, TypeScript, Zustand, Framer Motion, better-sqlite3, Electron IPC, FastAPI (Python), SSE

**Spec:** `docs/Foresight/ai-assistant-companion-design.md`

---

## 文件结构总览

| 操作 | 路径 | 职责 |
|------|------|------|
| Create | `client/src/features/assistant/types.ts` | 全部类型定义 |
| Create | `client/src/features/assistant/constants.ts` | 常量（冷却/频率/尺寸） |
| Create | `client/src/features/assistant/lib/eventBus.ts` | 轻量应用事件总线 |
| Create | `client/src/features/assistant/lib/messageTemplates.ts` | 预设模板库 |
| Create | `client/src/features/assistant/lib/proactiveRules.ts` | 触发规则定义表 |
| Create | `client/src/features/assistant/lib/ttsController.ts` | TTS 队列管理 |
| Create | `client/src/features/assistant/store/useAssistantStore.ts` | Zustand 全局状态 |
| Create | `client/src/features/assistant/hooks/useChat.ts` | 对话核心 hook |
| Create | `client/src/features/assistant/hooks/useProactiveEngine.ts` | 主动触发引擎 hook |
| Create | `client/src/features/assistant/hooks/useAssistantAudio.ts` | 音频控制 hook |
| Create | `client/src/features/assistant/components/CreatureAvatar.tsx` | 水母动画组件 |
| Create | `client/src/features/assistant/components/CreatureBubble.tsx` | 气泡消息浮层 |
| Create | `client/src/features/assistant/components/ConversationPanel.tsx` | 对话面板主容器 |
| Create | `client/src/features/assistant/components/MessageList.tsx` | 消息列表 |
| Create | `client/src/features/assistant/components/MessageBubble.tsx` | 单条消息气泡 |
| Create | `client/src/features/assistant/components/ChatInput.tsx` | 输入框 |
| Create | `client/src/features/assistant/components/StreamingCursor.tsx` | 流式光标 |
| Create | `client/src/features/assistant/AssistantRoot.tsx` | 模块入口（挂载点） |
| Create | `client/electron/ai/handlers/chatHandler.ts` | 对话 IPC handler |
| Create | `client/electron/db/chatRepository.ts` | 会话 & 消息 SQLite CRUD |
| Create | `server/ai-gateway/routers/chat.py` | 对话流式端点 |
| Modify | `client/electron/db/schema.ts` | 新增 3 张表 DDL |
| Modify | `client/electron/ai/index.ts` | 注册 chatHandler |
| Modify | `client/electron/ipc/channels.ts` | 新增 IPC 通道常量 |
| Modify | `client/electron/preload.ts` | 白名单新增通道 |
| Modify | `server/ai-gateway/routers/__init__.py` | 注册 chat_router |
| Modify | `server/ai-gateway/routers/streaming.py` | 注册 chat 到流式功能表 |
| Modify | `client/src/App.tsx` | 挂载 AssistantRoot |

---

## Task 1: 类型定义与常量

**Files:**
- Create: `client/src/features/assistant/types.ts`
- Create: `client/src/features/assistant/constants.ts`

- [ ] **Step 1: 创建 types.ts**

```typescript
/**
 * AI 深海学伴助手 — 类型定义
 *
 * @ai-context: 助手模块全部共享类型——消息、会话、触发规则、音频偏好；
 * 前后端字段映射：前端 camelCase ↔ 网关 snake_case 在 chatHandler 中转换。
 */

// ── 消息 ──────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageContentType = 'text' | 'action_card' | 'suggestion';

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  contentType: MessageContentType;
  /** 主动触发来源标记 */
  trigger?: ProactiveTriggerType;
  tokensUsed?: number;
  model?: string;
  latencyMs?: number;
  createdAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
  metadata?: string;
}

// ── 主动触发 ──────────────────────────────────────────────────

export type ProactiveTriggerType =
  | 'greeting-startup'
  | 'greeting-return'
  | 'session-summary'
  | 'idle-nudge'
  | 'review-reminder';

export type AppEventType =
  | 'app:startup'
  | 'session:end'
  | 'user:idle'
  | 'user:return'
  | 'review:due'
  | 'achievement:unlocked';

export type MessageStrategy =
  | { type: 'template'; templates: string[] }
  | { type: 'ai_generate'; prompt: string };

export interface ProactiveRule {
  id: ProactiveTriggerType;
  event: AppEventType;
  condition?: (ctx: TriggerContext) => boolean;
  cooldown: number;
  priority: number;
  message: MessageStrategy;
}

export interface TriggerContext {
  /** 距上次打开的天数 */
  daysSinceLastVisit?: number;
  /** 本次学习时长（分钟） */
  sessionMinutes?: number;
  /** 到期闪卡数 */
  dueCardCount?: number;
  /** 当前小时 */
  currentHour: number;
}

// ── 音频 ──────────────────────────────────────────────────────

export interface AudioPreferences {
  enabled: boolean;
  soundEffects: boolean;
  ttsEnabled: boolean;
  volume: number;
}

// ── 助手偏好（设置页持久化） ──────────────────────────────────

export interface AssistantPreferences {
  enabled: boolean;
  audio: AudioPreferences;
  proactiveEnabled: boolean;
  quietHoursStart: number; // 0-23
  quietHoursEnd: number;   // 0-23
}

// ── 水母状态 ──────────────────────────────────────────────────

export type CreatureState = 'idle' | 'alerting' | 'speaking' | 'listening' | 'resting';

// ── 面板状态 ──────────────────────────────────────────────────

export type PanelState = 'hidden' | 'bubble' | 'expanded';
```

- [ ] **Step 2: 创建 constants.ts**

```typescript
/**
 * AI 深海学伴助手 — 常量
 *
 * @ai-context: 助手模块全局常量——冷却时间、频率上限、布局尺寸、默认偏好。
 */
import type { AssistantPreferences } from './types';

// ── 主动触发 ──────────────────────────────────────────────────

/** 每小时最大主动触发次数 */
export const MAX_TRIGGERS_PER_HOUR = 2;
/** 连续忽略多少次后当日不再触发 */
export const MAX_CONSECUTIVE_IGNORES = 3;
/** 空闲检测阈值（ms） */
export const IDLE_THRESHOLD_MS = 3 * 60 * 1000;
/** 久别回归阈值（ms）：超过 24h 未打开 */
export const RETURN_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// ── 会话 ──────────────────────────────────────────────────────

/** 会话过期时间（ms）：超过此时间自动新建 */
export const SESSION_EXPIRE_MS = 24 * 60 * 60 * 1000;
/** 面板打开时加载的消息数 */
export const HISTORY_PAGE_SIZE = 50;
/** 发送给网关的上下文窗口（轮数） */
export const CONTEXT_WINDOW_ROUNDS = 20;

// ── 布局 ──────────────────────────────────────────────────────

export const CREATURE_SIZE_IDLE = 64;
export const CREATURE_SIZE_PANEL = 48;
export const PANEL_WIDTH = 380;

// ── 默认偏好 ──────────────────────────────────────────────────

export const DEFAULT_PREFERENCES: AssistantPreferences = {
  enabled: true,
  audio: {
    enabled: true,
    soundEffects: true,
    ttsEnabled: false,
    volume: 0.7,
  },
  proactiveEnabled: true,
  quietHoursStart: 22,
  quietHoursEnd: 8,
};

// ── 存储键 ────────────────────────────────────────────────────

export const PREFS_STORAGE_KEY = 'assistant_preferences';

// ── 网关端点 ──────────────────────────────────────────────────

export const CHAT_STREAM_ENDPOINT = '/api/v1/ai/chat/stream';
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd client && npx tsc --noEmit --project tsconfig.app.json 2>&1 | Select-String "features/assistant"`
Expected: 无错误输出

- [ ] **Step 4: Commit**

```bash
git add client/src/features/assistant/types.ts client/src/features/assistant/constants.ts
git commit -m "feat(assistant): add type definitions and constants for AI companion"
```

---

## Task 2: SQLite Schema + chatRepository

**Files:**
- Modify: `client/electron/db/schema.ts`
- Create: `client/electron/db/chatRepository.ts`

- [ ] **Step 1: 在 schema.ts 末尾追加助手表 DDL**

在 `SCHEMA_DDL` 模板字符串的最后一个 `CREATE TABLE` 之后、反引号结束之前追加：

```sql
CREATE TABLE IF NOT EXISTS assistant_sessions (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '新对话',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0, metadata TEXT
);
CREATE TABLE IF NOT EXISTS assistant_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'text',
  trigger_type TEXT, tokens_used INTEGER, model TEXT, latency_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS assistant_triggers (
  id TEXT PRIMARY KEY, rule_id TEXT NOT NULL,
  triggered_at INTEGER NOT NULL, dismissed INTEGER NOT NULL DEFAULT 0,
  responded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_asst_msg_session ON assistant_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_asst_sess_active ON assistant_sessions(is_archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_asst_trig_rule ON assistant_triggers(rule_id, triggered_at);
```

同时将 `SCHEMA_VERSION` 从 `4` 改为 `5`。

- [ ] **Step 2: 创建 chatRepository.ts**

```typescript
/**
 * AI 助手对话持久化 — SQLite CRUD
 *
 * @ai-context: 助手会话/消息/触发记录的数据库访问层；
 * 依赖 sqliteService.getDb() 获取连接，表 DDL 在 schema.ts 中定义。
 */
import { randomUUID } from 'crypto';
import { getDb } from './sqliteService.js';
import { logger } from '../logger.js';

// ── 类型（主进程侧，与渲染进程 types.ts 结构对齐） ──────────

export interface SessionRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  is_archived: number;
  metadata: string | null;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  content_type: string;
  trigger_type: string | null;
  tokens_used: number | null;
  model: string | null;
  latency_ms: number | null;
  created_at: number;
}

// ── 会话 CRUD ─────────────────────────────────────────────────

export function createSession(title = '新对话'): SessionRow {
  const db = getDb();
  const now = Date.now();
  const row: SessionRow = { id: randomUUID(), title, created_at: now, updated_at: now, is_archived: 0, metadata: null };
  db.prepare('INSERT INTO assistant_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(row.id, row.title, row.created_at, row.updated_at);
  logger.info(`[ChatRepo] Session created: ${row.id}`);
  return row;
}

export function getLatestSession(): SessionRow | null {
  const db = getDb();
  return db.prepare('SELECT * FROM assistant_sessions WHERE is_archived = 0 ORDER BY updated_at DESC LIMIT 1').get() as SessionRow | undefined ?? null;
}

export function touchSession(id: string): void {
  const db = getDb();
  db.prepare('UPDATE assistant_sessions SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

export function updateSessionTitle(id: string, title: string): void {
  const db = getDb();
  db.prepare('UPDATE assistant_sessions SET title = ? WHERE id = ?').run(title, id);
}

// ── 消息 CRUD ─────────────────────────────────────────────────

export function insertMessage(msg: Omit<MessageRow, 'id' | 'created_at'> & { id?: string; created_at?: number }): MessageRow {
  const db = getDb();
  const row: MessageRow = { id: msg.id ?? randomUUID(), created_at: msg.created_at ?? Date.now(), ...msg } as MessageRow;
  db.prepare(`INSERT INTO assistant_messages (id, session_id, role, content, content_type, trigger_type, tokens_used, model, latency_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(row.id, row.session_id, row.role, row.content, row.content_type, row.trigger_type, row.tokens_used, row.model, row.latency_ms, row.created_at);
  return row;
}

export function getMessages(sessionId: string, limit = 50, before?: number): MessageRow[] {
  const db = getDb();
  if (before) {
    return db.prepare('SELECT * FROM assistant_messages WHERE session_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?')
      .all(sessionId, before, limit) as MessageRow[];
  }
  return db.prepare('SELECT * FROM assistant_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(sessionId, limit) as MessageRow[];
}

// ── 触发记录 ──────────────────────────────────────────────────

export function insertTrigger(ruleId: string): string {
  const db = getDb();
  const id = randomUUID();
  db.prepare('INSERT INTO assistant_triggers (id, rule_id, triggered_at) VALUES (?, ?, ?)').run(id, ruleId, Date.now());
  return id;
}

export function getLastTriggerTime(ruleId: string): number | null {
  const db = getDb();
  const row = db.prepare('SELECT triggered_at FROM assistant_triggers WHERE rule_id = ? ORDER BY triggered_at DESC LIMIT 1').get(ruleId) as { triggered_at: number } | undefined;
  return row?.triggered_at ?? null;
}

export function getRecentTriggerCount(sinceMs: number): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as cnt FROM assistant_triggers WHERE triggered_at > ?').get(Date.now() - sinceMs) as { cnt: number };
  return row.cnt;
}

export function getConsecutiveIgnores(): number {
  const db = getDb();
  const rows = db.prepare('SELECT dismissed, responded FROM assistant_triggers ORDER BY triggered_at DESC LIMIT ?').all(10) as Array<{ dismissed: number; responded: number }>;
  let count = 0;
  for (const r of rows) {
    if (r.dismissed && !r.responded) count++;
    else break;
  }
  return count;
}

export function markTriggerResponded(id: string): void {
  const db = getDb();
  db.prepare('UPDATE assistant_triggers SET responded = 1 WHERE id = ?').run(id);
}

export function markTriggerDismissed(id: string): void {
  const db = getDb();
  db.prepare('UPDATE assistant_triggers SET dismissed = 1 WHERE id = ?').run(id);
}
```

- [ ] **Step 3: 验证编译**

Run: `cd client && npx tsc --noEmit --project electron/tsconfig.json 2>&1 | Select-String "chatRepository|schema"`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add client/electron/db/schema.ts client/electron/db/chatRepository.ts
git commit -m "feat(assistant): add SQLite schema and chat repository for assistant"
```

---

## Task 3: ai-gateway 对话流式端点

**Files:**
- Create: `server/ai-gateway/routers/chat.py`
- Modify: `server/ai-gateway/routers/__init__.py`
- Modify: `server/ai-gateway/routers/streaming.py`

- [ ] **Step 1: 创建 chat.py 路由**

```python
"""
熵减 AI 网关 — 学伴对话路由（SSE 流式）

POST /api/v1/ai/chat/stream
接收用户消息 + 历史 + 场景上下文，流式返回 AI 回复。

@ai-context: 学伴对话端点——独立于通用 streaming.py 的专用路由，
注入动态性格 system prompt + scene 语气微调；历史窗口由客户端裁剪后传入。
"""

import asyncio
import json
import logging
import time
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from config import call_with_fallback_stream

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["学伴对话"])

# ============================================================
# 超时保护
# ============================================================
_FIRST_TOKEN_TIMEOUT = 30.0
_CHUNK_IDLE_TIMEOUT = 30.0

# ============================================================
# System Prompt
# ============================================================

_BASE_SYSTEM_PROMPT = """你是「深潜伙伴」，熵减学习应用中的 AI 学伴。
性格：动态适应——学习时专业严谨、休息时轻松幽默、低谷时温暖鼓励。
原则：
- 奖赏回来，不惩罚离开：永远正向鼓励，不批评用户中断
- 觉察 > 管控：提供建议而非指令，尊重用户自主权
- 简洁有力：回复控制在 3-5 句，除非用户要求展开
- 费曼精神：引导用户自己思考，而非直接给答案"""

_SCENE_TONE: dict[str, str] = {
    "study": "\n当前场景：用户正在专注学习，语气专业、简洁、聚焦。",
    "break": "\n当前场景：用户正在休息，语气轻松、幽默、关怀。",
    "idle": "\n当前场景：用户似乎有些迷茫或无聊，语气温和、启发、不施压。",
    "review": "\n当前场景：用户正在复习，语气鼓励、肯定进步、提醒薄弱点。",
}


# ============================================================
# 请求体
# ============================================================

class ChatHistoryItem(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str

class SystemContext(BaseModel):
    personality: str = "dynamic_adaptive"
    scene: str = "study"
    user_profile_summary: Optional[str] = None

class ChatStreamRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    history: list[ChatHistoryItem] = Field(default_factory=list, max_length=40)
    system_context: SystemContext = Field(default_factory=SystemContext)


# ============================================================
# SSE 格式化
# ============================================================

def _sse_chunk(text: str) -> str:
    return f"data: {json.dumps({'chunk': text}, ensure_ascii=False)}\n\n"

def _sse_error(message: str) -> str:
    return f"data: {json.dumps({'error': message}, ensure_ascii=False)}\n\n"

def _sse_done() -> str:
    return "data: [DONE]\n\n"


# ============================================================
# 端点
# ============================================================

@router.post("/chat/stream")
async def chat_stream(body: ChatStreamRequest, request: Request):
    """学伴对话流式端点"""
    start = time.time()

    # 构建 system prompt
    system_prompt = _BASE_SYSTEM_PROMPT
    system_prompt += _SCENE_TONE.get(body.system_context.scene, "")
    if body.system_context.user_profile_summary:
        system_prompt += f"\n用户学习画像：{body.system_context.user_profile_summary}"

    # 构建 messages 列表
    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    for item in body.history:
        messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": body.message})

    # 拼接为单 prompt（适配现有 call_with_fallback_stream 接口）
    prompt = body.message
    if body.history:
        history_text = "\n".join(
            f"{'用户' if h.role == 'user' else '助手'}：{h.content}" for h in body.history[-20:]
        )
        prompt = f"以下是之前的对话：\n{history_text}\n\n用户最新消息：{body.message}"

    logger.info("[chat] Stream start: msg_len=%d, history=%d, scene=%s",
                len(body.message), len(body.history), body.system_context.scene)

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            stream = call_with_fallback_stream(
                feature_key="chat",
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=0.7,
                max_tokens=1024,
            )
            gen = stream.__aiter__()
            # 首 token 超时
            try:
                first = await asyncio.wait_for(gen.__anext__(), timeout=_FIRST_TOKEN_TIMEOUT)
                yield _sse_chunk(first)
            except StopAsyncIteration:
                yield _sse_done()
                return
            except asyncio.TimeoutError:
                yield _sse_error("首 token 超时，请稍后重试")
                return

            # 后续 chunk
            while True:
                if await request.is_disconnected():
                    break
                try:
                    chunk = await asyncio.wait_for(gen.__anext__(), timeout=_CHUNK_IDLE_TIMEOUT)
                    yield _sse_chunk(chunk)
                except StopAsyncIteration:
                    break
                except asyncio.TimeoutError:
                    yield _sse_error("响应中断（空闲超时）")
                    return

            yield _sse_done()
            elapsed = time.time() - start
            logger.info("[chat] Stream complete: %.1fs", elapsed)

        except Exception as e:
            logger.error("[chat] Stream error: %s", e, exc_info=True)
            yield _sse_error(str(e))

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

- [ ] **Step 2: 注册路由到 __init__.py**

在 `server/ai-gateway/routers/__init__.py` 中追加：

```python
from routers.chat import router as chat_router
```

并在 `__all__` 列表末尾追加 `"chat_router"`。

- [ ] **Step 3: 在 streaming.py 功能注册表中追加 chat**

在 `_FEATURE_PROMPT_REGISTRY` 字典末尾追加：

```python
    "chat": {
        "template": "",
        "system": "",
        "temperature": 0.7,
        "max_tokens": 1024,
    },
```

在 `_FEATURE_TO_CONFIG_KEY` 字典末尾追加：

```python
    "chat": "chat",
```

- [ ] **Step 4: 在 config fallback 中注册 chat feature key**

检查 `server/ai-gateway/config/fallback.py` 中的 fallback 链配置，确保 `"chat"` key 存在（复用默认链即可）。若 fallback 配置为 dict 且缺少 key 会走 default 链，则无需修改。

- [ ] **Step 5: 验证**

Run: `cd server/ai-gateway && python -c "from routers.chat import router; print('OK')"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add server/ai-gateway/routers/chat.py server/ai-gateway/routers/__init__.py server/ai-gateway/routers/streaming.py
git commit -m "feat(ai-gateway): add chat stream endpoint for AI companion"
```

---

## Task 4: Electron chatHandler + IPC 注册

**Files:**
- Create: `client/electron/ai/handlers/chatHandler.ts`
- Modify: `client/electron/ai/index.ts`
- Modify: `client/electron/ipc/channels.ts`
- Modify: `client/electron/preload.ts`

- [ ] **Step 1: 创建 chatHandler.ts**

```typescript
/**
 * AI 学伴对话 Handler
 *
 * 处理 ai:chat:* IPC 请求：发送消息（流式）、历史加载、会话管理。
 * 流式输出复用 streamHandler 的 ai:stream:* 事件体系。
 *
 * @ai-context: 学伴对话 IPC handler——非 AIFeatureDef 模式（多通道），
 * 直接 safeHandle 注册；流式走 postJsonStream + sender.send 回推。
 */
import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { gatewayUrl } from '../utils.js';
import { postJsonStream } from '../gatewayStream.js';
import * as chatRepo from '../../db/chatRepository.js';

/** 50ms 节流缓冲（与 streamHandler 一致） */
const CHUNK_THROTTLE_MS = 50;

export function registerChatHandlers(): void {
  // ── 发送消息（流式） ──────────────────────────────────────
  safeHandle(
    'ai:chat:send',
    async (event, args: {
      requestId: string;
      sessionId: string;
      message: string;
      history: Array<{ role: string; content: string }>;
      scene: string;
      authToken?: string;
      userApiKey?: string;
    }) => {
      const { requestId, sessionId, message, history, scene, authToken, userApiKey } = args;
      const sender = event.sender;
      const startMs = Date.now();

      logger.info(`[AI] [chat] Send: reqId=${requestId}, session=${sessionId}, msg_len=${message.length}`);

      // 持久化用户消息
      chatRepo.insertMessage({ session_id: sessionId, role: 'user', content: message, content_type: 'text', trigger_type: null, tokens_used: null, model: null, latency_ms: null });
      chatRepo.touchSession(sessionId);

      const payload = {
        message,
        history: history.slice(-40),
        system_context: { personality: 'dynamic_adaptive', scene },
      };

      let fullResponse = '';
      let chunkBuffer = '';
      let throttleTimer: ReturnType<typeof setTimeout> | null = null;

      function flush(): void {
        if (!chunkBuffer || sender.isDestroyed()) return;
        sender.send('ai:stream:chunk', { requestId, chunk: chunkBuffer });
        chunkBuffer = '';
        throttleTimer = null;
      }

      try {
        const stream = postJsonStream('/api/v1/ai/chat/stream', payload, authToken, userApiKey);
        for await (const chunk of stream) {
          fullResponse += chunk;
          chunkBuffer += chunk;
          if (!throttleTimer) throttleTimer = setTimeout(flush, CHUNK_THROTTLE_MS);
        }
        if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
        flush();

        // 持久化助手回复
        const latencyMs = Date.now() - startMs;
        chatRepo.insertMessage({ session_id: sessionId, role: 'assistant', content: fullResponse, content_type: 'text', trigger_type: null, tokens_used: null, model: null, latency_ms: latencyMs });
        chatRepo.touchSession(sessionId);

        if (!sender.isDestroyed()) sender.send('ai:stream:end', { requestId });
        logger.info(`[AI] [chat] Complete: ${latencyMs}ms, resp_len=${fullResponse.length}`);
        return { ok: true, requestId };
      } catch (err) {
        if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
        flush();
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`[AI] [chat] Error: ${errorMsg}`);
        if (!sender.isDestroyed()) sender.send('ai:stream:error', { requestId, error: errorMsg });
        return { ok: false, requestId, error: errorMsg };
      }
    },
  );

  // ── 加载历史 ──────────────────────────────────────────────
  safeHandle('ai:chat:history', async (_event, args: { sessionId: string; limit?: number; before?: number }) => {
    const rows = chatRepo.getMessages(args.sessionId, args.limit ?? 50, args.before);
    return rows.reverse(); // 按时间正序返回
  });

  // ── 获取/创建会话 ─────────────────────────────────────────
  safeHandle('ai:chat:sessions', async () => {
    const session = chatRepo.getLatestSession();
    return session ? [session] : [];
  });

  safeHandle('ai:chat:new-session', async (_event, args?: { title?: string }) => {
    return chatRepo.createSession(args?.title);
  });
}
```

- [ ] **Step 2: 在 ai/index.ts 中注册**

在 `registerAIHandlers()` 函数体末尾（`registerStreamHandler()` 之后）追加：

```typescript
import { registerChatHandlers } from './handlers/chatHandler.js';
// ...
  // 注册学伴对话 IPC handler
  registerChatHandlers();
```

- [ ] **Step 3: 在 channels.ts 追加通道常量**

在 `IPC_CHANNELS` 对象的 AI 相关区块末尾追加：

```typescript
  AI_CHAT_SEND: 'ai:chat:send',
  AI_CHAT_HISTORY: 'ai:chat:history',
  AI_CHAT_SESSIONS: 'ai:chat:sessions',
  AI_CHAT_NEW_SESSION: 'ai:chat:new-session',
```

- [ ] **Step 4: 在 preload.ts 白名单追加**

在 `ALLOWED_CHANNELS` 数组中 `'ai:set-gateway-url'` 之后追加：

```typescript
  'ai:chat:send',
  'ai:chat:history',
  'ai:chat:sessions',
  'ai:chat:new-session',
```

- [ ] **Step 5: 验证编译**

Run: `cd client && npx tsc --noEmit --project electron/tsconfig.json`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add client/electron/ai/handlers/chatHandler.ts client/electron/ai/index.ts client/electron/ipc/channels.ts client/electron/preload.ts
git commit -m "feat(assistant): add chat IPC handler and register channels"
```

---

## Task 5: Zustand Store + 事件总线

**Files:**
- Create: `client/src/features/assistant/store/useAssistantStore.ts`
- Create: `client/src/features/assistant/lib/eventBus.ts`

- [ ] **Step 1: 创建 eventBus.ts**

```typescript
/**
 * 轻量应用事件总线
 *
 * @ai-context: 助手模块事件驱动核心——发布/订阅模式，无外部依赖；
 * 番茄钟、启动、空闲检测等模块通过 emit 发布事件，ProactiveEngine 订阅。
 */
import type { AppEventType, TriggerContext } from '../types';

type Listener = (ctx: TriggerContext) => void;

const listeners = new Map<AppEventType, Set<Listener>>();

export const assistantEventBus = {
  on(event: AppEventType, fn: Listener): () => void {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(fn);
    return () => { listeners.get(event)?.delete(fn); };
  },

  emit(event: AppEventType, ctx: TriggerContext): void {
    listeners.get(event)?.forEach(fn => {
      try { fn(ctx); } catch (e) { console.error(`[EventBus] Listener error for ${event}:`, e); }
    });
  },

  clear(): void {
    listeners.clear();
  },
};
```

- [ ] **Step 2: 创建 useAssistantStore.ts**

```typescript
/**
 * AI 助手 Zustand 全局状态
 *
 * @ai-context: 助手模块唯一状态源——面板状态、消息列表、水母状态、偏好；
 * persist 到 localStorage（键 assistant_preferences）仅存偏好部分。
 */
import { create } from 'zustand';
import type { ChatMessage, CreatureState, PanelState, AssistantPreferences } from '../types';
import { DEFAULT_PREFERENCES, PREFS_STORAGE_KEY } from '../constants';

function loadPreferences(): AssistantPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch { /* 静默降级 */ }
  return { ...DEFAULT_PREFERENCES };
}

function persistPreferences(prefs: AssistantPreferences): void {
  try { localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

interface AssistantState {
  // ── 面板 & 水母 ──
  panelState: PanelState;
  creatureState: CreatureState;
  bubbleMessage: string | null;
  bubbleTriggerId: string | null;

  // ── 对话 ──
  sessionId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;

  // ── 偏好 ──
  preferences: AssistantPreferences;

  // ── Actions ──
  setPanelState: (s: PanelState) => void;
  setCreatureState: (s: CreatureState) => void;
  showBubble: (msg: string, triggerId: string | null) => void;
  hideBubble: () => void;
  setSessionId: (id: string | null) => void;
  addMessage: (msg: ChatMessage) => void;
  appendToLastMessage: (chunk: string) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setIsStreaming: (v: boolean) => void;
  updatePreferences: (partial: Partial<AssistantPreferences>) => void;
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  panelState: 'hidden',
  creatureState: 'idle',
  bubbleMessage: null,
  bubbleTriggerId: null,
  sessionId: null,
  messages: [],
  isStreaming: false,
  preferences: loadPreferences(),

  setPanelState: (s) => set({ panelState: s }),
  setCreatureState: (s) => set({ creatureState: s }),

  showBubble: (msg, triggerId) => set({ bubbleMessage: msg, bubbleTriggerId: triggerId, panelState: 'bubble', creatureState: 'alerting' }),
  hideBubble: () => set({ bubbleMessage: null, bubbleTriggerId: null, panelState: 'hidden', creatureState: 'idle' }),

  setSessionId: (id) => set({ sessionId: id }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  appendToLastMessage: (chunk) => set((s) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
    }
    return { messages: msgs };
  }),

  setMessages: (msgs) => set({ messages: msgs }),
  setIsStreaming: (v) => set({ isStreaming: v }),

  updatePreferences: (partial) => {
    const next = { ...get().preferences, ...partial };
    persistPreferences(next);
    set({ preferences: next });
  },
}));
```

- [ ] **Step 3: 验证编译**

Run: `cd client && npx tsc --noEmit --project tsconfig.app.json 2>&1 | Select-String "assistant"`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add client/src/features/assistant/store/ client/src/features/assistant/lib/eventBus.ts
git commit -m "feat(assistant): add Zustand store and event bus"
```

---

## Task 6: 主动触发引擎

**Files:**
- Create: `client/src/features/assistant/lib/messageTemplates.ts`
- Create: `client/src/features/assistant/lib/proactiveRules.ts`
- Create: `client/src/features/assistant/hooks/useProactiveEngine.ts`

- [ ] **Step 1: 创建 messageTemplates.ts**

```typescript
/**
 * 主动触发预设模板库
 *
 * @ai-context: 模板消息——离线可用、零延迟；随机选取实现"可变 > 固定"原则。
 */
import type { ProactiveTriggerType } from '../types';

export const MESSAGE_TEMPLATES: Record<ProactiveTriggerType, string[]> = {
  'greeting-startup': [
    '欢迎回来，准备好今天的深潜了吗？🌊',
    '又见面了！今天想探索什么新知识？',
    '嗨，你的学习空间已经准备好了。',
  ],
  'greeting-return': [
    '好久不见！回来就好，我们慢慢来。',
    '欢迎回到深海，这里一直为你留着光。',
  ],
  'session-summary': [
    '这轮专注结束了，做得不错！休息一下吧。',
    '又完成一段深潜，你的坚持很有力量。',
  ],
  'idle-nudge': [
    '需要休息一下，还是换个方式继续？',
    '有时候换个角度，答案就浮出水面了。',
    '深呼吸，你已经在做很棒的事了。',
  ],
  'review-reminder': [
    '有几张闪卡到了复习时间，趁记忆还热乎？',
    '间隔重复的最佳时机到了，花几分钟巩固一下？',
  ],
};

export function pickTemplate(trigger: ProactiveTriggerType): string {
  const list = MESSAGE_TEMPLATES[trigger];
  return list[Math.floor(Math.random() * list.length)];
}
```

- [ ] **Step 2: 创建 proactiveRules.ts**

```typescript
/**
 * 主动触发规则定义表
 *
 * @ai-context: MVP 5 条规则——冷却/优先级/策略声明式定义；
 * ProactiveEngine 按此表匹配事件并决定是否触发。
 */
import type { ProactiveRule } from '../types';
import { MESSAGE_TEMPLATES } from './messageTemplates';

export const PROACTIVE_RULES: ProactiveRule[] = [
  {
    id: 'greeting-startup',
    event: 'app:startup',
    cooldown: 4 * 60 * 60 * 1000,
    priority: 10,
    message: { type: 'template', templates: MESSAGE_TEMPLATES['greeting-startup'] },
  },
  {
    id: 'greeting-return',
    event: 'user:return',
    cooldown: 24 * 60 * 60 * 1000,
    priority: 20,
    message: { type: 'ai_generate', prompt: '用户多日未打开应用后回归，生成一句温暖的欢迎语，提及"回来就好"的正向态度，不超过两句话。' },
  },
  {
    id: 'session-summary',
    event: 'session:end',
    cooldown: 30 * 60 * 1000,
    priority: 15,
    message: { type: 'ai_generate', prompt: '用户刚结束一轮学习会话，生成一句简短的肯定和鼓励，不超过两句话。' },
  },
  {
    id: 'idle-nudge',
    event: 'user:idle',
    cooldown: 20 * 60 * 1000,
    priority: 5,
    message: { type: 'template', templates: MESSAGE_TEMPLATES['idle-nudge'] },
  },
  {
    id: 'review-reminder',
    event: 'review:due',
    cooldown: 2 * 60 * 60 * 1000,
    priority: 12,
    message: { type: 'template', templates: MESSAGE_TEMPLATES['review-reminder'] },
  },
];
```

- [ ] **Step 3: 创建 useProactiveEngine.ts**

```typescript
/**
 * 主动触发引擎 Hook
 *
 * @ai-context: 订阅事件总线，按规则表匹配 → 冷却检查 → 频率限制 → 生成消息 → 触发呈现。
 * 在 AssistantRoot 中挂载一次即可。
 */
import { useEffect, useRef } from 'react';
import { assistantEventBus } from '../lib/eventBus';
import { PROACTIVE_RULES } from '../lib/proactiveRules';
import { pickTemplate } from '../lib/messageTemplates';
import { useAssistantStore } from '../store/useAssistantStore';
import { MAX_TRIGGERS_PER_HOUR, MAX_CONSECUTIVE_IGNORES } from '../constants';
import type { AppEventType, TriggerContext, ProactiveRule } from '../types';

/** 内存态冷却追踪（避免频繁读库） */
const lastTriggeredMap = new Map<string, number>();
let hourlyCount = 0;
let hourlyResetAt = Date.now() + 60 * 60 * 1000;
let consecutiveIgnores = 0;

export function useProactiveEngine(): void {
  const { preferences, showBubble } = useAssistantStore();
  const prefsRef = useRef(preferences);
  prefsRef.current = preferences;

  useEffect(() => {
    const unsubscribes: Array<() => void> = [];

    for (const rule of PROACTIVE_RULES) {
      const unsub = assistantEventBus.on(rule.event, (ctx: TriggerContext) => {
        handleTrigger(rule, ctx);
      });
      unsubscribes.push(unsub);
    }

    return () => { unsubscribes.forEach(u => u()); };
  }, []);

  function handleTrigger(rule: ProactiveRule, ctx: TriggerContext): void {
    const prefs = prefsRef.current;
    // 总开关
    if (!prefs.enabled || !prefs.proactiveEnabled) return;
    // 勿扰时段
    const hour = ctx.currentHour;
    const { quietHoursStart, quietHoursEnd } = prefs;
    if (quietHoursStart > quietHoursEnd) {
      if (hour >= quietHoursStart || hour < quietHoursEnd) return;
    } else {
      if (hour >= quietHoursStart && hour < quietHoursEnd) return;
    }
    // 频率限制
    if (Date.now() > hourlyResetAt) { hourlyCount = 0; hourlyResetAt = Date.now() + 60 * 60 * 1000; }
    if (hourlyCount >= MAX_TRIGGERS_PER_HOUR) return;
    // 连续忽略退让
    if (consecutiveIgnores >= MAX_CONSECUTIVE_IGNORES) return;
    // 冷却
    const lastTime = lastTriggeredMap.get(rule.id) ?? 0;
    if (Date.now() - lastTime < rule.cooldown) return;
    // 条件
    if (rule.condition && !rule.condition(ctx)) return;

    // 通过所有检查 → 触发
    lastTriggeredMap.set(rule.id, Date.now());
    hourlyCount++;

    const message = rule.message.type === 'template'
      ? pickTemplate(rule.id)
      : pickTemplate(rule.id); // MVP: ai_generate 降级为 template，后续接入网关

    showBubble(message, rule.id);
  }
}

/** 外部调用：标记用户忽略了气泡 */
export function reportBubbleDismissed(): void {
  consecutiveIgnores++;
}

/** 外部调用：标记用户回应了气泡 */
export function reportBubbleResponded(): void {
  consecutiveIgnores = 0;
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/features/assistant/lib/messageTemplates.ts client/src/features/assistant/lib/proactiveRules.ts client/src/features/assistant/hooks/useProactiveEngine.ts
git commit -m "feat(assistant): add proactive trigger engine with rules and templates"
```

---

## Task 7: TTS 控制器 + 音频 Hook

**Files:**
- Create: `client/src/features/assistant/lib/ttsController.ts`
- Create: `client/src/features/assistant/hooks/useAssistantAudio.ts`

- [ ] **Step 1: 创建 ttsController.ts**

```typescript
/**
 * TTS 队列管理器
 *
 * @ai-context: Web Speech API 封装——FIFO 队列、同时只播一条、
 * 播放状态回调驱动水母 speaking 态；失败静默降级。
 */

type SpeakCallback = (speaking: boolean) => void;

class TTSController {
  private queue: string[] = [];
  private speaking = false;
  private onStateChange: SpeakCallback | null = null;
  private volume = 0.7;

  setVolume(v: number): void { this.volume = Math.max(0, Math.min(1, v)); }
  setOnStateChange(cb: SpeakCallback | null): void { this.onStateChange = cb; }

  speak(text: string): void {
    if (!('speechSynthesis' in window)) return;
    // 去除 Markdown 标记
    const clean = text.replace(/[#*_`>\[\]()]/g, '').trim();
    if (!clean) return;
    this.queue.push(clean);
    if (!this.speaking) this.processNext();
  }

  stop(): void {
    this.queue = [];
    if (this.speaking) {
      window.speechSynthesis.cancel();
      this.speaking = false;
      this.onStateChange?.(false);
    }
  }

  private processNext(): void {
    const text = this.queue.shift();
    if (!text) { this.speaking = false; this.onStateChange?.(false); return; }

    this.speaking = true;
    this.onStateChange?.(true);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.volume = this.volume;
    utterance.rate = 1.0;

    // 尝试选择中文女声
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.startsWith('zh') && v.name.includes('Female'))
      ?? voices.find(v => v.lang.startsWith('zh'));
    if (zhVoice) utterance.voice = zhVoice;

    utterance.onend = () => this.processNext();
    utterance.onerror = () => this.processNext(); // 静默降级

    try { window.speechSynthesis.speak(utterance); }
    catch { this.processNext(); }
  }
}

export const ttsController = new TTSController();
```

- [ ] **Step 2: 创建 useAssistantAudio.ts**

```typescript
/**
 * 助手音频控制 Hook
 *
 * @ai-context: 管理提示音效播放 + TTS 生命周期；
 * 监听 store 偏好变化同步 ttsController 音量。
 */
import { useEffect, useCallback } from 'react';
import { useAssistantStore } from '../store/useAssistantStore';
import { ttsController } from '../lib/ttsController';

const SOUND_PATHS = {
  bubble: '/sounds/assistant-bubble.mp3',
  speakStart: '/sounds/assistant-speak-start.mp3',
  ack: '/sounds/assistant-ack.mp3',
} as const;

export function useAssistantAudio() {
  const { preferences, setCreatureState } = useAssistantStore();

  // 同步音量
  useEffect(() => {
    ttsController.setVolume(preferences.audio.volume);
  }, [preferences.audio.volume]);

  // TTS 状态 → 水母动画
  useEffect(() => {
    ttsController.setOnStateChange((speaking) => {
      setCreatureState(speaking ? 'speaking' : 'idle');
    });
    return () => ttsController.setOnStateChange(null);
  }, [setCreatureState]);

  const playSound = useCallback((name: keyof typeof SOUND_PATHS) => {
    if (!preferences.audio.enabled || !preferences.audio.soundEffects) return;
    const audio = new Audio(SOUND_PATHS[name]);
    audio.volume = preferences.audio.volume;
    audio.play().catch(() => { /* 静默 */ });
  }, [preferences.audio.enabled, preferences.audio.soundEffects, preferences.audio.volume]);

  const speak = useCallback((text: string) => {
    if (!preferences.audio.enabled || !preferences.audio.ttsEnabled) return;
    ttsController.speak(text);
  }, [preferences.audio.enabled, preferences.audio.ttsEnabled]);

  const stopSpeaking = useCallback(() => {
    ttsController.stop();
  }, []);

  return { playSound, speak, stopSpeaking };
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/features/assistant/lib/ttsController.ts client/src/features/assistant/hooks/useAssistantAudio.ts
git commit -m "feat(assistant): add TTS controller and audio hook"
```

---

## Task 8: 水母动画组件

**Files:**
- Create: `client/src/features/assistant/components/CreatureAvatar.tsx`
- Create: `client/src/features/assistant/components/CreatureBubble.tsx`
- Create: `client/src/features/assistant/components/StreamingCursor.tsx`

- [ ] **Step 1: 创建 StreamingCursor.tsx**

```tsx
/**
 * 流式输出光标
 * @ai-context: 赛博青闪烁光标，标示 AI 正在生成。
 */
export function StreamingCursor() {
  return (
    <span className="inline-block w-[2px] h-[1em] bg-cyan-400 ml-0.5 animate-pulse align-text-bottom" />
  );
}
```

- [ ] **Step 2: 创建 CreatureBubble.tsx**

```tsx
/**
 * 水母气泡消息
 * @ai-context: 主动触发时浮现在水母旁的消息气泡；点击展开面板，5s 后自动消散。
 */
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  message: string | null;
  onClick: () => void;
  onDismiss: () => void;
}

export function CreatureBubble({ message, onClick, onDismiss }: Props) {
  // 5s 自动消散
  if (message) {
    setTimeout(onDismiss, 5000);
  }

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          onClick={onClick}
          className="absolute bottom-full right-0 mb-2 max-w-[240px] cursor-pointer
            rounded-2xl rounded-br-sm px-3.5 py-2.5
            bg-slate-800/90 backdrop-blur-md border border-cyan-500/20
            text-sm text-slate-200 shadow-lg shadow-cyan-500/10
            hover:border-cyan-400/40 transition-colors"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: 创建 CreatureAvatar.tsx**

```tsx
/**
 * 深海水母动画组件
 *
 * @ai-context: 助手视觉核心——CSS + Framer Motion 驱动的状态机动画；
 * 仅使用 transform/opacity 确保 GPU 合成层，不触发 layout。
 */
import { motion } from 'framer-motion';
import { useAssistantStore } from '../store/useAssistantStore';
import { CreatureBubble } from './CreatureBubble';
import { CREATURE_SIZE_IDLE } from '../constants';
import type { CreatureState } from '../types';

/** 状态 → 发光颜色 */
const GLOW_MAP: Record<CreatureState, string> = {
  idle: '0 0 12px 2px rgba(34,211,238,0.15)',
  alerting: '0 0 20px 6px rgba(251,191,36,0.4)',
  speaking: '0 0 18px 5px rgba(34,211,238,0.45)',
  listening: '0 0 10px 2px rgba(34,211,238,0.2)',
  resting: '0 0 6px 1px rgba(34,211,238,0.08)',
};

interface Props {
  onClick: () => void;
  onBubbleClick: () => void;
  onBubbleDismiss: () => void;
}

export function CreatureAvatar({ onClick, onBubbleClick, onBubbleDismiss }: Props) {
  const creatureState = useAssistantStore(s => s.creatureState);
  const bubbleMessage = useAssistantStore(s => s.bubbleMessage);

  return (
    <div className="fixed right-6 bottom-6 z-50 flex flex-col items-end">
      {/* 气泡 */}
      <div className="relative">
        <CreatureBubble message={bubbleMessage} onClick={onBubbleClick} onDismiss={onBubbleDismiss} />
      </div>

      {/* 水母主体 */}
      <motion.button
        onClick={onClick}
        className="relative outline-none border-none bg-transparent cursor-pointer"
        style={{ width: CREATURE_SIZE_IDLE, height: CREATURE_SIZE_IDLE }}
        animate={{
          y: creatureState === 'resting' ? [0, 4, 0] : [0, -3, 0],
          scale: creatureState === 'alerting' ? [1, 1.08, 1] : 1,
        }}
        transition={{
          y: { duration: creatureState === 'resting' ? 6 : 4, repeat: Infinity, ease: 'easeInOut' },
          scale: { duration: 0.6, repeat: creatureState === 'alerting' ? 3 : 0 },
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        aria-label="AI 学伴助手"
      >
        {/* 伞体 */}
        <div
          className="absolute inset-x-1 top-0 h-[38px] rounded-t-full transition-all duration-700"
          style={{
            background: 'radial-gradient(ellipse at 50% 30%, rgba(34,211,238,0.25), rgba(15,23,42,0.6))',
            boxShadow: GLOW_MAP[creatureState],
            borderRadius: '50% 50% 40% 40%',
          }}
        />
        {/* 触须 */}
        {[0, 1, 2, 3].map(i => (
          <motion.div
            key={i}
            className="absolute bottom-0 w-[2px] rounded-full bg-cyan-400/30"
            style={{ left: `${20 + i * 16}%`, height: 22, transformOrigin: 'top' }}
            animate={{ rotateZ: [(-3 + i * 2), (3 - i * 2), (-3 + i * 2)] }}
            transition={{ duration: 3 + i * 0.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </motion.button>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/features/assistant/components/CreatureAvatar.tsx client/src/features/assistant/components/CreatureBubble.tsx client/src/features/assistant/components/StreamingCursor.tsx
git commit -m "feat(assistant): add jellyfish creature avatar with state animations"
```

---

## Task 9: 对话面板组件

**Files:**
- Create: `client/src/features/assistant/components/MessageBubble.tsx`
- Create: `client/src/features/assistant/components/MessageList.tsx`
- Create: `client/src/features/assistant/components/ChatInput.tsx`
- Create: `client/src/features/assistant/components/ConversationPanel.tsx`

- [ ] **Step 1: 创建 MessageBubble.tsx**

```tsx
/**
 * 单条消息气泡
 * @ai-context: 区分 user/assistant 样式；assistant 支持 Markdown 渲染（MVP 用 dangerouslySetInnerHTML 简易方案）。
 */
import type { ChatMessage } from '../types';
import { StreamingCursor } from './StreamingCursor';

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words
          ${isUser
            ? 'bg-blue-600/80 text-white rounded-br-sm'
            : 'bg-slate-700/70 backdrop-blur-sm text-slate-200 border border-cyan-500/10 rounded-bl-sm'
          }`}
      >
        {message.content}
        {isStreaming && <StreamingCursor />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 MessageList.tsx**

```tsx
/**
 * 消息列表（自动滚底）
 * @ai-context: 新消息/流式 chunk 时自动滚动到底部。
 */
import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
      {messages.length === 0 && (
        <p className="text-center text-slate-500 text-sm mt-8">
          嗨，我是你的深潜伙伴 🪼<br />有任何学习问题都可以问我
        </p>
      )}
      {messages.map((msg, i) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 3: 创建 ChatInput.tsx**

```tsx
/**
 * 对话输入框
 * @ai-context: Enter 发送、Shift+Enter 换行；TTS 开关按钮；发送中禁用。
 */
import { useState, useRef } from 'react';
import { useAssistantStore } from '../store/useAssistantStore';

interface Props {
  onSend: (text: string) => void;
}

export function ChatInput({ onSend }: Props) {
  const [text, setText] = useState('');
  const isStreaming = useAssistantStore(s => s.isStreaming);
  const ttsEnabled = useAssistantStore(s => s.preferences.audio.ttsEnabled);
  const updatePreferences = useAssistantStore(s => s.updatePreferences);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-slate-700/50 px-3 py-2.5 flex items-end gap-2">
      <textarea
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息..."
        rows={1}
        className="flex-1 resize-none rounded-xl bg-slate-700/50 px-3 py-2 text-sm text-slate-200
          placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-cyan-500/40
          max-h-[100px] overflow-y-auto"
      />
      {/* TTS 开关 */}
      <button
        onClick={() => updatePreferences({ audio: { ...useAssistantStore.getState().preferences.audio, ttsEnabled: !ttsEnabled } })}
        className={`p-2 rounded-lg text-xs transition-colors ${ttsEnabled ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-500 hover:text-slate-300'}`}
        title={ttsEnabled ? '关闭语音朗读' : '开启语音朗读'}
      >
        🔊
      </button>
      {/* 发送 */}
      <button
        onClick={handleSend}
        disabled={isStreaming || !text.trim()}
        className="p-2 rounded-lg bg-cyan-600/80 text-white text-sm disabled:opacity-40
          hover:bg-cyan-500/80 transition-colors"
      >
        ➤
      </button>
    </div>
  );
}
```

- [ ] **Step 4: 创建 ConversationPanel.tsx**

```tsx
/**
 * 对话面板主容器
 * @ai-context: 右侧滑出面板——头部（水母小头像+关闭）、消息列表、输入框。
 */
import { motion } from 'framer-motion';
import { useAssistantStore } from '../store/useAssistantStore';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { PANEL_WIDTH } from '../constants';

interface Props {
  onSend: (text: string) => void;
  onClose: () => void;
}

export function ConversationPanel({ onSend, onClose }: Props) {
  const messages = useAssistantStore(s => s.messages);
  const isStreaming = useAssistantStore(s => s.isStreaming);

  return (
    <motion.div
      initial={{ x: PANEL_WIDTH, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: PANEL_WIDTH, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="fixed right-0 top-0 bottom-0 z-40 flex flex-col"
      style={{ width: PANEL_WIDTH }}
    >
      <div className="flex flex-col h-full bg-slate-900/95 backdrop-blur-xl border-l border-slate-700/40 shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-700/40">
          <span className="text-xl">🪼</span>
          <span className="text-sm font-medium text-slate-200">深潜伙伴</span>
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-300 text-lg">✕</button>
        </div>

        {/* 消息列表 */}
        <MessageList messages={messages} isStreaming={isStreaming} />

        {/* 输入框 */}
        <ChatInput onSend={onSend} />
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add client/src/features/assistant/components/MessageBubble.tsx client/src/features/assistant/components/MessageList.tsx client/src/features/assistant/components/ChatInput.tsx client/src/features/assistant/components/ConversationPanel.tsx
git commit -m "feat(assistant): add conversation panel with message list and input"
```

---

## Task 10: useChat Hook + AssistantRoot 入口 + App 集成

**Files:**
- Create: `client/src/features/assistant/hooks/useChat.ts`
- Create: `client/src/features/assistant/AssistantRoot.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: 创建 useChat.ts**

```typescript
/**
 * 对话核心 Hook
 *
 * @ai-context: 管理会话生命周期、消息发送（流式）、历史加载；
 * 通过 IPC 与主进程 chatHandler 通信，流式走 ai:stream:* 事件。
 */
import { useCallback, useEffect, useRef } from 'react';
import { useAssistantStore } from '../store/useAssistantStore';
import { CHAT_STREAM_ENDPOINT, SESSION_EXPIRE_MS, HISTORY_PAGE_SIZE, CONTEXT_WINDOW_ROUNDS } from '../constants';
import type { ChatMessage } from '../types';

export function useChat() {
  const {
    sessionId, setSessionId, messages, setMessages,
    addMessage, appendToLastMessage, setIsStreaming, isStreaming,
  } = useAssistantStore();

  // 初始化会话
  const initSession = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;

    const sessions = await api.invoke('ai:chat:sessions') as Array<{ id: string; updated_at: number }>;
    const latest = sessions[0];

    if (latest && Date.now() - latest.updated_at < SESSION_EXPIRE_MS) {
      setSessionId(latest.id);
      const rows = await api.invoke('ai:chat:history', { sessionId: latest.id, limit: HISTORY_PAGE_SIZE }) as Array<Record<string, unknown>>;
      const msgs: ChatMessage[] = rows.map(r => ({
        id: r.id as string,
        sessionId: r.session_id as string,
        role: r.role as ChatMessage['role'],
        content: r.content as string,
        contentType: (r.content_type as ChatMessage['contentType']) ?? 'text',
        trigger: (r.trigger_type as ChatMessage['trigger']) ?? undefined,
        createdAt: r.created_at as number,
      }));
      setMessages(msgs);
    } else {
      const newSession = await api.invoke('ai:chat:new-session', {}) as { id: string };
      setSessionId(newSession.id);
      setMessages([]);
    }
  }, [setSessionId, setMessages]);

  useEffect(() => { initSession(); }, [initSession]);

  // 发送消息
  const sendMessage = useCallback(async (text: string) => {
    const api = window.electronAPI;
    if (!api || isStreaming) return;

    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const s = await api.invoke('ai:chat:new-session', {}) as { id: string };
      currentSessionId = s.id;
      setSessionId(currentSessionId);
    }

    // 添加用户消息到 UI
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: currentSessionId,
      role: 'user',
      content: text,
      contentType: 'text',
      createdAt: Date.now(),
    };
    addMessage(userMsg);

    // 添加空助手消息占位
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: currentSessionId,
      role: 'assistant',
      content: '',
      contentType: 'text',
      createdAt: Date.now(),
    };
    addMessage(assistantMsg);
    setIsStreaming(true);

    // 构建历史窗口
    const history = messages.slice(-CONTEXT_WINDOW_ROUNDS * 2).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    try {
      // 通过 ai:chat:send 发送（主进程 chatHandler 内含持久化 + 流式代理）
      // 流式 chunk 通过 ai:stream:chunk/end/error 事件回推
      const requestId = crypto.randomUUID();

      await new Promise<void>((resolve, reject) => {
        const api = window.electronAPI!;
        const onChunk = (_e: unknown, data: { requestId: string; chunk: string }) => {
          if (data.requestId === requestId) appendToLastMessage(data.chunk);
        };
        const onEnd = (_e: unknown, data: { requestId: string }) => {
          if (data.requestId === requestId) { cleanup(); resolve(); }
        };
        const onError = (_e: unknown, data: { requestId: string; error: string }) => {
          if (data.requestId === requestId) { cleanup(); reject(new Error(data.error)); }
        };
        const cleanup = () => {
          (api as any).removeListener?.('ai:stream:chunk', onChunk);
          (api as any).removeListener?.('ai:stream:end', onEnd);
          (api as any).removeListener?.('ai:stream:error', onError);
        };
        (api as any).on?.('ai:stream:chunk', onChunk);
        (api as any).on?.('ai:stream:end', onEnd);
        (api as any).on?.('ai:stream:error', onError);

        api.invoke('ai:chat:send', {
          requestId,
          sessionId: currentSessionId,
          message: text,
          history,
          scene: 'study',
        });
      });
    } catch (err) {
      appendToLastMessage('\n\n（连接中断，请重试）');
    } finally {
      setIsStreaming(false);
    }
  }, [sessionId, messages, isStreaming, addMessage, appendToLastMessage, setIsStreaming, setSessionId]);

  return { sendMessage, initSession };
}
```

- [ ] **Step 2: 创建 AssistantRoot.tsx**

```tsx
/**
 * AI 助手模块入口
 *
 * @ai-context: 在 App.tsx 中挂载一次——编排水母、面板、主动引擎、音频；
 * 偏好 enabled=false 时整体不渲染（零开销）。
 */
import { AnimatePresence } from 'framer-motion';
import { useAssistantStore } from './store/useAssistantStore';
import { useChat } from './hooks/useChat';
import { useProactiveEngine, reportBubbleDismissed, reportBubbleResponded } from './hooks/useProactiveEngine';
import { useAssistantAudio } from './hooks/useAssistantAudio';
import { CreatureAvatar } from './components/CreatureAvatar';
import { ConversationPanel } from './components/ConversationPanel';

export function AssistantRoot() {
  const enabled = useAssistantStore(s => s.preferences.enabled);
  const panelState = useAssistantStore(s => s.panelState);
  const setPanelState = useAssistantStore(s => s.setPanelState);
  const setCreatureState = useAssistantStore(s => s.setCreatureState);

  const { sendMessage } = useChat();
  const { playSound } = useAssistantAudio();
  useProactiveEngine();

  if (!enabled) return null;

  const handleCreatureClick = () => {
    playSound('ack');
    setPanelState('expanded');
    setCreatureState('listening');
  };

  const handleBubbleClick = () => {
    reportBubbleResponded();
    playSound('ack');
    setPanelState('expanded');
    setCreatureState('listening');
  };

  const handleBubbleDismiss = () => {
    reportBubbleDismissed();
    useAssistantStore.getState().hideBubble();
  };

  const handleClosePanel = () => {
    setPanelState('hidden');
    setCreatureState('idle');
  };

  return (
    <>
      <CreatureAvatar
        onClick={handleCreatureClick}
        onBubbleClick={handleBubbleClick}
        onBubbleDismiss={handleBubbleDismiss}
      />
      <AnimatePresence>
        {panelState === 'expanded' && (
          <ConversationPanel onSend={sendMessage} onClose={handleClosePanel} />
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 3: 在 App.tsx 中挂载**

在 `App.tsx` 的根布局组件内（路由出口之后）追加：

```tsx
import { AssistantRoot } from '@/features/assistant/AssistantRoot';
// ...
{/* AI 学伴助手（全局浮动） */}
<AssistantRoot />
```

- [ ] **Step 4: 验证编译**

Run: `cd client && npx tsc --noEmit --project tsconfig.app.json`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add client/src/features/assistant/hooks/useChat.ts client/src/features/assistant/AssistantRoot.tsx client/src/App.tsx
git commit -m "feat(assistant): add useChat hook, AssistantRoot entry, and mount in App"
```

---

## Task 11: 事件集成 + 音效资源

**Files:**
- Modify: 番茄钟 store（emit `session:end`）
- Modify: App.tsx（emit `app:startup` / `user:return`）
- Create: 音效占位文件

- [ ] **Step 1: 在 App.tsx 挂载时 emit 启动事件**

在 `App.tsx` 中追加一个 `useEffect`：

```tsx
import { assistantEventBus } from '@/features/assistant/lib/eventBus';
import { RETURN_THRESHOLD_MS } from '@/features/assistant/constants';

// 在组件体内
useEffect(() => {
  const lastVisit = localStorage.getItem('kb-last-visit');
  const now = Date.now();
  const currentHour = new Date().getHours();

  assistantEventBus.emit('app:startup', { currentHour });

  if (lastVisit && now - Number(lastVisit) > RETURN_THRESHOLD_MS) {
    const days = Math.floor((now - Number(lastVisit)) / (24 * 60 * 60 * 1000));
    assistantEventBus.emit('user:return', { currentHour, daysSinceLastVisit: days });
  }

  localStorage.setItem('kb-last-visit', String(now));
}, []);
```

- [ ] **Step 2: 在番茄钟 store 完成时 emit session:end**

在番茄钟完成逻辑处（`usePomodoroStore` 的 complete 动作）追加：

```typescript
import { assistantEventBus } from '@/features/assistant/lib/eventBus';
// 在完成回调中：
assistantEventBus.emit('session:end', { currentHour: new Date().getHours(), sessionMinutes: duration });
```

- [ ] **Step 3: 生成音效占位文件**

使用项目已有的 `scripts/generate-sounds.mjs` 模式，或手动放置 3 个短音效文件：
- `client/public/sounds/assistant-bubble.mp3`
- `client/public/sounds/assistant-speak-start.mp3`
- `client/public/sounds/assistant-ack.mp3`

MVP 可先用静音占位（1s 空白 mp3），后续替换为正式音效。

- [ ] **Step 4: 验证完整编译**

Run: `cd client && npm run build`
Expected: 编译成功，无 TypeScript 错误

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/stores/ client/public/sounds/assistant-*.mp3
git commit -m "feat(assistant): integrate event bus with app lifecycle and pomodoro"
```

---

## Task 12: 端到端验证

- [ ] **Step 1: 启动开发环境**

Run: `cd client && npm run dev`

- [ ] **Step 2: 验证水母渲染**

打开应用 → 右下角应出现水母动画（缓慢漂浮 + 触须摆动）。

- [ ] **Step 3: 验证对话流**

点击水母 → 面板滑出 → 输入"你好" → 发送 → 流式回复逐字出现 → 光标闪烁 → 完成。

- [ ] **Step 4: 验证主动触发**

关闭应用 → 重新打开 → 水母应播放 alerting 动画 + 气泡浮现问候语。

- [ ] **Step 5: 验证持久化**

关闭应用 → 重新打开 → 点击水母展开面板 → 历史消息仍在。

- [ ] **Step 6: 验证 TTS**

设置中开启 TTS → 发送消息 → 助手回复时应朗读（系统中文语音）。

- [ ] **Step 7: 运行 lint**

Run: `cd client && npm run lint`
Expected: 无错误

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat(assistant): AI deep-sea companion MVP complete"
```
