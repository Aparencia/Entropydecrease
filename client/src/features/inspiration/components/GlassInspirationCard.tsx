/**
 * 玻璃拟态灵感输入卡片
 * @ai-context 沉浸式视图最终阶段的交互卡片，承载灵感内容输入与提交，采用 3 层分离架构保证 backdrop-blur 正确工作
 */
import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';

interface GlassInspirationCardProps {
  /** 提交回调 */
  onSubmit: (content: string) => void;
  /** 关闭回调 */
  onClose: () => void;
  /** 是否正在提交 */
  submitting?: boolean;
}

/**
 * 玻璃拟态灵感卡片
 * @ai-context 沉浸式 settled 阶段展示，3 层架构：外壳 → 玻璃覆盖层(pointer-events-none) → 内容区
 */
function GlassInspirationCard({ onSubmit, onClose, submitting }: GlassInspirationCardProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const content = input.trim();
    if (!content || submitting) return;
    onSubmit(content);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <motion.div
      className="relative w-full max-w-sm rounded-[var(--kb-radius-xl)] overflow-hidden"
      style={{ boxShadow: '0 0 32px rgba(232, 184, 75, 0.15), 0 8px 40px rgba(0,0,0,0.12)' }}
      initial={{ opacity: 0, y: 20, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* 玻璃拟态覆盖层 — 强化磨砂效果 */}
      <div className="absolute inset-0 z-[1] bg-bg-elevated/40 backdrop-blur-2xl border border-white/15 dark:border-white/8 pointer-events-none" />

      {/* 内容区 */}
      <div className="relative z-10 p-kb-lg">
        <h2 className="text-h3 font-bold text-text-primary mb-3">捕捉萤火</h2>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="记录此刻的灵感闪烁..."
          rows={4}
          autoFocus
          className="w-full resize-none text-b2 text-text-primary placeholder:text-text-tertiary bg-bg-secondary/40 border border-border/30 rounded-kb-lg p-3 focus:outline-none focus:ring-1 focus:ring-brand-300"
        />

        <div className="flex items-center justify-between mt-3">
          <span className="text-c1 text-text-tertiary">Ctrl+Enter 提交</span>
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="px-3 py-1.5 rounded-full text-sm text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors"
            >
              取消
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSubmit}
              disabled={!input.trim() || submitting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium bg-brand-600 text-text-inverse shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  记录中...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  记录
                </>
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default GlassInspirationCard;
