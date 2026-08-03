/**
 * 世界状态快照同步 Hook（宪法 P2 · discoveries/world_state 跨进程接线）
 * World snapshot sync hook (cross-process bridge to the MCP memory server)
 *
 * @ai-context: 珊瑚/发现数据存于渲染进程 IndexedDB，MCP 记忆服务器读主进程
 * sqlite——本 hook 是两者间的单向桥：数据变化防抖 2s 后把摘要快照 upsert
 * 到 world_snapshots 表（单行 id='latest'）。阶段 C 新增事件驱动：订阅
 * useWorldEvents 签名时刻（掌握/创世/入籍，含 knowledge_settled 语义）
 * 立即同步——AI 在签名时刻后马上读到新世界，不等防抖窗口。
 * 失败静默（快照是增强项，不影响主流程）。
 *
 * @ai-context: One-way bridge from renderer retention stores to the
 * world_snapshots sqlite row. Debounced 2s on data change; immediate on
 * signature moments (mastery/genesis/settling) via the world event bus.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useEcosystemStore } from '../store/useEcosystemStore';
import { useDiscoveryStore } from '../store/useDiscoveryStore';
import { useWorldEvents } from '../store/useWorldEvents';

const SNAPSHOT_ID = 'latest';
const DEBOUNCE_MS = 2000;

export function useWorldSnapshotSync(): void {
  const corals = useEcosystemStore((s) => s.corals);
  const totalDepth = useEcosystemStore((s) => s.totalDepth);
  const discoveriesCount = useDiscoveryStore((s) => s.totalCount);
  // 签名时刻序列号（宪法第三条：掌握/创世/入籍）——事件驱动同步信号
  const signatureSeq = useWorldEvents((s) => s.signatureSeq);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 写快照（幂等 upsert，失败静默）——防抖与事件驱动共用 / Shared upsert */
  const write = useCallback(async () => {
    if (!window.electronAPI?.db) return;
    const healthy = corals.filter((c) => c.health === 'healthy').length;
    const payload = JSON.stringify({
      corals: {
        total: corals.length,
        healthy,
        bleached: corals.length - healthy,
        totalDepth,
      },
      discoveries: { count: discoveriesCount },
      capturedAt: new Date().toISOString(),
    });
    const row = { id: SNAPSHOT_ID, payload, updated_at: new Date().toISOString() };
    try {
      // 先查后写实现 upsert（db 桥查询方法白名单为 getAll/getById/count）
      const existing = await window.electronAPI.db.query('worldSnapshots', 'getById', [SNAPSHOT_ID]);
      if (existing) {
        await window.electronAPI.db.update('worldSnapshots', SNAPSHOT_ID, {
          payload, updated_at: row.updated_at,
        });
      } else {
        await window.electronAPI.db.insert('worldSnapshots', row);
      }
    } catch { /* 快照失败静默降级 */ }
  }, [corals, totalDepth, discoveriesCount]);

  // 数据变化：防抖 2s 后写（批量小变化合并为一次）
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void write(); }, DEBOUNCE_MS);
  }, [write]);

  // 事件驱动：签名时刻立即同步（取消挂起防抖，避免重复写）
  useEffect(() => {
    if (signatureSeq === 0) return;
    if (timer.current) clearTimeout(timer.current);
    void write();
  }, [signatureSeq, write]);

  // 卸载清理
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
}

