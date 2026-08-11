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
import { pickTemplate, maybeCuriosityRewrite } from '../lib/messageTemplates';
import { getStatsCacheText, refreshStatsCache } from '../lib/progressStats';
import { useAssistantStore } from '../store/useAssistantStore';
import { MAX_TRIGGERS_PER_HOUR, MAX_CONSECUTIVE_IGNORES, PROGRESS_NARRATIVE_STORAGE_KEY, PROGRESS_NARRATIVE_DELAY_MS } from '../constants';
import { getAuthToken } from '@/lib/ai/aiPluginProvider';
import type { TriggerContext, ProactiveRule } from '../types';

/** 内存态冷却追踪（避免频繁读库） */
const lastTriggeredMap = new Map<string, number>();
let hourlyCount = 0;
let hourlyResetAt = Date.now() + 60 * 60 * 1000;
let consecutiveIgnores = 0;
/** 最近一次气泡被关闭的时刻（延迟展示类规则用它判断用户是否已表达不想被打扰） */
let lastDismissedAt = 0;

/** A3 {stats} 占位符缓存未就绪时的通用正向兜底文案 */
const FALLBACK_STATS_TEXT = '你的每一点坚持都算数';

/** A3：记录本次叙述时间，使周节奏条件在 7 天内自然失效 */
function markNarrativeShown(): void {
  try {
    localStorage.setItem(PROGRESS_NARRATIVE_STORAGE_KEY, String(Date.now()));
  } catch { /* localStorage 不可用时忽略——最多导致重复叙述，无副作用 */ }
}

/**
 * A3：网关/本地模型异步增强叙述。
 * 先用离线模板气泡即时反馈，AI 生成成功后覆盖为个性化叙述；
 * 失败保留模板气泡（本地优先降级，用户无感）。
 */
async function enhanceNarrative(statsText: string, ruleId: string): Promise<void> {
  const api = window.electronAPI;
  if (!api) return;
  try {
    const authToken = await getAuthToken();
    const res = await api.invoke('ai_progress_narrate', {
      statsText,
      authToken: authToken ?? undefined,
    }) as { narrative?: string; status?: string };
    if (res?.narrative && res.status === 'success') {
      // 竞态守卫：AI 返回时用户可能已展开面板或关闭气泡——
      // 仅当当前仍在展示本规则的气泡时才覆盖，不抢占用户当前状态
      const s = useAssistantStore.getState();
      if (s.panelState === 'bubble' && s.bubbleTriggerId === ruleId) {
        s.showBubble(res.narrative, ruleId);
      }
    }
  } catch { /* 静默降级：保留离线模板拼装的统计气泡 */ }
}

export function useProactiveEngine(): void {
  const preferences = useAssistantStore(s => s.preferences);
  const showBubble = useAssistantStore(s => s.showBubble);
  const prefsRef = useRef(preferences);
  prefsRef.current = preferences;

  useEffect(() => {
    // A3 预取：挂载时异步采集周统计入缓存，触发时同步可读
    void refreshStatsCache();

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

    // ai_generate 策略离线降级为 template；{stats} 用预取的周统计填充，
    // 缓存未就绪（非 Electron/采集失败）时用通用正向文案兜底；
    // pre-class-prep 额外替换 {course}/{minutes} 课程上下文占位符
    const statsText = getStatsCacheText() ?? FALLBACK_STATS_TEXT;
    let message = pickTemplate(rule.id).replace('{stats}', statsText);
    if (rule.id === 'pre-class-prep' && ctx.upcomingClass) {
      message = message
        .replace('{course}', ctx.upcomingClass.course)
        .replace('{minutes}', String(ctx.upcomingClass.startsInMinutes));
    }
    // 1.15 好奇心改写：30% 概率把普通通知改写为好奇心驱动版本（奖赏回来）
    message = maybeCuriosityRewrite(message);
    // progress-narrative 走下方延迟展示分支，其余规则立即展示
    if (rule.id !== 'progress-narrative') {
      showBubble(message, rule.id, ctx as unknown as Record<string, unknown>);
    }

    // A3 微进展叙述：同步记录节奏；气泡延迟展示——app:startup 同批的
    // 问候语先曝光，避免叙述瞬间覆盖问候；延迟期间用户已展开面板
    // 或关闭过气泡则放弃展示（奖赏回来 ≠ 抢回注意力）
    if (rule.id === 'progress-narrative') {
      markNarrativeShown();
      const scheduleAt = Date.now();
      window.setTimeout(() => {
        const s = useAssistantStore.getState();
        if (s.panelState === 'expanded' || lastDismissedAt > scheduleAt) return;
        s.showBubble(message, rule.id, ctx as unknown as Record<string, unknown>);
        void enhanceNarrative(statsText, rule.id);
      }, PROGRESS_NARRATIVE_DELAY_MS);
    }
  }
}

/** 外部调用：标记用户忽略了气泡 */
export function reportBubbleDismissed(): void {
  consecutiveIgnores++;
  lastDismissedAt = Date.now();
}

/** 外部调用：标记用户回应了气泡（奖赏回来——重置退让计数） */
export function reportBubbleResponded(): void {
  consecutiveIgnores = 0;
}
