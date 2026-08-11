/**
 * 选中笔记升格卡片（共享）
 * Selected-note ascension card (shared)
 *
 * @ai-context: 点击选中后，笔记卡片从原位平滑「升格」至形态焦点位（深渊=海面
 * 焦点、石窟=穹顶中央），伴随秩序波纹环脉动（宪法：选中=秩序波纹）。卡片
 * 纹理复用 buildCardTexture（与 ReefCards 同源），父级重渲染传入新对象引用
 * 不打断动画（useRef 缓存初始 from/to）。reduced-motion 直接落位。点击升格
 * 卡片 = 打开编辑。卸载时 dispose 纹理防内存泄漏。
 * @ai-context: On selection the note card ascends smoothly to the morph
 * focus point with a pulsing order-ripple ring. Card texture reuses
 * buildCardTexture; initial from/to are cached so parent re-renders do not
 * interrupt the animation. Reduced motion snaps instantly.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CARD_W, CARD_H, buildCardTexture } from './cardTexture';
import type { ReefMorph, ReefNote } from './reefTypes';

interface FloatedNoteProps {
  note: ReefNote;
  /** 升格起点（原始布局位置） */
  from: THREE.Vector3;
  /** 升格终点（形态焦点位） */
  to: THREE.Vector3;
  morph: ReefMorph;
  reducedMotion: boolean;
  onOpen: (id: string) => void;
}

export function FloatedNote({ note, from, to, morph, reducedMotion, onOpen }: FloatedNoteProps) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  // 缓存初始 from/to：父级重渲染传入新对象引用会重置 position，打断升格动画
  const fromRef = useRef(from);
  const toRef = useRef(to);
  // 卡片纹理（一次性生成，卸载 dispose）
  const texture = useMemo(() => buildCardTexture(note, morph), [note, morph]);
  useEffect(() => () => { texture.dispose(); }, [texture]);

  useFrame(({ clock }) => {
    if (groupRef.current && !reducedMotion) {
      groupRef.current.position.lerp(toRef.current, 0.05);
    }
    if (ringRef.current && !reducedMotion) {
      const s = 1 + Math.sin(clock.getElapsedTime() * 2.4) * 0.15;
      ringRef.current.scale.set(s, s, 1);
    }
  });

  return (
    <group
      ref={groupRef}
      position={reducedMotion ? toRef.current : fromRef.current}
      onClick={(e) => { e.stopPropagation(); onOpen(note.id); }}
    >
      <mesh>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
      <mesh ref={ringRef} rotation-x={Math.PI / 2} position={[0, -CARD_H / 2 - 0.12, 0]}>
        <ringGeometry args={[0.55, 0.78, 32]} />
        <meshBasicMaterial color="#4A9BD9" transparent opacity={0.45} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default FloatedNote;
