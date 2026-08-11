// @ai-context
// 设计理念页：三原则（降噪/共情/滋养）+ 记忆主权承诺 + 品牌故事四幕出处。
// Design philosophy: three principles, memory sovereignty, brand story origin.
"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { GlowOrb } from "@/components/GlowOrb";
import { SectionReveal } from "@/components/SectionReveal";

/* ---------- 设计理念：三原则 ---------- */

const PRINCIPLES = [
  {
    title: "降噪",
    desc: "降低外在认知负荷，让你专注于思考本身。没有红色通知的轰炸，没有排行榜的焦虑。",
  },
  {
    title: "共情",
    desc: "通过色彩与材质调节情绪，提供心理安全感。受挫时注入柔粉治愈色，而非刺眼的红色惩罚。",
  },
  {
    title: "滋养",
    desc: "通过微反馈与生长隐喻，持续喂养内在动机。每一次答对，一圈琥珀色微光从指尖漾开。",
  },
];

/* ---------- 星图连线动画 (第三幕) ---------- */

const STAR_NODES = [
  { cx: 60, cy: 80 },
  { cx: 150, cy: 40 },
  { cx: 240, cy: 90 },
  { cx: 120, cy: 150 },
  { cx: 210, cy: 170 },
  { cx: 300, cy: 50 },
  { cx: 330, cy: 140 },
];

const STAR_LINKS = [
  [0, 1], [1, 2], [1, 3], [3, 4], [2, 5], [5, 6], [4, 6], [2, 4],
];

