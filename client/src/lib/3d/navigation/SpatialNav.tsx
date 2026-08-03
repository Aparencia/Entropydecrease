/**
 * 3D空间导航组件 — 在Canvas内渲染模块实体并处理交互
 * 根据主题自动切换深海/穹顶风格的模块表达
 *
 * 相机控制权分层（防止两套系统冲突）：
 * - overview 模式：OrbitControls 接管缩放和拖拽旋转，CameraController 暂停
 * - entering 模式：useCameraFlight 独占相机，CameraController 暂停
 * - docked 模式：CameraController 接管（渲染已暂停，实际不执行 lerp）
 *
 * @ai-context: 3D 空间导航组件——键盘/手势驱动的模块间轨道跳转，与 OrbitalStore 状态联动；渲染于 R3F Canvas 内，禁止使用 DOM API。
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useOrbitalStore, MODULE_POSITIONS, type ModuleId } from './OrbitalStore';
import { useSceneTheme } from '../hooks/useSceneTheme';
import { ModuleEntity } from '../objects/ModuleEntity';
import { AuroraModuleEntity } from '../objects/AuroraModuleEntity';
import { CameraController } from '../core/CameraController';
import { useCameraFlight } from '../hooks/useCameraFlight';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { useRuntimeEnv } from '@/lib/env/useRuntimeEnv';

type GeometryType = 'dodecahedron' | 'torus' | 'box' | 'sphere' | 'octahedron' | 'icosahedron';

/** 深海模式下每个模块的几何体和颜色配置 */
const DEEP_SEA_CONFIG: Record<ModuleId, {
  geometry: GeometryType;
  color: string;
  emissiveColor: string;
}> = {
  dashboard: { geometry: 'dodecahedron', color: '#6366F1', emissiveColor: '#818CF8' },
  pomodoro: { geometry: 'octahedron', color: '#F97316', emissiveColor: '#FB923C' },
  notes: { geometry: 'box', color: '#3B82F6', emissiveColor: '#60A5FA' },
  flashcards: { geometry: 'icosahedron', color: '#10B981', emissiveColor: '#34D399' },
  feynman: { geometry: 'torus', color: '#8B5CF6', emissiveColor: '#A78BFA' },
  inspiration: { geometry: 'sphere', color: '#EC4899', emissiveColor: '#F472B6' },
  classroom: { geometry: 'torus', color: '#14B8A6', emissiveColor: '#2DD4BF' },
};

/**
 * 穹顶模式下每个模块的轨道配置
 * 轨道半径已缩减（原值最大 9，现最大 5.5），防止行星漂出可视范围导致漂移感
 */
const AURORA_ORBIT_CONFIG: Record<ModuleId, {
  orbitRadius: number;
  orbitSpeed: number;
  initialAngle: number;
}> = {
  dashboard: { orbitRadius: 0, orbitSpeed: 0, initialAngle: 0 },
  pomodoro: { orbitRadius: 2.5, orbitSpeed: 0.3, initialAngle: 0 },
  notes: { orbitRadius: 3.5, orbitSpeed: 0.2, initialAngle: Math.PI * 0.4 },
  flashcards: { orbitRadius: 4.5, orbitSpeed: 0.15, initialAngle: Math.PI * 0.8 },
  feynman: { orbitRadius: 5, orbitSpeed: 0.12, initialAngle: Math.PI * 1.2 },
  inspiration: { orbitRadius: 5.5, orbitSpeed: 0.1, initialAngle: Math.PI * 1.6 },
  classroom: { orbitRadius: 4, orbitSpeed: 0.18, initialAngle: Math.PI * 0.6 },
};

/** 相机飞入模块时的偏移（从模块位置向相机方向偏移） */
const CAMERA_OFFSET: [number, number, number] = [0, 0, 4];

