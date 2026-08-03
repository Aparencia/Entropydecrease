/**
 * A4 实施意图教练 — 到期意图检查 hook
 * Implementation intention coach — periodic due-intention checker
 *
 * @ai-context: 挂载后周期扫描 implementation_intentions 表（本地 SQLite），
 * 发现到期意图时向事件总线发射 intention:due，由 ProactiveEngine 按
 * intention-reminder 规则决策是否弹气泡（冷却 4h + 频率上限天然防打扰）。
 * 觉察 > 管控：只发事件不强制；检测失败静默跳过。
 * @ai-context: Emits intention:due when a stored intention falls due;
 * the proactive engine decides whether to surface a bubble.
 */
import { useEffect } from 'react';
import { assistantEventBus } from '../lib/eventBus';
import { findDueIntention } from '../lib/intentionRepository';

/** 检测间隔：5 分钟一次，重复打扰由规则冷却与频率上限兜底 */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function useIntentionCoach(): void {
  useEffect(() => {
    const check = async () => {
      try {
        const now = new Date();
        const due = await findDueIntention(now);
        if (!due) return;

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
