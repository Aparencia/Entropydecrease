// @ai-context
// 邮箱验证结果页：Supabase 注册确认邮件的跳转落地页。Email verification landing page.
// Why: 桌面客户端无法接收浏览器跳转，验证完成后需一个网页告知用户"回到客户端登录"；
// Supabase 验证失败时会在 URL hash 携带 error 参数，此页同时兜底展示过期/无效提示。
"use client";

import { useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { GlowOrb } from "@/components/GlowOrb";

/** 订阅 hash 变化（验证结果仅体现在 hash 中） */
function subscribeHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** 客户端快照：验证失败时 Supabase 跳转形如 /verified#error=access_denied&error_code=otp_expired */
function getHashHasError(): boolean {
  return window.location.hash.includes("error");
}

/** 预渲染快照：静态导出时无 window，先按成功态渲染，hydration 后自动校正 */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * 邮箱验证结果页
 * 成功：引导用户回到熵减客户端登录；
 * 失败（hash 含 error，如 otp_expired）：引导重新注册以重发验证邮件
 *
 * @ai-context: hash 属于外部可变数据源，用 useSyncExternalStore 而非
 * useEffect+setState——后者会触发 react-hooks/set-state-in-effect 且在
 * 静态导出下产生 hydration 不匹配。
 */
export default function VerifiedPage() {
  const isExpired = useSyncExternalStore(subscribeHash, getHashHasError, getServerSnapshot);
  const isSuccess = !isExpired;

  return (
    <main className="relative min-h-screen overflow-hidden">
      <GlowOrb count={10} seed={11} />

      <div className="relative max-w-xl mx-auto px-6 pt-40 pb-24">
        <motion.div
          className="text-center"
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
            Email Verification · 邮箱验证
          </span>

          <div
            className="relative rounded-2xl border p-8 sm:p-10 max-w-sm mx-auto text-center"
            style={{
              borderColor: "var(--kb-border-default)",
              background: "var(--kb-bg-secondary)",
            }}
          >
            <div className="text-5xl mb-5" aria-hidden="true">
              {isSuccess ? "✅" : "⏳"}
            </div>
            <h1 className="font-serif text-2xl font-semibold text-kb-text mb-3">
              {isSuccess ? "邮箱验证成功" : "验证链接已失效"}
            </h1>
            <p className="text-sm text-kb-text2 leading-relaxed">
              {isSuccess ? (
                <>
                  你的账号已激活。
                  <br />
                  请回到<span className="font-medium text-kb-text">熵减客户端</span>
                  ，使用注册邮箱登录即可开始使用。
                </>
              ) : (
                <>
                  链接可能已过期或已被使用。
                  <br />
                  若尚未完成验证，请回到熵减客户端重新注册，
                  <br />
                  系统会重新发送验证邮件。
                </>
              )}
            </p>
            <p className="text-xs text-kb-text3 mt-6">此页面可以安全关闭</p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
