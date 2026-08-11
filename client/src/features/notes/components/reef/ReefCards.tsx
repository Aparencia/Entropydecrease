/**
 * 卡片式笔记渲染（3D 空间 billboard 卡片 + 选中详情卡）
 * Card-style note rendering (billboard cards + selection detail card)
 *
 * @ai-context: 参考 Obsidian 3D 插件/Notion 的标签可见实践——3D 空间中笔记以
 * 卡片呈现而非几何体：CanvasTexture 绘制卡片位图（圆角背景+模板色条+标题+
 * 元信息），贴到始终面向相机的平面（billboard）。预算 80 张最活跃笔记（draw
 * call 与纹理内存上限：80×384×240×4 ≈ 29MB），纹理分 24 张/50ms 增量生成
 * 避免主线程长阻塞，卸载时 dispose 防内存泄漏。hover 浮起提亮、选中放大、
 * 旧 hover 平滑回弹。
 * @ai-context: Notes render as billboard cards (CanvasTexture on planes
 * facing the camera) instead of geometric spheres. Budget 80 most-active
 * notes; textures generate incrementally (24/frame) and dispose on unmount.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useCursor } from '@react-three/drei';
import { CARD_W, CARD_H, buildCardTexture } from './cardTexture';
import {
  nodeBrightness,
  type ReefMorph, type ReefNote,
} from './reefTypes';

/** 卡片预算（draw call 与纹理内存上限） */
export const CARD_BUDGET = 80;
/** 增量纹理生成批次（张/帧） */
const TEX_BATCH = 24;
/** hover/selected 缩放系数 */
const HOVER_SCALE = 1.22;
const SELECT_SCALE = 1.42;

/** 实例是否降亮（文件夹聚焦/搜索高亮之外） */
function isDimmed(
  note: ReefNote,
  focusFolderId?: string | null,
  highlightIds?: ReadonlySet<string> | null,
): boolean {
  return (focusFolderId != null && note.folderId !== focusFolderId)
    || (highlightIds != null && !highlightIds.has(note.id));
}

