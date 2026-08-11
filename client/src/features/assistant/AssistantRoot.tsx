/**
 * AI 助手模块入口
 *
 * @ai-context: 在 App.tsx 中挂载一次——编排水母、面板、主动引擎、音频；
 * 偏好 enabled=false 时整体不渲染（零开销）。
 * 设计原则：可逆 > 不可逆——用户可随时关闭助手。
 */
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAssistantStore } from './store/useAssistantStore';
import { useChat } from './hooks/useChat';
import { useProactiveEngine, reportBubbleDismissed, reportBubbleResponded } from './hooks/useProactiveEngine';
import { useAssistantAudio } from './hooks/useAssistantAudio';
import { useBehaviorSignals } from './hooks/useBehaviorSignals';
import { useUserActivity } from './hooks/useUserActivity';
import { useBedtimeReminder } from './hooks/useBedtimeReminder';
import { useIntentionCoach } from './hooks/useIntentionCoach';
import { useClassScheduleTrigger } from './hooks/useClassScheduleTrigger';
import { IncubationBreathing } from './components/IncubationBreathing';
import { BedtimeRoutine } from './components/BedtimeRoutine';
import { CreatureAvatar } from './components/CreatureAvatar';
import { ConversationPanel } from './components/ConversationPanel';

export function AssistantRoot() {
  const enabled = useAssistantStore(s => s.preferences.enabled);
  const panelState = useAssistantStore(s => s.panelState);
  const setPanelState = useAssistantStore(s => s.setPanelState);
  const setCreatureState = useAssistantStore(s => s.setCreatureState);
  // T4 孵化呼吸引导浮层可见性（stuck-incubation 气泡点击触发）
  const [incubationOpen, setIncubationOpen] = useState(false);
  // F3 睡前仪式完整版浮层可见性
  const [bedtimeRoutineOpen, setBedtimeRoutineOpen] = useState(false);
  const [bedtimeTopDeckId, setBedtimeTopDeckId] = useState<string | undefined>(undefined);

  const { sendMessage, retryLastMessage, dismissError } = useChat();
  const { playSound } = useAssistantAudio();
  useProactiveEngine();
  // 用户活跃状态检测：空闲 10 分钟 → 发射 user:idle，交互恢复 → 发射 user:active
  useUserActivity();
  // A1/A5 行为信号源：情绪分级与认知负荷共用，只发事件不干预
  useBehaviorSignals();
  // F3 睡前复习推荐：晚间窗口检测到期卡，只发事件由引擎决策是否触发
  useBedtimeReminder();
  // A4 实施意图教练：周期扫描到期意图，发 intention:due 事件
  useIntentionCoach();
  // 1.16 课前预习：周期扫描课表，开课前 30 分钟发 schedule:class-upcoming 事件
  useClassScheduleTrigger();

  if (!enabled) return null;

  const handleCreatureClick = () => {
    playSound('ack');
    setPanelState('expanded');
    setCreatureState('listening');
  };

  const handleBubbleClick = () => {
    reportBubbleResponded();
    playSound('ack');
    // T4 孵化休息引导：卡壳救援气泡点击 → 打开 3 分钟呼吸引导浮层
    if (useAssistantStore.getState().bubbleTriggerId === 'stuck-incubation') {
      useAssistantStore.getState().hideBubble();
      setIncubationOpen(true);
      return;
    }
    // F3 闭环：睡前仪式气泡点击 → 打开完整三步仪式浮层
    if (useAssistantStore.getState().bubbleTriggerId === 'bedtime-routine') {
      const ctx = useAssistantStore.getState().bubbleTriggerContext;
      useAssistantStore.getState().hideBubble();
      setBedtimeTopDeckId(typeof ctx?.topDeckId === 'string' ? ctx.topDeckId : undefined);
      setBedtimeRoutineOpen(true);
      return;
    }
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
      {/* T4 孵化呼吸引导（卡壳救援气泡的落地动作） */}
      <IncubationBreathing open={incubationOpen} onClose={() => setIncubationOpen(false)} />
      {/* F3 睡前仪式完整版（三步引导：复习 → 回顾 → 清醒期引导） */}
      <BedtimeRoutine open={bedtimeRoutineOpen} onClose={() => setBedtimeRoutineOpen(false)} topDeckId={bedtimeTopDeckId} />
      <AnimatePresence>
        {panelState === 'expanded' && (
          <ConversationPanel onSend={sendMessage} onClose={handleClosePanel} onRetry={retryLastMessage} onDismiss={dismissError} />
        )}
      </AnimatePresence>
    </>
  );
}
