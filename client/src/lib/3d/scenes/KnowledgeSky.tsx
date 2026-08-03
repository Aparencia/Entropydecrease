/**
 * 知识星座 · 3D 轨（high 档专属）
 * Knowledge sky · 3D track (high tier only)
 *
 * @ai-context: 宪法第四条知识星座 high 预算——R3F 星节点（InstancedMesh
 * 单 draw call）+ LineBasicMaterial 连线，节点 ≤150 / 连线 ≤300，
 * 独立 Canvas（dpr≤1.5，不受全局 frameloop 策略影响）。tier 映射
 * 与 DOM 轨同源（牢固=清冽明亮蓝白，朦胧=灰蓝暗光）；朦胧节点以
 * 暗色（glow 0.45）呈现，雾色滤镜 ≤40% 由暗化实现（雾永远可拨开）。
 * 缓慢自转；reduced-motion 下静止。空态返回 null（由宿主显示引导）。
 *
 * @ai-context: High-tier 3D track. Instanced star nodes (≤150) and
 * LineBasicMaterial links (≤300) in a dedicated Canvas (dpr ≤1.5).
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { KnowledgeGraph, KnowledgeNode, KnowledgeTier } from '@/features/constellation/lib/knowledgeGraph';

/** 性能预算（宪法第四条知识星座 high 档） / Budgets */
const MAX_3D_NODES = 150;
const MAX_3D_LINKS = 300;

/** tier → 壳层半径（世界坐标） / Shell radii */
const SHELL_RADIUS: Record<KnowledgeTier, number> = {
  牢固: 3.2,
  成长中: 4.6,
  朦胧: 6.0,
};

/** tier → 颜色（与 DOM 轨同源映射） / Tier colors */
const TIER_COLOR: Record<KnowledgeTier, THREE.Color> = {
  牢固: new THREE.Color('#7dd3fc'),
  成长中: new THREE.Color('#60a5fa'),
  朦胧: new THREE.Color('#94a3b8'),
};

/** 确定性伪随机（与布局层同算法） / Deterministic PRNG */
function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function seeded(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

/** 节点 → 球面坐标（seeded 均匀分布，同一 id 永远同位置） */
function starPosition(node: KnowledgeNode): THREE.Vector3 {
  const seed = hashId(node.id);
  const u = seeded(seed * 7 + 3);
  const v = seeded(seed * 13 + 5);
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = SHELL_RADIUS[node.tier] + seeded(seed * 31 + 9) * 0.9;
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi),
  );
}

/** 场景主体：星节点 + 连线 + 缓慢自转 / Scene body */
function SkyScene({ graph }: { graph: KnowledgeGraph }) {
  const groupRef = useRef<THREE.Group>(null);
  const reducedMotion = useReducedMotion();

  const { nodeData, linkPositions } = useMemo(() => {
    const nodes = graph.nodes.slice(0, MAX_3D_NODES);
    const positions = new Float32Array(nodes.length * 3);
    const colors = new Float32Array(nodes.length * 3);
    const posMap = new Map<string, THREE.Vector3>();

    nodes.forEach((n, i) => {
      const p = starPosition(n);
      posMap.set(n.id, p);
      positions.set([p.x, p.y, p.z], i * 3);
      const c = TIER_COLOR[n.tier].clone().multiplyScalar(n.glow);
      colors.set([c.r, c.g, c.b], i * 3);
    });

    // 连线：只取两端都在显示集合内的链，上限 300 条
    const visible = new Set(nodes.map((n) => n.id));
    const links = graph.links
      .filter((l) => visible.has(l.source) && visible.has(l.target))
      .slice(0, MAX_3D_LINKS);
    const linkPositions = new Float32Array(links.length * 6);
    links.forEach((l, i) => {
      const a = posMap.get(l.source)!;
      const b = posMap.get(l.target)!;
      linkPositions.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    });

    return { nodeData: { nodes, positions, colors }, linkPositions };
  }, [graph]);

  useFrame((_, delta) => {
    if (groupRef.current && !reducedMotion) {
      groupRef.current.rotation.y += delta * 0.06;
    }
  });

  const { nodes, positions, colors } = nodeData;

  return (
    <group ref={groupRef}>
      {/* 星节点：InstancedMesh 单 draw call（矩阵/实例色在 useLayoutEffect 写入） */}
      <StarInstances positions={positions} colors={colors} count={nodes.length} />

      {/* 连线：LineSegments 单 draw call */}
      {linkPositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[linkPositions, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#94a3b8" transparent opacity={0.3} />
        </lineSegments>
      )}
    </group>
  );
}

/** InstancedMesh：useLayoutEffect 写入实例矩阵与实例色（单 draw call） */
function StarInstances({
  positions, colors, count,
}: { positions: Float32Array; colors: Float32Array; count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      m.setPosition(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      mesh.setMatrixAt(i, m);
      color.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [positions, colors, count]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[0.16, 10, 8]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/** 知识星座 · 3D 轨（high 档；空态返回 null） / Knowledge sky canvas */
export function KnowledgeSky({ graph }: { graph: KnowledgeGraph | null }) {
  if (!graph || graph.coldStart || graph.nodes.length === 0) return null;

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 13], fov: 50 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      style={{ background: 'transparent' }}
      aria-label="知识星座 3D 场景：概念掌握度空间化"
    >
      <ambientLight intensity={0.6} />
      <SkyScene graph={graph} />
    </Canvas>
  );
}