function ConstellationMap() {
  return (
    <svg viewBox="0 0 390 220" className="w-full max-w-md mx-auto" aria-hidden>
      {STAR_LINKS.map(([a, b], i) => (
        <motion.line
          key={i}
          x1={STAR_NODES[a].cx}
          y1={STAR_NODES[a].cy}
          x2={STAR_NODES[b].cx}
          y2={STAR_NODES[b].cy}
          stroke="var(--kb-brand-400)"
          strokeWidth="1"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 0.5 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, delay: 0.3 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
      {STAR_NODES.map((node, i) => (
        <motion.circle
          key={i}
          cx={node.cx}
          cy={node.cy}
          r={i === 2 ? 5 : 3.5}
          fill={i % 2 === 0 ? "var(--kb-moss-green)" : "var(--kb-amber)"}
          initial={{ scale: 0, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${i % 2 === 0 ? "var(--kb-moss-green)" : "var(--kb-amber)"})` }}
        />
      ))}
    </svg>
  );
}

/* ---------- 水母光晕 (第四幕) ---------- */

function JellyfishGlow() {
  return (
    <div className="relative w-48 h-48 mx-auto" aria-hidden>
      <motion.div
        animate={{ y: [0, -12, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 40%, var(--kb-glow-2), transparent 65%)",
          filter: "blur(12px)",
        }}
      />
      <motion.div
        animate={{ y: [0, -8, 0], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        className="absolute inset-8 rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 35%, var(--kb-glow-1), transparent 70%)",
          filter: "blur(8px)",
        }}
      />
      {/* 触须流线 */}
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          animate={{ scaleY: [0.7, 1, 0.7], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: i * 0.6 }}
          className="absolute bottom-0 w-px origin-top"
          style={{
            left: `${30 + i * 14}%`,
            height: 60,
            background: "linear-gradient(var(--kb-accent-500), transparent)",
          }}
        />
      ))}
    </div>
  );
}

/* ---------- 页面 ---------- */

export default function PhilosophyPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const progressOpacity = useTransform(scrollYProgress, [0, 0.05, 0.95, 1], [0, 1, 1, 0]);

  return (
    <div ref={containerRef} className="pt-36 pb-8">
      {/* 页面标题 */}
      <motion.div
        style={{ opacity: progressOpacity }}
        className="fixed top-0 left-0 right-0 h-0.5 z-40 origin-left"
      >
        <motion.div
          className="h-full"
          style={{
            scaleX: scrollYProgress,
            background: "linear-gradient(90deg, var(--kb-brand-400), var(--kb-accent-500))",
          }}
        />
      </motion.div>

      <header className="text-center px-6 mb-28">
        <SectionReveal>
          <p className="text-sm tracking-[0.35em] text-kb-text3 uppercase mb-5">Philosophy</p>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-kb-text mb-6">
            熵减 · 设计理念
          </h1>
          <p className="font-serif text-xl text-kb-text2">
            潜入深海，拾起认知的微光。
          </p>
        </SectionReveal>
      </header>

      {/* ===== 设计理念：三原则 ===== */}
      <section className="max-w-3xl mx-auto px-6 mb-36">
        <SectionReveal className="text-center mb-12">
          <p className="text-xs tracking-[0.3em] text-kb-brand uppercase mb-4">设计理念</p>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-kb-text mb-4">
            视觉服务于认知
          </h2>
          <p className="text-kb-text2 max-w-lg mx-auto leading-relaxed">
            熵减不追求极简的冷淡，也不追求娱乐的喧闹。设计是认知科学与情绪体验的翻译器。
          </p>
        </SectionReveal>
        <div className="grid md:grid-cols-3 gap-6">
          {PRINCIPLES.map((p, i) => (
            <SectionReveal key={p.title} delay={i * 0.1}>
              <div
                className="rounded-3xl p-7 h-full text-center"
                style={{
                  background: "var(--kb-bg-elevated)",
                  border: "1px solid var(--kb-glass-border)",
                  boxShadow: "var(--kb-shadow-card)",
                }}
              >
                <h3 className="font-serif text-xl font-semibold text-kb-text mb-3">{p.title}</h3>
                <p className="text-sm text-kb-text2 leading-relaxed">{p.desc}</p>
              </div>
            </SectionReveal>
          ))}
        </div>
        <SectionReveal delay={0.1}>
          <div className="mt-10 rounded-3xl p-8 text-center" style={{ background: "var(--kb-bg-tertiary)" }}>
            <h3 className="font-serif text-lg font-semibold text-kb-text mb-3">记忆主权</h3>
            <p className="text-kb-text2 text-sm leading-relaxed max-w-md mx-auto">
              你的世界只存在于你的机器上。断网可用，随时可带走。
              我们不卖你的数据，因为数据从来不属于我们。
            </p>
          </div>
        </SectionReveal>
      </section>

      {/* ===== 品牌故事 · 出处 ===== */}
      <section className="text-center px-6 mb-24">
        <SectionReveal>
          <div className="feather-divider max-w-xs mx-auto mb-10" />
          <p className="text-xs tracking-[0.3em] text-kb-text3 uppercase mb-3">品牌故事</p>
          <p className="font-serif text-xl text-kb-text2">以下四幕，是设计理念的出处</p>
        </SectionReveal>
      </section>

      {/* ===== 第一幕：起源 ===== */}
      <section className="relative max-w-2xl mx-auto px-6 mb-36">
        <GlowOrb count={8} className="opacity-40" />
        <SectionReveal>
          <p className="text-xs tracking-[0.3em] text-kb-brand uppercase mb-4">品牌故事 · 第一幕</p>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-kb-text mb-8">
            起源：深夜里的一点微光
          </h2>
        </SectionReveal>
        <SectionReveal delay={0.1}>
          <div className="space-y-6 text-kb-text2 leading-[2] text-[15px]">
            <p>
              故事始于一个再平常不过的深夜。屏幕亮着，网课还在播放，笔记记了一半，思绪却早已飘散。你回头翻看今天学了什么，发现大脑像一片被搅浑的海——信息沉不下去，也浮不上来，只是混沌地悬在那里。
            </p>
            <p>
              那一刻你意识到：<strong className="text-kb-text font-medium">遗忘不是意外，而是常态。</strong>知识如果不被主动拾起，就会像深海中的光，亮了一瞬，随即被黑暗吞没。
            </p>
            <p>
              这不是你一个人的困境。每一个在深夜独自打开屏幕的人，都在这片认知深海里独自下潜——没有灯塔，没有回声，只有自己和不断沉降的碎片。
            </p>
            <p className="font-serif text-lg text-kb-text leading-relaxed">
              熵减，就诞生于这个念头：能不能有人，陪你一起潜入深处，把那些散落的微光一一拾起？
            </p>
          </div>
        </SectionReveal>
      </section>

      {/* ===== 第二幕：使命 ===== */}
      <section className="relative max-w-2xl mx-auto px-6 mb-36">
        {/* 呼吸光晕 */}
        <div
          className="absolute -top-10 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full animate-breathe opacity-25 pointer-events-none"
          style={{ background: "radial-gradient(circle, var(--kb-glow-2), transparent 70%)", filter: "blur(30px)" }}
          aria-hidden
        />
        <SectionReveal>
          <p className="text-xs tracking-[0.3em] text-kb-accent uppercase mb-4">品牌故事 · 第二幕</p>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-kb-text mb-8">
            使命：为每一次下潜，点亮一盏呼吸的灯
          </h2>
        </SectionReveal>
        <SectionReveal delay={0.1}>
          <div className="space-y-6 text-kb-text2 leading-[2] text-[15px]">
            <p>
              物理学告诉我们，宇宙注定走向无序。热量散逸，结构瓦解，记忆衰退——这是熵增，是万物默认的归宿。但薛定谔说过一句话：<strong className="text-kb-text font-medium">&ldquo;生命以负熵为食。&rdquo;</strong>活着本身，就是一场逆熵的奇迹。而学习，是你能做到的最温柔的逆熵行为——向自己的内心注入秩序，抵抗世界的冷却与涣散。
            </p>
            <p>
              熵减不想做一个冰冷的效率工具。我们相信，学习不该是纪律，不该是苦行，更不该是一个人在黑暗里硬撑。它是深海中的一次深呼吸。
            </p>
            <p>所以我们设计了这一切：</p>
            <ul className="space-y-4 pl-1">
              {[
                "当你进入专注，界面像缓缓下潜的海水，外界的噪音被一层层隔绝；",
                "当你答对一道题，一圈琥珀色的微光从指尖漾开，像深海中投下了一颗发光的石子；",
                "当你连续受挫，屏幕不会用红色惩罚你，而是注入一抹温柔的柔粉，轻声告诉你——「没关系，暗流很正常。」",
              ].map((item, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.2 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                  className="flex gap-3 items-start"
                >
                  <span className="mt-2.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--kb-accent-500)" }} />
                  <span>{item}</span>
                </motion.li>
              ))}
            </ul>
            <p className="font-serif text-lg text-kb-text leading-relaxed">
              我们做的每一件事，都是让你在独自学习时，感到不孤单。
            </p>
          </div>
        </SectionReveal>
      </section>

      {/* ===== 第三幕：愿景 ===== */}
      <section className="relative max-w-2xl mx-auto px-6 mb-36">
        <SectionReveal>
          <p className="text-xs tracking-[0.3em] text-kb-moss uppercase mb-4">品牌故事 · 第三幕</p>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-kb-text mb-8">
            愿景：成为认知深海里的发光生命体
          </h2>
        </SectionReveal>
        <SectionReveal delay={0.1}>
          <div className="space-y-6 text-kb-text2 leading-[2] text-[15px]">
            <p>
              如果熵减有终局的样子，我们希望它不是一款软件，而是一片海。一片属于你自己的认知深海。你在这里下潜、沉淀、生长。
            </p>
            <p>
              每一次专注是一段下潜的深度，每一则笔记是一块凝结的暗礁，每一张闪卡是一次维持生命体征的呼吸。而那些零散的灵感，是深海里发光的浮游生物——微小，但终有一天，它们会照亮整片深域。
            </p>
          </div>
        </SectionReveal>

        {/* 星图连线动画 */}
        <SectionReveal delay={0.15} className="my-12">
          <ConstellationMap />
          <p className="text-center text-xs text-kb-text3 mt-4">
            零散的知识点被流线连接，形成只属于你的认知星系
          </p>
        </SectionReveal>

        <SectionReveal delay={0.1}>
          <div className="space-y-6 text-kb-text2 leading-[2] text-[15px]">
            <p>
              随着时间推移，你的深海里会浮现出一张只属于你的认知星图。没有进度条的焦虑，没有排行榜的攀比，只有安静生长的宏大与笃定。
            </p>
            <p className="font-serif text-lg text-kb-text leading-relaxed">
              我们希望，当你打开熵减的那一刻，视觉皮层安静下来，内心笃定起来。在这个场域里，不学习，反而成了一件格格不入的事。
            </p>
          </div>
        </SectionReveal>
      </section>

      {/* ===== 第四幕：人格 ===== */}
      <section className="relative max-w-2xl mx-auto px-6 mb-24">
        <SectionReveal>
          <p className="text-xs tracking-[0.3em] text-kb-amber uppercase mb-4">品牌故事 · 第四幕</p>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-kb-text mb-8">
            人格：如果熵减是一个生命体
          </h2>
        </SectionReveal>

        <SectionReveal delay={0.1} className="mb-10">
          <JellyfishGlow />
        </SectionReveal>

        <SectionReveal delay={0.15}>
          <div className="space-y-6 text-kb-text2 leading-[2] text-[15px]">
            <p>
              如果熵减有形状，它不是锐利的几何体，而是一只悬浮在深海中的发光水母——柔软、透明、带着呼吸的节律。它不催促你，不评判你，不向你投掷焦虑的红色通知。它只是安静地在你身边游过，赛博青色的光晕一明一灭，像在说：<strong className="text-kb-text font-medium">&ldquo;我在这里，慢慢来。&rdquo;</strong>
            </p>
            <p>
              它有自己的温度。深夜时，界面会像深海一样降温，护你入眠前的最后一程专注；疲惫时，底色会悄悄变暖，像有人在远处为你留了一盏灯。
            </p>
            <p>
              它有克制的浪漫。从不在你完成学习时撒下满屏的彩带，只是让一圈极淡的金色水墨从你指尖缓缓扩散——像在深海中投石入渊，涟漪荡漾，余韵悠长。
            </p>
            <p>它是深海里的守夜人。不耀眼，但始终在。</p>
          </div>
        </SectionReveal>
      </section>

      {/* ===== 尾声 ===== */}
      <section className="text-center px-6">
        <SectionReveal>
          <div className="feather-divider max-w-xs mx-auto mb-14" />
          <p className="font-serif text-xl sm:text-2xl text-kb-text leading-relaxed max-w-lg mx-auto mb-4">
            万物终将冷却，但你可以选择向内心注入光。
            <br />
            在无序的宇宙中，你不是一个人。
          </p>
          <p className="text-kb-text2 mb-12">
            熵减——在无序的时光里，陪你慢慢生长。
          </p>
          <a
            href="/download"
            className="inline-block px-8 py-3.5 rounded-2xl text-white font-medium transition-all duration-500 hover:scale-[1.04] active:scale-[0.97]"
            style={{
              background: "linear-gradient(135deg, var(--kb-brand-400), var(--kb-brand-600))",
              boxShadow: "var(--kb-shadow-brand)",
            }}
          >
            开始我的深潜之旅 →
          </a>
        </SectionReveal>
      </section>
    </div>
  );
}
