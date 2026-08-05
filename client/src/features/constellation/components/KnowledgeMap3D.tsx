/**
 * 三维知识脑图（4.8）
 * 3D knowledge map
 *
 * @ai-context: 2.5D 知识地图（z 轴随掌握度分层：牢固=顶层清冽明亮、
 * 朦胧=底层雾中，宪法第一条映射的空间化）。节点=发光小球（模块色），
 * 连线=LineSegments 顶点色按关系强度调制亮度。多级展开/收起：点击
 * 节点展开其连接，再次点击收起（展开集可多级深入）。LOD：InstancedMesh
 * 单 draw call + 球面细分随规模降级 + 可见节点硬上限。性能轨：
 * useEffectiveTier 非 high 或 WebGL 不可用 → DOM/SVG 2D 轨（同展开
 * 语义）。缓慢自转由 OrbitControls autoRotate 承担，reduced-motion
 * 下静止。空态由宿主引导。
 *
 * @ai-context: 2.5D mastery-layered knowledge map. Instanced glowing
 * spheres (module color) + vertex-colored link segments; click to
 * expand/collapse neighbor clusters; falls back to a 2D SVG track
 * on non-high tiers or missing WebGL.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, useCursor } from '@react-three/drei';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import { moduleColor } from '../lib/mapData';
import type { MapNode3D } from '../lib/mapTypes';

/** 初始可见节点数（掌握度最高者）/ Base visible nodes (highest mastery) */
const BASE_NODE_COUNT = 20;
/** 展开后可见硬上限（LOD 预算）/ Visible node cap */
const MAX_3D_NODES = 120;
/** 连线基色（灰蓝）/ Link base color */
const LINK_BASE = '#94a3b8';

/** 确定性伪随机（与布局层同算法）/ Deterministic PRNG */
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

/** 关系强度 0-1（确定性，端点 id 派生）/ Relation strength */
function linkStrength(a: string, b: string): number {
  return 0.35 + seeded(hashId(a) * 7 + hashId(b) * 13) * 0.45;
}

/** 多级展开/收起：初始显示掌握度最高者，点击展开其连接 */
function useExpandGraph(nodes: MapNode3D[], baseCount: number) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visibleIds = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const set = new Set(
      [...nodes].sort((a, b) => b.mastery - a.mastery).slice(0, baseCount).map((n) => n.id),
    );
    for (const id of expanded) {
      for (const c of byId.get(id)?.connections ?? []) set.add(c);
    }
    return set;
  }, [nodes, expanded, baseCount]);

  return { visibleIds, expanded, toggle };
}

/** WebGL 可用性探测（一次）/ WebGL capability probe */
function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

type InstanceEvent = ThreeEvent<MouseEvent | PointerEvent>;

