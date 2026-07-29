// @ai-context
// 首页：深海主题 Hero、设计理念、六大功能模块与品牌引言的静态编排。Homepage: hero, philosophy, feature grid, brand quote.
// Why: 文案数据以常量数组前置，视图层仅做映射，便于品牌语料统一维护。
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { GlowOrb } from "@/components/GlowOrb";
import { SectionReveal } from "@/components/SectionReveal";
import { SuperEllipseCard } from "@/components/SuperEllipseCard";

/* ---------- 数据 ---------- */

const PHILOSOPHY = [
  {
    title: "降噪",
    desc: "降低外在认知负荷，让你专注于思考本身。没有红色通知的轰炸，没有排行榜的焦虑。",
    icon: "◌",
    glow: "brand" as const,
  },
  {
    title: "共情",
    desc: "通过色彩与材质调节情绪，提供心理安全感。受挫时注入柔粉治愈色，而非刺眼的红色惩罚。",
    icon: "◎",
    glow: "accent" as const,
  },
  {
    title: "滋养",
    desc: "通过微反馈与生长隐喻，持续喂养内在动机。每一次答对，一圈琥珀色微光从指尖漾开。",
    icon: "❋",
    glow: "card" as const,
  },
];

const FEATURES = [
  {
    name: "深潜",
    origin: "番茄钟",
    desc: "切断海面噪音，潜入零干扰的心流深海。",
    color: "var(--kb-focus-blue)",
  },
  {
    name: "结礁",
    origin: "智能笔记",
    desc: "将漂浮的碎片，沉淀为坚实的认知暗礁。",
    color: "var(--kb-brand-400)",
  },
  {
    name: "回声定位",
    origin: "课堂助手",
    desc: "捕捉深海回声，打捞暗流中的知识暗物质。",
    color: "var(--kb-cyber-cyan)",
  },
  {
    name: "反衰减呼吸",
    origin: "闪卡复习",
    desc: "规律吐纳，让记忆在深海高压下依然鲜活。",
    color: "var(--kb-moss-green)",
  },
  {
    name: "浮出水面",
    origin: "费曼学习法",
    desc: "向世界呼出你的理解。雾散了，轮廓就清晰了。",
    color: "var(--kb-amber)",
  },
  {
    name: "萤火海沟",
    origin: "灵感空间",
    desc: "安放微光，它们终将照亮整片深域。",
    color: "var(--kb-accent-400)",
  },
];

/* ---------- 页面 ---------- */

