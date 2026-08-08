/**
 * AuroraModuleEntity — 浅色模式下模块的行星形态视觉表达
 * 每个模块对应一颗行星，沿轨道绕太阳公转
 *
 * @ai-context: 3D 场景对象：AuroraModuleEntity。
 */
import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Float, Html } from '@react-three/drei';
import type { ModuleId } from '../navigation/OrbitalStore';
import { getModuleSubtitle } from '@/features/onboarding/firstDive/moduleSubtitles';

export interface AuroraModuleEntityProps {
  id: ModuleId;
  orbitRadius: number;
  orbitSpeed: number;
  initialAngle?: number;
  showLabel?: boolean;
  /** 点击回调，携带行星当前实时世界坐标（用于 flyTo 飞向实际位置而非固定坐标） */
  onClick?: (id: ModuleId, currentPosition?: [number, number, number]) => void;
  onHover?: (id: ModuleId | null) => void;
  isActive?: boolean;
}

interface PlanetConfig {
  radius: number;
  color: string;
  emissive: string;
  label: string;
}

const PLANET_CONFIGS: Record<ModuleId, PlanetConfig> = {
  dashboard: { radius: 1.0, color: '#40AB92', emissive: '#57C6A9', label: '首页' },
  pomodoro: { radius: 0.7, color: '#E8833A', emissive: '#F4A05E', label: '深潜' },
  notes: { radius: 0.7, color: '#4A9BD9', emissive: '#6FB4E8', label: '结礁' },
  flashcards: { radius: 0.5, color: '#43C58B', emissive: '#63DBA5', label: '闪卡' },
  feynman: { radius: 0.6, color: '#F0E3C8', emissive: '#F8F0DC', label: '浮出水面' },
  inspiration: { radius: 0.4, color: '#E8B84B', emissive: '#F2CF7D', label: '萤火海沟' },
  classroom: { radius: 0.55, color: '#2FB8AC', emissive: '#4ED0C2', label: '回声定位' },
  constellation: { radius: 0.5, color: '#9FB8D8', emissive: '#C3D6EA', label: '星座' },
  sop: { radius: 0.45, color: '#B5D84E', emissive: '#CCE672', label: '标准作业' },
};

/** 轨道位置最大距离约束（兜底），超出则等比缩放回安全范围 */
const MAX_DISTANCE = 6;

export function AuroraModuleEntity({
  id,
  orbitRadius,
  orbitSpeed,
  initialAngle = 0,
  showLabel = false,
  onClick,
  onHover,
  isActive = false,
}: AuroraModuleEntityProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const angleRef = useRef(initialAngle);
  // 功能副标题：隐喻名（深潜/结礁…）无法自解释，常驻直白功能名确保用户能把行星对应到功能
  const subtitle = getModuleSubtitle(id);

  const config = PLANET_CONFIGS[id];

  // 轨道ring几何体（用于显示轨道线）
  const orbitGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 128;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(
        Math.cos(angle) * orbitRadius,
        0,
        Math.sin(angle) * orbitRadius
      ));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [orbitRadius]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // 防止浏览器节流（如标签切换）导致的帧时间尖峰，最大允许 100ms
    const safeDelta = Math.min(delta, 0.1);

    // 悬浮或激活时停止公转
    if (!hovered && !isActive) {
      angleRef.current += safeDelta * orbitSpeed;
    }

    let x = Math.cos(angleRef.current) * orbitRadius;
    let z = Math.sin(angleRef.current) * orbitRadius;
    const y = Math.sin(angleRef.current * 0.5) * 0.5; // 轻微上下浮动

    // 轨道位置 clamp 兜底：防止长时间运行或异常导致行星漂出可视范围
    const dist = Math.sqrt(x * x + z * z);
    if (dist > MAX_DISTANCE) {
      const scale = MAX_DISTANCE / dist;
      x *= scale;
      z *= scale;
    }

    groupRef.current.position.set(x, y, z);

    // 悬浮时放大
    const targetScale = hovered || isActive ? 1.4 : 1.0;
    const currentScale = groupRef.current.scale.x;
    const newScale = THREE.MathUtils.lerp(currentScale, targetScale, safeDelta * 5);
    groupRef.current.scale.setScalar(newScale);

    // 行星自转
    if (meshRef.current) {
      meshRef.current.rotation.y += safeDelta * 0.5;
    }

    // 光环透明度动画
    if (ringRef.current) {
      const ringMat = ringRef.current.material as THREE.MeshBasicMaterial;
      const targetOpacity = hovered || isActive ? 0.6 : 0;
      ringMat.opacity = THREE.MathUtils.lerp(ringMat.opacity, targetOpacity, safeDelta * 5);
    }
  });

  const handlePointerEnter = () => {
    setHovered(true);
    onHover?.(id);
    document.body.style.cursor = 'pointer';
  };

  const handlePointerLeave = () => {
    setHovered(false);
    onHover?.(null);
    document.body.style.cursor = 'default';
  };

  // 点击时获取行星当前实时世界坐标，而非使用固定坐标（修复漂移后 flyTo 目标偏移问题）
  const handleClick = () => {
    let worldPos: [number, number, number] | undefined;
    if (groupRef.current) {
      const wp = new THREE.Vector3();
      groupRef.current.getWorldPosition(wp);
      worldPos = [wp.x, wp.y, wp.z];
    }
    onClick?.(id, worldPos);
  };

  return (
    <>
      {/* 轨道线 */}
      <lineLoop geometry={orbitGeometry}>
        <lineBasicMaterial color="#FFFFFF" transparent opacity={0.15} />
      </lineLoop>

      {/* 行星组 */}
      <group ref={groupRef}>
        <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.2}>
          {/* 行星本体 */}
          <mesh
            ref={meshRef}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            onClick={handleClick}
          >
            <sphereGeometry args={[config.radius, 32, 32]} />
            <meshStandardMaterial
              color={config.color}
              emissive={config.emissive}
              emissiveIntensity={hovered ? 0.4 : 0.15}
              metalness={0.3}
              roughness={0.5}
            />
          </mesh>

          {/* 悬浮光环 */}
          <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[config.radius * 1.3, config.radius * 1.6, 64]} />
            <meshBasicMaterial
              color={config.color}
              transparent
              opacity={0}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* 标签 — showLabel 或悬浮时显示 */}
          {(showLabel || hovered) && (
            <Html
              center
              distanceFactor={8}
              position={[0, config.radius + 0.6, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div className="rounded-lg bg-slate-900/80 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm whitespace-nowrap border border-brand-400/30">
                {config.label}
                {/* 常驻功能副标题：隐喻名旁附直白功能名 */}
                {subtitle && (
                  <span className="ml-1.5 text-xs text-white/50">· {subtitle}</span>
                )}
              </div>
            </Html>
          )}
        </Float>
      </group>
    </>
  );
}
