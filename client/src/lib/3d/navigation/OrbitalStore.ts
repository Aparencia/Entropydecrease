/**
 * 3D导航状态管理 — 连接Zustand与React Router
 *
 * 三相位状态机：overview → entering → docked
 * - overview：3D 全帧渲染，全部实体可见，覆盖层隐藏（但保持挂载以保留页面状态）
 * - entering：相机飞行中，3D 全帧渲染；覆盖层在模块间切换时保持可见，从概览进入时隐藏
 * - docked：3D 暂停渲染（避免活动 canvas 使 backdrop-blur 缓存失效），覆盖层可见
 *
 * @ai-context: 3D 空间导航状态（模块轨道位置），MODULE_POSITIONS 与路由映射需与 routes 配置同步。
 */
import { create } from 'zustand';

export type ModuleId = 'dashboard' | 'pomodoro' | 'notes' | 'flashcards' | 'feynman' | 'inspiration' | 'classroom';

/** 导航相位：概览态 / 进入中（相机飞行） / 停靠（渲染暂停） */
export type OrbitalPhase = 'overview' | 'entering' | 'docked';

interface ModulePosition {
  id: ModuleId;
  position: [number, number, number];
  route: string;
  label: string;
}

interface OrbitalState {
  currentModule: ModuleId | null;
  /** 导航相位（驱动帧循环与覆盖层时序） */
  phase: OrbitalPhase;
  /** 功能覆盖层是否可见（docked 时为 true；模块间切换的 entering 期间保持 true） */
  overlayVisible: boolean;
  /** 兼容字段：= phase !== 'overview'，供引导步骤等消费方使用 */
  isInModule: boolean;
  hoveredModule: ModuleId | null;
  highlightAll: boolean;
  modules: ModulePosition[];
  enterModule: (id: ModuleId) => void;
  exitModule: () => void;
  /** 相机飞行结束，停靠：entering → docked（由 SceneProvider 计时器调用） */
  dock: () => void;
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

/**
 * 路由 → 模块ID 映射
 * 与 syncWithRoute 中的映射逻辑一致，供外部（如数字键处理器）使用
 */
export function routeToModuleId(pathname: string): ModuleId | null {
  const module = MODULE_POSITIONS.find(m => {
    if (m.route === '/') return pathname === '/';
    return pathname === m.route || pathname.startsWith(m.route + '/');
  });
  return module
    ? module.id
    : (pathname === '/settings' || pathname === '/analytics') ? 'dashboard' : null;
}

/** 导航洪泛防护：enterModule 最小调用间隔。
 * Chromium 对客户端导航（pushState/hash）有洪泛保护（crbug.com/1038223），
 * 超阈后导航会被限流丢弃——此时轨道状态已迁移而路由未变，
 * 覆盖层与实际页面错位/空白（内测控制台 "Throttling navigation" 警告）。 */
const ENTER_MODULE_MIN_GAP_MS = 200;
let lastEnterModuleAt = 0;

export const useOrbitalStore = create<OrbitalState>((set, get) => ({
  currentModule: null,
  phase: 'overview',
  overlayVisible: false,
  isInModule: false,
  hoveredModule: null,
  highlightAll: false,
  modules: MODULE_POSITIONS,
  enterModule: (id) => {
    const s = get();
    // 已停靠且覆盖层可见于同模块：无操作（修复重复按键无响应）
    if (s.currentModule === id && s.phase === 'docked' && s.overlayVisible) return;
    // 洪泛防护：过密的进入调用直接忽略，避免导航被 Chromium 限流丢弃
    const now = Date.now();
    if (now - lastEnterModuleAt < ENTER_MODULE_MIN_GAP_MS) return;
    lastEnterModuleAt = now;
    set({
      currentModule: id,
      phase: 'entering',
      // 模块间切换保持覆盖层可见；从概览进入则等停靠后再显示（先看相机飞行）
      overlayVisible: s.phase !== 'overview',
      isInModule: true,
    });
  },
  exitModule: () => {
    // 保留 currentModule：覆盖层保持挂载（不可见），页面状态存活，重入时不重播动画；
    // 清除悬停态：退出后实体不应残留悬停视觉（覆盖层显示期间指针事件已关闭，hovered 可能滞留）
    set({ phase: 'overview', overlayVisible: false, isInModule: false, hoveredModule: null });
  },
  dock: () => {
    if (get().phase === 'entering') {
      set({ phase: 'docked', overlayVisible: true });
    }
  },
  setHovered: (id) => set({ hoveredModule: id }),
  setHighlightAll: (v) => set({ highlightAll: v }),
  syncWithRoute: (pathname: string) => {
    const s = get();
    const targetId = routeToModuleId(pathname);

    if (!targetId) {
      set({ currentModule: null, phase: 'overview', overlayVisible: false, isInModule: false });
      return;
    }
    // 相机飞行中：不整体重走相位迁移（dock 计时器负责 entering → docked），
    // 但必须把 currentModule 校正到路由目标——此前直接 return 丢弃路由同步，
    // 快速连续切换页面（"多次从主页切换到其他页面"）时 currentModule 永久滞留旧值，
    // 停靠后相机/覆盖层与实际路由错位，叠加渲染冻结表现为页面不渲染。
    // 更新 currentModule 后：SpatialNav 飞行 effect 自动重定向新模块，
    // SceneProvider 停靠计时器随之重置，相位最终收敛到正确目标。
    if (s.phase === 'entering') {
      if (targetId && targetId !== s.currentModule) {
        set({ currentModule: targetId });
      }
      return;
    }
    // 同模块且已停靠：仅确保覆盖层可见（重入/子路由导航场景）
    if (targetId === s.currentModule && s.phase === 'docked') {
      if (!s.overlayVisible) set({ overlayVisible: true });
      return;
    }
    // 停靠中切换到不同模块（页内 navigate 来源：快捷操作/知识预览/BottomNav 等）：
    // 经 entering 相位（相机飞行→停靠），与 3D 点击行为一致，避免原地冻结导致背景错位
    if (s.phase === 'docked') {
      set({ currentModule: targetId, phase: 'entering', overlayVisible: true, isInModule: true });
      return;
    }
    // 其余（页面刷新/直接 URL）：立即停靠
    set({ currentModule: targetId, phase: 'docked', overlayVisible: true, isInModule: true });
  },
}));
