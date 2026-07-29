/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：RichTooltip。
 */
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface RichTooltipProps {
  content: ReactNode;
  children: ReactNode;
  delay?: number;       // hover 延迟（ms），默认 300
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function RichTooltip({ content, children, delay = 300, position = 'top' }: RichTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        // 根据 position 计算坐标
        let x = rect.left + rect.width / 2;
        let y = position === 'top' ? rect.top - 8 : position === 'bottom' ? rect.bottom + 8 : rect.top + rect.height / 2;
        if (position === 'left') x = rect.left - 8;
        if (position === 'right') x = rect.right + 8;
        // 边界检测：确保不超出视口
        x = Math.max(8, Math.min(x, window.innerWidth - 8));
        y = Math.max(8, Math.min(y, window.innerHeight - 8));
        setCoords({ x, y });
      }
      setVisible(true);
    }, delay);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <>
      <div ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} className="inline-block">
        {children}
      </div>
      {visible && createPortal(
        <div
          className="fixed z-[9999] max-w-xs px-3 py-2 rounded-kb-md bg-bg-elevated border border-border/50 shadow-lg text-b3 text-text-secondary animate-fadeIn pointer-events-none"
          style={{
            left: coords.x,
            top: coords.y,
            transform: position === 'top' ? 'translate(-50%, -100%)' : position === 'bottom' ? 'translate(-50%, 0)' : position === 'left' ? 'translate(-100%, -50%)' : 'translate(0, -50%)',
          }}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  );
}
