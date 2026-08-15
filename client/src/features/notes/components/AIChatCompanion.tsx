/**
 * 内联 AI 对话助手——编辑器内嵌 AI 讨论面板
 * Inline AI chat companion — embedded AI discussion panel in editor
 *
 * @ai-context: 选中文本后展开内联对话面板，AI 可引用选中文本进行苏格拉底
 * 式追问。对话结果可一键插入为笔记的一部分。对话历史与当前笔记关联。
 * @ai-context: Expands inline chat panel on text selection, AI conducts
 * Socratic questioning. Results can be inserted into the note.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageSquare, Plus } from 'lucide-react';
import { aiPluginLoader } from '@/lib/ai/AIPluginLoader';
import { useToast } from '@/components/ui';
import { cn } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatCompanionProps {
  /** 选中文本 */
  selectedText: string;
  /** 笔记上下文 */
  noteContext: string;
  isOpen: boolean;
  onClose: () => void;
  /** 插入对话结果到编辑器 */
  onInsertText: (text: string) => void;
}

export function AIChatCompanion({
  selectedText,
  noteContext,
  isOpen,
  onClose,
  onInsertText,
}: AIChatCompanionProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && selectedText && messages.length === 0) {
      const initial: ChatMessage = {
        role: 'assistant',
        content: `我注意到你选中了「${selectedText.slice(0, 80)}」这个内容。想聊聊哪些方面？我可以帮你：\n\n- 用苏格拉底式提问引导你深入思考\n- 解释这个概念\n- 提供相关例子或类比\n- 帮你整理思路`,
      };
      setMessages([initial]);
    }
  }, [isOpen, selectedText, messages.length]);

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
      const context = `笔记上下文：${noteContext.slice(0, 500)}\n选中内容：${selectedText.slice(0, 200)}`;
      const prompt = `你是一个苏格拉底式学习助手。基于以下上下文和对话历史，与用户进行深度对话。\n\n${context}\n\n用户问题：${userMsg.content}\n\n请用中文回复，引导用户自主发现答案。`;

      const result = await aiPluginLoader.summarizeNote(prompt, { style: 'paragraph' });
      const reply = result?.summary || '思考中...请稍后再试。';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '请求失败';
      setMessages((prev) => [...prev, { role: 'assistant', content: `抱歉，${msg}` }]);
      toast({ type: 'error', message: 'AI 响应失败' });
    } finally {
      setLoading(false);
    }
  }, [input, loading, noteContext, selectedText, toast]);

  const handleInsertConversation = useCallback(() => {
    const text = messages
      .map((m) => `**${m.role === 'user' ? '我' : 'AI'}**: ${m.content}`)
      .join('\n\n');
    onInsertText(`\n\n--- AI 讨论记录 ---\n${text}\n---\n`);
    toast({ type: 'success', message: '对话已插入笔记', silent: true });
    onClose();
  }, [messages, onInsertText, onClose, toast]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed bottom-0 right-0 w-96 h-[400px] z-50 backdrop-blur-xl bg-bg-elevated/95 border-l border-t border-border/40 shadow-kb-lg rounded-tl-xl flex flex-col"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 flex-shrink-0">
            <MessageSquare className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
            <span className="text-b3 font-medium text-text-primary flex-1">AI 讨论</span>
            <button
              onClick={handleInsertConversation}
              className="p-1 text-text-tertiary hover:text-brand-600 transition-colors"
              title="插入对话到笔记"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[80%] p-2.5 rounded-kb-md text-b2 leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-brand-500 text-white rounded-br-kb-sm'
                    : 'bg-bg-secondary text-text-secondary rounded-bl-kb-sm',
                )}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-text-tertiary">
                <div className="w-3 h-3 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
                <span className="text-c1">思考中...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t border-border/30 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="输入你的想法..."
              className="flex-1 px-3 py-2 rounded-kb-md border border-border/30 bg-bg-primary text-b2 text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-brand-400 transition-colors"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="p-2 rounded-kb-md bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AIChatCompanion;