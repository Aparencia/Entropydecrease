/**
 * 番茄钟状态仓库 — 预设 slice（CRUD 与活动预设）
 * Pomodoro preset slice — preset CRUD and active preset
 *
 * @ai-context: 拆分自 usePomodoroStore。CRUD 委托给 ../lib/presetService，
 * 本 slice 仅同步 store 状态。删除活动预设时回退第一个；空闲时重置计时时长
 * （syncDisplayDuration 统一入口），运行中不打断计时。activePreset/mode 与
 * settingsSlice 的 setPreset/setMode 共享同一状态槽（Zustand 组合时后者覆盖初始值）。
 * @ai-context: Extracted from the monolith; CRUD delegates to presetService
 * while this slice keeps store state in sync. Deleting the active preset
 * falls back to the first; idle refresh of display duration goes through
 * syncDisplayDuration so a running timer is never interrupted.
 */
import { type PomodoroSlice, type PomodoroState } from './pomodoroStoreTypes';
import {
  createPreset as svcCreatePreset, updatePreset as svcUpdatePreset,
  deletePreset as svcDeletePreset, reorderPresets as svcReorderPresets,
} from '../lib/presetService';
import type { PomodoroPreset } from '@/types/models';

export const createPresetSlice: PomodoroSlice<Pick<PomodoroState, 'presets' | 'activePreset' | 'createPreset' | 'updatePreset' | 'deletePreset' | 'reorderPresets'>> = (set, get) => ({
  presets: [],
  activePreset: null,

  createPreset: async (data) => {
    const preset = await svcCreatePreset(data);
    set((s) => ({ presets: [...s.presets, preset] }));
    return preset;
  },

  updatePreset: async (id, changes) => {
    await svcUpdatePreset(id, changes);
    set((s) => {
      const presets = s.presets.map(p => (p.id === id ? { ...p, ...changes } : p));
      const newActive = s.activePreset?.id === id
        ? { ...s.activePreset, ...changes } as PomodoroPreset
        : s.activePreset;
      return {
        presets,
        activePreset: newActive,
        mode: newActive?.silent ? 'class' : 'self_study',
      };
    });
    // 统一时长同步入口：编辑活动预设且计时空闲时，表盘立即反映新时长
    // （运行/暂停中不打断计时，阶段完成后按新参数进入下一阶段）
    get().syncDisplayDuration();
  },

  deletePreset: async (id) => {
    await svcDeletePreset(id);
    const { activePreset, presets, isRunning, isPaused } = get();
    const remaining = presets.filter(p => p.id !== id);
    // 若删除的是当前活动预设，回退到第一个
    let newActive = activePreset;
    if (activePreset?.id === id) {
      newActive = remaining[0] ?? null;
      // 空闲时开启新周期（阶段回 work + 计数归零）；运行/暂停中不打断当前计时
      if (!isRunning && !isPaused) {
        set({ phase: 'work', completedCount: 0 });
      }
    }
    set({ presets: remaining, activePreset: newActive, mode: newActive?.silent ? 'class' : 'self_study' });
    // 统一时长同步入口：空闲时按回退预设刷新展示时长
    get().syncDisplayDuration();
  },

  reorderPresets: async (orderedIds) => {
    await svcReorderPresets(orderedIds);
    set((s) => ({
      presets: orderedIds
        .map(id => s.presets.find(p => p.id === id))
        .filter((p): p is PomodoroPreset => p != null),
    }));
  },
});
