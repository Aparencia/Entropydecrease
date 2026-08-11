// @ai-context
// 功能页机制讲解区：卡片网格，onSelect 回调联动中央演示。
// Feature mechanics grid with select callback.
"use client";

import type { FeatureMechanicsItem } from "@/lib/features/types";
import { SectionReveal } from "@/components/SectionReveal";

interface FeatureMechanicsProps {
  title: string;
  hint?: string;
  items: FeatureMechanicsItem[];
  onSelect?: (index: number) => void;
}

export function FeatureMechanics({ title, hint, items, onSelect }: FeatureMechanicsProps) {
  return (
    <section className="max-w-4xl mx-auto px-6 mb-24">
      <SectionReveal className="text-center mb-12">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-kb-text mb-3">{title}</h2>
        {hint && <p className="text-kb-text2 text-sm">{hint}</p>}
      </SectionReveal>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((item, i) => (
          <SectionReveal key={item.key ?? item.name} delay={i * 0.06}>
            <button
              type="button"
              onClick={() => onSelect?.(i)}
              className="w-full h-full text-left rounded-3xl p-6 transition-all duration-500 hover:-translate-y-1 cursor-pointer"
              style={{
                background: "var(--kb-bg-elevated)",
                border: "1px solid var(--kb-glass-border)",
                boxShadow: "var(--kb-shadow-card)",
              }}
            >
              <span className="text-2xl">{item.icon}</span>
              <h3 className="font-serif text-lg font-semibold text-kb-text mt-3 mb-2">{item.name}</h3>
              <p className="text-sm text-kb-text2 leading-relaxed">{item.desc}</p>
            </button>
          </SectionReveal>
        ))}
      </div>
    </section>
  );
}
