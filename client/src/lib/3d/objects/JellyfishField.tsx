/**
 * JellyfishField — 深海水母群：灵感浮现的视觉化
 * 边缘区缓慢漂浮，伞盖呼吸脉动 + 触手摆动 + 内发光核
 * 克制含蓄：透明度 0.25，不抢前景模块实体焦点
 *
 * @ai-context: 3D 场景对象：JellyfishField（DeepSeaWorld 增强层）。
 * 宪法第四条：high 5 只 / medium 3 只 / low 关闭。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';

/** 生物发光色池（与 BioluminescentLayer 同源） */
const JELLY_COLORS = ['#6FB4E8', '#9FB8D8', '#4A9BD9'];
/** 触手摆动点采样数 */
const TENTACLE_SEGMENTS = 8;
/** 触手数量 */
const TENTACLE_COUNT = 4;

/** 单只水母：伞盖（半球）+ 触手（细线）+ 发光核 */
function Jellyfish({ color, baseX, baseY, baseZ, scale, phase }: {
  color: string;
  baseX: number;
  baseY: number;
  baseZ: number;
  scale: number;
  phase: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const domeRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  // 触手：预创建 THREE.Line 对象（避免 JSX <line> 与 SVG line 类型冲突），
  // 顶点在 useFrame 中逐帧摆动更新
  const tentacles = useMemo(() => {
    const list: THREE.Line[] = [];
    for (let i = 0; i < TENTACLE_COUNT; i++) {
      const positions = new Float32Array((TENTACLE_SEGMENTS + 1) * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      line.position.set(Math.sin(i * 1.7) * 0.25, -0.45, Math.cos(i * 1.3) * 0.25);
      list.push(line);
    }
    return list;
  }, [color]);

  // 卸载时释放 GPU 资源（主题切换会卸载本场景）
  useEffect(() => {
    return () => {
      tentacles.forEach((line) => {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      });
    };
  }, [tentacles]);

  useFrame((_, delta) => {
    const safeDelta = Math.min(delta, 0.1);
    timeRef.current += safeDelta;
    const t = timeRef.current + phase;

    // 缓慢漂浮：上下 + 水平漂移
    if (groupRef.current) {
      groupRef.current.position.y = baseY + Math.sin(t * 0.3) * 0.6;
      groupRef.current.position.x = baseX + Math.sin(t * 0.2) * 1.2;
      groupRef.current.rotation.y = Math.sin(t * 0.15) * 0.2;
    }

    // 伞盖呼吸脉动
    if (domeRef.current) {
      const breath = 1 + Math.sin(t * 0.8) * 0.15;
      domeRef.current.scale.set(2 - breath, breath, 2 - breath);
    }

    // 触手摆动：每帧更新顶点
    tentacles.forEach((line, i) => {
      const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
      const pos = posAttr.array as Float32Array;
      const swayAmp = 0.15 + i * 0.05;
      for (let s = 0; s <= TENTACLE_SEGMENTS; s++) {
        const u = s / TENTACLE_SEGMENTS;
        pos[s * 3] = Math.sin(t * (0.9 + i * 0.2) + s * 0.7) * swayAmp * u * 1.6;
        pos[s * 3 + 1] = -u * 1.1; // 触手向下延伸
        pos[s * 3 + 2] = Math.cos(t * (0.7 + i * 0.15) + s * 0.5) * swayAmp * u * 0.8;
      }
      posAttr.needsUpdate = true;
    });
  });

  return (
    <group ref={groupRef} position={[baseX, baseY, baseZ]} scale={[scale, scale, scale]}>
      {/* 伞盖：半球（上半球） */}
      <mesh ref={domeRef}>
        <sphereGeometry args={[0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* 内发光核 */}
      <mesh>
        <sphereGeometry args={[0.16, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* 触手：4 条细线 */}
      {tentacles.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
    </group>
  );
}

/** 水母群主组件：按性能档位生成水母 */
export function JellyfishField() {
  const tier = useEffectiveTier();
  const count = tier === 'low' ? 0 : tier === 'medium' ? 3 : 5;

  const jellies = useMemo(() => {
    const list: { color: string; baseX: number; baseY: number; baseZ: number; scale: number; phase: number }[] = [];
    // 分布在两侧边缘区，避开中心实体（|x| 8~15）
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      list.push({
        color: JELLY_COLORS[i % JELLY_COLORS.length],
        baseX: side * (8 + Math.random() * 7),
        baseY: 1 + Math.random() * 4,
        baseZ: -5 - Math.random() * 5,
        scale: 0.8 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
      });
    }
    return list;
  }, [count]);

  if (count === 0) return null;

  return (
    <group>
      {jellies.map((j, i) => (
        <Jellyfish key={i} {...j} />
      ))}
    </group>
  );
}
