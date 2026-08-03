/**
 * MiniQuizDialog — N1 课程级迷你测试
 *
 * @ai-context: 选定多篇笔记 → AI 生成混合题型测试 → 逐题作答即时反馈 →
 * 错题一键转闪卡（复用 useFlashcardStore.createCard + 默认牌组）。
 * 测试效应：主动提取比被动重读更能巩固记忆；AI 不可用时入口侧提示降级。
 */
import { useState, useCallback, useMemo } from 'react';
import { Modal, Button } from '@/components/ui';
import { useToast } from '@/components/ui';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { CheckCircle2, XCircle, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIQuiz } from '@/lib/ai/hooks/useAIQuiz';
import { useFlashcardStore } from '@/features/flashcards/store/useFlashcardStore';
import type { Note } from '@/types/models';
import type { QuizQuestion } from '@/lib/ai/types';

/** 从 TipTap JSON 或纯文本中提取纯文本 */
function extractText(content: string): string {
  try {
    const json = JSON.parse(content);
    if (json?.content) {
      const walk = (nodes: unknown[]): string => nodes.map((n) => {
        const node = n as { text?: string; content?: unknown[] };
        return (node.text ?? '') + (node.content ? walk(node.content) : '');
      }).join('');
      return walk(json.content);
    }
    return '';
  } catch {
    return content;
  }
}

/** 规范化比较：去空白、小写、全半角不敏感 */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

type Phase = 'select' | 'loading' | 'quiz' | 'done';

interface AnswerRecord {
  question: QuizQuestion;
  userAnswer: string;
  correct: boolean;
}

interface MiniQuizDialogProps {
  open: boolean;
  onClose: () => void;
  /** 候选笔记（当前列表筛选结果） */
  notes: Note[];
}

