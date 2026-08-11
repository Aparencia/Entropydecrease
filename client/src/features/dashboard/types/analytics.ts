/** @file 学习分析仪表盘聚合数据类型 *
 * @ai-context: dashboard 功能模块：analytics。
 */

/** 五维雷达数据 */
export interface RadarDimension {
  dimension: string;  // 'focus' | 'efficiency' | 'persistence' | 'breadth' | 'activity'
  value: number;      // 0-100 归一化值
  label: string;      // 中文标签
}

/** 热力图单元格（7×24 矩阵） */
export interface HeatmapCell {
  dayOfWeek: number;  // 0=周一 ~ 6=周日
  hour: number;       // 0-23
  value: number;      // 学习强度（分钟数）
  /** D5: 该时段完成率均值 0-1（效率维度，缺省=无样本） */
  efficiency?: number;
  /** D5: 该小时是否为个人黄金时段（rhythmEngine 高峰档） */
  peak?: boolean;
}

/** 趋势数据点 */
export interface TrendPoint {
  date: string;       // ISO date YYYY-MM-DD
  value: number;      // 当日指标值
  label?: string;
}

/** 时段推荐 */
export interface TimeSlotRecommendation {
  dayOfWeek: number;
  hour: number;
  score: number;      // 推荐度 0-100
  reason: string;
}

/** 目标进度（深海珍珠） */
export interface GoalProgress {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  progressPercent: number;  // 0-100
}

/** 聚合结果总类型 */
export interface AnalyticsAggregate {
  radar: RadarDimension[];
  heatmap: HeatmapCell[];
  trend: TrendPoint[];
  recommendations: TimeSlotRecommendation[];
  period: { start: string; end: string };
  goals: GoalProgress[];
  /** 本周回顾摘要（复习及时率/掌握度变化/对比上周） */
  weekly: WeeklySummary;
  /** 心流通道（挑战-技能匹配） */
  flow: FlowChannelData;
  /** 1.14 D3 掌握度钻取数据（L1 课程 / L2 概念） */
  drill: MasteryDrillData;
}

/** 本周回顾摘要 */
export interface WeeklySummary {
  weekStart: string;       // YYYY-MM-DD
  weekEnd: string;         // YYYY-MM-DD
  totalMinutes: number;    // 本周学习分钟（番茄钟+折算）
  prevTotalMinutes: number; // 上周学习分钟（对比）
  noteCount: number;       // 本周结礁数
  reviewCount: number;     // 本周复习次数
  feynmanCount: number;    // 本周费曼次数
  /** 1.11 上周费曼次数（费曼趋势对比基线，D1 成长叙事） */
  prevFeynmanCount: number;
  focusRate: number;       // 本周番茄完成率 0-100
  reviewTimeliness: number | null; // 复习及时率 0-100（null=样本不足）
  masteryDelta: number | null;     // 掌握度变化（本周 vs 上周平均间隔天数，null=样本不足）
}

/** 心流通道单元格（挑战×技能 3×3 矩阵） */
export interface FlowCell {
  challenge: 'low' | 'medium' | 'high';
  skill: 'low' | 'medium' | 'high';
  count: number;
}

/** 心流通道数据（挑战-技能匹配分析） */
export interface FlowChannelData {
  cells: FlowCell[];
  /** 可读洞察建议（一句话） */
  insight: string;
}

/**
 * 掌握度钻取数据（1.14 D3 增强）
 * 层级：L0 五维总览 → L1 课程 → L2 概念。
 * 节点复用 RadarDimension 形状：dimension=实体名（课程/概念），value=掌握度 0-100。
 */
export interface MasteryDrillData {
  /** L1：按雷达维度键出的课程列表（dimension=课程名） */
  coursesByDimension: Record<string, RadarDimension[]>;
  /** L2：按课程名键出的概念列表（dimension=概念名） */
  conceptsByCourse: Record<string, RadarDimension[]>;
}
