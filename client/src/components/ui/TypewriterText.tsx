/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：TypewriterText。
 */
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface TypewriterTextProps {
  /** 要逐字显示的完整文本 */
  text: string;
  /** 每字符间隔 ms，默认 30 */
  speed?: number;
  className?: string;
  /** 打字完成后的回调 */
  onComplete?: () => void;
  /** 是否显示光标，默认 true */
  cursor?: boolean;
}

export function TypewriterText({
  text,
  speed = 30,
  className,
  onComplete,
  cursor = true,
}: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let index = 0;
    setDisplayedText('');
    setIsComplete(false);

    const timer = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(timer);
        setIsComplete(true);
        onCompleteRef.current?.();
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  return (
    <span className={cn('inline-flex items-center', className)}>
      {displayedText}
      {cursor && !isComplete && (
        <span className="inline-block w-0.5 h-4 bg-text-primary animate-pulse ml-0.5" />
      )}
    </span>
  );
}

TypewriterText.displayName = 'TypewriterText';
