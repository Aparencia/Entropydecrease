/**
 * 3D导航状态管理 — 连接Zustand与React Router
 *
 * @ai-context: 3D 空间导航状态（模块轨道位置），MODULE_POSITIONS 与路由映射需与 routes 配置同步。
 */
import { create } from 'zustand';

export type ModuleId = 'dashboard' | 'pomodoro' | 'notes' | 'flashcards' | 'feynman' | 'inspiration' | 'classroom';

interface ModulePosition {
  id: ModuleId;
  position: [number, number, number];
  route: string;
  label: string;
}

interface OrbitalState {
  currentModule: ModuleId | null;
  isInModule: boolean;
  hoveredModule: ModuleId | null;
  highlightAll: boolean;
  modules: ModulePosition[];
  enterModule: (id: ModuleId) => void;
  exitModule: () => void;
  setHovered: (id: ModuleId | null) => void;
  setHighlightAll: (v: boolean) => void;
  syncWithRoute: (pathname: string) => void;
}

export const MODULE_POSITIONS: ModulePosition[] = [
  { id: 'dashboard', position: [0, 0, 0], route: '/', label: '首页' },
  { id: 'pomodoro', position: [4, 2, -2], route: '/pomodoro', label: '深潜' },
  { id: 'notes', position: [-4, 1, -1], route: '/notes', label: '结礁' },
  { id: 'flashcards', position: [3, -2, -3], route: '/flashcards', label: '闪卡' },
  { id: 'feynman', position: [-3, -1, -4], route: '/feynman', label: '浮出水面' },
  { id: 'inspiration', position: [0, 3, -5], route: '/inspiration', label: '萤火海沟' },
  { id: 'classroom', position: [-2, -3, -2], route: '/classroom', label: '回声定位' },
];

export const useOrbitalStore = create<OrbitalState>((set) => ({
  currentModule: null,
  isInModule: false,
  hoveredModule: null,
  highlightAll: false,
  modules: MODULE_POSITIONS,
  enterModule: (id) => set({ currentModule: id, isInModule: true }),
  exitModule: () => set({ currentModule: null, isInModule: false }),
  setHovered: (id) => set({ hoveredModule: id }),
  setHighlightAll: (v) => set({ highlightAll: v }),
  syncWithRoute: (pathname: string) => {
    // 精确匹配或前缀匹配（支持子路由如 /flashcards/:deckId/study）
    const module = MODULE_POSITIONS.find(m => {
      if (m.route === '/') return pathname === '/';
      return pathname === m.route || pathname.startsWith(m.route + '/');
    });
    if (module) {
      set({ currentModule: module.id, isInModule: true });
    } else if (pathname === '/settings' || pathname === '/analytics') {
      // 设置和分析页面也进入覆盖层模式，归属dashboard
      set({ currentModule: 'dashboard', isInModule: true });
    } else {
      set({ currentModule: null, isInModule: false });
    }
  },
}));
