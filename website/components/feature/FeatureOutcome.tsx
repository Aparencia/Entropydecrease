// @ai-context
// 功能页结果可视化区：标题 + 描述 + Mockup 插槽。
// Feature outcome section with mockup slot.
"use client";

import type { ReactNode } from "react";
import { SectionReveal } from "@/components/SectionReveal";

export function FeatureOutcome({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <section className="max-w-4xl mx-auto px-6 mb-24">
      <SectionReveal className="text-center mb-12">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-kb-text mb-3">{title}</h2>
        <p className="text-kb-text2 text-sm max-w-md mx-auto leading-relaxed">{desc}</p>
      </SectionReveal>
      <SectionReveal delay={0.1}>{children}</SectionReveal>
    </section>
  );
}
