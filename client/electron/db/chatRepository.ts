/**
 * AI 助手对话持久化 — SQLite CRUD
 *
 * @ai-context: 助手会话/消息/触发记录的数据库访问层；
 * 依赖 sqliteService.getConnection() 获取连接，表 DDL 在 schema.ts 中定义。
 * 纯数据访问，无业务逻辑——业务编排在渲染进程 hooks 中完成。
 */
import { randomUUID } from 'crypto';
import { getConnection } from './sqliteService.js';
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
  const db = getConnection();
  const now = Date.now();
  const row: SessionRow = { id: randomUUID(), title, created_at: now, updated_at: now, is_archived: 0, metadata: null };
  db.prepare('INSERT INTO assistant_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(row.id, row.title, row.created_at, row.updated_at);
  logger.info(`[ChatRepo] Session created: ${row.id}`);
  return row;
}

export function getLatestSession(): SessionRow | null {
  const db = getConnection();
  return db.prepare('SELECT * FROM assistant_sessions WHERE is_archived = 0 ORDER BY updated_at DESC LIMIT 1').get() as SessionRow | undefined ?? null;
}

export function touchSession(id: string): void {
  const db = getConnection();
  db.prepare('UPDATE assistant_sessions SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

export function updateSessionTitle(id: string, title: string): void {
  const db = getConnection();
  db.prepare('UPDATE assistant_sessions SET title = ? WHERE id = ?').run(title, id);
}

// ── 消息 CRUD ─────────────────────────────────────────────────

export function insertMessage(msg: Omit<MessageRow, 'id' | 'created_at'> & { id?: string; created_at?: number }): MessageRow {
  const db = getConnection();
  const row: MessageRow = {
    id: msg.id ?? randomUUID(),
    created_at: msg.created_at ?? Date.now(),
    session_id: msg.session_id,
    role: msg.role,
    content: msg.content,
    content_type: msg.content_type,
    trigger_type: msg.trigger_type,
    tokens_used: msg.tokens_used,
    model: msg.model,
    latency_ms: msg.latency_ms,
  };
  db.prepare(`INSERT INTO assistant_messages (id, session_id, role, content, content_type, trigger_type, tokens_used, model, latency_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(row.id, row.session_id, row.role, row.content, row.content_type, row.trigger_type, row.tokens_used, row.model, row.latency_ms, row.created_at);
  return row;
}

export function getMessages(sessionId: string, limit = 50, before?: number): MessageRow[] {
  const db = getConnection();
  // CL-L5: limit 钳制——渲染进程可传任意大值导致一次拉取整表消息经 IPC 全量传输
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200);
  if (before) {
    return db.prepare('SELECT * FROM assistant_messages WHERE session_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?')
      .all(sessionId, before, safeLimit) as MessageRow[];
  }
  return db.prepare('SELECT * FROM assistant_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(sessionId, safeLimit) as MessageRow[];
}

// ── 触发记录 ──────────────────────────────────────────────────

export function insertTrigger(ruleId: string): string {
  const db = getConnection();
  const id = randomUUID();
  db.prepare('INSERT INTO assistant_triggers (id, rule_id, triggered_at) VALUES (?, ?, ?)').run(id, ruleId, Date.now());
  return id;
}

export function getLastTriggerTime(ruleId: string): number | null {
  const db = getConnection();
  const row = db.prepare('SELECT triggered_at FROM assistant_triggers WHERE rule_id = ? ORDER BY triggered_at DESC LIMIT 1').get(ruleId) as { triggered_at: number } | undefined;
  return row?.triggered_at ?? null;
}

export function getRecentTriggerCount(sinceMs: number): number {
  const db = getConnection();
  const row = db.prepare('SELECT COUNT(*) as cnt FROM assistant_triggers WHERE triggered_at > ?').get(Date.now() - sinceMs) as { cnt: number };
  return row.cnt;
}

export function getConsecutiveIgnores(): number {
  const db = getConnection();
  const rows = db.prepare('SELECT dismissed, responded FROM assistant_triggers ORDER BY triggered_at DESC LIMIT ?').all(10) as Array<{ dismissed: number; responded: number }>;
  let count = 0;
  for (const r of rows) {
    if (r.dismissed && !r.responded) count++;
    else break;
  }
  return count;
}

export function markTriggerResponded(id: string): void {
  const db = getConnection();
  db.prepare('UPDATE assistant_triggers SET responded = 1 WHERE id = ?').run(id);
}

export function markTriggerDismissed(id: string): void {
  const db = getConnection();
  db.prepare('UPDATE assistant_triggers SET dismissed = 1 WHERE id = ?').run(id);
}
