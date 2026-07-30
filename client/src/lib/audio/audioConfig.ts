/**
 * @ai-context 熵减音效系统分为 6 个独立类别（操作/成就/AI/深潜/界面/反馈），
 * 每个类别可单独控制开关和音量。全局静音覆盖所有类别。
 * 音效配置持久化到 settingsStore（localStorage）。
 * 白噪音/BGM 为独立音频系统，由 useAudioPlayer 管理。
 */

/* ── 音效分类系统 ──────────────────────────────────── */

/** 音效类别枚举 */
export type SoundCategory = 'operation' | 'achievement' | 'ai' | 'pomodoro' | 'ui' | 'feedback';

/** 单个音效定义 */
export interface SoundDefinition {
  id: string;
  name: string;
  category: SoundCategory;
  filePath: string;
}

/** 单个类别的音效设置 */
export interface CategorySoundSettings {
  enabled: boolean;
  /** 音量 0-100 */
  volume: number;
}

/** 全局音效设置 */
export interface SoundSettings {
  masterMute: boolean;
  categories: Record<SoundCategory, CategorySoundSettings>;
}

/** 音效类别显示名称映射 */
export const CATEGORY_LABELS: Record<SoundCategory, string> = {
  operation: '操作音效',
  achievement: '成就音效',
  ai: 'AI 音效',
  pomodoro: '深潜音效',
  ui: '界面音效',
  feedback: '反馈音效',
};

/** 音效类别描述映射 */
export const CATEGORY_DESCRIPTIONS: Record<SoundCategory, string> = {
  operation: '截图、结礁保存、卡片翻转等交互反馈',
  achievement: '打卡、成就解锁等激励反馈',
  ai: 'AI 分析完成等智能功能提示',
  pomodoro: '深潜启停、计时提醒',
  ui: '按钮、开关、弹窗、导航等界面交互提示',
  feedback: '成功、失败、删除、数据操作等结果反馈',
};

/** 默认音效设置 */
export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  masterMute: false,
  categories: {
    operation: { enabled: true, volume: 80 },
    achievement: { enabled: true, volume: 80 },
    ai: { enabled: true, volume: 70 },
    pomodoro: { enabled: true, volume: 80 },
    ui: { enabled: true, volume: 50 },
    feedback: { enabled: true, volume: 75 },
  },
};

/** localStorage 持久化键 */
export const SOUND_SETTINGS_KEY = 'kb_sound_settings';

