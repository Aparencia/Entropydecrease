/**
 * AnchorReminderOverlay — T2 记忆锚点提醒浮层
 *
 * @ai-context: 沉浸模式底部轻量浮层，展示 AI 提取的一句话要点；
 * 15 秒自动消失（hook 内控制），低存在感设计不抢专注注意力。
 */
import { motion, AnimatePresence } from 'framer-motion';
import { Anchor } from 'lucide-react';
import { useAnchorReminder } from '../hooks/useAnchorReminder';

export function AnchorReminderOverlay() {
  const anchorText = useAnchorReminder();

  return (
    <AnimatePresence>
      {anchorText && (
        <motion.div
          className="absolute bottom-36 left-1/2 -translate-x-1/2 max-w-md px-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <div className="flex items-start gap-2.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 px-5 py-3">
            <Anchor className="w-4 h-4 text-[#C4956A]/80 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
            <p className="text-[13px] leading-relaxed text-white/70">{anchorText}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
