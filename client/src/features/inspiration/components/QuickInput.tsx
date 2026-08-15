/**
 * 灵感快速输入区（磨砂玻璃 + focus 光效）
 * Quick inspiration input area (frosted glass + focus glow).
 *
 * @ai-context: 从 InspirationPage 拆出的快速输入组件。textarea ref 由页面注入，
 * 供提交时计算琥珀金光点坠落起点（记录仪式动画）与提交后焦点恢复。
 * @ai-context: Extracted from InspirationPage; the page owns the textarea ref
 * to compute the ember-drop animation origin and restore focus after submit.
 */

import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import type { RefObject, KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { inputVariants } from '../constants';

interface QuickInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  aiLoading: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}

export default function QuickInput({
  value,
  onChange,
  onSubmit,
  submitting,
  aiLoading,
  textareaRef,
  onKeyDown,
}: QuickInputProps) {
  return (
    <motion.div
      variants={inputVariants}
      className={cn(
        'relative bg-bg-secondary/40 backdrop-blur-2xl border border-white/12 dark:border-white/6 rounded-[var(--kb-radius-xl)] p-kb-md',
        'focus-within:border-accent-400/50 focus-within:shadow-[0_0_24px_rgba(74,155,217,0.1)]',
        'transition-all duration-300',
      )}
    >
      {/* top accent line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-400/30 to-transparent" />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="随手记录萤火海沟、疑问、想法..."
        rows={3}
        className="w-full resize-none text-b2 text-text-primary placeholder:text-text-tertiary bg-transparent focus:outline-none"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-c1 text-text-tertiary">Ctrl+Enter 提交</span>
        <motion.button
          whileHover={{ scale: 1.03, outline: '2px solid rgba(91,138,114,0.3)' }}
          whileTap={{ scale: 0.95 }}
          onClick={onSubmit}
          disabled={!value.trim() || submitting}
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium',
            'bg-brand-600 text-text-inverse shadow-md shadow-brand-500/15',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors duration-200',
          )}
        >
          {submitting || aiLoading ? (
            <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />打标中...</>
          ) : (
            <><Send className="w-3.5 h-3.5" />记录</>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
