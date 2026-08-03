/**
 * ChaosMist — 混沌雾（宪法第一条：遗忘=雾）
 * ChaosMist — the entropy fog (constitution §1: forgetting = mist)
 *
 * @ai-context: 深海场景的遗忘可视化：雾强度由世界信号 mist 驱动
 * （白化珊瑚占比，宪法锁定 ≤0.4）。语义是"朦胧可拨开"——复习恢复
 * 珊瑚健康后雾自然消退，全程零负向表达。
 * 性能预算（宪法第四条）：high/medium=径向渐变 sprite 缓慢漂移，
 * low=静态单团、无逐帧动画。
 *
 * @ai-context: Fog sprites whose opacity tracks the mist world signal.
 * Budget: drifting gradient sprites on high/medium, static on low tier.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useWorldSignalsSelect } from '@/features/retention/hooks/useWorldSignals';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';

/** 雾团落点与尺寸（场景边缘，不遮挡中心导航） / Blob anchors at scene edges */
const MIST_BLOBS: Array<{ pos: [number, number, number]; scale: number; speed: number }> = [
  { pos: [-7, -1.5, -6], scale: 16, speed: 0.05 },
  { pos: [6.5, 2, -8], scale: 13, speed: 0.07 },
];

/** 程序化径向渐变雾纹理（无外部素材依赖） / Procedural radial mist texture */
function createMistTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(7,12,24,0.9)');
    g.addColorStop(0.55, 'rgba(7,12,24,0.45)');
    g.addColorStop(1, 'rgba(7,12,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

export function ChaosMist() {
  const tier = useEffectiveTier();
  const { mist } = useWorldSignalsSelect((s) => ({ mist: s.mist }));
  const texture = useMemo(createMistTexture, []);
  const refs = useRef<Array<THREE.Sprite | null>>([]);
  const elapsed = useRef(0);

  // low 档：静态呈现语义（雾仍在），不跑逐帧动画（宪法第四条）
  useFrame((_, delta) => {
    if (tier === 'low' || mist <= 0.001) return;
    elapsed.current += Math.min(delta, 0.1);
    refs.current.forEach((sprite, i) => {
      if (!sprite) return;
      const blob = MIST_BLOBS[i];
      // 极慢漂移：混沌在渗透，但永不吞噬（可拨开的朦胧）
      sprite.position.x = blob.pos[0] + Math.sin(elapsed.current * blob.speed) * 0.8;
      sprite.position.y = blob.pos[1] + Math.cos(elapsed.current * blob.speed * 0.8) * 0.5;
    });
  });

  // 雾强度直接取自信号（派生层已封顶 0.4）；关闭留存时 mist=0，雾自然隐去
  if (mist <= 0.001) return null;
  const blobCount = tier === 'low' ? 1 : MIST_BLOBS.length;

  return (
    <group>
      {MIST_BLOBS.slice(0, blobCount).map((blob, i) => (
        <sprite
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          position={blob.pos}
          scale={[blob.scale, blob.scale, 1]}
        >
          <spriteMaterial
            map={texture}
            transparent
            opacity={mist}
            depthWrite={false}
            color="#8FA3C8"
          />
        </sprite>
      ))}
    </group>
  );
}
