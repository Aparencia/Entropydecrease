/**
 * 单条消息气泡
 *
 * @ai-context: 区分 user/assistant 样式——用户右对齐蓝色，助手左对齐玻璃拟态；
 * assistant 消息流式生成时末尾显示 StreamingCursor；
 * 连接失败时显示重试/关闭按钮（可逆 > 不可逆——用户可关闭错误消息）。
 */
import type { ChatMessage } from '../types';
import { StreamingCursor } from './StreamingCursor';
import { ERROR_MARKER } from '../hooks/useChat';

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
  onRetry?: () => void;
  onDismiss?: (id: string) => void;
}

export function MessageBubble({ message, isStreaming, onRetry, onDismiss }: Props) {
  const isUser = message.role === 'user';
  const isError = !isUser && message.content.includes(ERROR_MARKER);

  // 错误消息：显示提示 + 重试/关闭按钮
  if (isError) {
    const hasContent = message.content.replace(ERROR_MARKER, '').trim().length > 0;
    return (
      <div className="flex justify-start mb-3">
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed
          bg-bg-tertiary/70 backdrop-blur-sm text-text-primary border border-amber/20">
          {hasContent && (
            <p className="whitespace-pre-wrap break-words mb-2">{message.content.replace(ERROR_MARKER, '').trim()}</p>
          )}
          <p className="text-amber text-xs mb-2">连接中断，未能获取回复</p>
          <div className="flex gap-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-2.5 py-1 rounded-lg text-xs bg-brand-600/60 text-white
                  hover:bg-brand-500/70 transition-colors"
              >
                重试
              </button>
            )}
            {onDismiss && (
              <button
                onClick={() => onDismiss(message.id)}
                className="px-2.5 py-1 rounded-lg text-xs bg-bg-tertiary/80 text-text-secondary
                  hover:bg-bg-tertiary transition-colors"
              >
                关闭
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words
          ${isUser
            ? 'bg-brand-600/80 text-white rounded-br-sm'
            : 'bg-bg-tertiary/70 backdrop-blur-sm text-text-primary border border-cyber/10 rounded-bl-sm'
          }`}
      >
        {message.content}
        {isStreaming && <StreamingCursor />}
      </div>
    </div>
  );
}
