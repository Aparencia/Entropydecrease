/**
 * NoteInsertDialog — 课堂笔记插入弹窗
 * 分析完成后弹出，让用户选择：追加到已有笔记 / 创建新笔记 / 复制到剪贴板 / 放弃
 */
import { useState, useEffect, useCallback } from 'react';
import {
  FilePlus, FilePen, Clipboard, X, Loader2, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ================================================================
// Props
// ================================================================

export interface CourseNoteItem {
  id: string;
  title: string;
  content?: string;
  updatedAt: string;
}

interface NoteInsertDialogProps {
  /** 待插入的笔记内容（Markdown） */
  content: string;
  /** 课程名称（用于查询已有笔记和生成标题） */
  courseName: string;
  /** 当天同课程的采集序号 */
  sessionSeq: number;
  /** 查询同课程已有笔记 */
  fetchCourseNotes: (courseName: string) => Promise<CourseNoteItem[]>;
  /** 追加到已有笔记 */
  appendToNote: (noteId: string, content: string, sessionLabel: string) => Promise<void>;
  /** 创建新笔记 */
  createCourseNote: (title: string, content: string) => Promise<void>;
  /** 完成回调（成功后关闭弹窗） */
  onDone: (message: string) => void;
  /** 关闭弹窗 */
  onClose: () => void;
}

// ================================================================
// 主组件
// ================================================================

export function NoteInsertDialog({
  content,
  courseName,
  sessionSeq,
  fetchCourseNotes,
  appendToNote,
  createCourseNote,
  onDone,
  onClose,
}: NoteInsertDialogProps) {
  const [existingNotes, setExistingNotes] = useState<CourseNoteItem[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const today = new Date().toLocaleDateString('zh-CN');
  const sessionLabel = `${today} 第${sessionSeq}次采集`;
  const newNoteTitle = courseName
    ? `${courseName} - ${today} 课堂笔记`
    : `${today} 课堂笔记`;

  // 加载同课程已有笔记
  useEffect(() => {
    let cancelled = false;
    setLoadingNotes(true);
    fetchCourseNotes(courseName)
      .then((notes) => {
        if (!cancelled) {
          setExistingNotes(notes);
          if (notes.length > 0) setSelectedNoteId(notes[0].id);
        }
      })
      .finally(() => { if (!cancelled) setLoadingNotes(false); });
    return () => { cancelled = true; };
  }, [courseName, fetchCourseNotes]);

  // 追加到已有笔记
  const handleAppend = useCallback(async () => {
    if (!selectedNoteId || busy) return;
    setBusy(true);
    try {
      await appendToNote(selectedNoteId, content, sessionLabel);
      const note = existingNotes.find((n) => n.id === selectedNoteId);
      onDone(`已追加到「${note?.title ?? '笔记'}」`);
    } catch (err) {
      console.error('[NoteInsertDialog] 追加失败:', err);
      onDone('追加失败，请重试');
    } finally {
      setBusy(false);
    }
  }, [selectedNoteId, busy, appendToNote, content, sessionLabel, existingNotes, onDone]);

  // 创建新笔记
  const handleCreate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const fullContent = `## ${sessionLabel}\n\n${content}`;
      await createCourseNote(newNoteTitle, fullContent);
      onDone(`已创建笔记「${newNoteTitle}」`);
    } catch (err) {
      console.error('[NoteInsertDialog] 创建失败:', err);
      onDone('创建笔记失败，请重试');
    } finally {
      setBusy(false);
    }
  }, [busy, content, sessionLabel, newNoteTitle, createCourseNote, onDone]);

  // 复制到剪贴板
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    onDone('已复制到剪贴板');
  }, [content, onDone]);

  const selectedNote = existingNotes.find((n) => n.id === selectedNoteId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* 弹窗主体 */}
      <div className="relative w-[420px] max-w-[90vw] rounded-kb-xl bg-bg-elevated border border-border/40 shadow-kb-lg overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/20">
          <h3 className="text-b2 font-semibold text-text-primary">保存课堂笔记</h3>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-secondary transition-colors">
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 内容预览摘要 */}
          <div className="px-3 py-2.5 rounded-kb-md bg-bg-secondary/60 border border-border/20 max-h-24 overflow-y-auto">
            <p className="text-b3 text-text-tertiary leading-relaxed line-clamp-3">
              {content.slice(0, 200)}{content.length > 200 ? '...' : ''}
            </p>
          </div>

          {/* 选项 1：追加到已有笔记 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FilePen className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
              <span className="text-b3 font-medium text-text-secondary">追加到已有笔记</span>
            </div>
            {loadingNotes ? (
              <div className="flex items-center gap-2 px-3 py-2 text-b3 text-text-tertiary">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在查找同课程笔记...
              </div>
            ) : existingNotes.length > 0 ? (
              <>
                {/* 下拉选择 */}
                <div className="relative">
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-kb-md text-b3 bg-bg-secondary border border-border/30 text-text-primary hover:border-brand-300 transition-colors"
                  >
                    <span className="truncate">{selectedNote?.title ?? '选择笔记...'}</span>
                    <ChevronDown className={cn('w-4 h-4 text-text-tertiary transition-transform', dropdownOpen && 'rotate-180')} strokeWidth={1.5} />
                  </button>
                  {dropdownOpen && (
                    <div className="absolute z-10 mt-1 w-full max-h-36 overflow-y-auto rounded-kb-md bg-bg-elevated border border-border/40 shadow-kb-md">
                      {existingNotes.map((note) => (
                        <button
                          key={note.id}
                          onClick={() => { setSelectedNoteId(note.id); setDropdownOpen(false); }}
                          className={cn(
                            'w-full text-left px-3 py-2 text-b3 transition-colors',
                            note.id === selectedNoteId ? 'bg-brand-50 text-brand-700' : 'text-text-secondary hover:bg-bg-tertiary',
                          )}
                        >
                          <span className="block truncate">{note.title}</span>
                          <span className="text-[10px] text-text-tertiary">
                            更新于 {new Date(note.updatedAt).toLocaleString('zh-CN')}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-text-tertiary">
                  将在笔记末尾追加「{sessionLabel}」分段
                </p>
                <button
                  onClick={handleAppend}
                  disabled={busy || !selectedNoteId}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-kb-md text-b3 font-medium bg-brand-600 text-white hover:bg-brand-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilePen className="w-3.5 h-3.5" strokeWidth={1.5} />}
                  追加到「{selectedNote?.title ? (selectedNote.title.length > 12 ? selectedNote.title.slice(0, 12) + '...' : selectedNote.title) : '...'}」
                </button>
              </>
            ) : (
              <p className="text-b3 text-text-tertiary px-1">
                {courseName ? `未找到「${courseName}」相关笔记` : '未填写课程名，无法查找已有笔记'}
              </p>
            )}
          </div>

          {/* 分隔线 */}
          <div className="border-t border-border/20" />

          {/* 选项 2：创建新笔记 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FilePlus className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
              <span className="text-b3 font-medium text-text-secondary">创建新笔记</span>
            </div>
            <p className="text-[11px] text-text-tertiary px-1">标题：{newNoteTitle}</p>
            <button
              onClick={handleCreate}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-kb-md text-b3 font-medium bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600/20 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <FilePlus className="w-3.5 h-3.5" strokeWidth={1.5} />
              创建新笔记
            </button>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-border/20" />

          {/* 选项 3：复制到剪贴板 */}
          <button
            onClick={handleCopy}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-kb-md text-b3 font-medium bg-bg-secondary text-text-secondary hover:bg-bg-tertiary active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Clipboard className="w-3.5 h-3.5" strokeWidth={1.5} />
            仅复制到剪贴板
          </button>
        </div>

        {/* 底部：放弃 */}
        <div className="px-5 py-3 border-t border-border/20 bg-bg-secondary/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-kb-md text-b3 font-medium text-text-tertiary hover:text-text-secondary transition-colors"
          >
            放弃
          </button>
        </div>
      </div>
    </div>
  );
}

export default NoteInsertDialog;
