/**
 * 主动触发规则定义表
 *
 * @ai-context: MVP 5 条规则——冷却/优先级/策略声明式定义；
 * ProactiveEngine 按此表匹配事件并决定是否触发。
 * 设计原则：觉察 > 管控——所有规则均可被用户关闭，忽略即退让。
 */
import type { ProactiveRule } from '../types';
import { MESSAGE_TEMPLATES } from './messageTemplates';

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
    cooldown: 24 * 60 * 60 * 1000,
    priority: 20,
    message: { type: 'ai_generate', prompt: '用户多日未打开应用后回归，生成一句温暖的欢迎语，提及"回来就好"的正向态度，不超过两句话。' },
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
];
