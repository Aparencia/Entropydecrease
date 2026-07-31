// @ai-context
// 下载 CTA 卡片：从自建服务器 latest.json 动态获取版本信息与安装包直链（国内主源），
// 拉取失败时静默回退 GitHub Releases。Download CTA: server-hosted direct link with GitHub fallback.
// Why: 国内访问 GitHub Release 不稳定，服务器直链提升首下载转化；版本信息动态化消灭硬编码。
"use client";

import { useEffect, useState } from "react";

/** 自建服务器下载源（release.yml CI 发版时同步安装包与 latest.json） */
const DOWNLOAD_BASE = "https://entropydecrease.com/downloads";
/** GitHub Releases 备用源 */
const GITHUB_RELEASES = "https://github.com/Aparencia/Entropydecrease/releases/latest";

/** 兜底展示信息（latest.json 不可达时使用） */
const FALLBACK = { version: "0.15.0", date: "2026-07", sizeMB: 120 };

/** release.yml 生成的 latest.json 结构 */
interface LatestInfo {
  version: string;
  fileName: string;
  size: number;
  releaseDate: string;
}

const SYSTEM_REQ = [
  { label: "操作系统", value: "Windows 10 / 11 (64位)" },
  { label: "处理器", value: "Intel i5 / AMD Ryzen 5 或更高" },
  { label: "内存", value: "8 GB RAM 以上" },
  { label: "存储空间", value: "500 MB 可用空间" },
];

export function DownloadCta() {
  const [latest, setLatest] = useState<LatestInfo | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${DOWNLOAD_BASE}/latest.json`, { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: LatestInfo) => {
        if (data?.version && data?.fileName) setLatest(data);
      })
      .catch(() => {
        /* 服务器源不可达：保持 GitHub 回退，不打扰用户 */
      });
    return () => controller.abort();
  }, []);

  // 服务器直链优先；元数据未就绪时回退 GitHub Release 页
  const downloadUrl = latest
    ? `${DOWNLOAD_BASE}/${encodeURIComponent(latest.fileName)}`
    : GITHUB_RELEASES;
  const version = latest?.version ?? FALLBACK.version;
  const date = latest?.releaseDate ?? FALLBACK.date;
  const sizeMB = latest ? Math.round(latest.size / 1024 / 1024) : FALLBACK.sizeMB;

  return (
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
          <p className="text-xs text-kb-text3">v{version} 正式版 · {date}</p>
        </div>
      </div>

      <a
        href={downloadUrl}
        {...(latest ? {} : { target: "_blank", rel: "noopener noreferrer" })}
        className="inline-block px-12 py-4 rounded-2xl text-white font-medium text-lg transition-all duration-500 hover:scale-[1.04] active:scale-[0.97] mb-4"
        style={{
          background: "linear-gradient(135deg, var(--kb-amber), var(--kb-accent-400))",
          boxShadow: "var(--kb-shadow-accent)",
        }}
      >
        ⬇ 下载 Windows 版
      </a>

      <p className="text-xs text-kb-text3 mb-2">
        约 {sizeMB} MB · 适用于 Windows 10/11 (64位) · 免费开源
      </p>

      {/* 下载提速引导：单连接受跳网丢包限制，多线程下载器可明显提速；
          服务器已支持 Range 请求（断点续传） */}
      <details className="text-xs mb-8 text-left max-w-md mx-auto">
        <summary className="cursor-pointer text-kb-text3 transition-colors duration-300 hover:text-kb-text2 text-center">
          下载缓慢？点此查看提速方式
        </summary>
        <div className="mt-4 rounded-xl p-4 space-y-3" style={{ background: "var(--kb-bg-tertiary)" }}>
          <p className="text-kb-text2 leading-relaxed">
            本站已支持<strong className="text-kb-text">断点续传与分段下载</strong>。浏览器默认只用单连接，
            换用多线程下载工具（如 Motrix、IDM、aria2）通常可快几倍。
          </p>
          {latest && (
            <div>
              <p className="text-kb-text3 mb-1.5">直链（可复制到下载工具）：</p>
              <code
                className="block break-all rounded-lg px-3 py-2 font-mono text-[11px] text-kb-text2"
                style={{ background: "var(--kb-bg-secondary)" }}
              >
                {downloadUrl}
              </code>
            </div>
          )}
          <p className="text-kb-text3">
            仍然缓慢？试试{" "}
            <a
              href={GITHUB_RELEASES}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors duration-300 hover:text-kb-text2"
            >
              GitHub 备用源 ↗
            </a>
          </p>
        </div>
      </details>

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
  );
}
