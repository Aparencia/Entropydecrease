/**
 * 主动触发预设模板库
 *
 * @ai-context: 模板消息——离线可用、零延迟；随机选取实现"可变 > 固定"设计原则，
 * 对抗多巴胺适应（固定文案快速失效）。ai_generate 类型在 MVP 中降级为 template。
 */
import type { ProactiveTriggerType } from '../types';

export const MESSAGE_TEMPLATES: Record<ProactiveTriggerType, string[]> = {
  'greeting-startup': [
    '欢迎回来，准备好今天的深潜了吗？🌊',
    '又见面了！今天想探索什么新知识？',
    '嗨，你的学习空间已经准备好了。',
  ],
  'greeting-return': [
    '好久不见！回来就好，我们慢慢来。',
    '欢迎回到深海，这里一直为你留着光。',
  ],
  'session-summary': [
    '这轮专注结束了，做得不错！休息一下吧。',
    '又完成一段深潜，你的坚持很有力量。',
  ],
  'idle-nudge': [
    '需要休息一下，还是换个方式继续？',
    '有时候换个角度，答案就浮出水面了。',
    '深呼吸，你已经在做很棒的事了。',
  ],
  'review-reminder': [
    '有几张闪卡到了复习时间，趁记忆还热乎？',
    '间隔重复的最佳时机到了，花几分钟巩固一下？',
  ],
};

/**
 * 从指定触发类型的模板池中随机选取一条
 * @ai-context: 随机选取而非顺序轮播——可变比率强化，防止用户预测文案产生适应
 */
export function pickTemplate(trigger: ProactiveTriggerType): string {
  const list = MESSAGE_TEMPLATES[trigger];
  return list[Math.floor(Math.random() * list.length)];
}
