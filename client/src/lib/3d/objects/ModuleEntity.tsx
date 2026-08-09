/**
 * ModuleEntity — 每个学习模块在3D空间中的精致化视觉表达
 * 多层细节：自发光核心 + Fresnel轮廓 + 线框辉光 + 轨道粒子 + 地面辉光
 *
 * @ai-context: 3D 场景对象：ModuleEntity。
 * 宪法第一条接入：glowScale 映射学习数据（掌握度=亮度），域 0.6–1.15。
 * 宪法第四条：三级性能降级嵌入（high/medium/low）。
 * @ai-context: P1-3 InstancedMesh 审计结论——放弃实例化：各模块几何体
 * 6 种、程序化纹理/材质参数 per-module 独立、Float 浮动与 Html 标签
 * 必须挂独立对象，实例化收益（<20% draw call）不足以覆盖改造复杂度
 * 与 hover/active 独立交互的表现风险。
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Float, Html } from '@react-three/drei';
import { getModuleSubtitle } from '@/features/onboarding/firstDive/moduleSubtitles';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import {
  createModuleTexture, createNormalMap, createRoughnessMap,
  createFlashcardTexture, idToSeed,
} from './proceduralTextures';

type GeometryType = 'dodecahedron' | 'torus' | 'box' | 'sphere' | 'octahedron' | 'icosahedron';

/** 法线贴图强度（模块级复用，避免每帧 new Vector2） */
const NORMAL_SCALE = new THREE.Vector2(0.5, 0.5);

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
  glowScale?: number;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}

/** 几何体工厂 */
function ModuleGeometry({ geometry }: { geometry: GeometryType }) {
  switch (geometry) {
    case 'dodecahedron': return <dodecahedronGeometry args={[0.8, 0]} />;
    case 'torus': return <torusGeometry args={[0.6, 0.25, 16, 32]} />;
    case 'box': return <boxGeometry args={[1, 1.2, 0.6]} />;
    case 'sphere': return <sphereGeometry args={[0.7, 32, 32]} />;
    case 'octahedron': return <octahedronGeometry args={[0.8, 0]} />;
    case 'icosahedron': return <icosahedronGeometry args={[0.7, 0]} />;
  }
}

/**
 * 闪卡专用：保留平面卡片造型，与其他模块一致的交互表现
 * 矩形辉光线框（透明度逻辑同 WireframeGlow）+ 自转 + 悬停/激活缩放与发光增强
 */
