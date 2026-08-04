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
}
