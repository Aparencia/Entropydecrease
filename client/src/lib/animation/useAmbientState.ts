/**
 * @file 全局氛围状态管理
 * @description 通过 zustand store 统一管理所有驱动背景视觉的状态信号
 * @ai-context 纯状态层，不直接操作 DOM；由 OceanEnvironment 等消费者读取并映射到 CSS 变量
 */
import { create } from 'zustand';

/* ── 光晕点类型 ── */
export interface GlowSpot {
  id: string;
  /** 归一化 x 坐标 (0-1) */
  x: number;
  /** 归一化 y 坐标 (0-1) */
  y: number;
  /** 光晕强度 (0-1) */
  intensity: number;
  /** CSS 颜色值 */
  color: string;
}

/* ── 专注成就事件 ── */
export interface FocusAchievement {
  /** 触发时间戳 */
  triggeredAt: number;
  /** 持续专注时长（秒） */
  duration: number;
  /** 成就描述 */
  message: string;
}

/* ── Store 接口 ── */
interface AmbientState {
  /** 鼠标归一化坐标 (0-1) */
  mousePosition: { x: number; y: number };
  /** 滚动速度（像素/秒，绝对值） */
  scrollVelocity: number;
  /** 活跃光晕点列表 */
  activeGlowSpots: GlowSpot[];
  /** 专注强度 (0-1) */
  focusIntensity: number;
  /** 是否在呼吸模式（番茄钟运行时） */
  ambientBreathing: boolean;
  /** 呼吸周期（秒），专注期 8s，休息期 4s */
  breathDuration: number;
  /** 打字速度强度 (0-1) */
  typingIntensity: number;
  /** 音频振幅 (0-1) */
  audioAmplitude: number;
  /** 页面是否可见 */
  pageVisible: boolean;
  /** 连续专注时长（秒），用于成就系统 */
  continuousFocusSeconds: number;
  /** 最近触发的专注成就 */
  lastFocusAchievement: FocusAchievement | null;
  /** 是否正在显示极光效果 */
  auroraActive: boolean;
  /** 节律微动效是否激活（番茄钟 25min+） */
  rhythmActive: boolean;

  /* ── Actions ── */
  setMousePosition: (x: number, y: number) => void;
  setScrollVelocity: (v: number) => void;
  addGlowSpot: (x: number, y: number, color: string) => string;
  removeGlowSpot: (id: string) => void;
  setFocusIntensity: (v: number) => void;
  setAmbientBreathing: (active: boolean, duration?: number) => void;
  setTypingIntensity: (v: number) => void;
  setAudioAmplitude: (v: number) => void;
  setPageVisible: (v: boolean) => void;
  setContinuousFocusSeconds: (v: number) => void;
  triggerFocusAchievement: (achievement: FocusAchievement) => void;
  setAuroraActive: (v: boolean) => void;
  setRhythmActive: (v: boolean) => void;
}

/** 光晕自动清理超时（ms） */
const GLOW_SPOT_TTL = 3000;

export const useAmbientStore = create<AmbientState>((set, get) => ({
  mousePosition: { x: 0.5, y: 0.5 },
  scrollVelocity: 0,
  activeGlowSpots: [],
  focusIntensity: 0,
  ambientBreathing: false,
  breathDuration: 8,
  typingIntensity: 0,
  audioAmplitude: 0,
  pageVisible: true,
  continuousFocusSeconds: 0,
  lastFocusAchievement: null,
  auroraActive: false,
  rhythmActive: false,

  setMousePosition: (x, y) => set({ mousePosition: { x, y } }),

  setScrollVelocity: (v) => set({ scrollVelocity: v }),

  addGlowSpot: (x, y, color) => {
    const id = `glow-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const spot: GlowSpot = { id, x, y, intensity: 1, color };
    set((s) => ({ activeGlowSpots: [...s.activeGlowSpots, spot] }));
    // 自动清理
    setTimeout(() => {
      set((s) => ({
        activeGlowSpots: s.activeGlowSpots.filter((g) => g.id !== id),
      }));
    }, GLOW_SPOT_TTL);
    return id;
  },

  removeGlowSpot: (id) =>
    set((s) => ({
      activeGlowSpots: s.activeGlowSpots.filter((g) => g.id !== id),
    })),

  setFocusIntensity: (v) => set({ focusIntensity: v }),

  setAmbientBreathing: (active, duration = 8) =>
    set({ ambientBreathing: active, breathDuration: duration }),

  setTypingIntensity: (v) => set({ typingIntensity: v }),

  setAudioAmplitude: (v) => set({ audioAmplitude: v }),

  setPageVisible: (v) => set({ pageVisible: v }),

  setContinuousFocusSeconds: (v) => set({ continuousFocusSeconds: v }),

  triggerFocusAchievement: (achievement) =>
    set({ lastFocusAchievement: achievement }),

  setAuroraActive: (v) => set({ auroraActive: v }),

  setRhythmActive: (v) => set({ rhythmActive: v }),
}));
