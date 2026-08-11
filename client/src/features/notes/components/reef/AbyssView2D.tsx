/**
 * 沉降深渊 2D 视图（深色主题形态）
 * Sinking Abyss 2D view (dark theme morph)
 *
 * @ai-context: 深色模式沉降深渊以 2D 实现（零 WebGL）——纵向滚动容器承载
 * 非对称沉积的卡片流，滚轮下拉 = 原生滚动（触摸/键盘滚动条免费获得）。
 * 遗忘雾双层（宪法映射「遗忘=混沌雾 ≤40%」实际渲染）：①世界雾带——绝对
 * 定位在深度坐标上（每 2.5 单位一条，透明度随深度 0.08→0.38 递增），
 * z-index 高于卡片，卡片滚动穿过时被真实遮挡（破雾感）；②视口雾——顶部
 * 海面光 + 底部渐暗的氛围层。卡片按时间衰减对数连续分布（浅密深疏）、
 * 确定性非对称错落（浅层聚集、深层被洋流冲散）。
 * @ai-context: Dark morph renders the abyss in pure 2D (no WebGL): a
 * vertical scroll container holds asymmetrically deposited cards; wheel
 * down = native scrolling. Forgetting mist (constitution: chaos mist ≤40%)
 * is truly rendered via world fog bands that occlude cards when scrolled
 * through, plus viewport ambience.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ABYSS_LAYERS, TEMPLATE_COLORS, TEMPLATE_FALLBACK,
  hashId, seeded, nodeBrightness, nodeSize, type ReefNote,
} from './reefTypes';
import { ReefSelectedCard } from './ReefCards';
import { useReefKeyboard } from './useReefKeyboard';

/** 深度 → 像素换算（px/单位） */
const PX_PER_UNIT = 60;
/** 最大深度（世界单位） */
const MAX_DEPTH = 22;
/** 海面留白（px） */
const SURFACE_PAD = 160;
/** 世界雾带间隔（世界单位） */
const FOG_INTERVAL = 2.5;
/** 卡片宽度基准（px，随 wordCount 微调） */
const CARD_BASE_W = 200;

interface CardPos {
  top: number;
  leftPct: number;
  scale: number;
  width: number;
}

/** 非对称沉积布局：时间衰减对数连续分布 + 确定性错落（浅层聚集、深层散开） */
function computePositions(notes: ReefNote[]): Map<string, CardPos> {
  const result = new Map<string, CardPos>();
  const now = Date.now();
  for (const note of notes) {
    const ageDays = Math.max(0, (now - new Date(note.updatedAt).getTime()) / 86400000);
    const y = Math.min(0, -Math.min(MAX_DEPTH, Math.log1p(ageDays) * 3.2) + (seeded(hashId(note.id) * 3) - 0.5) * 2.4);
    const depthRatio = Math.min(1, -y / MAX_DEPTH);
    // 浅层聚集（±25%）、深层散开（±60%）——洋流冲刷沉积
    const spread = 0.25 + depthRatio * 0.35;
    const leftPct = 50 + (seeded(hashId(note.id) * 5) - 0.5) * 2 * spread * 100;
    result.set(note.id, {
      top: SURFACE_PAD + (-y) * PX_PER_UNIT,
      leftPct,
      scale: 1 - depthRatio * 0.35,
      width: CARD_BASE_W + nodeSize(note.wordCount) * 400,
    });
  }
  return result;
}

interface AbyssView2DProps {
  notes: ReefNote[];
  selectedId: string | null;
  hoveredId: string | null;
  highlightIds?: ReadonlySet<string> | null;
  focusFolderId?: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onExit: () => void;
}

