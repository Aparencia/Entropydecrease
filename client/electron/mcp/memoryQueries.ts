/**
 * MCP 学习记忆查询层（纯函数，只读）
 * MCP learning-memory query layer (pure, read-only)
 *
 * @ai-context: 宪法 P2 内层防御的数据层：把本地学习数据聚合为
 * 摘要级 JSON，供 mcpMemoryServer 的 8 个 learning_memory.* 工具消费。
 * 硬约束（docs/product/mcp-learning-memory-interface.md §五）：
 * - 只读：仅 SELECT，无写入；limit 上限 100（粒度上限防整库抽取）
 * - 焦虑防线传导：不输出倒计时/赤字/比较字段，朦胧度只给档位
 * - 摘要级：不返回卡片背面原文等整行数据（front 截断 60 字）
 *
 * @ai-context: Read-only aggregation over the local SQLite learning DB.
 * Anxiety-defense compliant: no countdowns, no deficits, tier labels only.
 */
import type Database from 'better-sqlite3';

/** 粒度上限（草案 §五.6：单次响应 ≤100 条摘要级记录） */
export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 20;

/** 归一化 limit 入参（防注入仅靠参数绑定，防超量靠此处封顶） */
export function clampLimit(input: unknown): number {
  const n = typeof input === 'number' && Number.isFinite(input) ? Math.floor(input) : DEFAULT_LIMIT;
  return Math.min(Math.max(n, 1), MAX_LIMIT);
}

/** 朦胧度档位（焦虑防线：只给档位不给天数） / Haze tier labels */
function hazeTier(easeFactor: number, intervalDays: number): '牢固' | '成长中' | '朦胧' {
  if (easeFactor >= 2.4 && intervalDays >= 14) return '牢固';
  if (easeFactor >= 2.0 || intervalDays >= 3) return '成长中';
  return '朦胧';
}

/** learning_memory.profile — 学习画像摘要 */
export function queryProfile(db: Database.Database): Record<string, unknown> {
  const focus = db.prepare(`
    SELECT COUNT(*) AS sessions, COALESCE(SUM(actual_duration), 0) AS totalSeconds
    FROM pomodoro_sessions WHERE interrupted = 0
  `).get() as { sessions: number; totalSeconds: number };

  const hourRow = db.prepare(`
    SELECT CAST(substr(completed_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS n
    FROM pomodoro_sessions GROUP BY hour ORDER BY n DESC LIMIT 1
  `).get() as { hour: number; n: number } | undefined;

  const counts = {
    notes: (db.prepare('SELECT COUNT(*) AS n FROM notes').get() as { n: number }).n,
    flashcards: (db.prepare('SELECT COUNT(*) AS n FROM flashcards').get() as { n: number }).n,
    feynmanCompleted: (db.prepare(
      "SELECT COUNT(*) AS n FROM feynman_notes WHERE status = 'completed'",
    ).get() as { n: number }).n,
    inspirations: (db.prepare('SELECT COUNT(*) AS n FROM inspirations').get() as { n: number }).n,
  };

  return {
    totalFocusMinutes: Math.round(focus.totalSeconds / 60),
    completedSessions: focus.sessions,
    bestFocusHour: hourRow ? hourRow.hour : null,
    moduleFootprint: counts,
    note: '摘要级画像；原始数据始终保留在用户本地',
  };
}

/** learning_memory.mastery — 概念掌握度（topic 可选模糊过滤） */
export function queryMastery(db: Database.Database, topic?: string): Record<string, unknown> {
  const where = topic ? "WHERE front LIKE ? ESCAPE '\\'" : '';
  const param = topic ? [`%${topic.replace(/[%_\\]/g, '\\$&')}%`] : [];
  const rows = db.prepare(`
    SELECT front, ease_factor, "interval" FROM flashcards ${where} ORDER BY updated_at DESC LIMIT ?
  `).all(...param, MAX_LIMIT) as Array<{ front: string; ease_factor: number; interval: number }>;

  const items = rows.map((r) => ({
    concept: r.front.slice(0, 60),
    tier: hazeTier(r.ease_factor, r.interval),
  }));
  const tally = { 牢固: 0, 成长中: 0, 朦胧: 0 };
  for (const it of items) tally[it.tier]++;

  return { total: items.length, tally, items, note: '档位为相对状态，不含任何倒计时' };
}

