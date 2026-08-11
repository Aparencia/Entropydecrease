/**
 * 知识折纸 — CSS 3D 折叠卡片
 * Knowledge origami — CSS 3D folding card
 *
 * @ai-context: 纯本地展示组件，无路由/无 store 依赖。五种折叠类型：
 * 对折(compare)/三角折(three)/风车折(multi-dim)/盒子折(layered)/
 * 花折(associated)，点击卡片用 CSS 3D transform（perspective +
 * preserve-3d + rotate）展开各面板，details 按面板数切片展示。
 * 折叠态 = 知识收拢（记忆），展开态 = 知识摊开（理解）。
 * @ai-context: Local-only presentational component. Click to unfold
 * panels via CSS 3D transforms. Fold = memory, unfold = understanding.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, FoldHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FoldType = 'fold' | 'triangle' | 'pinwheel' | 'box' | 'flower';

export interface OrigamiViewProps {
  /** 标题 / Title */
  title: string;
  /** 摘要（封面显示） / Summary shown on the folded cover */
  summary: string;
  /** 细节列表（按面板切片展示） / Details, sliced across panels */
  details: string[];
  /** 折叠类型 / Fold type */
  foldType: FoldType;
  className?: string;
}

/** 折叠类型元信息 / Fold type metadata */
const FOLD_META: Record<FoldType, { label: string; hint: string }> = {
  fold: { label: '对折 · 对比', hint: '左右两半，A/B 对照' },
  triangle: { label: '三角折 · 三要素', hint: '上中下三层，因果递进' },
  pinwheel: { label: '风车折 · 多维', hint: '四象限，多维度展开' },
  box: { label: '盒子折 · 分层', hint: '层层嵌套，由浅入深' },
  flower: { label: '花折 · 关联', hint: '花瓣环绕，联想发散' },
};

const PANEL_COUNT: Record<FoldType, number> = {
  fold: 2,
  triangle: 3,
  pinwheel: 4,
  box: 4,
  flower: 6,
};

const TRANSITION = 'transform 700ms cubic-bezier(0.34, 1.3, 0.64, 1)';

/**
 * 面板折叠/展开 transform（按类型 + 序号计算）
 * @returns { closed, open, origin } 三件套
 */
function panelTf(foldType: FoldType, i: number, total: number): { closed: string; open: string; origin?: string } {
  switch (foldType) {
    case 'fold': // 对折：左右两页绕 Y 轴合拢
      return i % 2 === 0
        ? { closed: 'rotateY(86deg)', open: 'rotateY(0deg)', origin: 'left' }
        : { closed: 'rotateY(-86deg)', open: 'rotateY(0deg)', origin: 'right' };
    case 'triangle': // 三角折：上下两页绕 X 轴合拢
      if (i === 0) return { closed: 'rotateX(86deg)', open: 'rotateX(0deg)', origin: 'top' };
      if (i === total - 1) return { closed: 'rotateX(-86deg)', open: 'rotateX(0deg)', origin: 'bottom' };
      return { closed: 'rotateX(0deg)', open: 'rotateX(0deg)' };
    case 'pinwheel': // 风车折：四象限向中心旋转合拢
      return {
        closed: `rotateZ(${i === 0 || i === 3 ? -94 : 94}deg)`,
        open: 'rotateZ(0deg)',
      };
    case 'box': // 盒子折：手风琴式交替合拢
      return i % 2 === 0
        ? { closed: 'rotateY(88deg)', open: 'rotateY(0deg)', origin: 'left' }
        : { closed: 'rotateY(-88deg)', open: 'rotateY(0deg)', origin: 'right' };
    case 'flower': // 花折：花瓣立起收拢，展开后环绕
    default: {
      const angle = (360 / total) * i;
      return {
        closed: 'rotateY(84deg)',
        open: `rotateZ(${angle}deg) translateX(46%) rotateZ(${-angle}deg)`,
        origin: 'center',
      };
    }
  }
}

