/**
 * ==文本== / ==[色]文本== 荧光笔 remark 插件测试（v0.14 B + v0.16.1 多色扩展）。
 *
 * @ai-context: spec §6——==文本== 渲染为 mark（默认黄）；==[色id]文本== 彩色；
 *              未知色/未闭合/跨行/代码块内不误伤；多个高亮同段落、行内混合文本。
 *              插件是纯 mdast 树变换——测试直接构造树验证（不依赖 remark 运行时包）。
 */
import { describe, expect, it } from "vitest";
import { remarkMarkHighlight } from "./remarkMarkHighlight";

/** mdast 节点最小形状 */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName: string; hProperties: { className: string[] } };
  colorId?: string;
}

/** 构造段落节点（快捷） */
function para(...children: MdNode[]): MdNode {
  return { type: "paragraph", children };
}

function text(value: string): MdNode {
  return { type: "text", value };
}

/** 默认（无色）mark 节点期望形状（hName/hProperties 供 to-hast 落到 <mark>） */
function mark(value: string): MdNode {
  return {
    type: "mark",
    children: [text(value)],
    data: { hName: "mark", hProperties: { className: ["note-mark"] } },
  };
}

/** 彩色 mark 节点期望形状 */
function markColored(colorId: string, value: string): MdNode {
  return {
    type: "mark",
    colorId,
    children: [text(value)],
    data: { hName: "mark", hProperties: { className: ["note-mark", `note-mark-${colorId}`] } },
  };
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
  it("闭合 ==文本== → mark 节点（默认黄：hName=mark + className note-mark）", () => {
    const out = apply(para(text("重点是==这个==")));
    expect(out).toEqual([para(text("重点是"), mark("这个"))]);
  });

  it("==[red]文本== → 彩色 mark（className 带 note-mark-red）", () => {
    const out = apply(para(text("==[red]红色重点==")));
    expect(out).toEqual([para(markColored("red", "红色重点"))]);
  });

  it("同段落混合：默认黄 + 彩色 + 普通文本", () => {
    const out = apply(para(text("==黄== 与 ==[blue]蓝== 都要")));
    expect(out).toEqual([para(mark("黄"), text(" 与 "), markColored("blue", "蓝"), text(" 都要"))]);
  });

  it("未知色 id（==[neon]==）整体原样保留（不拆不猜）", () => {
    const out = apply(para(text("==[neon]未知色==")));
    expect(out).toEqual([para(text("==[neon]未知色=="))]);
    expect(marks(out)).toEqual([]);
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
