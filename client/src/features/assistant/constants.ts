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

// ── 行为信号（A1 情绪感知 / A5 认知负荷） ──────────────────

/** 行为采样窗口（ms）：滚动统计打字/切换信号的时长 */
export const BEHAVIOR_WINDOW_MS = 2 * 60 * 1000;
/** 行为信号评估周期（ms）：多久基于窗口数据评估一次情绪/负荷 */
export const BEHAVIOR_EVAL_INTERVAL_MS = 30 * 1000;
/** 打字速度骤降比例：当前窗口击键速率低于基线的比例（A1 轻度信号） */
export const TYPING_DROP_RATIO = 0.4;
/** 删除键占比阈值：窗口内退格/删除占总击键比例（A1 中度信号） */
export const DELETE_KEY_RATIO = 0.3;
/** 重度停滞阈值（ms）：有输入焦点但完全无键入的时长（A1 重度信号） */
export const STAGNATION_THRESHOLD_MS = 8 * 60 * 1000;
/** 认知负荷 EMA 平滑系数（越小越平滑） */
export const LOAD_EMA_ALPHA = 0.3;
/** 认知负荷高阈值：越过即发射 cognitive:overload */
export const LOAD_HIGH_THRESHOLD = 70;
/** 认知负荷回落阈值：降至此值以下才允许再次触发（迟滞防抖） */
export const LOAD_RECOVER_THRESHOLD = 50;
/** 认知负荷信号：窗口内路由/页面切换次数上限（超过视为高频切换） */
export const SWITCH_BURST_COUNT = 6;
/** 认知负荷信号：编辑爆发比达到此值即视为高负荷持续输出（burstScore 记满分） */
export const EDIT_BURST_RATIO = 0.7;

// ── A3 微进展叙述 ──────────────────────────────────────────

/** 上次叙述时间戳的 localStorage 键 */
export const PROGRESS_NARRATIVE_STORAGE_KEY = 'assistant_progress_narrative_at';
/** 叙述节奏：每 7 天一次 */
export const PROGRESS_NARRATIVE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// ── A2 语音对话 ────────────────────────────────────────────────

/** 语音拾音块时长（ms）：与课堂 smart 采集真流式一致 */
export const VOICE_CHUNK_DURATION_MS = 400;
/** 语音拾音静音超时（ms）：持续无声自动停止，避免忘关麦克风 */
export const VOICE_SILENCE_TIMEOUT_MS = 6 * 1000;

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

// ── 水母漫游 ──────────────────────────────────────────────────

/** 漫游目标点选取间隔（ms）：每 10-18s 随机 */
export const WANDER_INTERVAL_MIN_MS = 10000;
export const WANDER_INTERVAL_MAX_MS = 18000;
/** 漫游移动时长（ms） */
export const WANDER_DURATION_MIN_MS = 6000;
export const WANDER_DURATION_MAX_MS = 10000;
/** 拖拽后恢复漫游的延迟（ms） */
export const WANDER_RESUME_DELAY_MS = 5000;
/** 漫游活动区域（视口百分比范围） */
export const WANDER_BOUNDS = { xMin: 0.05, xMax: 0.85, yMin: 0.15, yMax: 0.8 };
/** 水母位置持久化键 */
export const CREATURE_POS_STORAGE_KEY = 'assistant_creature_pos';

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
