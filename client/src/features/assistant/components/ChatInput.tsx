/**
 * 对话输入框
 *
 * @ai-context: Enter 发送、Shift+Enter 换行；TTS 开关按钮；发送中禁用。
 * 设计原则：可逆 > 不可逆——TTS 开关随时可切换。
 */
import { useState, useRef } from 'react';
import { Volume2, VolumeX, Mic, MicOff } from 'lucide-react';
import { useAssistantStore } from '../store/useAssistantStore';
import { useVoiceInput } from '../hooks/useVoiceInput';

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

  // A2 语音输入：麦克风按钮状态与控制
  const { listening, partialText, error, toggle, clearError } = useVoiceInput({
    onFinalText: (final) => {
      if (final.trim()) onSend(final);
      clearError();
      inputRef.current?.focus();
    },
  });

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
    <div className="border-t border-border/50 px-3 py-2.5">
      {/* A2 语音输入错误提示（互斥/模型缺失等）——可关闭时自动消失 */}
      {error && (
        <div className="mb-1.5 text-xs text-orange-400 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={clearError} className="text-text-tertiary hover:text-text-secondary flex-shrink-0" aria-label="关闭提示">✕</button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          // A2 语音输入：拾音时输入框展示实时 partial 转写（受控态不覆盖已键入文本）
          value={listening ? partialText : text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={listening ? '正在听你说…' : '输入消息...'}
          rows={1}
          className="flex-1 resize-none rounded-xl bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary
            placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-cyber/40
            max-h-[100px] overflow-y-auto"
        />
        {/* TTS 开关：图标 + 文字标签 + aria-pressed，状态一目了然 */}
        <button
          onClick={toggleTts}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0
            ${ttsEnabled
              ? 'bg-cyber/15 text-cyber ring-1 ring-cyber/40'
              : 'bg-bg-tertiary/50 text-text-tertiary hover:text-text-secondary'}`}
          title={ttsEnabled ? '语音朗读已开启（点击关闭）' : '语音朗读已关闭（点击开启）'}
          aria-pressed={ttsEnabled}
          aria-label={ttsEnabled ? '关闭语音朗读' : '开启语音朗读'}
        >
          {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" strokeWidth={1.5} /> : <VolumeX className="w-3.5 h-3.5" strokeWidth={1.5} />}
          {ttsEnabled ? '朗读开' : '朗读关'}
        </button>
        {/* A2 语音输入：麦克风按钮（拾音中脉冲高亮，防回声：流式回复中禁用） */}
        <button
          onClick={toggle}
          disabled={isStreaming}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0
            ${listening
              ? 'bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/40 animate-pulse'
              : 'bg-bg-tertiary/50 text-text-tertiary hover:text-text-secondary'}`}
          title={listening ? '正在录音中（点击停止）' : '语音输入（点击开始）'}
          aria-pressed={listening}
          aria-label={listening ? '停止录音' : '开始录音'}
        >
          {listening ? <MicOff className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Mic className="w-3.5 h-3.5" strokeWidth={1.5} />}
          {listening ? '录音中' : '说话'}
        </button>
        {/* 发送 */}
        <button
          onClick={handleSend}
          disabled={isStreaming || !text.trim() || listening}
          className="p-2 rounded-lg bg-brand-600/80 text-white text-sm disabled:opacity-40
            hover:bg-brand-500/80 transition-colors"
          aria-label="发送消息"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
