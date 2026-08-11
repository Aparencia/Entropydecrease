/**
 * 海底石窟 3D 视图（浅色主题形态）
 * Grotto Dome 3D view (light theme morph)
 *
 * @ai-context: 笔记嵌于 3D 穹顶内壁（球面经纬分布，像石窟壁画），相机位于
 * 球心环视——拖拽旋转穹顶、滚轮缩放视野，晨光从顶部洒下（CSS 径向渐变 +
 * 琥珀穹壳）。选中笔记「升起」至穹顶中央焦点位。性能：useEffectiveTier 分档
 * dpr/粒子，reduced-motion 静止（含 autoRotate），WebGL 不可用回退提示。
 * @ai-context: Notes mount on a 3D dome's inner wall like grotto murals;
 * camera sits at the sphere center. Drag rotates the dome, wheel zooms,
 * morning light falls from the zenith. Selected note rises to center focus.
 */
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import { supportsWebGL, type ReefNote } from './reefTypes';
import { grottoPositions } from './reefLayout';
import { ReefCards, ReefSelectedCard } from './ReefCards';
import { FloatedNote } from './FloatedNote';
import { useReefKeyboard } from './useReefKeyboard';

/** 粒子预算（页面级缩放） */
const PARTICLE_BUDGET: Record<string, number> = { high: 300, medium: 120, low: 40 };

interface GrottoView3DProps {
  notes: ReefNote[];
  selectedId: string | null;
  hoveredId: string | null;
  highlightIds?: ReadonlySet<string> | null;
  focusFolderId?: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onExit: () => void;
}

/** 穹顶壳：半透明琥珀内壁（BackSide，相机在球内看内壁） */
function DomeShell() {
  return (
    <mesh scale={[1.55, 1.55, 1.55]}>
      <sphereGeometry args={[9, 24, 16]} />
      <meshBasicMaterial color="#F3CD9E" transparent opacity={0.05} side={THREE.BackSide} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/** 背景浮游粒子：暖色系（晨光浮尘），缓慢旋转 */
function AmbientParticles({ count, reducedMotion }: { count: number; reducedMotion: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 26;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 18;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 26;
    }
    return arr;
  }, [count]);
  useFrame((_, delta) => {
    if (!pointsRef.current || reducedMotion) return;
    pointsRef.current.rotation.y += delta * 0.02;
  });
  if (count === 0) return null;
  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.045} color="#E8AD66" transparent opacity={0.25} sizeAttenuation depthWrite={false} toneMapped={false} />
    </points>
  );
}

/** 海底石窟（浅色形态）/ Grotto Dome (light morph) */
export function GrottoView3D({
  notes, selectedId, hoveredId, highlightIds, focusFolderId,
  onHover, onSelect, onOpen, onExit,
}: GrottoView3DProps) {
  const effectiveTier = useEffectiveTier();
  const reducedMotion = useReducedMotion() ?? false;
  const [webgl] = useState(supportsWebGL);

  const positions = useMemo(() => grottoPositions(notes), [notes]);
  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId],
  );
  const hoveredNote = useMemo(
    () => notes.find((n) => n.id === hoveredId) ?? null,
    [notes, hoveredId],
  );

  const dpr = effectiveTier === 'high' ? [1, 2] : effectiveTier === 'medium' ? [1, 1.5] : [1, 1];
  const particleCount = PARTICLE_BUDGET[effectiveTier] ?? 40;

  // 键盘导航：Enter 打开选中、方向键切换（活跃度排序）
  const sortedCards = useMemo(
    () => [...notes].sort((a, b) => b.wordCount - a.wordCount),
    [notes],
  );
  useReefKeyboard({
    cards: sortedCards,
    selectedId,
    onSelect,
    onOpen,
    enabled: webgl,
  });

  if (!webgl) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-c1 text-text-tertiary">当前环境不支持 WebGL，沉浸视图不可用</p>
        <button
          onClick={onExit}
          className="px-3 py-1.5 rounded-kb-full text-c1 font-medium text-brand-600 hover:bg-brand-500/10 transition-colors"
        >
          返回列表
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden select-none [touch-action:none]">
      {/* 晨曦穹顶氛围（CSS 径向渐变，跟随浅色主题） */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_50%_0%,rgba(232,173,102,0.16),transparent_60%)]" aria-hidden="true" />

      <Canvas
        dpr={dpr as [number, number]}
        camera={{ position: [0, 3, 12], fov: 55 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
        aria-label="海底石窟：笔记嵌于穹顶内壁，拖拽旋转，滚轮缩放，单击选中，双击打开"
      >
        <DomeShell />
        <ReefCards
          notes={notes}
          positions={positions}
          morph="grotto"
          hoveredId={hoveredId}
          selectedId={selectedId}
          highlightIds={highlightIds}
          focusFolderId={focusFolderId}
          onHover={onHover}
          onSelect={onSelect}
          onOpen={onOpen}
        />
        {selectedNote && (
          <FloatedNote
            key={selectedNote.id}
            note={selectedNote}
            from={positions.get(selectedNote.id) ?? new THREE.Vector3(0, 0, 2)}
            to={new THREE.Vector3(0, 0.6, 1.6)}
            morph="grotto"
            reducedMotion={reducedMotion}
            onOpen={onOpen}
          />
        )}
        <AmbientParticles count={particleCount} reducedMotion={reducedMotion} />
        <OrbitControls
          enablePan={false}
          minDistance={6.5}
          maxDistance={13.5}
          enableDamping
          dampingFactor={0.08}
          autoRotate={!reducedMotion}
          autoRotateSpeed={0.5}
        />
      </Canvas>

      {/* 空态引导：穹顶空寂 */}
      {notes.length === 0 && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-bg-primary/20">
          <p className="text-b2 text-text-tertiary">穹顶空寂——还没有笔记</p>
          <button
            onClick={onExit}
            className="px-3 py-1.5 rounded-kb-full text-c1 font-medium text-brand-600 hover:bg-brand-500/10 transition-colors"
          >
            返回列表创建
          </button>
        </div>
      )}

      {/* 形态信息（左上） */}
      <div className="absolute left-4 top-4 pointer-events-none z-10 flex flex-col gap-1">
        <span className="text-[11px] tracking-[0.3em] text-text-tertiary/70 uppercase">Grotto</span>
        <span className="text-b1 font-semibold text-text-primary">穹顶石窟</span>
        <span className="text-c1 text-text-tertiary">{notes.length} 篇笔记</span>
      </div>

      {/* 操作提示（左下） */}
      <p className="absolute left-4 bottom-4 z-10 text-c1 text-text-tertiary/70 pointer-events-none">
        拖拽旋转穹顶 · 滚轮缩放 · 单击选中 · 双击/Enter 打开
      </p>

      {/* 选中详情卡（键盘焦点反馈/信息架构） */}
      {selectedNote && <ReefSelectedCard note={selectedNote} onOpen={onOpen} />}

      {/* 悬停标题（右上） */}
      {hoveredNote && (
        <div className="absolute right-4 top-4 z-10 px-3 py-2 rounded-kb-md bg-bg-elevated/90 backdrop-blur border border-border/40 text-c1 text-text-primary shadow-kb-sm pointer-events-none max-w-[220px]">
          <span className="block truncate">{hoveredNote.title || '无标题'}</span>
          <span className="block text-c2 text-text-tertiary mt-0.5">{hoveredNote.wordCount} 字 · {hoveredNote.tags[0] ? `#${hoveredNote.tags[0]}` : ''}</span>
        </div>
      )}
    </div>
  );
}

export default GrottoView3D;
