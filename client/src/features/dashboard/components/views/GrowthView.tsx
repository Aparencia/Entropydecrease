/**
 * GrowthView — 「成长」视图：回顾与觉察
 *
 * 认知任务：自我效能叙事（成长故事）+ 元认知监控（认知负荷/画像/雷达）+ 过程回顾（脉搏/活动流）。
 * 布局：学习脉搏与画像同行（过程 + 身份），成长故事与认知负荷同行（叙事 + 觉察）。
 *
 * @ai-context: dashboard 三视图之成长视图。
 */
import { Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hourglass } from 'lucide-react';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import LearningPulse from '../LearningPulse';
import GrowthStory from '../GrowthStory';
import CognitiveLoadWidget from '../CognitiveLoadWidget';
import JellyfishRadar from '../deep-sea/creatures/JellyfishRadar';
import PlanktonStream from '../deep-sea/creatures/PlanktonStream';
import type { DashboardData } from '../../hooks/useDashboardData';

// 留存组件懒加载（成长视图激活时才进入 bundle 执行）
const LearningProfile = lazy(() => import('@/features/retention/components/LearningProfile').then(m => ({ default: m.LearningProfile })));

interface GrowthViewProps {
  analytics: DashboardData['analytics'];
  analyticsLoading: boolean;
  radarData: DashboardData['radarData'];
  progressItems: DashboardData['progressItems'];
  profileData: DashboardData['profileData'];
  recentActivities: DashboardData['recentActivities'];
}

export function GrowthView({
  analytics, analyticsLoading, radarData, progressItems, profileData, recentActivities,
}: GrowthViewProps) {
  const navigate = useNavigate();

  return (
    <div className="pb-rhythm-xl">
      {/* ════ 成长足迹 ════ */}
      <section className="relative max-w-[1100px] mx-auto px-6 pt-rhythm-md">
        <ModuleRitualHeader
          title="成长足迹"
          note="回顾与觉察"
          sealChar="长"
          sealColor="#0D9488"
          compact
          className="mb-rhythm-sm"
        />
      </section>

      {/* 学习脉搏（过程回顾）+ 学习画像（身份认同） */}
      <section className="relative max-w-[1100px] mx-auto px-6 kb-section-blend">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-rhythm-sm">
          <div className="md:col-span-2">
            <LearningPulse
              data={analytics?.trend ?? []}
              loading={analyticsLoading}
            />
          </div>
          <Suspense fallback={<div className="h-24 rounded-kb-xl bg-bg-elevated/30 animate-pulse-skeleton" />}>
            <LearningProfile
              insights={profileData.insights}
              identityTags={profileData.identityTags}
            />
          </Suspense>
        </div>
      </section>

      {/* 成长叙事（自我效能）+ 认知负荷（觉察） */}
      <section className="relative max-w-[1100px] mx-auto px-6 mt-rhythm-md">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-rhythm-sm">
          <div className="md:col-span-2">
            <GrowthStory aggregate={analytics} loading={analyticsLoading} />
          </div>
          <CognitiveLoadWidget />
        </div>
      </section>

      {/* 🧩 五维能力雷达图 */}
      {radarData.length > 0 && (
        <section className="relative max-w-[1100px] mx-auto px-6 mt-rhythm-md">
          <JellyfishRadar data={radarData} loading={analyticsLoading} />
        </section>
      )}

      {/* 📈 学习进度：各模块完成百分比 */}
      {progressItems.length > 0 && (
        <section className="relative max-w-[1100px] mx-auto px-6 mt-rhythm-md">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {progressItems.map((item) => (
              <div
                key={item.subject}
                className="rounded-kb-xl border border-border/15 bg-bg-elevated/30 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-c1 text-text-secondary truncate">{item.subject}</span>
                  <span className="text-c1 text-text-tertiary tabular-nums">{item.progress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-bg-tertiary/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-500/70 transition-all duration-700"
                    style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 🌊 最近活动：今天发生了什么 */}
      <section className="relative max-w-[1100px] mx-auto px-6 mt-rhythm-md">
        <PlanktonStream activities={recentActivities} loading={analyticsLoading} />
      </section>

      {/* ════ 知识时光胶囊入口（未来自我连续性） ════ */}
      <section className="relative max-w-[1100px] mx-auto px-6 mt-rhythm-md">
        <div className="flex items-center justify-between gap-4 rounded-kb-xl border border-border-subtle bg-bg-elevated/60 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-kb-full bg-amber-500/10 text-amber-600 flex items-center justify-center flex-shrink-0">
              <Hourglass className="w-5 h-5" strokeWidth={1.4} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary">知识时光胶囊</div>
              <div className="text-xs text-text-tertiary truncate">把现在的学习状态封存，30/60/90 天后开启回看成长</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/timecapsule')}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-kb-lg text-xs font-medium text-brand-600 border border-brand-300/50 bg-brand-500/5 hover:bg-brand-500/10 transition-colors"
          >
            <Hourglass className="w-4 h-4" strokeWidth={1.5} />
            封装时光胶囊
          </button>
        </div>
      </section>
    </div>
  );
}
