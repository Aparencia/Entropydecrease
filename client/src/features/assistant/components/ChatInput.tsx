/**
 * 对话输入框
 *
 * @ai-context: Enter 发送、Shift+Enter 换行；TTS 开关按钮；发送中禁用。
 * 设计原则：可逆 > 不可逆——TTS 开关随时可切换。
 */
import { useState, useRef } from 'react';
import { useAssistantStore } from '../store/useAssistantStore';

interface Props {
  onSend: (text: string) => void;
}

export function ChatInput({ onSend }: Props) {
  const [text, setText] = useState('');
  const isStreaming = useAssistantStore(s => s.isStreaming);
  const ttsEnabled = useAssistantStore(s => s.preferences.audio.ttsEnabled);
  const updatePreferences = useAssistantStore(s => s.updatePreferences);
  const preferences = useAssistantStore(s => s.preferences);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleTts = () => {
    updatePreferences({
      audio: { ...preferences.audio, ttsEnabled: !ttsEnabled },
    });
  };

  return (
    <div className="border-t border-border/50 px-3 py-2.5 flex items-end gap-2">
      <textarea
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息..."
        rows={1}
        className="flex-1 resize-none rounded-xl bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary
          placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-cyber/40
          max-h-[100px] overflow-y-auto"
      />
      {/* TTS 开关 */}
      <button
        onClick={toggleTts}
        className={`p-2 rounded-lg text-xs transition-colors ${ttsEnabled ? 'text-cyber bg-cyber/10' : 'text-text-tertiary hover:text-text-primary'}`}
        title={ttsEnabled ? '关闭语音朗读' : '开启语音朗读'}
        aria-label={ttsEnabled ? '关闭语音朗读' : '开启语音朗读'}
      >
        🔊
      </button>
      {/* 发送 */}
      <button
        onClick={handleSend}
        disabled={isStreaming || !text.trim()}
        className="p-2 rounded-lg bg-brand-600/80 text-white text-sm disabled:opacity-40
          hover:bg-brand-500/80 transition-colors"
        aria-label="发送消息"
      >
        ➤
      </button>
    </div>
  );
}
