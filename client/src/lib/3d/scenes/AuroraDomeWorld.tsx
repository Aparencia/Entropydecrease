/**
 * AuroraDomeWorld — 浅色模式「晨曦穹顶」3D场景
 * 天文馆般的穹顶世界：太阳 + 星尘粒子 + 云层（模块行星由 SpatialNav 统一渲染）
 *
 * @ai-context: 3D 场景：AuroraDomeWorld。
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { SafeEffectComposer } from '../core/SafeEffectComposer';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';

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
    // 防止浏览器节流导致的帧时间尖峰，最大允许 100ms
    const safeDelta = Math.min(delta, 0.1);
    timeRef.current += safeDelta;

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

    // 防止浏览器节流导致的帧时间尖峰，最大允许 100ms
    const safeDelta = Math.min(delta, 0.1);

    const posAttr = pointsRef.current.geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;
    const vel = velocitiesRef.current;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      posArray[i3] += vel[i3] * safeDelta;
      posArray[i3 + 1] += vel[i3 + 1] * safeDelta;
      posArray[i3 + 2] += vel[i3 + 2] * safeDelta;

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
    // 防止浏览器节流导致的帧时间尖峰，最大允许 100ms
    const safeDelta = Math.min(delta, 0.1);
    cloudsRef.current.children.forEach((cloud, i) => {
      const data = cloudData[i];
      cloud.position.x += Math.sin(Date.now() * 0.0001 + i) * data.speed * safeDelta;
      cloud.position.z += Math.cos(Date.now() * 0.0001 + i * 2) * data.speed * safeDelta * 0.5;
      cloud.rotation.z += safeDelta * 0.005;
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
// 模块行星（可点击导航）统一由 SpatialNav 渲染并负责路由跳转。
// 本场景仅作环境背景，不重复生成行星实体——否则会出现两套可点击
// 行星，外层行星只改状态不跳转，导致“点击 3D 物体”与功能错位。

// ─── 主场景组件 ───────────────────────────────────────────
/** 色差偏移量（模块级常量，避免每帧 new Vector2 的 GC 压力） */
const CHROMATIC_OFFSET = new THREE.Vector2(0.001, 0.001);

export function AuroraDomeWorld() {
  // 有效 tier（自动 tier 受用户性能模式上限约束）
  const tier = useEffectiveTier();

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

      {/* 星尘粒子 */}
      <StarDust count={particleCount} />

      {/* 云层效果（低性能时隐藏） */}
      {tier !== 'low' && <CloudLayer />}

      {/* 后处理：低档全关；中档关色差以降 GPU（色差是较贵的全屏 pass）；澎湃档全开。
          条件置于 composer 层级（group 接受 false），避免 EffectComposer 子元素严格类型报错 */}
      {tier === 'low' ? null : tier === 'high' ? (
        <SafeEffectComposer>
          <Bloom
            intensity={0.3}
            luminanceThreshold={0.8}
            luminanceSmoothing={0.3}
            mipmapBlur
          />
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={CHROMATIC_OFFSET}
            radialModulation={false}
            modulationOffset={0}
          />
          <Vignette offset={0.4} darkness={0.3} />
        </SafeEffectComposer>
      ) : (
        <SafeEffectComposer>
          <Bloom
            intensity={0.3}
            luminanceThreshold={0.8}
            luminanceSmoothing={0.3}
            mipmapBlur
          />
          <Vignette offset={0.4} darkness={0.3} />
        </SafeEffectComposer>
      )}
    </group>
  );
}
