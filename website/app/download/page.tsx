// @ai-context
// 下载页：应用窗口 Mockup、下载入口（DownloadCta 服务器直链 + GitHub 备用）、版本轨迹与开源信息。
// Download page: app mockup, download CTA (server-hosted with GitHub fallback), changelog.
// Why: Mockup 为纯 CSS 风格化示意而非截图，避免版本迭代后截图过期。
// 版本轨迹数据从 public/versions.json 动态加载，发版后仅需更新该 JSON 文件，无需修改页面代码。
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { DownloadCta } from "@/components/DownloadCta";
import { GlowOrb } from "@/components/GlowOrb";
import { SectionReveal } from "@/components/SectionReveal";

/* ---------- 版本轨迹数据结构 ---------- */

/** 单个版本条目，与 public/versions.json 中的 changelog 数组结构对应 */
interface ChangelogEntry {
  version: string;
  tag: string;
  date: string;
  highlights: string[];
}

/**
 * 兜底版本数据（versions.json 不可达时展示）。
 * 保持与 JSON 文件同步，确保页面始终有内容可渲染。
 */
const FALLBACK_CHANGELOG: ChangelogEntry[] = [
  {
    version: "v0.15.0",
    tag: "正式版",
    date: "2026-07",
    highlights: [
      "核心功能矩阵全面交付",
      "身份体系与用户账户完善",
      "自适应番茄钟与学习仪表盘增强",
    ],
  },
];

/* ---------- 应用窗口 Mockup ---------- */

