// @ai-context
// 功能页场景共鸣区：三列场景卡（节律 + 叙事）。
// Feature scenes: rhythm cards with scenario storytelling.
"use client";

import type { FeatureSceneItem } from "@/lib/features/types";
import { SectionReveal } from "@/components/SectionReveal";

export function FeatureScenes({ title, items }: { title: string; items: FeatureSceneItem[] }) {
  return (
    <section className="max-w-4xl mx-auto px-6 mb-24">
      <SectionReveal className="text-center mb-12">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-kb-text mb-3">{title}</h2>
      </SectionReveal>
      <div className="grid sm:grid-cols-3 gap-5">
        {items.map((item, i) => (
          <SectionReveal key={item.name} delay={i * 0.08}>
            <div
              className="rounded-3xl p-7 h-full text-center"
              style={{
                background: "var(--kb-bg-elevated)",
                border: "1px solid var(--kb-glass-border)",
                boxShadow: "var(--kb-shadow-card)",
              }}
            >
              <span className="font-mono text-sm font-bold" style={{ color: "var(--kb-brand-400)" }}>
                {item.rhythm}
              </span>
              <h3 className="font-serif text-lg font-semibold text-kb-text my-3">{item.name}</h3>
              <p className="text-sm text-kb-text2 leading-relaxed">{item.story}</p>
            </div>
          </SectionReveal>
        ))}
      </div>
    </section>
  );
}