export default function HomePage() {
  return (
    <>
      {/* ===== Hero：深海氛围 ===== */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* 背景渐变 */}
        <div
          className="absolute inset-0 transition-opacity duration-700"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 40%, var(--kb-bg-secondary), var(--kb-bg-primary) 70%)",
          }}
        />
        {/* 发光粒子 */}
        <GlowOrb count={18} />
        {/* 中心呼吸光晕 */}
        <div
          className="absolute w-[480px] h-[480px] rounded-full animate-breathe opacity-30"
          style={{
            background: "radial-gradient(circle, var(--kb-glow-1), transparent 70%)",
            filter: "blur(40px)",
          }}
        />

        <div className="relative z-10 text-center px-6 max-w-3xl mx-auto">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="text-sm tracking-[0.35em] text-kb-text3 mb-6 uppercase"
          >
            熵减 · Entropy↓
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="font-serif text-4xl sm:text-5xl md:text-6xl font-bold leading-tight text-kb-text mb-6"
          >
            潜入深海，
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: "linear-gradient(135deg, var(--kb-brand-500), var(--kb-accent-500))",
              }}
            >
              拾起认知的微光
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-lg sm:text-xl text-kb-text2 leading-relaxed mb-10 max-w-xl mx-auto"
          >
            在无序的时光里，陪你慢慢生长。
            <br className="hidden sm:block" />
            一款基于认知科学的学习伴侣，为每一次下潜点亮呼吸的灯。
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/download"
              className="px-8 py-3.5 rounded-2xl text-white font-medium transition-all duration-500 hover:scale-[1.04] active:scale-[0.97]"
              style={{
                background: "linear-gradient(135deg, var(--kb-brand-400), var(--kb-brand-600))",
                boxShadow: "var(--kb-shadow-brand)",
              }}
            >
              免费下载 →
            </Link>
            <Link
              href="/story"
              className="px-8 py-3.5 rounded-2xl font-medium text-kb-text2 transition-all duration-500 hover:text-kb-text hover:scale-[1.02] glass-panel"
            >
              进入品牌故事
            </Link>
          </motion.div>
        </div>

        {/* 底部渐隐过渡 */}
        <div
          className="absolute bottom-0 left-0 right-0 h-32"
          style={{ background: "linear-gradient(transparent, var(--kb-bg-primary))" }}
        />
      </section>

      {/* ===== 设计理念 ===== */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <SectionReveal className="text-center mb-16">
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-kb-text mb-4">
            视觉服务于认知
          </h2>
          <p className="text-kb-text2 max-w-lg mx-auto leading-relaxed">
            熵减不追求极简的冷淡，也不追求娱乐的喧闹。
            设计是认知科学与情绪体验的翻译器。
          </p>
        </SectionReveal>

        <div className="grid md:grid-cols-3 gap-6">
          {PHILOSOPHY.map((item, i) => (
            <SectionReveal key={item.title} delay={i * 0.12}>
              <SuperEllipseCard glow={item.glow} className="h-full text-center">
                <span
                  className="inline-flex w-14 h-14 items-center justify-center rounded-2xl text-2xl mb-6"
                  style={{
                    background: "var(--kb-bg-tertiary)",
                    color: "var(--kb-brand-400)",
                    boxShadow: "var(--kb-shadow-card)",
                  }}
                >
                  {item.icon}
                </span>
                <h3 className="font-serif text-xl font-semibold text-kb-text mb-3">{item.title}</h3>
                <p className="text-sm text-kb-text2 leading-relaxed">{item.desc}</p>
              </SuperEllipseCard>
            </SectionReveal>
          ))}
        </div>
      </section>

      {/* ===== 功能星图 ===== */}
      <section className="relative py-24 overflow-hidden">
        <GlowOrb count={8} className="opacity-60" />
        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <SectionReveal className="text-center mb-16">
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-kb-text mb-4">
              六大认知模块
            </h2>
            <p className="text-kb-text2 max-w-lg mx-auto leading-relaxed">
              学、记、练、悟、思——完整的学习闭环，
              每一个模块都是对抗熵增的武器。
            </p>
          </SectionReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((feat, i) => (
              <SectionReveal key={feat.name} delay={i * 0.08}>
                <motion.div
                  whileHover={{ y: -5, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
                  className="group relative rounded-3xl p-7 h-full cursor-default"
                  style={{
                    background: "var(--kb-bg-elevated)",
                    border: "1px solid var(--kb-glass-border)",
                    boxShadow: "var(--kb-shadow-card)",
                  }}
                >
                  {/* 发光节点 */}
                  <div className="flex items-center gap-3 mb-4">
                    <span
                      className="w-3 h-3 rounded-full transition-shadow duration-500 group-hover:shadow-[0_0_12px_4px_var(--kb-glow-2)]"
                      style={{ background: feat.color, boxShadow: `0 0 8px 2px ${feat.color}44` }}
                    />
                    <h3 className="font-serif text-lg font-semibold text-kb-text">{feat.name}</h3>
                    <span className="ml-auto text-xs text-kb-text3 px-2.5 py-1 rounded-lg" style={{ background: "var(--kb-bg-tertiary)" }}>
                      {feat.origin}
                    </span>
                  </div>
                  <p className="text-sm text-kb-text2 leading-relaxed">{feat.desc}</p>
                  {/* 渐细渐隐流线 */}
                  <div
                    className="absolute bottom-0 left-8 right-8 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{ background: `linear-gradient(90deg, transparent, ${feat.color}66, transparent)` }}
                  />
                </motion.div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 品牌引言 ===== */}
      <section className="max-w-3xl mx-auto px-6 py-24 text-center">
        <SectionReveal>
          <div className="feather-divider mb-16" />
          <blockquote className="font-serif text-2xl sm:text-3xl leading-relaxed text-kb-text mb-8">
            &ldquo;宇宙注定走向混乱，
            <br />
            但没关系，我们在熵减里，
            <br />
            <span style={{ color: "var(--kb-amber)" }}>陪你慢慢理清。</span>&rdquo;
          </blockquote>
          <p className="text-kb-text3 text-sm mb-10">
            —— 熵减 · 品牌故事
          </p>
          <Link
            href="/story"
            className="inline-flex items-center gap-2 text-kb-brand font-medium transition-all duration-400 hover:gap-3.5"
          >
            阅读完整品牌故事 <span aria-hidden>→</span>
          </Link>
          <div className="feather-divider mt-16" />
        </SectionReveal>
      </section>

      {/* ===== 底部 CTA ===== */}
      <section className="relative py-24 overflow-hidden">
        <GlowOrb count={10} className="opacity-50" />
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 60% 50% at 50% 60%, var(--kb-glow-1), transparent 70%)",
            filter: "blur(60px)",
            opacity: 0.4,
          }}
        />
        <SectionReveal className="relative z-10 text-center px-6">
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-kb-text mb-5">
            准备好下潜了吗？
          </h2>
          <p className="text-kb-text2 max-w-md mx-auto mb-10 leading-relaxed">
            别人在任由宇宙熵增，你在用「熵减」构建外脑。
            <br />
            免费、开源、本地优先。
          </p>
          <Link
            href="/download"
            className="inline-block px-10 py-4 rounded-2xl text-white font-medium text-lg transition-all duration-500 hover:scale-[1.05] active:scale-[0.97]"
            style={{
              background: "linear-gradient(135deg, var(--kb-amber), var(--kb-accent-400))",
              boxShadow: "var(--kb-shadow-accent)",
            }}
          >
            下载熵减 · 开始深潜
          </Link>
        </SectionReveal>
      </section>
    </>
  );
}
