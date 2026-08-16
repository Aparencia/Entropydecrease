/**
 * @ai-context: 笔记列表虚拟滚动卡片（>50 篇时 VirtualList 路径）：批量勾选指示 +
 * 模板/标签/保质期元信息。自 NotesPage.tsx 原样拆出，视觉与交互完全不变；
 * 状态/动作通过 props 注入（原闭包捕获变量全部转为 props）。
 * @ai-context: Virtualized-list note card (>50 notes path), extracted verbatim
 * from NotesPage.tsx. All closure-captured state/handlers become props.
 */
import { Pin, ListTodo, CheckSquare, Square } from 'lucide-react';
import { Card, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
// 知识半衰期标记（D12 收敛至 lib/utils/time.ts expiryBadge）
import { formatDate, expiryBadge } from '@/lib/utils/time';
import type { Note } from '@/types/models';
import type { NoteTemplate } from '../components/TemplateSelector';
import { colorForType, stripHtml, templateLabels } from '../lib/noteCardFx';

interface VirtualNoteCardProps {
  /** 笔记数据 */
  note: Note;
  /** 批量管理模式：勾选指示 */
  batchMode: boolean;
  /** 当前卡片是否处于批量选中态 */
  batchSelected: boolean;
  /** 当前卡片是否为选中笔记（selectedNoteId 命中） */
  active: boolean;
  /** 当前模板筛选项（模板 Tag 高亮） */
  selectedTemplate: Note['template'] | null;
  /** 当前标签筛选项（标签 Tag 高亮） */
  selectedTags: string[];
  /** 点击卡片：批量模式下切换选中，否则打开笔记（由父层决定） */
  onSelect: (id: string) => void;
  /** 打开笔记右键菜单 */
  onContextMenu: (e: React.MouseEvent, note: Note) => void;
  /** 点击模板 Tag：切换模板筛选 */
  onToggleTemplate: (template: Note['template']) => void;
  /** 点击标签 Tag：切换标签筛选 */
  onToggleTag: (tag: string) => void;
}

export default function VirtualNoteCard({
  note,
  batchMode,
  batchSelected,
  active,
  selectedTemplate,
  selectedTags,
  onSelect,
  onContextMenu,
  onToggleTemplate,
  onToggleTag,
}: VirtualNoteCardProps) {
  return (
    <Card
      hoverable
      padding="md"
      onClick={() => onSelect(note.id)}
      onContextMenu={batchMode ? undefined : (e) => onContextMenu(e, note)}
      className={cn(
        'group relative transition-all duration-300 mb-2 h-[140px] overflow-hidden',
        !batchMode && 'hover:-translate-y-[2px] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)]',
        batchMode
          ? batchSelected
            ? 'border-brand-400/60 bg-brand-50/20 shadow-[inset_0_0_0_1px_rgba(91,138,114,0.08)]'
            : 'hover:border-brand-300/40'
          : active && 'border-brand-400/60 bg-brand-50/20 shadow-[inset_0_0_0_1px_rgba(91,138,114,0.08)]',
      )}
    >
      {/* 批量模式勾选指示 */}
      {batchMode && (
        <span className="absolute top-2 right-2 z-10">
          {batchSelected
            ? <CheckSquare className="w-5 h-5 text-brand-500" strokeWidth={1.5} />
            : <Square className="w-5 h-5 text-text-tertiary/50" strokeWidth={1.5} />}
        </span>
      )}
      <div
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: colorForType(note.template),
          boxShadow: `0 0 8px ${colorForType(note.template)}40`,
        }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {note.pinned && <Pin className="w-3.5 h-3.5 text-accent-400 flex-shrink-0" strokeWidth={1.5} />}
            {note.template === 'todo' && <ListTodo className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" strokeWidth={1.5} />}
            {note.mood && <span className="text-sm flex-shrink-0">{note.mood}</span>}
            <h3 className="text-[14px] font-medium text-text-primary truncate">{note.title}</h3>
          </div>
          <p className="text-[13px] text-text-secondary mt-1 line-clamp-2 leading-relaxed">{stripHtml(note.content)}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Tag color="note" onClick={(e) => { e.stopPropagation(); onToggleTemplate(note.template); }} active={selectedTemplate === note.template}>{templateLabels[note.template as NoteTemplate]}</Tag>
            {note.tags.map((tag) => (<Tag key={tag} color="default" onClick={(e) => { e.stopPropagation(); onToggleTag(tag); }} active={selectedTags.includes(tag)}>{tag}</Tag>))}
            <span className="text-[11px] text-text-tertiary ml-auto font-mono tabular-nums">{formatDate(note.updatedAt)}</span>
                                    {(() => { const eb = expiryBadge(note.expiresAt); return eb ? <span className={`text-[10px] font-mono ${eb.color}`}>{eb.label}</span> : null; })()}
          </div>
        </div>
      </div>
    </Card>
  );
}
