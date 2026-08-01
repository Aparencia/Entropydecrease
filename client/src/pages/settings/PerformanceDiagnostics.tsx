/**
 * PerformanceDiagnostics — 内置性能诊断面板（P3-18）
 *
 * 供内测人员自助采集性能数据：实时展示 FPS（来自 3D 性能 store）、
 * 当前画质 tier、全进程 CPU/内存汇总与系统内存（经 perf:get-metrics IPC
 * 每 2s 轮询 app.getAppMetrics），并支持一键复制诊断文本上报。
 *
 * @ai-context: 设置页组件：PerformanceDiagnostics。FPS/tier 订阅
 * usePerformanceStore（3D 场景驱动，非 3D 页面时为其最近缓存值）；
 * CPU/内存来自主进程 app.getAppMetrics，非 Electron 环境隐藏面板。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Copy, Check } from 'lucide-react';
import { Card, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { usePerformanceStore } from '@/lib/3d/core/PerformanceMonitor';
import { usePerformanceModeStore } from '@/lib/performance/usePerformanceMode';

/** perf:get-metrics 返回结构（与主进程 performanceMode.ts 对齐） */
interface PerfMetrics {
  totalCpu: number;
  totalMemoryMb: number;
  processCount: number;
  system: { totalMb: number; freeMb: number } | null;
  processes: Array<{ type: string; pid: number; cpu: number; memoryMb: number }>;
}

const POLL_INTERVAL_MS = 2000;
const MODE_LABEL: Record<string, string> = { low: '静谧', medium: '从容', high: '澎湃' };
const TIER_LABEL: Record<string, string> = { low: '低', medium: '中', high: '高' };

/** 单项指标展示块 */
function Metric({ label, value, unit, warn }: { label: string; value: string; unit?: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-kb-md bg-bg-tertiary/40 px-3 py-2">
      <span className="text-c1 text-text-tertiary">{label}</span>
      <span className={cn('text-b1 font-semibold tabular-nums', warn ? 'text-semantic-error' : 'text-text-primary')}>
        {value}
        {unit && <span className="ml-0.5 text-c1 font-normal text-text-tertiary">{unit}</span>}
      </span>
    </div>
  );
}

export default function PerformanceDiagnostics() {
  const { toast } = useToast();
  const [monitoring, setMonitoring] = useState(false);
  const [metrics, setMetrics] = useState<PerfMetrics | null>(null);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fps = usePerformanceStore((s) => s.fps);
  const tier = usePerformanceStore((s) => s.tier);
  const mode = usePerformanceModeStore((s) => s.mode);

  const isElectron = typeof window.electronAPI?.invoke === 'function';

  const fetchOnce = useCallback(async () => {
    try {
      const data = (await window.electronAPI?.invoke('perf:get-metrics')) as PerfMetrics | undefined;
      if (data) setMetrics(data);
    } catch {
      /* 采集失败静默忽略，保留上次读数 */
    }
  }, []);

  useEffect(() => {
    if (!monitoring) return;
    fetchOnce();
    timerRef.current = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [monitoring, fetchOnce]);

  const handleCopy = useCallback(async () => {
    const lines = [
      `熵减性能诊断 ${new Date().toLocaleString()}`,
      `性能模式: ${MODE_LABEL[mode] ?? mode} | 画质 tier: ${TIER_LABEL[tier] ?? tier} | FPS: ${fps}`,
    ];
    if (metrics) {
      lines.push(`CPU 总占用: ${metrics.totalCpu}% | 应用内存: ${metrics.totalMemoryMb} MB | 进程数: ${metrics.processCount}`);
      if (metrics.system) {
        lines.push(`系统内存: 总 ${metrics.system.totalMb} MB / 可用 ${metrics.system.freeMb} MB`);
      }
      const top = [...metrics.processes].sort((a, b) => b.memoryMb - a.memoryMb).slice(0, 5);
      lines.push('Top 进程(内存): ' + top.map((p) => `${p.type}#${p.pid} ${p.memoryMb}MB/${p.cpu}%`).join(', '));
    } else {
      lines.push('（未采集到进程指标，请先开始监测）');
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      toast({ type: 'success', message: '诊断信息已复制' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ type: 'error', message: '复制失败' });
    }
  }, [mode, tier, fps, metrics, toast]);

  if (!isElectron) return null;

  const memWarn = (metrics?.totalMemoryMb ?? 0) > 2048;
  const cpuWarn = (metrics?.totalCpu ?? 0) > 60;

  return (
    <Card padding="md" className="flex flex-col gap-kb-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-brand-500" strokeWidth={1.5} />
          <div>
            <h2 className="text-b1 font-semibold text-text-primary">性能诊断</h2>
            <p className="text-c1 text-text-tertiary mt-0.5">实时资源占用，便于反馈上报</p>
          </div>
        </div>
        <button
          onClick={() => setMonitoring((v) => !v)}
          className={cn(
            'px-3 py-1.5 rounded-[var(--kb-radius-md)] text-b3 font-medium transition-all duration-200',
            monitoring
              ? 'bg-semantic-error/10 text-semantic-error hover:bg-semantic-error/20'
              : 'bg-brand-500 text-white hover:bg-brand-600',
          )}
        >
          {monitoring ? '停止监测' : '开始监测'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric label="FPS" value={String(fps)} warn={fps < 30} />
        <Metric label="画质 tier" value={TIER_LABEL[tier] ?? tier} />
        <Metric label="CPU 总占用" value={metrics ? String(metrics.totalCpu) : '--'} unit="%" warn={cpuWarn} />
        <Metric label="应用内存" value={metrics ? String(metrics.totalMemoryMb) : '--'} unit="MB" warn={memWarn} />
      </div>

      {metrics?.system && (
        <p className="text-c1 text-text-tertiary">
          系统内存：总 {metrics.system.totalMb} MB / 可用 {metrics.system.freeMb} MB · 进程数 {metrics.processCount}
        </p>
      )}

      {!monitoring && !metrics && (
        <p className="text-c1 text-text-tertiary">点击「开始监测」采集实时 CPU/内存数据。</p>
      )}

      <button
        onClick={handleCopy}
        className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--kb-radius-md)] text-b3 font-medium text-text-secondary bg-bg-tertiary/50 hover:bg-bg-tertiary transition-all duration-200"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-semantic-success" strokeWidth={2} /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />}
        复制诊断信息
      </button>
    </Card>
  );
}
