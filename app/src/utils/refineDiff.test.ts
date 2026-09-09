/**
 * refineDiff.test.ts — 精修工作台行级 diff 渲染纯工具单测（批 3 / 问题11）。
 *
 * @ai-context: 覆盖三块纯逻辑：① ops 流→行/栏划分（LCS 保序对齐——每栏
 *              行序与源文本一致，重复行按位置区分）；② 三态样式分类（与
 *              VersionPanel 同款配色）；③ HTML 输出（unchanged 与旧
 *              renderMd 字节一致 + XSS 转义守卫）。
 */
import { describe, expect, it } from "vitest";
import type { DiffOp } from "../types";
import {
  diffPrefixFor,
  mdFallbackRows,
  mdLineHtml,
  opToRow,
  opsToRows,
  renderDiffColumnHtml,
  renderSideHtml,
  sideStyleFor,
  splitDiffSides,
} from "./refineDiff";

/** 与精修任务同构的典型流：# 标题未变、规则内容被删、精修内容新增、尾行未变 */
const OPS: DiffOp[] = [
  { unchanged: "# 标题" },
  { removed: "规则内容" },
  { added: "精修内容" },
  { unchanged: "共同尾行" },
];

describe("ops 流 → 行/栏划分（LCS 保序对齐）", () => {
  it("opToRow：外部标签收窄为行（kind + text）", () => {
    // Arrange/Act/Assert
    expect(opToRow({ unchanged: "甲" })).toEqual({ kind: "unchanged", text: "甲" });
    expect(opToRow({ added: "乙" })).toEqual({ kind: "added", text: "乙" });
    expect(opToRow({ removed: "丙" })).toEqual({ kind: "removed", text: "丙" });
  });

  it("splitDiffSides：左栏=非 added 流序、右栏=非 removed 流序（各栏=其源文本行序）", () => {
    // Arrange/Act
    const { base, refined } = splitDiffSides(OPS);
    // Assert：base 行序 = 原版行序（# 标题/规则内容/共同尾行）
    expect(base.map((r) => r.text)).toEqual(["# 标题", "规则内容", "共同尾行"]);
    expect(base.map((r) => r.kind)).toEqual(["unchanged", "removed", "unchanged"]);
    // Assert：refined 行序 = 精修版行序（# 标题/精修内容/共同尾行）
    expect(refined.map((r) => r.text)).toEqual(["# 标题", "精修内容", "共同尾行"]);
    expect(refined.map((r) => r.kind)).toEqual(["unchanged", "added", "unchanged"]);
  });

  it("重复内容行按位置归属（不做文本匹配——防同名行错配）", () => {
    // Arrange：两版都含两行「同」，中段各自独有行——LCS 逐位保住未变对
    const ops = diffOpsFrom(["同", "同", "异"], ["同", "同", "新"]);
    // Act
    const { base, refined } = splitDiffSides(ops);
    // Assert：左右栏均为 同/同 + 各自变更行（行数与源一致，未丢行）
    expect(base.map((r) => r.text)).toEqual(["同", "同", "异"]);
    expect(refined.map((r) => r.text)).toEqual(["同", "同", "新"]);
  });

  it("opsToRows：整篇流序保留（三态齐备）", () => {
    // Arrange/Act
    const rows = opsToRows(OPS);
    // Assert
    expect(rows).toEqual([
      { kind: "unchanged", text: "# 标题" },
      { kind: "removed", text: "规则内容" },
      { kind: "added", text: "精修内容" },
      { kind: "unchanged", text: "共同尾行" },
    ]);
  });

  it("mdFallbackRows：取数失败兜底=全 unchanged 原文行", () => {
    // Arrange/Act
    const rows = mdFallbackRows("# 标题\n规则内容\n");
    // Assert：split 语义保留末尾空行（空行渲染为 "" 不产生可见元素）
    expect(rows).toEqual([
      { kind: "unchanged", text: "# 标题" },
      { kind: "unchanged", text: "规则内容" },
      { kind: "unchanged", text: "" },
    ]);
  });
});

describe("三态样式分类（VersionPanel 同款配色）", () => {
  it("sideStyleFor：added 绿 / removed 删除线红 / unchanged 无色", () => {
    // Arrange/Act/Assert
    expect(sideStyleFor("added")).toBe("color:#047857;background:#ecfdf5");
    expect(sideStyleFor("removed")).toBe("color:#b91c1c;background:#fef2f2;text-decoration:line-through");
    expect(sideStyleFor("unchanged")).toBe("");
  });

  it("diffPrefixFor：+ / − / 两空格缩进", () => {
    // Arrange/Act/Assert
    expect(diffPrefixFor("added")).toBe("+ ");
    expect(diffPrefixFor("removed")).toBe("− ");
    expect(diffPrefixFor("unchanged")).toBe("  ");
  });
});