interface ReefCardsProps {
  notes: ReefNote[];
  positions: Map<string, THREE.Vector3>;
  morph: ReefMorph;
  hoveredId: string | null;
  selectedId: string | null;
  highlightIds?: ReadonlySet<string> | null;
  focusFolderId?: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

type CardEvent = ThreeEvent<MouseEvent | PointerEvent>;

/** 3D 卡片场：billboard + hover/选中动画 + 事件 */
export function ReefCards({
  notes, positions, morph, hoveredId, selectedId, highlightIds, focusFolderId,
  onHover, onSelect, onOpen,
}: ReefCardsProps) {
  // 卡片集：活跃度降序取预算内，selected 交由升格组件单独渲染
  const sortedAll = useMemo(
    () => [...notes].sort((a, b) => b.wordCount - a.wordCount),
    [notes],
  );
  const cards = useMemo(
    () => sortedAll.slice(0, CARD_BUDGET).filter((n) => n.id !== selectedId),
    [sortedAll, selectedId],
  );
  const [hovered, setHovered] = useState<string | null>(null);
  useCursor(hovered !== null);

  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const matRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const scales = useRef<number[]>([]);
  if (scales.current.length !== cards.length) scales.current = cards.map(() => 1);
  const prevHoveredRef = useRef<string | null>(null);
  const recoveringRef = useRef<string | null>(null);

  // 纹理增量生成（分 24 张/50ms，避免主线程长阻塞）+ 卸载 dispose
  const textureMapRef = useRef<Map<string, THREE.CanvasTexture>>(new Map());
  const [visibleCount, setVisibleCount] = useState(0);
  useEffect(() => {
    for (const t of textureMapRef.current.values()) t.dispose();
    textureMapRef.current = new Map();
    setVisibleCount(0);
    let i = 0;
    const timer = setInterval(() => {
      const end = Math.min(i + TEX_BATCH, cards.length);
      for (; i < end; i++) {
        textureMapRef.current.set(cards[i].id, buildCardTexture(cards[i], morph));
      }
      setVisibleCount(end);
      if (end >= cards.length) clearInterval(timer);
    }, 50);
    return () => {
      clearInterval(timer);
      for (const t of textureMapRef.current.values()) t.dispose();
      textureMapRef.current = new Map();
    };
  }, [cards, morph]);

  // 基色亮度写入（布局/筛选变化时；hover 提亮由 useFrame 处理）
  useLayoutEffect(() => {
    cards.forEach((note, i) => {
      const mat = matRefs.current[i];
      if (!mat) return;
      const b = nodeBrightness(note) * (isDimmed(note, focusFolderId, highlightIds) ? 0.25 : 1);
      mat.color.setRGB(b, b, b);
    });
    scales.current = cards.map(() => 1);
    prevHoveredRef.current = null;
    recoveringRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 布局/筛选变化时整体重写
  }, [cards, morph, focusFolderId, highlightIds]);

  // billboard + hover/选中/回弹动画（每帧仅操作卡片级简单运算）
  useFrame(({ camera }) => {
    const count = Math.min(visibleCount, cards.length);
    for (let i = 0; i < count; i++) {
      const mesh = meshRefs.current[i];
      const mat = matRefs.current[i];
      if (!mesh || !mat) continue;
      // billboard：始终面向相机（文字始终可读）
      mesh.quaternion.copy(camera.quaternion);

      const id = cards[i].id;
      let target = 1;
      if (id === selectedId) target = SELECT_SCALE;
      else if (id === hoveredId) target = HOVER_SCALE;
      else if (recoveringRef.current === id) target = 1;

      const cur = scales.current[i];
      if (Math.abs(target - cur) >= 0.004) {
        scales.current[i] = cur + (target - cur) * 0.12;
        mesh.scale.setScalar(scales.current[i]);
        // 被注视的发光体提亮；回弹时恢复基础亮度
        const base = nodeBrightness(cards[i]) * (isDimmed(cards[i], focusFolderId, highlightIds) ? 0.25 : 1);
        mat.color.setRGB(base, base, base).multiplyScalar(
          id === selectedId || id === hoveredId ? 1 + (scales.current[i] - 1) * 0.7 : 1,
        );
      }
    }
    // hover 目标切换：旧 hovered 进入回弹恢复
    if (prevHoveredRef.current !== hoveredId) {
      if (prevHoveredRef.current) recoveringRef.current = prevHoveredRef.current;
      prevHoveredRef.current = hoveredId;
    }
    if (recoveringRef.current && recoveringRef.current !== hoveredId) {
      const ri = cards.findIndex((c) => c.id === recoveringRef.current);
      if (ri === -1 || Math.abs(scales.current[ri] - 1) < 0.004) {
        if (ri !== -1) scales.current[ri] = 1;
        recoveringRef.current = null;
      }
    }
  });

  const handleEvent = useRef((e: CardEvent, fn: (id: string) => void, id: string) => {
    e.stopPropagation();
    fn(id);
  });

  return (
    <group>
      {cards.slice(0, visibleCount).map((note, i) => (
        <mesh
          key={note.id}
          ref={(el) => { meshRefs.current[i] = el; }}
          position={positions.get(note.id)}
          onClick={(e) => handleEvent.current(e, onSelect, note.id)}
          onDoubleClick={(e) => handleEvent.current(e, onOpen, note.id)}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(note.id); onHover(note.id); }}
          onPointerOut={() => { setHovered(null); onHover(null); }}
        >
          <planeGeometry args={[CARD_W, CARD_H]} />
          <meshBasicMaterial
            ref={(el) => { matRefs.current[i] = el; }}
            map={textureMapRef.current.get(note.id)}
            transparent
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** 模板中文标签（详情卡展示用） */
const TEMPLATE_LABELS: Record<string, string> = {
  outline: '大纲式', cornell: '康奈尔', mindmap: '思维导图', free: '自由笔记',
  blank: '空白', qa: '问答', 'qa-grid': '问答网格', timeline: '时间线', video: '视频笔记', todo: '待办',
};

/** 选中笔记详情卡（DOM 覆盖层：信息架构/无障碍焦点反馈） */
export function ReefSelectedCard({ note, onOpen }: { note: ReefNote; onOpen: (id: string) => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute left-4 bottom-16 z-20 w-60 rounded-kb-lg bg-bg-elevated/90 backdrop-blur-xl border border-border/40 shadow-kb-md p-3"
    >
      <p className="text-b2 font-medium text-text-primary truncate">{note.title || '无标题'}</p>
      <p className="text-c2 text-text-tertiary mt-1">
        {TEMPLATE_LABELS[note.template] ?? note.template} · {note.wordCount} 字
      </p>
      {note.tags.length > 0 && (
        <p className="text-c2 text-text-tertiary mt-0.5 truncate">
          {note.tags.map((t) => `#${t}`).join(' ')}
        </p>
      )}
      <button
        onClick={() => onOpen(note.id)}
        className="mt-2 w-full py-1.5 rounded-kb-full text-c1 font-medium bg-brand-500/15 text-brand-600 hover:bg-brand-500/25 transition-colors duration-200"
      >
        打开编辑（Enter）
      </button>
    </div>
  );
}

export default ReefCards;
