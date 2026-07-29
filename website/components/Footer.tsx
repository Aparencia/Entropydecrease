// @ai-context
// 页脚：品牌语料、导航/开源链接与 ICP/公安备案信息。Footer: brand copy, links, ICP filing.
// Why: 备案号受域名法律绑定，品牌重命名时豁免改动。
import Link from "next/link";

/**
 * 页脚 — 克制、留白、品牌语料收尾
 */
export function Footer() {
  return (
    <footer className="relative mt-32 pb-12">
      <div className="feather-divider max-w-4xl mx-auto mb-12" />
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* 品牌 */}
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2.5 mb-3">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg, var(--kb-brand-400), var(--kb-accent-500))" }}
              >
                熵
              </span>
              <span className="font-serif font-semibold text-kb-text">熵减 · Entropydecrease</span>
            </div>
            <p className="text-sm text-kb-text3 max-w-xs leading-relaxed">
              万物终将冷却，但你可以选择向内心注入光。
              <br />
              在无序的宇宙中，你不是一个人。
            </p>
          </div>

          {/* 链接 */}
          <div className="flex gap-12 text-sm">
            <div className="flex flex-col gap-2.5">
              <span className="text-kb-text3 text-xs uppercase tracking-widest mb-1">导航</span>
              <Link href="/" className="text-kb-text2 hover:text-kb-text transition-colors duration-300">首页</Link>
              <Link href="/story" className="text-kb-text2 hover:text-kb-text transition-colors duration-300">品牌故事</Link>
              <Link href="/download" className="text-kb-text2 hover:text-kb-text transition-colors duration-300">下载</Link>
              <Link href="/support" className="text-kb-text2 hover:text-kb-text transition-colors duration-300">支持我们</Link>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-kb-text3 text-xs uppercase tracking-widest mb-1">开源</span>
              <a
                href="https://github.com/Aparencia/Entropydecrease"
                target="_blank"
                rel="noopener noreferrer"
                className="text-kb-text2 hover:text-kb-text transition-colors duration-300"
              >
                GitHub
              </a>
              <a
                href="https://github.com/Aparencia/Entropydecrease/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="text-kb-text2 hover:text-kb-text transition-colors duration-300"
              >
                更新日志
              </a>
            </div>
          </div>
        </div>

        {/* 底栏 */}
        <div className="mt-12 pt-6 flex flex-col items-center gap-3 text-xs text-kb-text3"
          style={{ borderTop: "1px solid var(--kb-border-default)" }}
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
            <span>© 2026 熵减 Entropydecrease — 在无序的时光里，陪你慢慢生长</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full animate-cyber-pulse" style={{ background: "var(--kb-cyber-cyan)" }} />
              以负熵为食的生命体
            </span>
          </div>
          {/* 备案信息 */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noreferrer"
              className="text-kb-text3 hover:text-kb-text2 transition-colors duration-300"
            >
              闽ICP备2025100891号-1
            </a>
            <a
              href="https://beian.mps.gov.cn/#/query/webSearch?code=35052102000672"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-kb-text3 hover:text-kb-text2 transition-colors duration-300"
            >
              <img src="/beian.png" alt="" className="w-3.5 h-3.5" />
              闽公网安备35052102000672号
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
