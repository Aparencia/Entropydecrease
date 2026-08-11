/**
 * PomodoroControls — 深潜主页控制区（卫星化固定弧形轨道）
 *
 * 引力场布局：控件围绕生物下缘的固定半圆弧轨道排布，位置由固定角度槽位
 * 三角函数静态计算（不随悬停漂移），平时低透明度（0.6）常驻可见，悬停浮现至 1。
 *
 * 定位根治：轨道半径使用容器尺寸百分比（ORBIT_RATIO），不依赖 px 测量——
 * 容器尺寸任何变化（视口 vmin 波动等）按钮平滑跟随而非跳变，零测量零跳动。
 *
 * 交互收敛（主交互 = 点击时间生物）：
 * - 主按钮已清除：开始/暂停/继续由生物点击承担（热启动直接迈步、专注态暂停/恢复）
 * - 四颗卫星：重置 / 跳过（统一 skipStage）/ 沉浸 / 白噪音（弧端小图标下拉）
 *
 * @ai-context: 状态取自 store；定位由百分比驱动，无外部尺寸依赖。
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

/** 固定角度槽位（度）：弧顶 90° 让位给生物主交互，四卫星对称分布于两侧弧 */
const SAT = {
  reset: 135, skip: 45, immersive: 165, noise: 15,
} as const;

/** 轨道半径比例：容器尺寸的 72.5%（= 半宽 × 1.45），百分比定位随容器平滑跟随 */
const ORBIT_RATIO = 0.725;

/** 卫星平时透明度（常驻可见，悬停浮现至 1） */
const SAT_IDLE_OPACITY = 0.6;

/** 角度 → 百分比定位（圆心 = 容器中心；百分比相对容器，任何尺寸变化平滑跟随） */
function satPos(angleDeg: number): React.CSSProperties {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    left: `calc(50% + ${(Math.cos(rad) * ORBIT_RATIO * 100).toFixed(3)}%)`,
    top: `calc(50% + ${(Math.sin(rad) * ORBIT_RATIO * 100).toFixed(3)}%)`,
  };
}

/** 卫星槽位通用样式（固定锚定，不随悬停漂移） */
function satClass(...classes: string[]): string {
  return cn('absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center', ...classes);
}

export function PomodoroControls() {
  // P0-1 细粒度订阅：整 store 订阅会在任何字段变化时重渲染卫星控制区
  const isRunning = usePomodoroStore((s) => s.isRunning);
  const isPaused = usePomodoroStore((s) => s.isPaused);
  const isArmed = usePomodoroStore((s) => s.isArmed);
  // 动作（稳定引用）
  const reset = usePomodoroStore((s) => s.reset);
  const skipStage = usePomodoroStore((s) => s.skipStage);
  const enterImmersive = usePomodoroStore((s) => s.enterImmersive);
  // 沉睡态（未激活未运行）：沉浸入口常驻但禁用（先开始专注才能进入沉浸）
  const isAsleep = !isRunning && !isPaused && !isArmed;
  const whiteNoiseVolume = useAudioPrefsStore((s) => s.whiteNoiseVolume);
  const deviceType = useAudioPrefsStore((s) => s.deviceType);
  const whiteNoiseEnabled = useAudioPrefsStore((s) => s.whiteNoiseEnabled);
  const whiteNoiseTrackId = useAudioPrefsStore((s) => s.whiteNoiseTrackId);
  const toggleWhiteNoise = useAudioPrefsStore((s) => s.toggleWhiteNoise);
  const setWhiteNoiseTrack = useAudioPrefsStore((s) => s.setWhiteNoiseTrack);
  const setWhiteNoiseVolume = useAudioPrefsStore((s) => s.setWhiteNoiseVolume);
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
    <>
      {/* ── 白噪音卫星（弧右下）── */}
      <div ref={pickerRef} className="pointer-events-auto absolute z-10" style={satPos(SAT.noise)}>
        <Tip text={whiteNoiseEnabled ? '关闭背景音' : '开启背景音'}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={toggleWhiteNoise}
          className={satClass('w-9 h-9 rounded-full border border-border/30 bg-bg-elevated/60 backdrop-blur-sm text-text-tertiary hover:text-text-secondary transition-colors')}
          animate={{ opacity: trackPickerOpen ? 1 : SAT_IDLE_OPACITY }}
          whileHover={{ opacity: 1 }}
        >
          {whiteNoiseEnabled
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
                    setWhiteNoiseTrack(track.id);
                    if (!whiteNoiseEnabled) toggleWhiteNoise();
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-b3 transition-colors',
                    track.id === whiteNoiseTrackId
                      ? 'text-brand-500 font-medium'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
                  )}
                >
                  <span className="flex-1 text-left">{track.nameZh}</span>
                  {track.id === whiteNoiseTrackId && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  )}
                </button>
              ))}
              <div className="px-3 py-2 border-t border-border/20 flex items-center gap-2">
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={whiteNoiseVolume}
                  onChange={(e) => setWhiteNoiseVolume(parseFloat(e.target.value))}
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
      <div className="pointer-events-auto absolute z-10" style={satPos(SAT.reset)}>
        <Tip text="重置计时器（回沉睡）">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={reset}
          className={satClass('w-9 h-9 rounded-full border border-border/30 bg-bg-elevated/60 backdrop-blur-sm text-text-tertiary hover:text-text-secondary transition-colors')}
          animate={{ opacity: SAT_IDLE_OPACITY }}
          whileHover={{ opacity: 1 }}
        >
          <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        </Tip>
      </div>

      {/* ── 跳过卫星（弧右下）：统一 skipStage（呼吸态→跳过呼吸进专注，其他→常规跳过）── */}
      <div className="pointer-events-auto absolute z-10" style={satPos(SAT.skip)}>
        <Tip text="跳过当前阶段">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={skipStage}
          className={satClass('w-9 h-9 rounded-full border border-border/30 bg-bg-elevated/60 backdrop-blur-sm text-text-tertiary hover:text-text-secondary transition-colors')}
          animate={{ opacity: SAT_IDLE_OPACITY }}
          whileHover={{ opacity: 1 }}
        >
          <SkipForward className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        </Tip>
      </div>

      {/* ── 沉浸卫星（弧更左下，常驻显示；沉睡态禁用，先开始专注才能进入沉浸）── */}
      <div className="pointer-events-auto absolute z-10" style={satPos(SAT.immersive)}>
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
    </>
  );
}
