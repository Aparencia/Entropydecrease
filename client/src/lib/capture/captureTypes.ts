/**
 * 采集模块核心类型定义
 * 用于混合方案的事件驱动异步流水线架构
 */

// 采集事件类型
export type CaptureEventType = 'screenshot' | 'audio_chunk' | 'ui_text' | 'extracted' | 'error';

/**
 * @ai-context Path B 智能模式 / Path C 全录制的采集路径标识
 * fine = 原有逐帧流水线模式，smart = 轻量关键帧+VAD模式，full_record = 全程录制（预留）
 */
export type CapturePath = 'fine' | 'smart' | 'full_record';

// 采集管道消息（在采集层和处理层之间传递）
export interface PipelineMessage<T = unknown> {
  id: string;
  type: CaptureEventType;
  timestamp: number;           // 单调递增时间戳（ms）
  sessionId: string;
  data: T;
  metadata?: Record<string, unknown>;
}

// 截图数据
export interface ScreenshotData {
  imageBuffer: ArrayBuffer;    // PNG 图片数据
  width: number;
  height: number;
  hasChanged: boolean;         // 变化检测结果
  changeScore?: number;        // 变化分数 (0-1)
}

// 音频块数据
export interface AudioChunkData {
  audioBuffer: ArrayBuffer;    // PCM 音频数据
  sampleRate: number;
  channels: number;
  durationMs: number;          // 音频块时长
}

// UI 文本数据
export interface UITextData {
  text: string;
  source: string;              // 来源窗口/元素
  elementPath?: string;        // UI 元素路径
}

// 提取结果（OCR/ASR/AI 处理后）
export interface ExtractionResult {
  text: string;
  confidence: number;          // 0-1
  source: 'vision' | 'audio' | 'ui_automation';
  model?: string;              // 使用的模型名称
  processingTimeMs: number;
  structured?: Record<string, unknown>;  // 结构化数据（如 LaTeX 公式、图表描述）
}

// Worker 处理器接口
export interface PipelineWorker {
  name: string;
  canProcess(message: PipelineMessage): boolean;
  process(message: PipelineMessage): Promise<ExtractionResult | null>;
  dispose(): void;
}

// 采集会话状态
export type SessionStatus = 'idle' | 'capturing' | 'processing' | 'paused' | 'error';

// 采集会话
export interface CaptureSession {
  id: string;
  status: SessionStatus;
  config: CaptureSessionConfig;
  startedAt: number;
  messageCount: number;
  processedCount: number;
  errorCount: number;
  /** @ai-context Path B 智能模式采集到的关键帧+音频段+时间轴汇总 */
  bundle?: SessionBundle;
  /** @ai-context Path C 全程录制产出的视频文件信息 */
  videoRecording?: VideoRecording;
}

// 采集会话配置
export interface CaptureSessionConfig {
  windowId: string;
  windowTitle: string;
  screenshotInterval: number;  // 截图间隔 ms
  audioEnabled: boolean;
  language: string;
  autoInsert: boolean;
  /** @ai-context 采集路径选择，默认 'fine' 走原有流水线 */
  path?: CapturePath;
  /** @ai-context 课程元数据，用于分析时注入 Prompt 提升术语识别率 */
  courseMeta?: CourseMeta;
  /** 现场课程场景：启用麦克风采集（与系统环回互斥） */
  microphone?: boolean;
}

/**
 * @ai-context 课程上下文元数据
 * 四级降级策略：用户手动 > 窗口标题匹配 > AI 识别 > 自定义术语表
 */
export interface CourseMeta {
  courseName?: string;      // 课程名称
  subject?: string;         // 学科（math/physics/cs/english/other）
  customTerms?: string[];   // 自定义术语列表
  detectedBy?: 'manual' | 'window_title' | 'ai';  // 来源标识
}

// 可捕获窗口信息（screen_list_windows 返回）
export interface WindowInfo {
  id: string;
  title: string;
  thumbnail?: string;          // base64 缩略图
  score?: number;              // 推荐分数（关键词匹配）
  matched?: string;            // 命中的关键词（用于显示推荐理由）
}

// 提取片段（UI 展示用）
export interface ExtractedSegment {
  id: string;
  timestamp: number;
  source: 'vision' | 'audio' | 'ui_automation';
  text: string;
  confidence: number;
}

// 采集模式
export type CaptureMode = 'vision' | 'audio' | 'mixed';

// 侧边栏 UI 配置
export interface CaptureSidebarConfig {
  screenshotInterval: number;  // 截图间隔 ms
  language: 'zh' | 'en' | 'mixed';
  autoInsert: boolean;
  mode: CaptureMode;
}

// ================================================================
// Path B 智能模式类型
// ================================================================

/** @ai-context 智能采样器筛选出的关键帧，用于替代逐帧处理 */
export interface KeyFrame {
  id: string;
  timestamp: number;
  imageBase64: string;
  changeType: 'slide_change' | 'writing' | 'scene_change' | 'periodic';
  /** 图片本地持久化后的可渲染 URL（keyframe:// 协议），保存失败时缺省 */
  fileUrl?: string;
}

/** @ai-context VAD 标记器切出的语音段，含编码后的音频数据，支持流式 ASR 转写 */
export interface AudioSegment {
  id: string;
  timestampStart: number;
  timestampEnd: number;
  audioBase64: string;
  energy: number;
  /** 流式 ASR 转写结果（课堂进行中即时填充，无需课后批量转写）——已应用热词替换的文本，供下游笔记/问答/闪卡消费 */
  audioText?: string | null;
  /** 原始 ASR 转写文本（热词替换前），保真溯源用 */
  audioTextRaw?: string | null;
}

/** @ai-context 全局时间轴条目，串联关键帧和语音段供后续分析回放 */
export interface TimelineEntry {
  timestamp: number;
  type: 'keyframe' | 'voice_start' | 'voice_end' | 'silence' | 'bookmark' | 'auto_anchor';
  refId?: string;
  energy?: number;
  /** bookmark/auto_anchor 类型时的标注文本（可选） */
  label?: string;
}

/** @ai-context 一次智能模式会话的完整数据汇总 */
export interface SessionBundle {
  keyframes: KeyFrame[];
  audioSegments: AudioSegment[];
  timeline: TimelineEntry[];
  duration: number;
}

// ================================================================
// Path C 全录制模式类型（预留）
// ================================================================

/** @ai-context 全程录制产出的视频文件元数据 */
export interface VideoRecording {
  filePath: string;
  duration: number;
  fileSizeBytes: number;
  format: 'webm' | 'mp4';
  hasAudio: boolean;
}

/** @ai-context 全程录制实时状态，主进程通过 IPC 定期推送给渲染进程 */
export interface RecordingStatus {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  fileSizeBytes: number;
  filePath: string | null;
}
