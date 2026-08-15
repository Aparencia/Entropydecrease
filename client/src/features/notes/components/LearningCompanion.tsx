/**
 * AI 学习伴侣——多模式对话面板
 * AI learning companion — multi-mode dialogue panel
 *
 * @ai-context: 支持 4 种对话模式：苏格拉底/教师/辩论/类比。每种模式有
 * 不同的 AI prompt 和追问策略。对话历史与当前笔记关联，可一键插入。
 * @ai-context: Supports 4 dialogue modes: Socratic/Teacher/Debate/Analogy.
 * Each mode has different AI prompts and questioning strategies.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageSquare, HelpCircle, BookOpen, Shield, GitBranch, Plus } from 'lucide-react';
import { aiPluginLoader } from '@/lib/ai/AIPluginLoader';
import { useToast } from '@/components/ui';
import { cn } from '@/lib/utils';

type CompanionMode = 'socratic' | 'teacher' | 'debate' | 'analogy';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MODE_CONFIG: Record<CompanionMode, { label: string; icon: React.FC<React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>; color: string; desc: string }> = {
  socratic: { label: '苏格拉底', icon: HelpCircle, color: 'text-brand-500', desc: '通过追问引导你自主发现答案' },
  teacher: { label: '教师模式', icon: BookOpen, color: 'text-blue-500', desc: '直接讲解概念，提供例子和类比' },
  debate: { label: '辩论模式', icon: Shield, color: 'text-red-500', desc: '提出反方论点，帮你多角度审视' },
  analogy: { label: '类比模式', icon: GitBranch, color: 'text-emerald-500', desc: '用熟悉的事物类比复杂概念' },
};

const MODE_PROMPTS: Record<CompanionMode, (context: string, question: string) => string> = {
  socratic: (ctx, q) => `你是一个苏格拉底式学习助手。不要直接给答案，通过追问引导用户思考。\n上下文：${ctx}\n用户：${q}`,
  teacher: (ctx, q) => `你是一个耐心的教师。清晰解释概念，提供具体例子。\n上下文：${ctx}\n用户：${q}`,
  debate: (ctx, q) => `你是一个辩论对手。对用户观点提出反方论证，要求用证据支持论点。\n上下文：${ctx}\n用户：${q}`,
  analogy: (ctx, q) => `你是一个类比大师。用用户熟悉的事物做类比来解释复杂概念。\n上下文：${ctx}\n用户：${q}`,
};

interface LearningCompanionProps {
  noteContext: string;
  selectedText: string;
  isOpen: boolean;
  onClose: () => void;
  onInsertText: (text: string) => void;
}

export function LearningCompanion({
  noteContext,
  selectedText,
  isOpen,
  onClose,
  onInsertText,
}: LearningCompanionProps) {
  const [mode, setMode] = useState<CompanionMode>('socratic');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const initialText = selectedText
        ? `我注意到你选中了「${selectedText.slice(0, 60)}」。想用什么方式讨论？`
        : '有什么想讨论的内容吗？';
      setMessages([{ role: 'assistant', content: initialText }]);
    }
    // Why: 刻意不含 messages.length——切换对话模式会 setMessages([]) 清空历史，
    // 若把 messages.length 加入依赖，模式切换后 effect 会重新注入开场白，
    // 改变"清空后保持空白"的现有交互语义。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedText]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const context = `笔记上下文：${noteContext.slice(0, 300)}${selectedText ? `\n选中内容：${selectedText.slice(0, 150)}` : ''}`;
      const prompt = MODE_PROMPTS[mode](context, userMsg.content);
      const result = await aiPluginLoader.summarizeNote(prompt, { style: 'paragraph' });
      setMessages((prev) => [...prev, { role: 'assistant', content: result?.summary || '思考中...' }]);
    } catch {
      toast({ type: 'error', message: 'AI 响应失败' });
    } finally {
      setLoading(false);
    }
  }, [input, loading, mode, noteContext, selectedText, toast]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed bottom-0 right-0 w-96 h-[480px] z-50 backdrop-blur-xl bg-bg-elevated/95 border-l border-t border-border/40 shadow-kb-lg rounded-tl-xl flex flex-col"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 flex-shrink-0">
            <MessageSquare className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
            <span className="text-b3 font-medium text-text-primary flex-1">AI 学习伴侣</span>
            <button onClick={() => { const text = messages.map((m) => `**${m.role === 'user' ? '我' : 'AI'}**: ${m.content}`).join('\n\n'); onInsertText(`\n\n--- AI 讨论 ---\n${text}\n---\n`); toast({ type: 'success', message: '已插入', silent: true }); onClose(); }}
              className="p-1 text-text-tertiary hover:text-brand-600 transition-colors" title="插入对话">
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <button onClick={onClose} className="p-1 text-text-tertiary hover:text-text-primary transition-colors">
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex gap-1 px-3 py-2 border-b border-border/20 bg-bg-elevated/50">
            {(Object.entries(MODE_CONFIG) as [CompanionMode, typeof MODE_CONFIG['socratic']][]).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <button key={key} onClick={() => { setMode(key); setMessages([]); }}
                  className={cn('flex items-center gap-1 px-2 py-1 rounded-kb-full text-c1 font-medium transition-colors', mode === key ? `${config.color} bg-brand-500/10` : 'text-text-tertiary hover:text-text-secondary')}>
                  <Icon className="w-3 h-3" strokeWidth={1.5} />{config.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[85%] p-2.5 rounded-kb-md text-b2 leading-relaxed', msg.role === 'user' ? 'bg-brand-500 text-white rounded-br-kb-sm' : 'bg-bg-secondary text-text-secondary rounded-bl-kb-sm')}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && <div className="flex items-center gap-2 text-text-tertiary"><div className="w-3 h-3 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" /><span className="text-c1">思考中...</span></div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t border-border/30 flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="输入你的想法..." className="flex-1 px-3 py-2 rounded-kb-md border border-border/30 bg-bg-primary text-b2 text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-brand-400 transition-colors" disabled={loading} />
            <button onClick={handleSend} disabled={loading || !input.trim()} className="p-2 rounded-kb-md bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors">
              <Send className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LearningCompanion;