/** 音效清单 — 所有可用音效文件，按类别分组 */
export const SOUND_DEFINITIONS: SoundDefinition[] = [
  // 操作音效
  { id: 'capture_start', name: '截图开始', category: 'operation', filePath: '/sounds/capture_start.wav' },
  { id: 'capture_stop', name: '截图结束', category: 'operation', filePath: '/sounds/capture_stop.wav' },
  { id: 'note_autosave', name: '结礁自动保存', category: 'operation', filePath: '/sounds/note_autosave.wav' },
  { id: 'note_manual_save', name: '结礁手动保存', category: 'operation', filePath: '/sounds/note_manual_save.wav' },
  { id: 'card_flip', name: '卡片翻转', category: 'operation', filePath: '/sounds/card_flip.wav' },
  { id: 'daily_checkin', name: '每日打卡', category: 'operation', filePath: '/sounds/daily_checkin.wav' },
  { id: 'feynman_record_start', name: '浮出水面录音开始', category: 'operation', filePath: '/sounds/feynman_record_start.wav' },
  { id: 'feynman_record_stop', name: '浮出水面录音结束', category: 'operation', filePath: '/sounds/feynman_record_stop.wav' },

  // 成就音效
  { id: 'achievement_unlocked', name: '成就解锁', category: 'achievement', filePath: '/sounds/achievement_unlocked.wav' },
  { id: 'deck_complete', name: '卡组完成', category: 'achievement', filePath: '/sounds/deck_complete.wav' },
  { id: 'feynman_complete', name: '浮出水面完成', category: 'achievement', filePath: '/sounds/feynman_complete.wav' },

  // AI 音效
  { id: 'ai_analysis_done', name: 'AI 分析完成', category: 'ai', filePath: '/sounds/ai_analysis_done.wav' },
  { id: 'feynman_weak_point', name: '浮出水面薄弱点', category: 'ai', filePath: '/sounds/feynman_weak_point.wav' },

  // 深潜音效
  { id: 'pomodoro_start', name: '深潜开始', category: 'pomodoro', filePath: '/sounds/pomodoro_start.wav' },
  { id: 'pomodoro_pause', name: '深潜暂停', category: 'pomodoro', filePath: '/sounds/pomodoro_pause.wav' },
  { id: 'pomodoro_tick_final', name: '深潜最终滴答', category: 'pomodoro', filePath: '/sounds/pomodoro_tick_final.wav' },
  { id: 'pomodoro_5min_warning', name: '5分钟提醒', category: 'pomodoro', filePath: '/sounds/pomodoro_5min_warning.wav' },
  { id: 'pomodoro_work_complete', name: '工作完成', category: 'pomodoro', filePath: '/sounds/pomodoro_work_complete.wav' },
  { id: 'pomodoro_break_end', name: '休息结束', category: 'pomodoro', filePath: '/sounds/pomodoro_break_end.wav' },
  { id: 'pomodoro_complete', name: '整轮完成', category: 'pomodoro', filePath: '/sounds/pomodoro_complete.wav' },
  { id: 'rate_remember', name: '评分-记得', category: 'pomodoro', filePath: '/sounds/rate_remember.wav' },
  { id: 'rate_fuzzy', name: '评分-模糊', category: 'pomodoro', filePath: '/sounds/rate_fuzzy.wav' },
  { id: 'rate_forgot', name: '评分-忘记', category: 'pomodoro', filePath: '/sounds/rate_forgot.wav' },
  // 仪式呼吸引导音（v0.26.0 A2.3）
  { id: 'ritual_breath_inhale', name: '仪式-吸气', category: 'pomodoro', filePath: '/sounds/ritual_breath_inhale.wav' },
  { id: 'ritual_breath_hold', name: '仪式-屏息', category: 'pomodoro', filePath: '/sounds/ritual_breath_hold.wav' },
  { id: 'ritual_breath_exhale', name: '仪式-呼气', category: 'pomodoro', filePath: '/sounds/ritual_breath_exhale.wav' },
  { id: 'ritual_breath_cycle', name: '仪式-圈满', category: 'pomodoro', filePath: '/sounds/ritual_breath_cycle.wav' },

  // 界面音效
  { id: 'ui_click', name: '通用点击', category: 'ui', filePath: '/sounds/ui_click.wav' },
  { id: 'ui_toggle_on', name: '开关开启', category: 'ui', filePath: '/sounds/ui_toggle_on.wav' },
  { id: 'ui_toggle_off', name: '开关关闭', category: 'ui', filePath: '/sounds/ui_toggle_off.wav' },
  { id: 'ui_modal_open', name: '弹窗打开', category: 'ui', filePath: '/sounds/ui_modal_open.wav' },
  { id: 'ui_modal_close', name: '弹窗关闭', category: 'ui', filePath: '/sounds/ui_modal_close.wav' },
  { id: 'ui_tab_switch', name: '标签切换', category: 'ui', filePath: '/sounds/ui_tab_switch.wav' },
  { id: 'ui_nav_switch', name: '导航切换', category: 'ui', filePath: '/sounds/ui_nav_switch.wav' },
  { id: 'ui_hover_3d', name: '3D 悬停', category: 'ui', filePath: '/sounds/ui_hover_3d.wav' },
  { id: 'ui_module_enter', name: '模块进入', category: 'ui', filePath: '/sounds/ui_module_enter.wav' },
  { id: 'ui_drag_start', name: '拖拽开始', category: 'ui', filePath: '/sounds/ui_drag_start.wav' },
  { id: 'ui_drop', name: '拖拽放下', category: 'ui', filePath: '/sounds/ui_drop.wav' },

  // 反馈音效
  { id: 'feedback_success', name: '操作成功', category: 'feedback', filePath: '/sounds/feedback_success.wav' },
  { id: 'feedback_error', name: '操作失败', category: 'feedback', filePath: '/sounds/feedback_error.wav' },
  { id: 'feedback_warning', name: '警告提示', category: 'feedback', filePath: '/sounds/feedback_warning.wav' },
  { id: 'feedback_delete', name: '删除完成', category: 'feedback', filePath: '/sounds/feedback_delete.wav' },
  { id: 'data_export', name: '数据导出', category: 'feedback', filePath: '/sounds/data_export.wav' },
  { id: 'data_import', name: '数据导入', category: 'feedback', filePath: '/sounds/data_import.wav' },
  { id: 'data_cleared', name: '数据清除', category: 'feedback', filePath: '/sounds/data_cleared.wav' },
  { id: 'sync_complete', name: '同步完成', category: 'feedback', filePath: '/sounds/sync_complete.wav' },
];

