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
  mode: 'class' | 'self_study';  // 上课模式 / 自习模式
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
}

// 番茄目标记忆
export interface PomodoroGoal {
  id: string;
  text: string;           // 目标文字
  useCount: number;       // 使用次数（用于排序）
  lastUsedAt: Date;
}
