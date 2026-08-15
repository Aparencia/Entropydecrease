/**
 * 苏格拉底四维评估标签（自 SocraticFeedback.tsx 拆出）
 *
 * @ai-context: 维度标签 DIMENSION_LABELS 为展示契约，与网关评估维度对齐；
 * 从组件文件移出（react-refresh：组件文件只导出组件），雷达图/反馈卡片组件
 * 保留在原文件。
 */
import type { DimensionScore } from '../types';

export const DIMENSION_LABELS: Record<keyof DimensionScore, string> = {
  accuracy: '准确度',
  completeness: '完整度',
  logic: '逻辑清晰',
  expression: '表达通俗',
};