function addVectors(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function SpatialNav() {
  const navigate = useNavigate();
  const theme = useSceneTheme();
  const { phase, overlayVisible, currentModule, hoveredModule, highlightAll, enterModule, setHovered } = useOrbitalStore();
  const { flyTo, update } = useCameraFlight();
  const { shouldDegrade3D } = useRuntimeEnv();

  // 每帧更新相机飞行
  useFrame((_, delta) => {
    // 防止浏览器节流导致的帧时间尖峰
    const safeDelta = Math.min(delta, 0.1);
    update(safeDelta);
  });

  // 点击模块实体（深海模式使用固定坐标）
  const handleModuleClick = useCallback((id: ModuleId) => {
    const module = MODULE_POSITIONS.find(m => m.id === id);
    if (!module) return;

    soundPlayer.play('ui_module_enter');
    enterModule(id);
    // 相机飞向模块位置（加偏移）
    flyTo(addVectors(module.position, CAMERA_OFFSET));
    navigate(module.route);
  }, [enterModule, flyTo, navigate]);

  // 点击 Aurora 模式行星：使用行星实时世界坐标作为 flyTo 目标，而非 MODULE_POSITIONS 固定坐标
  // 因为行星在轨道上持续公转，固定坐标会导致相机飞向错误位置（漂移根因之一）
  const handleAuroraClick = useCallback((id: ModuleId, currentPosition?: [number, number, number]) => {
    const module = MODULE_POSITIONS.find(m => m.id === id);
    if (!module) return;

    soundPlayer.play('ui_module_enter');
    enterModule(id);
    // 优先使用行星当前实时世界坐标，fallback 到固定坐标
    const basePos = currentPosition ?? module.position;
    flyTo(addVectors(basePos, CAMERA_OFFSET));
    navigate(module.route);
  }, [enterModule, flyTo, navigate]);

  // 悬停音效（移动端降级时不播放，仅在指针事件回调中触发）
  const handleHover = useCallback((id: ModuleId | null) => {
    if (id && !shouldDegrade3D) soundPlayer.play('ui_hover_3d', { throttleMs: 200 });
    setHovered(id);
  }, [setHovered, shouldDegrade3D]);

  // 计算相机目标位置与注视点：非概览相位（entering/docked）时飞向并注视当前模块，否则全景位/场景中心
  const inModuleView = phase !== 'overview' && currentModule;
  const activeModulePos = inModuleView
    ? MODULE_POSITIONS.find(m => m.id === currentModule)?.position
    : undefined;
  const cameraTarget: [number, number, number] = activeModulePos
    ? addVectors(activeModulePos, CAMERA_OFFSET)
    : [0, 0, 10]; // 默认全景位置
  const cameraLookAt: [number, number, number] = activeModulePos ?? [0, 0, 0];

  // CameraController 暂停条件：
  // - entering 相位：useCameraFlight 的 flyTo 独占相机控制权，两套系统不能同时修改位置
  // - overview 相位：OrbitControls 接管相机（缩放/旋转），CameraController 暂停避免冲突
  const isCameraPaused = phase === 'entering' || phase === 'overview';

  // 深海模式渲染
  if (theme === 'deep-sea') {
    return (
      <>
        {/* overview 模式下 OrbitControls 接管缩放和拖拽旋转 */}
        {phase === 'overview' && (
          <OrbitControls
            enablePan={false}
            minDistance={5}
            maxDistance={18}
            minPolarAngle={Math.PI / 6}   // 俯仰角上限 30°（防止翻到场景顶部）
            maxPolarAngle={Math.PI / 2 + Math.PI / 6} // 俯仰角下限 120°（防止翻到场景底部）
            enableDamping
            dampingFactor={0.08}
            // 支持触摸拖拽旋转（移动端）
            touches={{ ONE: 0, TWO: 2 }}
          />
        )}
        <CameraController
          target={cameraTarget}
          lookAt={cameraLookAt}
          speed={inModuleView ? 3 : 2}
          paused={isCameraPaused}
        />
        {MODULE_POSITIONS.map((module) => {
          const config = DEEP_SEA_CONFIG[module.id];
          // 覆盖层不可见时（概览/peek）全部实体可见可点击；覆盖层可见时仅当前模块
          const isVisible = !overlayVisible || module.id === currentModule;
          if (!isVisible) return null;

          return (
            <ModuleEntity
              key={module.id}
              id={module.id}
              position={module.position}
              label={module.label}
              geometry={config.geometry}
              color={config.color}
              emissiveColor={config.emissiveColor}
              isHovered={hoveredModule === module.id || highlightAll}
              isActive={currentModule === module.id}
              showLabel={highlightAll || !overlayVisible}
              onClick={() => handleModuleClick(module.id)}
              onPointerOver={() => handleHover(module.id)}
              onPointerOut={() => handleHover(null)}
            />
          );
        })}
      </>
    );
  }

  // 穹顶模式渲染
  return (
    <>
      {/* overview 模式下 OrbitControls 接管缩放和拖拽旋转 */}
      {phase === 'overview' && (
        <OrbitControls
          enablePan={false}
          minDistance={5}
          maxDistance={18}
          minPolarAngle={Math.PI / 6}   // 俯仰角上限 30°
          maxPolarAngle={Math.PI / 2 + Math.PI / 6} // 俯仰角下限 120°
          enableDamping
          dampingFactor={0.08}
          touches={{ ONE: 0, TWO: 2 }}
        />
      )}
      <CameraController
        target={cameraTarget}
        lookAt={cameraLookAt}
        speed={inModuleView ? 3 : 2}
        paused={isCameraPaused}
      />
      {MODULE_POSITIONS.map((module) => {
        const config = AURORA_ORBIT_CONFIG[module.id];
        const isVisible = !overlayVisible || module.id === currentModule;
        if (!isVisible) return null;

        return (
          <AuroraModuleEntity
            key={module.id}
            id={module.id}
            orbitRadius={config.orbitRadius}
            orbitSpeed={config.orbitSpeed}
            initialAngle={config.initialAngle}
            isActive={currentModule === module.id}
            showLabel={highlightAll || !overlayVisible}
            onClick={handleAuroraClick}
            onHover={handleHover}
          />
        );
      })}
    </>
  );
}