/** InstancedMesh：实例矩阵/实例色/实例缩放写入 + 事件（单 draw call） */
function NodeInstances({
  positions, colors, sizes, count, onClick, onPointerMove, onPointerOut,
}: {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  count: number;
  onClick?: (e: InstanceEvent) => void;
  onPointerMove?: (e: InstanceEvent) => void;
  onPointerOut?: () => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      m.makeScale(sizes[i], sizes[i], sizes[i]);
      m.setPosition(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      mesh.setMatrixAt(i, m);
      color.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [positions, colors, sizes, count]);

  // LOD：节点多 → 球面细分降级（预算内单 draw call）
  const segs = count > 60 ? 8 : 12;

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, count]}
      frustumCulled={false}
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
    >
      <sphereGeometry args={[1, segs, Math.ceil(segs / 2)]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/** 场景主体：InstancedMesh 节点 + 顶点色连线 + 自动环绕 */
function MapScene({
  nodes, visibleIds, expanded, toggle, onSelect, onHover,
}: {
  nodes: MapNode3D[];
  visibleIds: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  toggle: (id: string) => void;
  onSelect?: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  useCursor(hovered !== null);

  const visible = useMemo(
    () => nodes.filter((n) => visibleIds.has(n.id)).slice(0, MAX_3D_NODES),
    [nodes, visibleIds],
  );

  const moduleOfId = useMemo(() => new Map(nodes.map((n) => [n.id, n.sourceModule])), [nodes]);

  const { positions, colors, sizes, instanceIds, posMap } = useMemo(() => {
    const positions = new Float32Array(visible.length * 3);
    const colors = new Float32Array(visible.length * 3);
    const sizes = new Float32Array(visible.length);
    const instanceIds: string[] = [];
    const posMap = new Map<string, [number, number, number]>();
    const color = new THREE.Color();
    visible.forEach((n, i) => {
      const [x, y, z] = n.position3D;
      positions.set([x, y, z], i * 3);
      posMap.set(n.id, [x, y, z]);
      instanceIds.push(n.id);
      // 展开的节点更亮（视觉反馈当前焦点簇）
      color.set(moduleColor(n.sourceModule)).multiplyScalar(expanded.has(n.id) ? 1 : 0.8);
      colors.set([color.r, color.g, color.b], i * 3);
      sizes[i] = 0.14 + n.mastery * 0.1;
    });
    return { positions, colors, sizes, instanceIds, posMap };
  }, [visible, expanded]);

  // 连线：两端都可见才画；每条线只画一次（id 字典序去重）
  const linkData = useMemo(() => {
    const idx = new Map(instanceIds.map((id, i) => [id, i]));
    const segs: Array<[string, [number, number, number], [number, number, number], number]> = [];
    for (const n of visible) {
      const from = posMap.get(n.id)!;
      for (const t of n.connections) {
        if (n.id >= t) continue; // 无向去重
        if (idx.has(t)) segs.push([n.id, from, posMap.get(t)!, linkStrength(n.id, t)]);
      }
    }
    const linkPositions = new Float32Array(segs.length * 6);
    const linkColors = new Float32Array(segs.length * 6);
    const color = new THREE.Color();
    segs.forEach(([id, a, b, strength], i) => {
      linkPositions.set([a[0], a[1], a[2], b[0], b[1], b[2]], i * 6);
      // 模块色 × 强度：弱关系近灰、强关系近模块色
      color
        .set(moduleColor(moduleOfId.get(id) ?? ''))
        .lerp(new THREE.Color(LINK_BASE), 0.35)
        .multiplyScalar(0.35 + strength * 0.55);
      linkColors.set([color.r, color.g, color.b, color.r, color.g, color.b], i * 6);
    });
    return { linkPositions, linkColors };
  }, [visible, instanceIds, posMap, moduleOfId]);

  const handleEvent = useCallback(
    (e: InstanceEvent, fn: (id: string) => void) => {
      if (e.instanceId === undefined) return;
      e.stopPropagation();
      fn(instanceIds[e.instanceId]);
    },
    [instanceIds],
  );

  return (
    <group>
      <NodeInstances
        positions={positions}
        colors={colors}
        sizes={sizes}
        count={visible.length}
        onClick={(e) => handleEvent(e, (id) => { toggle(id); onSelect?.(id); })}
        onPointerMove={(e) => handleEvent(e, (id) => { setHovered(id); onHover(id); })}
        onPointerOut={() => { setHovered(null); onHover(null); }}
      />
      {linkData.linkPositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[linkData.linkPositions, 3]} />
            <bufferAttribute attach="attributes-color" args={[linkData.linkColors, 3]} />
          </bufferGeometry>
          <lineBasicMaterial vertexColors transparent opacity={0.55} />
        </lineSegments>
      )}
    </group>
  );
}

