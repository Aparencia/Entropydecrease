/**
 * 全局主题 Store（Zustand 单一事实来源）
 *
 * @ai-context: 修复 BUG —— 旧 useTheme() 是普通 useState hook，被 App/Navbar/
 * Sidebar/AppearanceSettings 独立调用产生 4 个互不同步的状态实例，各自 effect
 * 覆写 data-theme 属性，导致页面主题"有时亮有时暗"（内测反馈 2026-08）。
 * 本 store 为唯一状态源，所有消费方通过 useTheme() 包装层读取同一实例。
 * @ai-context: Global theme store — single source of truth for data-theme.
 * Fixes multi-instance race where independent useState hooks overwrote each other.
 */
import { create } from 'zustand';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'kb-theme';

/** 初始化：localStorage 持久值 > 系统偏好（与 index.html 内联脚本逻辑一致） */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),

  toggleTheme: () =>
    set((s) => {
      const next: Theme = s.theme === 'light' ? 'dark' : 'light';
      applyTheme(next);
      return { theme: next };
    }),

  setTheme: (t: Theme) => {
    applyTheme(t);
    set({ theme: t });
  },
}));

/** 唯一的 DOM 写入点：设置 data-theme + 持久化 */
function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

// 启动时立即应用一次（store 创建即同步写入 DOM，不依赖 React effect 时序）
applyTheme(useThemeStore.getState().theme);

// 监听系统主题变化：仅当用户未手动选择过（无 localStorage 持久值）时跟随系统
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      useThemeStore.getState().setTheme(e.matches ? 'dark' : 'light');
    }
  });
}
