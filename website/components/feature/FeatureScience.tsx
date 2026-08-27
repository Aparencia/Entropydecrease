// @ai-context
// 功能页科学依据区：要点列表。
// Feature science points list.
"use client";

import { SectionReveal } from "@/components/SectionReveal";

export function FeatureScience({ title, points }: { title: string; points: string[] }) {
  return (
    <section className="max-w-2xl mx-auto px-6 mb-24">
      <SectionReveal className="text-center mb-12">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-kb-text mb-3">{title}</h2>
      </SectionReveal>
      <div className="space-y-5">
        {points.map((point, i) => (
          <SectionReveal key={i} delay={i * 0.08}>
            <div
              className="flex gap-3.5 items-start rounded-2xl p-5"
              style={{ background: "var(--kb-bg-tertiary)" }}
            >
              <span
                className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: "var(--kb-cyber-cyan)" }}
              />
              <p className="text-sm text-kb-text2 leading-relaxed">{point}</p>
            </div>
          </SectionReveal>
        ))}
      </div>
    </section>
  );
}
