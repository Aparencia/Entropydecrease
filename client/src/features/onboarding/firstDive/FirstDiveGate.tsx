/**
 * 首潜编排 Gate — 按引导阶段挂载 L0/L1（AppLayout 全局挂载一次）
 *
 * @ai-context: bootstrap 负责旧标记迁移、老用户判定与手册种子（幂等）；
 * stage 为 done/skipped 时本组件渲染 null，对存量用户零打扰。
 * 最后一步的 praise 需要在 stage 变为 done 后仍短暂展示，故 diving 判断
 * 额外放行 justCompleted 存在的瞬间。
 */
import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { LandingQuestion } from './LandingQuestion';
import { FirstDiveGuide } from './FirstDiveGuide';
import { useFirstDiveStore } from './useFirstDiveStore';

export function FirstDiveGate() {
  const stage = useFirstDiveStore((s) => s.stage);
  const isReady = useFirstDiveStore((s) => s.isReady);
  const justCompleted = useFirstDiveStore((s) => s.justCompleted);
  const bootstrap = useFirstDiveStore((s) => s.bootstrap);

  useEffect(() => {
    bootstrap().catch((err) => {
      console.debug('[FirstDiveGate] bootstrap failed', err);
    });
  }, [bootstrap]);

  if (!isReady) return null;

  const showLanding = stage === 'landing';
  // done 后放行片刻，让最后一句 praise 说完
  const showGuide = stage === 'diving' || (stage === 'done' && justCompleted !== null);

  return (
    <AnimatePresence>
      {showLanding && <LandingQuestion key="landing" />}
      {showGuide && <FirstDiveGuide key="guide" />}
    </AnimatePresence>
  );
}
