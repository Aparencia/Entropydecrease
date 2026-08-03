/**
 * A4 实施意图教练 — 到期意图检查 hook
 * Implementation intention coach — periodic due-intention checker
 *
 * @ai-context: 挂载后周期扫描 implementation_intentions 表（本地 SQLite），
 * 发现到期意图时向事件总线发射 intention:due，由 ProactiveEngine 按
 * intention-reminder 规则决策是否弹气泡（冷却 4h + 频率上限天然防打扰）。
 * 每条意图至多提醒一次（localStorage 持久化已提醒 ID）——应用暂无
 * 意图完成入口，若允许重复提醒会导致到期意图每 4h 无限循环提醒，
 * 且 findDueIntention 只返回最新一条会阻塞后续新意图（队头阻塞）。
 * 觉察 > 管控：只发事件不强制；检测失败静默跳过。
 * @ai-context: Emits intention:due when a stored intention falls due;
 * each intention reminds at most once (persisted in localStorage) since
 * there is no completion UI yet. The proactive engine decides whether to
 * surface a bubble.
 */
import { useEffect } from 'react';
import { assistantEventBus } from '../lib/eventBus';
import { findDueIntention } from '../lib/intentionRepository';
import { INTENTION_REMINDED_STORAGE_KEY } from '../constants';

/** 检测间隔：5 分钟一次，重复打扰由规则冷却与频率上限兜底 */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** 已提醒 ID 列表保留上限（防 localStorage 无限增长） */
const MAX_REMINDED_IDS = 100;

/** 读取已提醒意图 ID 列表（损坏/不可用时降级为空集） */
function readRemindedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(INTENTION_REMINDED_STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** 记录已提醒意图 ID（超出上限截断旧条目） */
function markReminded(id: string): void {
  try {
    const ids = [...readRemindedIds(), id].slice(-MAX_REMINDED_IDS);
    localStorage.setItem(INTENTION_REMINDED_STORAGE_KEY, JSON.stringify(ids));
  } catch { /* localStorage 不可用时降级为会话内去重 */ }
}

export function useIntentionCoach(): void {
  useEffect(() => {
    const check = async () => {
      try {
        const now = new Date();
        // 已提醒过的意图直接跳过（否则最新一条会队头阻塞后续意图）
        const due = await findDueIntention(now, readRemindedIds());
        if (!due) return;
        markReminded(due.id);

        assistantEventBus.emit('intention:due', {
          currentHour: now.getHours(),
          intentionId: due.id,
        });
      } catch {
        // 可选增强：检测失败静默跳过，绝不打扰用户
      }
    };

    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
}
