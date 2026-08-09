/**
 * ChronosStateRow — 时间生物状态行（需求 4：提示语移出球体）
 *
 * 渲染于生物正下方（父组件定位），展示 状态图标 + 状态名 + 引导语，
 * 颜色随状态/主题变化；不再覆盖 3D 球体。
 *
 * @ai-context: 状态行组件；状态映射 chronosState，色板 chronosStyles。
 */
import { cn } from '@/lib/utils';
import { useSceneTheme } from '@/lib/3d/hooks/useSceneTheme';
import { toChronosState, CHRONOS_STATE_LABELS, type ChronosStateInput } from './chronosState';
import { CHRONOS_PALETTES } from './chronosStyles';

interface ChronosStateRowProps {
  input: ChronosStateInput;
  className?: string;
  /** immersive = 沉浸深色背景（白色文字）；page = 页面 token 色 */
  variant?: 'page' | 'immersive';
  /** 覆盖默认引导语（冷/热启动、迈步完成态动态文案） */
  hint?: string;
}

export function ChronosStateRow({ input, className, variant = 'page', hint }: ChronosStateRowProps) {
  const theme = useSceneTheme();
  const state = toChronosState(input);
  const meta = CHRONOS_STATE_LABELS[state];
  const color = CHRONOS_PALETTES[theme][state].glow;
  const hintText = hint ?? meta.hint;

  return (
    <div className={cn('flex items-center justify-center gap-1.5 text-[12px]', className)}>
      <span className="font-medium whitespace-nowrap" style={{ color }}>
        {meta.icon} {meta.name}
      </span>
      <span className={cn('whitespace-nowrap', variant === 'immersive' ? 'text-white/50' : 'text-text-tertiary/70')}>
        {hintText}
      </span>
    </div>
  );
}
