/**
 * AI Hooks — 统一导出入口
 *
 * 本文件为 barrel export，所有 AI Hook 均从 hooks/ 目录 re-export。
 * 使用方可直接 import from 'lib/ai/useAI' 而无需修改路径。
 *
 * 新增 Hook（v0.9.0+）：
 * - useAIAnchorPoint   记忆锚点生成
 * - useAISocratic      苏格拉底式学习（brainstorm + question）
 * - useAIPredict       学习预测
 * - useAIRescue        卡壳三级救援
 *
 * @ai-context: legacy Hook：早期 AI 调用入口，新代码使用 hooks/ 下的分功能 Hook。
 */

// ── 已有 Hook ────────────────────────────────────────────────
export { useAISummarize } from './hooks/useAISummarize';
export { useAIFlashcards } from './hooks/useAIFlashcards';
export { useAIEvaluate } from './hooks/useAIEvaluate';
export { useAIDuration } from './hooks/useAIDuration';
export { useAITagContent } from './hooks/useAITagContent';
export { useAIOptimizeCard } from './hooks/useAIOptimizeCard';
export { useAIFeynmanQuestion } from './hooks/useAIFeynmanQuestion';
export { useAIFeynmanEvaluateAnswers } from './hooks/useAIFeynmanEvaluateAnswers';
export { useAISortInspiration } from './hooks/useAISortInspiration';

// ── v0.9.0 新增 Hook ────────────────────────────────────────
export { useAIPredict } from './hooks/useAIPredict';
export { useAIRescue } from './hooks/useAIRescue';

// ── 工厂与工具 Hook ───────────────────────────────────────
export { useAIFeature } from './hooks/useAIFeature';
export { useAIErrorHandler } from './hooks/useAIErrorHandler';
export type { AIState } from './hooks/types';
