/**
 * LiveTranscript — 实时 ASR 转录滚动面板（P1-2：支持内联编辑与已修正标记）
 * 课中逐句显示语音转写结果，供用户确认采集质量；课后可点击编辑修正 ASR 错误。
 *
 * @ai-context: 通用组件：LiveTranscript。P1-2 新增内联编辑功能：双击/点击
 * 编辑图标进入编辑模式，回车保存，ESC 取消。已修正的条目显示"已修正"标记，
 * 原始文本通过 tooltip 可回溯。
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { Mic, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
  /** P1-2：用户修正后的文本（存在时优先显示） */
  editedText?: string;
}

interface LiveTranscriptProps {
  transcripts: TranscriptEntry[];
  isActive: boolean;
  className?: string;
  /** 真流式进行中的 partial 文本（实时行，断句后清空） */
  partialText?: string;
  /** P1-2：编辑回调——用户保存修正文本时调用，回写存储层 */
  onEditTranscript?: (id: string, newText: string) => void;
}

export function LiveTranscript({ transcripts, isActive, className, partialText, onEditTranscript }: LiveTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  /** 当前正在编辑的条目 ID */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** 编辑中的临时文本 */
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 新转录到达时自动滚到底部
  useEffect(() => {
    if (scrollRef.current && transcripts.length > lastCountRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    lastCountRef.current = transcripts.length;
  }, [transcripts.length]);

  // partial 更新时同样滚到底部（实时行始终可见）
  useEffect(() => {
    if (scrollRef.current && partialText) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [partialText]);

  // 进入编辑模式时自动聚焦输入框
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEditing = useCallback((entry: TranscriptEntry) => {
    if (isActive) return; // 采集中不允许编辑（避免干扰实时显示）
    setEditingId(entry.id);
    setEditText(entry.editedText ?? entry.text);
  }, [isActive]);

  const saveEdit = useCallback(() => {
    if (editingId && editText.trim() && onEditTranscript) {
      onEditTranscript(editingId, editText.trim());
    }
    setEditingId(null);
    setEditText('');
  }, [editingId, editText, onEditTranscript]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  if (transcripts.length === 0 && !isActive && !partialText) return null;

  return (
    <div className={cn('flex flex-col border-t border-border/20', className)}>
      {/* 标题栏 */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/10">
        <Mic className={cn('w-3.5 h-3.5', isActive ? 'text-emerald-500' : 'text-text-tertiary')} strokeWidth={1.5} />
        <span className="text-[11px] font-medium text-text-tertiary">实时转录</span>
        {isActive && (
          <span className="ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-emerald-600">监听中</span>
          </span>
        )}
        <span className={cn('text-[10px] text-text-tertiary', isActive && 'ml-2')}>
          {transcripts.length} 句
        </span>
      </div>

      {/* 转录内容滚动区 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1 max-h-40 min-h-[60px]">
        {transcripts.length === 0 && !partialText && (
          <p className="text-[11px] text-text-tertiary text-center py-3 opacity-60">
            {isActive ? '等待语音输入...' : '采集开始后转录将在此显示'}
          </p>
        )}
        {transcripts.map((entry, idx) => {
          const isLatest = idx === transcripts.length - 1;
          const isEditing = editingId === entry.id;
          const displayText = entry.editedText ?? entry.text;
          const isEdited = !!entry.editedText;
          const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          if (isEditing) {
            return (
              <div key={entry.id} className="flex gap-1.5 items-start">
                <span className="text-[10px] text-text-tertiary flex-shrink-0 mt-1 tabular-nums">{time}</span>
                <input
                  ref={inputRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                  className="flex-1 min-w-0 px-2 py-1 rounded-kb-sm border border-cyan-400/50 bg-bg-elevated text-[12px] text-text-primary focus:outline-none"
                />
                <button onClick={saveEdit} className="p-1 rounded-kb-sm text-emerald-600 hover:bg-emerald-500/10" title="保存">
                  <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
                <button onClick={cancelEdit} className="p-1 rounded-kb-sm text-text-tertiary hover:bg-bg-secondary" title="取消">
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            );
          }

          return (
            <div
              key={entry.id}
              className={cn(
                'flex gap-2 text-[12px] leading-relaxed transition-opacity duration-300 group',
                isLatest ? 'text-text-primary opacity-100' : 'text-text-secondary opacity-80',
              )}
            >
              <span className="text-[10px] text-text-tertiary flex-shrink-0 mt-0.5 tabular-nums">{time}</span>
              <span className={cn('flex-1', isLatest && 'font-medium')}>
                {displayText}
                {isEdited && (
                  <span className="ml-1.5 text-[10px] text-amber-500 font-medium" title={`原始: ${entry.text}`}>已修正</span>
                )}
              </span>
              {!isActive && (
                <button
                  onClick={() => startEditing(entry)}
                  className="p-0.5 rounded-kb-sm text-text-quaternary opacity-0 group-hover:opacity-100 hover:text-cyan-500 hover:bg-cyan-500/10 transition-all flex-shrink-0"
                  title="编辑修正"
                >
                  <Pencil className="w-3 h-3" strokeWidth={1.5} />
                </button>
              )}
            </div>
          );
        })}
        {/* 真流式进行中的实时行 */}
        {partialText && (
          <div className="flex gap-2 text-[12px] leading-relaxed text-brand-600">
            <span className="text-[10px] text-brand-400 flex-shrink-0 mt-0.5">▍</span>
            <span className="opacity-90">{partialText}</span>
          </div>
        )}
      </div>
    </div>
  );
}