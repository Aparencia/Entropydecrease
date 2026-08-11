/**
 * LeviathanShadow — 远洋巨影：对未知知识的敬畏
 * 远景蝠鲼剪影，60~90 秒周期水平弧线缓慢滑过，深海雾中若隐若现
 * 克制含蓄：透明度 0.1~0.15，单网格 + 平移，1 draw call
 *
 * @ai-context: 3D 场景对象：LeviathanShadow（DeepSeaWorld 增强层）。
 * 宪法第四条：high 透明度 0.15 / medium 0.1 / low 关闭。
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';

/** 蝠鲼剪影轮廓（俯视 Shape）：头部圆润、双翼展开、尾部细长 */
function createMantaShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0.7);            // 头部
  s.quadraticCurveTo(2.4, 0.55, 3.2, 0);   // 右翼展开
  s.quadraticCurveTo(2.4, -0.55, 0.6, -0.3); // 右下回收
  s.quadraticCurveTo(0.3, -0.75, 0, -0.85); // 尾基
  s.quadraticCurveTo(-0.3, -0.75, -0.6, -0.3); // 左下
  s.quadraticCurveTo(-2.4, -0.55, -3.2, 0);  // 左翼展开
  s.quadraticCurveTo(-2.4, 0.55, 0, 0.7);    // 左上回收
  return s;
}

/** 远洋巨影：远景剪影周期滑过 */
export function LeviathanShadow() {
  const tier = useEffectiveTier();
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  // 剪影几何：蝠鲼平面（单面，只从前方可见）
  const geometry = useMemo(() => new THREE.ShapeGeometry(createMantaShape(), 12), []);

  const opacity = tier === 'low' ? 0 : tier === 'medium' ? 0.1 : 0.15;
  // 周期：每只巨影一个 60~90 秒滑过周期
  const cycle = useMemo(() => 60 + Math.random() * 30, []);
  // 滑过路径（弧线）
  const path = useMemo(() => ({
    startX: -18 + Math.random() * 4,
    endX: 18 + Math.random() * 4,
    z: -20 - Math.random() * 10,
    y: 1 + Math.random() * 3,
  }), []);

  useFrame((_, delta) => {
    if (tier === 'low') return;
    if (!meshRef.current) return;
    const safeDelta = Math.min(delta, 0.1);
    timeRef.current += safeDelta;
    const u = (timeRef.current % cycle) / cycle; // 0→1 循环

    // 水平弧线滑过 + 上下起伏 + 缓慢拍翼
    meshRef.current.position.x = path.startX + (path.endX - path.startX) * u;
    meshRef.current.position.y = path.y + Math.sin(u * Math.PI * 2) * 0.8;
    meshRef.current.rotation.y = Math.sin(u * Math.PI) * 0.3;
    meshRef.current.rotation.z = Math.sin(u * Math.PI * 4) * 0.08; // 拍翼
  });

  if (tier === 'low') return null;

  return (
    <mesh ref={meshRef} geometry={geometry} position={[path.startX, path.y, path.z]} scale={[8, 8, 8]}>
      <meshBasicMaterial
        color="#1E3A5F" transparent opacity={opacity}
        side={THREE.DoubleSide} depthWrite={false}
      />
    </mesh>
  );
}