function FlashcardGeometry({ textures, emissiveColor, isActive, isHovered }: {
  textures?: { mapA?: THREE.CanvasTexture; mapB?: THREE.CanvasTexture } | null;
  emissiveColor: string;
  isActive: boolean;
  isHovered: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const frontRef = useRef<THREE.Mesh>(null);
  const backRef = useRef<THREE.Mesh>(null);
  const frontLineRef = useRef<THREE.LineSegments>(null);
  const backLineRef = useRef<THREE.LineSegments>(null);

  // 卡片矩形边框几何体（平面四边，与卡片同尺寸）
  const edgesGeom = useMemo(() => {
    const plane = new THREE.PlaneGeometry(0.9, 1.2);
    const edges = new THREE.EdgesGeometry(plane);
    plane.dispose();
    return edges;
  }, []);

  // 与其他模块主体一致的自转配置
  const rotationConfig = useRef({
    axis: new THREE.Vector3(
      Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5,
    ).normalize(),
    speed: 0.2 + Math.random() * 0.3,
  }).current;

  const targetScale = isActive ? 1.3 : isHovered ? 1.15 : 1.0;
  const targetEmissive = isActive ? 1.2 : isHovered ? 0.8 : 0.3;

  useFrame((_, delta) => {
    const safeDelta = Math.min(delta, 0.1);
    // 自转 + 交互缩放（与其他模块一致）
    if (groupRef.current) {
      groupRef.current.rotateOnAxis(rotationConfig.axis, safeDelta * rotationConfig.speed);
      const cs = groupRef.current.scale.x;
      groupRef.current.scale.setScalar(THREE.MathUtils.lerp(cs, targetScale, safeDelta * 4));
    }
    // 卡片发光增强（与其他模块一致）
    [frontRef, backRef].forEach((ref) => {
      const mat = ref.current?.material as THREE.MeshStandardMaterial | undefined;
      if (mat) mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, targetEmissive, safeDelta * 4);
    });
    // 线框透明度（与 WireframeGlow 相同逻辑：基线 0.25，悬停 0.6，激活 0.85）
    const targetLine = isActive ? 0.85 : isHovered ? 0.6 : 0.25;
    [frontLineRef, backLineRef].forEach((ref) => {
      const mat = ref.current?.material as THREE.LineBasicMaterial | undefined;
      if (mat) mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetLine, safeDelta * 3);
    });
  });

  return (
    <group ref={groupRef}>
      {/* 正面卡片 + 矩形辉光线框 */}
      <mesh ref={frontRef} position={[0, 0, 0.05]} rotation={[0, 0, 0.05]}>
        <planeGeometry args={[0.9, 1.2]} />
        <meshStandardMaterial color="#43C58B" emissive="#43C58B" emissiveIntensity={0.3} map={textures?.mapA} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments ref={frontLineRef} geometry={edgesGeom} position={[0, 0, 0.05]} rotation={[0, 0, 0.05]} scale={[1.06, 1.06, 1.06]}>
        <lineBasicMaterial color={emissiveColor} transparent opacity={0.25} blending={THREE.AdditiveBlending} />
      </lineSegments>
      {/* 背面卡片 + 矩形辉光线框 */}
      <mesh ref={backRef} position={[0, 0, -0.05]} rotation={[0, 0, -0.05]}>
        <planeGeometry args={[0.9, 1.2]} />
        <meshStandardMaterial color="#63DBA5" emissive="#63DBA5" emissiveIntensity={0.3} map={textures?.mapB} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments ref={backLineRef} geometry={edgesGeom} position={[0, 0, -0.05]} rotation={[0, 0, -0.05]} scale={[1.06, 1.06, 1.06]}>
        <lineBasicMaterial color={emissiveColor} transparent opacity={0.25} blending={THREE.AdditiveBlending} />
      </lineSegments>
    </group>
  );
}