export function OrigamiView({ title, summary, details, foldType, className }: OrigamiViewProps) {
  const [unfolded, setUnfolded] = useState(false);
  const total = PANEL_COUNT[foldType];
  const meta = FOLD_META[foldType];

  // details 按面板切片（不足补摘要，超出截断） / Slice details across panels
  const panels: Array<{ heading: string; body: ReactNode }> = [];
  for (let i = 0; i < total; i += 1) {
    const slice = details.slice(Math.floor((i * details.length) / total), Math.floor(((i + 1) * details.length) / total));
    panels.push({
      heading: i === 0 ? title : `${meta.label.split('·')[1]?.trim() ?? '细节'} ${i + 1}`,
      body: slice.length > 0 ? (
        <ul className="flex flex-col gap-1 text-c1 text-text-secondary">
          {slice.map((d) => (
            <li key={d} className="flex items-start gap-1.5">
              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-brand-400/70" aria-hidden />
              {d}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-c1 text-text-secondary">{summary}</p>
      ),
    });
  }

  const isFlower = foldType === 'flower';

  return (
    <div
      className={cn('flex flex-col gap-3', className)}
      style={{ perspective: '1200px' }}
    >
      {/* 折叠封面 / Folded cover */}
      <button
        type="button"
        onClick={() => setUnfolded((v) => !v)}
        aria-expanded={unfolded}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors',
          unfolded
            ? 'border-brand-400/40 bg-brand-500/8'
            : 'border-border/40 bg-bg-secondary/60 hover:border-brand-400/30',
        )}
      >
        <span className="flex items-center gap-2 text-b1 font-semibold text-text-primary">
          <FoldHorizontal className="w-4 h-4 text-brand-400" aria-hidden />
          {title}
        </span>
        <span className="flex items-center gap-2">
          <span className="hidden rounded-full bg-bg-tertiary px-2.5 py-0.5 text-c2 font-medium text-text-tertiary sm:inline">
            {meta.label} · {meta.hint}
          </span>
          <ChevronDown
            className={cn('w-4 h-4 text-text-tertiary transition-transform duration-300', unfolded && 'rotate-180')}
            aria-hidden
          />
        </span>
      </button>

      {/* 3D 折叠面板区 / 3D folding panel area */}
      <div
        className={cn(
          'relative rounded-2xl border border-border/30 bg-bg-secondary/40 transition-all duration-700',
          unfolded ? 'p-3' : 'h-0 overflow-hidden border-transparent p-0 opacity-0',
          isFlower && 'h-72',
        )}
      >
        <div
          className={cn(
            'flex h-full w-full gap-2',
            !isFlower && !unfolded && 'invisible',
            foldType === 'fold' && 'flex-row',
            foldType === 'triangle' && 'flex-col',
            foldType === 'pinwheel' && 'grid grid-cols-2 grid-rows-2',
            foldType === 'box' && 'flex-col',
            isFlower && 'relative items-center justify-center',
          )}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {panels.map((panel, i) => {
            const tf = panelTf(foldType, i, total);
            const style: CSSProperties = {
              transform: unfolded ? tf.open : tf.closed,
              transition: TRANSITION,
              transformOrigin: tf.origin,
              transformStyle: 'preserve-3d',
            };
            const panelClass = cn(
              'flex flex-col gap-1.5 rounded-xl border border-border/30 bg-bg-tertiary/60 p-3 backdrop-blur-sm',
              !isFlower && 'flex-1',
              foldType === 'box' && 'min-h-0 flex-1 basis-0',
              isFlower && 'absolute left-1/2 top-1/2 h-24 w-24 -ml-12 -mt-12',
              foldType === 'pinwheel' && 'min-h-24',
              foldType === 'triangle' && 'min-h-16',
            );
            const inner: CSSProperties = {
              transform: unfolded && isFlower ? `rotateZ(${-(360 / total) * i}deg)` : undefined,
              transition: TRANSITION,
            };
            return (
              <div key={`${panel.heading}-${i}`} className={panelClass} style={style}>
                <div style={inner} className={cn(!unfolded && 'opacity-0', 'transition-opacity duration-500 delay-300')}>
                  <h4 className="text-c1 font-semibold text-text-primary">{panel.heading}</h4>
                  <div className="mt-1">{panel.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default OrigamiView;
