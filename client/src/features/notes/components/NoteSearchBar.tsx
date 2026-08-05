/**
 * 笔记搜索栏
 *
 * @ai-context: 内测反馈重构：全局搜索（跨模块搜内容）已独立至 Ctrl+K 命令面板，
 * 笔记页搜索框收窄为「笔记内部筛选」——关键词即时过滤笔记列表（本地内存过滤，
 * getFilteredNotes 同步生效）+ 模板筛选 tabs（与卡片模板 Tag 共用 selectedTemplate
 * 状态，双向联动，再点取消，可逆）。
 */
import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { useNoteStore } from '../store/useNoteStore';
import { useShallow } from 'zustand/react/shallow';
import { Input } from '@/components/ui/Input';
import type { NoteTemplate } from '../components/TemplateSelector';

/** 模板筛选 tabs（与卡片模板 Tag 共用 selectedTemplate 状态） */
const TEMPLATE_TABS: Array<{ type: NoteTemplate | 'all'; label: string }> = [
  { type: 'all', label: '全部' },
  { type: 'outline', label: '大纲式' },
  { type: 'cornell', label: '康奈尔' },
  { type: 'mindmap', label: '思维导图' },
  { type: 'free', label: '自由笔记' },
  { type: 'blank', label: '空白' },
  { type: 'qa', label: '问答' },
  { type: 'video', label: '视频笔记' },
  { type: 'todo', label: '待办' },
];

export function NoteSearchBar() {
  const {
    searchQuery,
    setSearchQuery,
    selectedTemplate,
    toggleTemplate,
  } = useNoteStore(useShallow((s) => ({
    searchQuery: s.searchQuery,
    setSearchQuery: s.setSearchQuery,
    selectedTemplate: s.selectedTemplate,
    toggleTemplate: s.toggleTemplate,
  })));
  const [localQuery, setLocalQuery] = useState(searchQuery);

  // 外部 searchQuery 变化时同步（如命令面板全局搜索切换后返回）
  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalQuery(val);
    // 本地即时过滤：getFilteredNotes 按 searchQuery 过滤笔记列表（无索引延迟）
    setSearchQuery(val);
  };

  const handleClear = () => {
    setLocalQuery('');
    setSearchQuery('');
  };

  const handleTemplateFilter = (type: NoteTemplate | 'all') => {
    // 「全部」点击清除筛选；模板点击切换（再点取消，可逆）
    if (type === 'all') {
      if (selectedTemplate) {
        soundPlayer.play('ui_tab_switch');
        toggleTemplate(selectedTemplate);
      }
    } else {
      if (selectedTemplate !== type) soundPlayer.play('ui_tab_switch');
      toggleTemplate(type);
    }
  };

  return (
    <div className="flex flex-col gap-2 flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Input
          placeholder="搜索笔记…"
          prefix={<Search className="w-4 h-4" strokeWidth={1.5} />}
          suffix={
            localQuery ? (
              <button
                onClick={handleClear}
                className="p-0.5 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/50 transition-all duration-200"
                aria-label="清除搜索"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            ) : null
          }
          size="sm"
          className="flex-1 min-w-0"
          value={localQuery}
          onChange={handleChange}
        />
      </div>

      {/* 模板筛选 tabs：笔记内部维度，与卡片模板 Tag 联动 */}
      <div className="flex items-center gap-1 flex-wrap">
        {TEMPLATE_TABS.map((tab) => {
          const isActive = tab.type === 'all' ? !selectedTemplate : selectedTemplate === tab.type;
          return (
            <button
              key={tab.type}
              onClick={() => handleTemplateFilter(tab.type)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
                'border transition-all duration-200',
                isActive
                  ? 'bg-brand-500/10 text-brand-600 border-brand-300/40'
                  : 'bg-bg-tertiary/20 text-text-tertiary border-border/20 hover:bg-bg-tertiary/40 hover:text-text-secondary',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
