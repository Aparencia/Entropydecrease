/**
 * AI 深海学伴助手 — 常量
 *
 * @ai-context: 助手模块全局常量——冷却时间、频率上限、布局尺寸、默认偏好。
 */
import type { AssistantPreferences } from './types';

// ── 主动触发 ──────────────────────────────────────────────────

/** 每小时最大主动触发次数 */
export const MAX_TRIGGERS_PER_HOUR = 2;
/** 连续忽略多少次后当日不再触发 */
export const MAX_CONSECUTIVE_IGNORES = 3;
/** 空闲检测阈值（ms） */
export const IDLE_THRESHOLD_MS = 3 * 60 * 1000;
/** 久别回归阈值（ms）：超过 24h 未打开 */
export const RETURN_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// ── 会话 ──────────────────────────────────────────────────────

/** 会话过期时间（ms）：超过此时间自动新建 */
export const SESSION_EXPIRE_MS = 24 * 60 * 60 * 1000;
/** 面板打开时加载的消息数 */
export const HISTORY_PAGE_SIZE = 50;
/** 发送给网关的上下文窗口（轮数） */
export const CONTEXT_WINDOW_ROUNDS = 20;

// ── 布局 ──────────────────────────────────────────────────────

export const CREATURE_SIZE_IDLE = 64;
export const CREATURE_SIZE_PANEL = 48;
export const PANEL_WIDTH = 380;

// ── 默认偏好 ──────────────────────────────────────────────────

export const DEFAULT_PREFERENCES: AssistantPreferences = {
  enabled: true,
  audio: {
    enabled: true,
    soundEffects: true,
    ttsEnabled: false,
    volume: 0.7,
  },
  proactiveEnabled: true,
  quietHoursStart: 22,
  quietHoursEnd: 8,
};

// ── 存储键 ────────────────────────────────────────────────────

export const PREFS_STORAGE_KEY = 'assistant_preferences';

// ── 网关端点 ──────────────────────────────────────────────────

export const CHAT_STREAM_ENDPOINT = '/api/v1/ai/chat/stream';
