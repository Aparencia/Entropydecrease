/**
 * 虚拟自习室视图 — 4x3 座位网格
 * Virtual study room view — 4x3 seat grid
 *
 * @ai-context: 匿名占座 + 焦点状态点（绿色聚焦 / 琥珀休息 / 灰色离开）。
 * 我的座位记录在 localStorage（ed_studyroom_my_seat_v1），离线时仍可识别；
 * 离开座位且本次专注 ≥1 分钟触发完成庆祝微动画（emoji 飘散）。
 * 绝不展示他人学习内容——只有昵称/状态/专注分钟数。
 * @ai-context: Anonymous seats + focus dots; my seat is remembered locally
 * so it stays recognizable offline. Leaving after ≥1 min triggers a small
 * completion celebration. Never shows others' content.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Armchair, Loader2 } from 'lucide-react';
import { Card, CardContent, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { PresenceStatus, StudyRoom } from '../types';
import { getRoom, leaveSeat, occupySeat } from '../lib/studyroomApi';
import OfflineBanner from './OfflineBanner';

const SEAT_ROWS = 3;
const SEAT_COLS = 4;
const SEAT_TOTAL = SEAT_ROWS * SEAT_COLS;
const MY_SEAT_KEY = 'ed_studyroom_my_seat_v1';
const MY_SEAT_AT_KEY = 'ed_studyroom_my_seat_at_v1';

/** 焦点状态点颜色：聚焦绿 / 休息琥珀 / 离开灰 */
const STATUS_DOT: Record<PresenceStatus, string> = {
  focusing: 'bg-emerald-400',
  break: 'bg-amber-400',
  away: 'bg-gray-400',
};

const STATUS_LABEL: Record<PresenceStatus, string> = {
  focusing: '专注中',
  break: '休息中',
  away: '离开中',
};

interface StudyRoomViewProps {
  offlineReason: 'syncDisabled' | 'offline' | 'degraded' | null;
}

