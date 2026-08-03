/**
 * DeepSeaWorld — 深色模式「深海」3D场景
 * 深海生态系统：生物发光、海底粒子、有机暗流
 *
 * @ai-context: 3D 场景：DeepSeaWorld。宪法 P1 第二批接入熵可视化层：
 * ChaosMist（遗忘=雾，mist 信号驱动）与 OrderRipples（复习=波纹，
 * 世界事件总线驱动）。
 */
import { Bloom, DepthOfField, Vignette } from '@react-three/postprocessing';
import { SafeEffectComposer } from '../core/SafeEffectComposer';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import { ChaosMist } from '../objects/ChaosMist';
import { OrderRipples } from '../objects/OrderRipples';
import { TideBreath } from '../objects/TideBreath';
import { StrataField } from '../objects/StrataField';

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

      {/* 熵可视化层（宪法 P1）：混沌雾=遗忘，秩序波纹=复习 */}
      <ChaosMist />
      <OrderRipples />
      {/* 叙事层叠加（宪法第十条）：潮汐=熵的呼吸，地层=累计专注的岩芯 */}
      <TideBreath />
      <StrataField />

      {/* 后处理：低档全关；中档关景深（DepthOfField 是最重的后处理 pass）；澎湃档全开。
          条件置于 composer 层级（group 接受 false），避免 EffectComposer 子元素严格类型报错 */}
      {tier === 'low' ? null : tier === 'high' ? (
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
      ) : (
        <SafeEffectComposer>
          <Bloom
            intensity={0.5}
            luminanceThreshold={0.6}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
          <Vignette offset={0.3} darkness={0.7} />
        </SafeEffectComposer>
      )}
    </group>
  );
}
