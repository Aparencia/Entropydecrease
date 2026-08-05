/**
 * 番茄钟协作接力面板 — 配对 / 状态 / 统计
 * Pomodoro relay panel — pairing / state / stats
 *
 * @ai-context: 三区块：① 配对请求（输入对方用户 id 发起，入向邀请可接受/
 * 拒绝）；② 接力状态（双方番茄阶段只显示阶段名与剩余时间，无内容）；
 * ③ 累计统计。轮询 8s，离线时保留本地缓存配对并显示离线横幅。
 * @ai-context: Three blocks — pair request, relay state (phases only,
 * no content), cumulative stats. 8s polling; cached pair stays readable
 * offline.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Handshake, Zap, Target } from 'lucide-react';
import { Card, CardContent, Button, Input, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { usePomodoroStore } from '@/features/pomodoro/store/usePomodoroStore';
import {
  acceptPair, getCachedPair, getIncomingPairs, getRelayState, getRelayStats,
  pairWithPartner, rejectPair,
} from '../lib/relayApi';
import { useSocialSync } from '../lib/useSocialSync';
import type { RelayPair, RelayStats } from '../types';
import OfflineBanner from './OfflineBanner';

interface RelayPanelProps {
  /** 显示离线横幅的外部原因（sync 未启用等） */
  offlineReason: 'syncDisabled' | 'offline' | null;
}

/** 双方番茄阶段 → 中文标签 */
const PHASE_LABELS: Record<string, string> = {
  work: '专注中',
  short_break: '短休',
  long_break: '长休',
};

