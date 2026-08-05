/**
 * 主动触发规则定义表
 *
 * @ai-context: 规则声明式定义冷却/优先级/策略，ProactiveEngine 按此表匹配。
 * 含 MVP 5 条基础规则 + A1 情绪分级 3 条 + A5 认知负荷 + A4 实施意图 + A3 微进展。
 * 设计原则：觉察 > 管控——所有规则均可被用户关闭，忽略即退让。
 */
import type { ProactiveRule } from '../types';
import { MESSAGE_TEMPLATES } from './messageTemplates';
import { PROGRESS_NARRATIVE_STORAGE_KEY, PROGRESS_NARRATIVE_INTERVAL_MS } from '../constants';

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
    // T3 分流：离开 ≥3 天改由 commit-dive 接管（避免双气泡打扰）
    condition: ctx => (ctx.daysSinceLastVisit ?? 0) < 3,
    cooldown: 24 * 60 * 60 * 1000,
    priority: 20,
    message: { type: 'ai_generate', prompt: '用户多日未打开应用后回归，生成一句温暖的欢迎语，提及"回来就好"的正向态度，不超过两句话。' },
  },
  // ── T3 5 分钟承诺入口：离开 ≥3 天回归时，用最小承诺降低重启门槛 ──
  {
    id: 'commit-dive',
    event: 'user:return',
    condition: ctx => (ctx.daysSinceLastVisit ?? 0) >= 3,
    cooldown: 24 * 60 * 60 * 1000,
    priority: 22,
    message: { type: 'template', templates: MESSAGE_TEMPLATES['commit-dive'] },
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
  // ── F3 睡前仪式完整版：晚间窗口 + 到期卡充足时触发完整三步仪式，每日至多一次 ──
  {
    id: 'bedtime-routine',
    event: 'review:bedtime',
    condition: ctx => (ctx.dueCardCount ?? 0) >= 3,
    cooldown: 24 * 60 * 60 * 1000,
    priority: 13,
    message: { type: 'template', templates: MESSAGE_TEMPLATES['bedtime-routine'] },
  },
  // ── T4 孵化效应引导：笔记/费曼卡壳超 10 分钟时发射，长冷却防反复打扰 ──
  {
    id: 'stuck-incubation',
    event: 'stuck:incubation',
    cooldown: 30 * 60 * 1000,
    priority: 11,
    message: { type: 'template', templates: MESSAGE_TEMPLATES['stuck-incubation'] },
  },
  // ── A1 情绪分级干预：按 emotionLevel 分流，逐级升级互不重叠 ──
  {
    id: 'emotion-mild',
    event: 'emotion:struggle',
    condition: ctx => ctx.emotionLevel === 1,
    cooldown: 30 * 60 * 1000,
    priority: 8,
    message: { type: 'template', templates: MESSAGE_TEMPLATES['emotion-mild'] },
  },
  {
    id: 'emotion-moderate',
    event: 'emotion:struggle',
    condition: ctx => ctx.emotionLevel === 2,
    cooldown: 45 * 60 * 1000,
    priority: 14,
    message: { type: 'template', templates: MESSAGE_TEMPLATES['emotion-moderate'] },
  },
  {
    id: 'emotion-deep',
    event: 'emotion:struggle',
    condition: ctx => ctx.emotionLevel === 3,
    cooldown: 60 * 60 * 1000,
    priority: 18,
    message: { type: 'template', templates: MESSAGE_TEMPLATES['emotion-deep'] },
  },
  // ── A5 认知负荷：仅新进入高负荷时发射，长冷却防打扰 ──
  {
    id: 'cognitive-overload',
    event: 'cognitive:overload',
    cooldown: 60 * 60 * 1000,
    priority: 10,
    message: { type: 'template', templates: MESSAGE_TEMPLATES['cognitive-overload'] },
  },
  // ── A4 实施意图：由意图检查 hook 发射 intention:due ──
  {
    id: 'intention-reminder',
    event: 'intention:due',
    cooldown: 4 * 60 * 60 * 1000,
    priority: 16,
    message: { type: 'template', templates: MESSAGE_TEMPLATES['intention-reminder'] },
  },
  // ── A3 微进展叙述：启动时检查每周节奏（localStorage 同步可读） ──
  {
    id: 'progress-narrative',
    event: 'app:startup',
    condition: () => {
      try {
        const last = Number(localStorage.getItem(PROGRESS_NARRATIVE_STORAGE_KEY) ?? 0);
        return Date.now() - last >= PROGRESS_NARRATIVE_INTERVAL_MS;
      } catch {
        return false;
      }
    },
    cooldown: 24 * 60 * 60 * 1000,
    priority: 6,
    // 策略声明为 ai_generate（网关个性化）；引擎 MVP 降级为 template + 统计填充
    message: { type: 'ai_generate', prompt: '基于用户本周学习统计生成一段温暖的微进展叙述，突出具体进步数字，不超过两句话。' },
  },
  // ── 课前预习（1.16）：课表触发器在开课前 30 分钟内发射 schedule:class-upcoming；
  // 条件二次确认时间窗（防御钩子提前发射），24h 冷却保证每节课至多提醒一次 ──
  {
    id: 'pre-class-prep',
    event: 'schedule:class-upcoming',
    condition: ctx => (ctx.upcomingClass?.startsInMinutes ?? 31) <= 30,
    cooldown: 24 * 60 * 60 * 1000,
    priority: 10,
    message: { type: 'template', templates: MESSAGE_TEMPLATES['pre-class-prep'] },
  },
  // ── Phase 2: 反直觉发现器 — 每日启动时推送一条反直觉事实 ──
  {
    id: 'counterintuitive-daily',
    event: 'app:startup',
    cooldown: 24 * 60 * 60 * 1000,
    priority: 4,
    message: { type: 'template', templates: MESSAGE_TEMPLATES['counterintuitive-daily'] },
  },
];
