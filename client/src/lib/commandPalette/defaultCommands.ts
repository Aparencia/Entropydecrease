/**
 * 默认命令集
 *
 * @ai-context: 导航类命令的路由路径必须与 routes 配置一致；新增模块时
 * 需同步更新此处 + Sidebar + 快捷键文档（三处联动，缺一体验割裂）。
 */
import { commandRegistry } from './registry';
import type { Command } from './registry';
import { useOnboardingStore } from '@/components/onboarding/useOnboardingStore';

type NavigateFn = (path: string) => void;
type ToastFn = (options: { type: 'success' | 'error' | 'warning' | 'info'; message: string }) => void;

export function registerDefaultCommands(navigate: NavigateFn, toast: ToastFn): void {
  const comingSoon = (label: string) =>
    toast({ type: 'info', message: `"${label}" 功能即将上线，敬请期待！` });

  const commands: Command[] = [
    // ─── 导航命令 ───────────────────────────────────────────────────────────────
    {
      id: 'nav-dashboard',
      label: '打开仪表盘',
      description: '查看学习概览与统计',
      icon: 'LayoutDashboard',
      category: 'navigation',
      shortcut: 'G D',
      execute: () => navigate('/'),
    },
    {
      id: 'nav-pomodoro',
      label: '打开深潜',
      description: '专注计时与休息提醒',
      icon: 'Timer',
      category: 'navigation',
      shortcut: 'G P',
      execute: () => navigate('/pomodoro'),
    },
    {
      id: 'nav-notes',
      label: '打开结礁',
      description: '浏览与管理学习笔记',
      icon: 'FileText',
      category: 'navigation',
      shortcut: 'G N',
      execute: () => navigate('/notes'),
    },
    {
      id: 'nav-flashcards',
      label: '打开反衰减呼吸',
      description: '间隔重复记忆卡片',
      icon: 'Layers',
      category: 'navigation',
      shortcut: 'G F',
      execute: () => navigate('/flashcards'),
    },
    {
      id: 'nav-feynman',
      label: '打开浮出水面',
      description: '浮出水面学习法输出练习',
      icon: 'Lightbulb',
      category: 'navigation',
      shortcut: 'G Y',
      execute: () => navigate('/feynman'),
    },
    {
      id: 'nav-analytics',
      label: '打开效率分析',
      description: '学习数据与效率图表',
      icon: 'BarChart3',
      category: 'navigation',
      shortcut: 'G A',
      execute: () => navigate('/analytics'),
    },
    {
      id: 'nav-classroom',
      label: '打开回声定位（课堂助手）',
      description: '屏幕采集与AI课堂笔记提取',
      icon: 'Clapperboard',
      category: 'navigation',
      shortcut: '7',
      execute: () => navigate('/classroom'),
    },
    {
      id: 'nav-settings',
      label: '打开设置',
      description: '应用设置与偏好配置',
      icon: 'Settings',
      category: 'navigation',
      shortcut: 'G S',
      execute: () => navigate('/settings'),
    },

    // ─── 操作命令 ───────────────────────────────────────────────────────────────
    {
      id: 'action-new-note',
      label: '新建结礁',
      description: '创建一条新的学习结礁',
      icon: 'FilePlus',
      category: 'action',
      shortcut: 'Ctrl+N',
      execute: () => navigate('/notes'),
    },
    {
      id: 'action-new-deck',
      label: '新建牌组',
      description: '创建新的反衰减呼吸牌组',
      icon: 'FolderPlus',
      category: 'action',
      execute: () => navigate('/flashcards'),
    },
    {
      id: 'action-import-deck',
      label: '导入牌组',
      description: '从文件导入反衰减呼吸牌组',
      icon: 'Import',
      category: 'action',
      execute: () => comingSoon('导入牌组'),
    },
    {
      id: 'action-export-all',
      label: '导出全部数据',
      description: '将所有数据导出为文件',
      icon: 'Download',
      category: 'action',
      execute: () => comingSoon('导出全部数据'),
    },
    {
      id: 'action-toggle-theme',
      label: '切换极夜深海/晨曦浮光',
      description: '快速切换界面主题',
      icon: 'Moon',
      category: 'action',
      execute: () => comingSoon('切换主题'),
    },
    {
      id: 'action-checkin',
      label: '今日打卡',
      description: '记录今日学习打卡',
      icon: 'CheckCircle',
      category: 'action',
      execute: () => comingSoon('今日打卡'),
    },
    {
      id: 'action-help',
      label: '打开帮助中心',
      description: '查看操作指南、快捷键与常见问题',
      icon: 'HelpCircle',
      category: 'action',
      shortcut: 'Ctrl+/',
      execute: () => useOnboardingStore.getState().openHelp(),
    },

    // ─── 设置命令 ───────────────────────────────────────────────────────────────
    {
      id: 'settings-appearance',
      label: '外观设置',
      description: '主题、字体与界面外观',
      icon: 'Palette',
      category: 'settings',
      execute: () => navigate('/settings'),
    },
    {
      id: 'settings-ai',
      label: 'AI 供应商设置',
      description: '配置 AI 模型与 API Key',
      icon: 'Brain',
      category: 'settings',
      execute: () => navigate('/settings'),
    },
    {
      id: 'settings-data',
      label: '数据管理',
      description: '导入、导出与清理数据',
      icon: 'Database',
      category: 'settings',
      execute: () => navigate('/settings'),
    },
    {
      id: 'settings-about',
      label: '关于熵减',
      description: '版本信息与开源协议',
      icon: 'Info',
      category: 'settings',
      execute: () => navigate('/settings'),
    },
  ];

  commands.forEach((cmd) => commandRegistry.register(cmd));
}
