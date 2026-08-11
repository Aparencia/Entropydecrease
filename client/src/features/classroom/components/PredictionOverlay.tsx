/**
 * 课堂实时弹幕链路（M1）——AI 学习预测悬浮条
 *
 * @ai-context: 课堂 smart 路径右下角悬浮浮层：录制期间每 30 秒以当前实时
 * 转写拼接文本为上下文调用 useAIPredict.predictFromTranscript（无笔记上下文），
 * 预测"接下来可能被问到的问题"，帮助学生课中主动预判考点。
 * 加载/错误均以紧凑形态呈现，可手动关闭本轮浮层（下一轮录制重新出现）。
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useAIPredict } from '@/lib/ai/useAI';
import { cn } from '@/lib/utils';
import type { LiveTranscript } from '../hooks/useClassroomEvents';

interface PredictionOverlayProps {
  liveTranscripts: LiveTranscript[];
  /** 录制激活时轮询预测（false 时隐藏浮层） */
  isActive: boolean;
}

/** 预测调用间隔：30 秒 */
const PREDICT_INTERVAL_MS = 30 * 1000;

export function PredictionOverlay({ liveTranscripts, isActive }: PredictionOverlayProps) {
  const { data, loading, error, predictFromTranscript } = useAIPredict();
  const [dismissed, setDismissed] = useState(false);

  // ref 桥接最新转写：interval 闭包只读 ref，避免每 30s 重订阅
  const transcriptsRef = useRef(liveTranscripts);
  transcriptsRef.current = liveTranscripts;

  // 内容签名：转写无变化（长度+末尾一致）时跳过，避免对同一段内容重复请求
  const lastSignatureRef = useRef('');

  const runPredict = useCallback(async () => {
    const texts = transcriptsRef.current.map((t) => t.text).join('\n').trim();
    if (!texts) return;
    const signature = `${texts.length}:${texts.slice(-40)}`;
    if (signature === lastSignatureRef.current) return;
    // M9: 仅在预测成功后记录签名——失败时下一轮轮询允许重试（原实现
    // await 前就写入，失败会把该内容永久标记为已预测，阻断重试）
    const result = await predictFromTranscript(texts);
    if (result) lastSignatureRef.current = signature;
  }, [predictFromTranscript]);

  // 录制激活：立即预测一次 + 每 30 秒轮询；停止时重置关闭态
  useEffect(() => {
    if (!isActive) {
      setDismissed(false);
      return;
    }
    void runPredict();
    const timer = setInterval(() => { void runPredict(); }, PREDICT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isActive, runPredict]);

  if (!isActive || dismissed) return null;

  const predictions = data?.predictions ?? [];

  return (
    <div className="fixed bottom-5 right-5 z-40 w-80 max-w-[calc(100vw-22rem)] pointer-events-none">
      <div className={cn(
        'pointer-events-auto rounded-kb-lg p-3 shadow-kb-md',
        'bg-bg-elevated/95 backdrop-blur-sm border border-border/40',
      )}>
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" strokeWidth={1.5} />
          <span className="text-b3 font-medium text-text-primary">AI 预判</span>
          <button
            onClick={() => setDismissed(true)}
            className="ml-auto p-0.5 rounded-full text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="关闭 AI 预判浮层"
          >
            <X className="w-3 h-3" strokeWidth={1.5} />
          </button>
        </div>

        {loading && (
          <p className="mt-1.5 text-c1 text-text-tertiary flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
            正在根据课堂内容预测…
          </p>
        )}

        {error && !loading && (
          <p className="mt-1.5 text-c1 text-text-tertiary/80 leading-relaxed">
            {error}
          </p>
        )}

        {!loading && !error && predictions.length === 0 && (
          <p className="mt-1.5 text-c1 text-text-tertiary/60">
            持续记录中，积累更多转写后自动给出预测
          </p>
        )}

        {!loading && predictions.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {predictions.slice(0, 3).map((p, i) => (
              <li key={i} className="text-c1 text-text-secondary leading-snug">
                <span className="text-brand-500/80 mr-1">Q{i + 1}.</span>
                {p.question}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default PredictionOverlay;
