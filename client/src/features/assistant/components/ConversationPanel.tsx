/**
 * 对话面板主容器
 *
 * @ai-context: 右侧滑出面板——弹簧动画进出（Framer Motion spring）；
 * 头部水母标识 + 关闭按钮，中部消息列表，底部输入框。
 * 面板未展开时不挂载（条件渲染），零空闲开销。
 */
import { motion } from 'framer-motion';
import { useAssistantStore } from '../store/useAssistantStore';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { PANEL_WIDTH } from '../constants';

interface Props {
  onSend: (text: string) => void;
  onClose: () => void;
  onRetry?: () => void;
  onDismiss?: (id: string) => void;
}

export function ConversationPanel({ onSend, onClose, onRetry, onDismiss }: Props) {
  const messages = useAssistantStore(s => s.messages);
  const isStreaming = useAssistantStore(s => s.isStreaming);

  return (
    <motion.div
      data-work-area="conversation-panel"
      initial={{ x: PANEL_WIDTH, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: PANEL_WIDTH, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="fixed right-0 top-14 bottom-0 z-40 flex flex-col"
      style={{ width: PANEL_WIDTH }}
    >
      <div className="flex flex-col h-full bg-bg-primary/95 backdrop-blur-xl border-l border-border/40 shadow-kb-lg">
        {/* 头部 */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/40">
          <span className="text-xl">🪼</span>
          <span className="text-sm font-medium text-text-primary">深潜伙伴</span>
          <button
            onClick={onClose}
            className="ml-auto text-text-tertiary hover:text-text-primary text-lg transition-colors"
            aria-label="关闭对话面板"
          >
            ✕
          </button>
        </div>

        {/* 消息列表 */}
        <MessageList messages={messages} isStreaming={isStreaming} onRetry={onRetry} onDismiss={onDismiss} />

        {/* 输入框 */}
        <ChatInput onSend={onSend} />
      </div>
    </motion.div>
  );
}
