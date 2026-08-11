/**
 * AuroraDomeWorld — 浅色模式「晨曦穹顶」3D场景
 * 天文馆般的穹顶世界：太阳 + 星尘粒子 + 云层（模块行星由 SpatialNav 统一渲染）
 *
 * @ai-context: 3D 场景：AuroraDomeWorld。
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import {
  patchParticleShader,
  updateGPUParticleUniforms,
  addParticleAttributes,
} from '@/lib/3d/shaders/gpuParticleShaders';

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
    uColorMid: { value: new THREE.Color('#4A7DB0') },
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
  const rayRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  const rayUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#FCD34D') },
  }), []);

  useFrame((_, delta) => {
    const safeDelta = Math.min(delta, 0.1);
    timeRef.current += safeDelta;
    rayUniforms.uTime.value = timeRef.current;

    const pulse = 1.0 + Math.sin(timeRef.current * (Math.PI * 2 / 4)) * 0.05;
    if (sunRef.current) sunRef.current.scale.setScalar(pulse);
    if (glowRef.current) glowRef.current.scale.setScalar(pulse * 1.02);
  });

  const rayVertexShader = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
  const rayFragmentShader = `
    uniform float uTime;uniform vec3 uColor;varying vec2 vUv;
    void main(){
      float angle = atan(vUv.y-0.5, vUv.x-0.5);
      float dist = distance(vUv, vec2(0.5));
      float ray = sin(angle * 12.0 + uTime * 0.3) * 0.5 + 0.5;
      ray *= 1.0 - smoothstep(0.0, 0.5, dist);
      float alpha = ray * 0.15;
      gl_FragColor = vec4(uColor, alpha);
    }`;

  return (
    <group>
      <mesh ref={sunRef}>
        <sphereGeometry args={[1.5, 32, 32]} />
        <meshBasicMaterial color="#FFF8E7" toneMapped={false} />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[2.5, 32, 32]} />
        <meshBasicMaterial color="#FFF8E7" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* 太阳光芒射线 */}
      <mesh ref={rayRef}>
        <planeGeometry args={[6, 6]} />
        <shaderMaterial uniforms={rayUniforms} vertexShader={rayVertexShader} fragmentShader={rayFragmentShader}
          transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─── 极光效果 ─────────────────────────────────────────────
