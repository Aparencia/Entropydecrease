/**
 * 语音输入 Hook（A2 语音对话闭环的拾音端）
 * Voice input hook (mic side of the A2 voice conversation loop)
 *
 * @ai-context: 串联既有链路形成"说话 → ASR"拾音端：
 * audio_capture_status 互斥检查 → audio_capture_start(麦克风) →
 * local_asr_stream_start → 订阅 asr_stream_partial/final 累积文本 →
 * 停止时释放两者。静音超时自动停止（防忘关麦克风）；
 * 回复朗读/流式期间由调用方停止拾音（防 TTS 回声回路）。
 * 课堂采集占用或 ASR 不可用时返回明确错误文案，不静默吞掉。
 * @ai-context: Wires existing primitives into the mic side of the voice loop:
 * mutex check → mic capture → streaming ASR → accumulate partial/final text.
 * Auto-stops on prolonged silence; caller pauses capture while TTS speaks to
 * avoid echo. Surfaces clear errors when classroom capture is active or ASR
 * is unavailable.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAssistantStore } from '../store/useAssistantStore';
import { VOICE_CHUNK_DURATION_MS, VOICE_SILENCE_TIMEOUT_MS } from '../constants';

interface UseVoiceInputOptions {
  /** 最终文本变化回调（停止时给出累积文本） */
  onFinalText?: (text: string) => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const [listening, setListening] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const transcriptRef = useRef('');
  const lastSpeechAtRef = useRef(0);
  const unsubPartialRef = useRef<(() => void) | null>(null);
  const unsubFinalRef = useRef<(() => void) | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const listeningRef = useRef(false);
  // FRONT2-M8: stop 进行中标志——stop 的 await IPC 窗口内新 start 会启动新
  // 采集，随后旧 stop 的 audio_capture_stop 把新采集停掉（静音 watchdog 与
  // 用户 toggle 并发时必现）。start 等待此标志清除后再继续。
  const stopPendingRef = useRef(false);
  const onFinalTextRef = useRef(options.onFinalText);
  onFinalTextRef.current = options.onFinalText;

  const cleanupIpc = useCallback(() => {
    unsubPartialRef.current?.();
    unsubFinalRef.current?.();
    unsubPartialRef.current = null;
    unsubFinalRef.current = null;
    if (watchdogRef.current !== null) {
      window.clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  /** 停止拾音：释放 ASR 流与麦克风采集，交付累积文本 */
  const stop = useCallback(async () => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    // FRONT2-M8: 置位 stop 进行中标志，阻止并发 start 启动新采集
    stopPendingRef.current = true;
    cleanupIpc();

    const api = window.electronAPI;
    if (api) {
      try {
        await api.invoke('local_asr_stream_stop');
        // 二次校验：stop 等待期间用户已重新 start（listeningRef 已为 true）
        // 时不再停新采集——原实现无条件 audio_capture_stop 停掉新采集
        if (!listeningRef.current) {
          await api.invoke('audio_capture_stop');
        }
      } catch { /* 静默降级：停止失败不影响对话流 */ }
    }
    stopPendingRef.current = false;

    setListening(false);
    setPartialText('');
    const finalText = transcriptRef.current.trim();
    transcriptRef.current = '';
    if (finalText) onFinalTextRef.current?.(finalText);

    const store = useAssistantStore.getState();
    if (store.creatureState === 'listening') store.setCreatureState('idle');
  }, [cleanupIpc]);

  /** 启动拾音：互斥检查 → 麦克风采集 → 流式 ASR → 事件订阅 */
  const start = useCallback(async () => {
    const api = window.electronAPI;
    if (!api || listeningRef.current) return;
    // FRONT2-M8: 序列化 stop/start——stop 进行中时等待其完成（最多 5s），
    // 否则新采集启动后会被旧 stop 的 audio_capture_stop 停掉
    if (stopPendingRef.current) {
      const waitStart = Date.now();
      while (stopPendingRef.current && Date.now() - waitStart < 5000) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (stopPendingRef.current) {
        // GW-3: 超时静默放弃会让用户点击无响应——给出明确错误提示
        setError('停止拾音未完成，请稍后重试');
        return;
      }
    }
    setError(null);

    try {
      // 互斥：课堂/窗口采集占用时不启动（避免误伤其采集实例）
      const status = await api.invoke('audio_capture_status') as { active: boolean };
      if (status?.active) {
        setError('课堂采集正在进行中，请先停止采集再使用语音对话');
        return;
      }
      // 可用性：流式 ASR 模型未下载时明确告知（本地优先，不静默失败）
      const asr = await api.invoke('local_asr_stream_available') as { available: boolean };
      if (!asr?.available) {
        setError('语音识别暂不可用——请在设置中下载本地语音模型');
        return;
      }

      // 麦克风采集：与课堂真流式一致的块参数
      const capture = await api.invoke('audio_capture_start', {
        microphone: true,
        chunkDurationMs: VOICE_CHUNK_DURATION_MS,
        sampleRate: 16000,
        channels: 1,
      }) as { success: boolean; error?: string };
      if (!capture?.success) {
        setError(capture?.error || '麦克风启动失败，请检查设备与权限');
        return;
      }

      const asrStart = await api.invoke('local_asr_stream_start', { sampleRate: 16000 }) as { success: boolean };
      if (!asrStart?.success) {
        await api.invoke('audio_capture_stop');
        setError('语音识别启动失败，请重试');
        return;
      }
    } catch {
      setError('语音输入启动失败，请重试');
      return;
    }

    // 事件订阅：partial 实时预览，final 累积入转写文本
    transcriptRef.current = '';
    lastSpeechAtRef.current = Date.now();
    unsubPartialRef.current = api.on('asr_stream_partial', (...args: unknown[]) => {
      if (!listeningRef.current) return;
      const data = args[0] as { text: string };
      setPartialText(data?.text ?? '');
      lastSpeechAtRef.current = Date.now();
    });
    unsubFinalRef.current = api.on('asr_stream_final', (...args: unknown[]) => {
      if (!listeningRef.current) return;
      const data = args[0] as { text: string };
      if (data?.text) {
        transcriptRef.current += (transcriptRef.current ? ' ' : '') + data.text;
        setPartialText('');
        lastSpeechAtRef.current = Date.now();
      }
    });

    // 静音看门狗：持续无声自动停止，避免忘关麦克风
    watchdogRef.current = window.setInterval(() => {
      if (listeningRef.current && Date.now() - lastSpeechAtRef.current > VOICE_SILENCE_TIMEOUT_MS) {
        void stop();
      }
    }, 1000);

    listeningRef.current = true;
    setListening(true);
    useAssistantStore.getState().setCreatureState('listening');
  }, [stop]);

  /** 切换拾音开关 */
  const toggle = useCallback(() => {
    if (listeningRef.current) void stop();
    else void start();
  }, [start, stop]);

  // 卸载兜底：组件销毁必须释放麦克风与 ASR 流
  useEffect(() => {
    return () => {
      if (listeningRef.current) {
        listeningRef.current = false;
        cleanupIpc();
        const api = window.electronAPI;
        api?.invoke('local_asr_stream_stop').catch((err) => {
          console.debug('[useVoiceInput] stop ASR stream failed', err);
        });
        api?.invoke('audio_capture_stop').catch((err) => {
          console.debug('[useVoiceInput] stop audio capture failed', err);
        });
      }
    };
  }, [cleanupIpc]);

  return { listening, partialText, error, start, stop, toggle, clearError: () => setError(null) };
}
