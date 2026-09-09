/**
 * ModelCardDialogSlot — 笔记模型卡对话框的条件渲染槽（批 8 REQ-317 拆件）。
 *
 * @ai-context: NotesPage ≤600 压线（TD-2026-09-06-G 拆件义务延续）——原内联
 *              条件块 + ModelCardFromNoteDialog 渲染移入本槽；对话框开合态与
 *              预填 excerpt 仍由 useNoteSelectionActions 持有（NotesPage 消费），
 *              槽只做「dialog 非空 + note 在场 → 渲染对话框」的接线，不引入
 *              第二份状态。
 */
import type { Note } from "../../types";
import ModelCardFromNoteDialog from "../ModelCardFromNoteDialog";

interface Props {
  note: Note;
  /** 开合态（null=关闭；excerpt=选区预填草稿，header 入口为空串） */
  dialog: { excerpt: string } | null;
  onClose: () => void;
  onCreated: () => void;
}

export default function ModelCardDialogSlot({ note, dialog, onClose, onCreated }: Props) {
  if (!dialog) return null;
  return (
    <ModelCardFromNoteDialog
      key={`mc-${note.id}`}
      noteId={note.id}
      noteTitle={note.title}
      initialExcerpt={dialog.excerpt}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}
