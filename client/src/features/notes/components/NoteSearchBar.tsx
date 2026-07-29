import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui';
import { Search, X, Loader2, FileText, Layers, Brain, Lightbulb, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { useNoteStore } from '../store/useNoteStore';
import { useShallow } from 'zustand/react/shallow';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { SearchEntityType } from '@/types/models';

/**
 * 笔记搜索栏组件
 * v0.9.0: 带 300ms 防抖的搜索输入框 + 结果计数 + 关键词高亮辅助
 * v1.2.0: 全局统一搜索，支持实体类型筛选标签 + 结果类型图标
 */

/** 实体类型筛选配置 */
const ENTITY_TYPE_TABS: Array<{
  type: SearchEntityType | 'all';
  label: string;
  icon: React.ReactNode;
}> = [
  { type: 'all', label: '全部', icon: <Search className="w-3 h-3" /> },
  { type: 'note', label: '笔记', icon: <FileText className="w-3 h-3" /> },
  { type: 'flashcard', label: '闪卡', icon: <Layers className="w-3 h-3" /> },
  { type: 'feynman', label: '费曼', icon: <Brain className="w-3 h-3" /> },
  { type: 'inspiration', label: '灵感', icon: <Lightbulb className="w-3 h-3" /> },
  { type: 'classroom', label: '课堂', icon: <GraduationCap className="w-3 h-3" /> },
];

/** 搜索结果类型图标 */
export function EntityTypeIcon({ type, className }: { type: SearchEntityType; className?: string }) {
  const iconMap: Record<SearchEntityType, React.ReactNode> = {
    note: <FileText className={cn('w-3.5 h-3.5', className)} />,
    flashcard: <Layers className={cn('w-3.5 h-3.5', className)} />,
    feynman: <Brain className={cn('w-3.5 h-3.5', className)} />,
    inspiration: <Lightbulb className={cn('w-3.5 h-3.5', className)} />,
    classroom: <GraduationCap className={cn('w-3.5 h-3.5', className)} />,
  };
  return <>{iconMap[type]}</>;
}

/** 实体类型对应的颜色样式 */
const ENTITY_TYPE_COLORS: Record<SearchEntityType, string> = {
  note: 'bg-brand-500/10 text-brand-600 border-brand-300/30',
  flashcard: 'bg-emerald-500/10 text-emerald-600 border-emerald-300/30',
  feynman: 'bg-violet-500/10 text-violet-600 border-violet-300/30',
  inspiration: 'bg-amber-500/10 text-amber-600 border-amber-300/30',
  classroom: 'bg-sky-500/10 text-sky-600 border-sky-300/30',
};

/** 实体类型的中文标签 */
export const ENTITY_TYPE_LABELS: Record<SearchEntityType, string> = {
  note: '笔记',
  flashcard: '闪卡',
  feynman: '费曼',
  inspiration: '灵感',
  classroom: '课堂',
};

export function NoteSearchBar() {
  const {
    searchQuery,
    searchResults,
    searchNotes,
    setSearchQuery,
    selectedEntityTypes,
    setSelectedEntityTypes,
  } = useNoteStore(useShallow(s => ({
    searchQuery: s.searchQuery,
    searchResults: s.searchResults,
    searchNotes: s.searchNotes,
    setSearchQuery: s.setSearchQuery,
    selectedEntityTypes: s.selectedEntityTypes,
    setSelectedEntityTypes: s.setSelectedEntityTypes,
  })));
  const prefersReduced = useReducedMotion();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [isSearching, setIsSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const queryRef = useRef(localQuery);

  // 保持 queryRef 最新
  queryRef.current = localQuery;

  // 防抖搜索：300ms
  const debouncedSearch = useCallback(
    (query: string, entityTypes?: SearchEntityType[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!query.trim()) {
        setSearchQuery('');
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      timerRef.current = setTimeout(async () => {
        await searchNotes(query, { limit: 50, fuzzy: true, entityTypes });
        setIsSearching(false);
      }, 300);
    },
    [searchNotes, setSearchQuery],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalQuery(val);
    debouncedSearch(val, selectedEntityTypes);
  };

  const handleClear = () => {
    setLocalQuery('');
    setSearchQuery('');
    setIsSearching(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleTypeFilter = (type: SearchEntityType | 'all') => {
    const currentType = selectedEntityTypes.length === 0 ? 'all' : selectedEntityTypes[0];
    if (type !== currentType) soundPlayer.play('ui_tab_switch');
    const newTypes = type === 'all' ? [] : [type];
    setSelectedEntityTypes(newTypes);
    // 如果有搜索词，立即用新过滤条件搜索
    if (queryRef.current.trim()) {
      debouncedSearch(queryRef.current, newTypes);
    }
  };

  const resultCount = searchResults.length;
  const showResultBadge = searchQuery.trim().length > 0 && !isSearching;
  const activeType = selectedEntityTypes.length === 0 ? 'all' : selectedEntityTypes[0];

  return (
    <div className="flex flex-col gap-2 flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Input
          placeholder="搜索笔记、闪卡、费曼、灵感、课堂笔记..."
          prefix={<Search className="w-4 h-4" strokeWidth={1.5} />}
          suffix={
            <AnimatePresence>
              {isSearching ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={prefersReduced ? { duration: 0.01 } : undefined}
                >
                  <Loader2 className="w-4 h-4 animate-spin text-text-tertiary" strokeWidth={1.5} />
                </motion.div>
              ) : localQuery ? (
                <motion.button
                  key="clear"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={prefersReduced ? { duration: 0.01 } : { type: 'spring', stiffness: 400, damping: 25 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleClear}
                  className="p-0.5 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/50 transition-all duration-200"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </motion.button>
              ) : null}
            </AnimatePresence>
          }
          size="sm"
          className="flex-1 min-w-0"
          value={localQuery}
          onChange={handleChange}
        />
        <AnimatePresence>
          {showResultBadge && (
            <motion.span
              initial={prefersReduced ? false : { opacity: 0, scale: 0.8, x: -8 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: -8 }}
              transition={prefersReduced ? { duration: 0.01 } : { type: 'spring', stiffness: 400, damping: 28 }}
              className={cn(
                'flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium',
                resultCount > 0
                  ? 'bg-brand-500/10 text-brand-600 border border-brand-300/30'
                  : 'bg-bg-tertiary/40 text-text-tertiary border border-border/30',
              )}
            >
              {resultCount > 0 ? `${resultCount} 条结果` : '无结果'}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* 实体类型筛选标签 */}
      <div className="flex items-center gap-1 flex-wrap">
        {ENTITY_TYPE_TABS.map((tab) => {
          const isActive = activeType === tab.type;
          return (
            <button
              key={tab.type}
              onClick={() => handleTypeFilter(tab.type)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
                'border transition-all duration-200',
                isActive
                  ? 'bg-brand-500/10 text-brand-600 border-brand-300/40'
                  : 'bg-bg-tertiary/20 text-text-tertiary border-border/20 hover:bg-bg-tertiary/40 hover:text-text-secondary',
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 搜索结果类型徽章（可在搜索结果列表中使用）
 */
export function EntityTypeBadge({ type }: { type: SearchEntityType }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[10px] font-medium border',
        ENTITY_TYPE_COLORS[type],
      )}
    >
      <EntityTypeIcon type={type} className="w-2.5 h-2.5" />
      {ENTITY_TYPE_LABELS[type]}
    </span>
  );
}
