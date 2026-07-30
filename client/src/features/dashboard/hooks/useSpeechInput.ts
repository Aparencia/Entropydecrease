/**
 * useSpeechInput — 语音输入 Hook（Web Speech API 封装）
 * Speech input hook wrapping the Web Speech API
 *
 * @ai-context: RIT-12/B1.5——封装 SpeechRecognition，特性探测失败时
 * supported=false（调用方隐藏语音按钮，功能隐藏级降级，不影响键盘输入）。
 * 识别结果经 onResult 回调回传；失败静默停止。无外部依赖。
 * @ai-context: Wraps SpeechRecognition; supported=false when unavailable
 * so callers hide the mic button. Results via onResult; errors stop silently.
 */
import { useState, useRef, useCallback, useEffect } from 'react';

/** SpeechRecognition 最小结构（避免 any，仅声明用到的成员） */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechResultEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
interface SpeechResultEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** 探测可用的 SpeechRecognition 构造器（标准 / webkit 前缀） */
function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface Options {
  /** 识别到的最终文本回调 */
  onResult: (text: string) => void;
  lang?: string;
}

export function useSpeechInput({ onResult, lang = 'zh-CN' }: Options) {
  const [supported] = useState<boolean>(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    try {
      const rec = new Ctor();
      rec.lang = lang;
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (e) => {
        const text = e.results?.[0]?.[0]?.transcript?.trim();
        if (text) onResultRef.current(text);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false); // 启动失败静默降级
    }
  }, [lang]);

  // 卸载时确保停止识别
  useEffect(() => () => recognitionRef.current?.stop(), []);

  return { supported, listening, start, stop };
}