// ─── 细节层 1：Fresnel 辉光轮廓 ─────────────────────
function FresnelGlow({ color, isActive, isHovered, geometry }: {
  color: string; isActive: boolean; isHovered: boolean; geometry: GeometryType;
}) {
  const glowRef = useRef<THREE.Mesh>(null);
  const targetIntensity = isActive ? 1.0 : isHovered ? 0.6 : 0.2;

  useFrame((_, delta) => {
    if (!glowRef.current) return;
    const mat = glowRef.current.material as THREE.ShaderMaterial;
    mat.uniforms.uIntensity.value = THREE.MathUtils.lerp(
      mat.uniforms.uIntensity.value, targetIntensity, Math.min(delta * 4, 1),
    );
  });

  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(color) },
    uIntensity: { value: 0.2 },
  }), [color]);

  return (
    <mesh ref={glowRef} scale={[1.12, 1.12, 1.12]}>
      <ModuleGeometry geometry={geometry} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={`varying vec3 vNormal;varying vec3 vPosition;void main(){vNormal=normalize(normalMatrix*normal);vPosition=(modelViewMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`}
        fragmentShader={`uniform vec3 uColor;uniform float uIntensity;varying vec3 vNormal;varying vec3 vPosition;void main(){vec3 viewDir=normalize(-vPosition);float rim=1.0-max(0.0,dot(viewDir,vNormal));rim=pow(rim,2.5);float alpha=rim*uIntensity*0.6;gl_FragColor=vec4(uColor,alpha);}`}
        transparent depthWrite={false} side={THREE.FrontSide} blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ─── 细节层 2：辉光线框（EdgesGeometry） ────────────
// 常驻显示：默认透明度 0.4 持续可见，悬停/选中时进一步增强
function WireframeGlow({ color, isActive, isHovered, geometry }: {
  color: string; isActive: boolean; isHovered: boolean; geometry: GeometryType;
}) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const edgesGeom = useMemo(() => {
    // 生成临时几何体来计算边
    let geo: THREE.BufferGeometry;
    switch (geometry) {
      case 'dodecahedron': geo = new THREE.DodecahedronGeometry(0.8); break;
      case 'torus': geo = new THREE.TorusGeometry(0.6, 0.25, 16, 32); break;
      case 'box': geo = new THREE.BoxGeometry(1, 1.2, 0.6); break;
      case 'sphere': geo = new THREE.SphereGeometry(0.7, 24, 24); break;
      case 'octahedron': geo = new THREE.OctahedronGeometry(0.8); break;
      case 'icosahedron': geo = new THREE.IcosahedronGeometry(0.7); break;
    }
    const edges = new THREE.EdgesGeometry(geo);
    geo.dispose();
    return edges;
  }, [geometry]);

  useFrame((_, delta) => {
    if (!lineRef.current) return;
    const mat = lineRef.current.material as THREE.LineBasicMaterial;
    // 常驻可见基线 0.4，交互时平滑增强（悬停 0.6 / 激活 0.85）
    const target = isActive ? 0.85 : isHovered ? 0.6 : 0.4;
    mat.opacity = THREE.MathUtils.lerp(mat.opacity, target, Math.min(delta * 3, 1));
  });

  return (
    <lineSegments ref={lineRef} geometry={edgesGeom} scale={[1.06, 1.06, 1.06]}>
      <lineBasicMaterial color={color} transparent opacity={0.25} blending={THREE.AdditiveBlending} />
    </lineSegments>
  );
}

// ─── 细节层 3：核心呼吸光 ────────────────────────────
function CoreBreath({ color, isActive, isHovered }: {
  color: string; isActive: boolean; isHovered: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += Math.min(delta, 0.1);
    if (!meshRef.current) return;
    // 呼吸脉动：活跃时快速，悬浮时中等，默认缓慢
    const speed = isActive ? 2.5 : isHovered ? 1.5 : 0.8;
    const pulse = 0.7 + Math.sin(timeRef.current * speed) * 0.3;
    meshRef.current.scale.setScalar(pulse);
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = THREE.MathUtils.lerp(
      mat.opacity, isActive ? 0.6 : isHovered ? 0.4 : 0.2, Math.min(delta * 3, 1),
    );
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshBasicMaterial color={color} transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

// ─── 细节层 4：轨道粒子环（动态旋转） ────────────────
// 使用固定最大 buffer（MAX_COUNT=40）+ drawRange 控制可见粒子数，
// 彻底避免 buffer resize 导致的 WebGL 错误
const MAX_ORBITAL = 40;

function OrbitalRing({ isActive, isHovered, color }: {
  isActive: boolean; isHovered: boolean; color: string;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const visibleCount = isActive ? 40 : isHovered ? 20 : 0;
  const angleRef = useRef(0);

  // 固定分配最大 buffer，避免 resize
  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(MAX_ORBITAL * 3);
    const col = new Float32Array(MAX_ORBITAL * 3);
    const baseColor = new THREE.Color(color);
    const white = new THREE.Color('#ffffff');
    for (let i = 0; i < MAX_ORBITAL; i++) {
      const angle = (i / MAX_ORBITAL) * Math.PI * 2;
      const radius = 1.4 + Math.random() * 0.2;
      const tilt = (Math.random() - 0.5) * 0.6;
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = Math.sin(angle * 0.7) * 0.3 + tilt;
      pos[i * 3 + 2] = Math.sin(angle) * radius;
      const t = Math.random();
      const c = baseColor.clone().lerp(white, t * 0.5);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    return { positions: pos, colors: col };
  }, [color]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    // drawRange 控制可见粒子数（buffer 大小固定不变）
    pointsRef.current.geometry.setDrawRange(0, visibleCount);
    if (visibleCount === 0) return;
    angleRef.current += Math.min(delta, 0.1) * (isActive ? 1.5 : 0.6);
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    for (let i = 0; i < visibleCount; i++) {
      const a = (i / visibleCount) * Math.PI * 2 + angleRef.current;
      const radius = 1.4 + (Math.sin(i * 0.5) * 0.08 + 0.08);
      const tilt = (Math.sin(i * 0.3) * 0.3);
      pos[i * 3] = Math.cos(a) * radius;
      pos[i * 3 + 1] = Math.sin(a * 0.7) * 0.3 + tilt;
      pos[i * 3 + 2] = Math.sin(a) * radius;
    }
    posAttr.needsUpdate = true;
  });

  if (visibleCount === 0) return null;

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={MAX_ORBITAL} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} count={MAX_ORBITAL} />
      </bufferGeometry>
      <pointsMaterial
        vertexColors size={0.05} transparent
        opacity={isActive ? 0.9 : 0.5} blending={THREE.AdditiveBlending}
        depthWrite={false} sizeAttenuation
      />
    </points>
  );
}

