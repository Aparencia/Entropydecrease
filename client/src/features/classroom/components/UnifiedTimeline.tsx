/**
 * UnifiedTimeline — smart 路径统一内容时间线
 * 时间轴事件（关键帧/语音/书签/自动锚点）与实时转写文本按时间戳合并为
 * 一条内容流，替代原先"时间轴面板 + 独立转录列表"的分离展示。
 *
 * @ai-context: 转写行保留课后内联编辑与说话人标注；新条目/实时 partial
 * 到达自动滚到底部；仅 smart 路径使用。
 * @ai-context EN: Unified timeline merging timeline events and transcript
 * rows sorted by timestamp; edits stay available after the session ends.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { BrainCircuit, Camera, Mic, Volume2, Minus, Anchor, Star, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
// 毫秒时间戳 → MM:SS（相对会话起始时间，D12 收敛至 lib/utils/time）
import { formatSessionElapsed as formatRelativeTime } from '@/lib/utils/time';
import type { SessionBundle, TimelineEntry, KeyFrame } from '@/lib/capture';
import { RecentKeyframesStrip } from './RecentKeyframesStrip';

/** 转写条目（含 P1-2 用户修正文本，存在时优先显示） */
export interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
  /** P1-2：用户修正后的文本（存在时优先显示） */
  editedText?: string;
  /** P0-3：转写置信度（估算口径，<0.55 时 UI 弱化标记） */
  confidence?: number;
  /** P1-4：手动标注的说话人（飞书式重新识别；无/说话人A/说话人B） */
  speaker?: string;
}

interface UnifiedTimelineProps {
  bundle: Partial<SessionBundle>;
  liveTranscripts: TranscriptEntry[];
  /** M2 自动锚点（独立数据源：useClassroomCapture.handleAutoAnchor） */
  autoAnchors?: { timestamp: number; label?: string }[];
  /** 真流式进行中的 partial 文本（实时行，断句后清空） */
  partialText?: string;
  /** 采集中（禁止编辑转写，避免干扰实时显示） */
  isActive: boolean;
  /** P1-2：编辑回调——保存修正文本时调用 */
  onEditTranscript?: (id: string, newText: string) => void;
  /** P1-4：说话人循环标注回调（无 → 说话人A → 说话人B → 无） */
  onCycleSpeaker?: (id: string) => void;
}

/** 事件类型 → 图标/文案/配色 */
function getEntryMeta(type: TimelineEntry['type']): {
  Icon: typeof Camera;
  label: string;
  color: string;
} {
  switch (type) {
    case 'keyframe':
      return { Icon: Camera, label: '关键帧', color: 'text-accent-600 bg-accent-500/10' };
    case 'voice_start':
      return { Icon: Mic, label: '语音开始', color: 'text-emerald-600 bg-emerald-500/10' };
    case 'voice_end':
      return { Icon: Volume2, label: '语音结束', color: 'text-emerald-500/60 bg-emerald-500/5' };
    case 'silence':
      return { Icon: Minus, label: '静默', color: 'text-text-tertiary bg-bg-tertiary/50' };
    case 'bookmark':
      return { Icon: Star, label: '重点标记', color: 'text-amber-600 bg-amber-500/10' };
    case 'auto_anchor':
      return { Icon: Anchor, label: '自动锚点', color: 'text-brand-600 bg-brand-500/10' };
    default:
      return { Icon: Minus, label: type, color: 'text-text-tertiary bg-bg-tertiary/50' };
  }
}

/** 统一行：时间轴事件或转写文本 */
type Row =
  | { kind: 'event'; ts: number; entry: TimelineEntry }
  | { kind: 'text'; ts: number; text: TranscriptEntry }
  | { kind: 'anchor'; ts: number; label?: string };

