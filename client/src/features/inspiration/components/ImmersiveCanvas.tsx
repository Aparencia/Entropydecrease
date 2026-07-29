/**
 * 全屏沉浸式容器组件
 * @ai-context 承载神经突触动画和玻璃拟态卡片，驱动灵感捕捉的沉浸式视图阶段状态机过渡
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { IMMERSIVE_EASE, IMMERSIVE_DURATION } from '../constants';
import type { ImmersivePhase, DegradationLevel } from '../types';
import PulseAnimation from './PulseAnimation';
import DeepSeaAmbient from './DeepSeaAmbient';
import InspirationConstellation from './InspirationConstellation';

interface ImmersiveCanvasProps {
  /** 当前沉浸式阶段 */
  phase: ImmersivePhase;
  /** 点击坐标 */
  clickPoint: { x: number; y: number } | null;
  /** 曲线随机种子 */
  curveSeed: number;
  /** 设备降级级别 */
  degradation: DegradationLevel;
  /** 已有灵感数据（用于深海星座可视化） */
  inspirations: Array<{
    id: string;
    content: string;
    tags: { content_nature: string; cognitive_depth: string; subject?: string };
    sortStatus?: string;
  }>;
  /** 画布点击回调（传递坐标给状态机） */
  onCanvasClick: (point: { x: number; y: number }) => void;
  /** entering 阶段动画完成回调 */
  onEnteringComplete: () => void;
  /** 突触动画完成回调 */
  onSynapseComplete: () => void;
  /** 回缩汇聚完成回调 */
  onConvergeComplete: () => void;
  /** 卡片浮现完成回调 */
  onCardComplete: () => void;
  /** 退出回调 */
  onExit: () => void;
  /** 子元素（GlassInspirationCard） */
  children?: React.ReactNode;
}

/**
 * 沉浸式全屏容器
 * @ai-context 管理沉浸式视图从 entering → settled 的全生命周期，内含突触动画层与卡片浮层
 */
function ImmersiveCanvas({
  phase,
  clickPoint,
  curveSeed,
  degradation,
  inspirations,
  onCanvasClick,
  onEnteringComplete,
  onSynapseComplete,
  onConvergeComplete,
  onCardComplete,
  onExit,
  children,
}: ImmersiveCanvasProps) {
  // entering 阶段完成后自动通知父组件推进状态机
  useEffect(() => {
    if (phase !== 'entering') return;
    const timer = setTimeout(() => onEnteringComplete(), IMMERSIVE_DURATION);
    return () => clearTimeout(timer);
  }, [phase, onEnteringComplete]);

  // card 阶段浮现完成后推进到 settled
  useEffect(() => {
    if (phase !== 'card') return;
    const timer = setTimeout(() => onCardComplete(), 420);
    return () => clearTimeout(timer);
  }, [phase, onCardComplete]);

  return createPortal(
    <AnimatePresence>
      {phase !== 'idle' && (
        <motion.div
          className="fixed inset-0 z-[9999]"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: IMMERSIVE_EASE }}
        >
          {/* 背景层：深色 + 微弱噪点纹理，不用 backdrop-blur */}
          <div className="absolute inset-0 bg-bg-primary kb-immersive-bg" />

          {/* 深海环境动画层 z-[1] */}
          <div className="relative z-[1]">
            <DeepSeaAmbient degradation={degradation} />
          </div>

          {/* 灵感星座光点层 z-[10]：全阶段可见，始终显示在背景之上 */}
          <div className="relative z-[10]">
            <InspirationConstellation inspirations={inspirations} degradation={degradation} />
          </div>

          {/* 点击区域 z-[20]：仅 immersive 阶段，缩小到中心 40vw×40vh */}
          {phase === 'immersive' && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vh] cursor-crosshair z-[20]"
              onClick={(e) => onCanvasClick({ x: e.clientX, y: e.clientY })}
            />
          )}

          {/* 脉冲波纹动画层 z-[30] */}
          <div className="relative z-[30]">
            <PulseAnimation
              phase={phase}
              clickPoint={clickPoint}
              curveSeed={curveSeed}
              degradation={degradation}
              onSynapseComplete={onSynapseComplete}
              onConvergeComplete={onConvergeComplete}
            />
          </div>

          {/* 卡片层 z-[40]：card / settled 阶段显示 */}
          {(phase === 'card' || phase === 'settled') && (
            <motion.div
              className="absolute inset-0 z-[40] flex items-center justify-center p-kb-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease: IMMERSIVE_EASE }}
            >
              {children}
            </motion.div>
          )}

          {/* 退出按钮 */}
          <motion.button
            className="absolute top-10 right-4 z-[60] text-text-tertiary hover:text-text-primary transition-colors"
            onClick={onExit}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <X className="w-5 h-5" />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default ImmersiveCanvas;
