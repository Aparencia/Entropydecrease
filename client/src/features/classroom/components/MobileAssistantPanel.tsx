/**
 * MobileAssistantPanel — 课堂助手移动端面板（视频知识笔记提取）
 *
 * @ai-context: 仅 Capacitor 壳内渲染（isCapacitor 门控，ClassroomPage 装配）。
 * 两条采集路径：① 导入视频 → 抽音频 → 本地/云端转写 → 知识笔记；
 * ② 录屏采集（小布式边看边录）→ 麦克风流式采集 → 本地 ASR 实时字幕 →
 * 停止后结构化。完成后提供：转写预览、基于转写的课堂问答、一键生成闪卡。
 * @ai-context EN: mobile-only classroom panel — video import and
 * screen-recording pipelines, then transcript QA and one-click flashcards.
 */
import { useCallback, useRef, useState } from 'react';
import { useToast } from '@/components/ui';
import {
  Upload, MonitorPlay, Square, Loader2, AlertCircle, CheckCircle2, MessageCircleQuestion, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  runVideoImportPipeline,
  runRecordingFlow,
  structureAndSave,
  generateFlashcardsFromTranscript,
  askSessionQuestion,
  type PipelineProgress,
} from '../lib/mobilePipeline';

const STAGE_LABELS: Record<PipelineProgress['stage'], string> = {
  idle: '待命',
  picking: '选择视频',
  extracting: '抽取音频',
  transcribing: '语音转写',
  structuring: '生成笔记',
  recording: '录制中',
  done: '完成',
  error: '失败',
};

