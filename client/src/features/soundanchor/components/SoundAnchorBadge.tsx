/**
 * 声音锚点徽章 — 展示已绑定声音 + 播放按钮
 *
 * @ai-context: 3.11 声音锚点。单个锚点的紧凑展示：声音名 + 播放/停止
 * 按钮；播放经 soundAssetUrl（publicAssetUrl 兼容 Electron file://）。
 */
import { useState } from 'react';
import { Volume2, VolumeX, Music2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { soundAssetUrl, soundDisplayName } from '../lib/soundOptions';
import type { SoundAnchor } from '../types';

interface SoundAnchorBadgeProps {
  anchor: SoundAnchor;
  className?: string;
}

export function SoundAnchorBadge({ anchor, className }: SoundAnchorBadgeProps) {
  const [playing, setPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (playing) {
      audio?.pause();
      setAudio(null);
      setPlaying(false);
      return;
    }
    try {
      const el = new Audio(soundAssetUrl(anchor.soundName));
      el.loop = true;
      el.volume = 0.55;
      el.play().catch(() => { /* 静默降级 */ });
      setAudio(el);
      setPlaying(true);
    } catch {
      /* 静默降级 */
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-kb-full border border-brand-300/40 bg-brand-500/5',
        'px-2.5 py-1 text-xs text-brand-700',
        className,
      )}
    >
      <Music2 className="w-3.5 h-3.5" strokeWidth={1.6} />
      {soundDisplayName(anchor.soundName)}
      <button
        type="button"
        onClick={togglePlay}
        className={cn(
          'p-0.5 rounded-kb-full transition-colors',
          playing
            ? 'text-brand-600 bg-brand-500/15'
            : 'text-text-tertiary hover:text-brand-600 hover:bg-brand-500/10',
        )}
        title={playing ? '停止播放' : '播放锚点声音'}
      >
        {playing ? <VolumeX className="w-3.5 h-3.5" strokeWidth={1.6} /> : <Volume2 className="w-3.5 h-3.5" strokeWidth={1.6} />}
      </button>
    </span>
  );
}
