/**
 * ModuleEntity — 每个学习模块在3D空间中的视觉表达
 * 支持多种几何体、悬浮动画、发光交互
 *
 * @ai-context: 3D 场景对象：ModuleEntity。
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Float, Html } from '@react-three/drei';
import { getModuleSubtitle } from '@/features/onboarding/firstDive/moduleSubtitles';

type GeometryType = 'dodecahedron' | 'torus' | 'box' | 'sphere' | 'octahedron' | 'icosahedron';

interface ModuleEntityProps {
  id: string;
  position: [number, number, number];
  label: string;
  geometry: GeometryType;
  color: string;
  emissiveColor: string;
  isHovered: boolean;
  isActive: boolean;
  showLabel?: boolean;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}

/**
 * 根据geometry类型渲染对应的几何体
 */
function ModuleGeometry({ geometry }: { geometry: GeometryType }) {
  switch (geometry) {
    case 'dodecahedron':
      return <dodecahedronGeometry args={[0.8, 0]} />;
    case 'torus':
      return <torusGeometry args={[0.6, 0.25, 16, 32]} />;
    case 'box':
      return <boxGeometry args={[1, 1.2, 0.6]} />;
    case 'sphere':
      return <sphereGeometry args={[0.7, 32, 32]} />;
    case 'octahedron':
      return <octahedronGeometry args={[0.8, 0]} />;
    case 'icosahedron':
      return <icosahedronGeometry args={[0.7, 0]} />;
  }
}

/**
 * 闪卡专用几何 — 两个平行的 PlaneGeometry (卡片堆)
 */
function FlashcardGeometry() {
  return (
    <group>
      <mesh position={[0, 0, 0.05]} rotation={[0, 0, 0.05]}>
        <planeGeometry args={[0.9, 1.2]} />
        <meshStandardMaterial color="#3B82F6" emissive="#3B82F6" emissiveIntensity={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, -0.05]} rotation={[0, 0, -0.05]}>
        <planeGeometry args={[0.9, 1.2]} />
        <meshStandardMaterial color="#6366F1" emissive="#6366F1" emissiveIntensity={0.3} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function ModuleEntity({
  id,
  position,
  label,
  geometry,
  color,
  emissiveColor,
  isHovered,
  isActive,
  showLabel = false,
  onClick,
  onPointerOver,
  onPointerOut,
}: ModuleEntityProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  // 功能副标题：隐喻名（深潜/结礁…）无法自解释，常驻直白功能名确保用户能把几何体对应到功能
  const subtitle = getModuleSubtitle(id);

  // Each entity has a unique rotation axis and speed
  const rotationConfig = useRef({
    axis: new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5,
    ).normalize(),
    speed: 0.2 + Math.random() * 0.3,
  }).current;

  // Target states for lerp transitions
  const targetScale = isActive ? 1.3 : isHovered ? 1.15 : 1.0;
  const targetEmissive = isActive ? 1.2 : isHovered ? 0.8 : 0.3;

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    // Self rotation
    meshRef.current.rotateOnAxis(rotationConfig.axis, delta * rotationConfig.speed);

    // Smooth scale transition
    const currentScale = meshRef.current.scale.x;
    const newScale = THREE.MathUtils.lerp(currentScale, targetScale, delta * 4);
    meshRef.current.scale.setScalar(newScale);

    // Smooth emissive transition
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        materialRef.current.emissiveIntensity,
        targetEmissive,
        delta * 4,
      );
    }
  });

  // Use special geometry for flashcards
  const isFlashcard = id === 'flashcards';

  return (
    <Float speed={1.0} rotationIntensity={0.5} floatIntensity={0.8}>
      <group
        position={position}
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      >
        {isFlashcard ? (
          <FlashcardGeometry />
        ) : (
          <mesh ref={meshRef}>
            <ModuleGeometry geometry={geometry} />
            <meshStandardMaterial
              ref={materialRef}
              color={color}
              emissive={emissiveColor}
              emissiveIntensity={0.3}
              metalness={0.3}
              roughness={0.4}
              transparent
              opacity={0.9}
            />
          </mesh>
        )}

        {/* Hover label or forced show label */}
        {(showLabel || isHovered) && (
          <Html
            center
            distanceFactor={8}
            position={[0, 1.3, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div className="rounded-lg bg-slate-900/80 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm whitespace-nowrap border border-indigo-500/30">
              {label}
              {/* 常驻功能副标题：隐喻名旁附直白功能名 */}
              {subtitle && (
                <span className="ml-1.5 text-xs text-white/50">· {subtitle}</span>
              )}
            </div>
          </Html>
        )}
      </group>
    </Float>
  );
}
