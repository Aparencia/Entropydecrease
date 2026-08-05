/**
 * 专注花园场景 — 植物网格可视化
 * Garden scene — plant grid visualization
 *
 * @ai-context: 纯 CSS/DOM 渲染（emoji + Tailwind），无 3D 依赖。植物外观
 * 随物种 + 生长阶段变化（seed → sprout → grown → bloom）；枯萎植株白化
 * （grayscale + 低透明度 + 雪花灰边），但可点击复活——可逆原则可视化。
 * 与珊瑚生态的 CoralEcosystem 同为身份认同机制的养成可视化。
 * @ai-context: Pure CSS/DOM rendering with emoji + Tailwind. Appearance
 * varies by species + stage; wilted plants white-out (grayscale) but stay
 * clickable to revive — the reversible principle made visible.
 */
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SPECIES_META, STAGE_LABEL, type GardenPlant } from '../types';

interface GardenSceneProps {
  plants: GardenPlant[];
  /** 选中植物（点击回调） / Selected plant */
  selectedId: string | null;
  onSelect: (plant: GardenPlant) => void;
}

export function GardenScene({ plants, selectedId, onSelect }: GardenSceneProps) {
  const prefersReduced = useReducedMotion();

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
      {plants.map((plant, i) => (
        <PlantTile
          key={plant.id}
          plant={plant}
          index={i}
          selected={plant.id === selectedId}
          prefersReduced={!!prefersReduced}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

/** 单株植物砖块 / Single plant tile */
function PlantTile({ plant, index, selected, prefersReduced, onSelect }: {
  plant: GardenPlant;
  index: number;
  selected: boolean;
  prefersReduced: boolean;
  onSelect: (plant: GardenPlant) => void;
}) {
  const meta = SPECIES_META[plant.species];
  const emoji = meta.emoji[plant.stage];
  const wilted = plant.wilted;

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(plant)}
      initial={prefersReduced ? {} : { opacity: 0, scale: 0.8, y: 8 }}
      animate={prefersReduced ? {} : { opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.3 }}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-xl border p-2.5 pt-3 relative',
        'transition-colors duration-300',
        selected
          ? 'border-brand-400/60 bg-brand-500/8 shadow-[0_0_12px] shadow-brand-500/20'
          : 'border-border/30 bg-bg-secondary/50 hover:border-brand-400/30 hover:bg-bg-secondary',
        wilted && 'bg-gray-100/40 dark:bg-white/[0.03]',
      )}
      aria-label={`${plant.name}·${STAGE_LABEL[plant.stage]}${wilted ? '·已枯萎' : ''}`}
    >
      {/* 植物本体：枯萎时白化（saturate-0 + 低透明度 + 淡出颜色） */}
      <span
        className={cn(
          'text-[26px] leading-none transition-all duration-500',
          wilted && 'grayscale opacity-35 blur-[0.5px]',
          plant.stage === 'bloom' && !wilted && 'animate-breathe',
        )}
        aria-hidden
      >
        {emoji}
      </span>

      {/* 名称 + 生长阶段 */}
      <span className={cn(
        'text-[11px] font-medium leading-tight',
        wilted ? 'text-text-tertiary/50' : 'text-text-primary',
      )}>
        {plant.name}
      </span>
      <span className={cn(
        'text-[10px] leading-none',
        wilted ? 'text-text-tertiary/40' : 'text-text-tertiary',
      )}>
        {wilted ? '枯萎 · 可复活' : `${STAGE_LABEL[plant.stage]} · ${plant.focusMinutes} 分钟`}
      </span>

      {/* 枯萎雪化角标 / Wilt badge */}
      {wilted && (
        <span className="absolute top-1 right-1 text-[10px]" title="已枯萎，浇水/复活可恢复" aria-hidden>
          ❄️
        </span>
      )}
    </motion.button>
  );
}
