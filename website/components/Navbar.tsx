// @ai-context
// 毛玻璃导航栏：桌面/移动双布局 + layoutId 指示器动画。Glass navbar with active indicator.
// Why: 活动指示器用 framer layoutId 实现跨路由平滑过渡，而非各自独立动画。
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/", label: "首页" },
  { href: "/story", label: "品牌故事" },
  { href: "/download", label: "下载" },
];

/**
 * 毛玻璃导航栏 — 空气感玻璃拟态
 */
export function Navbar() {
  const pathname = usePathname();

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      <nav className="glass-panel mx-auto mt-4 max-w-5xl rounded-2xl px-6 py-3 flex items-center justify-between shadow-kb-card">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <span
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold text-white transition-shadow duration-500 group-hover:shadow-kb-brand"
            style={{ background: "linear-gradient(135deg, var(--kb-brand-400), var(--kb-accent-500))" }}
          >
            熵
          </span>
          <span className="font-serif text-lg font-semibold text-kb-text tracking-wide">
            熵减<span className="text-kb-text3 text-sm ml-1.5 font-sans">Entropydecrease</span>
          </span>
        </Link>

        {/* 导航链接 */}
        <div className="hidden sm:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-4 py-2 rounded-xl text-sm transition-colors duration-400 ${
                  active ? "text-kb-text font-medium" : "text-kb-text2 hover:text-kb-text"
                }`}
              >
                {item.label}
                {active && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute inset-0 rounded-xl -z-10"
                    style={{
                      background: "var(--kb-bg-tertiary)",
                      boxShadow: "var(--kb-shadow-card)",
                    }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* 右侧：主题切换 + CTA */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/download"
            className="hidden md:inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium text-white transition-all duration-500 hover:scale-[1.03] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, var(--kb-brand-400), var(--kb-brand-600))",
              boxShadow: "var(--kb-shadow-brand)",
            }}
          >
            免费下载
          </Link>
        </div>
      </nav>

      {/* 移动端导航 */}
      <div className="sm:hidden glass-panel mx-auto mt-2 max-w-5xl rounded-xl px-4 py-2 flex justify-center gap-2 shadow-kb-card">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-1.5 rounded-lg text-sm transition-colors duration-300 ${
                active
                  ? "font-medium text-kb-text"
                  : "text-kb-text2"
              }`}
              style={active ? { background: "var(--kb-bg-tertiary)" } : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </motion.header>
  );
}
