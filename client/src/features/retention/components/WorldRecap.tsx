/**
 * WorldRecap — 延时摄影开场（宪法 P2 · 每次打开看见生长）
 * WorldRecap — daily "the world grew while you were away" recap
 *
 * @ai-context: 每日首次打开时展示 6 秒的世界生长摘要（珊瑚/深度/发现
 * 的日间增量），把"变化"直接递到眼前——留存钩子 4（意外+生长）。
 * 基线存 localStorage：日期变化才结算，同日多次打开不重复打扰。
 * 零增长时只留一句温柔文案，无负向表达。
 *
 * @ai-context: Once per day, shows a 6-second growth recap (coral/depth/
 * discovery deltas). Baseline settles only on date change.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useEcosystemStore } from '../store/useEcosystemStore';
import { useDiscoveryStore } from '../store/useDiscoveryStore';

const BASELINE_KEY = 'ed-recap-baseline';
const RECAP_MS = 6000;

interface RecapBaseline {
  date: string;
  corals: number;
  totalDepth: number;
  discoveries: number;
}

interface RecapDeltas {
  corals: number;
  depth: number;
  discoveries: number;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function readBaseline(): RecapBaseline | null {
  try {
    const raw = localStorage.getItem(BASELINE_KEY);
    return raw ? (JSON.parse(raw) as RecapBaseline) : null;
  } catch {
    return null;
  }
}

export function WorldRecap() {
  const initialized = useEcosystemStore((s) => s.initialized);
  const corals = useEcosystemStore((s) => s.corals);
  const totalDepth = useEcosystemStore((s) => s.totalDepth);
  const discoveriesCount = useDiscoveryStore((s) => s.totalCount);
  const [deltas, setDeltas] = useState<RecapDeltas | null>(null);

  // 结算逻辑：数据就绪后比较基线；跨日才展示，任何情况下都把今天写回基线
  useEffect(() => {
    if (!initialized) return;

    const prev = readBaseline();
    const now: RecapBaseline = {
      date: today(),
      corals: corals.length,
      totalDepth,
      discoveries: discoveriesCount,
    };

    if (prev && prev.date !== now.date) {
      setDeltas({
        corals: Math.max(0, now.corals - prev.corals),
        depth: Math.max(0, now.totalDepth - prev.totalDepth),
        discoveries: Math.max(0, now.discoveries - prev.discoveries),
      });
    }

    try {
      localStorage.setItem(BASELINE_KEY, JSON.stringify(now));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized]);

  // 自动消散
  useEffect(() => {
    if (!deltas) return;
    const t = setTimeout(() => setDeltas(null), RECAP_MS);
    return () => clearTimeout(t);
  }, [deltas]);

  if (!deltas) return null;

  const lines: string[] = [];
  if (deltas.corals > 0) lines.push(`新种下 ${deltas.corals} 株珊瑚`);
  if (deltas.depth > 0) lines.push(`潜航加深 ${deltas.depth} 米`);
  if (deltas.discoveries > 0) lines.push(`新增 ${deltas.discoveries} 次深海发现`);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key={`recap-${deltas.depth}-${deltas.corals}`}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        transition={{ type: 'spring', stiffness: 200, damping: 26 }}
        onClick={() => setDeltas(null)}
        style={{
          position: 'fixed', left: 24, bottom: 24, zIndex: 55, cursor: 'pointer',
          maxWidth: 320, padding: '16px 20px', borderRadius: '16px 10px 14px 12px',
          background: 'rgba(13,24,44,0.78)', border: '1px solid rgba(111,180,232,0.25)',
          backdropFilter: 'blur(14px)', boxShadow: '0 8px 30px rgba(4,10,20,0.5)',
        }}
      >
        <div style={{ fontFamily: "'LXGW WenKai Lite','Noto Serif SC',serif", fontSize: 15, fontWeight: 700, letterSpacing: 2, color: '#E0E6F0' }}>
          你不在的时候，世界在生长
        </div>
        {lines.length > 0 ? (
          <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {lines.map((l) => (
              <li key={l} style={{ fontSize: 12.5, color: '#90A0B8', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6FB4E8', boxShadow: '0 0 6px #6FB4E8' }} />
                {l}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ marginTop: 10, fontSize: 12.5, color: '#90A0B8' }}>
            海面平静如昨——今天下去看看？
          </div>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
