/**
 * N5 核心层持久化 — 分层结果与闪卡生成的联动桥
 * Content-tier core persistence — bridges tiering to card generation
 *
 * @ai-context: 内容分层结果不落 SQLite（AI 生成物，会话性辅助），以
 * localStorage 按笔记缓存核心层文本 + 时间戳，有效期 7 天。闪卡生成
 * （useNoteAI.persistCards）读取此缓存：存在则仅用核心层文本作生成源，
 * 实现"策略性遗忘 → 闪卡只记核心"的闭环；过期/缺失静默回退原文。
 * @ai-context: Tier results are cached per note in localStorage with a
 * 7-day TTL; flashcard generation consumes only the core layer when a
 * fresh cache exists, falling back to full text silently otherwise.
 */

const CORE_TIER_PREFIX = 'kb-core-tier:';
/** 缓存有效期（毫秒）：7 天 */
const CORE_TIER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CoreTierCache {
  coreText: string;
  savedAt: string;
}

function keyOf(noteId: string): string {
  return `${CORE_TIER_PREFIX}${noteId}`;
}

/** 保存笔记的核心层文本（分析成功后由 ContentTierModal 调用） */
export function saveCoreTier(noteId: string, coreText: string): void {
  if (!noteId || !coreText.trim()) return;
  try {
    const cache: CoreTierCache = { coreText: coreText.trim(), savedAt: new Date().toISOString() };
    localStorage.setItem(keyOf(noteId), JSON.stringify(cache));
  } catch {
    /* 存储失败静默——不影响分层弹窗本身 */
  }
}

/** 读取新鲜（7 天内）的核心层文本；无缓存/过期返回 null */
export function getCoreTier(noteId: string | null): string | null {
  if (!noteId) return null;
  try {
    const raw = localStorage.getItem(keyOf(noteId));
    if (!raw) return null;
    const cache = JSON.parse(raw) as CoreTierCache;
    if (!cache.coreText) return null;
    const age = Date.now() - new Date(cache.savedAt).getTime();
    if (age < 0 || age > CORE_TIER_TTL_MS) return null;
    return cache.coreText;
  } catch {
    return null;
  }
}

/** 清除核心层缓存（笔记删除时可选调用） */
export function clearCoreTier(noteId: string): void {
  try {
    localStorage.removeItem(keyOf(noteId));
  } catch {
    /* 静默 */
  }
}
