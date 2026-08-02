/**
 * 对话核心 Hook
 *
 * @ai-context: 管理会话生命周期、消息发送（流式）、历史加载；
 * 通过 IPC ai:chat:send 与主进程 chatHandler 通信（内含持久化），
 * 流式 chunk 通过 ai:stream:chunk/end/error 事件回推（requestId 关联）。
 * 事件监听使用 preload 暴露的 api.on()——返回取消订阅函数，
 * finally 中必须调用，否则重复发送会泄漏 listener（同 electronStreamBridge）。
 * 防御性：网关不可达时追加"连接中断"标记，不阻塞 UI。
 */
import { useCallback, useEffect } from 'react';
import { useAssistantStore } from '../store/useAssistantStore';
import { SESSION_EXPIRE_MS, HISTORY_PAGE_SIZE, CONTEXT_WINDOW_ROUNDS } from '../constants';
import type { ChatMessage } from '../types';

/** 错误标记——MessageBubble 据此渲染重试/关闭按钮 */
export const ERROR_MARKER = '__ASSISTANT_ERROR__';

export function useChat() {
  const sessionId = useAssistantStore(s => s.sessionId);
  const messages = useAssistantStore(s => s.messages);
  const isStreaming = useAssistantStore(s => s.isStreaming);
  const setSessionId = useAssistantStore(s => s.setSessionId);
  const setMessages = useAssistantStore(s => s.setMessages);
  const addMessage = useAssistantStore(s => s.addMessage);
  const removeMessage = useAssistantStore(s => s.removeMessage);
  const appendToLastMessage = useAssistantStore(s => s.appendToLastMessage);
  const setIsStreaming = useAssistantStore(s => s.setIsStreaming);

  // 初始化会话（加载或新建）
  const initSession = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;

    try {
      const sessions = await api.invoke('ai:chat:sessions') as Array<{ id: string; updated_at: number }>;
      const latest = sessions[0];

      if (latest && Date.now() - latest.updated_at < SESSION_EXPIRE_MS) {
        setSessionId(latest.id);
        const rows = await api.invoke('ai:chat:history', { sessionId: latest.id, limit: HISTORY_PAGE_SIZE }) as Array<Record<string, unknown>>;
        const msgs: ChatMessage[] = rows.map(r => ({
          id: r.id as string,
          sessionId: r.session_id as string,
          role: r.role as ChatMessage['role'],
          content: r.content as string,
          contentType: (r.content_type as ChatMessage['contentType']) ?? 'text',
          trigger: (r.trigger_type as ChatMessage['trigger']) ?? undefined,
          createdAt: r.created_at as number,
        }));
        setMessages(msgs);
      } else {
        const newSession = await api.invoke('ai:chat:new-session', {}) as { id: string };
        setSessionId(newSession.id);
        setMessages([]);
      }
    } catch (err) {
      console.error('[useChat] initSession failed:', err);
    }
  }, [setSessionId, setMessages]);

  useEffect(() => { initSession(); }, [initSession]);

  // 发送消息（流式）
  const sendMessage = useCallback(async (text: string) => {
    const api = window.electronAPI;
    if (!api || isStreaming) return;

    let currentSessionId = sessionId;
    if (!currentSessionId) {
      try {
        const s = await api.invoke('ai:chat:new-session', {}) as { id: string };
        currentSessionId = s.id;
        setSessionId(currentSessionId);
      } catch { return; }
    }

    // 用户消息 → UI
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: currentSessionId,
      role: 'user',
      content: text,
      contentType: 'text',
      createdAt: Date.now(),
    };
    addMessage(userMsg);

    // 空助手消息占位（流式填充）
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: currentSessionId,
      role: 'assistant',
      content: '',
      contentType: 'text',
      createdAt: Date.now(),
    };
    addMessage(assistantMsg);
    setIsStreaming(true);

    // 构建历史窗口
    const history = messages.slice(-CONTEXT_WINDOW_ROUNDS * 2).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    const requestId = crypto.randomUUID();

    // preload api.on 返回取消订阅函数（事件对象已被剥离，args[0] 即数据）
    const unsubChunk = api.on('ai:stream:chunk', (...args: unknown[]) => {
      const data = args[0] as { requestId: string; chunk: string };
      if (data.requestId === requestId) appendToLastMessage(data.chunk);
    });
    const unsubEnd = api.on('ai:stream:end', (...args: unknown[]) => {
      const data = args[0] as { requestId: string };
      if (data.requestId === requestId) setIsStreaming(false);
    });
    const unsubError = api.on('ai:stream:error', (...args: unknown[]) => {
      const data = args[0] as { requestId: string; error: string };
      if (data.requestId === requestId) {
        appendToLastMessage(ERROR_MARKER);
        setIsStreaming(false);
      }
    });

    try {
      // chatHandler 在整个流结束后才 return（invoke 阻塞至流完成），
      // 期间 chunk/end/error 事件由上方监听器处理。
      await api.invoke('ai:chat:send', {
        requestId,
        sessionId: currentSessionId,
        message: text,
        history,
        scene: 'study',
      });
    } catch {
      appendToLastMessage(ERROR_MARKER);
    } finally {
      // 无论成败必须取消三个监听，防止 listener 泄漏
      unsubChunk();
      unsubEnd();
      unsubError();
      // 兜底：invoke resolve/reject 均意味着流已终结
      setIsStreaming(false);
    }
  }, [sessionId, messages, isStreaming, addMessage, appendToLastMessage, setIsStreaming, setSessionId]);

  /** 重试：移除失败的助手消息，重新发送上一条用户消息 */
  const retryLastMessage = useCallback(() => {
    const msgs = useAssistantStore.getState().messages;
    // 找到最后一条错误助手消息
    const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant' && m.content.includes(ERROR_MARKER));
    if (!lastAssistant) return;
    // 找到它前面的用户消息
    const idx = msgs.indexOf(lastAssistant);
    const userMsg = [...msgs.slice(0, idx)].reverse().find(m => m.role === 'user');
    // 移除失败消息
    removeMessage(lastAssistant.id);
    // 重发
    if (userMsg) sendMessage(userMsg.content);
  }, [removeMessage, sendMessage]);

  /** 关闭：仅移除失败的助手消息 */
  const dismissError = useCallback((messageId: string) => {
    removeMessage(messageId);
  }, [removeMessage]);

  return { sendMessage, initSession, retryLastMessage, dismissError };
}
