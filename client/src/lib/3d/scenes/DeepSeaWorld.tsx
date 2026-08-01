/**
 * DeepSeaWorld — 深色模式「深海」3D场景
 * 深海生态系统：生物发光、海底粒子、有机暗流
 *
 * @ai-context: 3D 场景：DeepSeaWorld。
 */
import { Bloom, DepthOfField, Vignette } from '@react-three/postprocessing';
import { SafeEffectComposer } from '../core/SafeEffectComposer';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';

export function DeepSeaWorld() {
  // 有效 tier（自动 tier 受用户性能模式上限约束）
  const tier = useEffectiveTier();

  return (
    <group>
      {/* 深海场景 */}
      <ambientLight intensity={0.15} color="#1E3A5F" />
      <pointLight position={[0, 5, 0]} intensity={0.5} color="#00BFFF" distance={50} />
      <mesh>
        <sphereGeometry args={[100, 32, 32]} />
        <meshBasicMaterial color="#0A1628" side={2} />
      </mesh>

      {/* 后处理（低性能时关闭） */}
      {tier !== 'low' && (
        <SafeEffectComposer>
          <Bloom
            intensity={0.5}
            luminanceThreshold={0.6}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
          <DepthOfField
            focusDistance={0.01}
            focalLength={0.02}
            bokehScale={3}
          />
          <Vignette offset={0.3} darkness={0.7} />
        </SafeEffectComposer>
      )}
    </group>
  );
}