/** 沉降深渊（2D）/ Sinking Abyss (2D) */
export function AbyssView2D({
  notes, selectedId, hoveredId, highlightIds, focusFolderId,
  onHover, onSelect, onOpen, onExit,
}: AbyssView2DProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollDepth, setScrollDepth] = useState(0);

  const positions = useMemo(() => computePositions(notes), [notes]);
  const sortedCards = useMemo(
    () => [...notes].sort((a, b) => b.wordCount - a.wordCount),
    [notes],
  );
  const hoveredNote = useMemo(
    () => notes.find((n) => n.id === hoveredId) ?? null,
    [notes, hoveredId],
  );
  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId],
  );

  // 键盘导航：方向键切换选中后滚动到卡片可见；Enter 打开
  const handleSelect = useCallback((id: string) => {
    onSelect(id);
    scrollRef.current?.querySelector(`[data-card-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [onSelect]);
  useReefKeyboard({
    cards: sortedCards,
    selectedId,
    onSelect: handleSelect,
    onOpen,
    enabled: notes.length > 0,
  });

  // 滚动 → 深度（滚轮下拉 = 原生滚动）
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollDepth(Math.max(0, (el.scrollTop - SURFACE_PAD) / PX_PER_UNIT));
  }, []);

  const currentLayer = Math.min(
    ABYSS_LAYERS.length - 1,
    Math.max(0, Math.round(scrollDepth / 5)),
  );

  // 世界雾带：深度坐标固定，透明度随深度递增（宪法 ≤40%）
  const fogBands = useMemo(() => {
    const bands: Array<{ top: number; opacity: number }> = [];
    const count = Math.ceil(MAX_DEPTH / FOG_INTERVAL);
    for (let i = 0; i < count; i++) {
      bands.push({
        top: SURFACE_PAD + i * FOG_INTERVAL * PX_PER_UNIT,
        opacity: 0.08 + ((i + 0.5) * FOG_INTERVAL / MAX_DEPTH) * 0.3,
      });
    }
    return bands;
  }, []);

  // 层名刻度（海面/浅海/深海/海沟参考线）
  const layerMarks = useMemo(
    () => ABYSS_LAYERS.map((l) => ({ name: l.name, top: SURFACE_PAD + (-l.y) * PX_PER_UNIT })),
    [],
  );

  if (notes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-b2 text-text-tertiary">深海寂静——还没有笔记</p>
        <button
          onClick={onExit}
          className="px-3 py-1.5 rounded-kb-full text-c1 font-medium text-brand-600 hover:bg-brand-500/10 transition-colors"
        >
          返回列表创建
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* 纵向滚动容器（滚轮下拉 = 原生滚动） */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto [scrollbar-width:thin] scroll-smooth"
      >
        <div className="relative mx-auto" style={{ height: SURFACE_PAD + MAX_DEPTH * PX_PER_UNIT, maxWidth: 920 }}>
          {/* 深度背景渐变（深处渐暗） */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(74,155,217,0.14), rgba(10,22,32,0) 14%, rgba(4,10,16,0.45) 85%, rgba(2,6,10,0.9))' }}
            aria-hidden="true"
          />

          {/* 层名刻度 */}
          {layerMarks.map((m) => (
            <div key={m.name} className="absolute left-3 z-[5] flex items-center gap-2 pointer-events-none" style={{ top: m.top }}>
              <span className="text-[10px] tracking-[0.25em] uppercase text-text-tertiary/60">{m.name}</span>
              <span className="h-px w-14 bg-border/30" aria-hidden="true" />
            </div>
          ))}

          {/* 卡片层（非对称沉积） */}
          {sortedCards.map((note) => {
            const pos = positions.get(note.id);
            if (!pos) return null;
            const isSelected = note.id === selectedId;
            const isHovered = note.id === hoveredId;
            const color = TEMPLATE_COLORS.abyss[note.template] ?? TEMPLATE_FALLBACK.abyss;
            const dim = (focusFolderId != null && note.folderId !== focusFolderId)
              || (highlightIds != null && !highlightIds.has(note.id));
            return (
              <button
                key={note.id}
                data-card-id={note.id}
                onClick={() => onSelect(note.id)}
                onDoubleClick={() => onOpen(note.id)}
                onMouseEnter={() => onHover(note.id)}
                onMouseLeave={() => onHover(null)}
                className={cn(
                  'absolute z-10 -translate-x-1/2 text-left rounded-kb-lg overflow-hidden',
                  'bg-[rgba(13,26,38,0.92)] border backdrop-blur-sm',
                  'transition-all duration-300 cursor-pointer',
                  isSelected
                    ? 'border-brand-400/80 shadow-[0_0_24px_rgba(64,171,146,0.35)]'
                    : isHovered
                      ? 'border-cyber/50 shadow-[0_0_18px_rgba(74,155,217,0.28)]'
                      : 'border-border/40 hover:border-cyber/40',
                )}
                style={{
                  top: pos.top,
                  left: `${pos.leftPct}%`,
                  width: pos.width,
                  transform: `translateX(-50%) scale(${isHovered || isSelected ? pos.scale * 1.06 : pos.scale})`,
                  opacity: dim ? 0.35 : 1,
                  boxShadow: undefined,
                }}
                aria-label={`${note.title || '无标题'}，${note.wordCount} 字${isSelected ? '，已选中' : ''}`}
              >
                {/* 模板色条 */}
                <span className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: color }} aria-hidden="true" />
                <span className="block px-3.5 py-2.5">
                  <span className="block text-[13px] font-medium text-[#E2EAF2] truncate">
                    {note.title || '无标题'}
                  </span>
                  <span className="block text-[11px] text-[#647B90] mt-1 truncate">
                    {note.wordCount} 字{note.tags[0] ? ` · #${note.tags[0]}` : ''}
                  </span>
                </span>
              </button>
            );
          })}

          {/* 世界雾带（z-20：真实遮挡下方卡片，滚动穿过有破雾感） */}
          {fogBands.map((band, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 z-20 pointer-events-none"
              style={{
                top: band.top - FOG_INTERVAL * PX_PER_UNIT / 2,
                height: FOG_INTERVAL * PX_PER_UNIT,
                opacity: band.opacity,
                background: 'linear-gradient(to bottom, rgba(10,22,32,0), rgba(10,22,32,0.85) 50%, rgba(10,22,32,0))',
              }}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>

      {/* 视口雾（氛围：顶部海面光 + 底部渐暗，跟随视口） */}
      <div
        className="absolute inset-x-0 top-0 h-16 z-30 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(74,155,217,0.16), transparent 70%)' }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-0 bottom-0 h-10 z-30 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(2,6,10,0.55), transparent)' }}
        aria-hidden="true"
      />

      {/* 深度指示（左上） */}
      <div className="absolute left-4 top-4 z-40 pointer-events-none flex flex-col gap-1">
        <span className="text-[11px] tracking-[0.3em] text-text-tertiary/70 uppercase">Depth</span>
        <span className="text-b1 font-semibold text-text-primary">{ABYSS_LAYERS[currentLayer].name}</span>
        <span className="text-c1 text-text-tertiary tabular-nums">{Math.round(scrollDepth)}m / {MAX_DEPTH}m</span>
      </div>

      {/* 操作提示（左下） */}
      <p className="absolute left-4 bottom-4 z-40 text-c1 text-text-tertiary/70 pointer-events-none">
        滚轮下潜 · 单击选中 · 双击/Enter 打开 · 方向键切换
      </p>

      {/* 悬停小卡（右上） */}
      {hoveredNote && (
        <div className="absolute right-4 top-4 z-40 px-3 py-2 rounded-kb-md bg-bg-elevated/90 backdrop-blur border border-border/40 text-c1 text-text-primary shadow-kb-sm pointer-events-none max-w-[220px]">
          <span className="block truncate">{hoveredNote.title || '无标题'}</span>
          <span className="block text-c2 text-text-tertiary mt-0.5">
            亮度 {Math.round(nodeBrightness(hoveredNote) * 100)}% · {hoveredNote.tags[0] ? `#${hoveredNote.tags[0]}` : ''}
          </span>
        </div>
      )}

      {/* 选中详情卡 */}
      {selectedNote && <ReefSelectedCard note={selectedNote} onOpen={onOpen} />}
    </div>
  );
}

export default AbyssView2D;
