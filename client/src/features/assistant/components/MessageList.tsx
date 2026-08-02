/**
 * 消息列表（自动滚底）
 *
 * @ai-context: 新消息/流式 chunk 时自动平滑滚动到底部；
 * 空状态显示欢迎语（降低首次使用门槛）。
 */
import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
  onRetry?: () => void;
  onDismiss?: (id: string) => void;
}

export function MessageList({ messages, isStreaming, onRetry, onDismiss }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
      {messages.length === 0 && (
        <p className="text-center text-text-secondary text-sm mt-8">
          嗨，我是你的深潜伙伴 🪼<br />有任何学习问题都可以问我
        </p>
      )}
      {messages.map((msg, i) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'}
          onRetry={onRetry}
          onDismiss={onDismiss}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
