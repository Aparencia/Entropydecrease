/**
 * 专注花园页
 * Focus garden page
 *
 * @ai-context: 全页花园：生态阶段横幅 + 统计 + 植物网格 + 选中植物详情。
 * 植物详情展示专注记录（物种/种植时间/累计分钟/枯萎与复活史），枯萎
 * 植株可一键复活（可逆原则）。数据经 useGardenStore（localStorage）。
 * @ai-context: Full garden page: ecosystem stage banner + stats + plant grid
 * + focus record detail panel. Wilted plants can be revived anytime.
 */
import { useEffect, useMemo, useState } from 'react';
import { Droplets, Sprout, Flower2, Leaf } from 'lucide-react';
import { cn } from '@/lib/utils';
import RitualHeader from '@/features/inspiration/components/RitualHeader';
import { Button } from '@/components/ui';
import { GardenScene } from './GardenScene';
import { computeGardenStats, useGardenStore } from '../lib/gardenStore';
import {
  SPECIES_META, STAGE_LABEL, ECOSYSTEM_STAGE_META,
  type GardenEcosystemStage, type GardenPlant,
} from '../types';

export default function GardenPage() {
  // 分别订阅：plants（数据源）与 actions（引用稳定）
  const plants = useGardenStore((s) => s.plants);
  const initialize = useGardenStore((s) => s.initialize);
  const waterPlant = useGardenStore((s) => s.waterPlant);
  const revivePlant = useGardenStore((s) => s.revivePlant);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // M13: 只存选中 id，植物对象每次渲染从 store 派生——浇水/复活后详情面板实时刷新，
  // 不再持有旧快照
  const selected = plants.find((p) => p.id === selectedId) ?? null;

  // 挂载时执行枯萎检查（幂等）
  useEffect(() => {
    initialize();
  }, [initialize]);

  const stats = useMemo(() => computeGardenStats(plants), [plants]);
  const stageMeta = ECOSYSTEM_STAGE_META[stats.ecosystemStage];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-kb-lg py-kb-xl">
      <RitualHeader title="专注花园" note="一草一木 皆为序章" />

      {/* 生态阶段横幅 / Ecosystem stage banner */}
      <div className="flex items-center gap-4 rounded-2xl border border-border/40 bg-bg-secondary/60 p-4 backdrop-blur-xl">
        <div className="text-3xl" aria-hidden>{STAGE_ICON[stats.ecosystemStage]}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-b1 font-semibold text-text-primary">{stageMeta.label}</h2>
            <span className="text-c1 text-text-tertiary">{stageMeta.description}</span>
          </div>
          {/* 阶段进度条 */}
          <StageProgress count={stats.totalPlants} ecosystemStage={stats.ecosystemStage} />
        </div>
      </div>

      {/* 统计卡 / Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Leaf className="w-4 h-4" />} label="植物" value={`${stats.totalPlants} 株`} />
        <StatCard icon={<Sprout className="w-4 h-4" />} label="累计专注" value={`${stats.totalFocusMinutes} 分钟`} />
        <StatCard icon={<Flower2 className="w-4 h-4" />} label="已解锁物种" value={`${stats.speciesUnlocked} / 6`} />
        <StatCard icon={<Droplets className="w-4 h-4" />} label="枯萎待复活" value={`${stats.wiltedCount} 株`} warn={stats.wiltedCount > 0} />
      </div>

      {/* 植物网格 / Plant grid */}
      {plants.length === 0 ? (
        <div className="kb-ritual-empty py-kb-xl">
          <p className="kb-ritual-empty-title">花园尚空</p>
          <p className="kb-ritual-empty-note">完成一次深潜，种下第一颗种子</p>
        </div>
      ) : (
        <GardenScene plants={plants} selectedId={selectedId} onSelect={(plant) => setSelectedId(plant.id)} />
      )}

      {/* 选中植物详情：专注记录 / Selected plant detail */}
      {selected && <PlantDetail plant={selected} onWater={waterPlant} onRevive={revivePlant} />}
    </div>
  );
}

/** 生态阶段图标 / Ecosystem stage icon */
const STAGE_ICON: Record<GardenEcosystemStage, string> = {
  seed: '🌰',
  seedling: '🌱',
  garden: '🌸',
  ecosystem: '🌳',
};

/** 阶段进度：当前植物数 → 下一阶段所需 / Stage progress bar */
function StageProgress({ count, ecosystemStage }: { count: number; ecosystemStage: GardenEcosystemStage }) {
  const next: Record<GardenEcosystemStage, number> = { seed: 5, seedling: 15, garden: 30, ecosystem: 30 };
  const target = next[ecosystemStage];
  const pct = ecosystemStage === 'ecosystem' ? 100 : Math.min(100, Math.round((count / target) * 100));
  return (
    <div className="mt-2 h-1.5 rounded-full bg-bg-tertiary/50 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-400 to-accent-400 transition-all duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** 统计卡 / Stat card */
function StatCard({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/30 bg-bg-secondary/40 p-3">
      <div className={cn('flex items-center gap-1.5 text-c1 text-text-tertiary', warn && 'text-amber-400')}>
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-b1 font-semibold text-text-primary tabular-nums">{value}</span>
    </div>
  );
}

/** 植物详情（专注记录） / Plant detail (focus record) */
function PlantDetail({ plant, onWater, onRevive }: {
  plant: GardenPlant;
  onWater: (id: string) => void;
  onRevive: (id: string) => void;
}) {
  const meta = SPECIES_META[plant.species];
  const wilted = plant.wilted;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-bg-secondary/60 p-4 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <span className={cn('text-3xl', wilted && 'grayscale opacity-40')} aria-hidden>{meta.emoji[plant.stage]}</span>
        <div className="flex-1">
          <h3 className="text-b1 font-semibold text-text-primary">{plant.name}</h3>
          <p className="text-c1 text-text-tertiary">{meta.label} · {STAGE_LABEL[plant.stage]}期</p>
        </div>
        {wilted ? (
          <Button size="sm" variant="primary" onClick={() => onRevive(plant.id)}>复活</Button>
        ) : (
          <Button size="sm" variant="secondary" icon={<Droplets className="w-3.5 h-3.5" />} onClick={() => onWater(plant.id)}>浇水</Button>
        )}
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-c1">
        <DetailItem label="种植于" value={new Date(plant.plantedAt).toLocaleDateString()} />
        <DetailItem label="累计专注" value={`${plant.focusMinutes} 分钟`} />
        <DetailItem label="复活次数" value={`${plant.revivedCount} 次`} />
        <DetailItem label="来源会话" value={plant.sourceSessionId} />
      </dl>
      {wilted && (
        <p className="text-c1 text-amber-400/80">
          ❄️ 已枯萎——可逆原则：点击「复活」即可恢复，积累永不丢失。
        </p>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-c2 text-text-tertiary">{label}</dt>
      <dd className="text-b3 text-text-primary tabular-nums truncate">{value}</dd>
    </div>
  );
}
