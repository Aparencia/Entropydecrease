/**
 * 主动触发引擎 Hook
 *
 * @ai-context: 订阅事件总线，按规则表匹配 → 冷却检查 → 频率限制 → 生成消息 → 触发呈现。
 * 在 AssistantRoot 中挂载一次即可。纯事件驱动，无轮询，零空闲开销。
 * 防打扰：勿扰时段 + 每小时频率上限 + 连续忽略退让。
 * 设计原则：奖赏回来——每次触发都是正向反馈，而非管控提醒。
 */
import { useEffect, useRef } from 'react';
import { assistantEventBus } from '../lib/eventBus';
import { PROACTIVE_RULES } from '../lib/proactiveRules';
import { pickTemplate } from '../lib/messageTemplates';
import { useAssistantStore } from '../store/useAssistantStore';
import { MAX_TRIGGERS_PER_HOUR, MAX_CONSECUTIVE_IGNORES } from '../constants';
import type { TriggerContext, ProactiveRule } from '../types';

/** 内存态冷却追踪（避免频繁读库） */
const lastTriggeredMap = new Map<string, number>();
let hourlyCount = 0;
let hourlyResetAt = Date.now() + 60 * 60 * 1000;
let consecutiveIgnores = 0;

export function useProactiveEngine(): void {
  const preferences = useAssistantStore(s => s.preferences);
  const showBubble = useAssistantStore(s => s.showBubble);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTrigger(rule: ProactiveRule, ctx: TriggerContext): void {
    const prefs = prefsRef.current;
    // 总开关
    if (!prefs.enabled || !prefs.proactiveEnabled) return;
    // 勿扰时段
    const hour = ctx.currentHour;
    const { quietHoursStart, quietHoursEnd } = prefs;
    if (quietHoursStart > quietHoursEnd) {
      // 跨午夜（如 22:00-08:00）
      if (hour >= quietHoursStart || hour < quietHoursEnd) return;
    } else {
      if (hour >= quietHoursStart && hour < quietHoursEnd) return;
    }
    // 频率限制（每小时重置）
    if (Date.now() > hourlyResetAt) { hourlyCount = 0; hourlyResetAt = Date.now() + 60 * 60 * 1000; }
    if (hourlyCount >= MAX_TRIGGERS_PER_HOUR) return;
    // 连续忽略退让——觉察 > 管控：用户不回应即自动退让
    if (consecutiveIgnores >= MAX_CONSECUTIVE_IGNORES) return;
    // 冷却
    const lastTime = lastTriggeredMap.get(rule.id) ?? 0;
    if (Date.now() - lastTime < rule.cooldown) return;
    // 条件检查
    if (rule.condition && !rule.condition(ctx)) return;

    // 通过所有检查 → 触发
    lastTriggeredMap.set(rule.id, Date.now());
    hourlyCount++;

    // MVP: ai_generate 降级为 template（后续接入网关个性化生成）
    const message = pickTemplate(rule.id);
    showBubble(message, rule.id);
  }
}

/** 外部调用：标记用户忽略了气泡 */
export function reportBubbleDismissed(): void {
  consecutiveIgnores++;
}

/** 外部调用：标记用户回应了气泡（奖赏回来——重置退让计数） */
export function reportBubbleResponded(): void {
  consecutiveIgnores = 0;
}
