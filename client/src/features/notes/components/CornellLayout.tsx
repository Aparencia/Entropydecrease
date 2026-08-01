/**
 * @ai-context: 通用组件：CornellLayout。
 */
import { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { ArrowLeftRight } from 'lucide-react';
import type { JSONContent } from '@tiptap/core';

interface CornellContent {
  cues?: JSONContent;
  notes?: JSONContent;
  summary?: JSONContent;
}

interface CornellLayoutProps {
  content: CornellContent;
  onChange: (data: CornellContent) => void;
}

const STORAGE_KEY = 'kb_cornell_cue_position';

function useCornellEditor(
  initialContent: JSONContent | undefined,
  placeholder: string,
  onChange: (json: JSONContent) => void,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent,
    // TipTap v3 需显式声明 tiptap 类以启用 index.css 的 .tiptap 样式
    editorProps: { attributes: { class: 'tiptap' } },
    onUpdate: ({ editor: e }) => {
      onChangeRef.current(e.getJSON());
    },
  });

  // Sync external content changes (e.g. initial load)
  useEffect(() => {
    if (!editor || !initialContent) return;
    const currentJSON = editor.getJSON();
    // Only update if content is actually different
    if (JSON.stringify(currentJSON) !== JSON.stringify(initialContent)) {
      editor.commands.setContent(initialContent);
    }
  // Only react to external content changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, JSON.stringify(initialContent)]);

  // 确保编辑器在组件卸载时正确销毁
  useEffect(() => {
    return () => {
      if (editor) {
        editor.destroy();
      }
    };
  }, [editor]);

  return editor;
}

export function CornellLayout({ content, onChange }: CornellLayoutProps) {
  const [cuePosition, setCuePosition] = useState<'left' | 'right'>(() => {
    return (localStorage.getItem(STORAGE_KEY) as 'left' | 'right') || 'left';
  });

  const latestDataRef = useRef<CornellContent>({
    cues: content.cues,
    notes: content.notes,
    summary: content.summary,
  });

  const triggerChange = (field: keyof CornellContent, data: JSONContent) => {
    latestDataRef.current = { ...latestDataRef.current, [field]: data };
    onChange(latestDataRef.current);
  };

  const cuesEditor = useCornellEditor(
    content.cues,
    '关键词 / 问题...',
    (json) => triggerChange('cues', json),
  );
  const notesEditor = useCornellEditor(
    content.notes,
    '主要内容记录...',
    (json) => triggerChange('notes', json),
  );
  const summaryEditor = useCornellEditor(
    content.summary,
    '归纳总结...',
    (json) => triggerChange('summary', json),
  );

  const toggleCuePosition = () => {
    const newPos = cuePosition === 'left' ? 'right' : 'left';
    setCuePosition(newPos);
    localStorage.setItem(STORAGE_KEY, newPos);
  };

  const cueCol = (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 flex-shrink-0">
        <h3 className="text-b3 font-semibold text-brand-600 uppercase tracking-wider">线索栏</h3>
        <button
          onClick={toggleCuePosition}
          title={`切换到${cuePosition === 'left' ? '右' : '左'}侧`}
          className="p-1 rounded-kb-sm text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <EditorContent editor={cuesEditor} />
      </div>
    </div>
  );

  const notesCol = (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center px-3 py-2 border-b border-border/40 flex-shrink-0">
        <h3 className="text-b3 font-semibold text-brand-600 uppercase tracking-wider">笔记栏</h3>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <EditorContent editor={notesEditor} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full gap-kb-sm">
      {/* 主区域：线索栏 + 笔记栏 */}
      <div
        className="grid flex-1 min-h-0 border border-border/40 rounded-kb-lg overflow-hidden bg-bg-elevated"
        style={{
          gridTemplateColumns: cuePosition === 'left' ? '30% 70%' : '70% 30%',
        }}
      >
        {cuePosition === 'left' ? (
          <>
            <div className="border-r border-border/40">{cueCol}</div>
            {notesCol}
          </>
        ) : (
          <>
            {notesCol}
            <div className="border-l border-border/40">{cueCol}</div>
          </>
        )}
      </div>

      {/* 底部：总结栏 */}
      <div className="border border-border/40 rounded-kb-lg bg-bg-elevated" style={{ minHeight: '140px' }}>
        <div className="flex items-center px-3 py-2 border-b border-border/40">
          <h3 className="text-b3 font-semibold text-brand-600 uppercase tracking-wider">总结栏</h3>
        </div>
        <div className="px-2 py-2">
          <EditorContent editor={summaryEditor} />
        </div>
      </div>
    </div>
  );
}
