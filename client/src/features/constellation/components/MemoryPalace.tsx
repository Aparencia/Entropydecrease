/**
 * 记忆宫殿（4.10）
 * Memory palace
 *
 * @ai-context: 2D 房间序列：房间=来源模块卡片（一行横向排布，路径即
 * 记忆宫殿动线），知识=发光 orb（金色辉光圆点，hover 显示概念名）。
 * 走查复习模式：按房间逐个步进，每房间展示记忆项召回提示——先只给
 * hint 线索（不剧透答案），「回忆好了，翻卡确认」后才揭示概念；全部
 * 走完触发 onReviewComplete。纯本地 state，无持久化。数据由
 * lib/evolutionData.deriveMemoryRooms 派生，组件只消费。
 *
 * @ai-context: A row of room cards (module groups) with glowing orbs for
 * knowledge items; walk-through review steps room by room with recall
 * prompts (hint first, reveal the concept on demand).
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Castle, Eye, EyeOff } from 'lucide-react';
import type { MemoryRoom } from '../lib/mapTypes';

/** 走查模式：'browse' 浏览房间行 | 'walk' 逐间复习 */
type WalkMode = 'browse' | 'walk';

/** 发光 orb 色（金色辉光，记忆宫殿意象） */
const ORB_GLOW = '#fbbf24';

/**
 * 记忆宫殿 / Memory palace
 * @param rooms - 房间序列（房间=来源模块，items=概念+复习提示）
 * @param onReviewComplete - 全部房间走查完成回调
 */
export function MemoryPalace({
  rooms,
  onReviewComplete,
}: {
  rooms: MemoryRoom[];
  onReviewComplete?: () => void;
}) {
  const [mode, setMode] = useState<WalkMode>('browse');
  const [roomIdx, setRoomIdx] = useState(0);
  const [itemIdx, setItemIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const totalItems = useMemo(
    () => rooms.reduce((sum, r) => sum + r.items.length, 0),
    [rooms],
  );
  const room = rooms[roomIdx];
  const item = room?.items[itemIdx];

  // 开始走查：回到第一间第一个记忆项
  const startWalk = () => {
    setRoomIdx(0);
    setItemIdx(0);
    setRevealed(false);
    setMode('walk');
  };

  // 揭示概念后：推进到下一项；房间走完则推进到下一间；全部完成回浏览
  const advance = () => {
    setRevealed(false);
    if (!room) return;
    if (itemIdx + 1 < room.items.length) {
      setItemIdx((i) => i + 1);
    } else if (roomIdx + 1 < rooms.length) {
      setRoomIdx((i) => i + 1);
      setItemIdx(0);
    } else {
      setMode('browse');
      onReviewComplete?.();
    }
  };

  if (rooms.length === 0 || totalItems === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-kb-md text-center text-text-secondary">
        <Castle className="w-10 h-10 text-text-tertiary/40" strokeWidth={1.2} />
        <p className="text-b2">记忆宫殿还没有房间</p>
        <p className="text-c1 text-text-tertiary max-w-sm">
          概念会按来源模块归入房间，复习时在这里沿宫殿路径走查。
        </p>
      </div>
    );
  }

  // ── 走查模式：逐房间步进的召回卡片 ──
  if (mode === 'walk' && room && item) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 px-6">
        {/* 进度：第 X 间 / 共 N 间 · 第 Y 项 */}
        <div className="flex items-center gap-3 text-c1 text-text-tertiary">
          <span>
            {roomIdx + 1} / {rooms.length} 间 · {itemIdx + 1} / {room.items.length} 项
          </span>
          <div className="w-40 h-1 rounded-full bg-bg-tertiary/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500/60 transition-all duration-300"
              style={{
                width: `${((roomIdx + (itemIdx + 1) / room.items.length) / rooms.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* 召回卡片：hint 线索 + 翻卡揭示 */}
        <div className="w-full max-w-md rounded-kb-lg border border-border/50 bg-bg-elevated/60 px-6 py-8 text-center shadow-kb-md">
          <p className="text-c1 text-text-tertiary mb-1">进入「{room.name}」房间</p>
          {revealed ? (
            <p className="text-b1 font-medium text-text-primary">{item.concept}</p>
          ) : (
            <>
              <EyeOff className="w-6 h-6 mx-auto mb-2 text-text-tertiary/50" strokeWidth={1.4} />
              <p className="text-b2 text-text-secondary leading-relaxed">{item.hint}</p>
              <p className="mt-2 text-c1 text-text-tertiary/70">先在脑中回忆这个概念…</p>
            </>
          )}
        </div>

        {/* 操作：翻卡确认 → 推进 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMode('browse')}
            className="flex items-center gap-1.5 rounded-kb-sm px-3 py-1.5 text-c1 text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            退出
          </button>
          <button
            onClick={revealed ? advance : () => setRevealed(true)}
            className="flex items-center gap-1.5 rounded-kb-md bg-brand-500 px-4 py-2 text-c1 font-medium text-white shadow-kb-sm hover:bg-brand-600 transition-colors active:scale-95"
          >
            {revealed ? (
              <>
                回忆确认，下一项
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                回忆好了，翻卡确认
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── 浏览模式：房间卡片行 + 发光 orb ──
  return (
    <div className="h-full flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-c1 text-text-tertiary">
          共 {rooms.length} 间房间 · {totalItems} 个知识记忆项
        </p>
        <button
          onClick={startWalk}
          className="flex items-center gap-1.5 rounded-kb-md bg-brand-500 px-3.5 py-1.5 text-c1 font-medium text-white shadow-kb-sm hover:bg-brand-600 transition-colors active:scale-95"
        >
          <Eye className="w-3.5 h-3.5" />
          开始走查复习
        </button>
      </div>
      {/* 宫殿路径：房间从左到右一字排开 */}
      <div className="flex-1 flex items-center gap-4 overflow-x-auto pb-2">
        {rooms.map((r, i) => (
          <div
            key={r.id}
            className="relative flex flex-col items-center gap-2 rounded-kb-lg border border-border/50 bg-bg-elevated/60 px-5 py-4 min-w-[150px] flex-shrink-0 shadow-kb-sm"
          >
            {/* 路径连线（房间之间的宫殿通道） */}
            {i < rooms.length - 1 && (
              <span className="absolute top-1/2 -right-4 w-4 border-t border-dashed border-text-tertiary/30" />
            )}
            <span className="text-c1 text-text-tertiary">{r.name}</span>
            <span className="text-c1 text-text-tertiary/60">{r.items.length} 项</span>
            <div className="flex flex-wrap justify-center gap-1.5 max-w-[120px]">
              {r.items.map((it) => (
                <span
                  key={it.concept}
                  title={it.concept}
                  className="w-3 h-3 rounded-full cursor-help transition-transform hover:scale-150"
                  style={{ background: ORB_GLOW, boxShadow: `0 0 8px ${ORB_GLOW}99` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