describe("行级 HTML 渲染", () => {
  it("unchanged 段落与旧 renderMd 字节一致（渲染回归零漂移）", () => {
    // Arrange/Act
    const html = renderSideHtml([{ kind: "unchanged", text: "规则内容" }]);
    // Assert：与 renderMd 时代输出完全相同
    expect(html).toBe('<p style="font-size:12px;color:#374151;margin:2px 0">规则内容</p>');
  });

  it("removed/added 行在轻量渲染上追加三态样式（颜色覆盖标题/列表色）", () => {
    // Arrange/Act
    const removed = renderSideHtml([{ kind: "removed", text: "规则内容" }]);
    const added = renderSideHtml([{ kind: "added", text: "## 新增节" }]);
    const list = renderSideHtml([{ kind: "removed", text: "- 删项" }]);
    // Assert
    expect(removed).toContain("color:#b91c1c;background:#fef2f2;text-decoration:line-through");
    expect(removed).toContain("规则内容");
    expect(added).toContain("color:#047857;background:#ecfdf5");
    // 标题样式尾部追加（其后出现颜色覆盖）
    expect(added.indexOf("color:#0f766e")).toBeLessThan(added.indexOf("color:#047857"));
    expect(list).toContain("• ");
    expect(list).toContain("line-through");
  });

  it("空行/空白行不产生可见 HTML（保持旧渲染语义）", () => {
    // Arrange/Act/Assert
    expect(mdLineHtml("", "removed")).toBe("");
    expect(mdLineHtml("   ", "added")).toBe("");
  });

  it("renderDiffColumnHtml：差异单列三态（灰共有/删除线红/新增绿 + 前缀 + 剥标题符）", () => {
    // Arrange/Act
    const html = renderDiffColumnHtml(opsToRows(OPS));
    // Assert：unchanged 剥 # 前缀灰显
    expect(html).toContain(">  标题</div>");
    expect(html).toContain("color:#6b7280");
    // Assert：removed 删除线红 + 前缀 −
    expect(html).toContain(">− 规则内容</div>");
    expect(html).toContain("text-decoration:line-through");
    // Assert：added 绿 + 前缀 +
    expect(html).toContain(">+ 精修内容</div>");
    expect(html).toContain("background:#ecfdf5");
  });

  it("XSS 守卫：恶意文本经 escapeHtml 后才入 HTML（两模式同源）", () => {
    // Arrange：OCR/ASR 文本可含 HTML（存储型 XSS 防线的既有纪律）
    const evil: DiffOp = { added: "<script>alert(1)</script>" };
    // Act/Assert
    const side = renderSideHtml([opToRow(evil)]);
    expect(side).not.toContain("<script>");
    expect(side).toContain("&lt;script&gt;");
    const col = renderDiffColumnHtml([opToRow(evil)]);
    expect(col).not.toContain("<script>");
    expect(col).toContain("&lt;script&gt;");
  });
});

/** 与后端 note_diff::diff_markdown 同语义的最小 LCS 流构造（仅测试对齐用）：
 * 前后缀同文保住、中段按 base/refined 出 removed/added——重复「同」行逐位配对 */
function diffOpsFrom(base: string[], refined: string[]): DiffOp[] {
  const prefixLen = base.findIndex((l, i) => refined[i] !== l);
  const common = Math.max(0, prefixLen < 0 ? Math.min(base.length, refined.length) : prefixLen);
  const ops: DiffOp[] = [];
  for (let i = 0; i < common; i++) ops.push({ unchanged: base[i] });
  const bTail = base.slice(common);
  const rTail = refined.slice(common);
  // 后缀公共长度（测试数据中 base/refined 等长、仅中段一行为差异）
  let sfx = 0;
  while (sfx < bTail.length && sfx < rTail.length && bTail[bTail.length - 1 - sfx] === rTail[rTail.length - 1 - sfx]) sfx++;
  const bMid = bTail.slice(0, bTail.length - sfx);
  const rMid = rTail.slice(0, rTail.length - sfx);
  // 中段逐位配对为 removed/added（测试数据中 bMid/rMid 同长）
  for (let i = 0; i < Math.max(bMid.length, rMid.length); i++) {
    if (i < bMid.length) ops.push({ removed: bMid[i] });
    if (i < rMid.length) ops.push({ added: rMid[i] });
  }
  for (let i = bTail.length - sfx; i < bTail.length; i++) ops.push({ unchanged: bTail[i] });
  return ops;
}
