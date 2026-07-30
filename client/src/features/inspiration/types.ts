/**
 * 萤火海沟 — 类型定义
 * @ai-context 灵感捕捉模块的类型层，支撑筛选、标签编辑、AI 分拣及沉浸式视图
 */

import type { InspirationTags } from './store/inspirationStore';

// ─────────────────────────────────────────────────────────────
// 筛选状态
// ─────────────────────────────────────────────────────────────

/** 筛选面板当前选中的过滤条件 @ai-context 用于筛选栏双向绑定与列表过滤逻辑 */
export interface FilterState {
  content_nature: InspirationTags['content_nature'] | null;
  cognitive_depth: InspirationTags['cognitive_depth'] | null;
  subject: string | null;
}

// ─────────────────────────────────────────────────────────────
// 选项类型
// ─────────────────────────────────────────────────────────────

/** 内容性质 / 认知深度选项的统一形状 @ai-context 驱动筛选按钮、标签气泡、编辑弹窗 */
export interface TagOption<V extends string = string> {
  value: V;
  label: string;
  color: string;
  bg: string;
}

// ─────────────────────────────────────────────────────────────
// 分拣状态
// ─────────────────────────────────────────────────────────────

/** AI 分拣结果的视觉配置项 @ai-context 卡片角标展示分拣进度 */
export interface SortStatusEntry {
  label: string;
  icon: import('lucide-react').LucideIcon | null;
  color: string;
  bg: string;
  animate: boolean;
}

/** 分拣类型的视觉配置项 @ai-context 分拣建议面板中每个类型的颜色/标签 */
export interface SortTypeInfo {
  label: string;
  color: string;
  bg: string;
}

// ─────────────────────────────────────────────────────────────
// 沉浸式视图 — 新增
// ─────────────────────────────────────────────────────────────

/** 沉浸式视图阶段状态机 @ai-context 控制灵感卡片进入沉浸式阅读时的动画阶段流转 */
export type ImmersivePhase = 'idle' | 'entering' | 'immersive' | 'synapse' | 'converge' | 'card' | 'settled';

/** 神经突触曲线路径 @ai-context 沉浸式入场时从卡片边缘生长的贝塞尔曲线数据 */
export interface TendrilPath {
  id: number;
  pathData: string;
  tipX: number;
  tipY: number;
  delay: number;
}

/** 突触动画状态 @ai-context 驱动沉浸式入场 reducer 的核心状态 */
export interface SynapseState {
  phase: ImmersivePhase;
  clickPoint: { x: number; y: number } | null;
  curveSeed: number;
}

/** 突触动画 Action @ai-context 沉浸式视图 useReducer 的 dispatch 类型 */
export type ImmersiveAction =
  | { type: 'ENTER' }
  | { type: 'ENTER_COMPLETE' }
  | { type: 'CLICK'; point: { x: number; y: number } }
  | { type: 'SYNAPSE_COMPLETE' }
  | { type: 'CONVERGE_COMPLETE' }
  | { type: 'CARD_COMPLETE' }
  | { type: 'DISMISS_CARD' }
  | { type: 'EXIT' };

/** 设备降级级别 @ai-context 根据 GPU / prefers-reduced-motion 自动降级动画复杂度 */
export type DegradationLevel = 'L0' | 'L1' | 'L2';

// ─────────────────────────────────────────────────────────────
// 组件 Props
// ─────────────────────────────────────────────────────────────

/** AI 分拣建议面板 Props @ai-context 驱动 AISortPanel 组件的入参 */
export interface AISortPanelProps {
  suggestions: import('@/lib/ai/types').SortSuggestion[];
  item: import('./store/inspirationStore').InspirationItem;
  onClose: () => void;
}

/** 灵感卡片 Props @ai-context 驱动 InspirationCard 组件的入参，支持批量模式 */
export interface InspirationCardProps {
  item: import('./store/inspirationStore').InspirationItem;
  batchMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}
