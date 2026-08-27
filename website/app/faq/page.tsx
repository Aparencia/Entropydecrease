// @ai-context
// FAQ 帮助中心：手风琴折叠面板展示常见问题。FAQ/Help Center with accordion panels.
// Why: 用户自助查询入口，减少重复性支持请求；按使用场景分类，降低信息查找成本。
"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { GlowOrb } from "@/components/GlowOrb";
import { SectionReveal } from "@/components/SectionReveal";

// ─────────────────────────────────────────────────────────
// FAQ 数据结构
// 按用户使用旅程分阶段组织：认识产品 → 学习功能 → AI 能力 → 数据安全 → 故障排除
// ─────────────────────────────────────────────────────────

interface FaqItem {
  q: string;
  a: string;
}

interface FaqCategory {
  /** 分类标题 */
  title: string;
  /** 分类标签 — 用于顶部徽章 */
  tag: string;
  /** 该分类下的所有问答 */
  items: FaqItem[];
}

/**
 * FAQ 全部分类数据
 * 设计理由：覆盖用户从「初次了解」到「深度使用」全生命周期的疑问
 */
const FAQ_CATEGORIES: FaqCategory[] = [
  {
    title: "基础使用",
    tag: "Getting Started",
    items: [
      {
        q: "什么是熵减？",
        a: "熵减是一款面向技能自学者的 AI 学习桌面应用，践行本地优先与间隔重复理念。它整合了课堂助手（屏幕/音频捕获→本地转写）、智能笔记、知识体系、闪卡复习与番茄钟等核心学习工具，帮你在无序的时光里建立有序的学习习惯。",
      },
      {
        q: "如何安装熵减？",
        a: "前往官网下载页（entropydecrease.com/download），点击「下载 Windows 版」获取 .exe 安装包，双击运行即可完成安装。安装包自带安装向导，全程无需手动配置。",
      },
      {
        q: "支持哪些平台？",
        a: "当前支持 Windows 10 / 11（64 位）。macOS 与 Linux 版本正在规划中——桌面端优先覆盖，因为深度学习场景更适合在大屏幕上完成。",
      },
    ],
  },
  {
    title: "学习功能",
    tag: "Learning Features",
    items: [
      {
        q: "费曼学习法怎么用？",
        a: "在笔记中选择任意知识点，点击「费曼模式」即可开始。系统会引导你用简单语言向 AI 讲解概念，AI 会像学生一样提问和质疑，帮你发现理解盲区。",
      },
      {
        q: "闪卡复习是什么？",
        a: "闪卡基于间隔重复算法（Spaced Repetition），在你即将遗忘时自动安排复习。你可以手动创建闪卡，也可以让 AI 从笔记中自动生成。每张闪卡会根据你的掌握程度动态调整复习间隔。",
      },
      {
        q: "番茄钟怎么设置？",
        a: "点击侧栏的番茄钟图标即可开始默认的 25 分钟专注。你可以在设置中自定义专注时长、短休息和长休息时间，还可以为不同科目配置独立的番茄钟方案。",
      },
    ],
  },
  {
    title: "AI 功能",
    tag: "AI Capabilities",
    items: [
      {
        q: "AI 需要联网吗？",
        a: "AI 是熵减的可选增强层：使用云端 AI 功能需要联网，且必须由你显式授权（默认关闭）。未授权或断网时，核心学习功能与本地规则拼接完全可用——本地优先是架构属性，你的学习数据不出本机。",
      },
      {
        q: "支持离线使用吗？",
        a: "完全支持。熵减的核心学习功能（课堂助手、笔记、知识体系、闪卡、番茄钟）全部在本地运行，无需网络。AI 增强（如笔记精修）离线时自动降级为本地拼接路径，不阻断学习流程。",
      },
      {
        q: "AI 数据安全吗？",
        a: "熵减遵循本地优先原则：你的笔记和学习数据全部存储在本地设备上。使用云端 AI 时，仅将当前对话内容发送至 AI 服务，不会上传你的完整数据库。",
      },
    ],
  },
  {
    title: "数据与隐私",
    tag: "Data & Privacy",
    items: [
      {
        q: "数据存储在哪里？",
        a: "所有数据默认存储在你的本地设备中，使用 SQLite 数据库管理。数据完全由你掌控，不会自动上传到任何服务器。",
      },
      {
        q: "如何导出数据？",
        a: "在笔记与设置页面中可以将笔记导出为 Markdown、数据导出为 JSON 格式，支持全量导出，方便备份与迁移。",
      },
      {
        q: "会上传到云端吗？",
        a: "不会自动上传。只有你显式授权使用云端 AI 增强时，当前对话所需的最小内容才会发送至 AI 服务；其余学习数据（笔记、卡片、会话记录）始终留在本机。",
      },
    ],
  },
  {
    title: "常见问题",
    tag: "Troubleshooting",
    items: [
      {
        q: "软件卡了怎么办？",
        a: "首先尝试重启应用。如果问题持续，可以在设置中清除缓存数据。若仍然无法解决，请到 GitHub Issues 提交问题报告，附上你的系统版本和错误日志。",
      },
      {
        q: "如何反馈问题？",
        a: "推荐在 GitHub Issues 提交问题报告（附日志更佳），你也可以加入我们的社区群组直接反馈。每一条反馈我们都会认真查看并纳入迭代计划。",
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────
// 手风琴子组件
// ─────────────────────────────────────────────────────────

/**
 * 单个折叠面板 — 点击展开/收起，同一分类内互斥（同时只展开一个）
 */
function AccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: FaqItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="border-b last:border-b-0 transition-colors duration-300"
      style={{ borderColor: "var(--kb-border-default)" }}
    >
      {/* 问题行 — 点击切换展开状态 */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 py-5 px-1 text-left group"
      >
        <span className="text-kb-text font-medium text-[0.95rem] leading-snug group-hover:text-kb-text transition-colors duration-300">
          {item.q}
        </span>
        {/* 展开/收起图标 — 旋转动画 */}
        <motion.span
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="shrink-0 w-5 h-5 flex items-center justify-center text-kb-text3 text-lg"
        >
          +
        </motion.span>
      </button>

      {/* 回答区域 — 高度动画 */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="pb-5 px-1 text-kb-text2 text-sm leading-relaxed">
              {item.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 主页面
// ─────────────────────────────────────────────────────────

/**
 * FAQ 帮助中心页面
 * 按使用场景分类展示常见问题，手风琴折叠交互
 */
export default function FaqPage() {
  // 当前每个分类中展开的条目索引（-1 表示全部收起）
  const [openIndexes, setOpenIndexes] = useState<Record<number, number>>({});

  /**
   * 切换某个分类下某条 FAQ 的展开状态
   * 同一分类内同时只展开一条（互斥逻辑）
   */
  const handleToggle = (catIndex: number, itemIndex: number) => {
    setOpenIndexes((prev) => ({
      ...prev,
      [catIndex]: prev[catIndex] === itemIndex ? -1 : itemIndex,
    }));
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      <GlowOrb count={14} seed={42} />

      <div className="relative max-w-3xl mx-auto px-6 pt-36 pb-24">
        {/* ── 页面标题 ── */}
        <motion.div
          className="text-center mb-16"
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
            FAQ · 帮助中心
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-kb-text mb-4">
            常见问题
          </h1>
          <p className="text-kb-text2 leading-relaxed max-w-md mx-auto">
            在这里找到你想知道的答案。
            <br />
            如果没有找到，欢迎到 GitHub Issues 提问。
          </p>
        </motion.div>

        {/* ── 分类列表 ── */}
        <div className="flex flex-col gap-10">
          {FAQ_CATEGORIES.map((cat, catIndex) => (
            <SectionReveal key={cat.title}>
              <section>
                {/* 分类标题 */}
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="text-[0.7rem] tracking-widest uppercase px-2.5 py-0.5 rounded-full"
                    style={{
                      color: "var(--kb-text3)",
                      border: "1px solid var(--kb-border-default)",
                      background: "var(--kb-bg-secondary)",
                    }}
                  >
                    {cat.tag}
                  </span>
                  <h2 className="text-kb-text font-medium text-base">
                    {cat.title}
                  </h2>
                </div>

                {/* 折叠面板容器 */}
                <div
                  className="rounded-2xl border px-5"
                  style={{
                    borderColor: "var(--kb-border-default)",
                    background: "var(--kb-bg-secondary)",
                  }}
                >
                  {cat.items.map((item, itemIndex) => (
                    <AccordionItem
                      key={item.q}
                      item={item}
                      isOpen={openIndexes[catIndex] === itemIndex}
                      onToggle={() => handleToggle(catIndex, itemIndex)}
                    />
                  ))}
                </div>
              </section>
            </SectionReveal>
          ))}
        </div>

        {/* ── 底部引导 — 找不到答案时的出路 ── */}
        <SectionReveal>
          <div className="mt-16 text-center">
            <p className="text-sm text-kb-text3 mb-4">没找到你的问题？</p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
              <a
                href="https://github.com/Aparencia/Entropydecrease/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-full text-kb-text2 hover:text-kb-text transition-colors duration-300"
                style={{ border: "1px solid var(--kb-border-default)" }}
              >
                💬 在 GitHub 提问
              </a>
              <Link
                href="/support"
                className="px-4 py-2 rounded-full text-kb-text2 hover:text-kb-text transition-colors duration-300"
                style={{ border: "1px solid var(--kb-border-default)" }}
              >
                ❤️ 支持我们
              </Link>
            </div>
          </div>
        </SectionReveal>
      </div>
    </main>
  );
}