/** learning_memory.review_candidates — 待唤醒知识（零倒计时表达） */
export function queryReviewCandidates(db: Database.Database, limitRaw: unknown): Record<string, unknown> {
  const limit = clampLimit(limitRaw);
  const rows = db.prepare(`
    SELECT front, ease_factor, "interval" FROM flashcards
    WHERE due_date <= datetime('now') ORDER BY due_date ASC LIMIT ?
  `).all(limit) as Array<{ front: string; ease_factor: number; interval: number }>;

  return {
    count: rows.length,
    items: rows.map((r) => ({
      concept: r.front.slice(0, 60),
      haze: hazeTier(r.ease_factor, r.interval),
    })),
    note: '朦胧的知识等待唤醒——复习即点亮，无截止压力',
  };
}

/** learning_memory.focus_stats — 专注历史统计 */
export function queryFocusStats(db: Database.Database, rangeDaysRaw: unknown): Record<string, unknown> {
  const rangeDays = typeof rangeDaysRaw === 'number' && rangeDaysRaw > 0
    ? Math.min(Math.floor(rangeDaysRaw), 365) : 30;
  const rows = db.prepare(`
    SELECT actual_duration, interrupted, CAST(substr(completed_at, 12, 2) AS INTEGER) AS hour
    FROM pomodoro_sessions WHERE completed_at >= datetime('now', ?)
  `).all(`-${rangeDays} days`) as Array<{ actual_duration: number; interrupted: number; hour: number }>;

  if (rows.length === 0) return { rangeDays, sessions: 0, note: '这段时间没有深潜记录' };

  const total = rows.reduce((s, r) => s + r.actual_duration, 0);
  const done = rows.filter((r) => !r.interrupted);
  const hourTally = new Map<number, number>();
  for (const r of rows) hourTally.set(r.hour, (hourTally.get(r.hour) ?? 0) + 1);
  const bestHour = [...hourTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    rangeDays,
    sessions: rows.length,
    totalMinutes: Math.round(total / 60),
    averageMinutes: Math.round(total / rows.length / 60),
    completionRate: rows.length ? Math.round((done.length / rows.length) * 100) : 0,
    bestFocusHour: bestHour,
  };
}

/** learning_memory.streak — 连击状态（study_check_ins 口径，含休息日语义） */
export function queryStreak(db: Database.Database): Record<string, unknown> {
  const rows = db.prepare(
    'SELECT "date", streak_days FROM study_check_ins ORDER BY "date" DESC LIMIT ?',
  ).all(MAX_LIMIT) as Array<{ date: string; streak_days: number }>;

  if (rows.length === 0) return { currentStreak: 0, note: '还没有打卡记录——首次深潜即开始' };

  // 从最近日期向前逐日检查（与 worldState 派生口径一致）
  let current = 1;
  for (let i = 1; i < rows.length; i++) {
    const prev = new Date(rows[i - 1].date).getTime();
    const curr = new Date(rows[i].date).getTime();
    if ((prev - curr) / 86_400_000 === 1) current++;
    else break;
  }
  return {
    currentStreak: current,
    recordedStreakDays: rows[0].streak_days,
    totalCheckInDays: rows.length,
    note: '洋流休息日不计为断裂——可逆原则',
  };
}

