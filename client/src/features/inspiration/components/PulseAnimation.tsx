/**
 * 脉冲波纹动画组件 — CSS 同心圆脉冲替代 SVG 突触曲线
 * @ai-context 沉浸式入场 / 回缩汇聚阶段，从点击位置发出多层同心发光圆环，仅使用 transform + opacity（GPU-only）
 */
import { useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  PULSE_EXPAND_DURATION,
  PULSE_CONVERGE_DURATION,
  PULSE_RINGS,
  PULSE_STAGGER,
  PULSE_RING_SIZE,
  PULSE_MAX_SCALE,
} from '../constants';
import type { ImmersivePhase, DegradationLevel } from '../types';

interface PulseAnimationProps {
  phase: ImmersivePhase;
  clickPoint: { x: number; y: number } | null;
  curveSeed: number;
  degradation: DegradationLevel;
  onSynapseComplete: () => void;
  onConvergeComplete: () => void;
}

/** 圆环颜色插值：赛博青 → 琥珀 */
function ringColor(index: number, total: number): string {
  const t = total <= 1 ? 0 : index / (total - 1);
  // 青: rgba(34, 211, 238, 0.6)  →  琥珀: rgba(245, 158, 11, 0.4)
  const r = Math.round(34 + (245 - 34) * t);
  const g = Math.round(211 + (158 - 211) * t);
  const b = Math.round(238 + (11 - 238) * t);
  const a = 0.6 + (0.4 - 0.6) * t;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** L1 降级：2 个圆环，无中心光晕 */
function DegradedL1({ clickPoint, phase }: { clickPoint: { x: number; y: number }; phase: ImmersivePhase }) {
  const isConverge = phase === 'converge';
  const cls = isConverge ? 'kb-pulse-ring kb-pulse-ring--converge' : 'kb-pulse-ring kb-pulse-ring--expand';
  return (
    <div className="fixed inset-0 z-50 pointer-events-none" style={{ contain: 'layout style paint' }}>
      {[0, 1].map((i) => (
        <div
          key={i}
          className={cls}
          style={{
            left: clickPoint.x,
            top: clickPoint.y,
            width: PULSE_RING_SIZE,
            height: PULSE_RING_SIZE,
            border: `2px solid ${ringColor(i, 2)}`,
            animationDelay: `${i * PULSE_STAGGER}ms`,
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </div>
  );
}

/** prefers-reduced-motion 单次淡入淡出 */
function ReducedMotion({ clickPoint }: { clickPoint: { x: number; y: number } }) {
  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
      <div
        style={{
          position: 'absolute',
          left: clickPoint.x,
          top: clickPoint.y,
          width: PULSE_RING_SIZE * 2,
          height: PULSE_RING_SIZE * 2,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34,211,238,0.25) 0%, transparent 70%)',
          animation: 'fadeIn 0.4s ease-out forwards',
        }}
      />
    </div>
  );
}

/**
 * 脉冲波纹动画主组件
 * @ai-context 根据 phase 渲染 synapse（扩展）或 converge（收缩）阶段的同心圆环动画
 */
function PulseAnimation({
  phase,
  clickPoint,
  curveSeed: _curveSeed,
  degradation,
  onSynapseComplete,
  onConvergeComplete,
}: PulseAnimationProps) {
  const prefersReduced = useReducedMotion();

  // synapse 阶段完成检测
  useEffect(() => {
    if (phase !== 'synapse' || !clickPoint) return;
    const totalMs = PULSE_RINGS * PULSE_STAGGER + PULSE_EXPAND_DURATION + 200;
    const timer = setTimeout(() => onSynapseComplete(), totalMs);
    return () => clearTimeout(timer);
  }, [phase, clickPoint, onSynapseComplete]);

  // converge 阶段完成检测
  useEffect(() => {
    if (phase !== 'converge') return;
    const timer = setTimeout(() => onConvergeComplete(), PULSE_CONVERGE_DURATION + 400);
    return () => clearTimeout(timer);
  }, [phase, onConvergeComplete]);

  // L2 降级：不渲染
  if (degradation === 'L2') return null;

  const isActive = phase === 'synapse' || phase === 'converge';
  if (!isActive || !clickPoint) return null;

  // prefers-reduced-motion
  if (prefersReduced) return <ReducedMotion clickPoint={clickPoint} />;

  // L1 降级
  if (degradation === 'L1') return <DegradedL1 clickPoint={clickPoint} phase={phase} />;

  const isConverge = phase === 'converge';

  return (
    <div className="fixed inset-0 z-50 pointer-events-none" style={{ contain: 'layout style paint' }}>
      {/* 同心圆环 */}
      {Array.from({ length: PULSE_RINGS }).map((_, i) => {
        const cls = isConverge
          ? 'kb-pulse-ring kb-pulse-ring--converge'
          : 'kb-pulse-ring kb-pulse-ring--expand';
        return (
          <div
            key={i}
            className={cls}
            style={{
              left: clickPoint.x,
              top: clickPoint.y,
              width: PULSE_RING_SIZE,
              height: PULSE_RING_SIZE,
              border: `2px solid ${ringColor(i, PULSE_RINGS)}`,
              animationDelay: `${i * PULSE_STAGGER}ms`,
              willChange: 'transform, opacity',
            }}
          />
        );
      })}

      {/* 中心发光点：外层光晕 + 内层核心 */}
      {!isConverge && (
        <>
          {/* 外层光晕 */}
          <div
            style={{
              position: 'absolute',
              left: clickPoint.x,
              top: clickPoint.y,
              width: 40,
              height: 40,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(34, 211, 238, 0.15) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          {/* 内层核心（呼吸脉动） */}
          <div
            className="kb-pulse-center"
            style={{
              left: clickPoint.x,
              top: clickPoint.y,
              width: 16,
              height: 16,
              background: 'radial-gradient(circle, rgba(34, 211, 238, 0.9) 0%, rgba(34, 211, 238, 0.3) 70%)',
            }}
          />
        </>
      )}

      {/* converge 阶段：闪光爆发 */}
      {isConverge && (
        <div
          className="kb-pulse-flash"
          style={{
            left: clickPoint.x,
            top: clickPoint.y,
            width: 60,
            height: 60,
            background: 'radial-gradient(circle, rgba(34, 211, 238, 0.8) 0%, transparent 70%)',
          }}
        />
      )}
    </div>
  );
}

export default PulseAnimation;