export function MobileAssistantPanel() {
  const { toast } = useToast();
  const [progress, setProgress] = useState<PipelineProgress>({ stage: 'idle', message: '选择一种采集方式开始' });
  const [subtitle, setSubtitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaAnswer, setQaAnswer] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(false);
  const recordingRef = useRef<Awaited<ReturnType<typeof runRecordingFlow>> | null>(null);

  const fail = useCallback((e: unknown) => {
    // 用户取消选择/授权不是错误：回到待命态
    if (e instanceof Error && e.message === '已取消') {
      setProgress({ stage: 'idle', message: '选择一种采集方式开始' });
      return;
    }
    setProgress({ stage: 'error', message: e instanceof Error ? e.message : '处理失败，请重试' });
  }, []);

  /** ① 导入视频 → 全流程流水线 */
  const handleImportVideo = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setSubtitle('');
    setQaAnswer('');
    try {
      await runVideoImportPipeline(setProgress, setTranscript);
      setProgress({ stage: 'done', message: '视频知识笔记已生成，可在笔记中查看' });
      toast({ type: 'success', message: '视频知识笔记已生成' });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [busy, fail, toast]);

  /** ② 开始录屏采集（画面 + 麦克风实时字幕） */
  const handleStartRecording = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setSubtitle('');
    setQaAnswer('');
    setProgress({ stage: 'recording', message: '正在发起录屏授权…' });
    try {
      const handle = await runRecordingFlow(setProgress, setSubtitle);
      recordingRef.current = handle;
      setRecording(true);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [busy, fail]);

  /** 停止录屏 → 转写收尾 → 结构化 */
  const handleStopRecording = useCallback(async () => {
    const handle = recordingRef.current;
    if (!handle || busy) return;
    setBusy(true);
    try {
      setProgress({ stage: 'transcribing', message: '整理转写…' });
      const { text } = await handle.stop();
      setRecording(false);
      recordingRef.current = null;
      if (text.trim()) {
        setTranscript(text);
        setProgress({ stage: 'structuring', message: '生成知识笔记…' });
        await structureAndSave(text, 0, 'video');
        setProgress({ stage: 'done', message: '录屏知识笔记已生成，可在笔记中查看' });
        toast({ type: 'success', message: '录屏笔记已生成' });
      } else {
        setProgress({
          stage: 'error',
          message: '未识别到语音内容。录屏可能无法收录视频原声，建议靠近麦克风讲解或改用「导入视频」',
        });
      }
    } catch (e) {
      setRecording(false);
      recordingRef.current = null;
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [busy, fail, toast]);

  /** 基于转写的课堂问答 */
  const handleAsk = useCallback(async () => {
    const q = qaQuestion.trim();
    if (!q || !transcript.trim() || qaLoading) return;
    setQaLoading(true);
    setQaAnswer('');
    try {
      const { answer } = await askSessionQuestion(transcript, q);
      setQaAnswer(answer);
    } catch (e) {
      setQaAnswer(e instanceof Error ? e.message : '问答失败，请检查网关连通性');
    } finally {
      setQaLoading(false);
    }
  }, [qaQuestion, transcript, qaLoading]);

  /** 一键生成闪卡 */
  const handleGenerateCards = useCallback(async () => {
    if (!transcript.trim() || cardsLoading) return;
    setCardsLoading(true);
    try {
      const count = await generateFlashcardsFromTranscript(transcript);
      toast({ type: 'success', message: `已生成 ${count} 张闪卡（新牌组）` });
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : '闪卡生成失败' });
    } finally {
      setCardsLoading(false);
    }
  }, [transcript, cardsLoading, toast]);

  const inProgress = busy || recording;
  const isError = progress.stage === 'error';
  const hasTranscript = transcript.trim().length > 0;

  return (
    <div className="space-y-2.5">
      {/* 状态横幅 */}
      <div
        className={cn(
          'px-3 py-2 rounded-kb-lg text-b3 border',
          isError
            ? 'bg-semantic-error/5 border-semantic-error/15 text-semantic-error'
            : progress.stage === 'done'
              ? 'bg-brand-500/5 border-brand-400/20 text-brand-600'
              : 'bg-bg-elevated/60 border-border/30 text-text-secondary',
        )}
      >
        <div className="flex items-center gap-1.5">
          {isError ? (
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          ) : progress.stage === 'done' ? (
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          ) : inProgress ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
          ) : null}
          <span className="font-medium">{STAGE_LABELS[progress.stage]}：</span>
          <span className="truncate">{progress.message}</span>
        </div>
        {progress.total != null && progress.current != null && (
          <div className="mt-1.5 h-1 rounded-full bg-bg-tertiary overflow-hidden">
            <div
              className="h-full bg-brand-500 transition-all"
              style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* 实时字幕（录屏期间） */}
      {recording && (
        <div className="px-3 py-2 rounded-kb-lg bg-black/30 border border-white/10 text-b3 text-text-primary min-h-[3rem] max-h-24 overflow-y-auto">
          <p className="text-[11px] text-text-tertiary mb-1">实时字幕（本地 ASR）</p>
          <p className="leading-relaxed">{subtitle || '等待语音…'}</p>
        </div>
      )}

      {/* 操作按钮 */}
      <button
        onClick={handleImportVideo}
        disabled={inProgress}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-kb-lg border border-dashed border-border/60 text-text-secondary hover:text-brand-600 hover:border-brand-400 active:scale-[0.98] transition-all text-b3 disabled:opacity-60"
      >
        <Upload className="w-4 h-4" /> 导入视频生成笔记（≤60 分钟）
      </button>

      {recording ? (
        <button
          onClick={handleStopRecording}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-kb-lg bg-semantic-error/10 border border-semantic-error/30 text-semantic-error active:scale-[0.98] transition-all text-b3 disabled:opacity-60"
        >
          <Square className="w-4 h-4" /> 停止录屏并生成笔记
        </button>
      ) : (
        <button
          onClick={handleStartRecording}
          disabled={inProgress}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-kb-lg bg-brand-600/90 text-white hover:bg-brand-600 active:scale-[0.98] transition-all text-b3 disabled:opacity-60"
        >
          <MonitorPlay className="w-4 h-4" /> 录屏采集（边看网课边记）
        </button>
      )}

      {/* 转写后增强：问答 + 闪卡 */}
      {hasTranscript && !recording && (
        <div className="space-y-2 pt-1 border-t border-border/20">
          <p className="text-[11px] text-text-tertiary">转写完成（{transcript.length} 字），可继续：</p>
          <div className="flex gap-2">
            <input
              value={qaQuestion}
              onChange={(e) => setQaQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
              placeholder="向这节课提问，如：核心概念是什么？"
              className="flex-1 px-2.5 py-1.5 rounded-kb-md border border-border/50 text-[12px] bg-bg-elevated/50 focus:outline-none focus:border-brand-400"
            />
            <button
              onClick={handleAsk}
              disabled={qaLoading || !qaQuestion.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-kb-md bg-brand-500/10 border border-brand-400/30 text-brand-600 text-[12px] active:scale-95 transition-all disabled:opacity-50"
            >
              {qaLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircleQuestion className="w-3.5 h-3.5" />}
              提问
            </button>
          </div>
          {qaAnswer && (
            <div className="px-3 py-2 rounded-kb-lg bg-bg-elevated/60 border border-border/30 text-b3 leading-relaxed max-h-40 overflow-y-auto">
              {qaAnswer}
            </div>
          )}
          <button
            onClick={handleGenerateCards}
            disabled={cardsLoading}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-kb-lg border border-dashed border-border/60 text-text-secondary hover:text-brand-600 hover:border-brand-400 active:scale-[0.98] transition-all text-b3 disabled:opacity-60"
          >
            {cardsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            一键生成间隔重复闪卡
          </button>
        </div>
      )}

      {isError && (
        <p className="text-[11px] text-text-tertiary text-center">
          可重试，或检查 AI 网关连通性后再次尝试
        </p>
      )}
    </div>
  );
}
