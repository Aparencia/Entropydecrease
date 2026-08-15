/**
 * @ai-context: 笔记列表单卡片（非 VirtualList 路径）：3D 鼠标追踪倾斜 + 不对称圆角
 * + 批量勾选指示 + 模板/标签/保质期元信息 + 操作菜单按钮。自 NotesPage.tsx 原样拆出，
 * 视觉与交互完全不变；状态/动作通过 props 注入（原闭包捕获变量全部转为 props）。
 * @ai-context: Single note card for the regular (non-virtualized) list, extracted
 * verbatim from NotesPage.tsx. All closure-captured state/handlers become props.
 */
import { motion } from 'framer-motion';
import { MoreVertical, Pin, ListTodo, CheckSquare, Square } from 'lucide-react';
import { Tag } from '@/components/ui';
import { Tip } from '@/components/ui/Tip';
import { cn } from '@/lib/utils';
// 知识半衰期标记（D12 收敛至 lib/utils/time.ts expiryBadge）
import { formatDate, expiryBadge } from '@/lib/utils/time';
import type { Note } from '@/types/models';
import type { NoteTemplate } from '../components/TemplateSelector';
import {
  cardTilt, asymmetricRadius, colorForType, stripHtml, templateLabels, noteCardVariants,
} from '../lib/noteCardFx';

interface NoteCardItemProps {
  /** 笔记数据 */
  note: Note;
  /** 列表序号（用于卡片间交融渐变过渡） */
  idx: number;
  /** 批量管理模式：勾选指示 / 隐藏操作菜单 / 禁用倾斜追踪 */
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
  /** 打开笔记右键菜单（传入合成事件与笔记） */
  onContextMenu: (e: React.MouseEvent, note: Note) => void;
  /** 点击模板 Tag：切换模板筛选 */
  onToggleTemplate: (template: Note['template']) => void;
  /** 点击标签 Tag：切换标签筛选 */
  onToggleTag: (tag: string) => void;
}

export default function NoteCardItem({
  note,
  idx,
  batchMode,
  batchSelected,
  active,
  selectedTemplate,
  selectedTags,
  onSelect,
  onContextMenu,
  onToggleTemplate,
  onToggleTag,
}: NoteCardItemProps) {
  return (
    <motion.div
      variants={noteCardVariants}
      style={{
        perspective: '1200px',
        transform: `rotate(${cardTilt(note.id)}deg)`,
      }}
      className="relative"
    >
      {/* 卡片间交融渐变过渡 */}
      {idx > 0 && (
        <div className="absolute -top-3 left-4 right-4 h-6 bg-gradient-to-b from-transparent via-brand-50/5 to-transparent dark:via-brand-900/5 pointer-events-none rounded-full blur-sm" />
      )}
      <div
        className={cn(
          'group relative p-4 border border-border/30 bg-bg-elevated/80 backdrop-blur-sm cursor-pointer',
          'h-[140px] overflow-hidden',
          'transition-all duration-300',
          !batchMode && 'hover:shadow-[0_8px_32px_-8px_rgba(91,138,114,0.12),0_0_0_1px_rgba(91,138,114,0.06)] hover:border-brand-300/40',
          batchMode
            ? batchSelected
              ? 'border-brand-400/60 bg-brand-50/20 shadow-[inset_0_0_0_1px_rgba(91,138,114,0.08)]'
              : 'hover:border-brand-300/40'
            : active && 'border-brand-400/60 bg-brand-50/20 shadow-[inset_0_0_0_1px_rgba(91,138,114,0.08)]',
        )}
        onClick={() => onSelect(note.id)}
        onContextMenu={batchMode ? undefined : (e) => onContextMenu(e, note)}
        onMouseMove={batchMode ? undefined : (e) => {
          const el = e.currentTarget;
          const rect = el.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width - 0.5;
          const y = (e.clientY - rect.top) / rect.height - 0.5;
          el.style.setProperty('--tilt-rx', `${-y * 5}deg`);
          el.style.setProperty('--tilt-ry', `${x * 5}deg`);
        }}
        onMouseLeave={batchMode ? undefined : (e) => {
          e.currentTarget.style.setProperty('--tilt-rx', '0deg');
          e.currentTarget.style.setProperty('--tilt-ry', '0deg');
        }}
        style={{
          borderRadius: asymmetricRadius(note.id),
          transform: 'perspective(1200px) rotateX(var(--tilt-rx, 0deg)) rotateY(var(--tilt-ry, 0deg)) translateZ(4px)',
        }}
      >
        {/* 批量模式勾选指示 */}
        {batchMode && (
          <span className="absolute top-2 right-2 z-10">
            {batchSelected
              ? <CheckSquare className="w-5 h-5 text-brand-500" strokeWidth={1.5} />
              : <Square className="w-5 h-5 text-text-tertiary/50" strokeWidth={1.5} />}
          </span>
        )}
        {/* 左侧色条 — 模板色 + 微发光 */}
        <div
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: colorForType(note.template),
            boxShadow: `0 0 10px ${colorForType(note.template)}50`,
          }}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {note.pinned && <Pin className="w-3.5 h-3.5 text-accent-400 flex-shrink-0" strokeWidth={1.5} />}
              {note.template === 'todo' && <ListTodo className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" strokeWidth={1.5} />}
              <h3 className="text-[14px] font-medium text-text-primary truncate">{note.title}</h3>
            </div>
            <p className="text-[13px] text-text-secondary mt-1.5 line-clamp-2 leading-relaxed">
              {stripHtml(note.content)}
            </p>
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <Tag color="note" onClick={(e) => { e.stopPropagation(); onToggleTemplate(note.template); }} active={selectedTemplate === note.template}>{templateLabels[note.template as NoteTemplate]}</Tag>
              {note.tags.map((tag) => (
                <Tag key={tag} color="default" onClick={(e) => { e.stopPropagation(); onToggleTag(tag); }} active={selectedTags.includes(tag)}>{tag}</Tag>
              ))}
              <span className="text-[11px] text-text-tertiary ml-auto font-mono tabular-nums">{formatDate(note.updatedAt)}</span>
                                          {(() => { const eb = expiryBadge(note.expiresAt); return eb ? <span className={`text-[10px] font-mono ${eb.color}`}>{eb.label}</span> : null; })()}
            </div>
          </div>
          {/* 笔记操作菜单触发按钮，带 tooltip（批量模式下隐藏） */}
          {!batchMode && (
          <Tip text="笔记操作">
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              onContextMenu(
                { ...e, clientX: rect.right, clientY: rect.bottom, preventDefault: () => {}, stopPropagation: () => {} } as unknown as React.MouseEvent,
                note,
              );
            }}
            className="p-1 rounded hover:bg-bg-tertiary/50 opacity-0 group-hover:opacity-100 transition-all duration-200 flex-shrink-0"
          >
            <MoreVertical className="w-4 h-4 text-text-secondary" strokeWidth={1.5} />
          </motion.button>
          </Tip>
          )}
        </div>
      </div>
    </motion.div>
  );
}
