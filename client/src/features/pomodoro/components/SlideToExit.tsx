/**
 * SlideToExit — 滑动退出专注条
 *
 * 顶部显示"← 滑动退出专注"防误触条，
 * 需拖拽滑块到右端（85%）才解锁退出。
 * 使用原生 Pointer Events，不依赖 Framer Motion。
 *
 * @ai-context: 通用组件：SlideToExit。
 */
import { useState, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlideToExitProps {
  onExit: () => void;
}

const THRESHOLD = 0.85;
const THUMB_SIZE = 36; // px (w-9 h-9 = 36px)

export default function SlideToExit({ onExit }: SlideToExitProps) {
  const [dragRatio, setDragRatio] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const maxTravel = rect.width - THUMB_SIZE;
    if (maxTravel <= 0) return;
    const rawX = e.clientX - rect.left - THUMB_SIZE / 2;
    const ratio = Math.max(0, Math.min(1, rawX / maxTravel));
    setDragRatio(ratio);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    if (dragRatio >= THRESHOLD) {
      onExit();
    } else {
      setDragRatio(0); // 回弹
    }
  };

  const translateX = trackRef.current
    ? dragRatio * (trackRef.current.offsetWidth - THUMB_SIZE)
    : 0;

  return (
    <div className="w-full max-w-xs mx-auto py-kb-md">
      <div
        ref={trackRef}
        className="relative h-10 bg-bg-tertiary/40 rounded-kb-full overflow-hidden"
      >
        {/* 背景提示文字 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-b3 text-text-tertiary select-none">
            滑动退出专注 →
          </span>
        </div>

        {/* 拖拽进度填充 */}
        <div
          className="absolute inset-y-0 left-0 bg-brand-500/20 rounded-kb-full pointer-events-none transition-none"
          style={{ width: `${dragRatio * 100}%` }}
        />

        {/* 滑块 */}
        <div
          className={cn(
            'absolute top-0.5 left-0.5 w-9 h-9 rounded-kb-full flex items-center justify-center',
            'bg-brand-500 cursor-grab active:cursor-grabbing shadow-kb-md',
            'transition-shadow duration-kb-fast',
            dragRatio >= THRESHOLD && 'bg-brand-400',
          )}
          style={{ transform: `translateX(${translateX}px)` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <ArrowRight className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}
