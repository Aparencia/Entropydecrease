# 官网功能体系（深潜落地页 + 站点升级）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可扩展的官网功能页体系：交付 /features/dive 深潜落地页（含可玩 Chronos 粒子演示）、/features 功能总览页，同步完成导航调整、设计理念页改造、下载页首屏 CTA 修复与首页星图接入。

**Architecture:** 内容配置化（lib/features/ 数据文件）驱动通用区块模板（components/feature/），页面 = 模板 + 配置 + 特有演示组件（components/dive/ChronosDemo 自研轻量 Canvas 2D，不引 three.js）。静态导出（output: "export"）兼容，全部为客户端组件 + server 页导出 metadata。

**Tech Stack:** Next.js 16 App Router、React 19、framer-motion 12、Tailwind CSS 4、TypeScript 5。验证命令：`npm run build`（next build 静态导出）、`npm run lint`。

**Spec:** [2026-08-11-website-feature-pages-design.md](../specs/2026-08-11-website-feature-pages-design.md)

---

### Task 1: 原子层 — 类型定义、六态常量与深潜内容配置

**Files:**
- Create: `website/lib/features/types.ts`
- Create: `website/lib/features/chronos.ts`
- Create: `website/lib/features/dive.ts`

- [ ] **Step 1: 创建类型定义 types.ts**

```ts
// @ai-context
// 功能页内容配置类型：所有功能页共享同一结构，新增功能仅需实现该接口。
// Feature config types: shared schema for all feature landing pages.
// 纯类型文件，无运行时逻辑，不需要 "use client" 指令。

export interface FeatureMechanicsItem {
  name: string;
  icon: string;
  desc: string;
}

export interface FeatureSceneItem {
  name: string;
  rhythm: string;
  story: string;
}

export interface FeatureConfig {
  slug: string;
  name: string;
  origin: string;
  tagline: string;
  hero: { title: string; subtitle: string };
  mechanics: { title: string; hint?: string; items: FeatureMechanicsItem[] };
  scenes: { title: string; items: FeatureSceneItem[] };
  outcome: { title: string; desc: string };
  science: { title: string; points: string[] };
  cta: { text: string };
}
```

- [ ] **Step 2: 创建六态常量 chronos.ts**

```ts
// @ai-context
// Chronos 六态形态定义与视觉参数：类型、展示元数据、Canvas 演示渲染参数。
// Chronos six-state definitions and visual params for the web demo.
// Why: 状态机与展示数据集中定义，ChronosDemo 组件与 dive 内容配置共享同一来源，避免漂移。

export type ChronosState =
  | "asleep"
  | "breathing"
  | "focus"
  | "short_break"
  | "long_break"
  | "milestone";

export interface ChronosStateMeta {
  key: ChronosState;
  name: string;
  icon: string;
  desc: string;
}

export const CHRONOS_STATES: ChronosStateMeta[] = [
  { key: "asleep", name: "沉睡", icon: "🌑", desc: "暗红余烬脉动，等待被唤醒。" },
  { key: "breathing", name: "呼吸", icon: "🌕", desc: "60bpm 心跳红光，准备好开始。" },
  { key: "focus", name: "专注", icon: "🔥", desc: "白炽星体，粒子随倒计时消散。" },
  { key: "short_break", name: "短休", icon: "🌱", desc: "嫩绿种子自旋，萌芽新生。" },
  { key: "long_break", name: "长休", icon: "🌳", desc: "种子破土，长成参天大树。" },
  { key: "milestone", name: "划时代点", icon: "💡", desc: "把时间抽象，变成有生命的伙伴。" },
];

/** 六态渲染参数：RGB 主色 / 心跳强度(0-1) / 粒子规模 / 漂移速度 / 光晕强度 / 是否粒子消散 */
export interface ChronosStateStyle {
  color: [number, number, number];
  pulse: number;
  scale: number;
  drift: number;
  glow: number;
  dissipate: boolean;
}

export const STATE_STYLE: Record<ChronosState, ChronosStateStyle> = {
  asleep:      { color: [156, 59, 59],  pulse: 0.35, scale: 0.55, drift: 0.25, glow: 0.22, dissipate: false },
  breathing:   { color: [239, 68, 68],  pulse: 1.0,  scale: 1.0,  drift: 0.4,  glow: 0.4,  dissipate: false },
  focus:       { color: [249, 115, 22], pulse: 0.2,  scale: 1.2,  drift: 0.7,  glow: 0.55, dissipate: true },
  short_break: { color: [74, 222, 128], pulse: 0.55, scale: 0.9,  drift: 0.55, glow: 0.45, dissipate: false },
  long_break:  { color: [34, 197, 94],  pulse: 0.3,  scale: 1.1,  drift: 0.35, glow: 0.5,  dissipate: false },
  milestone:   { color: [251, 191, 36], pulse: 0.9,  scale: 1.15, drift: 0.6,  glow: 0.6,  dissipate: false },
};
```

