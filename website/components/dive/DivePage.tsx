// @ai-context
// 深潜落地页主体：FeatureHero 承载可玩 ChronosDemo，六态卡片联动中央演示，
// 复用 Feature* 模板区块渲染 dive 内容配置。
// Dive landing page body.
"use client";

import Link from "next/link";
import { useState } from "react";
import { DIVE_CONFIG } from "@/lib/features/dive";
import { CHRONOS_STATES, type ChronosState } from "@/lib/features/chronos";
import { ChronosDemo } from "./ChronosDemo";
import { FeatureHero } from "@/components/feature/FeatureHero";
import { FeatureMechanics } from "@/components/feature/FeatureMechanics";
import { FeatureScenes } from "@/components/feature/FeatureScenes";
import { FeatureOutcome } from "@/components/feature/FeatureOutcome";
import { FeatureScience } from "@/components/feature/FeatureScience";
import { FeatureTrust } from "@/components/feature/FeatureTrust";
import { SectionReveal } from "@/components/SectionReveal";

/** 结果可视化 Mockup：专注统计卡片（纯 CSS 示意，防版本迭代过期） */
function DiveOutcomeMockup() {
  return (
    <div
      className="rounded-3xl p-8 mx-auto max-w-2xl"
      style={{
        background: "var(--kb-bg-elevated)",
        border: "1px solid var(--kb-glass-border)",
        boxShadow: "var(--kb-shadow-card)",
      }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-kb-text3 mb-1">本月深潜</p>
          <p className="font-serif text-3xl font-bold text-kb-text">42 次</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-kb-text3 mb-1">连续专注</p>
          <p className="font-serif text-3xl font-bold" style={{ color: "var(--kb-moss-green)" }}>
            7 天
          </p>
        </div>
      </div>
      {/* 周柱状示意 */}
      <div className="flex items-end gap-3 h-24">
        {[35, 60, 45, 80, 55, 90, 70].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-lg transition-all duration-500"
            style={{
              height: `${h}%`,
              background: i === 5 ? "var(--kb-brand-400)" : "var(--kb-bg-tertiary)",
            }}
          />
        ))}
      </div>
      <p className="text-xs text-kb-text3 mt-4 text-center">每一根柱子，都是一次下潜</p>
    </div>
  );
}

export function DivePage() {
  // null = 自由交互；六态卡片点击时受控切换
  const [demoState, setDemoState] = useState<ChronosState | null>(null);

  return (
    <div className="pt-36 pb-8">
      <FeatureHero
        eyebrow={DIVE_CONFIG.origin}
        title={DIVE_CONFIG.hero.title}
        subtitle={DIVE_CONFIG.hero.subtitle}
        ctaText={DIVE_CONFIG.cta.text}
        demo={
          <div>
            <ChronosDemo controlledState={demoState} onStateChange={setDemoState} />
            <p className="text-xs text-kb-text3 mt-4">点它两下，感受它苏醒</p>
          </div>
        }
      />

      <FeatureMechanics
        title={DIVE_CONFIG.mechanics.title}
        hint={DIVE_CONFIG.mechanics.hint}
        items={DIVE_CONFIG.mechanics.items}
        onSelect={(item) => {
          const matched = CHRONOS_STATES.find((s) => s.key === item.key);
          if (matched) setDemoState(matched.key);
        }}
      />

      <FeatureScenes title={DIVE_CONFIG.scenes.title} items={DIVE_CONFIG.scenes.items} />

      <FeatureOutcome title={DIVE_CONFIG.outcome.title} desc={DIVE_CONFIG.outcome.desc}>
        <DiveOutcomeMockup />
      </FeatureOutcome>

      <FeatureScience title={DIVE_CONFIG.science.title} points={DIVE_CONFIG.science.points} />

      <FeatureTrust />

      {/* 底部 CTA */}
      <section className="max-w-3xl mx-auto px-6 text-center">
        <SectionReveal>
          <div className="feather-divider max-w-xs mx-auto mb-14" />
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-kb-text mb-5">
            准备好养一只了吗？
          </h2>
          <p className="text-kb-text2 max-w-md mx-auto mb-10 leading-relaxed">
            免费、开源、本地优先。你的时间生物，只住在你的电脑上。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/download"
              className="inline-block px-10 py-4 rounded-2xl text-white font-medium text-lg transition-all duration-500 hover:scale-[1.05] active:scale-[0.97]"
              style={{
                background: "linear-gradient(135deg, var(--kb-amber), var(--kb-accent-400))",
                boxShadow: "var(--kb-shadow-accent)",
              }}
            >
              {DIVE_CONFIG.cta.text}
            </Link>
            <Link
              href="/features"
              className="px-7 py-3 rounded-2xl font-medium text-kb-text2 transition-all duration-500 hover:text-kb-text hover:scale-[1.02] glass-panel"
            >
              看看全部功能 →
            </Link>
          </div>
        </SectionReveal>
      </section>
    </div>
  );
}