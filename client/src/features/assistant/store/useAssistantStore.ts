/**
 * AI 助手 Zustand 全局状态
 *
 * @ai-context: 助手模块唯一状态源——面板状态、消息列表、水母状态、偏好；
 * 偏好持久化到 localStorage（键 assistant_preferences），其余为运行时内存态。
 * 设计原则：可逆 > 不可逆——所有开关可关闭，助手可完全隐藏。
 */
import { create } from 'zustand';
import type { ChatMessage, CreatureState, PanelState, AssistantPreferences } from '../types';
import { DEFAULT_PREFERENCES, PREFS_STORAGE_KEY } from '../constants';

function loadPreferences(): AssistantPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch { /* 静默降级 */ }
  return { ...DEFAULT_PREFERENCES };
}

function persistPreferences(prefs: AssistantPreferences): void {
  try { localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

interface AssistantState {
  // ── 面板 & 水母 ──
  panelState: PanelState;
  creatureState: CreatureState;
  bubbleMessage: string | null;
  bubbleTriggerId: string | null;

  // ── 用户活跃状态 ──
  userActive: boolean;

  // ── 水母固定状态 ──
  isFixed: boolean;
  autoFixed: boolean;

  // ── 对话 ──
  sessionId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;

  // ── 偏好 ──
  preferences: AssistantPreferences;

  // ── Actions ──
  setPanelState: (s: PanelState) => void;
  setCreatureState: (s: CreatureState) => void;
  setUserActive: (v: boolean) => void;
  setIsFixed: (v: boolean) => void;
  setAutoFixed: (v: boolean) => void;
  showBubble: (msg: string, triggerId: string | null) => void;
  hideBubble: () => void;
  setSessionId: (id: string | null) => void;
  addMessage: (msg: ChatMessage) => void;
  removeMessage: (id: string) => void;
  appendToLastMessage: (chunk: string) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setIsStreaming: (v: boolean) => void;
  updatePreferences: (partial: Partial<AssistantPreferences>) => void;
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  panelState: 'hidden',
  creatureState: 'idle',
  userActive: true,
  isFixed: false,
  autoFixed: false,
  bubbleMessage: null,
  bubbleTriggerId: null,
  sessionId: null,
  messages: [],
  isStreaming: false,
  preferences: loadPreferences(),

  setPanelState: (s) => set({ panelState: s }),
  setCreatureState: (s) => set({ creatureState: s }),
  setUserActive: (v) => set({ userActive: v }),
  setIsFixed: (v) => set({ isFixed: v, autoFixed: false }),
  setAutoFixed: (v) => set({ autoFixed: v, isFixed: v }),

  showBubble: (msg, triggerId) => set({ bubbleMessage: msg, bubbleTriggerId: triggerId, panelState: 'bubble', creatureState: 'alerting' }),
  hideBubble: () => set({ bubbleMessage: null, bubbleTriggerId: null, panelState: 'hidden', creatureState: 'idle' }),

  setSessionId: (id) => set({ sessionId: id }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  removeMessage: (id) => set((s) => ({ messages: s.messages.filter(m => m.id !== id) })),

  appendToLastMessage: (chunk) => set((s) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
    }
    return { messages: msgs };
  }),

  setMessages: (msgs) => set({ messages: msgs }),
  setIsStreaming: (v) => set({ isStreaming: v }),

  updatePreferences: (partial) => {
    const next = { ...get().preferences, ...partial };
    persistPreferences(next);
    set({ preferences: next });
  },
}));
