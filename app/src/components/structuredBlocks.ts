/**
 * StructuredBlockRenderer — 结构化产物块渲染器（v0.5.0 M5/M7，REQ-053）。
 *
 * @ai-context: 渲染器升级：LaTeX（KaTeX 本地化，无 CDN）/ Markdown 表格 /
 *              图集 / 低置信样式（黄色虚线下划线）/ AI 占位样式（"AI 增强待 V1.0"）。
 * @ai-context: KaTeX 经 npm 安装随 Vite bundle 打包（vendor 进产物，离线可渲染）。
 */
import katex from "katex";
import "katex/dist/katex.min.css";

/** LaTeX 渲染（KaTeX 本地化：renderToString 无网络依赖） */
export function renderLatex(latex: string): string {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: true,
    });
  } catch {
    // 防御：非法 LaTeX 原样展示（不抛异常阻断渲染链）
    return `<code>${escapeHtml(latex)}</code>`;
  }
}

/** Markdown 表格文本 → HTML 表格（REQ-053：表格渲染组件，无第三方依赖） */
export function renderMarkdownTable(md: string): string {
  const lines = md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));
  if (lines.length < 2) return `<pre>${escapeHtml(md)}</pre>`;
  // 跳过分隔行（|---|---|）
  const rows = lines.filter((l) => !/^\|[\s:|-]+\|$/.test(l));
  if (rows.length === 0) return `<pre>${escapeHtml(md)}</pre>`;
  const cells = (line: string) =>
    line
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim().replace(/\\\|/g, "|"));
  const header = cells(rows[0]);
  const body = rows.slice(1).map(cells);
  const esc = escapeHtml;
  const thead = `<thead><tr>${header.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${body
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

/** HTML 转义（防御：产物文本不可信） */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 低置信样式类名（黄色虚线下划线；低置信/AI 占位渲染统一入口） */
export function lowConfidenceClass(confidence: number | null | undefined): string {
  return confidence != null && confidence < 0.5 ? "ed-low-confidence" : "";
}

/** AI 占位标记（补缝式 AI V1.0 开放前的诚实占位，REQ-055） */
export function aiPlaceholderLabel(): string {
  return "AI 增强待 V1.0";
}
