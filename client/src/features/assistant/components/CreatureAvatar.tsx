/**
 * 深海水母动画组件
 *
 * @ai-context: 助手视觉核心——CSS + Framer Motion 驱动的状态机动画；
 * 仅使用 transform/opacity/box-shadow 确保 GPU 合成层，不触发 layout/paint。
 * 状态：idle(漂浮) → alerting(琥珀金闪烁) → speaking(赛博青脉冲) → listening(微倾)。
 */
import { motion } from 'framer-motion';
import { useAssistantStore } from '../store/useAssistantStore';
import { CreatureBubble } from './CreatureBubble';
import { CREATURE_SIZE_IDLE } from '../constants';
import type { CreatureState } from '../types';

/** 状态 → 发光颜色映射（使用 CSS 变量适配双主题） */
const GLOW_MAP: Record<CreatureState, string> = {
  idle: '0 0 12px 2px color-mix(in srgb, var(--kb-cyber-cyan) 15%, transparent)',
  alerting: '0 0 20px 6px color-mix(in srgb, var(--kb-amber) 40%, transparent)',
  speaking: '0 0 18px 5px color-mix(in srgb, var(--kb-cyber-cyan) 45%, transparent)',
  listening: '0 0 10px 2px color-mix(in srgb, var(--kb-cyber-cyan) 20%, transparent)',
  resting: '0 0 6px 1px color-mix(in srgb, var(--kb-cyber-cyan) 8%, transparent)',
};

interface Props {
  onClick: () => void;
  onBubbleClick: () => void;
  onBubbleDismiss: () => void;
}

export function CreatureAvatar({ onClick, onBubbleClick, onBubbleDismiss }: Props) {
  const creatureState = useAssistantStore(s => s.creatureState);
  const bubbleMessage = useAssistantStore(s => s.bubbleMessage);

  return (
    <div className="fixed right-6 bottom-6 z-50 flex flex-col items-end">
      {/* 气泡消息 */}
      <div className="relative">
        <CreatureBubble message={bubbleMessage} onClick={onBubbleClick} onDismiss={onBubbleDismiss} />
      </div>

      {/* 水母主体 */}
      <motion.button
        onClick={onClick}
        className="relative outline-none border-none bg-transparent cursor-pointer"
        style={{ width: CREATURE_SIZE_IDLE, height: CREATURE_SIZE_IDLE }}
        animate={{
          y: creatureState === 'resting' ? [0, 4, 0] : [0, -3, 0],
          scale: creatureState === 'alerting' ? [1, 1.08, 1] : 1,
        }}
        transition={{
          y: { duration: creatureState === 'resting' ? 6 : 4, repeat: Infinity, ease: 'easeInOut' },
          scale: { duration: 0.6, repeat: creatureState === 'alerting' ? 3 : 0 },
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        aria-label="AI 学伴助手"
      >
        {/* 伞体 */}
        <div
          className="absolute inset-x-1 top-0 h-[38px] transition-all duration-700"
          style={{
            background: 'radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--kb-cyber-cyan) 25%, transparent), var(--kb-bg-secondary))',
            boxShadow: GLOW_MAP[creatureState],
            borderRadius: '50% 50% 40% 40%',
          }}
        />
        {/* 触须（4条，相位错开） */}
        {[0, 1, 2, 3].map(i => (
          <motion.div
            key={i}
            className="absolute bottom-0 w-[2px] rounded-full bg-cyber/30"
            style={{ left: `${20 + i * 16}%`, height: 22, transformOrigin: 'top' }}
            animate={{ rotateZ: [(-3 + i * 2), (3 - i * 2), (-3 + i * 2)] }}
            transition={{ duration: 3 + i * 0.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </motion.button>
    </div>
  );
}
