/**
 * ChronosCreature — 时间生物辅助形态（嫩芽/树干）
 *
 * 中心球已完全粒子化（ChronosParticleField 承担，见 particleMorphs），
 * 本组件仅保留非球体形态元素：
 * - 短休：种子顶部嫩芽（cone，scale lerp 萌出）
 * - 长休：种子破土的树干（cylinder，scaleY lerp 生长）
 *
 * useFrame 驱动萌出/生长动画（与 React tick 解耦）。
 *
 * @ai-context: Chronos 辅助形态组件；粒子主体在 ChronosParticleField。
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHRONOS_PALETTES } from './chronosStyles';
import type { ChronosState } from './chronosState';
import type { SceneTheme } from '@/lib/3d/hooks/useSceneTheme';

interface ChronosCreatureProps {
  state: ChronosState;
  theme: SceneTheme;
}

/** 树干色（长休破土，固定木色与叙事一致） */
const TRUNK_COLOR = '#6B4423';

export function ChronosCreature({ state, theme }: ChronosCreatureProps) {
  const sproutRef = useRef<THREE.Mesh>(null);
  const trunkRef = useRef<THREE.Mesh>(null);
  // 萌出/生长进度（lerp 收敛：短休→嫩芽、长休→树干）
  const progress = useRef({ sprout: 0, trunk: 0 });
  const sproutColor = CHRONOS_PALETTES[theme].short_break.particle;

  const targets = {
    sprout: state === 'short_break' ? 1 : 0,
    trunk: state === 'long_break' ? 1 : 0,
  };

  useFrame(({ clock }) => {
    const delta = Math.min(clock.getDelta(), 0.1);
    const k = Math.min(delta * 2.5, 1);
    const p = progress.current;
    p.sprout += (targets.sprout - p.sprout) * k;
    p.trunk += (targets.trunk - p.trunk) * k;

    if (sproutRef.current) {
      sproutRef.current.scale.setScalar(Math.max(0.001, p.sprout));
      sproutRef.current.visible = p.sprout > 0.02;
    }
    if (trunkRef.current) {
      trunkRef.current.scale.set(1, Math.max(0.001, p.trunk), 1);
      trunkRef.current.visible = p.trunk > 0.02;
    }
  });

  return (
    <group>
      {/* 嫩芽（短休萌发）：种子顶部小锥体，scale lerp 萌出 */}
      <mesh ref={sproutRef} position={[0, 0.45, 0]} visible={false}>
        <coneGeometry args={[0.12, 0.5, 8]} />
        <meshStandardMaterial
          color={sproutColor}
          emissive={sproutColor}
          emissiveIntensity={0.5}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* 树干（长休破土）：自种子向上生长，树冠由粒子场 canopy 模式承担 */}
      <mesh ref={trunkRef} position={[0, 1.1, 0]} visible={false}>
        <cylinderGeometry args={[0.05, 0.12, 2.2, 8]} />
        <meshStandardMaterial
          color={TRUNK_COLOR}
          emissive={TRUNK_COLOR}
          emissiveIntensity={0.15}
          roughness={0.9}
        />
      </mesh>
    </group>
  );
}
