/**
 * 记录仪式 · 坠落光点
 * @description 新灵感记录瞬间：琥珀金光点从输入区坠落至秩序之井，落点扩散秩序波纹 + 井口辉光脉冲
 * @ai-context 宪法第三条签名时刻的轻量版（约 1.2s 总时长，可打断）；
 * 坠落 550ms（framer spring）→ 波纹 600ms + 井脉冲 900ms（CSS），完成后通知父级清理
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/inspiration-abyss.css';

/** 坠落事件 @ai-context id 用于 AnimatePresence 重触发；x/y 为坠落起点视口坐标 */
export interface EmberEvent {
  id: number;
  x: number;
  y: number;
}

interface FallingEmberProps {
  /** 当前坠落事件（null 表示无演出） */
  ember: EmberEvent | null;
  /** 演出结束回调（父级清理事件） */
  onComplete: () => void;
}

/** 坠落缓动 @ai-context 重力感：先慢后快（cubic-bezier 加速段偏后） */
const FALL_EASE: [number, number, number, number] = [0.55, 0, 0.85, 0.36];

/**
 * 记录仪式演出组件
 * @ai-context 渲染顺序：琥珀光点（含光尾）坠落 → 落点秩序波纹 + 井口辉光脉冲 → 清理
 */
export default function FallingEmber({ ember, onComplete }: FallingEmberProps) {
  const [burst, setBurst] = useState(false);

  const handleFallComplete = () => {
    setBurst(true);
    window.setTimeout(() => {
      setBurst(false);
      onComplete();
    }, 720);
  };

  return (
    <>
      <AnimatePresence>
        {ember && (
          <motion.div
            key={ember.id}
            className="kb-ember"
            initial={{ left: ember.x, top: ember.y, opacity: 0, scale: 0.6 }}
            animate={{
              left: window.innerWidth / 2,
              top: window.innerHeight * 0.82,
              opacity: [0, 1, 1, 0.2],
              scale: [0.6, 1, 0.9, 0.7],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: FALL_EASE }}
            onAnimationComplete={handleFallComplete}
          >
            <div className="kb-ember-trail" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 秩序波纹 + 井口辉光脉冲：落点即井口 */}
      <AnimatePresence>
        {ember && burst && (
          <motion.div
            key={`burst-${ember.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="kb-order-ripple"
              style={{ ['--kb-ripple-x' as string]: '50%', ['--kb-ripple-y' as string]: '82%' }}
            />
            <div className="kb-well-pulse" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