/**
 * 按类别筛选音效定义
 * @param category - 音效类别
 * @returns 该类别下的所有音效定义
 */
export function getSoundsByCategory(category: SoundCategory): SoundDefinition[] {
  return SOUND_DEFINITIONS.filter((s) => s.category === category);
}

/**
 * 根据音效 ID 查找定义
 * @param soundId - 音效 ID
 * @returns 音效定义，未找到返回 undefined
 */
export function findSoundDefinition(soundId: string): SoundDefinition | undefined {
  return SOUND_DEFINITIONS.find((s) => s.id === soundId);
}

/* ── 白噪音 / BGM 系统（独立于音效分类） ──────────── */

export interface AudioTrack {
  id: string;
  name: string;
  nameZh: string;
  src: string;
  category: 'white_noise' | 'bgm';
}

export const audioTracks: AudioTrack[] = [
  { id: 'rain', name: 'Rain', nameZh: '雨声', src: '/audio/rain.mp3', category: 'white_noise' },
  { id: 'cafe', name: 'Cafe', nameZh: '咖啡厅', src: '/audio/cafe.mp3', category: 'white_noise' },
  { id: 'forest', name: 'Forest', nameZh: '森林', src: '/audio/forest.mp3', category: 'white_noise' },
  { id: 'waves', name: 'Waves', nameZh: '海浪', src: '/audio/waves.mp3', category: 'white_noise' },
  { id: 'piano', name: 'Piano', nameZh: '钢琴曲', src: '/audio/piano.mp3', category: 'bgm' },
  { id: 'ambient', name: 'Ambient', nameZh: '轻音乐', src: '/audio/ambient.mp3', category: 'bgm' },
];

export const AUDIO_PREFS_KEY = 'kb_audio_preferences';

export interface AudioPreferences {
  whiteNoiseEnabled: boolean;
  whiteNoiseTrackId: string;
  whiteNoiseVolume: number;
  bgmEnabled: boolean;
  bgmTrackId: string;
  bgmVolume: number;
}

export const defaultAudioPreferences: AudioPreferences = {
  whiteNoiseEnabled: false,
  whiteNoiseTrackId: 'rain',
  whiteNoiseVolume: 0.5,
  bgmEnabled: false,
  bgmTrackId: 'piano',
  bgmVolume: 0.3,
};

export function loadAudioPreferences(): AudioPreferences {
  try {
    const saved = localStorage.getItem(AUDIO_PREFS_KEY);
    if (saved) return { ...defaultAudioPreferences, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return defaultAudioPreferences;
}

export function saveAudioPreferences(prefs: AudioPreferences): void {
  try { localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}
