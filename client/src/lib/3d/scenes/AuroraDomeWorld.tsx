/**
 * AuroraDomeWorld — 浅色模式「晨曦穹顶」3D场景
 * 天文馆般的穹顶世界：太阳系行星轨道 + 星尘粒子 + 云层
 *
 * @ai-context: 3D 场景：AuroraDomeWorld。
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Float } from '@react-three/drei';
import { Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { SafeEffectComposer } from '../core/SafeEffectComposer';
import { usePerformanceStore } from '../core/PerformanceMonitor';
import { AuroraModuleEntity } from '../objects/AuroraModuleEntity';
import { useOrbitalStore } from '../navigation/OrbitalStore';
import type { ModuleId } from '../navigation/OrbitalStore';

// ─── 天空穹顶着色器 ───────────────────────────────────────
const domeVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const domeFragmentShader = /* glsl */ `
  uniform vec3 uColorTop;
  uniform vec3 uColorMid;
  uniform vec3 uColorBottom;
  varying vec3 vWorldPosition;

  void main() {
    float normalizedY = (vWorldPosition.y + 100.0) / 200.0;
    vec3 color;
    if (normalizedY > 0.6) {
      color = mix(uColorMid, uColorTop, (normalizedY - 0.6) / 0.4);
    } else {
      color = mix(uColorBottom, uColorMid, normalizedY / 0.6);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ─── 天空穹顶 ─────────────────────────────────────────────
function SkyDome() {
  const uniforms = useMemo(() => ({
    uColorTop: { value: new THREE.Color('#FCD34D') },
    uColorMid: { value: new THREE.Color('#60A5FA') },
    uColorBottom: { value: new THREE.Color('#F8FAFC') },
  }), []);

  return (
    <mesh>
      <sphereGeometry args={[100, 64, 64]} />
      <shaderMaterial
        vertexShader={domeVertexShader}
        fragmentShader={domeFragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

// ─── 太阳系统 ─────────────────────────────────────────────
function SunSystem() {
  const sunRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta;

    // 脉动动画：scale 1.0 ↔ 1.05，周期4秒
    const pulse = 1.0 + Math.sin(timeRef.current * (Math.PI * 2 / 4)) * 0.05;

    if (sunRef.current) {
      sunRef.current.scale.setScalar(pulse);
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(pulse * 1.02);
    }
  });

  return (
    <group>
      {/* 太阳核心 */}
      <mesh ref={sunRef}>
        <sphereGeometry args={[1.5, 32, 32]} />
        <meshBasicMaterial color="#FFF8E7" toneMapped={false} />
      </mesh>

      {/* 外围光晕 */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[2.5, 32, 32]} />
        <meshBasicMaterial
          color="#FFF8E7"
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ─── 星尘粒子 ─────────────────────────────────────────────
function StarDust({ count }: { count: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const velocitiesRef = useRef<Float32Array | null>(null);

  const { positions, colors, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);

    const colorA = new THREE.Color('#FFFBEB');
    const colorB = new THREE.Color('#F59E0B');

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // 随机分布在球形区域内
      const radius = 5 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      pos[i3 + 2] = radius * Math.cos(phi);

      // 渐变颜色
      const t = Math.random();
      const color = colorA.clone().lerp(colorB, t);
      col[i3] = color.r;
      col[i3 + 1] = color.g;
      col[i3 + 2] = color.b;

      // 部分粒子径向流动（太阳风效果）
      const isRadial = Math.random() > 0.6;
      if (isRadial) {
        const dir = new THREE.Vector3(pos[i3], pos[i3 + 1], pos[i3 + 2]).normalize();
        vel[i3] = dir.x * 0.3;
        vel[i3 + 1] = dir.y * 0.3;
        vel[i3 + 2] = dir.z * 0.3;
      } else {
        vel[i3] = (Math.random() - 0.5) * 0.1;
        vel[i3 + 1] = (Math.random() - 0.5) * 0.05;
        vel[i3 + 2] = (Math.random() - 0.5) * 0.1;
      }
    }

    return { positions: pos, colors: col, velocities: vel };
  }, [count]);

  velocitiesRef.current = velocities;

  useFrame((_, delta) => {
    if (!pointsRef.current || !velocitiesRef.current) return;

    const posAttr = pointsRef.current.geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;
    const vel = velocitiesRef.current;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      posArray[i3] += vel[i3] * delta;
      posArray[i3 + 1] += vel[i3 + 1] * delta;
      posArray[i3 + 2] += vel[i3 + 2] * delta;

      // 超出边界则重置到太阳附近
      const dist = Math.sqrt(
        posArray[i3] ** 2 + posArray[i3 + 1] ** 2 + posArray[i3 + 2] ** 2
      );
      if (dist > 80) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 3 + Math.random() * 5;
        posArray[i3] = r * Math.sin(phi) * Math.cos(theta);
        posArray[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        posArray[i3 + 2] = r * Math.cos(phi);
      }
    }

    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
          count={count}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        vertexColors
        transparent
        opacity={0.7}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

// ─── 云层效果 ─────────────────────────────────────────────
function CloudLayer() {
  const cloudsRef = useRef<THREE.Group>(null);

  const cloudData = useMemo(() => {
    return Array.from({ length: 4 }, () => ({
      position: [
        (Math.random() - 0.5) * 40,
        15 + Math.random() * 20,
        (Math.random() - 0.5) * 40,
      ] as [number, number, number],
      rotation: Math.random() * Math.PI,
      scale: 8 + Math.random() * 12,
      speed: 0.02 + Math.random() * 0.03,
      opacity: 0.1 + Math.random() * 0.1,
    }));
  }, []);

  useFrame((_, delta) => {
    if (!cloudsRef.current) return;
    cloudsRef.current.children.forEach((cloud, i) => {
      const data = cloudData[i];
      cloud.position.x += Math.sin(Date.now() * 0.0001 + i) * data.speed * delta;
      cloud.position.z += Math.cos(Date.now() * 0.0001 + i * 2) * data.speed * delta * 0.5;
      cloud.rotation.z += delta * 0.005;
    });
  });

  return (
    <group ref={cloudsRef}>
      {cloudData.map((cloud, i) => (
        <mesh
          key={i}
          position={cloud.position}
          rotation={[0, 0, cloud.rotation]}
        >
          <planeGeometry args={[cloud.scale, cloud.scale * 0.6]} />
          <meshBasicMaterial
            color="#FFFFFF"
            transparent
            opacity={cloud.opacity}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── 行星轨道系统 ─────────────────────────────────────────
const ORBIT_CONFIGS: Array<{
  id: ModuleId;
  radius: number;
  speed: number;
  initialAngle: number;
}> = [
  { id: 'dashboard', radius: 5, speed: 0.3, initialAngle: 0 },
  { id: 'pomodoro', radius: 8, speed: 0.22, initialAngle: Math.PI * 0.33 },
  { id: 'notes', radius: 11, speed: 0.16, initialAngle: Math.PI * 0.77 },
  { id: 'flashcards', radius: 14, speed: 0.12, initialAngle: Math.PI * 1.2 },
  { id: 'feynman', radius: 17, speed: 0.09, initialAngle: Math.PI * 1.6 },
  { id: 'inspiration', radius: 20, speed: 0.06, initialAngle: Math.PI * 0.1 },
];

function PlanetarySystem() {
  const { enterModule, setHovered } = useOrbitalStore();

  const handleClick = (id: ModuleId) => {
    enterModule(id);
  };

  const handleHover = (id: ModuleId | null) => {
    setHovered(id);
  };

  return (
    <group>
      {ORBIT_CONFIGS.map((orbit) => (
        <AuroraModuleEntity
          key={orbit.id}
          id={orbit.id}
          orbitRadius={orbit.radius}
          orbitSpeed={orbit.speed}
          initialAngle={orbit.initialAngle}
          onClick={handleClick}
          onHover={handleHover}
        />
      ))}
    </group>
  );
}

// ─── 主场景组件 ───────────────────────────────────────────
export function AuroraDomeWorld() {
  const tier = usePerformanceStore((s) => s.tier);

  // 根据性能等级调整粒子数
  const particleCount = tier === 'low' ? 500 : tier === 'medium' ? 1000 : 1500;

  return (
    <group>
      {/* 天空穹顶 */}
      <SkyDome />

      {/* 环境光照 */}
      <ambientLight intensity={0.4} color="#FFF5E6" />
      <pointLight position={[0, 0, 0]} intensity={2.0} color="#FFF8E7" distance={80} />
      <hemisphereLight
        color="#87CEEB"
        groundColor="#FFF8DC"
        intensity={0.3}
      />

      {/* 太阳系统 */}
      <SunSystem />

      {/* 行星轨道系统 */}
      <PlanetarySystem />

      {/* 星尘粒子 */}
      <StarDust count={particleCount} />

      {/* 云层效果（低性能时隐藏） */}
      {tier !== 'low' && <CloudLayer />}

      {/* 后处理（低性能时关闭） */}
      {tier !== 'low' && (
        <SafeEffectComposer>
          <Bloom
            intensity={0.3}
            luminanceThreshold={0.8}
            luminanceSmoothing={0.3}
            mipmapBlur
          />
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={new THREE.Vector2(0.001, 0.001)}
            radialModulation={false}
            modulationOffset={0}
          />
          <Vignette offset={0.4} darkness={0.3} />
        </SafeEffectComposer>
      )}
    </group>
  );
}
