/**
 * 着陆之问（L0）— 首启唯一的一个问题，替代多步产品介绍
 *
 * @ai-context: 全屏覆盖层（非路由页），由 FirstDiveGate 按 stage==='landing'
 * 挂载。选择画像后进入首潜（diving）或自由探索（skipped）。
 * 画像仅写入本地 kb-onboarding-v2，不上云。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { OnboardingProfile } from './types';
import { LANDING_OPTIONS, orderStepsByProfile } from './diveSteps';
import { useFirstDiveStore } from './useFirstDiveStore';
import { MicroLight } from './MicroLight';

export function LandingQuestion() {
  const answerLanding = useFirstDiveStore((s) => s.answerLanding);
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const handleSelect = async (profile: OnboardingProfile) => {
    if (submitting) return;
    setSubmitting(true);
    await answerLanding(profile);
    if (profile !== 'explore') {
      // 直接落到首潜第一步的页面，让引导条接管
      navigate(orderStepsByProfile(profile)[0].route);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center px-6"
      style={{
        background: 'radial-gradient(ellipse 120% 100% at 50% 30%, #0E2233 0%, #081623 55%, #050C16 100%)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6 } }}
    >
      {/* 微光自我介绍 */}
      <motion.div
        className="flex items-center gap-2.5 mb-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
      >
        <MicroLight size={18} />
        <span className="text-[13px] tracking-wide text-cyan-100/50">
          我是微光，这片海的守夜人。
        </span>
      </motion.div>

      <motion.h1
        className="text-[26px] md:text-[32px] font-serif text-white/90 mb-3 text-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.8 }}
      >
        此刻，最困扰你的是什么？
      </motion.h1>
      <motion.p
        className="text-[13px] text-white/35 mb-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
      >
        选一个，我带你从那里潜下去。
      </motion.p>

      <div className="w-full max-w-md space-y-3">
        {LANDING_OPTIONS.map((opt, i) => (
          <motion.button
            key={opt.profile}
            onClick={() => handleSelect(opt.profile)}
            disabled={submitting}
            className={cn(
              'w-full text-left px-5 py-4 rounded-2xl transition-all duration-300 group',
              'bg-white/[0.04] border border-white/10 backdrop-blur-sm',
              'hover:bg-cyan-400/10 hover:border-cyan-400/30 hover:shadow-[0_0_24px_rgba(6,182,212,0.15)]',
              submitting && 'opacity-50 pointer-events-none',
            )}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 + i * 0.12, duration: 0.5 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="block text-[15px] text-white/85 font-medium">
              {opt.label}
            </span>
            <span className="block mt-1 text-[12px] text-white/30 group-hover:text-cyan-200/50 transition-colors">
              {opt.hint}
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
