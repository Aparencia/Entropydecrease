/**
 * DeepSeaWorld — 深色模式「深海」3D场景
 * 深海生态系统：生物发光、海底粒子、有机暗流
 *
 * @ai-context: 3D 场景：DeepSeaWorld。宪法 P1 第二批接入熵可视化层：
 * ChaosMist（遗忘=雾，mist 信号驱动）与 OrderRipples（复习=波纹，
 * 世界事件总线驱动）。增强层：生物发光粒子、深海背景着色器、焦散光。
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import { ChaosMist } from '../objects/ChaosMist';
import { OrderRipples } from '../objects/OrderRipples';
import { TideBreath } from '../objects/TideBreath';
import { StrataField } from '../objects/StrataField';
import { ParticleSystem } from '../objects/ParticleSystem';

// ─── 深海背景着色器（渐变+深渊光感） ─────────────────
const abyssVertexShader = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const abyssFragmentShader = `
  uniform vec3 uColorTop;
  uniform vec3 uColorMid;
  uniform vec3 uColorBottom;
  uniform vec3 uGlowColor;
  uniform float uTime;
  varying vec3 vWorldPosition;

  // 伪随机噪声（模拟远处的星光）
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    float normalizedY = (vWorldPosition.y + 100.0) / 200.0;
    vec3 color;
    if (normalizedY > 0.5) {
      color = mix(uColorMid, uColorTop, (normalizedY - 0.5) / 0.5);
    } else {
      color = mix(uColorBottom, uColorMid, normalizedY / 0.5);
    }
    // 底部微光（生物发光辉光）
    float glow = exp(-normalizedY * 3.0) * 0.15;
    color += uGlowColor * glow;
    // 极慢闪烁（模拟深海微光）
    float flicker = 0.97 + sin(uTime * 0.1 + normalizedY * 10.0) * 0.03;
    color *= flicker;

    // 远处星光点（背景星尘）
    vec2 screenPos = vWorldPosition.xz / (vWorldPosition.y + 50.0);
    float star = hash(floor(screenPos * 80.0 + uTime * 0.01));
    float starMask = smoothstep(0.0, 0.1, vWorldPosition.y + 95.0) * smoothstep(0.0, 0.15, 1.0 - normalizedY);
    float starBright = step(0.997, star) * 0.15;
    starBright *= 0.5 + sin(uTime * 0.2 + floor(screenPos.x * 80.0) * 100.0) * 0.5;
    color += vec3(0.6, 0.8, 1.0) * starBright * starMask;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** 深海背景穹顶 */
