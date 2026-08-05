/**
 * AI 深海学伴助手 — 类型定义
 *
 * @ai-context: 助手模块全部共享类型——消息、会话、触发规则、音频偏好；
 * 前后端字段映射：前端 camelCase ↔ 网关 snake_case 在 chatHandler 中转换。
 */

// ── 消息 ──────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageContentType = 'text' | 'action_card' | 'suggestion';

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  contentType: MessageContentType;
  /** 主动触发来源标记 */
  trigger?: ProactiveTriggerType;
  tokensUsed?: number;
  model?: string;
  latencyMs?: number;
  createdAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
  metadata?: string;
}

// ── 主动触发 ──────────────────────────────────────────────────

export type ProactiveTriggerType =
  | 'greeting-startup'
  | 'greeting-return'
  | 'session-summary'
  | 'idle-nudge'
  | 'review-reminder'
  | 'bedtime-review'
  | 'commit-dive'
  | 'stuck-incubation'
  | 'emotion-mild'
  | 'emotion-moderate'
  | 'emotion-deep'
  | 'cognitive-overload'
  | 'intention-reminder'
  | 'progress-narrative';

export type AppEventType =
  | 'app:startup'
  | 'session:end'
  | 'user:idle'
  | 'user:active'
  | 'user:return'
  | 'review:due'
  | 'review:bedtime'
  | 'achievement:unlocked'
  | 'emotion:struggle'
  | 'cognitive:overload'
  | 'stuck:incubation'
  | 'intention:due';

/** A1 情绪困扰分级：1 轻度（打字放缓）/ 2 中度（反复修改）/ 3 重度（长时间停滞） */
export type EmotionLevel = 1 | 2 | 3;

export type MessageStrategy =
  | { type: 'template'; templates: string[] }
  | { type: 'ai_generate'; prompt: string };

export interface ProactiveRule {
  id: ProactiveTriggerType;
  event: AppEventType;
  condition?: (ctx: TriggerContext) => boolean;
  cooldown: number;
  priority: number;
  message: MessageStrategy;
}

export interface TriggerContext {
  /** 距上次打开的天数 */
  daysSinceLastVisit?: number;
  /** 本次学习时长（分钟） */
  sessionMinutes?: number;
  /** 到期闪卡数 */
  dueCardCount?: number;
  /** 当前小时 */
  currentHour: number;
  /** A5 认知负荷估算值（0-100），cognitive:overload 事件携带 */
  loadLevel?: number;
  /** A1 情绪困扰分级，emotion:struggle 事件携带 */
  emotionLevel?: EmotionLevel;
  /** T4 卡壳来源模块，stuck:incubation 事件携带 */
  stuckSource?: 'note' | 'feynman';
  /** A4 到期实施意图 ID，intention:due 事件携带 */
  intentionId?: string;
  /** F3 睡前复习目标牌组（到期卡最多），review:bedtime 事件携带 */
  topDeckId?: string;
}

// ── 音频 ──────────────────────────────────────────────────────

export interface AudioPreferences {
  enabled: boolean;
  soundEffects: boolean;
  ttsEnabled: boolean;
  volume: number;
}

// ── 助手偏好（设置页持久化） ──────────────────────────────────

export interface AssistantPreferences {
  enabled: boolean;
  audio: AudioPreferences;
  proactiveEnabled: boolean;
  quietHoursStart: number; // 0-23
  quietHoursEnd: number;   // 0-23
}

// ── 水母状态 ──────────────────────────────────────────────────

export type CreatureState = 'idle' | 'alerting' | 'speaking' | 'listening' | 'resting';

// ── 面板状态 ──────────────────────────────────────────────────

export type PanelState = 'hidden' | 'bubble' | 'expanded';
