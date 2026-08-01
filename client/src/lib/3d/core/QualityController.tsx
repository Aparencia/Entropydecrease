/**
 * 质量控制器 — 根据性能等级动态调整场景参数
 * 在 Canvas 内使用，作为子组件
 *
 * @ai-context: 3D 场景核心（R3F）：QualityController。
 */
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';

export function QualityController() {
  const { gl } = useThree();
  // 有效 tier（自动 tier 受用户性能模式上限约束）
  const tier = useEffectiveTier();

  useEffect(() => {
    switch (tier) {
      case 'high':
        gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        break;
      case 'medium':
        gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        break;
      case 'low':
        gl.setPixelRatio(1);
        break;
    }
  }, [tier, gl]);

  return null;
}
