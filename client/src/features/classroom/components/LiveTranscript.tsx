/**
 * LiveTranscript — 实时 ASR 转录滚动面板
 * 课中逐句显示语音转写结果，供用户确认采集质量
 *
 * @ai-context: 通用组件：LiveTranscript。
 */
import { useRef, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
}

interface LiveTranscriptProps {
  transcripts: TranscriptEntry[];
  isActive: boolean;
  className?: string;
}

export function LiveTranscript({ transcripts, isActive, className }: LiveTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  // 新转录到达时自动滚到底部
  useEffect(() => {
    if (scrollRef.current && transcripts.length > lastCountRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    lastCountRef.current = transcripts.length;
  }, [transcripts.length]);

  if (transcripts.length === 0 && !isActive) return null;

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
        {transcripts.length === 0 && (
          <p className="text-[11px] text-text-tertiary text-center py-3 opacity-60">
            {isActive ? '等待语音输入...' : '采集开始后转录将在此显示'}
          </p>
        )}
        {transcripts.map((entry, idx) => {
          const isLatest = idx === transcripts.length - 1;
          const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          return (
            <div
              key={entry.id}
              className={cn(
                'flex gap-2 text-[12px] leading-relaxed transition-opacity duration-300',
                isLatest ? 'text-text-primary opacity-100' : 'text-text-secondary opacity-80',
              )}
            >
              <span className="text-[10px] text-text-tertiary flex-shrink-0 mt-0.5 tabular-nums">{time}</span>
              <span className={cn(isLatest && 'font-medium')}>{entry.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