export default function RelayPanel({ offlineReason }: RelayPanelProps) {
  const { toast } = useToast();
  const { online } = useSocialSync();
  const [partnerId, setPartnerId] = useState('');
  const [pair, setPair] = useState<RelayPair | null>(getCachedPair());
  const [incoming, setIncoming] = useState<RelayPair[]>([]);
  const [partnerState, setPartnerState] = useState<{ phase: string; remainingSeconds: number } | null>(null);
  const [stats, setStats] = useState<RelayStats | null>(null);
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);
  // M5: accept/reject 防双击——ref 同步守卫（state 闭包在快速双击时可能未刷新）
  const actionRef = useRef<string | null>(null);

  const pomodoro = usePomodoroStore((s) => ({
    phase: s.phase,
    isRunning: s.isRunning,
    remainingSeconds: s.remainingSeconds,
  }));

  const refresh = useCallback(async () => {
    const [incomingPairs, relayStats, cached] = await Promise.all([
      getIncomingPairs(), getRelayStats(), Promise.resolve(getCachedPair()),
    ]);
    if (!mountedRef.current) return;
    if (incomingPairs) setIncoming(incomingPairs);
    if (relayStats) setStats(relayStats);
    if (cached && cached.status === 'active') {
      setPair(cached);
      const state = await getRelayState(cached.id);
      // M5: await 之后可能已卸载/再次刷新——二次检查后再 setState，避免对卸载组件写入
      if (!mountedRef.current) return;
      if (state?.partner) setPartnerState(state.partner);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const timer = setInterval(() => { if (online) void refresh(); }, 8000);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh, online]);

  const handlePair = async () => {
    const target = partnerId.trim();
    if (!target || busy) return;
    setBusy(true);
    try {
      const result = await pairWithPartner(target);
      if (result) {
        setPair(result);
        setPartnerId('');
        toast({ type: 'success', message: '接力邀请已发出，等待对方接受' });
      } else {
        toast({ type: 'warning', message: '邀请发送失败：同步服务暂不可达' });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async (pairId: string) => {
    // M5: 双击防抖——同一时刻只处理一个邀请动作
    if (actionRef.current) return;
    actionRef.current = pairId;
    try {
      const result = await acceptPair(pairId);
      if (result) {
        setPair(result);
        toast({ type: 'success', message: '接力开始！互不打扰，各潜各的' });
      }
    } finally {
      actionRef.current = null;
    }
  };

  const handleReject = async (pairId: string) => {
    // M5: 双击防抖
    if (actionRef.current) return;
    actionRef.current = pairId;
    try {
      await rejectPair(pairId);
      setIncoming((prev) => prev.filter((p) => p.id !== pairId));
    } finally {
      actionRef.current = null;
    }
  };

  return (
    <div className="flex flex-col gap-kb-md">
      {offlineReason && <OfflineBanner reason={offlineReason} />}

      {/* ① 配对请求 */}
      <Card>
        <CardContent className="flex flex-col gap-kb-sm">
          <h2 className="text-b1 font-medium text-text-primary flex items-center gap-2">
            <Handshake className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
            番茄接力配对
          </h2>
          {pair && pair.status === 'active' ? (
            <div className="flex items-center justify-between rounded-kb-md border border-brand-500/30 bg-brand-500/5 px-kb-sm py-2">
              <span className="text-b2 text-text-secondary">
                与 <span className="font-medium text-text-primary">{pair.partnerNickname}</span> 接力中
              </span>
              <span className="text-c1 text-text-tertiary">完成番茄后自动上报</span>
            </div>
          ) : (
            <div className="flex gap-kb-sm">
              <Input
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
                placeholder="输入对方用户 ID"
                maxLength={64}
                onKeyDown={(e) => { if (e.key === 'Enter') void handlePair(); }}
                aria-label="对方用户 ID"
              />
              <Button
                onClick={() => void handlePair()}
                disabled={!partnerId.trim() || busy}
                loading={busy}
                className="flex-shrink-0"
              >
                发起接力
              </Button>
            </div>
          )}

          {/* 入向邀请 */}
          {incoming.length > 0 && (
            <ul className="flex flex-col gap-kb-xs">
              {incoming.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between rounded-kb-md border border-border/40 px-kb-sm py-2">
                  <span className="text-b2 text-text-primary">
                    <span className="font-medium">{inv.partnerNickname}</span>
                    <span className="ml-2 text-c1 text-text-tertiary">邀请你接力</span>
                  </span>
                  <span className="flex gap-2">
                    <Button size="sm" variant="primary" onClick={() => void handleAccept(inv.id)}>接受</Button>
                    <Button size="sm" variant="ghost" onClick={() => void handleReject(inv.id)}>拒绝</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ② 接力状态 */}
      {pair && pair.status === 'active' && (
        <Card>
          <CardContent className="flex flex-col gap-kb-sm">
            <h2 className="text-b1 font-medium text-text-primary flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent-500" strokeWidth={1.5} />
              接力状态
            </h2>
            <div className="grid grid-cols-2 gap-kb-sm">
              <StateCard label="我" phase={pomodoro.phase} remaining={pomodoro.remainingSeconds} self />
              <StateCard
                label={pair.partnerNickname}
                phase={partnerState?.phase ?? 'away'}
                remaining={partnerState?.remainingSeconds ?? 0}
              />
            </div>
            <p className="text-c1 text-text-tertiary">
              规则：各自完成一个番茄即算一次成功接力 · 隐私：仅共享阶段与剩余时间
            </p>
          </CardContent>
        </Card>
      )}

      {/* ③ 累计统计 */}
      <Card>
        <CardContent className="flex flex-col gap-kb-sm">
          <h2 className="text-b1 font-medium text-text-primary flex items-center gap-2">
            <Target className="w-4 h-4 text-flashcard" strokeWidth={1.5} />
            接力统计
          </h2>
          {stats ? (
            <div className="grid grid-cols-3 gap-kb-sm text-center">
              <StatItem label="累计专注" value={`${Math.round(stats.totalMinutes / 60)}h`} />
              <StatItem label="成功接力" value={`${stats.relayCount} 次`} />
              <StatItem label="接力成功率" value={`${Math.round(stats.successRate * 100)}%`} />
            </div>
          ) : (
            <p className="text-c1 text-text-tertiary text-center py-4">暂无可展示的接力统计</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** 单侧接力状态卡片 */
function StateCard({ label, phase, remaining, self = false }: {
  label: string; phase: string; remaining: number; self?: boolean;
}) {
  const isFocusing = phase === 'work';
  return (
    <div className={cn(
      'rounded-kb-md border px-kb-sm py-3 text-center',
      isFocusing ? 'border-semantic-success/40 bg-semantic-success/5' : 'border-border/40',
    )}>
      <p className="text-c1 text-text-tertiary mb-1">{label}{self ? '（我）' : ''}</p>
      <p className={cn('text-b1 font-medium', isFocusing ? 'text-semantic-success' : 'text-text-secondary')}>
        {PHASE_LABELS[phase] ?? '未开始'}
      </p>
      <p className="text-c1 text-text-tertiary mt-0.5 tabular-nums">
        {isFocusing ? `${Math.ceil(remaining / 60)} 分钟` : '—'}
      </p>
    </div>
  );
}

/** 统计单项 */
function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-kb-md border border-border/40 py-3">
      <p className="text-h3 text-text-primary">{value}</p>
      <p className="text-c1 text-text-tertiary mt-0.5">{label}</p>
    </div>
  );
}
