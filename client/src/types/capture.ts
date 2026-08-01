/**
 * 屏幕/音频采集领域类型
 *
 * @ai-context: 课堂助手"窗口捕获"链路的数据契约。渲染进程 captureManager
 * 与 Electron 主进程 captureHandlers 双侧共用，字段变更必须两侧同步评估。
 * @ai-context: CaptureEvent.data 刻意声明为 unknown（而非 any），消费方必须
 * 按 type 字段判别后收窄具体类型，禁止直接断言。
 * @ai-context: 纯类型文件，无运行时代码，可安全重构。
 */

// 窗口捕获会话
export interface WindowCapture {
  id: string;
  noteId?: string;              // 关联笔记（可选）
  targetWindow: string;         // 目标窗口标题
  mode: 'vision' | 'audio' | 'both';  // 采集模式
  status: 'active' | 'paused' | 'completed';
  segments: ExtractedSegment[]; // 提取的内容片段
  startedAt: Date;
  endedAt?: Date;
  totalDuration?: number;       // 总时长（秒）
}

// 提取的内容片段
export interface ExtractedSegment {
  id: string;
  timestamp: Date;              // 提取时间
  source: 'vision' | 'audio' | 'ui_automation';  // 内容来源
  text: string;                 // 提取的文本内容
  confidence?: number;          // 置信度 (0-1)
  metadata?: SegmentMetadata;   // 附加元数据
}

/**
 * 采集片段独立表行（P2-14）——在 ExtractedSegment 基础上绑定所属会话 ID，
 * 存储于 windowCaptureSegments 表（'id, sessionId, timestamp'）。
 */
export interface WindowCaptureSegment extends ExtractedSegment {
  sessionId: string;            // 所属采集会话 ID
}

// 片段元数据
export interface SegmentMetadata {
  startTime?: number;           // 音频/视频起始时间（秒）
  endTime?: number;             // 音频/视频结束时间（秒）
  imageUrl?: string;            // 关联截图（临时路径）
  language?: string;            // 检测到的语言
  model?: string;               // 使用的 AI 模型
  processingTimeMs?: number;    // 处理耗时（毫秒）
}

// 采集配置
export interface CaptureConfig {
  windowId: string;             // 目标窗口 ID
  windowTitle: string;          // 目标窗口标题
  screenshotInterval: number;   // 截图间隔（毫秒），默认 5000
  mode: 'vision' | 'audio' | 'both';
  autoInsert: boolean;          // 是否自动插入到笔记
  language: string;             // 识别语言，默认 'zh'
}

// 窗口信息
export interface WindowInfo {
  id: string;
  title: string;
  appName?: string;
  isMinimized?: boolean;
}

// 采集事件（用于事件总线通信）
export interface CaptureEvent {
  type: 'screenshot' | 'audio_chunk' | 'ui_text' | 'extracted' | 'error';
  timestamp: number;            // 单调递增时间戳
  data: unknown;                // 事件数据（具体类型由 type 决定，消费方须收窄）
  sessionId: string;
}
