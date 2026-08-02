/**
 * 水母气泡消息
 *
 * @ai-context: 主动触发时浮现在水母旁的消息气泡；
 * 点击展开对话面板，5s 后自动消散（觉察 > 管控：不强制，自然消退）。
 * 使用 Framer Motion AnimatePresence 实现进出动画。
 */
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  message: string | null;
  onClick: () => void;
  onDismiss: () => void;
}

export function CreatureBubble({ message, onClick, onDismiss }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 5s 自动消散
  useEffect(() => {
    if (message) {
      timerRef.current = setTimeout(onDismiss, 5000);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
  }, [message, onDismiss]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          onClick={onClick}
          className="absolute bottom-full right-0 mb-2 max-w-[240px] cursor-pointer
            rounded-2xl rounded-br-sm px-3.5 py-2.5
            bg-bg-elevated/90 backdrop-blur-md border border-cyber/20
            text-sm text-text-primary shadow-accent
            hover:border-cyber/40 transition-colors"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
