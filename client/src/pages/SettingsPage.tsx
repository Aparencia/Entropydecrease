/**
 * @ai-context: 页面组件：SettingsPage。
 */
import { lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { SPRING } from '@/lib/animation/springConfig';
import ProfileSettings from './settings/ProfileSettings';
import AppearanceSettings from './settings/AppearanceSettings';
import PerformanceSettings from './settings/PerformanceSettings';
import PerformanceDiagnostics from './settings/PerformanceDiagnostics';
import SoundSettings from './settings/SoundSettings';
import ModeSettings from './settings/ModeSettings';
import ShortcutSettings from './settings/ShortcutSettings';
import FlashcardSettings from './settings/FlashcardSettings';
import AudioCaptureSettings from './settings/AudioCaptureSettings';
import { BetaProfile } from '@/features/beta/BetaProfile';
import { useBetaProfile } from '@/features/beta/hooks/useBetaProfile';

// 延迟组：有网络/IPC/DB 操作的重组件
const AIProviderSettings = lazy(() => import('./settings/AIProviderSettings'));
const DataSettings = lazy(() => import('./settings/DataSettings'));
const AboutSettings = lazy(() => import('./settings/AboutSettings'));

/** stagger fadeInUp 变体 */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
};

const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: SPRING.default,
  },
};

/** 轻量骨架 fallback */
function SettingsSectionSkeleton() {
  return (
    <div
      className="border border-brand-200/15 dark:border-brand-800/20 bg-bg-elevated/60 backdrop-blur-sm p-5 animate-pulse"
      style={{ borderRadius: '18px 12px 16px 14px' }}
    >
      <div className="h-4 w-28 bg-bg-tertiary rounded mb-3" />
      <div className="h-3 w-full bg-bg-tertiary rounded mb-2" />
      <div className="h-3 w-3/4 bg-bg-tertiary rounded" />
    </div>
  );
}

/** 设置分组卡片 — 不对称圆角 + 品牌色微光边框 */
function SettingsSection({ children, index = 0 }: { children: React.ReactNode; index?: number }) {
  // 基于 index 的不对称圆角变化
  const radii = [
    '18px 12px 16px 14px',
    '14px 18px 12px 16px',
    '16px 14px 18px 12px',
    '12px 16px 14px 18px',
    '18px 14px 12px 16px',
    '14px 12px 18px 14px',
    '16px 18px 14px 12px',
  ];
  const radius = radii[index % radii.length];

  return (
    <motion.div
      variants={sectionVariants}
      className="relative border border-brand-200/15 dark:border-brand-800/20 bg-bg-elevated/70 backdrop-blur-sm p-0.5 overflow-hidden"
      style={{ borderRadius: radius }}
    >
      {/* 品牌色微光边框效果 */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, rgba(91,138,114,0.4) 0%, transparent 50%, rgba(91,138,114,0.2) 100%)',
          borderRadius: radius,
        }}
      />
      <div
        className="relative bg-bg-elevated/90 dark:bg-bg-elevated/80 p-5"
        style={{ borderRadius: `calc(${radius.split(' ')[0]} - 2px) calc(${radius.split(' ')[1]} - 2px) calc(${radius.split(' ')[2]} - 2px) calc(${radius.split(' ')[3]} - 2px)` }}
      >
        {children}
      </div>
    </motion.div>
  );
}

export default function SettingsPage() {
  // 加载内测身份
  useBetaProfile();

  return (
    <motion.div
      className="flex flex-col h-full overflow-y-auto"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <motion.div
        className="px-kb-md py-kb-md"
        variants={sectionVariants}
      >
        <h1 className="text-h1 font-semibold text-text-primary">学习工坊</h1>
        <p className="text-b2 text-text-tertiary mt-1">
          打造专属你的学习空间，每一处调整都是对效率的精雕细琢
        </p>
      </motion.div>

      <div className="flex-1 px-kb-md pb-kb-lg space-y-[var(--kb-beat)] max-w-2xl w-full mx-auto">
        <SettingsSection index={0}>
          <ProfileSettings />
        </SettingsSection>
        <SettingsSection index={1}>
          <BetaProfile />
        </SettingsSection>
        <SettingsSection index={2}>
          <AppearanceSettings />
        </SettingsSection>
        <SettingsSection index={3}>
          <PerformanceSettings />
          <div className="mt-3">
            <PerformanceDiagnostics />
          </div>
        </SettingsSection>
        <SettingsSection index={4}>
          <SoundSettings />
        </SettingsSection>
        <SettingsSection index={5}>
          <ModeSettings />
        </SettingsSection>
        <SettingsSection index={6}>
          <ShortcutSettings />
        </SettingsSection>
        <SettingsSection index={7}>
          <FlashcardSettings />
        </SettingsSection>
        <SettingsSection index={8}>
          <AudioCaptureSettings />
        </SettingsSection>
        <Suspense fallback={<SettingsSectionSkeleton />}>
          <SettingsSection index={9}>
            <AIProviderSettings />
          </SettingsSection>
          <SettingsSection index={10}>
            <DataSettings />
          </SettingsSection>
          <SettingsSection index={11}>
            <AboutSettings />
          </SettingsSection>
        </Suspense>
      </div>
    </motion.div>
  );
}
