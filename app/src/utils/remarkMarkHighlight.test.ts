/**
 * ==文本== 荧光笔 remark 插件测试（v0.14 B 视觉系统）。
 *
 * @ai-context: spec §6——==文本== 渲染为 mark；未闭合/跨行/代码块内不误伤；
 *              多个高亮同段落、行内混合文本。插件是纯 mdast 树变换——测试
 *              直接构造树验证（不依赖 remark 运行时包）。
 */
import { describe, expect, it } from "vitest";
import { remarkMarkHighlight } from "./remarkMarkHighlight";

/** mdast 节点最小形状 */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

/** 构造段落节点（快捷） */
function para(...children: MdNode[]): MdNode {
  return { type: "paragraph", children };
}

function text(value: string): MdNode {
  return { type: "text", value };
}

/** 应用插件变换，返回 root 的 children */
function apply(...children: MdNode[]): MdNode[] {
  const root: MdNode = { type: "root", children };
  const transformer = remarkMarkHighlight() as (tree: MdNode) => void;
  transformer(root);
  return root.children ?? [];
}

/** 扁平化收集 mark 节点内容 */
function marks(nodes: MdNode[]): string[] {
  const out: string[] = [];
  const walk = (n: MdNode) => {
    if (n.type === "mark") out.push(n.children?.[0]?.value ?? "");
    (n.children ?? []).forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

describe("remarkMarkHighlight", () => {
  it("闭合 ==文本== → mark 节点", () => {
    const out = apply(para(text("重点是==这个==")));
    expect(out).toEqual([
      para(text("重点是"), { type: "mark", children: [text("这个")] }),
    ]);
  });

  it("同一段落多个高亮", () => {
    const out = apply(para(text("==甲== 与 ==乙== 都要")));
    expect(marks(out)).toEqual(["甲", "乙"]);
    expect(out[0].children?.[1]?.type).toBe("text");
  });

  it("标题内高亮（下钻子节点）", () => {
    const heading: MdNode = { type: "heading", children: [text("标题 ==带高亮==")] };
    const out = apply(heading);
    expect(marks(out)).toEqual(["带高亮"]);
  });

  it("未闭合 == 原样保留", () => {
    const out = apply(para(text("未闭合==文本")));
    expect(out).toEqual([para(text("未闭合==文本"))]);
  });

  it("空 == == 原样保留（内容至少 1 字符）", () => {
    const out = apply(para(text("空 ==== 标记")));
    expect(out).toEqual([para(text("空 ==== 标记"))]);
  });

  it("跨行不匹配（\\n 排除）", () => {
    const out = apply(para(text("==第一行\n第二行==")));
    expect(out).toEqual([para(text("==第一行\n第二行=="))]);
  });

  it("代码块内 == 是字面量（不误伤）", () => {
    const code: MdNode = { type: "code", value: "const s = \"a==b==c\"" };
    const out = apply(code);
    expect(out).toEqual([code]);
    expect(marks(out)).toEqual([]);
  });

  it("行内代码内 == 是字面量", () => {
    const inline: MdNode = { type: "inlineCode", value: "a==b==c" };
    const out = apply(para(inline));
    expect(out).toEqual([para(inline)]);
    expect(marks(out)).toEqual([]);
  });

  it("纯文本无 == 零改动（引用保持原节点引用）", () => {
    const t = text("普通文本");
    const out = apply(para(t));
    expect(out[0].children?.[0]).toBe(t);
  });
});
