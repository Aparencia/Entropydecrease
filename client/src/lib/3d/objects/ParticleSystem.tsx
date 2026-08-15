/**
 * 独立粒子系统组件 — 深海浮力微粒（GPU 顶点着色器版）
 *
 * 使用 THREE.Points + 自定义顶点着色器实现 GPU 粒子动画：
 * 粒子位置计算从 CPU（useFrame 循环 + needsUpdate 上传）迁移到 GPU
 * （顶点着色器），消除每帧的 CPU→GPU 数据传输瓶颈。
 * 位置算法与 CPU 版一致（浮力上升 + 水平漂移 + 边界回绕）。
 *
 * 兼容 WebGPU 和 WebGL 渲染后端。
 *
 * @ai-context: 3D 场景对象：ParticleSystem（GPU 粒子版）。
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import {
  patchParticleShader,
  updateGPUParticleUniforms,
  addParticleAttributes,
  type GPUParticleConfig,
} from '@/lib/3d/shaders/gpuParticleShaders';

interface ParticleSystemProps {
  count?: number;
  bounds?: { x: number; y: [number, number]; z: number };
  baseColor?: string;
  secondaryColor?: string;
  speed?: number;
}

export function ParticleSystem({
  count = 2000,
  bounds = { x: 30, y: [-20, 5], z: 30 },
  baseColor = '#aaddff',
  secondaryColor = '#57C6A9',
  speed = 1,
}: ParticleSystemProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const tier = useEffectiveTier();

  const particleCount = tier === 'low' ? 500 : tier === 'medium' ? 1200 : count;

  // 固定 buffer 一次性构建（不再每帧更新位置）
  const { positions, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const col = new Float32Array(particleCount * 3);
    const sz = new Float32Array(particleCount);

    const colorA = new THREE.Color(baseColor);
    const colorB = new THREE.Color(secondaryColor);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      pos[i3] = (Math.random() - 0.5) * 2 * bounds.x;
      pos[i3 + 1] = bounds.y[0] + Math.random() * (bounds.y[1] - bounds.y[0]);
      pos[i3 + 2] = (Math.random() - 0.5) * 2 * bounds.z;

      const t = Math.random();
      const lerpedColor = colorA.clone().lerp(colorB, t);
      col[i3] = lerpedColor.r;
      col[i3 + 1] = lerpedColor.g;
      col[i3 + 2] = lerpedColor.b;

      sz[i] = 0.02 + Math.random() * 0.06;
    }
    return { positions: pos, colors: col, sizes: sz };
  }, [particleCount, bounds, baseColor, secondaryColor]);

  // 创建几何体并添加 GPU 粒子属性
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // 添加 GPU 粒子 velocity 和 seed 属性
    addParticleAttributes(
      geo,
      particleCount,
      (i) => {
        const i3 = i * 3;
        return [
          positions[i3] * 0.01,   // x 漂移因子
          0.002 + Math.random() * 0.004, // 上升速度
          positions[i3 + 2] * 0.01, // z 漂移因子
        ];
      },
      () => Math.random(),
    );

    return geo;
  }, [positions, colors, sizes, particleCount]);

  // 解构出 bounds.y 的原始数值，供 material memo 按值比较（bounds 对象每次渲染
  // 由调用方内联新建，直接依赖 bounds.y 会让 memo 每渲染重建材质）
  const [yMin, yMax] = bounds.y;

  // 创建材质并注入 GPU 粒子着色器
  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
      size: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const config: GPUParticleConfig = {
      motion: 'float-up',
      wrap: true,
      bounds: { yMin, yMax },
      speed,
    };

    patchParticleShader(mat, config);
    return mat;
  }, [yMin, yMax, speed]);

  // 每帧仅更新 uniform（不再更新 buffer）
  useFrame(({ clock }) => {
    if (pointsRef.current) {
      updateGPUParticleUniforms(
        pointsRef.current.material as THREE.PointsMaterial,
        clock.getElapsedTime(),
      );
    }
  });

  return (
    <points ref={pointsRef} geometry={geometry} material={material} />
  );
}