/**
 * 智能模式时间轴面板
 * 实时展示 Path B 智能采集过程中的关键帧和语音段事件流
 *
 * @ai-context: 通用组件：SmartCapturePanel。
 */

import { useEffect, useRef } from 'react';
import { Camera, Mic, Volume2, Minus, BrainCircuit } from 'lucide-react';
import { cn } from '@/lib/utils';
// MM:SS 会话定位（D12 收敛至 lib/utils/time，与 UnifiedTimeline 共用）
import { formatSessionElapsed as formatRelativeTime } from '@/lib/utils/time';
import type {
  SessionBundle,
  TimelineEntry,
  KeyFrame,
} from '@/lib/capture/captureTypes';

// ================================================================
// Props
// ================================================================

interface SmartCapturePanelProps {
  bundle: Partial<SessionBundle>;
  isRecording: boolean;
}

// ================================================================
// 辅助函数
// ================================================================

/** 根据 timeline entry type 选择图标和颜色 */
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
    default:
      return { Icon: Minus, label: type, color: 'text-text-tertiary bg-bg-tertiary/50' };
  }
}

// ================================================================
// 时间轴条目行
// ================================================================

interface TimelineRowProps {
  entry: TimelineEntry;
  keyframes: KeyFrame[];
  sessionStartMs: number;
}

function TimelineRow({ entry, keyframes, sessionStartMs }: TimelineRowProps) {
  const { Icon, label, color } = getEntryMeta(entry.type);
  const timeStr = formatRelativeTime(entry.timestamp, sessionStartMs);

  // 通过 refId 在 keyframes 中查找匹配的关键帧缩略图
  const matchedFrame = entry.type === 'keyframe' && entry.refId
    ? keyframes.find((kf) => kf.id === entry.refId)
    : null;

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 p-2 rounded-kb-sm transition-colors',
        'hover:bg-bg-tertiary/40',
      )}
    >
      {/* 时间戳 */}
      <span className="text-[10px] text-text-tertiary font-mono tabular-nums pt-0.5 w-10 flex-shrink-0">
        {timeStr}
      </span>

      {/* 类型图标 */}
      <span className={cn('flex-shrink-0 w-5 h-5 rounded-kb-xs flex items-center justify-center', color)}>
        <Icon className="w-3 h-3" strokeWidth={1.5} />
      </span>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <span className="text-b3 text-text-secondary">{label}</span>
        {entry.energy !== undefined && entry.energy > 0 && (
          <span className="ml-1.5 text-[10px] text-text-tertiary">
            能量 {entry.energy.toFixed(2)}
          </span>
        )}
      </div>

      {/* 关键帧缩略图 */}
      {matchedFrame?.imageBase64 && (
        <img
          src={matchedFrame.imageBase64}
          alt="关键帧缩略图"
          className="w-12 h-7 rounded-kb-xs object-cover flex-shrink-0 border border-border/30"
        />
      )}
    </div>
  );
}

// ================================================================
// 主组件
// ================================================================

export function SmartCapturePanel({ bundle, isRecording }: SmartCapturePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timeline = bundle.timeline ?? [];
  const keyframes = bundle.keyframes ?? [];
  const audioSegments = bundle.audioSegments ?? [];

  // 推算会话起始时间（取第一条 timeline 的时间戳，若无则用 0）
  const sessionStartMs = timeline[0]?.timestamp ?? Date.now();

  // 新事件到达时自动滚到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [timeline.length]);

  // 预计分析时间（分钟）：每帧约 2s，每段音频约 1.5s
  const estimatedMinutes = Math.ceil(
    (keyframes.length * 2 + audioSegments.length * 1.5) / 60,
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 头部状态栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
        <div className="flex items-center gap-1.5">
          <BrainCircuit className="w-3.5 h-3.5 text-brand-500" strokeWidth={1.5} />
          <span className="text-b3 font-medium text-text-tertiary">智能采集</span>
        </div>
        {isRecording && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-kb-full bg-semantic-error animate-pulse" />
            <span className="text-[10px] text-semantic-error font-medium">采集中</span>
          </div>
        )}
      </div>

      {/* 时间轴事件流 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {timeline.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
            <BrainCircuit className="w-8 h-8 mb-2 opacity-30" strokeWidth={1} />
            <p className="text-b3">
              {isRecording
                ? '智能采集已启动，等待关键帧和语音事件...'
                : '选择智能模式后开始采集'}
            </p>
          </div>
        )}

        {timeline.map((entry, idx) => (
          <TimelineRow
            key={`${entry.type}-${entry.timestamp}-${idx}`}
            entry={entry}
            keyframes={keyframes}
            sessionStartMs={sessionStartMs}
          />
        ))}
      </div>

      {/* 底部统计栏 */}
      <div
        className={cn(
          'px-3 py-2 border-t border-border/20 flex items-center justify-between text-[10px]',
          'text-text-tertiary bg-bg-secondary/50',
        )}
      >
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

export default SmartCapturePanel;
