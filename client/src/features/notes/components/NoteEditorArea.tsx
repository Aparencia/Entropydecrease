/**
 * 笔记编辑区（TipTap 正文 / 康奈尔布局 + 合书测试遮罩 + 浮动操作按钮）
 * Note editor area (TipTap body / Cornell layout + closed-book overlay)
 *
 * @ai-context: 从 NoteEditPage 拆出。模板三分支中的第三支：cornell 渲染
 * CornellLayout，其余渲染 TipTap 正文（todo 模板把统计置顶，其余置底），
 * 并叠加反向链接面板与 wiki 链接预览。合书测试遮罩/入口按钮、内容分层入口
 * 也在此。纯展示层：所有状态（closedBook/readingMode/ctxMenu/typography 等）
 * 与保存管线由页面注入，自身不持有业务状态。
 * @ai-context: Extracted from NoteEditPage — the third branch of the template
 * ternary: Cornell renders CornellLayout, others render the TipTap body (todo
 * stats on top, others at bottom) plus backlinks panel and wiki-link preview;
 * closed-book overlay/floating buttons and content-tier entry live here too.
 * Pure presentational: all state (closedBook/readingMode/ctxMenu/typography)
 * and the save pipeline are injected by the page.
 */
import type { Editor } from '@tiptap/react';
import { EditorContent } from '@tiptap/react';
import type { Note } from '@/types/models';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/Tip';
import { EyeOff, Layers } from 'lucide-react';
import { CornellLayout } from './CornellLayout';
import { PredictionPrompt } from './PredictionPrompt';
import { TodoStats } from './TodoStats';
import { BacklinksPanel } from './BacklinksPanel';
import { WikiLinkPreview } from './WikiLinkPreview';
import { ReadingGuide } from '@/components/ReadingGuide';
import { ClosedBookTest } from './ClosedBookTest';

interface NoteEditorAreaProps {
  editor: Editor | null;
  note: Note;
  noteId: string | null;
  isCornell: boolean;
  closedBook: boolean;
  readingMode: boolean;
  /** 阅读模式自适应排版 CSS 变量（undefined 时不应用） */
  typographyVars: React.CSSProperties | undefined;
  /** 选中文本右键菜单接管（无选区时 undefined） */
  onContextMenu: ((e: React.MouseEvent) => void) | undefined;
  editorWrapperRef: React.RefObject<HTMLDivElement>;
  fullContent: string | undefined;
  debouncedSave: (getContent: () => string) => void;
  healthText: string;
  onOpenClosedBook: () => void;
  onCloseClosedBook: () => void;
  onOpenTier: () => void;
}

export function NoteEditorArea({
  editor,
  note,
  noteId,
  isCornell,
  closedBook,
  readingMode,
  typographyVars,
  onContextMenu,
  editorWrapperRef,
  fullContent,
  debouncedSave,
  healthText,
  onOpenClosedBook,
  onCloseClosedBook,
  onOpenTier,
}: NoteEditorAreaProps) {
  return (
    <div className="relative flex-1 min-h-0">
      <div
        data-reading-guide-container
        className="h-full overflow-y-auto px-kb-md py-kb-lg bg-[rgba(255,253,250,0.3)] dark:bg-[rgba(16,24,44,0.5)]"
        style={readingMode ? typographyVars : undefined}
      >
        {/* 阅读模式：引导线叠加（fixed 定位，不占文档流） */}
        {readingMode && <ReadingGuide />}
        <div
          className={cn('max-w-[720px] mx-auto transition-all duration-300', closedBook && 'blur-md select-none pointer-events-none')}
          onContextMenu={closedBook ? undefined : onContextMenu}
        >
          {isCornell ? (
            <CornellLayout
              content={(() => { try { return JSON.parse(fullContent || '{}'); } catch { return {}; } })()}
              onChange={(data) => {
                if (noteId) debouncedSave(() => JSON.stringify(data));
              }}
            />
          ) : (
            <>
              {/* v0.11.0: 待办笔记模板时在编辑器顶部显示进度统计 */}
              {note.template === 'todo' && (
                <div className="mb-4 sticky top-0 z-10 bg-bg-primary/90 backdrop-blur-sm rounded-kb-md">
                  <TodoStats editor={editor} />
                </div>
              )}
              <div ref={editorWrapperRef}>
                <PredictionPrompt noteTitle={note?.title || ''} noteContent={fullContent || ''} noteId={noteId || ''} onDismiss={() => {}} />
                <EditorContent editor={editor} />
              </div>
              {/* 非待办笔记模板时在底部显示统计 */}
              {note.template !== 'todo' && <TodoStats editor={editor} />}
              {/* 阶段二：反向链接面板（无引用时不显示） */}
              <BacklinksPanel noteId={note.id} />
              <WikiLinkPreview editorContainerRef={editorWrapperRef} />
            </>
          )}
        </div>
      </div>
      {/* N2 合书测试：遮罩层/入口按钮（康奈尔布局不适用） */}
      {closedBook ? (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-bg-primary/40">
          <ClosedBookTest
            noteTitle={note.title}
            noteText={healthText}
            onClose={onCloseClosedBook}
          />
        </div>
      ) : !isCornell && (
        <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
          <Tip text="合书测试：隐藏笔记，凭回忆自测" side="left">
            <button
              onClick={onOpenClosedBook}
              className="p-2 rounded-full bg-bg-primary/80 backdrop-blur-sm border border-border/40 text-text-tertiary hover:text-brand-600 hover:border-brand-300 shadow-sm transition-all duration-200"
            >
              <EyeOff className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </Tip>
          {/* N5 内容分层入口：策略性遗忘标记 */}
          <Tip text="内容分层：聚焦核心概念" side="left">
            <button
              onClick={onOpenTier}
              className="p-2 rounded-full bg-bg-primary/80 backdrop-blur-sm border border-border/40 text-text-tertiary hover:text-brand-600 hover:border-brand-300 shadow-sm transition-all duration-200"
            >
              <Layers className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </Tip>
        </div>
      )}
    </div>
  );
}