- [ ] **Step 3: 创建深潜内容配置 dive.ts**

```ts
// @ai-context
// 深潜功能页内容配置：数据驱动渲染，新增功能页时复制本文件结构。
// Dive feature page content config.
import type { FeatureConfig } from "./types";
import { CHRONOS_STATES } from "./chronos";

export const DIVE_CONFIG: FeatureConfig = {
  slug: "dive",
  name: "深潜",
  origin: "番茄钟",
  tagline: "把番茄钟，养成一只时间生物",
  hero: {
    title: "把番茄钟，养成一只时间生物",
    subtitle: "它不是倒计时，是你亲手点亮、看着它燃烧与生长的 Chronos。",
  },
  mechanics: {
    title: "它的一生，由你点亮",
    hint: "点击形态，中央的 Chronos 会变成它",
    items: CHRONOS_STATES.map((s) => ({ name: s.name, icon: s.icon, desc: s.desc })),
  },
  scenes: {
    title: "不是 25 分钟，是你的节奏",
    items: [
      { name: "刷题", rhythm: "50 / 10", story: "沉浸演算，别让铃声打断思路。" },
      { name: "背单词", rhythm: "15 / 3", story: "短频快，趁记忆窗口最亮时反复。" },
      { name: "晚自习", rhythm: "90 / 20", story: "长线作战，跟着超昼夜节律走。" },
    ],
  },
  outcome: {
    title: "你的深潜，会积成一片海",
    desc: "每一次专注都是一段下潜深度——它们被记录、被看见、长成只属于你的认知星图。",
  },
  science: {
    title: "为什么「一个番茄」不够",
    points: [
      "注意力遵循 90–120 分钟的超昼夜节律，固定 25 分钟会截断你的高效期。",
      "休息不是浪费——清醒期记忆重放，让刚学的内容在后台沉淀。",
      "失败不被惩罚：连续受挫时屏幕注入柔粉，而非刺眼的红色。",
    ],
  },
  cta: { text: "免费下载 · 现在就能养一只" },
};
```

- [ ] **Step 4: 提交**

```bash
git add website/lib/features/
git commit -m "feat(website): add feature config types, chronos states and dive content config"
```

---

### Task 2: 通用模板组件 — 六个 Feature 区块

**Files:**
- Create: `website/components/feature/FeatureHero.tsx`
- Create: `website/components/feature/FeatureMechanics.tsx`
- Create: `website/components/feature/FeatureScenes.tsx`
- Create: `website/components/feature/FeatureOutcome.tsx`
- Create: `website/components/feature/FeatureScience.tsx`
- Create: `website/components/feature/FeatureTrust.tsx`

- [ ] **Step 1: 创建 FeatureHero.tsx**（标题+副题+演示插槽+CTA）

```tsx
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
          className="inline-block px-10 py-4 rounded-2xl text-white font-medium text-lg transition-all duration-500 hover:scale-[1.05] active:scale-[0.97]"
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
```

- [ ] **Step 2: 创建 FeatureMechanics.tsx**（形态卡网格，可联动演示）

```tsx
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
          <SectionReveal key={item.name} delay={i * 0.06}>
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
```

- [ ] **Step 3: 创建 FeatureScenes.tsx**（场景共鸣区）

```tsx
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
```

- [ ] **Step 4: 创建 FeatureOutcome.tsx**（结果可视化区，Mockup 插槽）

```tsx
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
```

- [ ] **Step 5: 创建 FeatureScience.tsx**（科学依据区）

```tsx
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
```

- [ ] **Step 6: 创建 FeatureTrust.tsx**（全站共享信任收口：无锁承诺 + 用户证据 + 开发手记）

```tsx
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
```

- [ ] **Step 7: 提交**

```bash
git add website/components/feature/
git commit -m "feat(website): add reusable feature page template sections"
```

---