function AppMockup() {
  return (
    <div
      className="relative rounded-2xl overflow-hidden border shadow-2xl mx-auto max-w-2xl"
      style={{ borderColor: "var(--kb-border-default)", background: "var(--kb-bg-secondary)" }}
    >
      {/* 标题栏 */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ background: "var(--kb-bg-tertiary)", borderBottom: "1px solid var(--kb-border-default)" }}
      >
        <span className="w-3 h-3 rounded-full" style={{ background: "#F87171" }} />
        <span className="w-3 h-3 rounded-full" style={{ background: "#FBBF24" }} />
        <span className="w-3 h-3 rounded-full" style={{ background: "#4ADE80" }} />
        <span className="ml-3 text-xs text-kb-text3">熵减 — 深潜中</span>
      </div>

      {/* 模拟界面内容 */}
      <div className="p-6 sm:p-8">
        <div className="flex gap-6">
          {/* 侧边导航模拟 */}
          <div className="hidden sm:flex flex-col gap-3 w-12">
            {["var(--kb-brand-400)", "var(--kb-cyber-cyan)", "var(--kb-moss-green)", "var(--kb-amber)"].map((c, i) => (
              <span
                key={i}
                className="w-9 h-9 rounded-xl mx-auto"
                style={{ background: i === 0 ? c : "var(--kb-bg-tertiary)", opacity: i === 0 ? 1 : 0.7 }}
              />
            ))}
          </div>

          {/* 主内容区模拟 */}
          <div className="flex-1 space-y-4">
            {/* 番茄钟圆环 */}
            <div className="flex items-center justify-center py-4">
              <div className="relative w-32 h-32">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="var(--kb-bg-tertiary)" strokeWidth="6" />
                  <motion.circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke="var(--kb-accent-500)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray="264"
                    initial={{ strokeDashoffset: 264 }}
                    whileInView={{ strokeDashoffset: 80 }}
                    viewport={{ once: true }}
                    transition={{ duration: 2, ease: [0.22, 1, 0.36, 1] }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-kb-text">18:24</span>
                  <span className="text-[10px] text-kb-text3 mt-0.5">深潜模式</span>
                </div>
              </div>
            </div>

            {/* 模拟文本行 */}
            <div className="space-y-2.5">
              {[100, 85, 92, 60].map((w, i) => (
                <div
                  key={i}
                  className="h-2.5 rounded-full"
                  style={{ width: `${w}%`, background: "var(--kb-bg-tertiary)", opacity: 1 - i * 0.15 }}
                />
              ))}
            </div>

            {/* 模拟卡片行 */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              {[
                { color: "var(--kb-moss-green)", label: "结礁 12" },
                { color: "var(--kb-amber)", label: "微光 8" },
                { color: "var(--kb-cyber-cyan)", label: "呼吸 45" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl p-3 text-center"
                  style={{ background: "var(--kb-bg-tertiary)" }}
                >
                  <span className="block w-2 h-2 rounded-full mx-auto mb-2" style={{ background: item.color }} />
                  <span className="text-[10px] text-kb-text2">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 光晕装饰 */}
      <div
        className="absolute -top-20 -right-20 w-48 h-48 rounded-full pointer-events-none animate-breathe"
        style={{ background: "radial-gradient(circle, var(--kb-glow-2), transparent 70%)", filter: "blur(20px)" }}
      />
    </div>
  );
}

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

/* ---------- 页面 ---------- */

export default function DownloadPage() {
  // 从 public/versions.json 动态加载版本轨迹数据
  // 兼容 Next.js 静态导出（output: "export"）——运行时客户端 fetch，不依赖服务端渲染
  const [changelog, setChangelog] = useState<ChangelogEntry[]>(FALLBACK_CHANGELOG);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/versions.json", { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { changelog?: ChangelogEntry[] }) => {
        // 仅当返回有效数据时替换兜底，否则保持 FALLBACK_CHANGELOG
        if (data?.changelog && Array.isArray(data.changelog) && data.changelog.length > 0) {
          setChangelog(data.changelog);
        }
      })
      .catch(() => {
        /* versions.json 不可达时静默回退兜底数据，不影响页面渲染 */
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="pt-36 pb-8">
      {/* 标题区 */}
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

      {/* 下载区（服务器直链 + 动态版本 + GitHub 备用源） */}
      <section className="max-w-3xl mx-auto px-6 mb-16">
        <SectionReveal>
          <DownloadCta />
        </SectionReveal>
      </section>

      {/* 移动端 PWA：手机浏览器打开 /pwa/ 添加到主屏幕，即开即用 */}
      <section className="max-w-3xl mx-auto px-6 mb-16">
        <SectionReveal>
          <div
            className="rounded-2xl p-8 text-center transition-shadow duration-500 hover:shadow-kb-card"
            style={{ background: "var(--kb-bg-elevated)", border: "1px solid var(--kb-glass-border)" }}
          >
            <p className="text-sm tracking-[0.3em] text-kb-text3 uppercase mb-3">Mobile</p>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-kb-text mb-3">移动端 · 即开即用</h2>
            <p className="text-kb-text2 text-sm max-w-md mx-auto mb-6 leading-relaxed">
              用手机浏览器打开移动端版，即可添加到主屏幕，像 App 一样使用番茄钟、笔记与课堂助手。
              支持 iOS Safari 与 Android Chrome。
            </p>
            <a
              href="https://entropydecrease.com/pwa/"
              className="inline-block px-10 py-3.5 rounded-2xl text-white font-medium transition-all duration-500 hover:scale-[1.04] active:scale-[0.97]"
              style={{
                background: "linear-gradient(135deg, var(--kb-cyber-cyan), var(--kb-accent-400))",
                boxShadow: "var(--kb-shadow-accent)",
              }}
            >
              打开移动端版 ↗
            </a>
            <p className="text-xs text-kb-text3 mt-5 leading-relaxed">
              iOS：Safari 打开 → 分享 → 添加到主屏幕　|　Android：Chrome 菜单 → 添加到主屏幕
            </p>
          </div>
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

      {/* 更新日志 */}
      <section className="max-w-3xl mx-auto px-6 mb-24">
        <SectionReveal className="mb-10">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-kb-text text-center mb-3">
            版本轨迹
          </h2>
          <p className="text-center text-kb-text2 text-sm">
            每一次迭代，都是向深海更深处的一次下潜
          </p>
        </SectionReveal>

        <div className="space-y-5">
          {changelog.map((release, i) => (
            <SectionReveal key={release.version} delay={i * 0.1}>
              <div
                className="rounded-2xl p-7 transition-shadow duration-500 hover:shadow-kb-card"
                style={{
                  background: "var(--kb-bg-elevated)",
                  border: "1px solid var(--kb-glass-border)",
                }}
              >
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="font-mono text-sm font-bold" style={{ color: "var(--kb-brand-400)" }}>
                    {release.version}
                  </span>
                  <span
                    className="text-[10px] px-2.5 py-1 rounded-lg font-medium"
                    style={{ background: "var(--kb-bg-tertiary)", color: "var(--kb-moss-green)" }}
                  >
                    {release.tag}
                  </span>
                  <span className="text-xs text-kb-text3 ml-auto">{release.date}</span>
                </div>
                <ul className="grid sm:grid-cols-2 gap-2">
                  {release.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-kb-text2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--kb-accent-500)" }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </SectionReveal>
          ))}
        </div>
      </section>

      {/* 开源信息 */}
      <section className="max-w-3xl mx-auto px-6 text-center">
        <SectionReveal>
          <div className="feather-divider mb-14" />
          <h2 className="font-serif text-2xl font-bold text-kb-text mb-4">
            开源共建
          </h2>
          <p className="text-kb-text2 text-sm max-w-md mx-auto mb-8 leading-relaxed">
            熵减是一个开源项目。我们相信透明与协作能让这片认知深海更加丰饶。
            欢迎提交 Issue 与 Pull Request。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/Aparencia/Entropydecrease"
              target="_blank"
              rel="noopener noreferrer"
              className="px-7 py-3 rounded-2xl font-medium text-kb-text transition-all duration-500 hover:scale-[1.03] glass-panel"
            >
              GitHub 仓库 ↗
            </a>
            <a
              href="https://github.com/Aparencia/Entropydecrease/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="px-7 py-3 rounded-2xl font-medium text-kb-text2 transition-all duration-500 hover:text-kb-text hover:scale-[1.02]"
            >
              查看完整更新日志 →
            </a>
          </div>
        </SectionReveal>
      </section>
    </div>
  );
}