export function MiniQuizDialog({ open, onClose, notes }: MiniQuizDialogProps) {
  const [phase, setPhase] = useState<Phase>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [input, setInput] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [records, setRecords] = useState<AnswerRecord[]>([]);
  const [converted, setConverted] = useState<Set<number>>(new Set());
  const { quiz, loading, error, generate, reset } = useAIQuiz();
  const { toast } = useToast();

  const candidates = useMemo(() => notes.filter((n) => extractText(n.content).length >= 30), [notes]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleGenerate = useCallback(async () => {
    const picked = candidates.filter((n) => selectedIds.includes(n.id));
    if (picked.length === 0) return;
    const merged = picked.map((n) => `【${n.title || '未命名'}】\n${extractText(n.content)}`).join('\n\n');
    setPhase('loading');
    const result = await generate(merged);
    if (result) {
      setRecords([]);
      setCurrentIndex(0);
      setInput('');
      setRevealed(false);
      setConverted(new Set());
      setPhase('quiz');
    } else {
      setPhase('select');
    }
  }, [candidates, selectedIds, generate]);

  const submit = (userAnswer: string, correct: boolean) => {
    if (!quiz) return;
    setLastCorrect(correct);
    setRevealed(true);
    setRecords((prev) => [...prev, { question: quiz.questions[currentIndex], userAnswer, correct }]);
  };

  const next = () => {
    if (!quiz) return;
    if (currentIndex + 1 >= quiz.questions.length) {
      setPhase('done');
    } else {
      setCurrentIndex((i) => i + 1);
      setInput('');
      setRevealed(false);
    }
  };

  /** 错题转闪卡：front=题干，back=答案+解析 */
  const convertToCard = useCallback(async (index: number) => {
    const rec = records[index];
    if (!rec) return;
    try {
      const { loadDecks, createDeck, createCard, decks } = useFlashcardStore.getState();
      await loadDecks();
      const currentDecks = useFlashcardStore.getState().decks || decks;
      const deckId = currentDecks.length > 0 ? currentDecks[0].id : await createDeck('AI 闪卡', '迷你测试错题');
      await createCard({
        deckId,
        front: rec.question.question,
        back: rec.question.answer + (rec.question.explanation ? `\n\n${rec.question.explanation}` : ''),
        type: 'basic',
      });
      setConverted((prev) => new Set(prev).add(index));
      toast({ type: 'success', message: '已转为闪卡，稍后复习巩固' });
    } catch {
      toast({ type: 'error', message: '转闪卡失败，请稍后重试' });
    }
  }, [records, toast]);

  const handleClose = () => {
    reset();
    setPhase('select');
    setSelectedIds([]);
    onClose();
  };

  const correctCount = records.filter((r) => r.correct).length;

  return (
    <Modal open={open} onClose={handleClose} title="课程级迷你测试" size="lg">
      {/* 阶段一：选择笔记 */}
      {phase === 'select' && (
        <div className="flex flex-col gap-3">
          <p className="text-b2 text-text-secondary">选择 1-5 篇笔记，AI 将生成一份 5-10 题的小测试。</p>
          <div className="max-h-64 overflow-y-auto flex flex-col gap-1.5">
            {candidates.length === 0 && <p className="text-c1 text-text-tertiary py-4 text-center">当前没有内容足够的笔记</p>}
            {candidates.map((n) => (
              <label key={n.id} className="flex items-center gap-2 p-2 rounded-kb-md hover:bg-bg-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(n.id)}
                  onChange={() => toggleSelect(n.id)}
                  className="accent-[var(--kb-brand-500)]"
                />
                <span className="text-b2 text-text-primary truncate">{n.title || '未命名笔记'}</span>
              </label>
            ))}
          </div>
          {error && <p className="text-c1 text-semantic-error">{error}</p>}
          <Button
            disabled={selectedIds.length === 0 || selectedIds.length > 5 || loading}
            onClick={handleGenerate}
          >
            生成测试（{selectedIds.length} 篇）
          </Button>
        </div>
      )}

      {/* 阶段二：生成中 */}
      {phase === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <AIThinkingIndicator size={5} gap={4} />
          <p className="text-b2 text-text-secondary">AI 正在出题，大约需要 10-20 秒…</p>
        </div>
      )}

      {/* 阶段三：答题 */}
      {phase === 'quiz' && quiz && quiz.questions[currentIndex] && (() => {
        const q = quiz.questions[currentIndex];
        return (
          <div className="flex flex-col gap-3">
            <p className="text-c1 text-text-tertiary">第 {currentIndex + 1} / {quiz.questions.length} 题</p>
            <p className="text-b1 text-text-primary font-medium leading-relaxed">{q.question}</p>

            {q.type === 'choice' && (
              <div className="flex flex-col gap-1.5">
                {q.options.map((opt, i) => {
                  const letter = String.fromCharCode(65 + i);
                  return (
                    <button
                      key={opt}
                      disabled={revealed}
                      onClick={() => submit(letter, letter === q.answer.trim().toUpperCase())}
                      className={cn(
                        'text-left p-2.5 rounded-kb-md border text-b2 transition-colors',
                        revealed && letter === q.answer.trim().toUpperCase()
                          ? 'border-semantic-success/50 bg-semantic-success/10 text-semantic-success'
                          : 'border-border/40 bg-bg-secondary hover:bg-bg-tertiary text-text-primary',
                      )}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === 'fill_blank' && !revealed && (
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && input.trim()) submit(input, normalize(input).includes(normalize(q.answer))); }}
                  placeholder="填入答案…"
                  className="flex-1 px-3 py-2 rounded-kb-md border border-border/40 bg-bg-secondary text-b2 text-text-primary outline-none focus:border-focus"
                />
                <Button disabled={!input.trim()} onClick={() => submit(input, normalize(input).includes(normalize(q.answer)))}>提交</Button>
              </div>
            )}

            {q.type === 'short_answer' && !revealed && (
              <div className="flex flex-col gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="写下你的答案…"
                  rows={3}
                  className="px-3 py-2 rounded-kb-md border border-border/40 bg-bg-secondary text-b2 text-text-primary outline-none focus:border-focus resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => submit(input, true)}>我答对了</Button>
                  <Button variant="secondary" onClick={() => submit(input, false)}>没答上来</Button>
                </div>
              </div>
            )}

            {/* 即时反馈 */}
            {revealed && (
              <div className={cn('p-3 rounded-kb-md border', lastCorrect ? 'border-semantic-success/30 bg-semantic-success/5' : 'border-semantic-error/30 bg-semantic-error/5')}>
                <div className="flex items-center gap-1.5 mb-1">
                  {lastCorrect
                    ? <><CheckCircle2 className="w-4 h-4 text-semantic-success" strokeWidth={1.5} /><span className="text-b2 font-medium text-semantic-success">答对了！</span></>
                    : <><XCircle className="w-4 h-4 text-semantic-error" strokeWidth={1.5} /><span className="text-b2 font-medium text-semantic-error">没关系，正好查漏补缺</span></>}
                </div>
                <p className="text-b2 text-text-primary">参考答案：{q.answer}</p>
                {q.explanation && <p className="text-c1 text-text-secondary mt-1">{q.explanation}</p>}
                <Button className="mt-2" onClick={next}>{currentIndex + 1 >= quiz.questions.length ? '看结果' : '下一题'}</Button>
              </div>
            )}
          </div>
        );
      })()}

      {/* 阶段四：结果与错题定位 */}
      {phase === 'done' && (
        <div className="flex flex-col gap-3">
          <p className="text-b1 text-text-primary font-medium">
            完成！答对 {correctCount} / {records.length} 题
            {correctCount === records.length ? '，全部命中，太棒了！' : '，错题已帮你标出。'}
          </p>
          {records.filter((r) => !r.correct).length === 0 ? (
            <Button onClick={handleClose}>收工</Button>
          ) : (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {records.map((r, i) => r.correct ? null : (
                <div key={i} className="p-2.5 rounded-kb-md bg-bg-secondary border border-border/30">
                  <p className="text-b2 text-text-primary">{r.question.question}</p>
                  <p className="text-c1 text-text-tertiary mt-0.5">概念：{r.question.concept || '—'} · 答案：{r.question.answer}</p>
                  <button
                    disabled={converted.has(i)}
                    onClick={() => convertToCard(i)}
                    className={cn(
                      'mt-1.5 flex items-center gap-1 px-2 py-1 rounded-kb-full text-c1 font-medium',
                      converted.has(i) ? 'bg-bg-tertiary text-text-tertiary' : 'bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors',
                    )}
                  >
                    <Layers className="w-3 h-3" strokeWidth={1.5} />
                    {converted.has(i) ? '已转闪卡' : '转为闪卡复习'}
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button variant="secondary" onClick={handleClose}>关闭</Button>
        </div>
      )}
    </Modal>
  );
}
