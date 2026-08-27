// @ai-context
// 支持页：赞赏码与非金钱支持方式。Support page: sponsor QR and non-monetary support options.
// Why: 赞赏明示不与功能挂钩，规避应用内购合规风险。
"use client";

import { motion } from "framer-motion";
import { GlowOrb } from "@/components/GlowOrb";
import { SectionReveal } from "@/components/SectionReveal";

/**
 * 支持我们 — 赞赏页
 * 赞赏是无偿的心意支持，不与任何功能挂钩
 */
export default function SupportPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <GlowOrb count={14} seed={7} />

      <div className="relative max-w-3xl mx-auto px-6 pt-36 pb-24">
        {/* 标题 */}
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <span
            className="inline-block text-xs tracking-widest uppercase px-3 py-1 rounded-full mb-6"
            style={{
              color: "var(--kb-amber)",
              border: "1px solid var(--kb-border-default)",
              background: "var(--kb-bg-secondary)",
            }}
          >
            Support · 注入负熵
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-kb-text mb-4">
            请作者喝杯蜜雪
          </h1>
          <p className="text-kb-text2 leading-relaxed max-w-md mx-auto">
            熵减由一位独立开发者维护。
            <br />
            你的每一份赞赏，都会变成服务器的电费与深夜的咖啡，
            <br />
            支撑这个小小的生命体继续对抗宇宙的无序。
          </p>
        </motion.div>

        {/* 赞赏码卡片 */}
        <SectionReveal>
          <div
            className="relative rounded-2xl border p-8 sm:p-10 max-w-sm mx-auto text-center"
            style={{
              borderColor: "var(--kb-border-default)",
              background: "var(--kb-bg-secondary)",
            }}
          >
            <div className="rounded-xl overflow-hidden bg-white p-3 mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/sponsor-qr.png"
                alt="微信赞赏码"
                className="w-full h-auto"
              />
            </div>
            <p className="text-sm text-kb-text2 mb-1.5">微信扫一扫 · 赞赏支持</p>
            <p className="text-xs text-kb-text3 leading-relaxed">
              赞赏是纯粹的心意支持，不与任何功能挂钩。
              <br />
              无论是否赞赏，熵减的本地功能永远免费。
            </p>
          </div>
        </SectionReveal>

        {/* 其他支持方式 */}
        <SectionReveal>
          <div className="mt-14 text-center">
            <p className="text-sm text-kb-text3 mb-4">不方便赞赏？这些方式同样珍贵：</p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
              <a
                href="https://github.com/Aparencia/Entropydecrease"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-full text-kb-text2 hover:text-kb-text transition-colors duration-300"
                style={{ border: "1px solid var(--kb-border-default)" }}
              >
                ⭐ 在 GitHub 点个 Star
              </a>
              <span
                className="px-4 py-2 rounded-full text-kb-text2"
                style={{ border: "1px solid var(--kb-border-default)" }}
              >
                📣 推荐给身边的同学
              </span>
              <a
                href="https://github.com/Aparencia/Entropydecrease/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-full text-kb-text2 hover:text-kb-text transition-colors duration-300"
                style={{ border: "1px solid var(--kb-border-default)" }}
              >
                💬 提出你的建议
              </a>
            </div>
          </div>
        </SectionReveal>
      </div>
    </main>
  );
}
