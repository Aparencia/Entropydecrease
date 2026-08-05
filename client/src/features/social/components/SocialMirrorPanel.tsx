/**
 * 学习社交镜像面板 — "此刻有 N 人正在学习同类内容"
 * Social mirror panel — "N people are studying similar content right now"
 *
 * @ai-context: 匿名镜像——输入主题 → 本地 hash → 上报/查询匿名计数。
 * 只展示"人数与主题 hash"，绝不展示他人内容。本地缓存最近上报的主题，
 * 断网时显示上次的计数（stale 数据优于空白）。
 * @ai-context: Anonymous mirror — topic input is hashed locally; only
 * counts and hashes are shown. Caches last-known counts for offline view.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Radar, Loader2 } from 'lucide-react';
import { Card, CardContent, Button, Input, useToast } from '@/components/ui';
import { getPulseCount, getPeers, hashTopic, sendPulse, listPulses } from '../lib/socialPulse';
import { useSocialSync } from '../lib/useSocialSync';
import type { PeerOverview, TopicPulse } from '../types';
import OfflineBanner from './OfflineBanner';

interface SocialMirrorPanelProps {
  offlineReason: 'syncDisabled' | 'offline' | null;
}

const RECENT_KEY = 'ed_mirror_recent_v1';

export default function SocialMirrorPanel({ offlineReason }: SocialMirrorPanelProps) {
  const { online } = useSocialSync();
  const { toast } = useToast();
  const [topic, setTopic] = useState('');
  const [pulses, setPulses] = useState<TopicPulse[]>([]);
  const [peers, setPeers] = useState<PeerOverview[]>([]);
  const [recentCount, setRecentCount] = useState<number | null>(null);
  const [recentHash, setRecentHash] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const [pulseList, peerList] = await Promise.all([listPulses(), getPeers()]);
    if (!mountedRef.current) return;
    if (pulseList) setPulses(pulseList);
    if (peerList) setPeers(peerList);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const timer = setInterval(() => { if (online) void refresh(); }, 10000);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh, online]);

  const handleSend = async () => {
    const trimmed = topic.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const h = await hashTopic(trimmed);
      // M1: 只上报匿名 hash，明文主题（label）仅本地展示，绝不发送到服务端
      const [sent, count] = await Promise.all([sendPulse(h), getPulseCount(h)]);
      if (sent) {
        setRecentHash(h);
        setRecentCount(count);
        try {
          localStorage.setItem(RECENT_KEY, JSON.stringify({ hash: h, count, at: Date.now() }));
        } catch { /* 忽略存储失败 */ }
        toast({ type: 'success', message: '已加入同频学习（匿名）' });
      } else {
        // 服务不可达 → 展示本地缓存或静默
        toast({ type: 'warning', message: '上报失败：同步服务暂不可达，稍后自动重试' });
      }
    } finally {
      setBusy(false);
    }
  };

  // 恢复上次成功计数（离线展示 stale 数据）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { hash: string; count: number };
        setRecentHash(saved.hash);
        setRecentCount(saved.count);
      }
    } catch { /* 忽略 */ }
  }, []);

  return (
    <div className="flex flex-col gap-kb-md">
      {offlineReason && <OfflineBanner reason={offlineReason} />}

      {/* 主题上报 */}
      <Card>
        <CardContent className="flex flex-col gap-kb-sm">
          <h2 className="text-b1 font-medium text-text-primary flex items-center gap-2">
            <Radar className="w-4 h-4 text-cyber" strokeWidth={1.5} />
            此刻同频
          </h2>
          <div className="flex gap-kb-sm">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="正在学习什么？只上报匿名计数，不公开内容"
              maxLength={60}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSend(); }}
              aria-label="学习主题"
            />
            <Button
              onClick={() => void handleSend()}
              disabled={!topic.trim() || busy}
              loading={busy}
              className="flex-shrink-0"
            >
              加入
            </Button>
          </div>

          {/* 同频人数展示（大数字 + hash 确认） */}
          {recentHash && (
            <div className="rounded-kb-md border border-cyber/30 bg-cyber/5 px-kb-sm py-3 text-center">
              <p className="text-c1 text-text-tertiary">此刻有</p>
              <p className="text-d2 text-text-primary tabular-nums my-1">
                {recentCount === null ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : recentCount}
              </p>
              <p className="text-c1 text-text-tertiary">人在学习同类内容</p>
              <p className="text-c2 text-text-tertiary/60 mt-1 font-mono break-all">#{recentHash}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 同频概览（topicHash + count） */}
      <Card>
        <CardContent className="flex flex-col gap-kb-sm">
          <h2 className="text-b1 font-medium text-text-primary">同频者概览</h2>
          {peers.length === 0 && pulses.length === 0 ? (
            <p className="text-c1 text-text-tertiary text-center py-4">
              还没有同频信号，成为第一个吧
            </p>
          ) : (
            <ul className="flex flex-col gap-kb-xs">
              {(pulses.length > 0 ? pulses : peers).map((p) => (
                <li
                  key={p.topicHash}
                  className="flex items-center justify-between rounded-kb-md border border-border/40 px-kb-sm py-2"
                >
                  <span className="font-mono text-c1 text-text-secondary truncate">#{p.topicHash}</span>
                  <span className="flex items-center gap-1.5 text-c1 text-text-tertiary flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-kb-full bg-cyber animate-pulse" />
                    {p.count} 人
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
