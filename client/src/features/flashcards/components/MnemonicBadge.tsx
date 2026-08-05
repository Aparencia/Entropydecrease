/**
 * 记忆术徽章 — 展示 AI 生成的助记符
 *
 * @ai-context: 显示记忆术类型徽章（谐音/故事/空间）和助记文本，
 * 用于闪卡复习场景，帮助用户通过联想加深记忆。
 */
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { MnemonicData, MnemonicType } from '@/lib/ai/types';

const MNEMONIC_META: Record<MnemonicType, { label: string; color: string; icon: string }> = {
  phonetic: { label: '谐音', color: 'bg-pink-500/15 text-pink-500 border-pink-500/20', icon: '🔊' },
  story: { label: '故事', color: 'bg-amber-500/15 text-amber-500 border-amber-500/20', icon: '📖' },
  spatial: { label: '空间', color: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20', icon: '🗺️' },
};

interface MnemonicBadgeProps {
  mnemonic: MnemonicData;
  className?: string;
}

export default function MnemonicBadge({ mnemonic, className }: MnemonicBadgeProps) {
  const meta = MNEMONIC_META[mnemonic.type] ?? MNEMONIC_META.story;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn('rounded-xl border p-3', meta.color, className)}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[14px]">{meta.icon}</span>
        <span className="rounded-full bg-white/10 dark:bg-white/5 px-2 py-0.5 text-[10px] font-medium">
          {meta.label}记忆
        </span>
        {mnemonic.effectivenessScore !== undefined && (
          <span className="text-[10px] text-text-tertiary ml-auto">
            效果 {mnemonic.effectivenessScore}/10
          </span>
        )}
      </div>

      <p className="text-[13px] leading-relaxed">{mnemonic.text}</p>

      {mnemonic.hint && (
        <p className="text-[11px] text-text-tertiary mt-1.5">💡 {mnemonic.hint}</p>
      )}

      {mnemonic.visualClue && (
        <div className="mt-2 rounded-lg bg-white/5 dark:bg-black/10 p-2">
          <p className="text-[10px] text-text-tertiary mb-0.5">视觉联想</p>
          <p className="text-[12px] text-text-secondary">{mnemonic.visualClue}</p>
        </div>
      )}
    </motion.div>
  );
}