function AuroraBorealis() {
  const timeRef = useRef(0);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color('#6FB4E8') },
    uColorB: { value: new THREE.Color('#9FB8D8') },
    uColorC: { value: new THREE.Color('#34D399') },
  }), []);

  useFrame((_, delta) => {
    timeRef.current += Math.min(delta, 0.1);
    uniforms.uTime.value = timeRef.current;
  });

  const auroraVertexShader = `
    varying vec2 vUv;
    varying vec3 vPosition;
    void main() {
      vUv = uv;
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const auroraFragmentShader = `
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform vec3 uColorC;
    varying vec2 vUv;
    varying vec3 vPosition;

    void main() {
      float speed = 0.15;
      float x = vUv.x * 3.0 + uTime * speed;
      float y = vUv.y * 5.0;

      // 多层噪声模拟极光丝带
      float wave1 = sin(x * 1.5 + uTime * 0.2) * 0.5 + 0.5;
      float wave2 = cos(x * 2.0 + uTime * 0.15 + y * 0.5) * 0.4 + 0.4;
      float wave3 = sin(x * 0.8 + y * 1.2 + uTime * 0.1) * 0.3;

      float intensity = wave1 * wave2 + wave3 * 0.3;
      intensity = clamp(intensity * 1.5 - 0.3, 0.0, 1.0);
      intensity = pow(intensity, 1.5);

      // 垂直衰减（顶部淡出）
      float verticalFade = 1.0 - vUv.y;
      intensity *= smoothstep(0.0, 0.3, verticalFade) * smoothstep(0.5, 0.0, verticalFade);

      // 颜色渐变
      vec3 colorA = mix(uColorA, uColorB, sin(uTime * 0.05 + x) * 0.5 + 0.5);
      vec3 colorB = mix(uColorB, uColorC, cos(uTime * 0.03 + y) * 0.5 + 0.5);
      vec3 finalColor = mix(colorA, colorB, wave1);

      float alpha = intensity * 0.35;
      gl_FragColor = vec4(finalColor, alpha);
    }
  `;

  return (
    <mesh position={[0, 10, -30]} rotation={[0.3, 0, 0]}>
      <planeGeometry args={[60, 20, 64, 64]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={auroraVertexShader}
        fragmentShader={auroraFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ─── 星尘粒子（GPU 着色器版） ────────────────────────
/** 星尘粒子最大数量（固定 buffer 上限，tier 切换经 drawRange 控制可见数） */
const MAX_STARDUST = 1500;

function StarDust({ count }: { count: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  // 固定最大 buffer，tier 切换经 drawRange 控制可见数
  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(MAX_STARDUST * 3);
    const col = new Float32Array(MAX_STARDUST * 3);

    const colorA = new THREE.Color('#FFFBEB');
    const colorB = new THREE.Color('#F59E0B');

    for (let i = 0; i < MAX_STARDUST; i++) {
      const i3 = i * 3;
      const radius = 5 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      pos[i3 + 2] = radius * Math.cos(phi);

      const t = Math.random();
      const color = colorA.clone().lerp(colorB, t);
      col[i3] = color.r;
      col[i3 + 1] = color.g;
      col[i3 + 2] = color.b;
    }
    return { positions: pos, colors: col };
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // velocity: 径向方向（指向原点外）
    addParticleAttributes(geo, MAX_STARDUST, (i) => {
      const i3 = i * 3;
      const dir = new THREE.Vector3(positions[i3], positions[i3 + 1], positions[i3 + 2]).normalize();
      const isRadial = Math.random() > 0.6;
      return isRadial
        ? [dir.x * 0.3, dir.y * 0.3, dir.z * 0.3]
        : [(Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.1];
    });
    return geo;
  }, [positions, colors]);

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    patchParticleShader(mat, { motion: 'radial', wrap: false, bounds: { distMax: 80, radiusMin: 3, radiusMax: 8 }, speed: 0.8 });
    return mat;
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    updateGPUParticleUniforms(pointsRef.current.material as THREE.PointsMaterial, clock.getElapsedTime());
    pointsRef.current.geometry.setDrawRange(0, count);
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

// ─── 云层效果（增强版） ─────────────────────────────────
function CloudLayer() {
  const cloudsRef = useRef<THREE.Group>(null);

  const cloudData = useMemo(() => {
    return Array.from({ length: 8 }, () => ({
      position: [
        (Math.random() - 0.5) * 50,
        12 + Math.random() * 25,
        (Math.random() - 0.5) * 50,
      ] as [number, number, number],
      rotation: Math.random() * Math.PI * 2,
      scale: 6 + Math.random() * 15,
      speed: 0.01 + Math.random() * 0.04,
      opacity: 0.06 + Math.random() * 0.12,
      aspect: 0.4 + Math.random() * 0.8,
    }));
  }, []);

  useFrame((_, delta) => {
    if (!cloudsRef.current) return;
    const safeDelta = Math.min(delta, 0.1);
    cloudsRef.current.children.forEach((cloud, i) => {
      const data = cloudData[i];
      if (!data) return;
      cloud.position.x += Math.sin(data.speed * 0.5) * data.speed * safeDelta * 2;
      cloud.position.z += Math.cos(data.speed * 0.3) * data.speed * safeDelta * 2;
      cloud.rotation.z += safeDelta * 0.003;
      // 边界循环
      if (cloud.position.x > 30) cloud.position.x = -30;
      if (cloud.position.z > 30) cloud.position.z = -30;
    });
  });

  return (
    <group ref={cloudsRef}>
      {cloudData.map((cloud, i) => (
        <mesh key={i} position={cloud.position} rotation={[0, 0, cloud.rotation]}>
          <planeGeometry args={[cloud.scale, cloud.scale * cloud.aspect]} />
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

      {/* 极光效果（双层，澎湃档全开，中档一层，低档关闭） */}
      {tier !== 'low' && (
        <>
          <AuroraBorealis />
          {/* 第二层极光，对面方向，不同颜色 */}
          {tier === 'high' && (
            <mesh position={[0, 12, 25]} rotation={[-0.2, Math.PI * 0.7, 0]}>
              <planeGeometry args={[50, 18, 48, 48]} />
              <shaderMaterial
                uniforms={{ uTime: { value: 0 }, uColorA: { value: new THREE.Color('#34D399') }, uColorB: { value: new THREE.Color('#FCD34D') }, uColorC: { value: new THREE.Color('#9FB8D8') } }}
                vertexShader={`varying vec2 vUv;varying vec3 vPosition;void main(){vUv=uv;vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`}
                fragmentShader={`
                  uniform float uTime;uniform vec3 uColorA;uniform vec3 uColorB;uniform vec3 uColorC;varying vec2 vUv;varying vec3 vPosition;
                  void main(){float x=vUv.x*2.5+uTime*0.12;float y=vUv.y*4.0;float w1=sin(x*1.8+uTime*0.15)*0.5+0.5;float w2=cos(x*2.2+uTime*0.12+y*0.6)*0.4+0.4;float w3=sin(x*0.6+y*1.0+uTime*0.08)*0.3;float intensity=w1*w2+w3*0.3;intensity=clamp(intensity*1.5-0.3,0.0,1.0);intensity=pow(intensity,1.5);float vf=1.0-vUv.y;intensity*=smoothstep(0.0,0.3,vf)*smoothstep(0.5,0.0,vf);vec3 cA=mix(uColorA,uColorB,sin(uTime*0.04+x)*0.5+0.5);vec3 cB=mix(uColorB,uColorC,cos(uTime*0.02+y)*0.5+0.5);vec3 fc=mix(cA,cB,w1);gl_FragColor=vec4(fc,intensity*0.2);}
                `}
                transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide}
              />
            </mesh>
          )}
        </>
      )}

      {/* 星尘粒子 */}
      <StarDust count={particleCount} />

      {/* 云层效果（低性能时隐藏） */}
      {tier !== 'low' && <CloudLayer />}

      {/* 后处理已移至 SceneTransition 统一管理 —— 两个场景各带 composer 会以 renderPriority=1
          互相抢占渲染权导致画面丢失，故场景内不再挂载 composer */}
    </group>
  );
}
