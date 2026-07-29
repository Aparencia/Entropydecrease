// @ai-context
// 下载页：应用窗口 Mockup、下载入口、版本轨迹与开源信息。Download page: app mockup, download CTA, changelog.
// Why: Mockup 为纯 CSS 风格化示意而非截图，避免版本迭代后截图过期。
"use client";

import { motion } from "framer-motion";
import { GlowOrb } from "@/components/GlowOrb";
import { SectionReveal } from "@/components/SectionReveal";

/* ---------- 数据 ---------- */

const CHANGELOG = [
  {
    version: "v0.15.0",
    tag: "正式版",
    date: "2026-07",
    highlights: [
      "核心功能矩阵全面交付",
      "身份体系与用户账户完善",
      "自定义标题栏（无框窗口）",
      "笔记导入/导出（Markdown/HTML/PDF）",
      "自适应番茄钟与学习仪表盘增强",
    ],
  },
  {
    version: "v0.9.0",
    tag: "稳定版",
    date: "2026-06",
    highlights: [
      "性能优化与体验精打磨",
      "笔记全文搜索 + 标签系统",
      "高自信错误追踪（黄金错误）",
      "生成式复习模式",
    ],
  },
  {
    version: "v0.8.0",
    tag: "安全版",
    date: "2026-05",
    highlights: [
      "安全加固与课堂助手链路修复",
      "22 个品牌音效集成",
      "关闭窗口行为确认",
      "AI 网关稳定性优化",
    ],
  },
];

const SYSTEM_REQ = [
  { label: "操作系统", value: "Windows 10 / 11 (64位)" },
  { label: "处理器", value: "Intel i5 / AMD Ryzen 5 或更高" },
  { label: "内存", value: "8 GB RAM 以上" },
  { label: "存储空间", value: "500 MB 可用空间" },
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

/* ---------- 页面 ---------- */

export default function DownloadPage() {
  return (
    <div className="pt-36 pb-8">
      {/* 标题区 */}
      <header className="text-center px-6 mb-16 relative">
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
      </header>

      {/* 应用截图 Mockup */}
      <section className="max-w-4xl mx-auto px-6 mb-20">
        <SectionReveal>
          <AppMockup />
          <p className="text-center text-xs text-kb-text3 mt-5">
            * 界面预览为风格化示意，实际界面以应用为准
          </p>
        </SectionReveal>
      </section>

      {/* 下载区 */}
      <section className="max-w-3xl mx-auto px-6 mb-24">
        <SectionReveal>
          <div
            className="rounded-3xl p-10 text-center"
            style={{
              background: "var(--kb-bg-elevated)",
              border: "1px solid var(--kb-glass-border)",
              boxShadow: "var(--kb-shadow-brand)",
            }}
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <span
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold text-white"
                style={{ background: "linear-gradient(135deg, var(--kb-brand-400), var(--kb-accent-500))" }}
              >
                熵
              </span>
              <div className="text-left">
                <h2 className="font-serif text-xl font-bold text-kb-text">熵减 Entropydecrease</h2>
                <p className="text-xs text-kb-text3">v0.15.0 正式版 · 2026-07</p>
              </div>
            </div>

            <a
              href="https://github.com/Aparencia/Entropydecrease/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-12 py-4 rounded-2xl text-white font-medium text-lg transition-all duration-500 hover:scale-[1.04] active:scale-[0.97] mb-6"
              style={{
                background: "linear-gradient(135deg, var(--kb-amber), var(--kb-accent-400))",
                boxShadow: "var(--kb-shadow-accent)",
              }}
            >
              ⬇ 下载 Windows 版
            </a>

            <p className="text-xs text-kb-text3 mb-8">
              约 120 MB · 适用于 Windows 10/11 (64位) · 免费开源
            </p>

            {/* 系统要求 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-left">
              {SYSTEM_REQ.map((req) => (
                <div key={req.label} className="rounded-xl p-3.5" style={{ background: "var(--kb-bg-tertiary)" }}>
                  <p className="text-[10px] text-kb-text3 uppercase tracking-wider mb-1">{req.label}</p>
                  <p className="text-xs text-kb-text2 leading-snug">{req.value}</p>
                </div>
              ))}
            </div>
          </div>
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
          {CHANGELOG.map((release, i) => (
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
