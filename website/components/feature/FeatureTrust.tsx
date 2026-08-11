// @ai-context
// 功能页信任收口（全站共享）：无锁承诺条、真实用户证据（无则如实说明）、开发者手记入口。
// Shared trust section: no-lock promises, honest user evidence, dev journal entry.
"use client";

import { SectionReveal } from "@/components/SectionReveal";

const PROMISES = [
  "免费 · 无隐藏付费墙",
  "开源 · 代码可审计",
  "数据只在你电脑上",
  "可随时导出带走",
];

export function FeatureTrust() {
  return (
    <section className="max-w-3xl mx-auto px-6 mb-24">
      <SectionReveal className="text-center mb-12">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-kb-text mb-3">你的世界，只属于你</h2>
        <p className="text-kb-text2 text-sm">记忆主权，是熵减的第一承诺</p>
      </SectionReveal>

      {/* 无锁承诺条 */}
      <SectionReveal delay={0.05}>
        <div
          className="rounded-3xl p-8 mb-8"
          style={{
            background: "var(--kb-bg-elevated)",
            border: "1px solid var(--kb-glass-border)",
            boxShadow: "var(--kb-shadow-card)",
          }}
        >
          <ul className="grid sm:grid-cols-2 gap-4 text-sm text-kb-text2">
            {PROMISES.map((p) => (
              <li key={p} className="flex items-center gap-2.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "var(--kb-moss-green)" }}
                />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </SectionReveal>

      {/* 用户证据：只展示真实反馈，暂无则如实说明（红线：不虚构） */}
      <SectionReveal delay={0.1}>
        <div
          className="rounded-3xl p-8 text-center"
          style={{ background: "var(--kb-bg-tertiary)" }}
        >
          <p className="text-kb-text2 text-sm leading-relaxed">
            内测进行中，首批反馈正在沉淀。
            <br />
            我们只展示真实的声音——等你来写下第一条。
          </p>
        </div>
      </SectionReveal>

      {/* 开发手记入口 */}
      <SectionReveal delay={0.15}>
        <div className="text-center mt-10">
          <p className="text-sm text-kb-text2 mb-4">一个人，认真地做了三年。</p>
          <a
            href="https://github.com/Aparencia/Entropydecrease"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-kb-brand font-medium transition-all duration-400 hover:gap-3.5"
          >
            GitHub 仓库 · 开发全程公开 ↗
          </a>
        </div>
      </SectionReveal>
    </section>
  );
}
