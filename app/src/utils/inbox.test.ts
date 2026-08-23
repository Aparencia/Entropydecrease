/**
 * inbox.test.ts — 收件箱动线纯函数单测（v0.12.2 升笔记标题预填/预览）。
 *
 * @ai-context: AAA 结构；node 环境（Vitest），无 DOM 依赖。
 *              边界覆盖：空文本/超长截断/无标点/列表前缀/纯图片碎片占位。
 */
import { describe, expect, it } from "vitest";
import { fragmentPreview, promoteTitleFor } from "./inbox";

describe("promoteTitleFor（升笔记标题预填首句）", () => {
  it("取首句（中文标点切分）", () => {
    expect(promoteTitleFor("眼影要晕染。第二步定妆。")).toBe("眼影要晕染");
  });

  it("无标点时取全文并截断 50 字", () => {
    const long = "无标点的一句话".repeat(20);
    expect(promoteTitleFor(long).length).toBe(50);
  });

  it("去除列表/标题前缀符号保标题干净", () => {
    expect(promoteTitleFor("- 晕染手法分两步")).toBe("晕染手法分两步");
    expect(promoteTitleFor("# 眼影基础")).toBe("眼影基础");
  });

  it("空文本/纯空白退默认名", () => {
    expect(promoteTitleFor("")).toBe("未命名笔记");
    expect(promoteTitleFor("   \n  ")).toBe("未命名笔记");
  });

  it("纯图片碎片占位文本也被预填（不返回空）", () => {
    const t = promoteTitleFor("（图片碎片）");
    expect(t.length).toBeGreaterThan(0);
  });
});

describe("fragmentPreview（截断预览）", () => {
  it("短文本原样返回", () => {
    expect(fragmentPreview("短", 10)).toBe("短");
  });

  it("超长补省略号", () => {
    const p = fragmentPreview("abcdefgh", 5);
    expect(p).toBe("abcde…");
    expect(p.length).toBe(6);
  });

  it("首尾空白裁剪", () => {
    expect(fragmentPreview("  干净  ", 10)).toBe("干净");
  });
});
