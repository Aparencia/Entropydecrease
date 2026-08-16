/**
 * 深海发现记录 Store
 * Deep sea discovery record store
 *
 * @ai-context: 管理发现物的持久化（Dexie deepSeaDiscoveries 表）和
 * 当前待展示的发现（供 DiscoveryReveal 消费）。
 * @ai-context: Manages discovery persistence (Dexie deepSeaDiscoveries table)
 * and the current pending discovery for DiscoveryReveal to consume.
 */
import { create } from 'zustand';
import { db } from '@/lib/storage/database';
import { rollDiscovery } from '../lib/discoveryEngine';
import { useRetentionSettings } from './useRetentionSettings';
import type { DiscoveryDef, DeepSeaDiscovery } from '../types';

interface DiscoveryState {
  /** 当前待展示的发现（null = 无） / Current pending discovery */
  pendingDiscovery: DiscoveryDef | null;
  /** 发现时的深度 / Depth at discovery */
  pendingDepth: number;
  /** 历史发现总数 / Total historical discoveries */
  totalCount: number;

  /** 尝试触发发现（里程碑后调用）。
   *  sourceType 为预留参数：当前实现不区分触发来源，未来按来源差异化
   *  调整发现概率时启用（下划线标注避免 noUnusedParameters 报错）。 */
  tryTrigger: (_sourceType: 'pomodoro' | 'flashcard' | 'feynman', depth: number) => void;
  /** 确认收入生态缸 / Confirm collecting to ecosystem */
  collect: () => Promise<void>;
  /** 忽略（关闭弹窗） / Dismiss (close popup) */
  dismiss: () => void;
  /** 初始化：加载历史计数 / Initialize: load historical count */
  initialize: () => Promise<void>;
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  pendingDiscovery: null,
  pendingDepth: 0,
  totalCount: 0,

  tryTrigger: (_sourceType, depth) => {
    // 检查留存设置开关 / Check retention settings toggle
    const settings = useRetentionSettings.getState();
    if (!settings.enabled || !settings.discoveries) return;

    const discovery = rollDiscovery();
    if (discovery) {
      set({ pendingDiscovery: discovery, pendingDepth: depth });
    }
  },

  collect: async () => {
    const { pendingDiscovery, pendingDepth } = get();
    if (!pendingDiscovery) return;

    const record: DeepSeaDiscovery = {
      id: crypto.randomUUID(),
      type: pendingDiscovery.type,
      rarity: pendingDiscovery.rarity,
      depth: pendingDepth,
      discoveredAt: new Date(),
      sourceType: 'pomodoro',
    };

    try {
      await db.deepSeaDiscoveries.add(record);
      set((s) => ({ totalCount: s.totalCount + 1 }));
    } catch { /* 静默失败 */ }

    set({ pendingDiscovery: null, pendingDepth: 0 });
  },

  dismiss: () => set({ pendingDiscovery: null, pendingDepth: 0 }),

  initialize: async () => {
    try {
      const count = await db.deepSeaDiscoveries.count();
      set({ totalCount: count });
    } catch { /* 表可能不存在（首次升级前） */ }
  },
}));
