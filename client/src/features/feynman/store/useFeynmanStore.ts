/**
 * 费曼学习状态仓库（组合入口）
 *
 * @ai-context: 2026-07 拆分——类型/工具在 feynmanStoreTypes、会话 CRUD 在
 * feynmanNoteSlice、四步流程/薄弱点/闪卡转化在 feynmanStepSlice；本文件
 * 仅组合 slice 与初始状态。旧导入路径（useFeynmanStore/FeynmanNoteView）
 * 全兼容。
 */
import { create } from 'zustand';
import type { FeynmanState } from './feynmanStoreTypes';
import { createNoteSlice } from './feynmanNoteSlice';
import { createStepSlice } from './feynmanStepSlice';

export const useFeynmanStore = create<FeynmanState>((set, get, store) => ({
  // ── 初始数据 ──
  notes: [],
  summaries: {},
  weakPoints: {},
  currentNoteId: null,
  isLoading: false,
  error: null,

  // ── slices ──
  ...createNoteSlice(set, get, store),
  ...createStepSlice(set, get, store),
}));

// ─── 向后兼容 re-export ──────────────────────────────────────────────────────

export type { FeynmanNoteView, FeynmanState } from './feynmanStoreTypes';