/** 读取渲染进程同步过来的世界快照（useWorldSnapshotSync 写入，无则 null） */
function readWorldSnapshot(db: Database.Database): {
  corals?: { total: number; healthy: number; bleached: number; totalDepth: number };
  discoveries?: { count: number };
  capturedAt?: string;
} | null {
  try {
    const row = db.prepare("SELECT payload FROM world_snapshots WHERE id = 'latest'").get() as
      { payload: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

/** learning_memory.discoveries — 深海发现（优先读世界快照，无则占位） */
export function queryDiscoveries(db: Database.Database): Record<string, unknown> {
  const snap = readWorldSnapshot(db);
  if (!snap?.discoveries) {
    return {
      count: null,
      items: [],
      note: '尚未获取到发现图鉴快照（应用启动并产生发现后自动同步）',
    };
  }
  return {
    count: snap.discoveries.count,
    capturedAt: snap.capturedAt ?? null,
    note: '图鉴明细存于客户端本地，此处为累计数量快照',
  };
}

/** learning_memory.recent_sessions — 最近学习会话摘要 */
export function queryRecentSessions(db: Database.Database, limitRaw: unknown): Record<string, unknown> {
  const limit = clampLimit(limitRaw);
  const dives = db.prepare(`
    SELECT mode, duration, actual_duration, interrupted, goal, completed_at
    FROM pomodoro_sessions ORDER BY completed_at DESC LIMIT ?
  `).all(limit) as Array<{
    mode: string; duration: number; actual_duration: number;
    interrupted: number; goal: string | null; completed_at: string;
  }>;
  const feynman = db.prepare(`
    SELECT concept, status, completed_at FROM feynman_notes ORDER BY updated_at DESC LIMIT ?
  `).all(limit) as Array<{ concept: string; status: string; completed_at: string | null }>;

  return {
    dives: dives.map((d) => ({
      mode: d.mode,
      plannedMinutes: Math.round(d.duration / 60),
      actualMinutes: Math.round(d.actual_duration / 60),
      completed: !d.interrupted,
      goal: d.goal ?? null,
      at: d.completed_at,
    })),
    feynman: feynman.map((f) => ({ concept: f.concept.slice(0, 60), status: f.status, at: f.completed_at })),
  };
}

/**
 * learning_memory.world_state — 世界状态快照
 * @ai-context 优先消费渲染进程同步的精确快照（珊瑚健康度→雾与活力）；
 * 无快照时回退 sqlite 过程数据派生值并显式标注 provenance。
 */
export function queryWorldState(db: Database.Database): Record<string, unknown> {
  const snap = readWorldSnapshot(db);
  const focus = db.prepare(`
    SELECT COALESCE(SUM(actual_duration), 0) AS totalSeconds FROM pomodoro_sessions WHERE interrupted = 0
  `).get() as { totalSeconds: number };
  const due = (db.prepare(
    "SELECT COUNT(*) AS n FROM flashcards WHERE due_date <= datetime('now')",
  ).get() as { n: number }).n;
  const totalCards = (db.prepare('SELECT COUNT(*) AS n FROM flashcards').get() as { n: number }).n;

  const base = {
    depthMeters: Math.round(focus.totalSeconds / 60),
    depthNote: '以专注分钟折算的潜航深度（1 分钟 ≈ 1 米）',
    hazyShare: totalCards > 0 ? Math.round((due / totalCards) * 100) / 100 : 0,
    hazyNote: '朦胧知识占比（0-1）——雾的浓度，复习即拨开',
  };

  if (snap?.corals) {
    const { total, healthy, bleached, totalDepth } = snap.corals;
    return {
      ...base,
      ecosystem: {
        coralTotal: total,
        coralHealthy: healthy,
        coralBleached: bleached,
        vitality: total > 0 ? Math.round((healthy / total) * 100) / 100 : null,
        accumulatedDepthMeters: totalDepth,
      },
      capturedAt: snap.capturedAt ?? null,
      provenance: '珊瑚生态来自渲染进程同步快照（精确态）；潜航深度与朦胧占比由主库派生',
    };
  }

  return {
    ...base,
    provenance: '由主库过程数据派生；珊瑚精确态待应用启动后同步',
  };
}