export function UnifiedTimeline({ bundle, liveTranscripts, autoAnchors = [], partialText, isActive, onEditTranscript, onCycleSpeaker }: UnifiedTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const timeline = bundle.timeline ?? [];
  const keyframes = bundle.keyframes ?? [];
  const audioSegments = bundle.audioSegments ?? [];
  const sessionStartMs = timeline[0]?.timestamp ?? Date.now();

  // 事件 + 锚点 + 转写按时间戳合并排序
  const rows: Row[] = [
    ...timeline.map((entry) => ({ kind: 'event' as const, ts: entry.timestamp, entry })),
    ...autoAnchors.map((a) => ({ kind: 'anchor' as const, ts: a.timestamp, label: a.label })),
    ...liveTranscripts.map((text) => ({ kind: 'text' as const, ts: text.timestamp, text })),
  ].sort((a, b) => a.ts - b.ts);

  // 新条目到达时自动滚到底部（编辑状态变化不触发）
  useEffect(() => {
    if (scrollRef.current && rows.length > lastCountRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    lastCountRef.current = rows.length;
  }, [rows.length]);

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

  const estimatedMinutes = Math.ceil((keyframes.length * 2 + audioSegments.length * 1.5) / 60);

  const renderRow = (row: Row, idx: number) => {
    // ── 自动锚点行（M2：每 15 分钟，独立数据源） ──
    if (row.kind === 'anchor') {
      const timeStr = formatRelativeTime(row.ts, sessionStartMs);
      return (
        <div key={`anchor-${row.ts}`} className="flex items-start gap-2.5 p-2 rounded-kb-sm transition-colors hover:bg-bg-tertiary/40">
          <span className="text-[10px] text-text-tertiary font-mono tabular-nums pt-0.5 w-10 flex-shrink-0">{timeStr}</span>
          <span className="flex-shrink-0 w-5 h-5 rounded-kb-xs flex items-center justify-center text-brand-600 bg-brand-500/10">
            <Anchor className="w-3 h-3" strokeWidth={1.5} />
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-b3 text-text-secondary">自动锚点</span>
            {row.label && <p className="mt-0.5 text-[11px] text-text-secondary leading-relaxed">{row.label}</p>}
          </div>
        </div>
      );
    }

    // ── 转写文本行 ──
    if (row.kind === 'text') {
      const t = row.text;
      const isEditing = editingId === t.id;
      const displayText = t.editedText ?? t.text;
      const isEdited = !!t.editedText;
      // P0-3 低置信度标记：置信度 <0.55 的转写弱化显示并加角标（估算口径，
      // 非统计置信度；未携带置信度的旧数据视为 1）
      const isLowConfidence = typeof t.confidence === 'number' && t.confidence < 0.55;
      const time = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      if (isEditing) {
        return (
          <div key={t.id} className="flex gap-1.5 items-start p-2">
            <span className="text-[10px] text-text-tertiary flex-shrink-0 mt-1 tabular-nums">{time}</span>
            <input
              ref={inputRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
              className="flex-1 min-w-0 px-2 py-1 rounded-kb-sm border border-cyber/50 bg-bg-elevated text-[12px] text-text-primary focus:outline-none"
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
        <div key={t.id} className="flex gap-2 p-2 rounded-kb-sm transition-colors hover:bg-bg-tertiary/30 group">
          <span className="text-[10px] text-text-tertiary flex-shrink-0 mt-0.5 tabular-nums">{time}</span>
          <Mic className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-emerald-500/70" strokeWidth={1.5} />
          {/* P1-4 说话人标注（飞书式手动重新识别；课后点击循环标注） */}
          {!isActive && onCycleSpeaker && (
            <button
              onClick={() => onCycleSpeaker(t.id)}
              className={cn(
                'flex-shrink-0 px-1.5 py-0.5 mt-0.5 rounded-kb-sm text-[10px] font-medium border transition-all',
                t.speaker
                  ? 'border-cyber/40 text-cyber bg-cyber/5'
                  : 'border-border/30 text-text-quaternary opacity-0 group-hover:opacity-100 hover:text-cyber hover:border-cyber/40',
              )}
              title={t.speaker ? `说话人: ${t.speaker}（点击切换）` : '标注说话人'}
            >
              {t.speaker ? t.speaker : '标人'}
            </button>
          )}
          <span className={cn('flex-1 text-[12px] leading-relaxed min-w-0', idx === rows.length - 1 ? 'text-text-primary font-medium' : 'text-text-secondary', isLowConfidence && 'opacity-60')}>
            {displayText}
            {isLowConfidence && (
              <span className="ml-1.5 text-[10px] text-text-quaternary font-medium" title={`置信度 ${(t.confidence ?? 0).toFixed(2)}，识别可能不准确`}>低置信</span>
            )}
            {isEdited && (
              <span className="ml-1.5 text-[10px] text-amber-500 font-medium" title={`原始: ${t.text}`}>已修正</span>
            )}
          </span>
          {!isActive && (
            <button
              onClick={() => startEditing(t)}
              className="p-0.5 rounded-kb-sm text-text-quaternary opacity-0 group-hover:opacity-100 hover:text-cyber hover:bg-cyber/10 transition-all flex-shrink-0"
              title="编辑修正"
            >
              <Pencil className="w-3 h-3" strokeWidth={1.5} />
            </button>
          )}
        </div>
      );
    }

    // ── 时间轴事件行 ──
    const { Icon, label, color } = getEntryMeta(row.entry.type);
    const timeStr = formatRelativeTime(row.ts, sessionStartMs);
    const matchedFrame = row.entry.type === 'keyframe' && row.entry.refId
      ? keyframes.find((kf: KeyFrame) => kf.id === row.entry.refId)
      : null;

    return (
      <div key={`${row.entry.type}-${row.ts}-${idx}`} className="flex items-start gap-2.5 p-2 rounded-kb-sm transition-colors hover:bg-bg-tertiary/40">
        <span className="text-[10px] text-text-tertiary font-mono tabular-nums pt-0.5 w-10 flex-shrink-0">{timeStr}</span>
        <span className={cn('flex-shrink-0 w-5 h-5 rounded-kb-xs flex items-center justify-center', color)}>
          <Icon className="w-3 h-3" strokeWidth={1.5} />
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-b3 text-text-secondary">{label}</span>
          {row.entry.energy !== undefined && row.entry.energy > 0 && (
            <span className="ml-1.5 text-[10px] text-text-tertiary">能量 {row.entry.energy.toFixed(2)}</span>
          )}
          {row.entry.label && (
            <p className="mt-0.5 text-[11px] text-text-secondary leading-relaxed">{row.entry.label}</p>
          )}
        </div>
        {matchedFrame?.imageBase64 && (
          <img src={matchedFrame.imageBase64} alt="关键帧缩略图"
            className="w-12 h-7 rounded-kb-xs object-cover flex-shrink-0 border border-border/30" />
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 头部状态栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
        <div className="flex items-center gap-1.5">
          <BrainCircuit className="w-3.5 h-3.5 text-brand-500" strokeWidth={1.5} />
          <span className="text-b3 font-medium text-text-tertiary">智能采集</span>
        </div>
        {isActive && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-kb-full bg-semantic-error animate-pulse" />
            <span className="text-[10px] text-semantic-error font-medium">采集中</span>
          </div>
        )}
        <span className="text-[10px] text-text-tertiary">
          {keyframes.length} 帧 · {audioSegments.length} 段 · {liveTranscripts.length} 句
        </span>
      </div>

      {/* 统一内容流（事件 + 转写按时间合并，滚动） */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5">
        {rows.length === 0 && !partialText && (
          <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
            <BrainCircuit className="w-8 h-8 mb-2 opacity-30" strokeWidth={1} />
            <p className="text-b3">
              {isActive
                ? '智能采集已启动，等待关键帧和语音事件...'
                : '选择智能模式后开始采集'}
            </p>
          </div>
        )}
        {rows.map((row, idx) => renderRow(row, idx))}
        {/* 真流式进行中的实时行 */}
        {partialText && (
          <div className="flex gap-2 p-2 text-[12px] leading-relaxed text-brand-600">
            <span className="text-[10px] text-brand-400 flex-shrink-0 mt-0.5">▍</span>
            <span className="opacity-90">{partialText}</span>
          </div>
        )}
      </div>

      {/* P1-9 实时截图流：最近 6 帧缩略横条（识别过程可见性） */}
      <RecentKeyframesStrip keyframes={keyframes} />

      {/* 底部统计栏 */}
      <div className={cn(
        'px-3 py-2 border-t border-border/20 flex items-center justify-between text-[10px]',
        'text-text-tertiary bg-bg-secondary/50',
      )}>
        <span>
          已采集: <strong className="text-text-secondary">{keyframes.length}</strong> 帧{' '}
          <strong className="text-text-secondary">{audioSegments.length}</strong> 段
        </span>
        <span>
          预计分析:{' '}
          <strong className="text-text-secondary">
            ~{estimatedMinutes > 0 ? estimatedMinutes : '< 1'}分钟
          </strong>
        </span>
      </div>
    </div>
  );
}

export default UnifiedTimeline;
