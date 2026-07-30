/**
 * 音视频交叉融合 — 类型与常量
 *
 * @ai-context: VAD 三参数（energyThreshold=0.02/silenceDuration=1500ms/
 * minSpeechDuration=500ms）经真实课堂录音调优，修改会改变语音分段灵敏度。
 * MATH_TERMS 是语音-公式交叉验证的术语字典，按学科领域分组，只增不删。
 * @ai-context: 纯类型与常量，无运行时副作用。
 */

/** VAD 配置 */
export interface VADConfig {
  /** 能量阈值，超过则视为有语音活动，默认 0.02 */
  energyThreshold: number;
  /** 静音持续时长（ms），超过则视为语音结束，默认 1500 */
  silenceDuration: number;
  /** 最短语音时长（ms），低于则忽略，默认 500 */
  minSpeechDuration: number;
}

/** 融合后的片段 */
export interface FusionSegment {
  id: string;
  /** 起始时间戳 */
  startTime: number;
  /** 结束时间戳 */
  endTime: number;
  /** 视觉提取文本 */
  visionText: string;
  /** ASR 转写文本 */
  audioText: string;
  /** 融合后文本 */
  mergedText: string;
  /** 综合置信度 */
  confidence: number;
  /** 是否包含公式 */
  hasFormula: boolean;
  sources: ('vision' | 'audio')[];
}

/** VAD 触发截图事件 */
export interface VADTriggerEvent {
  type: 'vad_triggered';
  timestamp: number;
}

/** 视觉提取结果（融合输入） */
export interface VisionResult {
  timestamp: number;
  text: string;
  confidence: number;
  structured?: Record<string, unknown>;
}

/** ASR 转写结果（融合输入） */
export interface AudioResult {
  timestamp: number;
  text: string;
  confidence: number;
  segments?: Array<{ start: number; end: number; text: string }>;
}

/** 默认 VAD 配置 */
export const DEFAULT_VAD_CONFIG: VADConfig = {
  energyThreshold: 0.02,
  silenceDuration: 1500,
  minSpeechDuration: 500,
};

/** 默认融合时间窗口（ms） */
export const DEFAULT_FUSION_WINDOW_MS = 5000;

/** Jaccard 相似度阈值，超过则视为重复 */
export const DEDUP_SIMILARITY_THRESHOLD = 0.75;

/** 数学相关术语，用于语音与公式交叉验证 */
export const MATH_TERMS: string[] = [
  // 代数
  '二次方程', '一元二次', '方程', '导数', '微分', '积分', '极限',
  '级数', '矩阵', '行列式', '向量', '概率', '统计',
  // 几何
  '三角形', '圆', '椭圆', '双曲线', '抛物线', '直线', '平面', '坐标系',
  // 三角函数
  '正弦', '余弦', '正切', '三角函数',
  // 微积分
  '导函数', '反导数', '不定积分', '定积分', '偏导数',
  // LaTeX 关键词
  'frac', 'sqrt', 'int', 'sum', 'lim', 'sin', 'cos', 'tan',
  // 运算
  '求和', '求积', '开根号', '根号', '立方', '平方', '指数', '对数',
];
