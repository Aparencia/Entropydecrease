/**
 * 珊瑚生态系统 Store
 * Coral ecosystem store
 *
 * @ai-context: 管理珊瑚记录的 CRUD、累计深度计算、白化检查与恢复。
 * 数据持久化到 Dexie coralEcosystem 表。
 * @ai-context: Manages coral record CRUD, cumulative depth calculation,
 * bleaching check and recovery. Persisted to Dexie coralEcosystem table.
 */
import { create } from 'zustand';
import { db } from '@/lib/storage/database';
import {
  determineCoralType, calculateDepth, checkBleaching, restoreBleached,
} from '../lib/coralEngine';
import { useRetentionSettings } from './useRetentionSettings';
import type { CoralRecord } from '../types';

interface EcosystemState {
  /** 所有珊瑚记录 / All coral records */
  corals: CoralRecord[];
  /** 累计深度（米） / Cumulative depth (meters) */
  totalDepth: number;
  /** 是否已初始化 / Whether initialized */
  initialized: boolean;

  /** 初始化：加载珊瑚数据 + 白化检查 / Initialize: load + bleaching check */
  initialize: () => Promise<void>;
  /** 种植新珊瑚（深潜完成后调用） / Plant new coral (after dive) */
  plantCoral: (durationMinutes: number, sourceType: 'pomodoro' | 'flashcard' | 'feynman', sessionId: string) => Promise<void>;
  /** 恢复白化珊瑚 / Restore bleached corals */
  restore: () => Promise<void>;
}

export const useEcosystemStore = create<EcosystemState>((set, get) => ({
  corals: [],
  totalDepth: 0,
  initialized: false,

  initialize: async () => {
    try {
      const corals = await db.coralEcosystem.toArray();
      const totalDepth = corals.reduce((sum, c) => sum + c.depth, 0);

      // 白化检查：基于最后种植时间 / Bleaching check based on last plant time
      if (corals.length > 0) {
        const sorted = [...corals].sort(
          (a, b) => new Date(b.plantedAt).getTime() - new Date(a.plantedAt).getTime(),
        );
        // GW-3: 本地日期口径（与 FRONT2-M3 一致）——原实现 toISOString 取
        // UTC 日期，UTC+8 用户凌晨种植后白化判定偏差一天
        const lastPlant = new Date(sorted[0].plantedAt);
        const lastDate = `${lastPlant.getFullYear()}-${String(lastPlant.getMonth() + 1).padStart(2, '0')}-${String(lastPlant.getDate()).padStart(2, '0')}`;
        const toBleach = checkBleaching(corals, lastDate, new Date());
        if (toBleach.length > 0) {
          for (const id of toBleach) {
            await db.coralEcosystem.update(id, { health: 'bleached' });
          }
          // 重新加载 / Reload
          const updated = await db.coralEcosystem.toArray();
          set({ corals: updated, totalDepth, initialized: true });
          return;
        }
      }

      set({ corals, totalDepth, initialized: true });
    } catch {
      set({ initialized: true });
    }
  },

  plantCoral: async (durationMinutes, sourceType, sessionId) => {
    const settings = useRetentionSettings.getState();
    if (!settings.enabled || !settings.coralEcosystem) return;

    const { corals } = get();

    // 计算连续天数（简化：基于珊瑚种植日期去重）
    const uniqueDays = new Set(
      corals.map((c) => new Date(c.plantedAt).toISOString().split('T')[0]),
    );
    const consecutiveDays = uniqueDays.size;

    const type = determineCoralType(durationMinutes, sourceType, consecutiveDays);
    const depth = calculateDepth(durationMinutes);

    const record: CoralRecord = {
      id: crypto.randomUUID(),
      type,
      health: 'healthy',
      plantedAt: new Date(),
      sourceSession: sessionId,
      depth,
    };

    try {
      await db.coralEcosystem.add(record);

      // 种植时恢复所有白化珊瑚 / Restore bleached corals on plant
      const restored = restoreBleached([...corals, record]);
      for (const c of restored) {
        if (c.health === 'healthy') {
          await db.coralEcosystem.update(c.id, { health: 'healthy' }).catch((err) => {
            console.debug('[useEcosystemStore] restore bleached coral failed', c.id, err);
          });
        }
      }

      // FRONT2-M4: 写库完成后重新读库再 set——原实现用旧快照整体覆盖，
      // 两个会话并发完成（如番茄钟与闪卡同时触发）时后写者覆盖前者的
      // 珊瑚，store 中珊瑚丢失、totalDepth 少算（DB 有但 UI 态丢）
      const latest = await db.coralEcosystem.toArray();
      const totalDepth = latest.reduce((sum, c) => sum + c.depth, 0);
      set({ corals: latest, totalDepth });
    } catch { /* 静默失败 */ }
  },

  restore: async () => {
    const { corals } = get();
    const restored = restoreBleached(corals);
    for (const c of restored) {
      try {
        await db.coralEcosystem.update(c.id, { health: 'healthy' });
      } catch { /* ignore */ }
    }
    // GW-3: 与 plantCoral 同口径——写库完成后重读再 set，避免旧快照
    // 覆盖并发 plantCoral 的最新状态
    const latest = await db.coralEcosystem.toArray();
    set({ corals: latest });
  },
}));
