/**
 * 3D空间导航组件 — 在Canvas内渲染模块实体并处理交互
 * 根据主题自动切换深海/穹顶风格的模块表达
 *
 * 相机控制权分层（防止两套系统冲突）：
 * - overview 模式：OrbitControls 接管缩放和拖拽旋转，CameraController 暂停
 * - entering 模式：useCameraFlight 独占相机，CameraController 暂停
 * - docked 模式：CameraController 接管（渲染已暂停，实际不执行 lerp）
 *
 * 相机飞行统一由相位迁移响应式驱动（覆盖 3D 点击/数字键/路由同步等全部入口）；
 * 点击入口额外记录行星实时坐标供飞行使用（行星在公转，固定坐标会飞向错误位置）。
 *
 * @ai-context: 3D 空间导航组件——键盘/手势驱动的模块间轨道跳转，与 OrbitalStore 状态联动；渲染于 R3F Canvas 内，禁止使用 DOM API。
 */
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useOrbitalStore, MODULE_POSITIONS, type ModuleId } from './OrbitalStore';
import { useSceneTheme } from '../hooks/useSceneTheme';
import { ModuleEntity } from '../objects/ModuleEntity';
import { useWorldSignals } from '@/features/retention/hooks/useWorldSignals';
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
  constellation: { geometry: 'octahedron', color: '#F59E0B', emissiveColor: '#FBBF24' },
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
  constellation: { orbitRadius: 4.8, orbitSpeed: 0.14, initialAngle: Math.PI * 1.9 },
};

/** 相机飞入模块时的偏移（从模块位置向相机方向偏移） */
const CAMERA_OFFSET: [number, number, number] = [0, 0, 4];

/** 概览态相机全景位（退出模块时相机飞回此位置） */
const OVERVIEW_CAMERA_POS: [number, number, number] = [0, 0, 10];

function addVectors(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function SpatialNav() {
  const navigate = useNavigate();
  const theme = useSceneTheme();
  const { phase, overlayVisible, currentModule, hoveredModule, highlightAll, enterModule, setHovered } = useOrbitalStore();
  const { flyTo, update } = useCameraFlight();
  const { shouldDegrade3D } = useRuntimeEnv();
  // 世界信号：实体辉光随学习数据（珊瑚健康度）明暗——宪法第一条接线（第一批仅深海实体）
  const worldSignals = useWorldSignals();

  // 点击入口记录的行星实时世界坐标（飞行 effect 优先消费），点击后才有效
  const clickFlightPosRef = useRef<Partial<Record<ModuleId, [number, number, number]>>>({});
  // 上一次已处理的飞行键（entering:模块 / overview / docked），防止重复飞行
  const flightKeyRef = useRef<string | null>(null);

  // 每帧更新相机飞行
  useFrame((_, delta) => {
    // 防止浏览器节流导致的帧时间尖峰
    const safeDelta = Math.min(delta, 0.1);
    update(safeDelta);
  });

  // 响应式相机飞行：统一覆盖全部入口（3D 点击/数字键/返回首页/路由同步）。
  // 此前 flyTo 仅在点击回调中命令式调用，数字键等入口进入时无镜头移动；
  // 退出（Esc）时相机也需从模块停靠位飞回全景位。
  useEffect(() => {
    const flightKey = phase === 'entering' ? `entering:${currentModule}` : phase;
    if (flightKeyRef.current === flightKey) return;
    const prevKey = flightKeyRef.current;
    flightKeyRef.current = flightKey;

    if (phase === 'entering' && currentModule) {
      const module = MODULE_POSITIONS.find((m) => m.id === currentModule);
      if (!module) return;
      // 优先使用点击时记录的实时坐标，fallback 到固定坐标
      const basePos = clickFlightPosRef.current[currentModule] ?? module.position;
      delete clickFlightPosRef.current[currentModule];
      // 注视点传入模块实时坐标：飞行期间朝向同步转向模块，
      // 否则相机抵达后仍保持概览态旧朝向，叠加 docked 渲染冻结导致视角错位
      flyTo(addVectors(basePos, CAMERA_OFFSET), basePos);
    } else if (phase === 'overview' && prevKey && prevKey !== 'overview') {
      // 退出模块：返回全景位并转向场景中心（初始挂载即 overview 时 prevKey 为 null，不飞行）
      flyTo(OVERVIEW_CAMERA_POS, [0, 0, 0]);
    }
  }, [phase, currentModule, flyTo]);

  // 点击模块实体：飞行由相位迁移 effect 统一触发（深海模式使用固定坐标）
  const handleModuleClick = useCallback((id: ModuleId) => {
    const module = MODULE_POSITIONS.find(m => m.id === id);
    if (!module) return;

    soundPlayer.play('ui_module_enter');
    enterModule(id);
    navigate(module.route);
  }, [enterModule, navigate]);

  // 点击 Aurora 模式行星：记录实时世界坐标供飞行 effect 消费，而非使用 MODULE_POSITIONS 固定坐标
  // 因为行星在轨道上持续公转，固定坐标会导致相机飞向错误位置（漂移根因之一）
  const handleAuroraClick = useCallback((id: ModuleId, currentPosition?: [number, number, number]) => {
    const module = MODULE_POSITIONS.find(m => m.id === id);
    if (!module) return;

    soundPlayer.play('ui_module_enter');
    // enterModule 在"同模块已停靠且覆盖层可见"时为无操作（不产生飞行），此时不记录，避免陈旧坐标被后续进入误用
    const s = useOrbitalStore.getState();
    const willNoop = s.currentModule === id && s.phase === 'docked' && s.overlayVisible;
    if (!willNoop && currentPosition) {
      clickFlightPosRef.current[id] = currentPosition;
    }
    enterModule(id);
    navigate(module.route);
  }, [enterModule, navigate]);

  // 悬停音效（移动端降级时不播放，仅在指针事件回调中触发）
  const handleHover = useCallback((id: ModuleId | null) => {
    if (id && !shouldDegrade3D) soundPlayer.play('ui_hover_3d', { throttleMs: 200 });
    setHovered(id);
  }, [setHovered, shouldDegrade3D]);

  // 计算相机目标位置与注视点：非概览相位（entering/docked）时注视当前模块，否则全景位/场景中心
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
              glowScale={worldSignals.glowScale}
              isHovered={hoveredModule === module.id || highlightAll}
              // 选中态需结合相位：Esc 退出后 currentModule 保留（页面状态存活），但视觉选中必须解除
              isActive={phase !== 'overview' && currentModule === module.id}
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
            // 选中态需结合相位：Esc 退出后 currentModule 保留（页面状态存活），
            // 若不解除，行星将持续保持放大/光环/停止公转的"选中"表现
            isActive={phase !== 'overview' && currentModule === module.id}
            showLabel={highlightAll || !overlayVisible}
            onClick={handleAuroraClick}
            onHover={handleHover}
          />
        );
      })}
    </>
  );
}
