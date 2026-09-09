/**
 * 精修工作台行级 diff 渲染纯工具（批 3 / 用户问题11 差异显示）。
 *
 * @ai-context: 后端 diff_markdown_ops 返回整篇有序行级 DiffOp 流（note_diff
 *              LCS：未变行保住、只标真实变化）。本模块做两类纯变换：
 *              ① ops 流 → 各栏有序行（base 侧行序 = 流中非 added 行序；
 *                 refined 侧 = 流中非 removed 行序——LCS 保序性保证每栏行序
 *                 与其源文本逐行一致，行级染色按栏对齐天然成立，无需"跨栏
 *                 逐行配对"（避免表格/图片等多行结构错配）；
 *              ② 行 → HTML 字符串（沿用工作台轻量逐行渲染：每个源行恰一个
 *                 元素，无跨行结构——若未来渲染改为块级组合需回落不染色）。
 * @ai-context: 样式对齐 VersionPanel 既有三态设计语言（added 绿 #047857/
 *              #ecfdf5、removed 红 #b91c1c/#fef2f2 删除线、unchanged 灰
 *              #6b7280），不新造配色。
 */
import type { DiffOp } from "../types";
import { escapeHtml, renderTimestampAnchors } from "./html";

/** 行级三态（与后端 DiffOp 标签同名——serde 小写 tag） */
export type DiffRowKind = "unchanged" | "added" | "removed";

/** 对齐后的一行（文本 + 所属状态） */
export interface DiffRow {
  text: string;
  kind: DiffRowKind;
}

/** 行级三态 → 轻量渲染元素追加样式（并排双栏：unchanged 不染色保持原观感） */
export function sideStyleFor(kind: DiffRowKind): string {
  if (kind === "added") return "color:#047857;background:#ecfdf5";
  if (kind === "removed") return "color:#b91c1c;background:#fef2f2;text-decoration:line-through";
  return "";
}

/** 差异单列前缀（VersionPanel 同款：+ / − / 空格缩进） */
export function diffPrefixFor(kind: DiffRowKind): string {
  if (kind === "added") return "+ ";
  if (kind === "removed") return "− ";
  return "  ";
}

/** DiffOp 外部标签 → 行（标签判别收窄联合类型） */
export function opToRow(op: DiffOp): DiffRow {
  if ("added" in op) return { kind: "added", text: op.added };
  if ("removed" in op) return { kind: "removed", text: op.removed };
  return { kind: "unchanged", text: op.unchanged };
}

/** 整篇流 → 差异单列全行（流序即原始交错序——unchanged/removed/added 三态齐备） */
export function opsToRows(ops: DiffOp[]): DiffRow[] {
  return ops.map(opToRow);
}

/**
 * ops 流 → 左右栏各自有序行。
 *
 * Why 按栏各消费一侧流而非按文本行号配对：removed 行只存在于 base、added
 * 行只存在于 refined，同内容重复行按位置区分——流划分保证两栏行数/行序与
 * 各自源文本一致，任何渲染结构（含重复行）都不会错配。
 */
export function splitDiffSides(ops: DiffOp[]): { base: DiffRow[]; refined: DiffRow[] } {
  const base: DiffRow[] = [];
  const refined: DiffRow[] = [];
  for (const op of ops) {
    const row = opToRow(op);
    if (row.kind !== "added") base.push(row);
    if (row.kind !== "removed") refined.push(row);
  }
  return { base, refined };
}

/** 文本 → 全 unchanged 行（ops 取数失败时的兜底：不染色也不破坏渲染） */
export function mdFallbackRows(md: string): DiffRow[] {
  return md.split("\n").map((text) => ({ kind: "unchanged" as const, text }));
}

/** 单行 markdown → 轻量 HTML（kind 染色在行内联样式末尾追加——后者覆盖前色） */
export function mdLineHtml(line: string, kind: DiffRowKind): string {
  const extra = sideStyleFor(kind);
  const style = extra ? `font-size:12px;margin:2px 0;${extra}` : "";
  if (line.startsWith("# ")) return `<h2 style="font-size:14px;margin:8px 0 3px${extra ? ";" + extra : ""}">${renderTimestampAnchors(escapeHtml(line.slice(2)))}</h2>`;
  if (line.startsWith("## ")) return `<h3 style="font-size:13px;margin:6px 0 2px;color:#0f766e${extra ? ";" + extra : ""}">${renderTimestampAnchors(escapeHtml(line.slice(3)))}</h3>`;
  if (line.startsWith("### ")) return `<h4 style="font-size:12px;margin:4px 0 2px;color:#374151${extra ? ";" + extra : ""}">${renderTimestampAnchors(escapeHtml(line.slice(4)))}</h4>`;
  if (line.startsWith("- ")) return `<div style="font-size:12px;color:#4b5563${extra ? ";" + extra : ""}">• ${renderTimestampAnchors(escapeHtml(line.slice(2)))}</div>`;
  if (line.trim() === "") return "";
  return `<p style="${style || "font-size:12px;color:#374151;margin:2px 0"}">${renderTimestampAnchors(escapeHtml(line))}</p>`;
}

/** 并排双栏渲染（unchanged 行输出与旧 renderMd 字节一致——渲染回归零漂移） */
export function renderSideHtml(rows: DiffRow[]): string {
  return rows.map((r) => mdLineHtml(r.text, r.kind)).join("");
}

/** 差异单列渲染（VersionPanel 三态风格：灰正常/删除线红/新增绿 + 前缀） */
export function renderDiffColumnHtml(rows: DiffRow[]): string {
  return rows.map((r) => {
    // unchanged 剥标题符对齐 VersionPanel 展示（改动行保留原文便于对照）
    const text = r.kind === "unchanged" ? r.text.replace(/^#+\s*/, "") : r.text;
    if (r.kind === "unchanged") {
      return `<div style="color:#6b7280;padding:2px 6px">${escapeHtml(diffPrefixFor(r.kind) + (text || " "))}</div>`;
    }
    const style = r.kind === "added"
      ? "background:#ecfdf5;color:#047857;padding:2px 6px;border-radius:4px"
      : "background:#fef2f2;color:#b91c1c;padding:2px 6px;border-radius:4px;text-decoration:line-through";
    return `<div style="${style}">${escapeHtml(diffPrefixFor(r.kind) + text)}</div>`;
  }).join("");
}
