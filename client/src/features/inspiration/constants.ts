/**
 * 萤火海沟 — 常量与动画配置
 * @ai-context 灵感捕捉模块的常量层，包含标签选项、分拣配置、工具函数及 Framer Motion variants
 */

import type { InspirationTags } from './store/inspirationStore';
import { Loader2, CheckCircle2 } from 'lucide-react';
import type { TagOption, SortStatusEntry, SortTypeInfo } from './types';

// ─────────────────────────────────────────────────────────────
// 标签选项
// ─────────────────────────────────────────────────────────────

/** 内容性质筛选选项 @ai-context 灵感卡片标签：概念 / 疑问 / 萤火 / 待办 */
export const CONTENT_NATURE_OPTIONS: TagOption<InspirationTags['content_nature']>[] = [
  { value: 'concept',     label: '概念', color: 'text-accent-600',   bg: 'bg-accent-50 border-accent-200 dark:bg-accent-900/20 dark:border-accent-700' },
  { value: 'question',    label: '疑问', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-700' },
  { value: 'inspiration', label: '萤火', color: 'text-accent-600', bg: 'bg-accent-500/10 border-accent-500/30 dark:bg-accent-500/20 dark:border-accent-500/40' },
  { value: 'todo',        label: '待办', color: 'text-green-600',  bg: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700' },
];

/** 认知深度筛选选项 @ai-context 灵感卡片标签：浅层 / 理解层 / 应用层 */
export const COGNITIVE_DEPTH_OPTIONS: TagOption<InspirationTags['cognitive_depth']>[] = [
  { value: 'shallow',      label: '浅层',   color: 'text-slate-500',  bg: 'bg-slate-50 border-slate-200 dark:bg-slate-800/30 dark:border-slate-600' },
  { value: 'understanding', label: '理解层', color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-700' },
  { value: 'application',   label: '应用层', color: 'text-rose-600',   bg: 'bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-700' },
];

/** 内容性质快速查找表 @ai-context 卡片渲染时 O(1) 获取标签配色 */
export const NATURE_MAP = Object.fromEntries(
  CONTENT_NATURE_OPTIONS.map(o => [o.value, o]),
) as Record<string, (typeof CONTENT_NATURE_OPTIONS)[0]>;

/** 认知深度快速查找表 @ai-context 卡片渲染时 O(1) 获取标签配色 */
export const DEPTH_MAP = Object.fromEntries(
  COGNITIVE_DEPTH_OPTIONS.map(o => [o.value, o]),
) as Record<string, (typeof COGNITIVE_DEPTH_OPTIONS)[0]>;

// ─────────────────────────────────────────────────────────────
// 分拣配置
// ─────────────────────────────────────────────────────────────

/** AI 分拣类型映射 @ai-context 分拣建议面板中各类型的标签文案与视觉配色 */
export const SORT_TYPE_MAP: Record<string, SortTypeInfo> = {
  feynman:     { label: '浮出水面讲解', color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700' },
  flashcard:   { label: '反衰减呼吸',    color: 'text-cyber', bg: 'bg-cyber/10 border-cyber/30 dark:bg-cyber/20 dark:border-cyber/40' },
  note:        { label: '结礁',     color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-700' },
  todo:        { label: '待办',     color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700' },
  action_item: { label: '立即执行', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700' },
};

/** 分拣状态视觉配置 @ai-context 卡片右上角角标展示当前分拣阶段 */
export const SORT_STATUS_CONFIG = {
  sorting:     { label: '分拣中...', icon: Loader2,      color: 'text-cyber', bg: 'bg-cyber/10 border-cyber/30 dark:bg-cyber/20 dark:border-cyber/40',         animate: true },
  sorted:      { label: '已分拣',   icon: null,           color: 'text-amber-700 dark:text-amber-400',     bg: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700',     animate: false },
  confirmed:   { label: '已确认',   icon: CheckCircle2,   color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700', animate: false },
  transformed: { label: '已转化',   icon: CheckCircle2,   color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700', animate: false },
} as const satisfies Record<string, SortStatusEntry>;

/** SORT_TYPE_MAP 的 entries 缓存 @ai-context 分拣下拉面板遍历用 */
export const SORT_TYPE_ENTRIES = Object.entries(SORT_TYPE_MAP) as [string, SortTypeInfo][];

// ─────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────

/** 将 ISO 时间戳格式化为中文相对时间 @ai-context 卡片底栏显示灵感捕捉时间 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────────────────────
// Framer Motion variants
// ─────────────────────────────────────────────────────────────

/** 页面容器 stagger 动画 @ai-context 灵感页整体入场编排 */
export const pageVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.06 } },
};

/** 标题区淡入动画 @ai-context 页头图标+标题入场 */
export const headerVariants = {
  hidden: { opacity: 0, y: -16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] as const } },
};

/** 输入区淡入动画 @ai-context 灵感快速输入框入场 */
export const inputVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const, delay: 0.1 } },
};

/** 筛选栏淡入动画 @ai-context 筛选面板入场 */
export const filterVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, delay: 0.15 } },
};

/** 列表容器 stagger 动画 @ai-context 灵感卡片列表入场编排 */
export const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
};

/** 单张卡片动画 @ai-context 灵感卡片入场 / 退场过渡 */
export const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.22, 0.61, 0.36, 1] as const } },
  exit: { opacity: 0, x: -20, scale: 0.95, transition: { duration: 0.2 } },
};

// ─────────────────────────────────────────────────────────────
// 沉浸式动画常量 — 新增
// ─────────────────────────────────────────────────────────────

/** 沉浸式入场动画时长(ms) @ai-context 卡片展开到全屏的过渡时间 */
export const IMMERSIVE_DURATION = 600;

/** 脉冲波纹扩展时长(ms) @ai-context 同心圆环从中心向外扩展至最大倍数的时间 */
export const PULSE_EXPAND_DURATION = 1200;

/** 脉冲波纹收缩汇聚时长(ms) @ai-context 圆环从扩展状态回收到中心的时间 */
export const PULSE_CONVERGE_DURATION = 600;

/** 脉冲圆环数量 @ai-context 同心圆环层数 */
export const PULSE_RINGS = 5;

/** 脉冲环间延迟(ms) @ai-context 相邻圆环的动画启动交错时间 */
export const PULSE_STAGGER = 80;

/** 脉冲圆环初始尺寸(px) @ai-context 圆环宽高 */
export const PULSE_RING_SIZE = 60;

/** 脉冲最大扩展倍数 @ai-context 圆环扩展到的最大 scale 值 */
export const PULSE_MAX_SCALE = 4;

/** 卡片浮现时长(ms) @ai-context 沉浸式视图中内容卡片从透明到完全可见的时间 */
export const CARD_REVEAL_DURATION = 400;

/** 沉浸式缓动曲线 @ai-context 所有沉浸式动画共用的贝塞尔缓动参数 */
export const IMMERSIVE_EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];


