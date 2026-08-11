/**
 * 沉浸模式 — 底部操作区（背景音 + 暂停/继续 + 停止）
 *
 * @ai-context: 从 ImmersiveTimer 拆分（单文件 ≤300 行规范），纯展示组件。
 */
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/Tip';
import { Pause, Play, Square, Volume2, VolumeX } from 'lucide-react';

interface ImmersiveControlsProps {
  whiteNoiseEnabled?: boolean;
  whiteNoiseVolume?: number;
  onToggleWhiteNoise?: () => void;
  onWhiteNoiseVolume?: (vol: number) => void;
  isRunning: boolean;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
}

export function ImmersiveControls({
  whiteNoiseEnabled = false,
  whiteNoiseVolume = 0.5,
  onToggleWhiteNoise,
  onWhiteNoiseVolume,
  isRunning,
  onPause,
  onResume,
  onReset,
}: ImmersiveControlsProps) {
  return (
    <motion.div
      className="absolute bottom-16 flex items-center gap-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...{ duration: 0.4, ease: 'easeOut' }, delay: 0.2 }}
    >
      {/* 背景音开关 + 音量调节 */}
      {onToggleWhiteNoise && (
        <div className="flex items-center gap-2">
          <Tip text={whiteNoiseEnabled ? '关闭背景音' : '开启背景音'}>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onToggleWhiteNoise}
            aria-label={whiteNoiseEnabled ? '关闭背景音' : '开启背景音'}
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center',
              'bg-white/5 border backdrop-blur-sm',
              'transition-colors duration-200',
              whiteNoiseEnabled
                ? 'border-white/15 text-white/80 hover:text-white'
                : 'border-white/8 text-white/35 hover:text-white/60 hover:bg-white/8',
            )}
          >
            {whiteNoiseEnabled
              ? <Volume2 className="w-4 h-4" strokeWidth={1.5} />
              : <VolumeX className="w-4 h-4" strokeWidth={1.5} />}
          </motion.button>
          </Tip>
          <AnimatePresence>
            {whiteNoiseEnabled && onWhiteNoiseVolume && (
              <motion.input
                key="vol-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={whiteNoiseVolume}
                onChange={(e) => onWhiteNoiseVolume(parseFloat(e.target.value))}
                aria-label="背景音音量"
                className="w-20 h-1 cursor-pointer accent-[#5B8A72]"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 80 }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 暂停/继续按钮 */}
      <Tip text={isRunning ? '暂停' : '继续'}>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={isRunning ? onPause : onResume}
        className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center',
          'bg-white/8 backdrop-blur-sm border border-white/10',
          'text-white/60 hover:text-white/90 hover:bg-white/12',
          'transition-colors duration-200',
        )}
      >
        {isRunning
          ? <Pause className="w-5 h-5" strokeWidth={1.5} />
          : <Play className="w-5 h-5 ml-0.5" strokeWidth={1.5} />}
      </motion.button>
      </Tip>

      {/* 停止按钮 */}
      <Tip text="停止">
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={onReset}
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center',
          'bg-white/5 border border-white/8',
          'text-white/40 hover:text-white/70 hover:bg-white/8',
          'transition-colors duration-200',
        )}
      >
        <Square className="w-4 h-4" strokeWidth={1.5} />
      </motion.button>
      </Tip>
    </motion.div>
  );
}
