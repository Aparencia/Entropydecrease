/**
 * @ai-context: inspiration 功能模块页面：InspirationPage。
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, X, Wand2, Layers } from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useInspirationStore, type InspirationTags } from '../store/inspirationStore';
import { useShallow } from 'zustand/react/shallow';
import { useAITagContent } from '@/lib/ai/useAI';
import { useBatchSort } from '../hooks/useBatchSort';
import { useSortPendingReminder } from '../hooks/useSortPendingReminder';
import { useImmersiveState } from '../hooks/useImmersiveState';
import FilterBar from '../components/FilterBar';
import InspirationCard from '../components/InspirationCard';
import ImmersiveCanvas from '../components/ImmersiveCanvas';
import GlassInspirationCard from '../components/GlassInspirationCard';
import SortPendingBanner from '../components/SortPendingBanner';
import OrderWellBackground from '../components/OrderWellBackground';
import RitualHeader from '../components/RitualHeader';
import FallingEmber, { type EmberEvent } from '../components/FallingEmber';
import { useDeviceCapability } from '@/hooks/useDeviceCapability';
import { CONTENT_NATURE_OPTIONS, COGNITIVE_DEPTH_OPTIONS, NATURE_MAP } from '../constants';
import { groupInspirationsByNature } from '../lib/orbLayout';
import type { FilterState } from '../types';
import {
  pageVariants, inputVariants, filterVariants,
  listVariants,
} from '../constants';

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function InspirationPage() {
  const { items, loadAll, addItem } = useInspirationStore(useShallow(s => s));
  const { tagContent, loading: aiLoading } = useAITagContent();
  const { toast } = useToast();
  const { progress, total, isProcessing: batchProcessing, batchSort } = useBatchSort();
  const { pendingCount, showReminder, dismissReminder, handleSortAll } = useSortPendingReminder();
  const {
    phase, degradation, clickPoint, curveSeed,
    enter, click, dismiss, exit,
    enteringComplete, synapseComplete, convergeComplete, cardComplete,
  } = useImmersiveState();

  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedNature, setSelectedNature] = useState<string>('inspiration');
  const [selectedDepth, setSelectedDepth] = useState<string>('shallow');
  const [filters, setFilters] = useState<FilterState>({ content_nature: null, cognitive_depth: null, subject: null });
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 造序仪式演出状态：记录坠落光点 / 整理顿悟闪光
  const [ember, setEmber] = useState<EmberEvent | null>(null);
  const [epiphany, setEpiphany] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 设备降级级别推导（与沉浸模式同源：L0 全量 / L1 低端 / L2 减弱动效）
  const { shouldDisableHeavyAnimations, prefersReducedMotion } = useDeviceCapability();
  const abyssDegradation = prefersReducedMotion ? 'L2' : shouldDisableHeavyAnimations ? 'L1' : 'L0';

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!batchMode) setSelectedIds(new Set()); }, [batchMode]);

  // 整理完成（batchSort 结束）→ 触发 200ms 琥珀金顿悟闪光
  const prevProcessing = useRef(false);
  useEffect(() => {
    if (prevProcessing.current && !batchProcessing && !prefersReducedMotion) setEpiphany(true);
    prevProcessing.current = batchProcessing;
  }, [batchProcessing, prefersReducedMotion]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const handleSubmit = useCallback(async () => {
    const content = input.trim();
    if (!content) return;
    setSubmitting(true);
    setInput('');
    const defaultTags: InspirationTags = { content_nature: 'inspiration', cognitive_depth: 'shallow', subject: '未分类' };
    addItem(content, defaultTags);
    // 记录仪式：琥珀金光点从输入区坠落至秩序之井
    const rect = textareaRef.current?.getBoundingClientRect();
    setEmber({
      id: Date.now(),
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top : 96,
    });
    const addedId = useInspirationStore.getState().items[0]?.id;
    try {
      const result = await tagContent(content);
      if (result && addedId) {
        const currentItems = useInspirationStore.getState().items;
        const target = currentItems.find(i => i.id === addedId);
        if (target && !target.tagsManuallyEdited) {
          useInspirationStore.getState().updateTags(addedId, {
            content_nature: (result.contentNature as InspirationTags['content_nature']) ?? 'inspiration',
            cognitive_depth: (result.cognitiveDepth as InspirationTags['cognitive_depth']) ?? 'shallow',
            subject: result.subject ?? '通用',
          });
          const finalItems = useInspirationStore.getState().items;
          const finalTarget = finalItems.find(i => i.id === addedId);
          if (finalTarget && finalTarget.tagsManuallyEdited) {
            useInspirationStore.setState((s) => ({
              items: s.items.map(i => i.id === addedId ? { ...i, tagsManuallyEdited: false } : i),
            }));
          }
        }
      }
    } catch { /* silent */ }
    finally { setSubmitting(false); textareaRef.current?.focus(); }
  }, [input, addItem, tagContent]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSubmit(); }
  };

  const filteredItems = items.filter(item => {
    if (filters.content_nature && item.tags.content_nature !== filters.content_nature) return false;
    if (filters.cognitive_depth && item.tags.cognitive_depth !== filters.cognitive_depth) return false;
    if (filters.subject && item.tags.subject !== filters.subject) return false;
    return true;
  });
  const subjects = [...new Set(items.map(i => i.tags.subject))].filter(Boolean);

  const selectAll = useCallback(() => setSelectedIds(new Set(filteredItems.map(i => i.id))), [filteredItems]);
  const deselectAll = useCallback(() => setSelectedIds(new Set()), []);
  const handleBatchSort = async () => {
    const selected = filteredItems.filter(i => selectedIds.has(i.id));
    if (selected.length === 0) { toast({ type: 'error', message: '请先选择要整理的灵感' }); return; }
    await batchSort(selected);
  };

  // 沉浸式卡片提交处理
  const handleImmersiveSubmit = useCallback(async (content: string) => {
    const defaultTags: InspirationTags = { content_nature: selectedNature as InspirationTags['content_nature'], cognitive_depth: selectedDepth as InspirationTags['cognitive_depth'], subject: '未分类' };
    addItem(content, defaultTags);
    const addedId = useInspirationStore.getState().items[0]?.id;
    try {
      const result = await tagContent(content);
      if (result && addedId) {
        const currentItems = useInspirationStore.getState().items;
        const target = currentItems.find(i => i.id === addedId);
        if (target && !target.tagsManuallyEdited) {
          useInspirationStore.getState().updateTags(addedId, {
            content_nature: (result.contentNature as InspirationTags['content_nature']) ?? 'inspiration',
            cognitive_depth: (result.cognitiveDepth as InspirationTags['cognitive_depth']) ?? 'shallow',
            subject: result.subject ?? '通用',
          });
        }
      }
    } catch { /* silent */ }
    finally { dismiss(); setSelectedNature('inspiration'); setSelectedDepth('shallow'); }
  }, [addItem, tagContent, dismiss, selectedNature, selectedDepth]);

  return (
    <motion.div
      className="max-w-2xl mx-auto px-kb-lg py-kb-xl space-y-6 relative"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      {/* 暗物质场 + 秩序之井背景（fixed 视口层） */}
      <OrderWellBackground degradation={abyssDegradation} />

      {/* ── 仪式碑文 Header ── */}
      <RitualHeader title="萤火海沟" note="随手捕捉萤火 · AI 自动整理分类">
        {/* 沉浸式入口按钮 */}
        <motion.button
          onClick={enter}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r from-accent-500 to-brand-500 text-text-inverse hover:from-accent-600 hover:to-brand-600 shadow-sm shadow-accent-500/20"
        >
          <Sparkles className="w-3.5 h-3.5" />
          沉浸
        </motion.button>
      </RitualHeader>

      {/* ── Quick input area — 磨砂玻璃 + focus 光效 ── */}
      <motion.div
        variants={inputVariants}
        className={cn(
          'relative bg-bg-secondary/40 backdrop-blur-2xl border border-white/12 dark:border-white/6 rounded-[var(--kb-radius-xl)] p-kb-md',
          'focus-within:border-accent-400/50 focus-within:shadow-[0_0_24px_rgba(6,182,212,0.1)]',
          'transition-all duration-300',
        )}
      >
        {/* top accent line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-400/30 to-transparent" />
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="随手记录萤火海沟、疑问、想法..."
          rows={3}
          className="w-full resize-none text-b2 text-text-primary placeholder:text-text-tertiary bg-transparent focus:outline-none"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-c1 text-text-tertiary">Ctrl+Enter 提交</span>
          <motion.button
            whileHover={{ scale: 1.03, outline: '2px solid rgba(91,138,114,0.3)' }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSubmit}
            disabled={!input.trim() || submitting}
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

      {/* ── Filter bar ── */}
      <AnimatePresence>
        {items.length > 0 && (
          <motion.div
            className="bg-bg-secondary/60 backdrop-blur-xl border border-border/30 rounded-[var(--kb-radius-xl)] p-3 relative z-10 space-y-2"
            variants={filterVariants}
          >
            <FilterBar filters={filters} onChange={setFilters} />
            {/* ── 灵感沉淀提醒条 ── */}
            <AnimatePresence>
              {showReminder && <SortPendingBanner pendingCount={pendingCount} onSortAll={handleSortAll} onDismiss={dismissReminder} />}
            </AnimatePresence>
            {/* ── 批量模式入口 ── */}
            <div className="flex items-center justify-between mt-1">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setBatchMode(v => !v)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  batchMode
                    ? 'bg-accent-500/10 border-accent-400/40 text-accent-600 dark:text-accent-400'
                    : 'bg-bg-secondary border-border/40 text-text-tertiary hover:text-text-secondary',
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                {batchMode ? '退出批量' : '批量整理'}
              </motion.button>
              {batchMode && selectedIds.size > 0 && (
                <span className="text-c1 text-text-tertiary">已选中 {selectedIds.size} 条</span>
              )}
            </div>
            {/* ── 批量操作条 ── */}
            <AnimatePresence>
              {batchMode && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 flex-wrap pt-1"
                >
                  <motion.button whileTap={{ scale: 0.95 }} onClick={selectAll}
                    className="px-2 py-0.5 rounded-full text-xs font-medium text-text-secondary bg-bg-secondary border border-border/40 hover:text-text-primary transition-colors">
                    全选
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={deselectAll}
                    className="px-2 py-0.5 rounded-full text-xs font-medium text-text-tertiary bg-bg-secondary border border-border/40 hover:text-text-secondary transition-colors">
                    取消全选
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleBatchSort}
                    disabled={selectedIds.size === 0 || batchProcessing}
                    className={cn(
                      'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium',
                      'bg-gradient-to-r from-accent-500 to-brand-500 text-text-inverse',
                      'hover:from-accent-600 hover:to-brand-600 shadow-sm shadow-accent-500/20',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    {batchProcessing ? (<><AIThinkingIndicator size={3} gap={2} />分析中...</>) : (<><Wand2 className="w-3 h-3" />一键分析</>)}
                  </motion.button>
                  {batchProcessing && (
                    <span className="text-c1 text-text-tertiary">正在分析 {progress}/{total}...</span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {/* ── 批量进度条 ── */}
            {batchProcessing && total > 0 && (
              <div className="w-full h-1.5 rounded-full bg-bg-secondary overflow-hidden mt-1">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-accent-500 to-brand-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${(progress / total) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
            {subjects.length > 0 && (
              <motion.div
                className="flex items-center gap-2 flex-wrap mt-2"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
              >
                <span className="text-c1 text-text-tertiary min-w-[4em]">学科:</span>
                {subjects.map(s => (
                  <motion.button key={s} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={() => setFilters(f => ({ ...f, subject: f.subject === s ? null : s }))}
                    className={cn('px-2 py-0.5 rounded-full text-xs font-medium border transition-colors',
                      filters.subject === s
                        ? 'text-brand-700 bg-brand-100 border-brand-300 dark:text-brand-300 dark:bg-brand-900/20 dark:border-brand-700'
                        : 'text-text-tertiary bg-bg-secondary border-border/40 hover:text-text-secondary')}>
                    {s}
                  </motion.button>
                ))}
                {filters.subject && (
                  <motion.button whileTap={{ scale: 0.9 }}
                    onClick={() => setFilters(f => ({ ...f, subject: null }))}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs text-text-tertiary hover:text-semantic-error transition-colors">
                    <X className="w-3 h-3" /> 清除
                  </motion.button>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Inspiration orb groups ── */}
      {filteredItems.length > 0 ? (
        <motion.div className="space-y-6 relative z-10" variants={listVariants}>
          <AnimatePresence mode="popLayout">
            {Object.entries(groupInspirationsByNature(filteredItems)).map(([nature, groupItems]) => (
              <div key={nature}>
                {/* 分组分隔线 + 类别名 */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px bg-border/20 flex-1" />
                  <span className="text-xs text-text-tertiary opacity-30">
                    {NATURE_MAP[nature]?.label ?? nature}
                  </span>
                  <div className="h-px bg-border/20 flex-1" />
                </div>
                {/* 球群容器 */}
                <div className="flex flex-wrap gap-4 justify-center">
                  {groupItems.map(item => (
                    <InspirationCard
                      key={item.id}
                      item={item}
                      batchMode={batchMode}
                      selected={selectedIds.has(item.id)}
                      onToggleSelect={() => toggleSelect(item.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : items.length > 0 ? (
        <motion.div className="text-center py-12 relative z-10"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <p className="text-b2 text-text-tertiary">没有匹配的萤火海沟记录</p>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => setFilters({ content_nature: null, cognitive_depth: null, subject: null })}
            className="mt-2 text-sm text-brand-600 hover:underline">
            清除筛选
          </motion.button>
        </motion.div>
      ) : (
        <motion.div className="relative z-10"
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
          {/* 冷启动仪式空状态：海沟尚暗，等待第一只萤火 */}
          <div className="kb-ritual-empty py-kb-xl">
            <p className="kb-ritual-empty-title">海沟尚暗</p>
            <p className="kb-ritual-empty-note">等待第一只萤火</p>
          </div>
        </motion.div>
      )}

      {/* ── 沉浸式视图入口 ── */}
      <ImmersiveCanvas
        phase={phase}
        clickPoint={clickPoint}
        curveSeed={curveSeed}
        degradation={degradation}
        inspirations={filteredItems}
        onCanvasClick={click}
        onEnteringComplete={enteringComplete}
        onSynapseComplete={synapseComplete}
        onConvergeComplete={convergeComplete}
        onCardComplete={cardComplete}
        onExit={exit}
      >
        {/* 标签选择药丸组 — 卡片上方 */}
        <div className="w-full max-w-md space-y-1.5 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-c1 text-text-tertiary shrink-0">性质:</span>
            <div className="flex flex-wrap gap-1">
              {CONTENT_NATURE_OPTIONS.map(opt => (
                <button key={opt.value}
                  onClick={() => setSelectedNature(opt.value)}
                  className={cn(
                    'rounded-full text-xs font-medium px-2.5 py-0.5 cursor-pointer transition-colors border',
                    selectedNature === opt.value
                      ? cn(opt.color, opt.bg, 'ring-1 ring-brand-300')
                      : 'text-text-tertiary bg-bg-secondary/50 border-border/30 hover:text-text-secondary',
                  )}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-c1 text-text-tertiary shrink-0">深度:</span>
            <div className="flex flex-wrap gap-1">
              {COGNITIVE_DEPTH_OPTIONS.map(opt => (
                <button key={opt.value}
                  onClick={() => setSelectedDepth(opt.value)}
                  className={cn(
                    'rounded-full text-xs font-medium px-2.5 py-0.5 cursor-pointer transition-colors border',
                    selectedDepth === opt.value
                      ? cn(opt.color, opt.bg, 'ring-1 ring-brand-300')
                      : 'text-text-tertiary bg-bg-secondary/50 border-border/30 hover:text-text-secondary',
                  )}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <GlassInspirationCard
          onSubmit={handleImmersiveSubmit}
          onClose={dismiss}
          submitting={submitting}
        />
      </ImmersiveCanvas>

      {/* ── 造序仪式演出层 ── */}
      {/* 记录：琥珀金光点坠落至秩序之井 */}
      <FallingEmber ember={ember} onComplete={() => setEmber(null)} />
      {/* 整理：200ms 琥珀金顿悟闪光 */}
      {epiphany && (
        <div
          className="kb-epiphany-flash kb-epiphany-flash--active"
          onAnimationEnd={() => setEpiphany(false)}
        />
      )}
    </motion.div>
  );
}
