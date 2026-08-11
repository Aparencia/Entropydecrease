/**
 * SOP 全屏沉浸执行器 — 步骤推进与跨模块跳转
 * SOP fullscreen runner — step advancement and module handoff
 *
 * @ai-context: 挂在 AppLayout 外（仿 /onboarding），绕开 3D canvas。
 * 状态机：running → 逐步推进 → completed｜aborted；module 步骤点击跳转
 * 前置 awaiting_module（sop_runs 四态之一），用户从模块返回后继续推进。
 * 一期跨模块方案：路由跳转 + URL 参数（无调度器）。
 * @ai-context: Mounted outside AppLayout; module steps mark the run as
 * awaiting_module before navigating away, then resume on return.
 */
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ExternalLink, Flag, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui';
import { useSopStore, STEP_TYPE_META } from '../store/useSopStore';
import { parseStepProgress } from '../types';
import { templateTotalMinutes } from '../types';

export default function SopRunPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { loadAll, getRunView, completeStep, setModuleAwaiting, abortRun } = useSopStore();

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const view = useMemo(() => (runId ? getRunView(runId) : null), [runId, getRunView]);

  if (!view) {
    return (
      <div className="bg-bg-primary flex min-h-screen flex-col items-center justify-center gap-3 p-6">
        <p className="text-b2 text-text-secondary">流程不存在或已加载中…</p>
        <Button variant="secondary" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/sop')}>
          返回流程库
        </Button>
      </div>
    );
  }

  const { run, template } = view;
  const steps = template.steps;
  const progress = parseStepProgress(run.step_progress);
  const currentStep = steps[run.current_step_index] ?? null;
  const isDone = run.status === 'completed';
  const isAborted = run.status === 'aborted';
  const isAwaiting = run.status === 'awaiting_module';
  const totalMinutes = templateTotalMinutes(template);
  const doneCount = steps.filter((s) => progress[s.id]?.status === 'done').length;

  const handleComplete = () => {
    if (!currentStep) return;
    void completeStep(run.id, currentStep.id);
  };

  const handleSkip = () => {
    if (!currentStep) return;
    void completeStep(run.id, currentStep.id, true);
  };

  const handleModuleJump = () => {
    if (!currentStep?.configParsed.target) return;
    void setModuleAwaiting(run.id);
    navigate(currentStep.configParsed.target);
  };

  const handleAbort = () => {
    void abortRun(run.id);
    navigate('/sop');
  };

  const stepTypeMeta = currentStep ? STEP_TYPE_META[currentStep.step_type] : null;

  return (
    <div className="bg-bg-primary flex min-h-screen flex-col p-6 sm:p-10">
      {/* ── 顶栏：模板信息 + 退出 ── */}
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden>{template.icon || '📋'}</span>
          <div>
            <h1 className="text-b1 font-semibold text-text-primary">{template.name}</h1>
            <p className="text-c1 text-text-tertiary">
              {steps.length} 步{totalMinutes > 0 && ` · 约 ${totalMinutes} 分钟`}
            </p>
          </div>
        </div>
        <Button size="sm" variant="ghost" icon={<X className="w-4 h-4" />} onClick={handleAbort}>
          中止
        </Button>
      </header>

      {/* ── 进度条 ── */}
      <div className="mx-auto mt-6 w-full max-w-2xl">
        <div className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-500 to-brand-500 transition-all duration-500"
            style={{ width: `${steps.length === 0 ? 0 : (doneCount / steps.length) * 100}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-c1 text-text-tertiary">
          <span>已完成 {doneCount}/{steps.length} 步</span>
          {isAwaiting && <span className="text-cyber">模块执行中——完成后返回本页继续</span>}
        </div>
      </div>

      {/* ── 主体 ── */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6">
        {isDone ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="kb-ritual-title text-3xl">流程完成</div>
            <p className="text-b2 text-text-secondary">
              {doneCount}/{steps.length} 步已完成——秩序已沉淀为下一次复利。
            </p>
            <Button variant="primary" icon={<RotateCcw className="w-4 h-4" />} onClick={() => navigate('/sop')}>
              返回流程库
            </Button>
          </div>
        ) : isAborted ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-b2 text-text-secondary">流程已中止。</p>
            <Button variant="secondary" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/sop')}>
              返回流程库
            </Button>
          </div>
        ) : currentStep ? (
          <>
            {/* 当前步骤卡 */}
            <div className="w-full rounded-3xl border border-border/40 bg-bg-secondary/60 p-8 text-center backdrop-blur-xl">
              <span className={`inline-block rounded-full px-3 py-1 text-c1 font-medium ${stepTypeMeta?.badge}`}>
                {stepTypeMeta?.label}
              </span>
              <h2 className="mt-4 text-2xl font-semibold text-text-primary">{currentStep.title}</h2>
              {currentStep.configParsed.durationMinutes ? (
                <p className="mt-2 text-c1 text-text-tertiary">
                  预期 {currentStep.configParsed.durationMinutes} 分钟
                </p>
              ) : (
                <p className="mt-2 text-c1 text-text-tertiary">
                  {currentStep.step_type === 'module'
                    ? `前往「${currentStep.configParsed.module || '目标模块'}」完成后返回`
                    : '按自己的节奏推进'}
                </p>
              )}
            </div>

            {/* 步骤预览 */}
            <div className="flex w-full flex-col gap-1.5">
              {steps.map((s, i) => {
                const entry = progress[s.id];
                const isCurrent = i === run.current_step_index;
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-c1 ${
                      isCurrent ? 'bg-accent-500/10 text-text-primary' : 'text-text-tertiary'
                    }`}
                  >
                    <span className="w-4 text-center">{i + 1}</span>
                    <span className="flex-1 truncate">
                      {entry?.status === 'done' ? <s>{s.title}</s> : s.title}
                    </span>
                    {entry?.status === 'done' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    {entry?.status === 'skipped' && <Flag className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                );
              })}
            </div>

            {/* 操作区 */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {currentStep.step_type === 'module' ? (
                <>
                  <Button variant="ai" size="lg" icon={<ExternalLink className="w-4 h-4" />} onClick={handleModuleJump}>
                    前往{currentStep.configParsed.module || '模块'}
                  </Button>
                  <Button variant="secondary" size="lg" icon={<Check className="w-4 h-4" />} onClick={handleComplete}>
                    已完成该模块
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="primary" size="lg" icon={<Check className="w-4 h-4" />} onClick={handleComplete}>
                    完成本步
                  </Button>
                  <Button variant="ghost" size="lg" icon={<ArrowRight className="w-4 h-4" />} onClick={handleSkip}>
                    跳过
                  </Button>
                </>
              )}
            </div>
          </>
        ) : (
          <p className="text-b2 text-text-secondary">流程没有步骤。</p>
        )}
      </main>
    </div>
  );
}
