/**
 * 知识时光胶囊 — localStorage 服务
 *
 * @ai-context: 3.16 时光胶囊。key ed_time_capsules；封装时异步采集学习快照
 * （Dexie count / toArray 折算掌握度），读取时结构校验，缺失/损坏回退空数组。
 */
import { generateId } from '@/lib/utils/uuid';
import {
  flashcardReviewStore,
  noteStore,
  pomodoroSessionStore,
} from '@/lib/storage';
import type {
  CapsuleSnapshot,
  SealCapsuleInput,
  TimeCapsule,
} from '../types';

const STORAGE_KEY = 'ed_time_capsules';

/** 掌握度折算权重：复习×2 + 笔记×5 + 专注分钟/12，封顶 100 */
const MASTERY_MAX = 100;

/** 结构校验 */
function isValidCapsule(raw: unknown): raw is TimeCapsule {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as Record<string, unknown>;
  const s = c.snapshot as Record<string, unknown> | undefined;
  const stats = s?.stats as Record<string, unknown> | undefined;
  return (
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    typeof c.content === 'string' &&
    (c.milestone === 30 || c.milestone === 60 || c.milestone === 90) &&
    typeof c.sealedAt === 'string' &&
    typeof c.openAt === 'string' &&
    (c.status === 'sealed' || c.status === 'opened') &&
    !!s &&
    typeof s.masterySnapshot === 'number' &&
    !!stats &&
    typeof stats.flashcardsReviewed === 'number' &&
    typeof stats.notesCreated === 'number' &&
    typeof stats.pomodoroFocusMinutes === 'number' &&
    typeof stats.streakDays === 'number'
  );
}

function readAll(): TimeCapsule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidCapsule);
  } catch {
    // 数据损坏时回退空数组
    return [];
  }
}

function writeAll(capsules: TimeCapsule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capsules));
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

/** 采集当前学习快照（异步：Dexie 表计数） */
async function collectSnapshot(): Promise<CapsuleSnapshot> {
  const [reviewCount, noteCount, sessions] = await Promise.all([
    flashcardReviewStore.getTable().count().catch(() => 0),
    noteStore.getTable().count().catch(() => 0),
    pomodoroSessionStore.getTable().toArray().catch(() => []),
  ]);
  const focusMinutes = Math.round(
    (sessions as Array<{ actualDuration?: number }>)
      .reduce((sum, s) => sum + (s.actualDuration ?? 0), 0) / 60,
  );
  const masterySnapshot = Math.min(
    MASTERY_MAX,
    Math.round(reviewCount * 2 + noteCount * 5 + focusMinutes / 12),
  );
  return {
    masterySnapshot,
    stats: {
      flashcardsReviewed: reviewCount,
      notesCreated: noteCount,
      pomodoroFocusMinutes: focusMinutes,
      streakDays: 0, // 连续天数由开启时刷新（见 openCapsule 注释）
    },
  };
}

/** 封装新胶囊；返回创建后的胶囊 */
export async function sealCapsule(input: SealCapsuleInput): Promise<TimeCapsule> {
  const snapshot = await collectSnapshot();
  const now = new Date();
  const openAt = new Date(now.getTime() + input.milestone * 24 * 60 * 60 * 1000);
  const capsule: TimeCapsule = {
    id: generateId(),
    title: input.title.trim() || `知识胶囊 · ${input.milestone}天`,
    content: input.content.trim(),
    milestone: input.milestone,
    sealedAt: now.toISOString(),
    openAt: openAt.toISOString(),
    status: 'sealed',
    snapshot,
  };
  const all = readAll();
  all.push(capsule);
  writeAll(all);
  return capsule;
}

/** 到期（openAt <= now 且未开启）的胶囊 */
export function checkDueCapsules(): TimeCapsule[] {
  const now = Date.now();
  return readAll().filter((c) => c.status === 'sealed' && new Date(c.openAt).getTime() <= now);
}

/** 开启胶囊（幂等：已开启返回原对象） */
export function openCapsule(id: string): TimeCapsule | null {
  const all = readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  const capsule = all[idx];
  if (capsule.status === 'opened') return capsule;
  const opened: TimeCapsule = { ...capsule, status: 'opened', openedAt: new Date().toISOString() };
  all[idx] = opened;
  writeAll(all);
  return opened;
}

/** 最近胶囊（按封装时间倒序） */
export function getRecentCapsules(limit = 20): TimeCapsule[] {
  return readAll()
    .sort((a, b) => b.sealedAt.localeCompare(a.sealedAt))
    .slice(0, limit);
}

/** 删除胶囊 */
export function removeCapsule(id: string): void {
  writeAll(readAll().filter((c) => c.id !== id));
}
