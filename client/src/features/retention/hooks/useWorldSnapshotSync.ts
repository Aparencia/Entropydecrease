/**
 * 世界状态快照同步 Hook（宪法 P2 · discoveries/world_state 跨进程接线）
 * World snapshot sync hook (cross-process bridge to the MCP memory server)
 *
 * @ai-context: 珊瑚/发现数据存于渲染进程 IndexedDB，MCP 记忆服务器读主进程
 * sqlite——本 hook 是两者间的单向桥：订阅 retention store 变化，防抖 2s 后
 * 把摘要快照 upsert 到 world_snapshots 表（单行 id='latest'）。
 * 失败静默（快照是增强项，不影响主流程）。
 *
 * @ai-context: One-way bridge from renderer retention stores to the
 * world_snapshots sqlite row consumed by the MCP memory server.
 */
import { useEffect, useRef } from 'react';
import { useEcosystemStore } from '../store/useEcosystemStore';
import { useDiscoveryStore } from '../store/useDiscoveryStore';

const SNAPSHOT_ID = 'latest';
const DEBOUNCE_MS = 2000;

export function useWorldSnapshotSync(): void {
  const corals = useEcosystemStore((s) => s.corals);
  const totalDepth = useEcosystemStore((s) => s.totalDepth);
  const discoveriesCount = useDiscoveryStore((s) => s.totalCount);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!window.electronAPI?.db) return;

    const write = async () => {
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
        // 先查后写实现 upsert（db 桥无 put 语义）
        const existing = await window.electronAPI.db.query('worldSnapshots', 'get', [SNAPSHOT_ID]);
        if (existing) {
          await window.electronAPI.db.update('worldSnapshots', SNAPSHOT_ID, {
            payload, updated_at: row.updated_at,
          });
        } else {
          await window.electronAPI.db.insert('worldSnapshots', row);
        }
      } catch { /* 快照失败静默降级 */ }
    };

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void write(); }, DEBOUNCE_MS);
  }, [corals, totalDepth, discoveriesCount]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
}
