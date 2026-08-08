/**
 * TideBreath — 潮汐节律（宪法第十条 · 叙事层 C：熵的呼吸）
 * TideBreath — tidal rhythm (constitution §10 · layer C)
 *
 * @ai-context: 实时层的投递机制：番茄钟运行=涨潮（世界收拢变深——
 * 荧光点光增亮脉动 + 底部潮线升起），停止/休息=退潮（光照回落、潮线沉降）。
 * 呼吸节律与 pomodoro isRunning 联动，无新增数据依赖。
 * reduced-motion：跳过脉动，只做强度缓动。
 *
 * @ai-context: Focus-running = flood tide (light swells, tide line rises);
 * idle = ebb. Pulse skipped under prefers-reduced-motion.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { usePomodoroStore } from '@/features/pomodoro/store/usePomodoroStore';

/** 涨潮/退潮光照强度目标 / Flood & ebb light intensity targets */
const FLOOD_INTENSITY = 0.85;
const EBB_INTENSITY = 0.5;

export function TideBreath() {
  const isRunning = usePomodoroStore((s) => s.isRunning);
  const lightRef = useRef<THREE.PointLight>(null);
  const tideRef = useRef<THREE.Mesh>(null);
  const elapsed = useRef(0);
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useFrame((_, delta) => {
    const safeDelta = Math.min(delta, 0.1);
    elapsed.current += safeDelta;

    // 涨潮脉动：呼吸式的强度起伏（reduced-motion 关闭）
    const pulse = isRunning && !reduced ? Math.sin(elapsed.current * 0.9) * 0.12 : 0;
    const target = (isRunning ? FLOOD_INTENSITY : EBB_INTENSITY) + pulse;
    if (lightRef.current) {
      lightRef.current.intensity = THREE.MathUtils.lerp(
        lightRef.current.intensity, target, safeDelta * 2,
      );
    }

    // 潮线：涨潮升起且波动更明显，退潮沉降趋平
    if (tideRef.current) {
      const mat = tideRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, isRunning ? 0.16 : 0.05, safeDelta * 2);
      const swell = isRunning && !reduced ? Math.sin(elapsed.current * 0.5) * 0.12 : 0;
      tideRef.current.position.y = -3.5 + (isRunning ? 0.25 : 0) + swell;
    }
  });

  return (
    <group>
      {/* 潮汐光：与场景主光源（#4A9BD9）同族但偏磷光蓝，涨潮时世界"变深变亮" */}
      <pointLight ref={lightRef} position={[0, 4, 2]} intensity={EBB_INTENSITY} color="#6FB4E8" distance={40} />
      {/* 潮线：海床上的扁平光环，涨落可见 */}
      <mesh ref={tideRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.5, 0]}>
        <ringGeometry args={[3.4, 9, 48]} />
        <meshBasicMaterial color="#6FB4E8" transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}
