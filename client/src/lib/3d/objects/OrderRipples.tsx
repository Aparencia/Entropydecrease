/**
 * OrderRipples — 秩序波纹（宪法第一条：复习=波纹）
 * OrderRipples — order ripples (constitution §1: review = ripple)
 *
 * @ai-context: 订阅世界事件总线（useWorldEvents.rippleSeq），在波纹起源
 * 位置生成向外扩散的发光圆环并自然消散——复习推退混沌的即时正反馈。
 * 同屏最多 3 道波纹（性能预算）；reduced-motion 降级为原位柔和闪烁。
 *
 * @ai-context: Spawns expanding glow rings at the ripple origin whenever the
 * world event bus emits. Max 3 concurrent; reduced-motion shows a soft flash.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { MODULE_POSITIONS } from '../navigation/OrbitalStore';
import { useWorldEvents, type RippleOrigin } from '@/features/retention/store/useWorldEvents';

/** 波纹生命周期（秒）与同屏上限 / Ripple lifetime and concurrent cap */
const RIPPLE_LIFE = 2.2;
const MAX_CONCURRENT = 3;
const RIPPLE_COLOR = '#22D3EE';

interface RippleInstance {
  id: number;
  origin: RippleOrigin;
}

/** 起源锚点 → 场景坐标 / Origin anchor → scene position */
function originPosition(origin: RippleOrigin): [number, number, number] {
  if (origin === 'center') return [0, 0, 0];
  return MODULE_POSITIONS.find((m) => m.id === origin)?.position ?? [0, 0, 0];
}

function Ripple({ pos, reduced, onDone }: {
  pos: [number, number, number];
  reduced: boolean;
  onDone: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const age = useRef(0);

  useFrame((_, delta) => {
    age.current += Math.min(delta, 0.1);
    const t = Math.min(1, age.current / RIPPLE_LIFE);
    if (t >= 1) {
      onDone();
      return;
    }
    // reduced-motion：不扩散，仅原位柔和闪烁（宪法第三条约束的静帧语义）
    if (meshRef.current) {
      meshRef.current.scale.setScalar(reduced ? 2.2 : 0.6 + t * 6.4);
    }
    if (matRef.current) {
      matRef.current.opacity = (reduced ? 0.45 : 0.8) * (1 - t);
    }
  });

  return (
    <Billboard position={pos}>
      <mesh ref={meshRef}>
        <ringGeometry args={[0.92, 1, 48]} />
        <meshBasicMaterial
          ref={matRef}
          color={RIPPLE_COLOR}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </Billboard>
  );
}

export function OrderRipples() {
  const rippleSeq = useWorldEvents((s) => s.rippleSeq);
  const rippleOrigin = useWorldEvents((s) => s.rippleOrigin);
  const [ripples, setRipples] = useState<RippleInstance[]>([]);
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  // 序列号驱动生成：seq=0 为初始态不生成
  useEffect(() => {
    if (rippleSeq === 0) return;
    setRipples((prev) => [...prev.slice(-(MAX_CONCURRENT - 1)), { id: rippleSeq, origin: rippleOrigin }]);
  }, [rippleSeq, rippleOrigin]);

  if (ripples.length === 0) return null;
  return (
    <group>
      {ripples.map((r) => (
        <Ripple
          key={r.id}
          pos={originPosition(r.origin)}
          reduced={reduced}
          onDone={() => setRipples((prev) => prev.filter((x) => x.id !== r.id))}
        />
      ))}
    </group>
  );
}
