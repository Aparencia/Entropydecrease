/**
 * 熵减 — 移动端 2D 模块导航网格
 *
 * 当 3D 场景降级时（移动端 PWA/浏览器），
 * 替代 3D 空间导航，展示静态渐变背景 + 模块卡片网格。
 *
 * @ai-context: 3D 场景：MobileNavGrid。
 */
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Timer, FileText, Layers, Lightbulb, Sparkles, Clapperboard, BarChart3, Orbit, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { useIsNewbiePhase } from '@/features/onboarding/firstDive/useFirstDiveStore';
import { getModuleSubtitle } from '@/features/onboarding/firstDive/moduleSubtitles';

const modules = [
  { id: 'dashboard', label: '首页', route: '/', icon: BarChart3, color: 'from-brand-500/20 to-brand-600/10', iconColor: 'text-brand-400' },
  { id: 'pomodoro', label: '深潜', route: '/pomodoro', icon: Timer, color: 'from-orange-500/20 to-orange-600/10', iconColor: 'text-orange-400' },
  { id: 'notes', label: '结礁', route: '/notes', icon: FileText, color: 'from-accent-500/20 to-accent-600/10', iconColor: 'text-accent-400' },
  { id: 'flashcards', label: '闪卡', route: '/flashcards', icon: Layers, color: 'from-emerald-500/20 to-emerald-600/10', iconColor: 'text-emerald-400' },
  { id: 'feynman', label: '费曼', route: '/feynman', icon: Lightbulb, color: 'from-amber/20 to-amber/10', iconColor: 'text-amber' },
  { id: 'inspiration', label: '萤火海沟', route: '/inspiration', icon: Sparkles, color: 'from-amber/20 to-amber/10', iconColor: 'text-amber' },
  { id: 'classroom', label: '回声定位', route: '/classroom', icon: Clapperboard, color: 'from-teal-500/20 to-teal-600/10', iconColor: 'text-teal-400' },
  { id: 'constellation', label: '星座大厅', route: '/constellation', icon: Orbit, color: 'from-amber-500/20 to-amber-600/10', iconColor: 'text-amber-400' },
  { id: 'sop', label: '标准作业', route: '/sop', icon: ListChecks, color: 'from-lime-500/20 to-lime-600/10', iconColor: 'text-lime-400' },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 25 } },
};

export function MobileNavGrid() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // 新手期双标签（首潜完成后自动隐去）
  const isNewbie = useIsNewbiePhase();

  return (
    <div className="fixed inset-0 -z-10 overflow-y-auto">
      {/* 静态渐变背景 */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 30%, #0d1b2a 60%, #162447 100%)',
        }}
      />

      {/* 微妙的粒子点缀效果（纯 CSS） */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 30%, rgba(64, 171, 146, 0.15) 0%, transparent 50%),
                            radial-gradient(circle at 80% 70%, rgba(232, 184, 75, 0.12) 0%, transparent 50%),
                            radial-gradient(circle at 50% 50%, rgba(67, 197, 139, 0.08) 0%, transparent 50%)`,
        }}
      />

      {/* 模块网格 */}
      <motion.div
        className="relative z-10 px-6 pt-16 pb-24"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.h1
          className="text-xl font-light text-white/80 mb-1 tracking-wider"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          熵减
        </motion.h1>
        <motion.p
          className="text-xs text-white/30 mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          学习伴侣
        </motion.p>

        <div className="grid grid-cols-2 gap-3">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <motion.button
                key={mod.id}
                variants={itemVariants}
                whileTap={{ scale: 0.95 }}
                onClick={() => { if (pathname !== mod.route) soundPlayer.play('ui_nav_switch'); navigate(mod.route); }}
                className={cn(
                  'flex flex-col items-start gap-3 p-5 rounded-2xl',
                  'bg-gradient-to-br backdrop-blur-sm',
                  'border border-white/5',
                  'active:border-white/15',
                  'transition-colors duration-200',
                  mod.color,
                )}
              >
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center',
                  'bg-white/5 border border-white/10',
                )}>
                  <Icon className={cn('w-5 h-5', mod.iconColor)} strokeWidth={1.5} />
                </div>
                <span className="text-sm text-white/70 font-medium">{mod.label}</span>
                {isNewbie && getModuleSubtitle(mod.id) && (
                  <span className="text-[10px] text-white/40">{getModuleSubtitle(mod.id)}</span>
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
