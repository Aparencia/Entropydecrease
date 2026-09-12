/**
 * StructuredBlockRenderer — 结构化产物块渲染器（v0.5.0 M5/M7，REQ-053）。
 *
 * @ai-context: 渲染器升级：LaTeX（KaTeX 本地化，无 CDN）/ Markdown 表格 /
 *              图集 / 低置信样式（黄色虚线下划线）。
 * @ai-context: KaTeX 经 npm 安装随 Vite bundle 打包（vendor 进产物，离线可渲染）。
 */
import katex from "katex";
import "katex/dist/katex.min.css";
// L11 去重：escapeHtml 单一定义源在 utils/html.ts；此处 re-export 保持既有公共 API 兼容
import { escapeHtml } from "../utils/html";

export { escapeHtml };

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

/**
 * 低置信样式类名（黄色虚线下划线；低置信/AI 占位渲染统一入口）。
 *
 * @ai-context 类名形状受 `ui/primitives/motion-coverage.test.ts` 的**选择器域约束**（批 6 T13 · 裁决 R12.1）：
 *   逐字取 `<既有基类>--<修饰>` 形状（此处 = `Text` 原语的基类 `ed-text`）—— 该修饰类与基类同元素，
 *   于是被 reduced-motion 名单的基类条目覆盖，且不必新增基类名。
 *   🔴 **不得**改回 `ed-low-confidence`：那个名字落在任何基类域之外，会被上面那条守卫的「未登记基类」
 *   判据（`:113-124`）拦下；放行它要改三条既有断言（= G16 候选），控制方已裁定**不启用**。
 *   样式落点 = `ui/primitives/Text.css` 的 `.ed-text--low-confidence`（环境层第 ③ 件：墨度极缓慢起伏，
 *   幅度真源见 `motion/env.ts`）；触发判据 = `SessionSegment.confidence` 的低置信段（阈值 `< 0.5`，不改）。
 */
export function lowConfidenceClass(confidence: number | null | undefined): string {
  return confidence != null && confidence < 0.5 ? "ed-text--low-confidence" : "";
}
