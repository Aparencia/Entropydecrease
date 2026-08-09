/**
 * 番茄钟领域类型
 *
 * @ai-context: 时长字段单位约定（易错点）：PomodoroSession.duration /
 * actualDuration 单位为【秒】；PomodoroSettings.workDuration /
 * shortBreakDuration / longBreakDuration / classDuration 单位为【分钟】。
 * 换算逻辑散布在计时器 Hook 中，修改任一字段单位都会破坏历史数据统计。
 * @ai-context: 纯类型文件，无运行时代码，可安全重构。
 */

// 番茄钟会话记录
export interface PomodoroSession {
  id: string;
  mode: 'class' | 'self_study';  // 上课模式 / 自习模式（兼容旧数据）
  presetId?: string;             // 关联预设 ID（v0.28+，可选兼容）
  subject?: string;              // 科目（可选）
  duration: number;              // 计划时长（秒）
  actualDuration: number;        // 实际专注时长（秒）
  completedAt: Date;             // 完成时间
  interrupted: boolean;          // 是否中断
  goal?: string;                 // 本次番茄目标（可选）
}

// 番茄钟配置
export interface PomodoroSettings {
  id: string;
  workDuration: number;          // 工作时长（分钟），默认 25
  shortBreakDuration: number;    // 短休息（分钟），默认 5
  longBreakDuration: number;     // 长休息（分钟），默认 15
  longBreakInterval: number;     // 几个番茄后长休息，默认 4
  autoStartBreak: boolean;       // 自动开始休息
  autoStartWork: boolean;        // 自动开始下一个番茄
  soundEnabled: boolean;         // 声音提醒
  notificationEnabled: boolean;  // 浏览器通知
  classDuration: number;         // 上课模式课堂时长（分钟），默认 45
  // ── v0.28 预设自定义扩展（全部可选，缺省走默认值） ──
  activePresetId?: string;       // 记住上次选择的预设
  warningMinutes?: number;       // 预警时点（分钟），0=关闭，默认 5
  tickFinalEnabled?: boolean;    // 最后 10 秒滴答开关，默认 true
  completionSoundId?: string;    // 完成音音色 ID
  warningSoundId?: string;       // 预警音音色 ID
}

/**
 * 番茄模式预设（v0.28 新增）
 *
 * @ai-context: longBreakInterval = 0 统一表达"无长休"（即原上课模式行为），
 * 消除 mode === 'class' 特判。builtin 预设不可删除（"上课""自习"迁移而来）。
 */
export interface PomodoroPreset {
  id: string;
  name: string;              // "刷题" / "背单词"
  icon: string;              // lucide 图标名（如 "PenLine", "BookMarked"）
  workDuration: number;      // 专注时长（分钟）
  shortBreakDuration: number; // 短休（分钟）
  longBreakDuration: number;  // 长休（分钟）
  longBreakInterval: number;  // 几个番茄后长休，0 = 无长休
  silent: boolean;           // 静默模式（跳过全部音效）
  builtin: boolean;          // 内置预设不可删除
  sortOrder: number;         // 排序序号
  createdAt: string;         // ISO 日期字符串
  /** Chronos 粒子气质（深度定制粒子外形；缺省回退 flow，旧数据向后兼容） */
  mood?: Mood;
}

// Chronos 粒子气质（预设绑定，决定时间生物的外形与运动风格）
export type Mood = 'grid' | 'flow' | 'nebula' | 'flame' | 'crystal' | 'torrent';

// 番茄目标记忆
export interface PomodoroGoal {
  id: string;
  text: string;           // 目标文字
  useCount: number;       // 使用次数（用于排序）
  lastUsedAt: Date;
}
