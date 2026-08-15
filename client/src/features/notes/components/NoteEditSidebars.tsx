/**
 * 笔记编辑页右侧/浮层面板集合（锚点侧边栏 / 回声定位 / 卡壳救援）
 * Note editor side panels (anchor sidebar / echo capture / stuck rescue)
 *
 * @ai-context: 从 NoteEditPage 拆出。纯展示组合层：锚点侧边栏展示条件
 * （锚点/冲突/正文达推荐阈值）迁入此组件；回声定位侧边栏的文本插入逻辑
 * （末尾拼接 HTML 段落）与卡壳救援面板的上下文注入随之迁入。开关状态
 * （captureOpen/rescueOpen）与导航动作由页面注入。
 * @ai-context: Extracted from NoteEditPage. Pure presentational composition:
 * the anchor-sidebar show condition (anchors/conflicts/body reaching the
 * recommend threshold) lives here; the echo-capture insert-text logic (append
 * HTML paragraphs at doc end) and rescue-panel context injection moved in too.
 * Toggles (captureOpen/rescueOpen) and navigation actions come from the page.
 */
import type { Editor } from '@tiptap/react';
import type { ConceptConflict } from '@/lib/ai/types';
import { RescuePanel } from '@/components/RescuePanel';
import { CaptureSidebar } from './CaptureSidebar';
import { AnchorPointSidebar } from './AnchorPoint';
import { FEYNMAN_RECOMMEND_MIN_CONTENT } from './FeynmanRecommendSidebar';

interface NoteEditSidebarsProps {
  noteId: string | null;
  noteTitle: string;
  anchorPoints: Array<{ id: string; concept: string; explanation?: string; createdAt: string; importance?: number }>;
  conflicts: ConceptConflict[];
  onDismissConflicts: () => void;
  healthText: string;
  captureOpen: boolean;
  editor: Editor | null;
  rescueOpen: boolean;
  onCloseRescue: () => void;
  onSuggestion: (action: string) => void;
}

export function NoteEditSidebars({
  noteId,
  noteTitle,
  anchorPoints,
  conflicts,
  onDismissConflicts,
  healthText,
  captureOpen,
  editor,
  rescueOpen,
  onCloseRescue,
  onSuggestion,
}: NoteEditSidebarsProps) {
  return (
    <>
      {/* AI 记忆锚点侧边栏 — 活跃编辑 12 分钟后自动生成；N6 冲突卡、N4 费曼推荐也在此展示 */}
      {/* N4: 正文达推荐阈值时提前显示侧边栏（含费曼引导卡），锚点仍按 12 分钟节奏生成 */}
      {(anchorPoints.length > 0 || conflicts.length > 0 || healthText.trim().length >= FEYNMAN_RECOMMEND_MIN_CONTENT) && noteId && (
        <AnchorPointSidebar
          noteId={noteId}
          anchorPoints={anchorPoints}
          conflicts={conflicts}
          onDismissConflicts={onDismissConflicts}
          noteContent={healthText}
          noteTitle={noteTitle}
        />
      )}

      {/* 回声定位侧边栏 */}
      {captureOpen && (
        <CaptureSidebar
          onInsertText={(text) => {
            if (!editor) return;
            const htmlContent = text.split('\n').map((line) => `<p>${line || '<br>'}</p>`).join('');
            const docSize = editor.state.doc.content.size;
            editor.chain().focus().insertContentAt(docSize, htmlContent).run();
          }}
        />
      )}

      {/* 卡壳救援面板 */}
      <RescuePanel
        isOpen={rescueOpen}
        onClose={onCloseRescue}
        context={{
          topic: noteTitle || '笔记',
          relatedContent: editor?.getText().slice(0, 500),
          mode: 'note',
        }}
        onSuggestion={onSuggestion}
      />
    </>
  );
}
