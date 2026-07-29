/**
 * 引导系统状态管理 — 控制交互式引导流程
 *
 * @ai-context: 通用组件：useOnboardingStore。
 */
import { create } from 'zustand';

const STORAGE_KEY = 'kb-3d-guide-done';
const TOTAL_STEPS = 7;

interface OnboardingState {
  isActive: boolean;
  currentStep: number;
  highlightAll: boolean;
  autoDemo: boolean;

  // 帮助中心
  isHelpOpen: boolean;

  startGuide: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipGuide: () => void;
  finishGuide: () => void;
  setHighlightAll: (v: boolean) => void;
  toggleAutoDemo: () => void;
  openHelp: () => void;
  closeHelp: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  isActive: false,
  currentStep: 0,
  highlightAll: false,
  autoDemo: false,
  isHelpOpen: false,

  startGuide: () => set({ isActive: true, currentStep: 0 }),

  nextStep: () => {
    const { currentStep } = get();
    if (currentStep >= TOTAL_STEPS - 1) {
      get().finishGuide();
    } else {
      set({ currentStep: currentStep + 1 });
    }
  },

  prevStep: () => {
    const { currentStep } = get();
    if (currentStep > 0) {
      set({ currentStep: currentStep - 1 });
    }
  },

  skipGuide: () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    set({ isActive: false, currentStep: 0, highlightAll: false, autoDemo: false });
  },

  finishGuide: () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    set({ isActive: false, currentStep: 0, highlightAll: false, autoDemo: false });
  },

  setHighlightAll: (v) => set({ highlightAll: v }),

  toggleAutoDemo: () => set((s) => ({ autoDemo: !s.autoDemo })),

  openHelp: () => set({ isHelpOpen: true }),
  closeHelp: () => set({ isHelpOpen: false }),
}));

/**
 * 检查是否已完成引导
 */
export function isGuideDone(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

/** 总步骤数 */
export { TOTAL_STEPS };
