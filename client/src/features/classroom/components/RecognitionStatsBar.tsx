/**
 * RecognitionStatsBar — 识别统计条（P0-7）
 *
 * @ai-context: 识别过程可见性（UX-F 基础）：会话中实时展示识别引擎徽标、
 * 已捕捉关键帧数、已转写句数、VAD 语音状态。数据全部来自既有会话状态
 * （smartBundle.keyframes / transcribedCount / vadStats），纯展示零逻辑，
 * 不引入新订阅。
 * @ai-context EN: Live recognition status bar: engine badge (local streaming /
 * local segment / cloud), captured keyframes, transcribed segments, and VAD
 * voice state. Pure presentation over existing session state.
 */
import { Cpu, Camera, Mic, Activity } from 'lucide-react';
import type { SessionStatus } from '@/lib/capture';
import type { VADStats } from '@/lib/capture/vadMarker';

interface RecognitionStatsBarProps {
  status: SessionStatus;
  keyframeCount: number;
  transcribedCount: number;
  vadStats: VADStats | null;
  /** 真流式 ASR 激活（smart 路径 Zipformer 在线识别） */
  streamingAsrActive: boolean;
  /** 本地 ASR 引擎就绪（否则转写走云端） */
  localAsrReady: boolean;
}

/** 引擎徽标文案与配色（本地流式 > 本地按段 > 云端） */
function engineBadge(streamingAsrActive: boolean, localAsrReady: boolean): { label: string; cls: string } {
  if (streamingAsrActive) {
    return { label: '本地流式', cls: 'text-emerald-600 bg-emerald-500/10' };
  }
  if (localAsrReady) {
    return { label: '本地按段', cls: 'text-emerald-600 bg-emerald-500/10' };
  }
  return { label: '云端转写', cls: 'text-accent-600 bg-accent-500/10' };
}

/** VAD 语音状态：最近 2s 内有语音活动视为「语音中」（vadStats 5s 粒度） */
function vadVoiceState(vadStats: VADStats | null): { label: string; speaking: boolean } {
  if (!vadStats) return { label: '—', speaking: false };
  const recent = Date.now() - vadStats.lastVoiceTimestamp < 2000;
  return recent ? { label: '语音中', speaking: true } : { label: '静默', speaking: false };
}

export function RecognitionStatsBar({
  status, keyframeCount, transcribedCount, vadStats, streamingAsrActive, localAsrReady,
}: RecognitionStatsBarProps) {
  const engine = engineBadge(streamingAsrActive, localAsrReady);
  const voice = vadVoiceState(vadStats);

  return (
    <div className="mx-4 mt-2 flex items-center gap-3 px-3 py-1.5 rounded-kb-md bg-bg-elevated/40 border border-border/20 text-[11px] text-text-tertiary flex-wrap">
      <span className="flex items-center gap-1">
        <Cpu className="w-3 h-3" strokeWidth={1.5} />
        识别引擎
        <span className={`px-1.5 py-0.5 rounded-kb-sm font-medium ${engine.cls}`}>{engine.label}</span>
      </span>
      <span className="flex items-center gap-1">
        <Camera className="w-3 h-3" strokeWidth={1.5} />
        已捕捉 <strong className="text-text-secondary">{keyframeCount}</strong> 帧
      </span>
      <span className="flex items-center gap-1">
        <Mic className="w-3 h-3" strokeWidth={1.5} />
        已转写 <strong className="text-text-secondary">{transcribedCount}</strong> 句
      </span>
      <span className="flex items-center gap-1">
        <Activity className={`w-3 h-3 ${voice.speaking ? 'text-emerald-500' : ''}`} strokeWidth={1.5} />
        {status === 'capturing' ? voice.label : '已停止'}
      </span>
    </div>
  );
}

export default RecognitionStatsBar;
