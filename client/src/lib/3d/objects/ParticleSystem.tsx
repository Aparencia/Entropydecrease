/**
 * 独立粒子系统组件 — 深海浮力微粒
 * 使用 THREE.Points + AdditiveBlending 实现高性能粒子渲染
 *
 * @ai-context: 3D 场景对象：ParticleSystem。
 * @ai-context: P3-15 降更新频率——按 tier 跳帧更新（high 每帧/medium 隔 1/low 隔 2），
 * 水平漂移基于绝对时钟相位（跳帧仍平滑），增量位移乘以 step 补偿以保持运动速度一致。
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';

interface ParticleSystemProps {
  count?: number;
  bounds?: { x: number; y: [number, number]; z: number };
  baseColor?: string;
  secondaryColor?: string;
  speed?: number;
}

export function ParticleSystem({
  count = 2000,
  bounds = { x: 30, y: [-20, 5], z: 30 },
  baseColor = '#aaddff',
  secondaryColor = '#6366F1',
  speed = 1,
}: ParticleSystemProps) {
  const pointsRef = useRef<THREE.Points>(null);
  // P3-15 跳帧计数器
  const frameRef = useRef(0);
  // 有效 tier（自动 tier 受用户性能模式上限约束）
  const tier = useEffectiveTier();

  const particleCount = tier === 'low' ? 500 : tier === 'medium' ? 1200 : count;
  // 更新频率分档：high 每帧、medium 隔 1 帧、low 隔 2 帧（粒子运动缓慢，跳帧视觉无感）
  const frameSkip = tier === 'low' ? 3 : tier === 'medium' ? 2 : 1;

  const { positions, velocities, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const vel = new Float32Array(particleCount * 3);
    const col = new Float32Array(particleCount * 3);
    const sz = new Float32Array(particleCount);

    const colorA = new THREE.Color(baseColor);
    const colorB = new THREE.Color(secondaryColor);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      // Random position within bounds
      pos[i3] = (Math.random() - 0.5) * 2 * bounds.x;
      pos[i3 + 1] = bounds.y[0] + Math.random() * (bounds.y[1] - bounds.y[0]);
      pos[i3 + 2] = (Math.random() - 0.5) * 2 * bounds.z;

      // Random velocity factors for variation
      vel[i3] = (Math.random() - 0.5) * 0.3; // horizontal drift factor
      vel[i3 + 1] = 0.002 + Math.random() * 0.004; // upward speed
      vel[i3 + 2] = (Math.random() - 0.5) * 0.3; // horizontal drift factor

      // Lerp between two colors
      const t = Math.random();
      const lerpedColor = colorA.clone().lerp(colorB, t);
      col[i3] = lerpedColor.r;
      col[i3 + 1] = lerpedColor.g;
      col[i3 + 2] = lerpedColor.b;

      // Random size
      sz[i] = 0.02 + Math.random() * 0.06;
    }

    return { positions: pos, velocities: vel, colors: col, sizes: sz };
  }, [particleCount, bounds, baseColor, secondaryColor]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    // P3-15 跳帧：非更新帧直接返回，减少 sin/cos 逐粒子计算开销
    frameRef.current += 1;
    if (frameRef.current % frameSkip !== 0) return;
    const step = frameSkip; // 补偿跳过帧，保持运动速度一致

    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;
    const time = clock.getElapsedTime();

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // Horizontal drift using sin/cos（基于绝对时钟相位，跳帧仍平滑）
      posArray[i3] += Math.sin(time * 0.5 + i * 0.1) * velocities[i3] * speed * 0.001 * step;
      posArray[i3 + 2] += Math.cos(time * 0.4 + i * 0.1) * velocities[i3 + 2] * speed * 0.001 * step;

      // Float upward
      posArray[i3 + 1] += velocities[i3 + 1] * speed * step;

      // Reset particle to bottom when reaching top
      if (posArray[i3 + 1] > bounds.y[1]) {
        posArray[i3 + 1] = bounds.y[0];
        posArray[i3] = (Math.random() - 0.5) * 2 * bounds.x;
        posArray[i3 + 2] = (Math.random() - 0.5) * 2 * bounds.z;
      }
    }

    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={particleCount}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          array={colors}
          count={particleCount}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          array={sizes}
          count={particleCount}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        vertexColors
        transparent
        opacity={0.7}
        sizeAttenuation
        size={0.05}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
