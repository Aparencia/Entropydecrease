/**
 * AI 助手模块入口
 *
 * @ai-context: 在 App.tsx 中挂载一次——编排水母、面板、主动引擎、音频；
 * 偏好 enabled=false 时整体不渲染（零开销）。
 * 设计原则：可逆 > 不可逆——用户可随时关闭助手。
 */
import { AnimatePresence } from 'framer-motion';
import { useAssistantStore } from './store/useAssistantStore';
import { useChat } from './hooks/useChat';
import { useProactiveEngine, reportBubbleDismissed, reportBubbleResponded } from './hooks/useProactiveEngine';
import { useAssistantAudio } from './hooks/useAssistantAudio';
import { CreatureAvatar } from './components/CreatureAvatar';
import { ConversationPanel } from './components/ConversationPanel';

export function AssistantRoot() {
  const enabled = useAssistantStore(s => s.preferences.enabled);
  const panelState = useAssistantStore(s => s.panelState);
  const setPanelState = useAssistantStore(s => s.setPanelState);
  const setCreatureState = useAssistantStore(s => s.setCreatureState);

  const { sendMessage, retryLastMessage, dismissError } = useChat();
  const { playSound } = useAssistantAudio();
  useProactiveEngine();

  if (!enabled) return null;

  const handleCreatureClick = () => {
    playSound('ack');
    setPanelState('expanded');
    setCreatureState('listening');
  };

  const handleBubbleClick = () => {
    reportBubbleResponded();
    playSound('ack');
    setPanelState('expanded');
    setCreatureState('listening');
  };

  const handleBubbleDismiss = () => {
    reportBubbleDismissed();
    useAssistantStore.getState().hideBubble();
  };

  const handleClosePanel = () => {
    setPanelState('hidden');
    setCreatureState('idle');
  };

  return (
    <>
      <CreatureAvatar
        onClick={handleCreatureClick}
        onBubbleClick={handleBubbleClick}
        onBubbleDismiss={handleBubbleDismiss}
      />
      <AnimatePresence>
        {panelState === 'expanded' && (
          <ConversationPanel onSend={sendMessage} onClose={handleClosePanel} onRetry={retryLastMessage} onDismiss={dismissError} />
        )}
      </AnimatePresence>
    </>
  );
}
