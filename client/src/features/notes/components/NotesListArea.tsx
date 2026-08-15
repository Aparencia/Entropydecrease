/**
 * @ai-context: 笔记列表区域：折纸视图网格 / 空状态 / 虚拟滚动列表（>50 篇）/ 常规动效列表。
 * 自 NotesPage.tsx 原样拆出；批量状态、选中、筛选与动作全部经 props 注入。
 * @ai-context: Notes list area (origami grid / empty state / virtualized list /
 * regular list) extracted verbatim from NotesPage.tsx. All state/actions are props.
 */
import { motion } from 'framer-motion';
import { VirtualList } from '@/components/ui/VirtualList';
import type { Note } from '@/types/models';
import { listVariants } from '../lib/noteCardFx';
import OrigamiGrid from './OrigamiGrid';
import NotesEmptyState from './NotesEmptyState';
import NoteCardItem from './NoteCardItem';
import VirtualNoteCard from './VirtualNoteCard';

interface NotesListAreaProps {
  /** 过滤后的笔记列表 */
  notes: Note[];
  /** 折纸视图开关 */
  origamiMode: boolean;
  /** 批量管理模式 */
  batchMode: boolean;
  /** 批量选中 id 集合 */
  batchSelectedIds: ReadonlySet<string>;
  /** 当前选中笔记 id */
  selectedNoteId: string | null;
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
  /** 打开模板选择器（空状态 CTA） */
  onCreate: () => void;
}

export default function NotesListArea({
  notes,
  origamiMode,
  batchMode,
  batchSelectedIds,
  selectedNoteId,
  selectedTemplate,
  selectedTags,
  onSelect,
  onContextMenu,
  onToggleTemplate,
  onToggleTag,
  onCreate,
}: NotesListAreaProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden px-4 py-3">
      <div className="flex-1 overflow-y-auto min-h-0">
      {origamiMode && notes.length > 0 ? (
        /* ── 折纸视图：OrigamiView 网格（折叠类型由笔记 id hash 确定性分配） ── */
        <OrigamiGrid
          notes={notes}
          batchMode={batchMode}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
        />
      ) : (
      <>
      {notes.length === 0 ? (
        <NotesEmptyState onCreate={onCreate} />
      ) : notes.length > 50 ? (
        <VirtualList
          items={notes}
          estimateSize={140}
          overscan={6}
          className="overflow-y-auto"
          height="100%"
          getKey={(note) => note.id!}
          renderItem={(note) => (
            <VirtualNoteCard
              note={note}
              batchMode={batchMode}
              batchSelected={batchSelectedIds.has(note.id!)}
              active={selectedNoteId === note.id}
              selectedTemplate={selectedTemplate}
              selectedTags={selectedTags}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onToggleTemplate={onToggleTemplate}
              onToggleTag={onToggleTag}
            />
          )}
        />
      ) : (
        <motion.div variants={listVariants} initial="hidden" animate="visible" className="space-y-1">
          {notes.map((note, idx) => (
            <NoteCardItem
              key={note.id}
              note={note}
              idx={idx}
              batchMode={batchMode}
              batchSelected={batchSelectedIds.has(note.id!)}
              active={selectedNoteId === note.id}
              selectedTemplate={selectedTemplate}
              selectedTags={selectedTags}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onToggleTemplate={onToggleTemplate}
              onToggleTag={onToggleTag}
            />
          ))}
        </motion.div>
      )}
      </>
      )}
      </div>
    </div>
  );
}
