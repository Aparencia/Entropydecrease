/**
 * @ai-context: 折纸视图网格：OrigamiView 卡片网格（折叠类型由笔记 id hash 确定性分配）。
 * 自 NotesPage.tsx 原样拆出；批量模式/打开/右键菜单动作经 props 注入。
 * @ai-context: Origami-view note grid, extracted verbatim from NotesPage.tsx.
 * Batch mode, open and context-menu actions are injected via props.
 */
import OrigamiView from '@/components/OrigamiView';
import type { Note } from '@/types/models';
import { extractNoteText } from '../lib/extractNoteText';
import { origamiDetails, origamiFoldType } from '../lib/noteCardFx';

interface OrigamiGridProps {
  /** 网格笔记列表 */
  notes: Note[];
  /** 批量管理模式：点击切换选中而非打开 */
  batchMode: boolean;
  /** 点击卡片：批量模式下切换选中，否则打开笔记（由父层决定） */
  onSelect: (id: string) => void;
  /** 打开笔记右键菜单（批量模式下不触发） */
  onContextMenu: (e: React.MouseEvent, note: Note) => void;
}

export default function OrigamiGrid({ notes, batchMode, onSelect, onContextMenu }: OrigamiGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pb-2 items-start">
      {notes.map((note) => {
        const text = extractNoteText(note.content);
        return (
          <div
            key={note.id}
            className="cursor-pointer"
            onClick={() => onSelect(note.id)}
            onContextMenu={batchMode ? undefined : (e) => onContextMenu(e, note)}
          >
            <OrigamiView
              title={note.title || '无标题'}
              summary={text.slice(0, 100)}
              details={origamiDetails(note.content)}
              foldType={origamiFoldType(note.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
