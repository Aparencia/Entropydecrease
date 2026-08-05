/**
 * 课堂问答面板 — "问这节课"
 * Session QA panel — ask about this class
 *
 * @ai-context: D2 课堂问答 UI：以当前课堂转写为上下文回答问题，答案附带
 * 引用来源（时间戳+摘录）。AI 不可用时提示重试（可选增强，不阻塞课堂
 * 主流程）。上下文在父组件拼接（fine 段/smart 实时转录）。
 * @ai-context: D2 session-QA panel: grounded Q&A over the current class
 * transcript with source references; degrades gracefully on AI failure.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircleQuestion, Send, Loader2, Quote, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/AuthContext';

interface QaReference {
  time: string;
  text: string;
}

interface SessionQAPanelProps {
  /** 课堂转写文本（父组件拼接） */
  transcript: string;
  className?: string;
}

export default function SessionQAPanel({ transcript, className }: SessionQAPanelProps) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [references, setReferences] = useState<QaReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAsk = question.trim().length > 0 && transcript.trim().length > 0 && !loading;

  const handleAsk = async () => {
    if (!canAsk) return;
    // 非 Electron 环境（PWA）无 IPC 桥——课堂问答依赖主进程 AI 链路，明确提示
    if (!window.electronAPI) {
      setError('桌面版才支持课堂问答，请使用应用内课堂助手');
      return;
    }
    setLoading(true);
    setError(null);
    setAnswer('');
    setReferences([]);
    try {
      const resp = await window.electronAPI.invoke('ai_session_qa', {
        question: question.trim(),
        transcript: transcript.slice(0, 8000),
        authToken: session?.access_token ?? null,
      }) as {
        answer?: string;
        references?: QaReference[];
        status?: string;
      };
      if (resp.status === 'degraded' || !resp.answer) {
        setError('这次没能生成回答，请稍后重试');
      } else {
        setAnswer(resp.answer);
        setReferences(resp.references ?? []);
      }
    } catch {
      setError('AI 服务暂不可用，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (transcript.trim().length === 0) return null;

  return (
    <div className={cn('border-t border-border/20', className)}>
      <AnimatePresence initial={false}>
        {!open ? (
          <motion.button
            key="closed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(true)}
            className="flex w-full items-center gap-2 px-4 py-3 text-b3 text-text-secondary transition-colors hover:text-brand-400 hover:bg-brand-500/5"
          >
            <MessageCircleQuestion className="w-4 h-4" strokeWidth={1.5} />
            问这节课
            <span className="ml-auto text-c1 text-text-tertiary">基于本次转写回答，带引用</span>
          </motion.button>
        ) : (
          <motion.div
            key="open"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-b3 font-semibold text-text-primary">
                  <MessageCircleQuestion className="w-4 h-4 text-cyan-500" strokeWidth={1.5} />
                  问这节课
                </h3>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1 text-text-tertiary transition-colors hover:text-text-primary"
                  aria-label="收起问答面板"
                >
                  <X className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAsk(); }}
                  placeholder="例如：老师刚才讲的那个定理怎么推导的？"
                  className="min-w-0 flex-1 rounded-kb-lg border border-border/30 bg-bg-elevated/40 px-3 py-2 text-b3 text-text-primary placeholder:text-text-tertiary focus:border-cyan-400/50 focus:outline-none"
                  aria-label="课堂问题输入"
                />
                <button
                  onClick={() => void handleAsk()}
                  disabled={!canAsk}
                  className={cn(
                    'flex items-center gap-1.5 rounded-kb-lg px-3 py-2 text-b3 font-medium transition-all active:scale-95',
                    canAsk
                      ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                      : 'bg-bg-tertiary/40 text-text-tertiary cursor-not-allowed',
                  )}
                  aria-label="提问"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" strokeWidth={1.5} />}
                </button>
              </div>

              {error && <p className="mt-2 text-c1 text-semantic-error">{error}</p>}

              {answer && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 rounded-kb-lg border border-cyan-500/15 bg-cyan-500/[0.04] p-3"
                >
                  <p className="text-b3 text-text-primary leading-relaxed">{answer}</p>
                  {references.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-border/20 pt-2">
                      {references.map((ref, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-c1 text-text-tertiary">
                          <Quote className="mt-0.5 w-3 h-3 flex-shrink-0 text-cyan-500/60" strokeWidth={1.5} />
                          <span className="tabular-nums text-cyan-500/80">{ref.time}</span>
                          <span className="line-clamp-2">{ref.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
