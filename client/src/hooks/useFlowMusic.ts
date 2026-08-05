/**
 * 心流音乐引擎 Hook
 *
 * @ai-context: 心流音乐引擎（3.8）——订阅番茄钟 store + 专注信号，
 * 映射心流状态到音乐行为，调用 useAudioPlayer 方法自动切换音轨。
 * 在 ImmersiveTimer 中挂载，工作阶段激活。
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { usePomodoroPhase, usePomodoroRunning } from '@/features/pomodoro/store/usePomodoroStore';
import { useAudioPlayer } from '@/lib/audio/useAudioPlayer';
import { createFlowDetector, evaluateFlowState, getMusicForFlowState, type FlowState, FLOW_STATE_LABELS } from '@/lib/audio/flowStateDetector';
import { audioTracks } from '@/lib/audio/audioConfig';
import { wellbeingEventBus } from '@/lib/wellbeing/wellbeingEventBus';

/** 心流检测评估周期（ms） */
const FLOW_EVAL_INTERVAL_MS = 10_000;

export interface FlowMusicState {
  /** 当前心流状态 */
  flowState: FlowState;
  /** 当前播放音轨 ID */
  currentTrackId: string | null;
  /** 音乐引擎是否激活 */
  active: boolean;
}

/**
 * 查找音轨 src 通过 id
 */
function findTrackSrc(trackId: string): string | undefined {
  const track = audioTracks.find(t => t.id === trackId);
  return track?.src;
}

/**
 * 心流音乐引擎 Hook
 * @param focusScore - 当前专注守护灵分心分数（0-100）
 * @returns 心流状态与引擎控制
 */
export function useFlowMusic(focusScore: number) {
  const phase = usePomodoroPhase();
  const isRunning = usePomodoroRunning();
  const [state, setState] = useState<FlowMusicState>({
    flowState: 'not_started',
    currentTrackId: null,
    active: false,
  });
  const detectorRef = useRef(createFlowDetector());

  // 当前播放音轨
  const currentTrackId = state.currentTrackId;
  const trackSrc = currentTrackId ? findTrackSrc(currentTrackId) : undefined;

  const audio = useAudioPlayer({
    src: trackSrc || '',
    volume: 0.3,
    loop: true,
    fadeInMs: 2000,
    fadeOutMs: 2000,
  });
  // H7: 稳定引用——audio 返回对象每次渲染重建（isPlaying 变化），
  // 直接作 effect 依赖会导致音轨切换 effect 每渲染重跑、音乐反复重启
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const isPlayingRef = useRef(audio.isPlaying);
  isPlayingRef.current = audio.isPlaying;
  // H7: 延迟播放定时器句柄——卸载/切换时清理，防止卸载后触发播放
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 激活/停用引擎
  const activate = useCallback(() => {
    setState(prev => ({ ...prev, active: true }));
  }, []);

  const deactivate = useCallback(() => {
    setState(prev => ({ ...prev, active: false }));
  }, []);

  // 周期评估心流状态
  useEffect(() => {
    if (!state.active) return;

    const timer = setInterval(() => {
      const prev = detectorRef.current;
      const next = evaluateFlowState(prev, phase, isRunning, focusScore, FLOW_EVAL_INTERVAL_MS);
      detectorRef.current = next;

      if (next.state !== prev.state) {
        wellbeingEventBus.emit('flow:state-changed', { flowState: next.state });
      }

      setState(prevState => ({
        ...prevState,
        flowState: next.state,
      }));
    }, FLOW_EVAL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [phase, isRunning, focusScore, state.active]);

  // 心流状态 → 音轨切换（H7: 依赖稳定化——audioRef/isPlayingRef 防每渲染重跑）
  useEffect(() => {
    if (!state.active) {
      audioRef.current.pause();
      return;
    }

    // 休息阶段不播放
    if (phase === 'short_break' || phase === 'long_break') {
      audioRef.current.pause();
      setState(prev => ({ ...prev, currentTrackId: null }));
      return;
    }

    const recommendedTrackId = getMusicForFlowState(state.flowState);

    if (recommendedTrackId !== state.currentTrackId) {
      const src = findTrackSrc(recommendedTrackId);
      if (src) {
        // 切换时先清掉挂起的延迟播放，再淡出旧音轨
        if (playTimerRef.current) {
          clearTimeout(playTimerRef.current);
          playTimerRef.current = null;
        }
        if (audioRef.current.isPlaying) {
          audioRef.current.pause();
        }
        setState(prev => ({ ...prev, currentTrackId: recommendedTrackId }));
        // 延迟播放（等 audio player 用新 src 重建 Audio 元素）
        playTimerRef.current = setTimeout(() => {
          playTimerRef.current = null;
          audioRef.current.play();
        }, 100);
      }
    } else if (recommendedTrackId === state.currentTrackId && !isPlayingRef.current) {
      audioRef.current.play();
    }
  }, [state.active, state.flowState, phase, state.currentTrackId]);

  // 组件卸载时停止（含延迟播放定时器清理）
  useEffect(() => {
    return () => {
      if (playTimerRef.current) {
        clearTimeout(playTimerRef.current);
        playTimerRef.current = null;
      }
      audioRef.current.pause();
    };
  }, []);

  return {
    ...state,
    activate,
    deactivate,
    audio,
    flowStateLabel: FLOW_STATE_LABELS[state.flowState],
  };
}