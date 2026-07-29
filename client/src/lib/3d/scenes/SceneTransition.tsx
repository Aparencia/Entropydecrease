/**
 * SceneTransition — 管理深海 ↔ 穹顶的过渡动画
 * 两个场景同时存在，通过交叉淡入淡出实现平滑切换
 *
 * @ai-context: 3D 场景：SceneTransition。
 */
import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSceneTheme } from '../hooks/useSceneTheme';
import { DeepSeaWorld } from './DeepSeaWorld';
import { AuroraDomeWorld } from './AuroraDomeWorld';

export interface SceneTransitionProps {
  children?: React.ReactNode;
}

const TRANSITION_DURATION = 0.5; // 500ms

export function SceneTransition({ children }: SceneTransitionProps) {
  const theme = useSceneTheme();
  const [activeScene, setActiveScene] = useState(theme);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionProgress = useRef(0); // 0=旧场景全显, 1=新场景全显

  const deepSeaGroupRef = useRef<THREE.Group>(null);
  const auroraGroupRef = useRef<THREE.Group>(null);
  const prevThemeRef = useRef(theme);

  // 监听主题变化触发过渡
  useEffect(() => {
    if (theme !== prevThemeRef.current) {
      prevThemeRef.current = theme;
      setIsTransitioning(true);
      transitionProgress.current = 0;
    }
  }, [theme]);

  useFrame((_, delta) => {
    if (!isTransitioning) return;

    transitionProgress.current += delta / TRANSITION_DURATION;

    if (transitionProgress.current >= 1) {
      transitionProgress.current = 1;
      setIsTransitioning(false);
      setActiveScene(theme);
    }

    // 交叉淡入淡出 — 使用 easeInOutCubic
    const t = transitionProgress.current;
    const eased = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // 控制可见性和材质透明度
    const isGoingToAurora = theme === 'aurora-dome';

    if (deepSeaGroupRef.current) {
      deepSeaGroupRef.current.visible = true;
      // 淡出（如果目标是aurora）或淡入（如果目标是deep-sea）
      const opacity = isGoingToAurora ? 1 - eased : eased;
      applyGroupOpacity(deepSeaGroupRef.current, opacity);
    }

    if (auroraGroupRef.current) {
      auroraGroupRef.current.visible = true;
      const opacity = isGoingToAurora ? eased : 1 - eased;
      applyGroupOpacity(auroraGroupRef.current, opacity);
    }
  });

  // 非过渡状态下只显示当前场景
  const showDeepSea = isTransitioning || activeScene === 'deep-sea';
  const showAurora = isTransitioning || activeScene === 'aurora-dome';

  return (
    <group>
      {/* 深海场景 */}
      <group ref={deepSeaGroupRef} visible={showDeepSea}>
        {showDeepSea && <DeepSeaWorld />}
      </group>

      {/* 穹顶场景 */}
      <group ref={auroraGroupRef} visible={showAurora}>
        {showAurora && <AuroraDomeWorld />}
      </group>

      {children}
    </group>
  );
}

/**
 * 递归设置group内所有材质的透明度
 * 用于交叉淡入淡出效果
 */
function applyGroupOpacity(group: THREE.Group, opacity: number) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
      const material = child.material;
      if (Array.isArray(material)) {
        material.forEach((mat) => {
          mat.transparent = true;
          mat.opacity = Math.min(mat.userData.baseOpacity ?? 1, opacity);
        });
      } else if (material) {
        material.transparent = true;
        // 保存原始透明度以避免覆盖已有的透明效果
        if (material.userData.baseOpacity === undefined) {
          material.userData.baseOpacity = material.opacity;
        }
        material.opacity = material.userData.baseOpacity * opacity;
      }
    }
  });
}
