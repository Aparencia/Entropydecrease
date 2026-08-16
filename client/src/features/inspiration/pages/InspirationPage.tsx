/**
 * @ai-context: inspiration 功能模块页面：InspirationPage。
 * @ai-context: 从本页拆出的子组件——QuickInput（快速输入）、BatchControls（批量整理
 * 控件）、SubjectFilter（学科筛选）、InspirationOrbList（球群列表）、
 * ImmersiveTagPills（沉浸式标签药丸）、EmptyState（空状态）；本页保留状态编排与
 * 页面级动画容器，交互与行为与拆分前一致。
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui';
import { useInspirationStore, type InspirationTags } from '../store/inspirationStore';
import { useAITagContent } from '@/lib/ai/useAI';
import { useBatchSort } from '../hooks/useBatchSort';
import { useSortPendingReminder } from '../hooks/useSortPendingReminder';
import { useImmersiveState } from '../hooks/useImmersiveState';
import FilterBar from '../components/FilterBar';
import ImmersiveCanvas from '../components/ImmersiveCanvas';
import GlassInspirationCard from '../components/GlassInspirationCard';
import SortPendingBanner from '../components/SortPendingBanner';
import OrderWellBackground from '../components/OrderWellBackground';
import RitualHeader from '../components/RitualHeader';
import FallingEmber, { type EmberEvent } from '../components/FallingEmber';
import QuickInput from '../components/QuickInput';
import BatchControls from '../components/BatchControls';
import SubjectFilter from '../components/SubjectFilter';
import InspirationOrbList from '../components/InspirationOrbList';
import ImmersiveTagPills from '../components/ImmersiveTagPills';
import EmptyState from '../components/EmptyState';
import { useDeviceCapability } from '@/hooks/useDeviceCapability';
import { pageVariants, filterVariants } from '../constants';
import type { FilterState } from '../types';

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function InspirationPage() {
  // P1-5 细粒度订阅：整 store 订阅会在任意灵感变化时重渲染整页
  const items = useInspirationStore((s) => s.items);
  const loadAll = useInspirationStore((s) => s.loadAll);
  const addItem = useInspirationStore((s) => s.addItem);
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
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
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
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r from-cyber to-brand-500 text-text-inverse hover:from-cyber/90 hover:to-brand-600 shadow-sm shadow-cyber/20"
        >
          <Sparkles className="w-3.5 h-3.5" />
          沉浸
        </motion.button>
      </RitualHeader>

      {/* ── Quick input area — 磨砂玻璃 + focus 光效 ── */}
      <QuickInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        submitting={submitting}
        aiLoading={aiLoading}
        textareaRef={textareaRef}
        onKeyDown={handleKeyDown}
      />

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
            {/* ── 批量模式入口 + 操作条 + 进度条 ── */}
            <BatchControls
              batchMode={batchMode}
              onToggleBatchMode={() => setBatchMode(v => !v)}
              selectedCount={selectedIds.size}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
              onBatchSort={handleBatchSort}
              batchProcessing={batchProcessing}
              progress={progress}
              total={total}
            />
            {subjects.length > 0 && (
              <SubjectFilter
                subjects={subjects}
                activeSubject={filters.subject}
                onToggleSubject={(s) => setFilters(f => ({ ...f, subject: f.subject === s ? null : s }))}
                onClearSubject={() => setFilters(f => ({ ...f, subject: null }))}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Inspiration orb groups ── */}
      {filteredItems.length > 0 ? (
        <InspirationOrbList
          items={filteredItems}
          batchMode={batchMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      ) : (
        <EmptyState
          hasActiveFilter={items.length > 0}
          onClearFilters={() => setFilters({ content_nature: null, cognitive_depth: null, subject: null })}
        />
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
        <ImmersiveTagPills
          selectedNature={selectedNature}
          onNatureChange={setSelectedNature}
          selectedDepth={selectedDepth}
          onDepthChange={setSelectedDepth}
        />

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
