/**
 * 萤火海沟 — 灵感萤火球（Orb）组件
 * @ai-context 半透明磨砂玻璃风格，不同标签色调区分。
 * 新灵感以「弹入+发光」方式出现，悬浮时上浮+光泽增强。
 * 使用 Framer Motion layoutId 实现球→卡的形变过渡。
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useCallback } from 'react';
import { Trash2, Wand2, X, Check } from 'lucide-react';
import { useInspirationStore } from '../store/inspirationStore';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '@/components/ui';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { useAISortInspiration } from '@/lib/ai/useAI';
import type { SortSuggestion } from '@/lib/ai/types';
import { cn } from '@/lib/utils';
import { NATURE_MAP, DEPTH_MAP, SORT_STATUS_CONFIG, formatTime, cardVariants } from '../constants';
import type { InspirationCardProps } from '../types';
import {
  calcOrbSize, truncateContent, getOrbShape, getOrbGlowColor,
  needsTodoClipPath, TODO_CLIP_PATH,
} from '../lib/orbLayout';
import { useOrbExpand } from '../hooks/useOrbExpand';
import TagChip from './TagChip';
import TagEditPopover from './TagEditPopover';
import AISortPanel from './AISortPanel';
import { SPRING, scaleIn } from '@/lib/animation/springConfig';

// ─────────────────────────────────────────────────────────────
// 收缩态球体
// ─────────────────────────────────────────────────────────────

interface OrbCollapsedProps {
  item: InspirationCardProps['item'];
  batchMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onExpand: () => void;
  breatheDuration: number;
}

function OrbCollapsed({ item, batchMode, selected, onToggleSelect, onExpand, breatheDuration }: OrbCollapsedProps) {
  const size = calcOrbSize(item.tags.cognitive_depth);
  const shape = getOrbShape(item.tags.content_nature);
  const glowColor = getOrbGlowColor(item.tags.content_nature);
  const todoClip = needsTodoClipPath(item.tags.content_nature);

  // 分拣状态角标
  const sortCfg = item.sortStatus && item.sortStatus !== 'pending'
    ? SORT_STATUS_CONFIG[item.sortStatus] ?? null
    : null;

  return (
    <motion.div
      layoutId={`orb-${item.id}`}
      onClick={onExpand}
      whileHover={{ scale: 1.12, y: -4, boxShadow: `0 0 20px ${glowColor}` }}
      transition={SPRING.bouncy}
      className="relative cursor-pointer select-none group"
      style={{
        width: size,
        height: size,
        boxShadow: `0 0 12px ${glowColor}`,
        animation: `kb-orb-breathe ${breatheDuration}s ease-in-out infinite`,
        ...(todoClip ? { clipPath: TODO_CLIP_PATH } : {}),
      }}
    >
      {/* 球体背景 — 磨砂玻璃 */}
      <div className={cn(
        'absolute inset-0 bg-bg-secondary/30 backdrop-blur-xl border border-white/10 dark:border-white/5',
        shape,
      )} />

      {/* 截断文本 */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <span className={cn(
          'text-[10px] text-text-primary/80 text-center leading-tight px-1 truncate max-w-full',
          item.tags.content_nature === 'question' && '-rotate-45',
        )}>
          {truncateContent(item.content)}
        </span>
      </div>

      {/* 分拣状态角标 — 右上角小点 */}
      {sortCfg && (() => {
        const cfg = sortCfg;
        const Icon = cfg.icon;
        return (
          <div className={cn(
            'absolute -top-1 -right-1 z-20 w-3.5 h-3.5 rounded-full flex items-center justify-center border',
            cfg.bg, cfg.color,
            cfg.animate && 'animate-pulse',
          )}>
            {Icon && <Icon className="w-2 h-2" />}
          </div>
        );
      })()}

      {/* 批量模式勾选框 — 左上角 */}
      {batchMode && (
        <div className="absolute -top-1 -left-1 z-20" onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => {}}
            className="w-3.5 h-3.5 rounded accent-brand-500 cursor-pointer"
          />
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// 展开态卡片
// ─────────────────────────────────────────────────────────────

interface OrbExpandedProps {
  item: InspirationCardProps['item'];
  onClose: () => void;
}

function OrbExpanded({ item, onClose }: OrbExpandedProps) {
  const { deleteItem } = useInspirationStore(useShallow(s => s));
  const [editOpen, setEditOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortSuggestions, setSortSuggestions] = useState<SortSuggestion[]>([]);
  const { sortInspiration, loading: sortLoading } = useAISortInspiration();
  const { toast } = useToast();

  const natureOpt = NATURE_MAP[item.tags.content_nature];
  const depthOpt  = DEPTH_MAP[item.tags.cognitive_depth];

  const handleDelete = () => { deleteItem(item.id); toast({ type: 'success', message: '已删除' }); };

  const handleSort = async () => {
    if (sortOpen && sortSuggestions.length > 0) { setSortOpen(false); return; }
    setSortOpen(true);
    const existingTags: Record<string, string> = {
      content_nature: item.tags.content_nature, cognitive_depth: item.tags.cognitive_depth, subject: item.tags.subject,
    };
    const result = await sortInspiration(item.content, existingTags);
    if (result) setSortSuggestions(result.suggestions);
    else setSortOpen(false);
  };

  return (
    <motion.div
      layoutId={`orb-${item.id}`}
      data-orb-expanded="true"
      onClick={(e) => e.stopPropagation()}
      className="w-72 bg-bg-secondary/50 backdrop-blur-2xl border border-white/15 dark:border-white/8 rounded-[var(--kb-radius-xl)] p-4 relative z-20"
      style={{ boxShadow: `0 0 28px ${getOrbGlowColor(item.tags.content_nature)}50, 0 8px 32px rgba(0,0,0,0.1)` }}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/50 transition-colors z-10"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* 完整内容 */}
      <p className="text-b2 text-text-primary leading-relaxed pr-6">{item.content}</p>

      {/* 标签行 */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <TagChip label={natureOpt?.label ?? item.tags.content_nature} color={natureOpt?.color ?? 'text-text-secondary'}
          bg={natureOpt?.bg ?? 'bg-bg-secondary border-border'} onClick={() => setEditOpen(v => !v)} />
        <TagChip label={depthOpt?.label ?? item.tags.cognitive_depth} color={depthOpt?.color ?? 'text-text-secondary'}
          bg={depthOpt?.bg ?? 'bg-bg-secondary border-border'} onClick={() => setEditOpen(v => !v)} />
        <TagChip label={item.tags.subject} color="text-slate-500"
          bg="bg-slate-50 border-slate-200 dark:bg-slate-800/30 dark:border-slate-600" onClick={() => setEditOpen(v => !v)} />
        {item.tagsManuallyEdited && (
          <span className="text-c1 text-text-tertiary" title="已手动修正标签"><Check className="w-3 h-3 inline mr-0.5" />已修正</span>
        )}
        <AnimatePresence>{editOpen && <TagEditPopover item={item} onClose={() => setEditOpen(false)} />}</AnimatePresence>
      </div>

      {/* 操作栏 */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/20">
        <span className="text-c1 text-text-tertiary">{formatTime(item.createdAt)}</span>
        <div className="flex items-center gap-1.5">
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }}
            onClick={handleSort} disabled={sortLoading}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded-kb-md text-xs font-medium',
              'bg-gradient-to-r from-cyber to-brand-500 text-text-inverse',
              'disabled:opacity-60 disabled:cursor-not-allowed',
            )}
          >
            {sortLoading ? (<><AIThinkingIndicator size={3} gap={2} />分析中...</>) : (<><Wand2 className="w-3 h-3" />AI 整理</>)}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }}
            onClick={handleDelete}
            className="flex items-center gap-1 px-2 py-0.5 rounded-kb-md text-xs text-text-tertiary hover:text-semantic-error hover:bg-semantic-error/10 transition-colors"
          >
            <Trash2 className="w-3 h-3" /> 删除
          </motion.button>
        </div>
      </div>

      {/* AI Sort panel */}
      <AnimatePresence>
        {sortOpen && sortSuggestions.length > 0 && (
          <AISortPanel suggestions={sortSuggestions} item={item} onClose={() => setSortOpen(false)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// 主组件（保留 forwardRef 兼容 Props 接口）
// ─────────────────────────────────────────────────────────────

function InspirationCardInner({ item, batchMode, selected, onToggleSelect }: InspirationCardProps) {
  const { expandedId, expandOrb, collapseOrb } = useOrbExpand();

  /** @ai-context 每个球体随机呼吸周期（3~5s），在首次渲染时固定，确保动画不随 re-render 重置 */
  const breatheRef = useRef(3 + Math.random() * 2);
  const isExpanded = expandedId === item.id;

  const handleExpand = useCallback(() => {
    expandOrb(item.id);
  }, [expandOrb, item.id]);

  return (
    <motion.div
      variants={cardVariants}
      exit={cardVariants.exit}
      className="group relative"
      initial={scaleIn.initial}
      animate={scaleIn.animate}
    >
      {isExpanded ? (
        <OrbExpanded item={item} onClose={collapseOrb} />
      ) : (
        <OrbCollapsed
          item={item}
          batchMode={batchMode}
          selected={selected}
          onToggleSelect={onToggleSelect}
          onExpand={handleExpand}
          breatheDuration={breatheRef.current}
        />
      )}
    </motion.div>
  );
}

export default InspirationCardInner;
