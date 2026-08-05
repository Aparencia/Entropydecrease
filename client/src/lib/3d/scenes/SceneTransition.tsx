/**
 * SceneTransition — 管理深海 ↔ 穹顶的过渡动画
 *
 * 渲染策略（避免闪烁 + 确保初始可见 + 不干扰渲染循环）：
 * - 使用 useEffect 处理主题变化，不在 render 期间操作 ref
 * - 不在 useFrame 内调用 setState（避免 React 重渲染干扰 R3F 循环）
 * - 过渡完成后通过 setTimeout 延迟同步 state（确保在 useFrame 外执行）
 *
 * @ai-context: 3D 场景：SceneTransition。
 */
import { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSceneTheme } from '../hooks/useSceneTheme';
import { DeepSeaWorld } from './DeepSeaWorld';
import { AuroraDomeWorld } from './AuroraDomeWorld';

export interface SceneTransitionProps {
  children?: React.ReactNode;
}

const TRANSITION_DURATION = 0.5;

export function SceneTransition({ children }: SceneTransitionProps) {
  const { gl, scene, camera } = useThree();
  const theme = useSceneTheme();
  const isTransitioning = useRef(false);
  const transitionProgress = useRef(0);
  const targetThemeRef = useRef(theme);
  const prevThemeRef = useRef(theme);

  const deepSeaGroupRef = useRef<THREE.Group>(null);
  const auroraGroupRef = useRef<THREE.Group>(null);

  // 用 state 驱动 JSX visible（确保首帧渲染正确）
  const [deepSeaVisible, setDeepSeaVisible] = useState(theme === 'deep-sea');
  const [auroraVisible, setAuroraVisible] = useState(theme === 'aurora-dome');

  // 主题变化时启动过渡 + 延迟同步可见性
  useEffect(() => {
    if (theme === prevThemeRef.current) return;
    prevThemeRef.current = theme;
    targetThemeRef.current = theme;
    isTransitioning.current = true;
    transitionProgress.current = 0;

    // 过渡开始：两个场景都可见
    if (deepSeaGroupRef.current) deepSeaGroupRef.current.visible = true;
    if (auroraGroupRef.current) auroraGroupRef.current.visible = true;

    // 过渡完成后同步可见性和 state（在 useFrame 外执行，避免干扰渲染循环）
    const isDeepSea = theme === 'deep-sea';
    const timer = setTimeout(() => {
      isTransitioning.current = false;
      if (deepSeaGroupRef.current) deepSeaGroupRef.current.visible = isDeepSea;
      if (auroraGroupRef.current) auroraGroupRef.current.visible = !isDeepSea;
      setDeepSeaVisible(isDeepSea);
      setAuroraVisible(!isDeepSea);
      // docked 相位 frameloop='never' 下渲染循环冻结：可见性虽已切换但无帧
      // 绘制，canvas 仍显示旧场景（内测反馈：主题切换背景不生效）。
      // 手动渲染一帧让场景切换立即呈现，一次性开销不破坏冻结策略。
      gl.render(scene, camera);
    }, TRANSITION_DURATION * 1000 + 100);

    return () => clearTimeout(timer);
  }, [theme, gl, scene, camera]);

  useFrame((_, delta) => {
    if (!isTransitioning.current) return;

    const safeDelta = Math.min(delta, 0.1);
    transitionProgress.current += safeDelta / TRANSITION_DURATION;
    const t = Math.min(transitionProgress.current, 1);
    const eased = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const isGoingToAurora = targetThemeRef.current === 'aurora-dome';

    // 过渡期间：opacity 交叉混合
    if (deepSeaGroupRef.current) {
      applyGroupOpacity(deepSeaGroupRef.current, isGoingToAurora ? 1 - eased : eased);
    }
    if (auroraGroupRef.current) {
      applyGroupOpacity(auroraGroupRef.current, isGoingToAurora ? eased : 1 - eased);
    }

    // 过渡完成：还原材质（不在这里 setState，由 setTimeout 处理）
    if (t >= 1) {
      if (deepSeaGroupRef.current) restoreGroupMaterials(deepSeaGroupRef.current);
      if (auroraGroupRef.current) restoreGroupMaterials(auroraGroupRef.current);
    }
  });

  return (
    <>
      <group>
        <group ref={deepSeaGroupRef} visible={deepSeaVisible}>
          <DeepSeaWorld />
        </group>
        <group ref={auroraGroupRef} visible={auroraVisible}>
          <AuroraDomeWorld />
        </group>
        {children}
      </group>

      {/* 后处理（Bloom/Vignette）—— 已禁用。
          根因：DeepSeaWorld 与 AuroraDomeWorld 曾各自挂载一个 EffectComposer，而本组件为交叉
          淡入淡出同时挂载两个场景，导致两个 composer 以 renderPriority=1 互相抢占渲染权，
          深色模式下画面丢失（gl.info 仅剩 composer 输出 pass 的 1 call/1 triangle）。
          即便收敛为单一 composer 仍复现，故暂禁用后处理以保证渲染稳定。
          如需恢复 Bloom/Vignette，需先排查 @react-three/postprocessing 与 alpha:true 画布的
          渲染目标兼容问题，切勿直接在场景内重新挂载多个 composer。 */}
      {null}
    </>
  );
}

/**
 * 过渡期间：设置 group 内材质的透明度
 * 跳过 ShaderMaterial（无标准 opacity 属性，强行修改会导致渲染异常）
 * 保存原始 transparent 状态以便还原
 */
function applyGroupOpacity(group: THREE.Group, opacity: number) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
      const material = child.material;
      if (Array.isArray(material)) {
        material.forEach((mat) => applyMaterialOpacity(mat, opacity));
      } else if (material) {
        applyMaterialOpacity(material, opacity);
      }
    }
  });
}

function applyMaterialOpacity(mat: THREE.Material, opacity: number) {
  if (mat instanceof THREE.ShaderMaterial) return;
  if (mat.userData.baseOpacity === undefined) {
    mat.userData.baseOpacity = mat.opacity;
    mat.userData.baseTransparent = mat.transparent;
  }
  mat.transparent = true;
  mat.opacity = mat.userData.baseOpacity * opacity;
}

/**
 * 过渡完成后：还原材质到原始状态
 * 恢复原始 transparent 标记（保护 AdditiveBlending 等混合模式）
 */
function restoreGroupMaterials(group: THREE.Group) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
      const material = child.material;
      if (Array.isArray(material)) {
        material.forEach((mat) => restoreMaterial(mat));
      } else if (material) {
        restoreMaterial(material);
      }
    }
  });
}

function restoreMaterial(mat: THREE.Material) {
  if (mat instanceof THREE.ShaderMaterial) return;
  if (mat.userData.baseOpacity !== undefined) {
    mat.opacity = mat.userData.baseOpacity;
    mat.transparent = mat.userData.baseTransparent ?? mat.userData.baseOpacity < 1;
    delete mat.userData.baseOpacity;
    delete mat.userData.baseTransparent;
  }
}