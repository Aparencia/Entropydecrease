/**
 * PomodoroControls — 深潜主页控制区（卫星化固定弧形轨道）
 *
 * 引力场布局：控件围绕生物下缘的固定半圆弧轨道排布，位置由固定角度槽位
 * 三角函数静态计算（不随悬停漂移），平时低透明度（0.6）常驻可见，悬停浮现至 1。
 *
 * 交互收敛（主交互 = 点击时间生物）：
 * - 主按钮已清除：开始/暂停/继续由生物点击承担（热启动直接迈步、专注态暂停/恢复）
 * - 四颗卫星：重置 / 跳过 / 沉浸 / 白噪音（弧端小图标下拉）
 *
 * @ai-context: 状态取自 store；唯一外部依赖是 orbitRadius（父组件按生物尺寸传入）。
 */
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, SkipForward, Volume2, VolumeX, Focus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/Tip';
import { usePomodoroStore } from '../store/usePomodoroStore';
import { useAudioPrefsStore } from '@/lib/audio/audioPrefsStore';
import { audioTracks } from '@/lib/audio/audioConfig';
import { useEstimatedVolume } from '../hooks/useEstimatedVolume';

interface PomodoroControlsProps {
  /** 卫星轨道半径（px）= 生物半径 × 1.45，父组件按生物尺寸计算 */
  orbitRadius: number;
}

/** 固定角度槽位（度）：弧顶 90° 让位给生物主交互，四卫星对称分布于两侧弧 */
const SAT = {
  reset: 135, skip: 45, immersive: 165, noise: 15,
} as const;

/** 卫星平时透明度（常驻可见，悬停浮现至 1） */
const SAT_IDLE_OPACITY = 0.6;

/** 角度 → 绝对定位（圆心 = 容器中心，混合 calc 保持响应式） */
function satPos(angleDeg: number, radius: number): React.CSSProperties {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    left: `calc(50% + ${Math.cos(rad) * radius}px)`,
    top: `calc(50% + ${Math.sin(rad) * radius}px)`,
  };
}

/** 卫星槽位通用样式（固定锚定，不随悬停漂移） */
function satClass(...classes: string[]): string {
  return cn('absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center', ...classes);
}

