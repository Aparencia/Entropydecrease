// @ai-context
// 功能页 Hero 区：眉题、主标题、副题、演示插槽与主 CTA。
// Feature hero: eyebrow, title, subtitle, demo slot and primary CTA.
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { GlowOrb } from "@/components/GlowOrb";
import { SectionReveal } from "@/components/SectionReveal";

interface FeatureHeroProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaHref?: string;
  /** 可玩演示插槽（如 ChronosDemo） */
  demo?: ReactNode;
}

export function FeatureHero({ eyebrow, title, subtitle, ctaText, ctaHref = "/download", demo }: FeatureHeroProps) {
  return (
    <header className="relative text-center px-6 mb-24">
      <GlowOrb count={10} className="opacity-40" />
      <SectionReveal>
        <p className="text-sm tracking-[0.35em] text-kb-text3 uppercase mb-5">{eyebrow}</p>
        <h1 className="font-serif text-4xl sm:text-5xl font-bold text-kb-text mb-6">{title}</h1>
        <p className="text-kb-text2 max-w-lg mx-auto leading-relaxed mb-10">{subtitle}</p>
      </SectionReveal>
      {demo && <SectionReveal delay={0.1}>{demo}</SectionReveal>}
      <SectionReveal delay={0.15}>
        <Link
          href={ctaHref}
          className="inline-block px-10 py-4 rounded-2xl text-white font-medium text-lg transition-all duration-500 hover:scale-[1.05] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kb-brand"
          style={{
            background: "linear-gradient(135deg, var(--kb-amber), var(--kb-accent-400))",
            boxShadow: "var(--kb-shadow-accent)",
          }}
        >
          {ctaText}
        </Link>
      </SectionReveal>
    </header>
  );
}
