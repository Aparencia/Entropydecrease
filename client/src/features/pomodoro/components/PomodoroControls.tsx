/**
 * 深潜主页 — 普通视图底部控制区（白噪音条 + 主按钮组 + 沉浸入口）
 *
 * @ai-context: 从 PomodoroPage 拆分（单文件 ≤300 行规范）。状态直接取自
 * store，唯一外部依赖是 onStart（打开目标设置弹窗开始新番茄）。
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw, SkipForward, Volume2, VolumeX, Focus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/Tip';
import { SPRING } from '@/lib/animation/springConfig';
import { usePomodoroStore } from '../store/usePomodoroStore';
import { useShallow } from 'zustand/react/shallow';
import { useAudioPrefsStore } from '@/lib/audio/audioPrefsStore';
import { audioTracks } from '@/lib/audio/audioConfig';

interface PomodoroControlsProps {
  /** 开始新番茄（打开目标设置弹窗） */
  onStart: () => void;
}

export function PomodoroControls({ onStart }: PomodoroControlsProps) {
  const { isRunning, isPaused, pause, resume, reset, skip, enterImmersive } = usePomodoroStore(useShallow(s => s));
  const audioPrefs = useAudioPrefsStore();
  const whiteNoiseTrack = useMemo(
    () => audioTracks.find((t) => t.id === audioPrefs.whiteNoiseTrackId) ?? audioTracks[0],
    [audioPrefs.whiteNoiseTrackId],
  );

  const handleMainButton = () => {
    if (isRunning) pause();
    else if (isPaused) resume();
    else onStart();
  };

  const mainButtonIcon = isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />;

  return (
    <>
      {/* 白噪音控制 */}
      <motion.div
        className="flex items-center gap-2 mb-[clamp(0.375rem,1.5vh,2rem)] px-4 py-2 bg-bg-elevated/40 backdrop-blur-sm rounded-full border border-border/20"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Tip text={audioPrefs.whiteNoiseEnabled ? '关闭背景音' : '开启背景音'}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={audioPrefs.toggleWhiteNoise}
          className={cn(
            'p-1.5 rounded-full transition-all duration-200',
            audioPrefs.whiteNoiseEnabled ? 'text-brand-500' : 'text-text-tertiary hover:text-text-secondary',
          )}
        >
          {audioPrefs.whiteNoiseEnabled
            ? <Volume2 className="w-4 h-4" strokeWidth={1.5} />
            : <VolumeX className="w-4 h-4" strokeWidth={1.5} />}
        </motion.button>
        </Tip>
        <span className="text-[11px] text-text-tertiary select-none">{whiteNoiseTrack.nameZh}</span>
        <input
          type="range" min={0} max={1} step={0.05}
          value={audioPrefs.whiteNoiseVolume}
          onChange={(e) => audioPrefs.setWhiteNoiseVolume(parseFloat(e.target.value))}
          className="w-16 h-1 accent-brand-500 cursor-pointer"
        />
      </motion.div>

      {/* Controls — 居中大按钮 + 品牌色光晕 */}
      <motion.div
        className="flex items-center gap-4 mb-[clamp(0.25rem,1.2vh,2rem)]"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, ...SPRING.gentle }}
      >
        <Tip text="重置计时器">
        <motion.button
          whileTap={{ scale: 0.9, rotate: -180 }}
          onClick={reset}
          className="w-10 h-10 rounded-full border border-border/30 flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:border-border/50 transition-all duration-200"
        >
          <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        </Tip>

        <motion.button
          whileHover={{ scale: 1.05, boxShadow: '0 8px 32px color-mix(in srgb, var(--kb-brand-500) 45%, transparent)' }}
          whileTap={{ scale: 0.97 }}
          onClick={handleMainButton}
          className={cn(
            'w-16 h-16 rounded-full flex items-center justify-center',
            'bg-brand-500 text-white',
            'transition-shadow duration-300',
          )}
          style={{
            boxShadow: '0 4px 20px color-mix(in srgb, var(--kb-brand-500) 35%, transparent), 0 0 40px color-mix(in srgb, var(--kb-brand-500) 15%, transparent)',
          }}
        >
          {mainButtonIcon}
        </motion.button>

        <Tip text="跳过当前阶段">
        <motion.button
          whileTap={{ scale: 0.9, x: 3 }}
          onClick={skip}
          className="w-10 h-10 rounded-full border border-border/30 flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:border-border/50 transition-all duration-200"
        >
          <SkipForward className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        </Tip>
      </motion.div>

      {/* 沉浸模式入口 */}
      {(isRunning || isPaused) && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={enterImmersive}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-medium text-text-tertiary hover:text-text-primary hover:bg-bg-secondary/40 transition-all duration-200"
        >
          <Focus className="w-4 h-4" strokeWidth={1.5} />
          进入专注模式
        </motion.button>
      )}
    </>
  );
}