// ─── 细节层 5：地面辉光圆环 ──────────────────────────
function GroundGlow({ color, isActive }: { color: string; isActive: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += Math.min(delta, 0.1);
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    const pulse = 0.3 + Math.sin(timeRef.current * 0.5) * 0.15;
    mat.opacity = isActive ? pulse : pulse * 0.5;
  });

  const ringColor = useMemo(() => new THREE.Color(color), [color]);

  return (
    <mesh ref={meshRef} position={[0, -0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.6, 1.4, 48]} />
      <meshBasicMaterial color={ringColor} transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── 主组件 ──────────────────────────────────────────
export function ModuleEntity({
  id, position, label, geometry, color, emissiveColor,
  isHovered, isActive, showLabel = false, glowScale = 1,
  onClick, onPointerOver, onPointerOut,
}: ModuleEntityProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const subtitle = getModuleSubtitle(id);
  const tier = useEffectiveTier();
  const isLowTier = tier === 'low';

  const rotationConfig = useRef({
    axis: new THREE.Vector3(
      Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5,
    ).normalize(),
    speed: 0.2 + Math.random() * 0.3,
  }).current;

  const targetScale = isActive ? 1.3 : isHovered ? 1.15 : 1.0;
  const targetEmissive = (isActive ? 1.2 : isHovered ? 0.8 : 0.3) * glowScale;
  const targetMetalness = isActive ? 0.5 : 0.3;
  const targetRoughness = isActive ? 0.2 : 0.4;

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const safeDelta = Math.min(delta, 0.1);
    meshRef.current.rotateOnAxis(rotationConfig.axis, safeDelta * rotationConfig.speed);
    const cs = meshRef.current.scale.x;
    meshRef.current.scale.setScalar(THREE.MathUtils.lerp(cs, targetScale, safeDelta * 4));
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    if (mat) {
      mat.emissiveIntensity = THREE.MathUtils.lerp(
        mat.emissiveIntensity, targetEmissive, safeDelta * 4,
      );
      if (!isLowTier) {
        mat.metalness = THREE.MathUtils.lerp(mat.metalness, targetMetalness, safeDelta * 4);
        mat.roughness = THREE.MathUtils.lerp(mat.roughness, targetRoughness, safeDelta * 4);
      }
    }
  });

  const isFlashcard = id === 'flashcards';
  const seed = useMemo(() => idToSeed(id), [id]);

  // 生成程序化纹理（仅不低档）
  const textures = useMemo(() => {
    if (isLowTier) return null;
    return {
      map: createModuleTexture(color, emissiveColor, seed),
      normalMap: createNormalMap(seed),
      roughnessMap: createRoughnessMap(seed),
    };
  }, [color, emissiveColor, seed, isLowTier]);

  // 闪卡纹理
  const flashcardTextures = useMemo(() => {
    if (isLowTier) return null;
    return { mapA: createFlashcardTexture('#43C58B'), mapB: createFlashcardTexture('#63DBA5') };
  }, [isLowTier]);

  return (
    <Float speed={1.0} rotationIntensity={0.5} floatIntensity={0.8}>
      <group
        position={position}
        onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}
      >
        {isFlashcard ? (
          <>
            {/* 核心呼吸光（与其他模块一致） */}
            {!isLowTier && <CoreBreath color={emissiveColor} isActive={isActive} isHovered={isHovered} />}
            <FlashcardGeometry
              textures={flashcardTextures}
              emissiveColor={emissiveColor}
              isActive={isActive}
              isHovered={isHovered}
            />
            {/* 轨道粒子环（与其他模块一致） */}
            {!isLowTier && (isActive || isHovered) && (
              <OrbitalRing isActive={isActive} isHovered={isHovered} color={emissiveColor} />
            )}
            {/* 地面辉光（与其他模块一致） */}
            {!isLowTier && <GroundGlow color={emissiveColor} isActive={isActive} />}
          </>
        ) : (
          <>
            {/* 核心呼吸光 */}
            {!isLowTier && <CoreBreath color={emissiveColor} isActive={isActive} isHovered={isHovered} />}

            {/* 主体 — 字面量标签分支（变量作 JSX 标签会被 React 视为组件而非 R3F 内置元素，导致材质创建失败） */}
            <mesh ref={meshRef}>
              <ModuleGeometry geometry={geometry} />
              {isLowTier ? (
                <meshStandardMaterial
                  color={color} emissive={emissiveColor} emissiveIntensity={0.3}
                  transparent opacity={0.9}
                />
              ) : (
                <meshPhysicalMaterial
                  color={color} emissive={emissiveColor} emissiveIntensity={0.3}
                  metalness={0.3} roughness={0.4} clearcoat={0.15} clearcoatRoughness={0.3}
                  transparent opacity={0.92} envMapIntensity={0.4}
                  map={textures?.map}
                  normalMap={textures?.normalMap}
                  normalScale={NORMAL_SCALE}
                  roughnessMap={textures?.roughnessMap}
                />
              )}
            </mesh>

            {/* Fresnel 辉光轮廓 */}
            {!isLowTier && (
              <FresnelGlow color={emissiveColor} isActive={isActive} isHovered={isHovered} geometry={geometry} />
            )}

            {/* 辉光线框（全档位常驻显示：性能降级也不关闭） */}
            <WireframeGlow color={emissiveColor} isActive={isActive} isHovered={isHovered} geometry={geometry} />

            {/* 轨道粒子环 */}
            {!isLowTier && (isActive || isHovered) && (
              <OrbitalRing isActive={isActive} isHovered={isHovered} color={emissiveColor} />
            )}

            {/* 地面辉光 */}
            {!isLowTier && <GroundGlow color={emissiveColor} isActive={isActive} />}
          </>
        )}

        {/* 标签 */}
        {(showLabel || isHovered) && (
          <Html center distanceFactor={8} position={[0, 1.3, 0]} style={{ pointerEvents: 'none' }}>
            <div className="rounded-lg bg-slate-900/80 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm whitespace-nowrap border border-brand-400/30">
              {label}
              {subtitle && <span className="ml-1.5 text-xs text-white/50">· {subtitle}</span>}
            </div>
          </Html>
        )}
      </group>
    </Float>
  );
}