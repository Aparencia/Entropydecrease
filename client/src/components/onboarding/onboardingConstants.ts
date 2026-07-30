/**
 * 引导系统文案与配置数据
 *
 * @ai-context: 通用组件：onboardingConstants。
 */
import type { ModuleId } from '@/lib/3d/navigation/OrbitalStore';

/* ────────── 步骤文案 ────────── */

export const WELCOME_TEXT = {
  'deep-sea': {
    title: '欢迎来到深海意识',
    subtitle: '在这里，每个知识模块都是一颗发光的深海结晶。点击它们，潜入你的学习世界。',
  },
  'aurora-dome': {
    title: '欢迎来到晨曦穹顶',
    subtitle: '在这里，每个知识模块都是一颗环绕穹顶的行星。点击它们，开启你的学习旅程。',
  },
};

export const STEP_TEXTS = [
  // Step 0: Welcome (handled by WELCOME_TEXT above)
  { title: '', description: '' },
  // Step 1: Navigate
  {
    title: '探索3D空间',
    description: '这些发光的实体代表不同的学习模块。试着点击任意一个，看看会发生什么？',
  },
  // Step 2: Camera Flight
  {
    title: '相机飞行',
    description: '当你进入一个模块时，相机会平滑飞向其位置。感受空间的流动感。',
  },
  // Step 3: Functional Panel
  {
    title: '功能面板',
    description: '模块功能以毛玻璃面板呈现，叠加在3D场景之上。所有操作都在这里完成。',
  },
  // Step 4: Exit Demo
  {
    title: '返回全景',
    description: '按 Esc 键或点击按钮，随时退出模块返回全景视图。',
  },
  // Step 5: Panorama
  {
    title: '全景总览',
    description: '这是你的完整学习空间，包含 6 个功能模块。记住它们的位置，随时通过点击或快捷键进入。',
  },
  // Step 6: Shortcuts
  {
    title: '快捷键速查',
    description: '掌握这些快捷键，让你的操作更加流畅。',
  },
];

/* ────────── 模块说明 ────────── */

export interface ModuleInfo {
  id: ModuleId;
  name: string;
  number: string;
  color: string;
  description: string;
}

export const MODULE_INFO: ModuleInfo[] = [
  { id: 'dashboard', name: '首页', number: '①', color: '#6366F1', description: '数据仪表盘，总览学习进度与统计' },
  { id: 'pomodoro', name: '深潜', number: '②', color: '#F97316', description: '番茄钟专注计时，沉浸式学习' },
  { id: 'notes', name: '结礁', number: '③', color: '#3B82F6', description: '富文本笔记，知识结构化存储' },
  { id: 'flashcards', name: '闪卡', number: '④', color: '#10B981', description: '间隔重复记忆卡片' },
  { id: 'feynman', name: '反衰减呼吸', number: '⑤', color: '#8B5CF6', description: '费曼学习法，以教代学' },
  { id: 'inspiration', name: '萤火海沟', number: '⑥', color: '#EC4899', description: '灵感收集与AI辅助思考' },
];

/* ────────── 快捷键表格 ────────── */

export interface ShortcutEntry {
  key: string;
  description: string;
}

export const SHORTCUTS: ShortcutEntry[] = [
  { key: '1 - 6', description: '快捷跳转到对应模块' },
  { key: 'Esc', description: '退出当前模块，返回全景' },
  { key: 'Ctrl + K', description: '打开命令面板' },
  { key: '← →', description: '引导中切换步骤' },
  { key: 'Enter', description: '引导中进入下一步' },
];
