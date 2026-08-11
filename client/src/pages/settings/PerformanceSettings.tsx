/**
 * PerformanceSettings — 性能模式设置（三档：静谧/从容/澎湃）
 *
 * 仿 ModeSettings 卡片式范式：三档性能模式，点击即切（3D 画质/动画即时生效；
 * 后台采集频率与进程策略下次启动后完全生效）。内部标识 low/medium/high，
 * 显示名 静谧/从容/澎湃，默认从容（medium）。
 *
 * @ai-context: 设置页组件：PerformanceSettings。
 * 生效时机：3D 画质/动画即时生效；后台采集频率在变更瞬间优雅重启活跃
 * 采集循环即时生效（主进程 onPerformanceModeChange 订阅），不再等下次启动。
 */
import { motion } from 'framer-motion';
import { Card } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePerformanceMode } from '@/lib/performance/usePerformanceMode';
import { PERFORMANCE_MODES, type PerformanceMode } from '@/lib/performance/performanceMode';
import { Feather, Waves, Zap, Check } from 'lucide-react';

/** 各档图标 */
const modeIcons: Record<PerformanceMode, React.ReactNode> = {
  low: <Feather className="w-6 h-6" strokeWidth={1.5} />,
  medium: <Waves className="w-6 h-6" strokeWidth={1.5} />,
  high: <Zap className="w-6 h-6" strokeWidth={1.5} />,
};

/** 各档配色 */
const modeStyles: Record<PerformanceMode, { color: string; activeBg: string; activeBorder: string }> = {
  low: { color: 'text-emerald-500', activeBg: 'bg-emerald-500/10', activeBorder: 'border-emerald-400/50' },
  medium: { color: 'text-blue-500', activeBg: 'bg-blue-500/10', activeBorder: 'border-blue-400/50' },
  high: { color: 'text-amber-500', activeBg: 'bg-amber-500/10', activeBorder: 'border-amber-400/50' },
};

/** 各档功能定位（直白说明，辅助理解品牌名） */
const functionalLabels: Record<PerformanceMode, string> = {
  low: '省电',
  medium: '均衡',
  high: '高性能',
};

/** 各档特性标签 */
const modeFeatures: Record<PerformanceMode, string[]> = {
  low: ['3D 低画质', '动画减弱', '采集降频', '后台节流'],
  medium: ['3D 中画质', '动画标准', '采集标准'],
  high: ['3D 全特效', '动画标准', '采集标准'],
};

export default function PerformanceSettings() {
  const { mode, setMode } = usePerformanceMode();
  const prefersReduced = useReducedMotion();
  const { toast } = useToast();

  const handleChange = (m: PerformanceMode) => {
    if (mode === m) return;
    setMode(m);
    const info = PERFORMANCE_MODES.find((x) => x.mode === m);
    toast({ type: 'success', message: `已切换到「${info?.label}」模式` });
  };

  const currentInfo = PERFORMANCE_MODES.find((x) => x.mode === mode);

  return (
    <Card padding="md" className="flex flex-col gap-kb-md">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-b1 font-semibold text-text-primary">性能模式</h2>
          <p className="text-c1 text-text-tertiary mt-0.5">平衡画质与资源开销</p>
        </div>
        <span className="text-b3 text-text-tertiary px-2.5 py-1 rounded-full bg-bg-tertiary/50">
          当前：{currentInfo?.label}
        </span>
      </div>

      <div className="grid gap-3">
        {PERFORMANCE_MODES.map((info, idx) => {
          const isActive = mode === info.mode;
          const styles = modeStyles[info.mode];
          return (
            <motion.button
              key={info.mode}
              onClick={() => handleChange(info.mode)}
              initial={prefersReduced ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={
                prefersReduced
                  ? { duration: 0.01 }
                  : { type: 'spring', stiffness: 350, damping: 28, delay: idx * 0.06 }
              }
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={cn(
                'relative flex items-start gap-4 p-4 rounded-kb-lg border-2 text-left transition-all duration-200',
                isActive
                  ? `${styles.activeBg} ${styles.activeBorder}`
                  : 'bg-bg-secondary border-border/40 hover:bg-bg-tertiary/30 hover:border-border/60',
              )}
            >
              {/* 图标 */}
              <div className={cn(
                'relative z-10 w-12 h-12 rounded-kb-lg flex items-center justify-center flex-shrink-0',
                isActive ? styles.activeBg : 'bg-bg-tertiary/50',
                isActive ? styles.color : 'text-text-tertiary',
              )}>
                {modeIcons[info.mode]}
              </div>

              {/* 内容 */}
              <div className="relative z-10 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={cn('text-b2 font-semibold', isActive ? 'text-text-primary' : 'text-text-secondary')}>
                    {info.label}
                    <span className="ml-1.5 text-c1 font-normal text-text-tertiary">{functionalLabels[info.mode]}</span>
                  </h3>
                  {isActive && (
                    <span className={cn('w-5 h-5 rounded-full flex items-center justify-center', styles.activeBg)}>
                      <Check className={cn('w-3 h-3', styles.color)} strokeWidth={2.5} />
                    </span>
                  )}
                </div>
                <p className="text-c1 text-text-tertiary mt-0.5">{info.description}</p>

                {/* 特性标签 */}
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {modeFeatures[info.mode].map((feat) => (
                    <span
                      key={feat}
                      className="inline-flex items-center text-c1 px-2 py-0.5 rounded-full bg-bg-tertiary/50 text-text-secondary"
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <p className="text-c1 text-text-tertiary">
        3D 画质与动画即时生效；后台采集频率在变更后立即生效（当前采集循环将按新频率重启）。
      </p>
    </Card>
  );
}
