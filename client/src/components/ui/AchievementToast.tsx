/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：AchievementToast。
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Timer, Layers, Lightbulb, FileText, Flame, Trophy, Medal,
  type LucideIcon,
} from 'lucide-react';
import type { Achievement } from '@/types/models';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { BrandLogo } from '@/components/ui/BrandLogo';

const ACHIEVEMENT_TOAST_DURATION_MS = 4000;

const ICON_MAP: Record<string, LucideIcon> = {
  Timer, Layers, Lightbulb, FileText, Flame, Trophy, Medal,
};

// 8 particle directions (angle in degrees)
const PARTICLE_DIRS = [0, 45, 90, 135, 180, 225, 270, 315];
const PARTICLE_DIST = 28; // px

interface ToastEntry extends Achievement {
  localId: number;
  exiting: boolean;
}

export default function AchievementToast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((localId: number) => {
    setToasts((prev) => prev.map((t) => (t.localId === localId ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.localId !== localId));
    }, 300);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const a = (e as CustomEvent<Achievement>).detail;
      if (!a) return;
      soundPlayer.play('achievement_unlocked');
      const localId = ++idRef.current;
      setToasts((prev) => [...prev, { ...a, localId, exiting: false }]);
      // Auto-dismiss after 4s
      setTimeout(() => dismiss(localId), ACHIEVEMENT_TOAST_DURATION_MS);
    };
    window.addEventListener('achievement-unlocked', handler);
    return () => window.removeEventListener('achievement-unlocked', handler);
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3 items-end pointer-events-none">
      {toasts.map((t) => {
        const Icon = ICON_MAP[t.icon] ?? Trophy;
        return (
          <div
            key={t.localId}
            className={[
              'pointer-events-auto relative flex items-center gap-3 px-4 py-3',
              'bg-bg-elevated/95 backdrop-blur-md rounded-kb-lg shadow-kb-lg',
              'border border-brand-500/30',
              'min-w-[240px] max-w-xs',
              t.exiting
                ? 'opacity-0 translate-x-4 transition-all duration-300'
                : 'kb-achievement-toast',
            ].join(' ')}
          >
            {/* Icon with particles */}
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-kb-lg bg-brand-500/15 flex items-center justify-center">
                <Icon className="w-5 h-5 text-brand-500" strokeWidth={1.5} />
              </div>
              {/* Golden brand watermark */}
              <BrandLogo
                mode="golden"
                size={48}
                className="absolute -top-1 -right-1 opacity-80"
              />
              {/* Particles */}
              {!t.exiting &&
                PARTICLE_DIRS.map((deg, i) => {
                  const rad = (deg * Math.PI) / 180;
                  const tx = Math.round(Math.cos(rad) * PARTICLE_DIST);
                  const ty = Math.round(Math.sin(rad) * PARTICLE_DIST);
                  return (
                    <span
                      key={i}
                      className="kb-particle"
                      style={{
                        left: '50%',
                        top: '50%',
                        marginLeft: -2,
                        marginTop: -2,
                        // @ts-expect-error custom CSS properties
                        '--kb-tx': `${tx}px`,
                        '--kb-ty': `${ty}px`,
                        animationDelay: `${i * 60}ms`,
                      }}
                    />
                  );
                })}
            </div>

            {/* Text */}
            <div className="flex flex-col min-w-0">
              <span className="text-c1 text-brand-500 font-medium uppercase tracking-wide">
                成就解锁
              </span>
              <span className="text-b2 font-semibold text-text-primary truncate">
                {t.title}
              </span>
              <span className="text-c1 text-text-tertiary truncate">
                {t.description}
              </span>
            </div>

            {/* Close */}
            <button
              onClick={() => dismiss(t.localId)}
              className="absolute top-1.5 right-1.5 p-1 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
