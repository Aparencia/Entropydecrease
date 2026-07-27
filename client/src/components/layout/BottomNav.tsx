import { NavLink } from 'react-router-dom';
import { Home, Timer, FileText, Layers, Lightbulb, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { to: '/', label: '首页', icon: Home },
  { to: '/pomodoro', label: '深潜', icon: Timer },
  { to: '/notes', label: '结礁', icon: FileText },
  { to: '/flashcards', label: '闪卡', icon: Layers },
  { to: '/feynman', label: '费曼', icon: Lightbulb },
  { to: '/inspiration', label: '灵感', icon: Sparkles },
];

export default function BottomNav() {
  return (
    <nav
      className={cn(
        'md:hidden fixed bottom-0 left-0 right-0 z-30',
        'bg-bg-elevated/95 backdrop-blur-md',
        'border-t border-border/50',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <div className="flex items-center justify-around h-14">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-0.5',
                'w-full h-full',
                'transition-colors duration-kb-normal',
                isActive ? 'text-brand-600' : 'text-text-tertiary',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    'w-icon-md h-icon-md',
                    'transition-transform duration-kb-normal',
                    isActive && 'scale-110',
                  )}
                />
                <span className="text-c1">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
