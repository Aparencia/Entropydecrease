/**
 * 协作深潜房间视图 — 成员在场网格 + 自我番茄进度 + cheer
 * Deep dive room view — presence grid + own pomodoro progress + cheer
 *
 * @ai-context: 隐私红线——成员卡片只展示昵称/状态/专注分钟/任务摘要
 * （用户主动填写），绝不渲染其他用户的学习内容。自己的番茄进度来自
 * usePomodoroStore（实时），cheer 为预设表情轻互动。
 * @ai-context: Privacy line — member cards show nickname/status/minutes/
 * self-reported task summary only; own pomodoro progress is real-time
 * from usePomodoroStore; cheers are preset emoji.
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { DoorOpen, Timer } from 'lucide-react';
import { Card, CardContent, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/AuthContext';
import { usePomodoroStore } from '@/features/pomodoro/store/usePomodoroStore';
import { CHEER_EMOJIS, type RoomStateResult } from '../hooks/useRoomState';
import type { PresenceStatus, RoomPresence } from '../types';

interface DeepDiveRoomViewProps {
  roomId: string;
  state: RoomStateResult;
  onLeave: () => void;
}

/** 状态点颜色：专注绿 / 休息琥珀 / 离开灰 */
const STATUS_STYLES: Record<PresenceStatus, string> = {
  focusing: 'bg-semantic-success',
  break: 'bg-semantic-warning',
  away: 'bg-text-tertiary/40',
};

const STATUS_LABELS: Record<PresenceStatus, string> = {
  focusing: '专注中',
  break: '休息中',
  away: '暂离',
};

export default function DeepDiveRoomView({ roomId, state, onLeave }: DeepDiveRoomViewProps) {
  const { room, cheerFor } = state;
  const { user } = useAuth();
  const pomodoro = usePomodoroStore((s) => ({
    phase: s.phase,
    isRunning: s.isRunning,
    remainingSeconds: s.remainingSeconds,
    totalSeconds: s.totalSeconds,
  }));

  // 自己的番茄进度百分比（休息阶段显示 0，避免误导）
  const selfProgress = useMemo(() => {
    if (pomodoro.phase !== 'work' || pomodoro.totalSeconds === 0) return 0;
    return Math.round(((pomodoro.totalSeconds - pomodoro.remainingSeconds) / pomodoro.totalSeconds) * 100);
  }, [pomodoro]);

  const members = room?.members ?? [];
  // 自己身份：优先匹配当前登录用户 id，未登录时无法标注（匿名在场）
  const self = user ? members.find((m) => m.userId === user.id) : undefined;

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-kb-md">
        {/* 房间头 */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-h3 text-text-primary">{room?.name ?? '深潜房间'}</h2>
            <p className="text-c1 text-text-tertiary mt-0.5">
              {members.length} 位潜航员同在 · 每 5 秒同步一次在场状态
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onLeave} icon={<DoorOpen className="w-4 h-4" />}>
            离开
          </Button>
        </div>

        {/* 我的番茄进度 */}
        <div className="rounded-kb-md border border-border/40 bg-bg-elevated/40 px-kb-sm py-2">
          <div className="flex items-center justify-between text-c1">
            <span className="flex items-center gap-1.5 text-text-secondary">
              <Timer className="w-3.5 h-3.5" strokeWidth={1.5} />
              我的深潜
            </span>
            <span className="text-text-tertiary">
              {pomodoro.phase === 'work'
                ? `${Math.ceil(pomodoro.remainingSeconds / 60)} 分钟剩余`
                : pomodoro.phase === 'short_break' ? '短休' : '长休'}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-kb-full bg-bg-tertiary/50 overflow-hidden">
            <motion.div
              className="h-full rounded-kb-full bg-brand-500"
              animate={{ width: `${selfProgress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* 成员在场网格 */}
        {members.length === 0 ? (
          <p className="text-c1 text-text-tertiary text-center py-6">房间暂时只有你，稍等同伴入水…</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-kb-sm">
            {members.map((m) => (
              <PresenceCard key={m.userId} member={m} isSelf={m === self} />
            ))}
          </ul>
        )}

        {/* Cheer 轻互动 */}
        <div className="flex items-center gap-2">
          <span className="text-c1 text-text-tertiary mr-1">为同伴加油</span>
          {CHEER_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => void cheerFor(emoji)}
              aria-label={`发送 ${emoji}`}
              className="w-9 h-9 flex items-center justify-center rounded-kb-full border border-border/40 bg-bg-elevated/40 text-lg hover:scale-110 hover:border-brand-500/40 active:scale-90 transition-transform duration-kb-fast"
            >
              {emoji}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** 单个成员在场卡片（匿名化：无内容，仅状态） */
function PresenceCard({ member, isSelf }: { member: RoomPresence; isSelf: boolean }) {
  return (
    <li
      className={cn(
        'flex items-start gap-2.5 rounded-kb-md border border-border/40 p-2.5',
        isSelf && 'border-brand-500/30 bg-brand-500/5',
      )}
    >
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 rounded-kb-full bg-gradient-to-br from-brand-400/70 to-accent-500/70 flex items-center justify-center text-white text-b3 font-semibold">
          {member.nickname.charAt(0).toUpperCase()}
        </div>
        {/* 专注状态点：绿=专注 / 琥珀=休息 / 灰=暂离 */}
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-kb-full border-2 border-bg-secondary',
            STATUS_STYLES[member.status],
          )}
          title={STATUS_LABELS[member.status]}
        />
      </div>
      <div className="min-w-0">
        <p className="text-b2 text-text-primary truncate">
          {member.nickname}
          {isSelf && <span className="ml-1 text-c1 text-text-tertiary">(我)</span>}
        </p>
        <p className="text-c1 text-text-tertiary">
          {STATUS_LABELS[member.status]} · {member.focusMinutes} 分钟
        </p>
        {member.taskSummary && (
          <p className="text-c1 text-text-secondary/70 truncate mt-0.5 italic">「{member.taskSummary}」</p>
        )}
      </div>
    </li>
  );
}
