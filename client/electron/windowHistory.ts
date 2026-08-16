/**
 * 窗口选择历史记忆（纯函数 + SQLite 薄封装）
 *
 * 按「进程名 + 标题模板」维度记忆用户选择：模板归一化（会议号/章节数字 →
 * 占位符）使同一窗口的反复选择命中同一记忆条目。boost 分 = min(useCount,5)×6
 * + recency（7 天内 +10 / 30 天内 +5，封顶 +40）。
 *
 * @ai-context: 标题模板化是记忆可靠性的关键——"腾讯会议 123456789"与
 * "腾讯会议 987654321"必须命中同一条记忆，否则每次会议号变化都失忆。
 * @ai-context EN: Choice memory keyed by process + normalized title template.
 * SQLite writes are a thin layer over sqliteService; pure functions are
 * unit-testable without the Electron-ABI better-sqlite3.
 */
import { getConnection } from './db/sqliteService.js';

// ================================================================
// 类型定义
// ================================================================

export interface WindowMemoryEntry {
  processName: string;
  titleHash: string;
  titleTemplate: string;
  courseName?: string;
  useCount: number;
  lastUsedAt: number;
}

/** 记忆上限（LRU 淘汰） */
export const MEMORY_MAX_ENTRIES = 100;

// ================================================================
// 纯函数
// ================================================================

/** 数字（含千分位/标点包裹的编号）→ 占位符；保留标题其余结构 */
export function normalizeTitleTemplate(title: string): string {
  return (title ?? '')
    .replace(/\d[\d,，.．\-—_]*/g, '{n}')
    .replace(/\{n\}[^-\w]*\{n\}/g, '{n}');
}

/** djb2 字符串 hash → hex（稳定、碰撞概率可接受） */
export function hashTitleTemplate(template: string): string {
  let h = 5381;
  for (let i = 0; i < template.length; i += 1) {
    h = ((h << 5) + h + template.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

/**
 * 计算记忆 boost 分（封顶 +40）。
 * @param now 当前时间戳（注入便于测试）
 */
export function computeMemoryBoost(entry: WindowMemoryEntry | null, now: number): number {
  if (!entry) return 0;
  const DAY = 24 * 3600 * 1000;
  let boost = Math.min(entry.useCount, 5) * 6;
  const age = now - entry.lastUsedAt;
  if (age >= 0 && age <= 7 * DAY) boost += 10;
  else if (age > 7 * DAY && age <= 30 * DAY) boost += 5;
  return Math.min(boost, 40);
}

/** LRU 淘汰：返回最久未使用的 titleHash（entries 为空返回 null） */
export function pickLruEviction(
  entries: Array<Pick<WindowMemoryEntry, 'titleHash' | 'lastUsedAt'>>,
): string | null {
  let oldest: string | null = null;
  let oldestAt = Infinity;
  for (const e of entries) {
    if (e.lastUsedAt < oldestAt) {
      oldestAt = e.lastUsedAt;
      oldest = e.titleHash;
    }
  }
  return oldest;
}

// ================================================================
// SQLite 薄封装（运行时路径，异常由调用方降级）
// ================================================================

/** 建表（幂等） */
function ensureTable(): void {
  getConnection()
    .prepare(
      `CREATE TABLE IF NOT EXISTS window_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process_name TEXT NOT NULL,
        title_hash TEXT NOT NULL,
        title_template TEXT NOT NULL,
        course_name TEXT,
        use_count INTEGER NOT NULL DEFAULT 1,
        last_used_at INTEGER NOT NULL,
        UNIQUE(process_name, title_hash)
      )`,
    )
    .run();
}

/** 记录一次选择（upsert：use_count+1、更新 last_used_at 与 course_name） */
export function recordChoice(
  processName: string,
  title: string,
  courseName?: string,
): void {
  try {
    ensureTable();
    const template = normalizeTitleTemplate(title);
    const titleHash = hashTitleTemplate(template);
    const now = Date.now();
    const db = getConnection();
    db.prepare(
      `INSERT INTO window_memory (process_name, title_hash, title_template, course_name, use_count, last_used_at)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(process_name, title_hash) DO UPDATE SET
         use_count = use_count + 1,
         last_used_at = excluded.last_used_at,
         course_name = COALESCE(excluded.course_name, window_memory.course_name)`,
    ).run(processName.toLowerCase(), titleHash, template, courseName ?? null, now);

    // LRU 淘汰：超过上限删除最久未使用条目
    const row = db
      .prepare('SELECT COUNT(*) AS c FROM window_memory')
      .get() as { c: number };
    if (row.c > MEMORY_MAX_ENTRIES) {
      const victims = db
        .prepare('SELECT title_hash, last_used_at FROM window_memory ORDER BY last_used_at ASC LIMIT ?')
        .all(row.c - MEMORY_MAX_ENTRIES) as Array<{ title_hash: string; last_used_at: number }>;
      const evict = pickLruEviction(
        victims.map((v) => ({ titleHash: v.title_hash, lastUsedAt: v.last_used_at })),
      );
      if (evict) {
        db.prepare('DELETE FROM window_memory WHERE title_hash = ?').run(evict);
      }
    }
  } catch (err) {
    console.warn('[windowHistory] recordChoice failed:', err);
  }
}

/** 查询记忆条目（进程名 + 标题模板）；无命中返回 null */
export function lookupMemory(
  processName: string,
  title: string,
): WindowMemoryEntry | null {
  try {
    ensureTable();
    const template = normalizeTitleTemplate(title);
    const row = getConnection()
      .prepare(
        `SELECT process_name AS processName, title_hash AS titleHash, title_template AS titleTemplate,
                course_name AS courseName, use_count AS useCount, last_used_at AS lastUsedAt
         FROM window_memory WHERE process_name = ? AND title_hash = ?`,
      )
      .get(processName.toLowerCase(), hashTitleTemplate(template)) as
      | WindowMemoryEntry
      | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

/** 清空全部记忆（设置页入口） */
export function clearMemory(): void {
  try {
    ensureTable();
    getConnection().prepare('DELETE FROM window_memory').run();
  } catch {
    // 静默降级
  }
}