/** 2D 降级轨：SVG（非 high 档或 WebGL 不可用） */
function Map2DFallback({
  nodes, visibleIds, expanded, toggle, onSelect,
}: {
  nodes: MapNode3D[];
  visibleIds: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  toggle: (id: string) => void;
  onSelect?: (id: string) => void;
}) {
  const visible = useMemo(
    () => nodes.filter((n) => visibleIds.has(n.id)).slice(0, MAX_3D_NODES),
    [nodes, visibleIds],
  );
  // z 轴投影：掌握度越高 → 画面越高
  const xy = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const n of visible) map.set(n.id, { x: 50 + n.position3D[0] * 9, y: 50 - n.position3D[2] * 9 });
    return map;
  }, [visible]);

  if (nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-c1 text-text-tertiary">
        还没有知识点，先开始学习吧
      </div>
    );
  }

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" role="img" aria-label="三维知识脑图（2D 降级轨）：掌握度纵向分层">
      {visible.map((n) =>
        n.connections.map((t) => {
          const a = xy.get(n.id);
          const b = xy.get(t);
          if (!a || !b || n.id >= t) return null;
          return (
            <line
              key={`${n.id}-${t}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={moduleColor(n.sourceModule)}
              strokeWidth={0.2}
              opacity={0.2 + linkStrength(n.id, t) * 0.35}
            />
          );
        }),
      )}
      {visible.map((n) => {
        const p = xy.get(n.id)!;
        const r = 1.4 + n.mastery * 1.1;
        const active = expanded.has(n.id);
        return (
          <g key={n.id} className="cursor-pointer" onClick={() => { toggle(n.id); onSelect?.(n.id); }}>
            {active && (
              <circle cx={p.x} cy={p.y} r={r + 1.6} fill="none" stroke={moduleColor(n.sourceModule)} strokeWidth={0.25} opacity={0.7} />
            )}
            <circle cx={p.x} cy={p.y} r={r} fill={moduleColor(n.sourceModule)} opacity={0.55 + n.mastery * 0.45}>
              <title>{n.title}（{n.sourceModule} · 掌握度 {Math.round(n.mastery * 100)}%）</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

/** 三维知识脑图 / 3D knowledge map */
export function KnowledgeMap3D({
  nodes,
  onSelect,
}: {
  nodes: MapNode3D[];
  onSelect?: (nodeId: string) => void;
}) {
  const effectiveTier = useEffectiveTier();
  const reducedMotion = useReducedMotion();
  const [webgl] = useState(supportsWebGL);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { visibleIds, expanded, toggle } = useExpandGraph(nodes, BASE_NODE_COUNT);
  const hovered = useMemo(() => nodes.find((n) => n.id === hoveredId) ?? null, [nodes, hoveredId]);
  const modules = useMemo(
    () => [...new Set(nodes.filter((n) => visibleIds.has(n.id)).map((n) => n.sourceModule))],
    [nodes, visibleIds],
  );

  const use3D = effectiveTier === 'high' && webgl;
  const shared = { nodes, visibleIds, expanded, toggle, onSelect };

  return (
    <div className="relative w-full h-full min-h-[320px] rounded-kb-xl bg-gradient-to-b from-bg-elevated/20 to-transparent">
      {use3D ? (
        <>
          <Canvas
            dpr={[1, 1.5]}
            camera={{ position: [7, 5.5, 9], fov: 45 }}
            gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
            style={{ background: 'transparent' }}
            aria-label="三维知识脑图：概念掌握度 z 轴分层，点击节点展开连接"
          >
            <ambientLight intensity={0.7} />
            <MapScene {...shared} onHover={setHoveredId} />
            <OrbitControls
              enablePan={false}
              minDistance={5}
              maxDistance={22}
              minPolarAngle={Math.PI / 6}
              maxPolarAngle={Math.PI / 2 + Math.PI / 6}
              enableDamping
              dampingFactor={0.08}
              autoRotate={!reducedMotion}
              autoRotateSpeed={0.8}
            />
          </Canvas>
          {hovered && (
            <div className="absolute left-3 top-3 pointer-events-none z-10 px-3 py-2 rounded-kb-sm bg-bg-elevated/90 backdrop-blur border border-border/40 text-c1 text-text-primary shadow-kb-sm">
              {hovered.title}
              <span className="ml-2 text-text-tertiary">{hovered.sourceModule} · {Math.round(hovered.mastery * 100)}%</span>
            </div>
          )}
          <div className="absolute right-3 bottom-3 z-10 flex flex-wrap gap-x-3 gap-y-1 max-w-[60%] justify-end">
            {modules.map((m) => (
              <span key={m} className="flex items-center gap-1.5 text-c1 text-text-tertiary">
                <span className="w-2 h-2 rounded-full" style={{ background: moduleColor(m) }} />
                {m}
              </span>
            ))}
          </div>
          <p className="absolute left-3 bottom-3 z-10 text-c1 text-text-tertiary/70 pointer-events-none">
            点击节点展开/收起连接
          </p>
        </>
      ) : (
        <Map2DFallback {...shared} />
      )}
    </div>
  );
}
