/**
 * 听力复习模式 — TTS 朗读卡片正面，用户凭听觉回忆答案
 *
 * @ai-context: 3.5 多感官复习。挂载时临时接管全局 TTS 状态回调（驱动学伴
 * 水母 speaking 态），卸载时通过 getStateCallback 恢复原回调；切换卡片自动
 * 朗读正面纯文本；"显示答案"触发翻转并解锁评分（onFlipEnd 门控 RatingBar）。
 */
import { useEffect, useRef, useState } from 'react';
import { Headphones, Volume2, Square } from 'lucide-react';
import { Button, useToast } from '@/components/ui';
import { ttsController } from '@/features/assistant/lib/ttsController';
import { extractPlainText } from '../lib/reviewMode';
import type { Flashcard } from '@/types/models';

interface AudioReviewModeProps {
  card: Flashcard;
  isFlipped: boolean;
  onFlip: () => void;
  onFlipEnd: () => void;
}

export function AudioReviewMode({ card, isFlipped, onFlip, onFlipEnd }: AudioReviewModeProps) {
  const { toast } = useToast();
  const [speaking, setSpeaking] = useState(false);
  const previousCallback = useRef<((speaking: boolean) => void) | null>(null);

  // 临时接管 TTS 状态回调；卸载时恢复全局回调并停止朗读
  useEffect(() => {
    previousCallback.current = ttsController.getStateCallback();
    ttsController.setOnStateChange(setSpeaking);
    return () => {
      ttsController.stop();
      ttsController.setOnStateChange(previousCallback.current);
    };
  }, []);

  // 切换卡片自动朗读正面
  useEffect(() => {
    const text = extractPlainText(card.front);
    if (text) ttsController.speak(text);
    return () => ttsController.stop();
  }, [card.id, card.front]);

  const handleSpeak = () => {
    const text = extractPlainText(card.front);
    if (!text) {
      toast({ type: 'warning', message: '卡片正面没有可朗读的内容' });
      return;
    }
    ttsController.speak(text);
  };

  const handleStop = () => {
    ttsController.stop();
    setSpeaking(false);
  };

  const handleReveal = () => {
    ttsController.stop();
    onFlip();
    onFlipEnd();
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-6 py-6">
      <div className="flex items-center gap-2 text-text-tertiary text-xs">
        <Headphones className="w-4 h-4" strokeWidth={1.5} />
        聆听卡片内容，在心中回想答案
      </div>

      {/* 听觉焦点区 */}
      <div className="w-full rounded-kb-xl border border-border-subtle bg-bg-secondary/60 p-8 flex flex-col items-center gap-5">
        <div
          className={`w-20 h-20 rounded-kb-full flex items-center justify-center transition-all duration-kb-fast ${
            speaking
              ? 'bg-brand-500/15 text-brand-600 animate-pulse'
              : 'bg-bg-tertiary text-text-tertiary'
          }`}
        >
          {speaking ? (
            <Volume2 className="w-9 h-9" strokeWidth={1.4} />
          ) : (
            <Headphones className="w-9 h-9" strokeWidth={1.4} />
          )}
        </div>
        <div className="text-center text-sm text-text-secondary leading-relaxed max-h-40 overflow-y-auto px-2">
          {speaking ? '正在朗读…' : extractPlainText(card.front) || '（无文字内容）'}
        </div>
        <div className="flex items-center gap-3">
          {speaking ? (
            <Button variant="secondary" size="sm" icon={<Square className="w-4 h-4" />} onClick={handleStop}>
              停止
            </Button>
          ) : (
            <Button variant="secondary" size="sm" icon={<Volume2 className="w-4 h-4" />} onClick={handleSpeak}>
              重新播放
            </Button>
          )}
        </div>
      </div>

      {isFlipped ? (
        <div className="w-full rounded-kb-xl border border-brand-300/50 bg-brand-500/5 p-5 text-center">
          <div className="text-xs text-text-tertiary mb-2">答案</div>
          <div className="text-base text-text-primary leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
            {extractPlainText(card.back)}
          </div>
        </div>
      ) : (
        <Button onClick={handleReveal} icon={<Headphones className="w-4 h-4" />}>
          我回想好了，查看答案
        </Button>
      )}
    </div>
  );
}
