/**
 * AI 反问面板（追问生成 + 作答 + 理解度评估）
 *
 * @ai-context: 从 FeynmanSessionPage 拆出。纯展示 + 本地答案编辑；
 * 追问生成/提交评估的业务逻辑（含 toast 校验）由父组件经 onGenerate/
 * onSubmit 回调注入。理解度评分阈值文案（≥8 举一反三 / ≥6 较好）为
 * 产品定义。数据来自 useAIFeynmanQuestion / useAIFeynmanEvaluateAnswers。
 */
import { X, Check, Sparkles, MessageCircle, CheckCircle2, Circle, RefreshCw } from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { FeynmanQuestionResult, FeynmanAnswerEvalResult } from '@/lib/ai/types';

interface AIQuestionPanelProps {
  show: boolean;
  onShowChange: (v: boolean) => void;
  questionLoading: boolean;
  questionError: string | null;
  questionNeedsConfig: boolean;
  questionData: FeynmanQuestionResult | null;
  onGenerate: () => void;
  answers: string[];
  onAnswersChange: (answers: string[]) => void;
  answerEvalLoading: boolean;
  answerEvalError: string | null;
  answerEvalNeedsConfig: boolean;
  answerEvalData: FeynmanAnswerEvalResult | null;
  onSubmit: () => void;
  onGoSettings: () => void;
}