export function PomodoroControls({ orbitRadius }: PomodoroControlsProps) {
  // P0-1 细粒度订阅：整 store 订阅会在任何字段变化时重渲染卫星控制区
  const isRunning = usePomodoroStore((s) => s.isRunning);
  const isPaused = usePomodoroStore((s) => s.isPaused);
  const isArmed = usePomodoroStore((s) => s.isArmed);
  // 动作（稳定引用）
  const reset = usePomodoroStore((s) => s.reset);
  const skip = usePomodoroStore((s) => s.skip);
  const enterImmersive = usePomodoroStore((s) => s.enterImmersive);
  // 沉睡态（未激活未运行）：沉浸入口常驻但禁用（先开始专注才能进入沉浸）
  const isAsleep = !isRunning && !isPaused && !isArmed;
  const whiteNoiseVolume = useAudioPrefsStore((s) => s.whiteNoiseVolume);
  const deviceType = useAudioPrefsStore((s) => s.deviceType);
  const estimated = useEstimatedVolume(whiteNoiseVolume, deviceType);
  const [trackPickerOpen, setTrackPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // 专注阶段推荐的音轨（focus + both）
  const focusTracks = audioTracks.filter(t => t.phase === 'focus' || t.phase === 'both');

  // 点击外部关闭下拉
  useEffect(() => {
    if (!trackPickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setTrackPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [trackPickerOpen]);

  return (
    <div className="pointer-events-none">
      {/* ── 白噪音卫星（弧右下）── */}
      <div ref={pickerRef} className="pointer-events-auto absolute z-10" style={satPos(SAT.noise, orbitRadius)}>
        <Tip text={audioPrefs.whiteNoiseEnabled ? '关闭背景音' : '开启背景音'}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={audioPrefs.toggleWhiteNoise}
          className={satClass('w-9 h-9 rounded-full border border-border/30 bg-bg-elevated/60 backdrop-blur-sm text-text-tertiary hover:text-text-secondary transition-colors')}
          animate={{ opacity: trackPickerOpen ? 1 : SAT_IDLE_OPACITY }}
          whileHover={{ opacity: 1 }}
        >
          {audioPrefs.whiteNoiseEnabled
            ? <Volume2 className="w-4 h-4" strokeWidth={1.5} />
            : <VolumeX className="w-4 h-4" strokeWidth={1.5} />}
        </motion.button>
        </Tip>
        {/* 音轨/音量下拉面板 */}
        <AnimatePresence>
          {trackPickerOpen && (
            <motion.div
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 min-w-[180px] py-2 rounded-kb-lg bg-bg-elevated border border-border/50 shadow-kb-lg backdrop-blur-xl z-50"
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ duration: 0.12 }}
            >
              {focusTracks.map((track) => (
                <button
                  key={track.id}
                  onClick={() => {
                    audioPrefs.setWhiteNoiseTrack(track.id);
                    if (!audioPrefs.whiteNoiseEnabled) audioPrefs.toggleWhiteNoise();
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-b3 transition-colors',
                    track.id === audioPrefs.whiteNoiseTrackId
                      ? 'text-brand-500 font-medium'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
                  )}
                >
                  <span className="flex-1 text-left">{track.nameZh}</span>
                  {track.id === audioPrefs.whiteNoiseTrackId && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  )}
                </button>
              ))}
              <div className="px-3 py-2 border-t border-border/20 flex items-center gap-2">
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={audioPrefs.whiteNoiseVolume}
                  onChange={(e) => audioPrefs.setWhiteNoiseVolume(parseFloat(e.target.value))}
                  className="w-full h-1 accent-brand-500 cursor-pointer"
                />
                <span className="text-[10px] text-text-tertiary/60 tabular-nums shrink-0">
                  ~{estimated.estimatedDb}dB
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 重置卫星（弧左下）── */}
      <div className="pointer-events-auto absolute z-10" style={satPos(SAT.reset, orbitRadius)}>
        <Tip text="重置计时器（回沉睡）">
        <motion.button
          whileTap={{ scale: 0.9, rotate: -180 }}
          onClick={reset}
          className={satClass('w-9 h-9 rounded-full border border-border/30 bg-bg-elevated/60 backdrop-blur-sm text-text-tertiary hover:text-text-secondary transition-colors')}
          animate={{ opacity: SAT_IDLE_OPACITY }}
          whileHover={{ opacity: 1 }}
        >
          <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        </Tip>
      </div>

      {/* ── 跳过卫星（弧右下）── */}
      <div className="pointer-events-auto absolute z-10" style={satPos(SAT.skip, orbitRadius)}>
        <Tip text="跳过当前阶段">
        <motion.button
          whileTap={{ scale: 0.9, x: 3 }}
          onClick={skip}
          className={satClass('w-9 h-9 rounded-full border border-border/30 bg-bg-elevated/60 backdrop-blur-sm text-text-tertiary hover:text-text-secondary transition-colors')}
          animate={{ opacity: SAT_IDLE_OPACITY }}
          whileHover={{ opacity: 1 }}
        >
          <SkipForward className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        </Tip>
      </div>

      {/* ── 沉浸卫星（弧更左下，常驻显示；沉睡态禁用，先开始专注才能进入沉浸）── */}
      <div className="pointer-events-auto absolute z-10" style={satPos(SAT.immersive, orbitRadius)}>
        <Tip text={isAsleep ? '先开始专注（点击时间生物）' : '进入专注模式'}>
        <motion.button
          whileTap={isAsleep ? undefined : { scale: 0.9 }}
          onClick={isAsleep ? undefined : enterImmersive}
          disabled={isAsleep}
          className={satClass(
            'w-9 h-9 rounded-full border backdrop-blur-sm transition-colors',
            isAsleep
              ? 'border-border/10 bg-bg-elevated/30 text-text-tertiary/30 cursor-not-allowed'
              : 'border-border/30 bg-bg-elevated/60 text-text-tertiary hover:text-text-primary',
          )}
          animate={{ opacity: SAT_IDLE_OPACITY }}
          whileHover={isAsleep ? undefined : { opacity: 1 }}
        >
          <Focus className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        </Tip>
      </div>
    </div>
  );
}
