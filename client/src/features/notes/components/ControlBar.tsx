/**
 * 采集侧边栏 — 控制栏（状态/启停/模式切换）
 *
 * @ai-context: 从 CaptureSidebar 拆出。STATUS_CONFIG 定义 5 种会话状态的
 * 展示（capturing 时图标旋转）；采集/处理中禁止切换模式（避免管线状态
 * 错乱）。三种采集模式 vision/audio/mixed 对应不同 Worker 组合。
 */
import { Play, Pause, Square, Eye, Mic, Layers, Clock, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CaptureMode, SessionStatus } from '@/lib/capture';

export interface ControlBarProps {
  status: SessionStatus;
  mode: CaptureMode;
  stats: { frames: number; extracted: number };
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onModeChange: (mode: CaptureMode) => void;
  disabled: boolean;
}

const MODE_OPTIONS: { value: CaptureMode; label: string; icon: typeof Eye }[] = [
  { value: 'vision', label: '视觉', icon: Eye },
  { value: 'audio', label: '音频', icon: Mic },
  { value: 'mixed', label: '混合', icon: Layers },
];

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string; icon: typeof Play }> = {
  idle: { label: '空闲', color: 'text-text-tertiary', icon: Clock },
  capturing: { label: '采集中', color: 'text-semantic-error', icon: Loader2 },
  processing: { label: '处理中', color: 'text-brand-600', icon: Loader2 },
  paused: { label: '已暂停', color: 'text-semantic-warning', icon: Pause },
  error: { label: '错误', color: 'text-semantic-error', icon: XCircle },
};

export function ControlBar({
  status, mode, stats, onStart, onPause, onStop, onModeChange, disabled,
}: ControlBarProps) {
  const statusCfg = STATUS_CONFIG[status];
  const StatusIcon = statusCfg.icon;

  return (
    <div className="border-b border-border/30 px-3 py-3 space-y-3">
      {/* 状态指示 */}
      <div className="flex items-center justify-between">
        <div className={cn('flex items-center gap-1.5 text-b3 font-medium', statusCfg.color)}>
          <StatusIcon
            className={cn('w-3.5 h-3.5', status === 'capturing' && 'animate-spin')}
            strokeWidth={1.5}
          />
          {statusCfg.label}
        </div>
        <div className="flex items-center gap-3 text-b3 text-text-tertiary">
          <span title="已截取帧数">帧 {stats.frames}</span>
          <span title="已提取片段数">段 {stats.extracted}</span>
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center gap-2">
        {status === 'capturing' ? (
          <button
            onClick={onPause}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
              'bg-semantic-warning/10 text-semantic-warning hover:bg-semantic-warning/20',
              'active:scale-95 transition-all duration-kb-fast',
            )}
          >
            <Pause className="w-3.5 h-3.5" strokeWidth={1.5} />
            暂停
          </button>
        ) : status === 'paused' ? (
          <button
            onClick={onPause}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
              'bg-semantic-success/10 text-semantic-success hover:bg-semantic-success/20',
              'active:scale-95 transition-all duration-kb-fast',
            )}
          >
            <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
            继续
          </button>
        ) : (
          <button
            onClick={onStart}
            disabled={disabled}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
              'bg-semantic-success/10 text-semantic-success hover:bg-semantic-success/20',
              'active:scale-95 transition-all duration-kb-fast',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
            开始
          </button>
        )}

        {status !== 'idle' && status !== 'error' && (
          <button
            onClick={onStop}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
              'bg-bg-secondary text-text-secondary border border-border/50',
              'hover:bg-bg-tertiary hover:text-text-primary',
              'active:scale-95 transition-all duration-kb-fast',
            )}
          >
            <Square className="w-3.5 h-3.5" strokeWidth={1.5} />
            停止
          </button>
        )}
      </div>

      {/* 模式切换 */}
      <div className="flex items-center gap-1">
        {MODE_OPTIONS.map(({ value, label, icon: ModeIcon }) => (
          <button
            key={value}
            onClick={() => onModeChange(value)}
            disabled={status === 'capturing' || status === 'processing'}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-kb-sm text-b3 font-medium',
              'transition-all duration-kb-fast',
              mode === value
                ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-200/50'
                : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50',
              (status === 'capturing' || status === 'processing') && 'opacity-50 cursor-not-allowed',
            )}
          >
            <ModeIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
