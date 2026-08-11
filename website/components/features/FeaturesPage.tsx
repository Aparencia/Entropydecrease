// @ai-context
// 功能总览页主体：六大认知模块卡片墙，深潜已上线可点入详情，其余标注建设中。
// Features overview: six module cards, dive is live, others under construction.
"use client";

import Link from "next/link";
import { GlowOrb } from "@/components/GlowOrb";
import { SectionReveal } from "@/components/SectionReveal";

const MODULES = [
  { name: "深潜", origin: "番茄钟", desc: "切断海面噪音，潜入零干扰的心流深海。", href: "/features/dive", ready: true, color: "var(--kb-focus-blue)" },
  { name: "结礁", origin: "智能笔记", desc: "将漂浮的碎片，沉淀为坚实的认知暗礁。", href: "/download", ready: false, color: "var(--kb-brand-400)" },
  { name: "回声定位", origin: "课堂助手", desc: "捕捉深海回声，打捞暗流中的知识暗物质。", href: "/download", ready: false, color: "var(--kb-cyber-cyan)" },
  { name: "反衰减呼吸", origin: "闪卡复习", desc: "规律吐纳，让记忆在深海高压下依然鲜活。", href: "/download", ready: false, color: "var(--kb-moss-green)" },
  { name: "浮出水面", origin: "费曼学习法", desc: "向世界呼出你的理解。雾散了，轮廓就清晰了。", href: "/download", ready: false, color: "var(--kb-amber)" },
  { name: "萤火海沟", origin: "灵感空间", desc: "安放微光，它们终将照亮整片深域。", href: "/download", ready: false, color: "var(--kb-accent-400)" },
];

export function FeaturesPage() {
  return (
    <div className="pt-36 pb-8">
      <header className="text-center px-6 mb-16 relative">
        <GlowOrb count={10} className="opacity-40" />
        <SectionReveal>
          <p className="text-sm tracking-[0.35em] text-kb-text3 uppercase mb-5">Features</p>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-kb-text mb-5">六大认知模块</h1>
          <p className="text-kb-text2 max-w-md mx-auto leading-relaxed">
            学、记、练、悟、思——完整的学习闭环，每一个模块都是对抗熵增的武器。
          </p>
        </SectionReveal>
      </header>

      <section className="max-w-5xl mx-auto px-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {MODULES.map((m, i) => (
            <SectionReveal key={m.name} delay={i * 0.08}>
              <Link
                href={m.href}
                className="group relative block rounded-3xl p-7 h-full transition-all duration-500 hover:-translate-y-1"
                style={{
                  background: "var(--kb-bg-elevated)",
                  border: "1px solid var(--kb-glass-border)",
                  boxShadow: "var(--kb-shadow-card)",
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="w-3 h-3 rounded-full transition-shadow duration-500 group-hover:shadow-[0_0_12px_4px_var(--kb-glow-2)]"
                    style={{ background: m.color, boxShadow: `0 0 8px 2px ${m.color}44` }}
                  />
                  <h3 className="font-serif text-lg font-semibold text-kb-text">{m.name}</h3>
                  <span
                    className="ml-auto text-xs text-kb-text3 px-2.5 py-1 rounded-lg"
                    style={{ background: "var(--kb-bg-tertiary)" }}
                  >
                    {m.origin}
                  </span>
                </div>
                <p className="text-sm text-kb-text2 leading-relaxed">{m.desc}</p>
                {!m.ready && (
                  <span
                    className="inline-block mt-4 text-[10px] px-2 py-0.5 rounded-md text-kb-text3"
                    style={{ background: "var(--kb-bg-tertiary)" }}
                  >
                    建设中 · 敬请期待
                  </span>
                )}
              </Link>
            </SectionReveal>
          ))}
        </div>
      </section>
    </div>
  );
}