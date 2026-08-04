/**
 * 番茄钟状态仓库 — 预设 slice（CRUD 与活动预设）
 * Pomodoro preset slice — preset CRUD and active preset
 *
 * @ai-context: 拆分自 usePomodoroStore。CRUD 委托给 ../lib/presetService，
 * 本 slice 仅同步 store 状态。删除活动预设时回退第一个并重置计时时长；
 * reorder 保持 orderedIds 全量顺序。activePreset/mode 与 settingsSlice 的
 * setPreset/setMode 共享同一状态槽（Zustand 组合时后者覆盖初始值）。
 * @ai-context: Extracted from the monolith; CRUD delegates to presetService
 * while this slice keeps store state in sync. Deleting the active preset
 * falls back to the first and resets timer duration.
 */
import { getPhaseDuration, type PomodoroSlice, type PomodoroState } from './pomodoroStoreTypes';
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
    set((s) => ({
      presets: s.presets.map(p => (p.id === id ? { ...p, ...changes } : p)),
      activePreset: s.activePreset?.id === id
        ? { ...s.activePreset, ...changes } as PomodoroPreset
        : s.activePreset,
    }));
  },

  deletePreset: async (id) => {
    await svcDeletePreset(id);
    const { activePreset, presets } = get();
    const remaining = presets.filter(p => p.id !== id);
    // 若删除的是当前活动预设，回退到第一个
    let newActive = activePreset;
    if (activePreset?.id === id) {
      newActive = remaining[0] ?? null;
      const duration = getPhaseDuration('work', newActive, get().settings);
      set({ remainingSeconds: duration, totalSeconds: duration, phase: 'work', completedCount: 0 });
    }
    set({ presets: remaining, activePreset: newActive, mode: newActive?.silent ? 'class' : 'self_study' });
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
