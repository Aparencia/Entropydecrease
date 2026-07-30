/**
 * @ai-context: 侧边栏开合 UI 状态 Zustand store。
 */
import { create } from 'zustand';

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: localStorage.getItem('kb_sidebar_collapsed') === 'true',
  toggle: () => set((state) => {
    const next = !state.collapsed;
    localStorage.setItem('kb_sidebar_collapsed', String(next));
    return { collapsed: next };
  }),
}));
