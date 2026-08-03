/**
 * 苏格拉底对话评估薄弱维度聚合工具
 *
 * @ai-context: E4 苏格拉底-费曼数据互通工具函数。遍历对话各轮评估维度，
 * 收集分数低于阈值的维度（每个维度取最低分），生成薄弱点文本条目，
 * 供 useSocraticFlow 保存笔记时写入费曼薄弱点。
 */
import type { DimensionScore } from '../types';

/** 低于此分数（0-10）的维度视为薄弱点 */
export const WEAK_DIMENSION_THRESHOLD = 6;

const DIMENSION_LABELS: Record<keyof DimensionScore, string> = {
  accuracy: '准确度',
  completeness: '完整度',
  logic: '逻辑清晰度',
  expression: '表达通俗度',
};

/**
 * 聚合多轮评估中得分低于阈值的维度
 * @param rounds 包含可选 dimensions 的对话轮次数组
 * @returns 薄弱点文本列表（每维度一条，取该维度最低分）
 */
export function collectWeakDimensions(rounds: Array<{ dimensions?: DimensionScore }>): string[] {
  const weakest = new Map<keyof DimensionScore, number>();
  for (const r of rounds) {
    if (!r.dimensions) continue;
    for (const key of Object.keys(r.dimensions) as (keyof DimensionScore)[]) {
      const score = r.dimensions[key];
      if (score < WEAK_DIMENSION_THRESHOLD && (!weakest.has(key) || score < weakest.get(key)!)) {
        weakest.set(key, score);
      }
    }
  }
  return [...weakest.entries()].map(([key, score]) => `${DIMENSION_LABELS[key]}不足（${score}/10）`);
}
