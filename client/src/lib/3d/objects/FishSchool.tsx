/**
 * FishSchool — 发光鱼群：思绪游弋的视觉化（GPU 着色器版）
 * 实体外围环形区缓慢环绕漂移，个体间相位差形成自然错落
 * 克制含蓄：小尺寸光点，透明度 0.4，始终不穿越前景实体区
 *
 * 使用顶点着色器计算轨道位置，消除 CPU 循环 + buffer 上传。
 *
 * @ai-context: 3D 场景对象：FishSchool（DeepSeaWorld 增强层，GPU 粒子版）。
 * 宪法第四条：high 30 条 / medium 15 条 / low 关闭。
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import {
  patchParticleShader,
  updateGPUParticleUniforms,
  addParticleAttributes,
} from '@/lib/3d/shaders/gpuParticleShaders';

/** 最大鱼数（high 档预算） */
const MAX_FISH = 30;

/** 鱼群主组件：Points 环绕路径游动（GPU 着色器） */
export function FishSchool() {
  const tier = useEffectiveTier();
  const count = tier === 'low' ? 0 : tier === 'medium' ? 15 : MAX_FISH;
  const pointsRef = useRef<THREE.Points>(null);

  // 固定分配最大 buffer，drawRange 控制可见数
  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(MAX_FISH * 3);
    const col = new Float32Array(MAX_FISH * 3);
    const white = new THREE.Color('#ffffff');
    const cyan = new THREE.Color('#67e8f9');
    for (let i = 0; i < MAX_FISH; i++) {
      const c = white.clone().lerp(cyan, Math.random() * 0.6);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    return { positions: pos, colors: col };
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // velocity: x=角速度, y=轨道半径, z=高度
    addParticleAttributes(geo, MAX_FISH, (i) => [
      0.05 + Math.random() * 0.08,  // 角速度
      6 + Math.random() * 4,        // 轨道半径 6~10
      Math.random() * 2,            // 高度 0~2
    ]);
    return geo;
  }, [positions, colors]);

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      vertexColors: true, size: 0.05, transparent: true,
      opacity: 0.4, blending: THREE.AdditiveBlending,
      depthWrite: false, sizeAttenuation: true,
    });
    patchParticleShader(mat, { motion: 'orbit', speed: 0.6 });
    return mat;
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    updateGPUParticleUniforms(pointsRef.current.material as THREE.PointsMaterial, clock.getElapsedTime());
    pointsRef.current.geometry.setDrawRange(0, count);
  });

  if (count === 0) return null;

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}