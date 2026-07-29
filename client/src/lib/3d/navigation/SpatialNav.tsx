/**
 * 3D空间导航组件 — 在Canvas内渲染模块实体并处理交互
 * 根据主题自动切换深海/穹顶风格的模块表达
 *
 * @ai-context: 3D 空间导航组件——键盘/手势驱动的模块间轨道跳转，与 OrbitalStore 状态联动；渲染于 R3F Canvas 内，禁止使用 DOM API。
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFrame } from '@react-three/fiber';
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

/** 穹顶模式下每个模块的轨道配置 */
const AURORA_ORBIT_CONFIG: Record<ModuleId, {
  orbitRadius: number;
  orbitSpeed: number;
  initialAngle: number;
}> = {
  dashboard: { orbitRadius: 0, orbitSpeed: 0, initialAngle: 0 },
  pomodoro: { orbitRadius: 3, orbitSpeed: 0.3, initialAngle: 0 },
  notes: { orbitRadius: 4.5, orbitSpeed: 0.2, initialAngle: Math.PI * 0.4 },
  flashcards: { orbitRadius: 6, orbitSpeed: 0.15, initialAngle: Math.PI * 0.8 },
  feynman: { orbitRadius: 7.5, orbitSpeed: 0.12, initialAngle: Math.PI * 1.2 },
  inspiration: { orbitRadius: 9, orbitSpeed: 0.1, initialAngle: Math.PI * 1.6 },
  classroom: { orbitRadius: 5.5, orbitSpeed: 0.18, initialAngle: Math.PI * 0.6 },
};

/** 相机飞入模块时的偏移（从模块位置向相机方向偏移） */
const CAMERA_OFFSET: [number, number, number] = [0, 0, 4];

function addVectors(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function SpatialNav() {
  const navigate = useNavigate();
  const theme = useSceneTheme();
  const { isInModule, currentModule, hoveredModule, highlightAll, enterModule, setHovered } = useOrbitalStore();
  const { flyTo, update } = useCameraFlight();
  const { shouldDegrade3D } = useRuntimeEnv();

  // 每帧更新相机飞行
  useFrame((_, delta) => {
    update(delta);
  });

  // 点击模块实体
  const handleModuleClick = useCallback((id: ModuleId) => {
    const module = MODULE_POSITIONS.find(m => m.id === id);
    if (!module) return;

    soundPlayer.play('ui_module_enter');
    enterModule(id);
    // 相机飞向模块位置（加偏移）
    flyTo(addVectors(module.position, CAMERA_OFFSET));
    navigate(module.route);
  }, [enterModule, flyTo, navigate]);

  // 悬停音效（移动端降级时不播放，仅在指针事件回调中触发）
  const handleHover = useCallback((id: ModuleId | null) => {
    if (id && !shouldDegrade3D) soundPlayer.play('ui_hover_3d', { throttleMs: 200 });
    setHovered(id);
  }, [setHovered, shouldDegrade3D]);

  // 计算相机目标位置
  const cameraTarget: [number, number, number] = (() => {
    if (isInModule && currentModule) {
      const module = MODULE_POSITIONS.find(m => m.id === currentModule);
      if (module) return addVectors(module.position, CAMERA_OFFSET);
    }
    return [0, 0, 10]; // 默认全景位置
  })();

  // 深海模式渲染
  if (theme === 'deep-sea') {
    return (
      <>
        <CameraController target={cameraTarget} speed={isInModule ? 3 : 2} />
        {MODULE_POSITIONS.map((module) => {
          const config = DEEP_SEA_CONFIG[module.id];
          const isVisible = !isInModule || module.id === currentModule;
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
              showLabel={highlightAll}
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
      <CameraController target={cameraTarget} speed={isInModule ? 3 : 2} />
      {MODULE_POSITIONS.map((module) => {
        const config = AURORA_ORBIT_CONFIG[module.id];
        const isVisible = !isInModule || module.id === currentModule;
        if (!isVisible) return null;

        return (
          <AuroraModuleEntity
            key={module.id}
            id={module.id}
            orbitRadius={config.orbitRadius}
            orbitSpeed={config.orbitSpeed}
            initialAngle={config.initialAngle}
            isActive={currentModule === module.id}
            showLabel={highlightAll}
            onClick={handleModuleClick}
            onHover={handleHover}
          />
        );
      })}
    </>
  );
}
