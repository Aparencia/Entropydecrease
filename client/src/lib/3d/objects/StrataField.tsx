/**
 * StrataField — 沉积地层（宪法第十条 · 叙事层 D：学习史即岩芯）
 * StrataField — sediment strata (constitution §10 · layer D)
 *
 * @ai-context: 累计专注的地质层呈现：每次深潜种下的珊瑚即一程沉积，
 * 海床上逐层堆叠（最多 8 层可视），最新的沉积层带微弱辉光——
 * "你的学习史是一根岩芯"。白化不减少地层（可逆原则：暂停生长而非消亡）。
 * 静态网格、无逐帧动画，性能开销近零。
 *
 * @ai-context: Stacked sediment bands on the seabed derived from coral count;
 * latest stratum glows softly. Static meshes, near-zero frame cost.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { useEcosystemStore } from '@/features/retention/store/useEcosystemStore';
import { useWorldSignalsSelect } from '@/features/retention/hooks/useWorldSignals';

/** 可视地层上限（性能预算 + 构图克制） / Visible stratum cap */
const MAX_STRATA = 8;
/** 海床基准高度 / Seabed baseline */
const BASE_Y = -3.9;
/** 单层厚度 / Stratum thickness */
const BAND_HEIGHT = 0.22;

export function StrataField() {
  const corals = useEcosystemStore((s) => s.corals);
  const { depthNorm } = useWorldSignalsSelect((s) => ({ depthNorm: s.depthNorm }));

  // 地层数=沉积次数（珊瑚记录数），整体厚度随累计深度微缩放
  const bands = Math.min(corals.length, MAX_STRATA);
  const scaleY = useMemo(() => 0.7 + depthNorm * 0.5, [depthNorm]);

  // 冷启动：未点亮的混沌世界没有沉积（宪法第七条）
  if (bands === 0) return null;

  return (
    <group position={[0, 0, -2]} scale={[1, scaleY, 1]}>
      {Array.from({ length: bands }, (_, i) => {
        const isLatest = i === bands - 1;
        // 越深越古老：宽度递减、色调趋暗；最新层最亮
        const width = 7.5 - i * 0.55;
        const brightness = 0.16 + (i / Math.max(1, bands - 1)) * 0.3;
        return (
          <mesh key={i} position={[0, BASE_Y + i * BAND_HEIGHT, 0]}>
            <boxGeometry args={[width, BAND_HEIGHT * 0.92, 3.2]} />
            <meshStandardMaterial
              color={new THREE.Color(0.05 + brightness * 0.2, 0.09 + brightness * 0.3, 0.2 + brightness * 0.5)}
              emissive={isLatest ? '#22D3EE' : '#12233F'}
              emissiveIntensity={isLatest ? 0.28 : 0.06}
              transparent
              opacity={0.85}
              roughness={0.8}
            />
          </mesh>
        );
      })}
    </group>
  );
}