function AbyssDome() {
  const uniforms = useMemo(() => ({
    uColorTop: { value: new THREE.Color('#0A1628') },
    uColorMid: { value: new THREE.Color('#0D1F3C') },
    uColorBottom: { value: new THREE.Color('#0A0E1A') },
    uGlowColor: { value: new THREE.Color('#1A5276') },
    uTime: { value: 0 },
  }), []);

  useFrame((_, delta) => {
    uniforms.uTime.value += Math.min(delta, 0.1);
  });

  return (
    <mesh>
      <sphereGeometry args={[100, 64, 64]} />
      <shaderMaterial
        vertexShader={abyssVertexShader}
        fragmentShader={abyssFragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

// ─── 生物发光粒子层 ──────────────────────────────
function BioluminescentLayer({ count }: { count: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);

  const { positions, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sz = new Float32Array(count);

    const colors_pool = [
      new THREE.Color('#00BFFF'),  // 赛博青
      new THREE.Color('#818CF8'),  // 靛蓝
      new THREE.Color('#22D3EE'),  // 青
      new THREE.Color('#6366F1'),  // 品牌
    ];

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos[i3] = (Math.random() - 0.5) * 50;
      pos[i3 + 1] = Math.random() * 20 - 10;
      pos[i3 + 2] = (Math.random() - 0.5) * 50;
      const c = colors_pool[Math.floor(Math.random() * colors_pool.length)];
      col[i3] = c.r; col[i3 + 1] = c.g; col[i3 + 2] = c.b;
      sz[i] = 0.04 + Math.random() * 0.08;
    }
    return { positions: pos, colors: col, sizes: sz };
  }, [count]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    timeRef.current += Math.min(delta, 0.1);
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // 缓慢浮动
      posArray[i3] += Math.sin(timeRef.current * 0.3 + i) * 0.002;
      posArray[i3 + 1] += Math.sin(timeRef.current * 0.2 + i * 0.5) * 0.003;
      posArray[i3 + 2] += Math.cos(timeRef.current * 0.25 + i * 0.7) * 0.002;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} key={`bio-${count}`}>
      <bufferGeometry key={`bio-geo-${count}`}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} count={count} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} count={count} />
      </bufferGeometry>
      <pointsMaterial
        vertexColors
        size={0.08}
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ─── 焦散光斑（水下光影） ─────────────────────────
function CausticLight() {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 30; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const r = 5 + Math.random() * 20;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(6,182,212,0.08)');
        g.addColorStop(1, 'rgba(6,182,212,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, []);

  useFrame((_, delta) => {
    timeRef.current += Math.min(delta, 0.1);
    if (meshRef.current) {
      meshRef.current.position.x = Math.sin(timeRef.current * 0.05) * 5;
      meshRef.current.position.z = Math.cos(timeRef.current * 0.04) * 5;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[40, 40]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.3}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── 体积光柱（God rays 简化版） ─────────────────────
function LightRays() {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#00BFFF') },
  }), []);

  useFrame((_, delta) => {
    timeRef.current += Math.min(delta, 0.1);
    uniforms.uTime.value = timeRef.current;
  });

  const rayVertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const rayFragmentShader = `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;

    void main() {
      float ray = sin(vUv.x * 10.0 + uTime * 0.05) * 0.5 + 0.5;
      ray *= sin(vUv.y * 2.0 - uTime * 0.03) * 0.5 + 0.5;
      ray = pow(ray, 3.0);
      float alpha = ray * 0.06;
      gl_FragColor = vec4(uColor, alpha);
    }
  `;

  return (
    <mesh position={[0, 5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[30, 20]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={rayVertexShader}
        fragmentShader={rayFragmentShader}
        transparent depthWrite={false} blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ─── 海底微粒（缓慢沉降的"海洋雪"） ─────────────────
function SeafloorSnow({ count }: { count: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, sizes, speeds } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const spd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = Math.random() * 10 - 12;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
      sz[i] = 0.02 + Math.random() * 0.04;
      spd[i] = 0.002 + Math.random() * 0.005;
    }
    return { positions: pos, sizes: sz, speeds: spd };
  }, [count]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const safeDelta = Math.min(delta, 0.1);
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] -= speeds[i] * safeDelta;
      if (pos[i * 3 + 1] < -12) {
        pos[i * 3 + 1] = 2;
        pos[i * 3] = (Math.random() - 0.5) * 40;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} key={`snow-${count}`}>
      <bufferGeometry key={`snow-geo-${count}`}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} count={count} />
      </bufferGeometry>
      <pointsMaterial color="#8FA3C8" size={0.03} transparent opacity={0.3} sizeAttenuation depthWrite={false} />
    </points>
  );
}

export function DeepSeaWorld() {
  const tier = useEffectiveTier();

  const particleCount = tier === 'low' ? 500 : tier === 'medium' ? 1200 : 2000;
  const bioCount = tier === 'low' ? 0 : tier === 'medium' ? 50 : 120;
  const showCaustic = tier !== 'low';

  return (
    <group>
      {/* 深海背景穹顶（渐变着色器） */}
      <AbyssDome />

      {/* 环境光照 */}
      <ambientLight intensity={0.2} color="#1E3A5F" />
      <pointLight position={[0, 5, 0]} intensity={0.5} color="#00BFFF" distance={50} />
      <pointLight position={[-5, -3, -5]} intensity={0.2} color="#6366F1" distance={30} />
      <pointLight position={[5, -2, 5]} intensity={0.15} color="#22D3EE" distance={30} />
      <hemisphereLight color="#1E3A5F" groundColor="#0A0E1A" intensity={0.3} />

      {/* 环境粒子 */}
      {tier !== 'low' && (
        <ParticleSystem
          count={particleCount}
          bounds={{ x: 30, y: [-15, 5], z: 30 }}
          baseColor="#aaddff"
          secondaryColor="#6366F1"
        />
      )}

      {/* 生物发光层 */}
      {bioCount > 0 && <BioluminescentLayer count={bioCount} />}

      {/* 焦散光斑 */}
      {showCaustic && <CausticLight />}

      {/* 体积光柱 */}
      {tier !== 'low' && <LightRays />}

      {/* 海底沉降微粒 */}
      <SeafloorSnow count={tier === 'low' ? 200 : 500} />

      {/* 熵可视化层（宪法 P1）：混沌雾=遗忘，秩序波纹=复习 */}
      <ChaosMist />
      <OrderRipples />
      {/* 叙事层叠加（宪法第十条）：潮汐=熵的呼吸，地层=累计专注的岩芯 */}
      <TideBreath />
      <StrataField />

      {/* 后处理 — ── 临时诊断：完全禁用 composer，验证实体是否因此可见 ── */}
      {null}
    </group>
  );
}