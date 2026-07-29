/**
 * @ai-context: 采集会话 UI 状态 Zustand store（仅 UI 态，持久化在 lib/storage/captureStore）。
 */
import { create } from 'zustand';

interface CaptureState {
  /** 是否显示课堂助手侧边栏 */
  open: boolean;
  /** 切换显示状态 */
  toggle: () => void;
  /** 设置显示状态 */
  setOpen: (open: boolean) => void;
}

export const useCaptureStore = create<CaptureState>((set) => ({
  open: false,
  toggle: () => set((state) => ({ open: !state.open })),
  setOpen: (open: boolean) => set({ open }),
}));