export default function StudyRoomView({ offlineReason }: StudyRoomViewProps) {
  const { toast } = useToast();
  const [room, setRoom] = useState<StudyRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [busySeatId, setBusySeatId] = useState<string | null>(null);
  const [mySeatId, setMySeatId] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<{ seatId: string; minutes: number } | null>(null);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // M4: ref 同步忙碌守卫——state 闭包在快速双击时可能未刷新，导致并发 leaveSeat/occupySeat
  const busySeatRef = useRef<string | null>(null);

  // 恢复本地记录的座位
  useEffect(() => {
    try {
      setMySeatId(localStorage.getItem(MY_SEAT_KEY));
    } catch { /* 忽略 */ }
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    const next = await getRoom();
    if (!mountedRef.current) return;
    if (next) setRoom(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  // 庆祝动画自动结束（1.8s 后清空）
  useEffect(() => {
    if (celebrate && !celebrateTimer.current) {
      celebrateTimer.current = setTimeout(() => {
        setCelebrate(null);
        celebrateTimer.current = null;
      }, 1800);
    }
    return () => {
      if (celebrateTimer.current) {
        clearTimeout(celebrateTimer.current);
        celebrateTimer.current = null;
      }
    };
  }, [celebrate]);

  const handleSeat = async (seatId: string, occupied: boolean) => {
    // M4: ref 同步守卫——state 闭包在双击时可能尚未刷新，两次点击会并发 leaveSeat
    if (busySeatRef.current) return;
    busySeatRef.current = seatId;
    setBusySeatId(seatId);
    try {
      if (occupied) {
        // 离开座位：本次专注 ≥1 分钟 → 完成庆祝
        const next = await leaveSeat(seatId);
        if (next) setRoom(next);
        setMySeatId(null);
        try {
          const atRaw = localStorage.getItem(MY_SEAT_AT_KEY);
          const minutes = atRaw ? Math.max(0, Math.round((Date.now() - Number(atRaw)) / 60000)) : 0;
          if (minutes >= 1) {
            setCelebrate({ seatId, minutes });
            toast({ type: 'success', message: `本次自习完成 ${minutes} 分钟，干得漂亮！` });
          }
          localStorage.removeItem(MY_SEAT_AT_KEY);
        } catch { /* 忽略 */ }
      } else {
        const next = await occupySeat(seatId);
        if (next) setRoom(next);
        setMySeatId(seatId);
        try {
          localStorage.setItem(MY_SEAT_KEY, seatId);
          localStorage.setItem(MY_SEAT_AT_KEY, String(Date.now()));
        } catch { /* 忽略 */ }
      }
    } finally {
      busySeatRef.current = null;
      setBusySeatId(null);
    }
  };

  const seats = room?.seats?.length
    ? room.seats
    : Array.from({ length: SEAT_TOTAL }, (_, i) => ({ seatId: `seat-${i + 1}`, status: 'available' as const }));

  return (
    <div className="flex flex-col gap-kb-md">
      {offlineReason && <OfflineBanner reason={offlineReason} />}

      <Card>
        <CardContent className="flex flex-col gap-kb-md">
          <div className="flex items-center justify-between">
            <h2 className="text-b1 font-medium text-text-primary flex items-center gap-2">
              <Armchair className="w-4 h-4 text-cyber" strokeWidth={1.5} />
              {room?.roomName ?? '自习室'}
            </h2>
            <span className="text-c1 text-text-tertiary tabular-nums">
              {room ? `${room.seats.filter((s) => s.status === 'occupied').length}/${room.capacity} 人在座` : `${SEAT_TOTAL} 座`}
            </span>
          </div>

          {/* 座位网格 */}
          {loading ? (
            <div className="flex items-center justify-center py-8 text-text-tertiary">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              正在打开自习室…
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-kb-sm" role="grid" aria-label="自习室座位">
              {seats.slice(0, SEAT_TOTAL).map((seat) => {
                const occupied = seat.status === 'occupied';
                const isMine = seat.seatId === mySeatId;
                // 联合收窄：仅 occupied 分支持有 occupant（回退占位座无此字段）
                const occupant = seat.status === 'occupied' ? seat.occupant : undefined;
                return (
                  <button
                    key={seat.seatId}
                    role="gridcell"
                    aria-label={`座位 ${seat.seatId}${occupied ? `（${occupant?.nickname ?? '有人'}）` : '（空）'}`}
                    onClick={() => void handleSeat(seat.seatId, occupied)}
                    disabled={busySeatId === seat.seatId}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-kb-lg border px-1 py-3 text-center transition-all duration-kb-fast',
                      occupied
                        ? 'border-border/50 bg-bg-elevated/50'
                        : 'border-dashed border-border/50 hover:border-cyber/40 hover:bg-cyber/5 cursor-pointer',
                      isMine && 'border-cyber/50 bg-cyber/10 ring-1 ring-cyber/30',
                      busySeatId === seat.seatId && 'opacity-60',
                    )}
                  >
                    <span className={cn(
                      'w-2 h-2 rounded-kb-full flex-shrink-0',
                      occupied ? STATUS_DOT[occupant?.focusStatus ?? 'away'] : 'bg-transparent border border-border/40',
                      occupied && 'animate-pulse',
                    )} aria-hidden="true" />
                    {occupied ? (
                      <>
                        <span className="text-c1 text-text-primary font-medium truncate max-w-full">
                          {isMine ? '我' : occupant?.nickname ?? '同学'}
                        </span>
                        <span className="text-c2 text-text-tertiary tabular-nums">
                          {STATUS_LABEL[occupant?.focusStatus ?? 'away']} · {occupant?.focusMinutes ?? 0}m
                        </span>
                      </>
                    ) : (
                      <span className="text-c1 text-text-tertiary">占座</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-c2 text-text-tertiary/70">
            点击空座入座，再次点击自己的座位离开 · 状态点：<span className="inline-block w-1.5 h-1.5 rounded-kb-full bg-emerald-400 align-middle mx-0.5" />专注
            <span className="inline-block w-1.5 h-1.5 rounded-kb-full bg-amber-400 align-middle mx-0.5" />休息
            <span className="inline-block w-1.5 h-1.5 rounded-kb-full bg-gray-400 align-middle mx-0.5" />离开
          </p>
        </CardContent>
      </Card>

      {/* 完成庆祝微动画：emoji 飘散 */}
      <AnimatePresence>
        {celebrate && (
          <motion.div
            key={`celebrate-${celebrate.seatId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
            aria-hidden="true"
          >
            {['🎉', '✨', '⭐', '🌟'].map((emoji, i) => (
              <motion.span
                key={i}
                className="absolute text-3xl"
                initial={{ y: 60, opacity: 0, scale: 0.5, x: 0 }}
                animate={{
                  y: -160 - i * 36,
                  x: i % 2 === 0 ? -56 - i * 10 : 56 + i * 10,
                  opacity: [0, 1, 1, 0],
                  scale: 1.3,
                }}
                transition={{ duration: 1.4, delay: i * 0.09, ease: 'easeOut' }}
              >
                {emoji}
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
