/**
 * 费曼录音讲解组件（E2 录音 + 回放自评）
 *
 * @ai-context: step1 讲解区的"口头讲解"入口：麦克风采集 + 本地流式 ASR
 * 实时转写填入 explanation；同步累积音频块，停止后编码为会话内 WAV blob
 * 供回放自评（不持久化音频，仅持久化文本）。ASR 不可用时整个入口隐藏
 * （可选增强原则）。链路复用 audio_capture_start + local_asr_stream_start。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Play, Trash2 } from 'lucide-react';
import { encodeWavBase64 } from '@/lib/capture/wavEncoder';
import { cn } from '@/lib/utils';

interface FeynmanRecorderProps {
  explanation: string;
  onExplanationChange: (v: string) => void;
}

/** base64 → Blob（会话内回放用） */
function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function FeynmanRecorder({ explanation, onExplanationChange }: FeynmanRecorderProps) {
  const [asrAvailable, setAsrAvailable] = useState(false);
  const [recording, setRecording] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 最新 props 引用：事件回调中拼接转写文本
  const explanationRef = useRef(explanation);
  explanationRef.current = explanation;
  const onChangeRef = useRef(onExplanationChange);
  onChangeRef.current = onExplanationChange;

  const recordingRef = useRef(false);
  const samplesRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(16000);
  const unsubsRef = useRef<Array<() => void>>([]);

  // 可用性探测：ASR 模型未就绪则隐藏入口
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    api.invoke('local_asr_stream_available')
      .then((r) => setAsrAvailable(!!(r as { available?: boolean })?.available))
      .catch(() => setAsrAvailable(false));
  }, []);

  const cleanupIpc = useCallback(() => {
    unsubsRef.current.forEach((off) => off());
    unsubsRef.current = [];
  }, []);

  const stop = useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    cleanupIpc();
    const api = window.electronAPI;
    try {
      await api?.invoke('local_asr_stream_stop');
      await api?.invoke('audio_capture_stop');
    } catch { /* 静默降级 */ }
    setRecording(false);
    setPartialText('');

    // 会话内回放：累积的 PCM → WAV blob URL（不持久化）
    const chunks = samplesRef.current;
    samplesRef.current = [];
    if (chunks.length > 0) {
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Float32Array(total);
      let offset = 0;
      for (const c of chunks) { merged.set(c, offset); offset += c.length; }
      try {
        const wavBase64 = encodeWavBase64(merged, sampleRateRef.current, 1);
        setPlaybackUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(base64ToBlob(wavBase64, 'audio/wav'));
        });
      } catch { /* 编码失败不影响转写文本 */ }
    }
  }, [cleanupIpc]);

  const start = useCallback(async () => {
    const api = window.electronAPI;
    if (!api || recordingRef.current) return;
    setError(null);
    try {
      const status = await api.invoke('audio_capture_status') as { active: boolean };
      if (status?.active) {
        setError('音频采集被其他功能占用，请先停止后再试');
        return;
      }
      const capture = await api.invoke('audio_capture_start', {
        microphone: true, chunkDurationMs: 500, sampleRate: 16000, channels: 1,
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
      setError('录音启动失败，请重试');
      return;
    }

    samplesRef.current = [];
    // partial 实时预览；final 追加进 explanation（仅持久化文本）
    const offPartial = api.on('asr_stream_partial', (...args: unknown[]) => {
      if (!recordingRef.current) return;
      const data = args[0] as { text: string };
      setPartialText(data?.text ?? '');
    });
    const offFinal = api.on('asr_stream_final', (...args: unknown[]) => {
      if (!recordingRef.current) return;
      const data = args[0] as { text: string };
      const text = data?.text?.trim();
      if (!text) return;
      setPartialText('');
      const current = explanationRef.current;
      onChangeRef.current(current ? `${current}${current.endsWith('\n') ? '' : '\n'}${text}` : text);
    });
    // 累积音频块供回放（Float32 PCM）
    const offChunk = api.on('audio_capture_chunk', (...args: unknown[]) => {
      if (!recordingRef.current) return;
      const chunk = args[0] as { audioBuffer: ArrayBuffer; sampleRate?: number };
      if (chunk?.sampleRate) sampleRateRef.current = chunk.sampleRate;
      if (chunk?.audioBuffer) samplesRef.current.push(new Float32Array(chunk.audioBuffer));
    });
    unsubsRef.current = [offPartial, offFinal, offChunk];

    recordingRef.current = true;
    setRecording(true);
  }, []);

  // 卸载兜底：释放麦克风与 ASR 流、回收 blob URL
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current = false;
        cleanupIpc();
        const api = window.electronAPI;
        api?.invoke('local_asr_stream_stop').catch(() => {});
        api?.invoke('audio_capture_stop').catch(() => {});
      }
    };
  }, [cleanupIpc]);
  useEffect(() => {
    return () => { if (playbackUrl) URL.revokeObjectURL(playbackUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 可选增强：ASR 不可用时隐藏入口
  if (!asrAvailable) return null;

  return (
    <div className="flex flex-col gap-2 mt-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => (recording ? void stop() : void start())}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-c1 font-medium transition-all',
            recording
              ? 'bg-red-500/10 text-red-500 border border-red-300/50'
              : 'bg-bg-secondary text-text-secondary border border-border/60 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400',
          )}
        >
          {recording ? <Square className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Mic className="w-3.5 h-3.5" strokeWidth={1.5} />}
          {recording ? '停止讲解' : '口头讲解'}
        </button>
        {recording && (
          <span className="flex items-center gap-1.5 text-c1 text-text-tertiary">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            正在转写…
          </span>
        )}
        {playbackUrl && !recording && (
          <span className="flex items-center gap-1 text-c1 text-text-tertiary">
            <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
            <audio src={playbackUrl} controls className="h-7 max-w-[200px]" />
            <button
              onClick={() => { URL.revokeObjectURL(playbackUrl); setPlaybackUrl(null); }}
              className="p-1 rounded hover:text-red-500 transition-colors"
              title="删除录音"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </span>
        )}
      </div>
      {recording && partialText && (
        <p className="text-c1 text-text-tertiary italic">💬 {partialText}</p>
      )}
      {error && <p className="text-c1 text-red-500">{error}</p>}
    </div>
  );
}
