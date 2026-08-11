/**
 * 讲解复习模式 — 开口讲解检验理解
 *
 * @ai-context: 3.5 多感官复习。用 MediaRecorder 录制用户对卡片正面的讲解，
 * 可回放自听（费曼式输出检验）；"查看答案"翻转并解锁评分（onFlipEnd 门控
 * RatingBar）。录音权限不可用时静默降级为纯讲解引导，不阻塞复习流程。
 */
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Play, Trash2, CheckCircle2 } from 'lucide-react';
import { Button, useToast } from '@/components/ui';
import { extractPlainText } from '../lib/reviewMode';
import type { Flashcard } from '@/types/models';

interface SpeakingReviewModeProps {
  card: Flashcard;
  isFlipped: boolean;
  onFlip: () => void;
  onFlipEnd: () => void;
}

export function SpeakingReviewMode({ card, isFlipped, onFlip, onFlipEnd }: SpeakingReviewModeProps) {
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [recordUrl, setRecordUrl] = useState<string | null>(null);
  const [audioSupported, setAudioSupported] = useState(true);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const urlRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // M16: 双击防抖——getUserMedia 等待期间再次点击直接忽略；
  // mountedRef 用于丢弃授权等待中组件已卸载时取得的流，避免 MediaStream 泄漏
  const startingRef = useRef(false);
  const mountedRef = useRef(true);

  // 清理录音资源（卸载或切换卡片时）
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      mediaRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      mediaRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  // 切换卡片重置录音状态
  useEffect(() => {
    setRecording(false);
    setRecordUrl(null);
    // M16: 切卡时同步停掉仍活跃的流（防御：将来若去掉 key 重挂载仍不泄漏）
    mediaRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    chunksRef.current = [];
  }, [card.id]);

  const startRecording = async () => {
    // M16: 双击防抖——getUserMedia 等待期间再次点击直接忽略
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 授权等待期间组件可能已卸载/切卡——立即停掉新流，避免 MediaStream 泄漏
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(blob);
        setRecordUrl(urlRef.current);
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setAudioSupported(false);
      toast({ type: 'warning', message: '无法访问麦克风，请以讲解方式在脑中输出' });
    } finally {
      startingRef.current = false;
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const clearRecording = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setRecordUrl(null);
  };

  const handleReveal = () => {
    mediaRef.current?.stop();
    onFlip();
    onFlipEnd();
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-5 py-6">
      <div className="flex items-center gap-2 text-text-tertiary text-xs">
        <Mic className="w-4 h-4" strokeWidth={1.5} />
        开口讲解卡片内容，像教给别人一样（费曼）
      </div>

      {/* 讲解对象 */}
      <div className="w-full rounded-kb-xl border border-border-subtle bg-bg-secondary/60 p-6 text-center">
        <div className="text-xs text-text-tertiary mb-2">讲解主题</div>
        <div className="text-base text-text-primary leading-relaxed max-h-40 overflow-y-auto">
          {extractPlainText(card.front) || '（无文字内容）'}
        </div>
      </div>

      {/* 录音控制 */}
      {audioSupported && (
        <div className="w-full flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            {recording ? (
              <Button
                variant="secondary"
                icon={<Square className="w-4 h-4" />}
                onClick={stopRecording}
              >
                停止录音
              </Button>
            ) : (
              <Button
                icon={<Mic className="w-4 h-4" />}
                onClick={startRecording}
                disabled={!!recordUrl}
              >
                {recordUrl ? '已录好' : '开始讲解'}
              </Button>
            )}
            {recording && <span className="text-xs text-red-500 animate-pulse">● 录音中…</span>}
          </div>

          {recordUrl && (
            <div className="w-full flex items-center gap-3 rounded-kb-lg border border-border-subtle bg-bg-secondary/60 px-4 py-3">
              <audio src={recordUrl} controls className="flex-1 h-8" />
              <button
                type="button"
                onClick={clearRecording}
                className="p-1.5 rounded-kb-full text-text-tertiary hover:text-red-500 hover:bg-bg-tertiary transition-colors"
                title="删除录音"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
          )}
          {recordUrl && (
            <div className="flex items-center gap-2 text-xs text-emerald-600">
              <CheckCircle2 className="w-4 h-4" strokeWidth={1.6} />
              回放自己的讲解，查漏补缺
            </div>
          )}
        </div>
      )}

      {isFlipped ? (
        <div className="w-full rounded-kb-xl border border-brand-300/50 bg-brand-500/5 p-5 text-center">
          <div className="text-xs text-text-tertiary mb-2">标准答案</div>
          <div className="text-base text-text-primary leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
            {extractPlainText(card.back)}
          </div>
        </div>
      ) : (
        <Button variant="secondary" icon={<Play className="w-4 h-4" />} onClick={handleReveal}>
          讲完了，查看答案
        </Button>
      )}
    </div>
  );
}
