/**
 * @ai-context: 笔记列表空状态：优雅插画 + 引导文案 + 开始创作按钮。
 * 自 NotesPage.tsx 原样拆出；「开始创作」动作经 onCreate 注入（父层打开模板选择器）。
 * @ai-context: Notes-list empty state with illustration and CTA, extracted
 * verbatim from NotesPage.tsx. The CTA action is injected via onCreate.
 */
import { motion } from 'framer-motion';
import { Plus, FileText } from 'lucide-react';

interface NotesEmptyStateProps {
  /** 点击「开始创作」回调（父层打开模板选择器） */
  onCreate: () => void;
}

export default function NotesEmptyState({ onCreate }: NotesEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 select-none">
      {/* 优雅空状态插图 */}
      <div className="relative w-32 h-32 flex items-center justify-center">
        <div className="absolute inset-0 rounded-[var(--kb-radius-xl)] bg-gradient-to-br from-brand-100/60 to-accent-100/40 dark:from-brand-900/20 dark:to-accent-900/10 rotate-6" />
        <div className="absolute inset-2 rounded-[var(--kb-radius-lg)] bg-gradient-to-tl from-brand-50/80 to-white/60 dark:from-brand-950/30 dark:to-bg-elevated/50 -rotate-3 backdrop-blur-sm" />
        <FileText className="relative w-14 h-14 text-brand-400/70" strokeWidth={1} />
      </div>
      <div className="text-center max-w-xs">
        <h3 className="text-h2 font-semibold text-text-primary mb-2">创建第一个知识块</h3>
        <p className="text-b2 text-text-tertiary leading-relaxed">
          每一个想法都值得被记录。开始构建属于你的知识宇宙，让思维的碎片在这里交织生长。
        </p>
      </div>
      <motion.button
        whileHover={{ scale: 1.03, y: -2 }}
        whileTap={{ scale: 0.97 }}
        onClick={onCreate}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--kb-radius-lg)] bg-brand-500 text-white text-b2 font-medium shadow-[0_4px_20px_-4px_rgba(91,138,114,0.4)] hover:shadow-[0_8px_30px_-4px_rgba(91,138,114,0.5)] transition-shadow duration-300"
      >
        <Plus className="w-4 h-4" strokeWidth={2} />
        开始创作
      </motion.button>
    </div>
  );
}