### Task 3: ChronosDemo — 可玩 Canvas 2D 粒子演示（页面灵魂）

**Files:**
- Create: `website/components/dive/ChronosDemo.tsx`

- [ ] **Step 1: 创建 ChronosDemo.tsx**（自研轻量粒子引擎，~300 粒子，六态参数化状态机）

```tsx
// @ai-context
// Chronos 可玩演示：自研轻量 Canvas 2D 粒子引擎，六态参数化状态机，
// 与产品内两步式交互同构（沉睡→呼吸→专注）。不依赖 three.js，保首屏。
// Chronos playable demo: self-built Canvas 2D particle engine.
// Why: 宣传视觉资产需零依赖、60fps、reduced-motion 可降级；参数复用 lib/features/chronos.ts。
"use client";

import { useEffect, useRef, useState } from "react";
import { CHRONOS_STATES, STATE_STYLE, type ChronosState } from "@/lib/features/chronos";

const PARTICLE_COUNT = 300;
/** 专注态粒子消散循环周期（秒）：模拟倒计时沙漏 */
const FOCUS_CYCLE_S = 24;
/** 透视投影焦距 */
const FOCAL = 3.2;

interface Particle {
  theta: number;
  phi: number;
  r: number;
  speed: number;
  phase: number;
}

interface ChronosDemoProps {
  /** 受控形态（六态卡片点击传入）；null = 自由交互（点击推进） */
  controlledState?: ChronosState | null;
  onStateChange?: (s: ChronosState) => void;
}

export function ChronosDemo({ controlledState = null, onStateChange }: ChronosDemoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [freeState, setFreeState] = useState<ChronosState>("asleep");
  const state = controlledState ?? freeState;
  const stateRef = useRef(state);
  stateRef.current = state;

  // 自由交互：沉睡→呼吸→专注→沉睡
  const handleTap = () => {
    if (controlledState) return;
    const next: ChronosState =
      state === "asleep" ? "breathing" : state === "breathing" ? "focus" : "asleep";
    setFreeState(next);
    onStateChange?.(next);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.min(canvas.clientWidth, canvas.clientHeight);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // 球面分布（带厚度）+ 增量角度漂移
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      theta: Math.random() * Math.PI * 2,
      phi: Math.acos(2 * Math.random() - 1),
      r: 0.55 + Math.random() * 0.45,
      speed: 0.05 + Math.random() * 0.12,
      phase: Math.random() * Math.PI * 2,
    }));

    const cx = size / 2;
    const cy = size / 2;
    let raf = 0;
    const start = performance.now();

    const render = (now: number) => {
      const elapsed = (now - start) / 1000;
      const style = STATE_STYLE[stateRef.current];
      const [cr, cg, cb] = style.color;

      ctx.clearRect(0, 0, size, size);
      ctx.globalCompositeOperation = "lighter";

      // 心跳脉动：breathing 为 1Hz（60bpm），其余弱脉动
      const pulse = style.pulse * (0.5 + 0.5 * Math.sin(elapsed * Math.PI * 2));
      const focusProgress = (elapsed % FOCUS_CYCLE_S) / FOCUS_CYCLE_S;

      // 中心光晕
      const glowR = size * (0.32 + pulse * 0.06);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      glow.addColorStop(0, `rgba(${cr},${cg},${cb},${style.glow})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      // 全局自转 + 微摆
      const rotY = elapsed * 0.12;
      const rotX = Math.sin(elapsed * 0.08) * 0.25;

      particles.forEach((p, i) => {
        // 专注态：粒子按索引顺序随进度消散（沙漏隐喻）
        if (style.dissipate && i / PARTICLE_COUNT < focusProgress) return;

        const theta = p.theta + elapsed * p.speed * style.drift + rotY;
        const phi = p.phi + rotX;
        const radius = p.r * style.scale * (1 + pulse * 0.08);
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);

        // 透视投影：近大远小 + 深度亮度
        const proj = FOCAL / (FOCAL - z);
        const px = cx + x * (size / 2) * proj;
        const py = cy + y * (size / 2) * proj;
        const depth = (z + 1) / 2;
        const alpha =
          (0.25 + 0.55 * depth) * (style.dissipate ? 1 - focusProgress * 0.6 : 1);
        const pr = Math.max((0.7 + 1.3 * depth) * proj * style.scale, 0.3);

        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
        ctx.fill();
      });

      // 划时代点：金色涟漪扩散
      if (stateRef.current === "milestone") {
        const ringT = (elapsed % 3) / 3;
        ctx.beginPath();
        ctx.arc(cx, cy, size * (0.2 + ringT * 0.35), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(251,191,36,${0.5 * (1 - ringT)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      raf = requestAnimationFrame(render);
    };

    if (reduced) {
      // 无障碍降级：静态一帧渐变球
      const [cr, cg, cb] = STATE_STYLE.asleep.color;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.4);
      glow.addColorStop(0, `rgba(${cr},${cg},${cb},0.5)`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
    } else {
      raf = requestAnimationFrame(render);
    }

    return () => cancelAnimationFrame(raf);
  }, []);

  const meta = CHRONOS_STATES.find((s) => s.key === state);

  return (
    <div
      className="relative w-[clamp(240px,52vmin,420px)] h-[clamp(240px,52vmin,420px)] mx-auto cursor-pointer select-none"
      onClick={handleTap}
      role="button"
      aria-label="Chronos 时间生物演示，点击切换形态"
    >
      <canvas ref={canvasRef} className="w-full h-full" />
      <div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs text-kb-text2 whitespace-nowrap"
        style={{ background: "var(--kb-bg-tertiary)" }}
      >
        {meta?.icon} {meta?.name}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add website/components/dive/ChronosDemo.tsx
git commit -m "feat(website): add playable Chronos canvas demo with six-state machine"
```

---

### Task 4: /features/dive 深潜落地页

**Files:**
- Create: `website/app/features/dive/page.tsx`（server，导出 metadata）
- Create: `website/components/dive/DivePage.tsx`（client，页面主体）

- [ ] **Step 1: 创建 server 页面并导出 SEO metadata**

```tsx
// @ai-context
// 深潜功能页：SEO metadata 由 server 组件导出，页面主体为客户端组件 DivePage。
// Dive feature page: SEO metadata + client page body.
import type { Metadata } from "next";
import { DivePage } from "@/components/dive/DivePage";

export const metadata: Metadata = {
  title: "深潜 · 会呼吸的番茄钟",
  description:
    "熵减「深潜」：把番茄钟养成一只时间生物。六态形态、场景化预设、超昼夜节律——专注本该如此。",
  keywords: ["番茄钟", "专注", "学习", "深潜", "时间生物", "熵减"],
};

export default function Page() {
  return <DivePage />;
}
```

- [ ] **Step 2: 创建 DivePage.tsx**（Hero 可玩演示 + 六态联动 + 各区块编排 + 底部 CTA）

```tsx
// @ai-context
// 深潜落地页主体：FeatureHero 承载可玩 ChronosDemo，六态卡片联动中央演示，
// 复用 Feature* 模板区块渲染 dive 内容配置。
// Dive landing page body.
"use client";

import Link from "next/link";
import { useState } from "react";
import { DIVE_CONFIG } from "@/lib/features/dive";
import { CHRONOS_STATES, type ChronosState } from "@/lib/features/chronos";
import { ChronosDemo } from "./ChronosDemo";
import { FeatureHero } from "@/components/feature/FeatureHero";
import { FeatureMechanics } from "@/components/feature/FeatureMechanics";
import { FeatureScenes } from "@/components/feature/FeatureScenes";
import { FeatureOutcome } from "@/components/feature/FeatureOutcome";
import { FeatureScience } from "@/components/feature/FeatureScience";
import { FeatureTrust } from "@/components/feature/FeatureTrust";
import { SectionReveal } from "@/components/SectionReveal";

/** 结果可视化 Mockup：专注统计卡片（纯 CSS 示意，防版本迭代过期） */
function DiveOutcomeMockup() {
  return (
    <div
      className="rounded-3xl p-8 mx-auto max-w-2xl"
      style={{
        background: "var(--kb-bg-elevated)",
        border: "1px solid var(--kb-glass-border)",
        boxShadow: "var(--kb-shadow-card)",
      }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-kb-text3 mb-1">本月深潜</p>
          <p className="font-serif text-3xl font-bold text-kb-text">42 次</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-kb-text3 mb-1">连续专注</p>
          <p className="font-serif text-3xl font-bold" style={{ color: "var(--kb-moss-green)" }}>
            7 天
          </p>
        </div>
      </div>
      {/* 周柱状示意 */}
      <div className="flex items-end gap-3 h-24">
        {[35, 60, 45, 80, 55, 90, 70].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-lg transition-all duration-500"
            style={{
              height: `${h}%`,
              background: i === 5 ? "var(--kb-brand-400)" : "var(--kb-bg-tertiary)",
            }}
          />
        ))}
      </div>
      <p className="text-xs text-kb-text3 mt-4 text-center">每一根柱子，都是一次下潜</p>
    </div>
  );
}

export function DivePage() {
  // null = 自由交互；六态卡片点击时受控切换
  const [demoState, setDemoState] = useState<ChronosState | null>(null);

  return (
    <div className="pt-36 pb-8">
      <FeatureHero
        eyebrow={DIVE_CONFIG.origin}
        title={DIVE_CONFIG.hero.title}
        subtitle={DIVE_CONFIG.hero.subtitle}
        ctaText={DIVE_CONFIG.cta.text}
        demo={
          <div>
            <ChronosDemo controlledState={demoState} onStateChange={setDemoState} />
            <p className="text-xs text-kb-text3 mt-4">点它两下，感受它苏醒</p>
          </div>
        }
      />

      <FeatureMechanics
        title={DIVE_CONFIG.mechanics.title}
        hint={DIVE_CONFIG.mechanics.hint}
        items={DIVE_CONFIG.mechanics.items}
        onSelect={(i) => setDemoState(CHRONOS_STATES[i].key)}
      />

      <FeatureScenes title={DIVE_CONFIG.scenes.title} items={DIVE_CONFIG.scenes.items} />

      <FeatureOutcome title={DIVE_CONFIG.outcome.title} desc={DIVE_CONFIG.outcome.desc}>
        <DiveOutcomeMockup />
      </FeatureOutcome>

      <FeatureScience title={DIVE_CONFIG.science.title} points={DIVE_CONFIG.science.points} />

      <FeatureTrust />

      {/* 底部 CTA */}
      <section className="max-w-3xl mx-auto px-6 text-center">
        <SectionReveal>
          <div className="feather-divider max-w-xs mx-auto mb-14" />
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-kb-text mb-5">
            准备好养一只了吗？
          </h2>
          <p className="text-kb-text2 max-w-md mx-auto mb-10 leading-relaxed">
            免费、开源、本地优先。你的时间生物，只住在你的电脑上。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/download"
              className="inline-block px-10 py-4 rounded-2xl text-white font-medium text-lg transition-all duration-500 hover:scale-[1.05] active:scale-[0.97]"
              style={{
                background: "linear-gradient(135deg, var(--kb-amber), var(--kb-accent-400))",
                boxShadow: "var(--kb-shadow-accent)",
              }}
            >
              {DIVE_CONFIG.cta.text}
            </Link>
            <Link
              href="/features"
              className="px-7 py-3 rounded-2xl font-medium text-kb-text2 transition-all duration-500 hover:text-kb-text hover:scale-[1.02] glass-panel"
            >
              看看全部功能 →
            </Link>
          </div>
        </SectionReveal>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: 构建验证（先跑通再提交）**

Run: `cd website && npm run build`
Expected: 静态导出成功，无 TS 错误

- [ ] **Step 4: 提交**

```bash
git add website/app/features/dive/ website/components/dive/DivePage.tsx
git commit -m "feat(website): add dive feature landing page with playable chronos demo"
```

---

### Task 5: /features 功能总览页

**Files:**
- Create: `website/app/features/page.tsx`（server，导出 metadata）
- Create: `website/components/features/FeaturesPage.tsx`（client，页面主体）

- [ ] **Step 1: 创建 server 页面**

```tsx
// @ai-context
// 功能总览页：SEO metadata + 客户端页面主体。
// Features overview page.
import type { Metadata } from "next";
import { FeaturesPage } from "@/components/features/FeaturesPage";

export const metadata: Metadata = {
  title: "六大认知模块",
  description:
    "深潜番茄钟、结礁笔记、反衰减呼吸闪卡、浮出水面费曼——熵减的完整学习闭环。",
};

export default function Page() {
  return <FeaturesPage />;
}
```

- [ ] **Step 2: 创建 FeaturesPage.tsx**（六大模块卡片墙：深潜可点入，其余建设中指向下载页）

```tsx
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
```

- [ ] **Step 3: 构建验证**

Run: `cd website && npm run build`
Expected: 静态导出成功，无 TS 错误

- [ ] **Step 4: 提交**

```bash
git add website/app/features/page.tsx website/components/features/
git commit -m "feat(website): add features overview page with module cards"
```

---

### Task 6: 导航调整（加「功能」+「品牌故事」改「设计理念」）

**Files:**
- Modify: `website/components/Navbar.tsx:11-16`
- Modify: `website/components/Footer.tsx:38`

- [ ] **Step 1: 更新 Navbar NAV_ITEMS**

将 `website/components/Navbar.tsx` 第 11-16 行：

```tsx
const NAV_ITEMS = [
  { href: "/", label: "首页" },
  { href: "/story", label: "品牌故事" },
  { href: "/download", label: "下载" },
  { href: "/faq", label: "常见问题" },
];
```

替换为：

```tsx
const NAV_ITEMS = [
  { href: "/", label: "首页" },
  { href: "/philosophy", label: "设计理念" },
  { href: "/features", label: "功能" },
  { href: "/download", label: "下载" },
  { href: "/faq", label: "常见问题" },
];
```

- [ ] **Step 2: 更新 Footer 链接**

将 `website/components/Footer.tsx` 第 38 行：

```tsx
<Link href="/story" className="text-kb-text2 hover:text-kb-text transition-colors duration-300">品牌故事</Link>
```

替换为：

```tsx
<Link href="/philosophy" className="text-kb-text2 hover:text-kb-text transition-colors duration-300">设计理念</Link>
<Link href="/features" className="text-kb-text2 hover:text-kb-text transition-colors duration-300">功能</Link>
```

- [ ] **Step 3: 提交**

```bash
git add website/components/Navbar.tsx website/components/Footer.tsx
git commit -m "feat(website): update navbar to design philosophy and features entries"
```

---

### Task 7: /philosophy 设计理念页（原 story 改造）

**Files:**
- Create: `website/app/philosophy/page.tsx`（基于原 story 改造，新增三原则 + 记忆主权，保留四幕品牌故事为出处）
- Delete: `website/app/story/page.tsx`

- [ ] **Step 1: 创建 philosophy/page.tsx**

原 `website/app/story/page.tsx`（311 行）整体迁移，做以下改动：
1. 文件头注释改为设计理念说明
2. 标题区：eyebrow `Brand Story` → `Philosophy`；H1 `熵减 · 品牌故事` → `熵减 · 设计理念`；保留副题
3. 标题区之后插入「设计理念：三原则 + 记忆主权」区块（下方代码）
4. 四幕内容（起源/使命/愿景/人格）与星图、水母动画原样保留，其前置「品牌故事 · 出处」说明区
5. 四幕各幕 eyebrow 文案加前缀 `品牌故事 · `（如 `品牌故事 · 第一幕`）
6. 末尾 CTA 不变

先创建新文件（复制原文件后替换标题区，并插入三原则区块）：

```tsx
// @ai-context
// 设计理念页：三原则（降噪/共情/滋养）+ 记忆主权承诺 + 品牌故事四幕出处。
// Design philosophy: three principles, memory sovereignty, brand story origin.
"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { GlowOrb } from "@/components/GlowOrb";
import { SectionReveal } from "@/components/SectionReveal";

/* ---------- 星图连线动画 (第三幕) ---------- */
/* ---------- 水母光晕 (第四幕) ---------- */
/* —— 以下两个组件的代码与原 story/page.tsx 第 13-103 行完全一致，原样复制 —— */

/* ---------- 页面 ---------- */

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

export default function PhilosophyPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const progressOpacity = useTransform(scrollYProgress, [0, 0.05, 0.95, 1], [0, 1, 1, 0]);

  return (
    <div ref={containerRef} className="pt-36 pb-8">
      {/* 滚动进度条（同原版） */}
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

      {/* ===== 第一幕：起源（原样保留，eyebrow 改为「品牌故事 · 第一幕」） ===== */}
      {/* —— 原 story/page.tsx 第 140-282 行（第一至四幕）原样复制，仅各幕 eyebrow 文案加前缀 —— */}
      {/* ===== 尾声（原样保留） ===== */}
    </div>
  );
}
```

> 注意：`ConstellationMap` 与 `JellyfishGlow` 两个组件从原文件第 13-103 行原样复制；四幕与尾声内容从原文件第 140-308 行原样复制，仅各幕 `<p className="text-xs tracking-[0.3em] text-kb-brand uppercase mb-4">第一幕</p>` 等 eyebrow 改为 `品牌故事 · 第一幕`（第二/三/四幕同理，颜色类名不变）。

- [ ] **Step 2: 删除旧 story 页面**

Delete: `website/app/story/page.tsx`（使用 DeleteFile 工具）

- [ ] **Step 3: 构建验证（检查 /story 旧引用）**

Run: `cd website && grep -rn "href=\"/story\"" app components`
Expected: 无输出（所有 /story 引用已改）

Run: `cd website && npm run build`
Expected: 静态导出成功

- [ ] **Step 4: 提交**

```bash
git add website/app/philosophy/
git add -A website/app/story/
git commit -m "feat(website): convert brand story page to design philosophy page"
```

---

### Task 8: 首页星图卡片接入链接

**Files:**
- Modify: `website/app/page.tsx:35-72, 219-250`

- [ ] **Step 1: FEATURES 数组增加 href 字段**

将 `website/app/page.tsx` 第 35-72 行 `FEATURES` 数组每一项增加 `href` 字段：

```tsx
const FEATURES = [
  {
    name: "深潜",
    origin: "番茄钟",
    desc: "切断海面噪音，潜入零干扰的心流深海。",
    color: "var(--kb-focus-blue)",
    href: "/features/dive",
  },
  {
    name: "结礁",
    origin: "智能笔记",
    desc: "将漂浮的碎片，沉淀为坚实的认知暗礁。",
    color: "var(--kb-brand-400)",
    href: "/features",
  },
  {
    name: "回声定位",
    origin: "课堂助手",
    desc: "捕捉深海回声，打捞暗流中的知识暗物质。",
    color: "var(--kb-cyber-cyan)",
    href: "/features",
  },
  {
    name: "反衰减呼吸",
    origin: "闪卡复习",
    desc: "规律吐纳，让记忆在深海高压下依然鲜活。",
    color: "var(--kb-moss-green)",
    href: "/features",
  },
  {
    name: "浮出水面",
    origin: "费曼学习法",
    desc: "向世界呼出你的理解。雾散了，轮廓就清晰了。",
    color: "var(--kb-amber)",
    href: "/features",
  },
  {
    name: "萤火海沟",
    origin: "灵感空间",
    desc: "安放微光，它们终将照亮整片深域。",
    color: "var(--kb-accent-400)",
    href: "/features",
  },
];
```

- [ ] **Step 2: 卡片包装为 Link**

将第 219-250 行的卡片渲染，把 `motion.div` 最外层替换为 `Link` 包裹（保持动画样式不变）：

```tsx
<SectionReveal key={feat.name} delay={i * 0.08}>
  <Link href={feat.href} className="group relative block rounded-3xl p-7 h-full cursor-pointer">
    {/* —— 原 motion.div 内部内容（发光节点 + 名称 + 标签 + 描述 + 流线）原样保留，
         外层改为 Link，hover 动画由原 motion.div 的 whileHover 迁移为 CSS：
         className 增加 "transition-all duration-500 hover:-translate-y-[5px]" —— */}
  </Link>
</SectionReveal>
```

具体改动：原代码 `motion.div` 的 `whileHover={{ y: -5, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}` 与 `className="group relative rounded-3xl p-7 h-full cursor-default"` 与 style（背景/边框/阴影）整体替换为：

```tsx
<Link
  href={feat.href}
  className="group relative block rounded-3xl p-7 h-full cursor-pointer transition-all duration-500 hover:-translate-y-[5px]"
  style={{
    background: "var(--kb-bg-elevated)",
    border: "1px solid var(--kb-glass-border)",
    boxShadow: "var(--kb-shadow-card)",
  }}
>
```

并在文件顶部 import 确认已有 `Link`（第 3 行已 import `Link from "next/link"`，无需新增）。

- [ ] **Step 3: 构建验证**

Run: `cd website && npm run build`
Expected: 静态导出成功，无 TS 错误

- [ ] **Step 4: 提交**

```bash
git add website/app/page.tsx
git commit -m "feat(website): link homepage feature cards to feature pages"
```

---

### Task 9: 下载页首屏 CTA 修复（重排布局 + 滚动提示）

**Files:**
- Modify: `website/app/download/page.tsx`
- Modify: `website/app/globals.css`

- [ ] **Step 1: globals.css 新增滚动提示动画**

在 `website/app/globals.css` 末尾追加：

```css
/* 下载页滚动提示（向下滚动指示） */
@keyframes scroll-hint-dot {
  0% { transform: translateY(0); opacity: 1; }
  70% { transform: translateY(10px); opacity: 0; }
  100% { transform: translateY(0); opacity: 0; }
}
.scroll-hint-dot {
  animation: scroll-hint-dot 1.8s ease-in-out infinite;
}
```

- [ ] **Step 2: 下载页重排 — CTA 上移首屏**

在 `website/app/download/page.tsx`：
1. 新增 `ScrollHint` 私有组件（放在 AppMockup 组件之后）：

```tsx
/** 首屏滚动提示：暗示页面内容延续，避免用户误以为页面到此为止 */
function ScrollHint() {
  return (
    <div
      className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-kb-text3 pointer-events-none"
      aria-hidden
    >
      <span className="text-[10px] tracking-[0.3em] uppercase">向下滚动</span>
      <span
        className="w-[18px] h-[30px] rounded-full border flex justify-center pt-1.5"
        style={{ borderColor: "var(--kb-border-strong)" }}
      >
        <span className="w-1 h-1.5 rounded-full scroll-hint-dot" style={{ background: "var(--kb-text3)" }} />
      </span>
    </div>
  );
}
```

2. 标题区 `<header className="text-center px-6 mb-16 relative">` 中插入 `<ScrollHint />`（放在 SectionReveal 之后），并将 `mb-16` 改为 `mb-20`：

```tsx
<header className="text-center px-6 mb-20 relative">
  <GlowOrb count={10} className="opacity-40" />
  <SectionReveal>
    <p className="text-sm tracking-[0.35em] text-kb-text3 uppercase mb-5">Download</p>
    <h1 className="font-serif text-4xl sm:text-5xl font-bold text-kb-text mb-5">
      开始你的深潜之旅
    </h1>
    <p className="text-kb-text2 max-w-md mx-auto leading-relaxed">
      免费、开源、本地优先。你的数据只属于你自己。
    </p>
  </SectionReveal>
  <ScrollHint />
</header>
```

3. 交换两个 section 的顺序：把「下载区」section（含 `<DownloadCta />`）整体移到「应用截图 Mockup」section 之前。调整后结构为：

```tsx
{/* 下载区（首屏可见） */}
<section className="max-w-3xl mx-auto px-6 mb-16">
  <SectionReveal>
    <DownloadCta />
  </SectionReveal>
</section>

{/* 应用截图 Mockup */}
<section className="max-w-4xl mx-auto px-6 mb-20">
  <SectionReveal>
    <AppMockup />
    <p className="text-center text-xs text-kb-text3 mt-5">
      * 界面预览为风格化示意，实际界面以应用为准
    </p>
  </SectionReveal>
</section>
```

（原「下载区」的 `mb-24` 改为 `mb-16`；Mockup section 顺序后移，其余 section 不变。）

- [ ] **Step 3: 构建验证**

Run: `cd website && npm run build`
Expected: 静态导出成功

- [ ] **Step 4: 提交**

```bash
git add website/app/download/page.tsx website/app/globals.css
git commit -m "fix(website): move download CTA to first screen and add scroll hint"
```

---

### Task 10: 最终验证

**Files:** 无

- [ ] **Step 1: 全量构建 + Lint**

Run: `cd website && npm run build && npm run lint`
Expected: 构建成功、lint 无 error（warning 可接受）

- [ ] **Step 2: 逐页链接检查**

Run: `cd website && grep -rn "href=\"/story\"" app components`
Expected: 无输出（旧 /story 引用已全部迁移）

Run: `cd website && grep -rn "品牌故事" components/Navbar.tsx components/Footer.tsx app/page.tsx`
Expected: 仅 philosophy 页内保留（品牌故事作为出处）

- [ ] **Step 3: 本地预览人工检查**

Run: `cd website && npm run start`（或静态托管 out/ 目录），逐项检查：
- 导航 5 项：首页 / 设计理念 / 功能 / 下载 / 常见问题，活动指示器动画正常
- /features/dive：Chronos 演示可点（沉睡→呼吸→专注），六态卡片点击联动，reduced-motion 降级为静态球
- /features：六大卡片，深潜可点入
- /philosophy：三原则 + 记忆主权 + 四幕出处
- /download：首屏直接可见下载按钮 + 滚动提示
- 首页星图卡片可点击跳转

- [ ] **Step 4: 完成确认**

所有检查通过后，在对话中汇报交付清单与验证结果。
