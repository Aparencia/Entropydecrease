/**
 * AI 播客播放器 — 展示 AI 生成的播客内容
 *
 * @ai-context: 展示播客标题、可滚动脚本片段、说话人徽章（主持人/嘉宾），
 * 复用 ttsController 进行语音播放。支持分段播放语音。
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Headphones, Volume2, Mic, User, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui';
import { copyText } from '@/lib/utils/clipboard';
import { ttsController } from '@/features/assistant/lib/ttsController';
import type { PodcastData, SpeakerRole } from '@/lib/ai/types';

interface PodcastPlayerProps {
  podcast: PodcastData;
  className?: string;
  onClose?: () => void;
}

const SPEAKER_META: Record<SpeakerRole, { label: string; icon: typeof Mic; color: string }> = {
  host: { label: '主持人', icon: Mic, color: 'text-brand-500 bg-brand-500/10' },
  guest: { label: '嘉宾', icon: User, color: 'text-violet-500 bg-violet-500/10' },
};

export default function PodcastPlayer({ podcast, className, onClose }: PodcastPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState<number | null>(null);
  const { toast } = useToast();
  // H2: 轮询句柄与播放序号——切换片段时先清旧 interval，卸载时清理，
  // 防止旧 interval 的 stale closure 覆盖用户新选中的片段
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playingRef = useRef<{ index: number } | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // 卸载清理：interval 停止 + TTS 停止（防卸载后 setState/继续播放）
  useEffect(() => {
    return () => {
      stopPolling();
      ttsController.stop();
    };
  }, [stopPolling]);

  // 基线修复：命名函数表达式——函数体内自引用走内部名绑定，
  // 避免 useCallback 初始化器引用自身（TS7022/TS2448）
  const handlePlaySegment = useCallback(function handlePlaySegment(index: number) {
    const segment = podcast.segments[index];
    if (!segment) return;

    ttsController.stop();
    stopPolling();

    if (playingRef.current?.index === index) {
      // 再次点击当前片段 = 停止
      playingRef.current = null;
      setPlaying(false);
      setCurrentSegment(null);
      return;
    }

    playingRef.current = { index };
    setCurrentSegment(index);
    setPlaying(true);
    ttsController.speak(`${SPEAKER_META[segment.speaker].label}：${segment.text}`);

    // 监听播放结束：用 ref 持有当前序号，轮询回调读取最新值避免 stale closure
    pollRef.current = setInterval(() => {
      const cur = playingRef.current;
      if (!cur) {
        stopPolling();
        return;
      }
      if (!ttsController.isSpeaking) {
        stopPolling();
        playingRef.current = null;
        setPlaying(false);
        setCurrentSegment(null);
        // 自动播放下一个（仅在仍处于自动续播链路时）
        if (cur.index + 1 < podcast.segments.length) {
          handlePlaySegment(cur.index + 1);
        }
      }
    }, 500);
  }, [podcast.segments, stopPolling]);

  const handlePlayAll = useCallback(() => {
    if (playing) {
      ttsController.stop();
      stopPolling();
      playingRef.current = null;
      setPlaying(false);
      setCurrentSegment(null);
      return;
    }
    handlePlaySegment(0);
  }, [playing, handlePlaySegment, stopPolling]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('rounded-2xl border border-border/20 bg-bg-elevated/50 overflow-hidden', className)}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
        <div className="flex items-center gap-2">
          <Headphones className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
          <span className="text-[13px] font-semibold text-text-primary truncate">{podcast.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {podcast.totalDuration && (
            <span className="text-[11px] text-text-tertiary">{Math.round(podcast.totalDuration / 60)} 分钟</span>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-bg-tertiary/30 transition-colors">
              <span className="text-text-tertiary text-[16px]">&times;</span>
            </button>
          )}
          <button
            onClick={async () => {
              const text = `🎙 AI 播客：${podcast.title}\n\n${podcast.segments.map((s) => `[${s.speaker}] ${s.text}`).slice(0, 5).join('\n')}\n\n—— 来自熵减 AI 学习助手`;
              await copyText(text);
              toast({ type: 'success', message: '播客内容已复制，可分享给好友', silent: true });
            }}
            className="p-1 rounded-lg hover:bg-bg-tertiary/30 transition-colors"
            aria-label="分享播客"
          >
            <Share2 className="w-4 h-4 text-text-tertiary" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 嘉宾介绍 */}
      {podcast.guestIntro && (
        <div className="px-4 py-2 bg-gradient-to-r from-brand-500/5 to-violet-500/5 border-b border-border/10">
          <p className="text-[11px] text-text-tertiary">嘉宾介绍</p>
          <p className="text-[12px] text-text-secondary">{podcast.guestIntro}</p>
        </div>
      )}

      {/* 播放控制 */}
      <div className="px-4 py-2 border-b border-border/10">
        <button
          onClick={handlePlayAll}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium transition-all',
            playing
              ? 'bg-brand-500/10 text-brand-500 border border-brand-500/20'
              : 'bg-brand-500 text-white hover:bg-brand-600',
          )}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {playing ? '暂停' : '播放全部'}
        </button>
      </div>

      {/* 播客脚本 */}
      <div className="max-h-[300px] overflow-y-auto p-3 space-y-2">
        {podcast.segments.map((segment, index) => {
          const meta = SPEAKER_META[segment.speaker];
          const Icon = meta.icon;
          const isActive = currentSegment === index && playing;

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <button
                onClick={() => handlePlaySegment(index)}
                className={cn(
                  'w-full text-left rounded-xl border p-3 transition-all',
                  isActive
                    ? 'border-brand-500/40 bg-brand-500/5'
                    : 'border-border/10 bg-bg-elevated/30 hover:border-border/30',
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={cn('w-3.5 h-3.5', meta.color.split(' ')[0])} strokeWidth={1.5} />
                  <span className={cn('text-[10px] font-medium rounded-full px-2 py-0.5', meta.color)}>
                    {meta.label}
                  </span>
                  {segment.duration && (
                    <span className="text-[10px] text-text-tertiary ml-auto">{segment.duration}秒</span>
                  )}
                  {isActive && <Volume2 className="w-3 h-3 text-brand-500 animate-pulse ml-auto" />}
                </div>
                <p className="text-[13px] text-text-primary leading-relaxed">{segment.text}</p>
              </button>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}