/**
 * SonarControls — 运行态声呐仪表盘与控制面板
 * Running-stage sonar dashboard: elapsed time, frame/segment stats, controls.
 *
 * @ai-context: 左栏运行态组件，采集开始后替换整个配置区（双阶段左栏设计）。
 * 组件挂载即开始计时（页面仅在运行态渲染本组件，卸载自动归零），status
 * 为 capturing 时每秒累加，暂停时停表。继续采集复用 handleStart。
 * @ai-context: Left-rail running-stage component that replaces the config area
 * while a session is active. Timer accumulates only while status==='capturing'.
 */
import { useState, useEffect } from 'react';
import { Play, Pause, Square, Star, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionStatus, CaptureMode } from '@/lib/capture';
import { STATUS_CONFIG } from '../constants';

interface SonarControlsProps {
  status: SessionStatus;
  stats: { frames: number; extracted: number };
  mode: CaptureMode;
  audioHealthy: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onBookmark: () => void;
}

/** 秒数格式化为 mm:ss 或 h:mm:ss（纯函数，无副作用） */
function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function SonarControls({ status, stats, mode, audioHealthy, onPause, onResume, onStop, onBookmark }: SonarControlsProps) {
  const [elapsed, setElapsed] = useState(0);
  const statusCfg = STATUS_CONFIG[status];
  const StatusIcon = statusCfg.icon;
  const hasAudio = mode === 'audio' || mode === 'mixed';

  // 仅采集中走表；暂停/处理中停表，组件卸载（会话结束）自动归零
  useEffect(() => {
    if (status !== 'capturing') return;
    const timer = setInterval(() => setElapsed((sec) => sec + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  return (
    <div className="flex-1 flex flex-col p-4 min-h-0">
      {/* 状态行 */}
      <div className="flex items-center justify-between">
        <div className={cn('flex items-center gap-1.5 text-b3 font-medium', statusCfg.color)}>
          <StatusIcon className={cn('w-4 h-4', status === 'capturing' && 'animate-spin')} strokeWidth={1.5} />
          {statusCfg.label}
        </div>
        {hasAudio && status === 'capturing' && (
          <div className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', audioHealthy ? 'bg-semantic-success animate-pulse' : 'bg-semantic-error')} />
            <span className={cn('text-[11px]', audioHealthy ? 'text-text-tertiary' : 'text-semantic-error')}>
              {audioHealthy ? '音频正常' : '音频异常'}
            </span>
          </div>
        )}
      </div>

      {/* 采集时长 */}
      <div className="mt-8 text-center">
        <p className="text-[11px] text-text-tertiary mb-1">采集时长</p>
        <p className="font-mono tabular-nums text-h1 text-text-primary tracking-wider">{formatElapsed(elapsed)}</p>
      </div>

      {/* 帧 / 段 统计 */}
      <div className="mt-6 grid grid-cols-2 gap-2">
        <div className="rounded-kb-md bg-bg-secondary/60 border border-border/20 py-3 text-center">
          <p className="font-mono tabular-nums text-h2 text-text-primary">{stats.frames}</p>
          <p className="text-[11px] text-text-tertiary mt-0.5">捕获帧</p>
        </div>
        <div className="rounded-kb-md bg-bg-secondary/60 border border-border/20 py-3 text-center">
          <p className="font-mono tabular-nums text-h2 text-text-primary">{stats.extracted}</p>
          <p className="text-[11px] text-text-tertiary mt-0.5">提取段</p>
        </div>
      </div>

      {status === 'processing' && (
        <div className="mt-4 flex items-center justify-center gap-2 text-b3 text-brand-600">
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          正在处理采集数据...
        </div>
      )}

      {/* 控制按钮：贴底放置 */}
      <div className="mt-auto space-y-2 pt-4">
        {status === 'capturing' && (
          <button onClick={onBookmark} title="标记重点 (M)"
            className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-kb-md text-b3 font-medium bg-amber-50 text-amber-600 hover:bg-amber-100 active:scale-[0.98] transition-all">
            <Star className="w-4 h-4" strokeWidth={1.5} /> 标记重点 (M)
          </button>
        )}
        <div className="flex items-center gap-2">
          {status === 'capturing' && (
            <button onClick={onPause}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-kb-md text-b3 font-medium bg-semantic-warning/10 text-semantic-warning hover:bg-semantic-warning/20 active:scale-[0.98] transition-all">
              <Pause className="w-4 h-4" strokeWidth={1.5} /> 暂停
            </button>
          )}
          {status === 'paused' && (
            <button onClick={onResume}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-kb-md text-b3 font-medium bg-semantic-success/10 text-semantic-success hover:bg-semantic-success/20 active:scale-[0.98] transition-all">
              <Play className="w-4 h-4" strokeWidth={1.5} /> 继续
            </button>
          )}
          <button onClick={onStop}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-kb-md text-b3 font-medium bg-bg-secondary text-text-secondary border border-border/50 hover:bg-bg-tertiary hover:text-text-primary active:scale-[0.98] transition-all">
            <Square className="w-4 h-4" strokeWidth={1.5} /> 停止
          </button>
        </div>
      </div>
    </div>
  );
}
