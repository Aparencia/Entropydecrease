/**
 * 笔记标签编辑器（顶栏下方一行）
 *
 * @ai-context: 补齐 addTag/removeTag 的 UI 入口：标签 chips 可点击 × 删除，
 * 输入框回车添加。细粒度 selector 订阅 store，避免编辑键入触发整页重渲染。
 * @ai-context: Tag chips editor under the note header; Enter to add, click × to
 * remove. Uses fine-grained selectors to avoid re-rendering on typing.
 */
import { useState, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { useNoteStore } from '../store/useNoteStore';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

interface NoteTagsEditorProps {
  noteId: string;
  tags: string[];
}

export function NoteTagsEditor({ noteId, tags }: NoteTagsEditorProps) {
  const addTag = useNoteStore((s) => s.addTag);
  const removeTag = useNoteStore((s) => s.removeTag);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(async () => {
    const tag = input.trim();
    if (!tag) { setInput(''); return; }
    if (!tags.includes(tag)) {
      await addTag(noteId, tag);
      soundPlayer.play('ui_click');
    }
    setInput('');
  }, [input, tags, noteId, addTag]);

  const handleRemove = useCallback(async (tag: string) => {
    await removeTag(noteId, tag);
    soundPlayer.play('feedback_delete');
  }, [noteId, removeTag]);

  return (
    <div className="flex items-center gap-1.5 flex-wrap px-kb-md py-2 border-b border-border/30 flex-shrink-0">
      {tags.length === 0 && (
        <span className="text-b3 text-text-tertiary">添加标签，便于检索与筛选</span>
      )}
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-kb-full text-[11px] font-medium bg-brand-50 text-brand-700 border border-brand-200/40"
        >
          {tag}
          <button
            onClick={() => handleRemove(tag)}
            className="hover:text-semantic-error transition-colors"
            aria-label={`删除标签 ${tag}`}
          >
            <X className="w-3 h-3" strokeWidth={2} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
          if (e.key === 'Escape') setInput('');
        }}
        placeholder="+ 添加标签"
        className="w-28 bg-transparent text-[11px] outline-none placeholder:text-text-tertiary/60 text-text-secondary border-b border-transparent focus:border-brand-300 transition-colors"
      />
    </div>
  );
}