export function AIQuestionPanel({
  show, onShowChange,
  questionLoading, questionError, questionNeedsConfig, questionData, onGenerate,
  answers, onAnswersChange,
  answerEvalLoading, answerEvalError, answerEvalNeedsConfig, answerEvalData,
  onSubmit, onGoSettings,
}: AIQuestionPanelProps) {
  return (
    <div className={cn(
      'p-kb-md rounded-kb-lg',
      'bg-feynman/5 border border-feynman/20',
    )}>
      <div className="flex items-center justify-between mb-kb-md">
        <h3 className="text-b1 font-semibold text-text-primary flex items-center gap-2">
          <MessageCircle className="w-icon-sm h-icon-sm text-feynman" strokeWidth={1.5} />
          AI 反问
        </h3>
        {show && (
          <button
            onClick={() => onShowChange(false)}
            className="p-1 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {!show && (
        <button
          onClick={onGenerate}
          disabled={questionLoading}
          className={cn(
            'w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-kb-md text-b2 font-medium',
            'bg-feynman text-text-inverse',
            'hover:bg-feynman/90 active:scale-[0.98] transition-all duration-kb-fast',
            questionLoading && 'opacity-60 cursor-not-allowed',
          )}
        >
          {questionLoading ? (
            <AIThinkingIndicator size={4} gap={3} />
          ) : (
            <MessageCircle className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
          )}
          让 AI 反问
        </button>
      )}

      {show && (
        <div className="flex flex-col gap-kb-md">
          {/* 加载中 */}
          {questionLoading && (
            <div className="flex items-center gap-2 text-b2 text-text-secondary py-4">
              <AIThinkingIndicator size={4} gap={3} />
              AI 正在思考追问...
            </div>
          )}

          {/* 错误 */}
          {questionError && !questionLoading && (
            <div className="p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
              {questionError}
              {questionNeedsConfig && (
                <button
                  onClick={onGoSettings}
                  className="mt-2 block text-b3 underline hover:no-underline"
                >
                  前往设置页配置 API Key
                </button>
              )}
            </div>
          )}

          {/* 追问卡片 */}
          {questionData && !questionLoading && (
            <div className="kb-ai-result-enter flex flex-col gap-kb-sm">
              <p className="text-b2 text-text-tertiary">
                以下是 AI 小白的追问，请试着回答：
              </p>
              {questionData.questions.map((q, i) => (
                <div
                  key={i}
                  className={cn(
                    'p-kb-md rounded-kb-md',
                    'bg-bg-elevated border border-border/40',
                  )}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-kb-full bg-feynman/10 text-feynman text-c1 font-semibold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-b2 text-text-primary font-medium">{q.question}</p>
                      {q.focus && (
                        <p className="text-c1 text-text-tertiary mt-0.5">聚焦：{q.focus}</p>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={answers[i] || ''}
                    onChange={(e) => {
                      const newAnswers = [...answers];
                      newAnswers[i] = e.target.value;
                      onAnswersChange(newAnswers);
                    }}
                    placeholder="在这里写下你的回答..."
                    className={cn(
                      'w-full mt-2 p-2.5 rounded-kb-md',
                      'bg-bg-secondary border border-border/40',
                      'text-b2 text-text-primary placeholder:text-text-tertiary/60',
                      'outline-none resize-none min-h-[80px]',
                      'focus:border-feynman/50 focus:ring-1 focus:ring-feynman/20 transition-all duration-kb-fast',
                    )}
                  />
                </div>
              ))}

              {/* 提交回答按钮 */}
              {questionData.questions.length > 0 && (
                <Button
                  variant="ai"
                  size="md"
                  className="w-full"
                  onClick={onSubmit}
                  disabled={answerEvalLoading || answers.every(a => !a?.trim())}
                  loading={answerEvalLoading}
                  icon={!answerEvalLoading ? <Check className="w-4 h-4" strokeWidth={2} /> : undefined}
                >
                  提交回答，查看理解度评估
                </Button>
              )}

              {/* 评估结果 */}
              {answerEvalLoading && (
                <div className="flex items-center gap-2 text-b2 text-text-secondary py-4">
                  <AIThinkingIndicator size={4} gap={3} />
                  正在评估你的回答...
                </div>
              )}

              {answerEvalError && !answerEvalLoading && (
                <div className="p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
                  {answerEvalError}
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={onSubmit}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium bg-bg-secondary text-text-secondary border border-border/50 hover:bg-bg-tertiary hover:text-text-primary active:scale-95 transition-all duration-kb-fast"
                    >
                      <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
                      重新提交
                    </button>
                    {answerEvalNeedsConfig && (
                      <button
                        onClick={onGoSettings}
                        className="text-b3 underline hover:no-underline"
                      >
                        前往设置页配置 API Key
                      </button>
                    )}
                  </div>
                </div>
              )}

              {answerEvalData && !answerEvalLoading && (
                <div className={cn(
                  'p-kb-md rounded-kb-md kb-ai-result-enter',
                  'bg-brand-600/5 border border-brand-500/20',
                )}>
                  <h4 className="text-b1 font-semibold text-text-primary mb-kb-md flex items-center gap-2">
                    <Sparkles className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
                    理解度评估
                  </h4>

                  {/* 分数 */}
                  <div className="flex items-center gap-3 mb-kb-md">
                    <div className={cn(
                      'w-14 h-14 rounded-kb-full flex items-center justify-center flex-shrink-0',
                      'bg-feynman/10 text-feynman text-h2 font-bold',
                    )}>
                      {answerEvalData.understandingScore}
                    </div>
                    <div>
                      <p className="text-b1 font-semibold text-text-primary">理解度评分</p>
                      <p className="text-b2 text-text-tertiary">
                        {answerEvalData.understandingScore >= 8
                          ? '深入理解，能举一反三！'
                          : answerEvalData.understandingScore >= 6
                            ? '理解较好，还有深化空间'
                            : '建议继续学习，加深理解'}
                      </p>
                    </div>
                  </div>

                  {/* 反馈 */}
                  {answerEvalData.feedback && (
                    <p className="text-b2 text-text-secondary mb-kb-md leading-relaxed">
                      {answerEvalData.feedback}
                    </p>
                  )}

                  {/* 强项 */}
                  {answerEvalData.strongPoints.length > 0 && (
                    <div className="mb-2">
                      <p className="text-b3 font-medium text-semantic-success uppercase tracking-wide mb-1">强项</p>
                      <ul className="flex flex-col gap-1">
                        {answerEvalData.strongPoints.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-b2 text-text-secondary">
                            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-semantic-success flex-shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 薄弱点 */}
                  {answerEvalData.weakPoints.length > 0 && (
                    <div>
                      <p className="text-b3 font-medium text-semantic-error uppercase tracking-wide mb-1">待加强</p>
                      <ul className="flex flex-col gap-1">
                        {answerEvalData.weakPoints.map((w, i) => (
                          <li key={i} className="flex items-start gap-2 text-b2 text-text-secondary">
                            <Circle className="w-3.5 h-3.5 mt-0.5 text-rose-400 flex-shrink-0" />
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
