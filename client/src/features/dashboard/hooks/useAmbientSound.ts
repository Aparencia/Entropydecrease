/**
 * @file 深海环境音效 Hook
 * @description 基于深度层切换环境音（Web Audio API），默认静音
 * @ai-context: 可选增强项，用户主动开启后才播放
 */
import { useRef, useCallback, useEffect } from 'react';
import type { DepthZone } from '@/features/dashboard/components/deep-sea/useDepthScroll';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** 各层音效参数：频率、增益、滤波 */
const ZONE_AUDIO: Record<DepthZone, { freq: number; gain: number; filterFreq: number }> = {
  surface:  { freq: 120, gain: 0.03, filterFreq: 400 },
  sunlight: { freq: 90,  gain: 0.025, filterFreq: 300 },
  twilight: { freq: 60,  gain: 0.02, filterFreq: 200 },
  midnight: { freq: 40,  gain: 0.015, filterFreq: 150 },
};

export function useAmbientSound(currentZone: DepthZone) {
  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const enabledRef = useRef(false);
  const prefersReduced = useReducedMotion();

  // Bug #14: 通过 ref 访问 currentZone，避免 useCallback 依赖变化重建导致多 AudioContext
  const currentZoneRef = useRef(currentZone);
  currentZoneRef.current = currentZone;

  /** 初始化 Audio 上下文（需用户手势触发） */
  const initAudio = useCallback(() => {
    if (ctxRef.current) return;
    const zone = currentZoneRef.current;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.value = ZONE_AUDIO[zone].freq;

    filter.type = 'lowpass';
    filter.frequency.value = ZONE_AUDIO[zone].filterFreq;
    filter.Q.value = 1;

    gain.gain.value = 0;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    ctxRef.current = ctx;
    oscRef.current = osc;
    gainRef.current = gain;
    filterRef.current = filter;
  }, []);

  /** 切换启用/静音 */
  const toggle = useCallback(() => {
    if (prefersReduced) return;
    if (!ctxRef.current) {
      initAudio();
    }
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    enabledRef.current = !enabledRef.current;
    const targetGain = enabledRef.current ? ZONE_AUDIO[currentZoneRef.current].gain : 0;
    gain.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 0.5);
  }, [initAudio, prefersReduced]);

  /** 深度层切换时平滑过渡音色 */
  useEffect(() => {
    const ctx = ctxRef.current;
    const osc = oscRef.current;
    const gain = gainRef.current;
    const filter = filterRef.current;
    if (!ctx || !osc || !gain || !filter || !enabledRef.current) return;

    const params = ZONE_AUDIO[currentZone];
    const now = ctx.currentTime;
    osc.frequency.linearRampToValueAtTime(params.freq, now + 1.5);
    filter.frequency.linearRampToValueAtTime(params.filterFreq, now + 1.5);
    gain.gain.linearRampToValueAtTime(params.gain, now + 1);
  }, [currentZone]);

  /** 清理 */
  useEffect(() => {
    return () => {
      oscRef.current?.stop();
      ctxRef.current?.close();
    };
  }, []);

  return { toggle, isEnabled: enabledRef.current };
}
