/**
 * remark 插件：==文本== / ==[色]文本== → mark 节点（v0.14 B 正文荧光笔；v0.16.1 多色扩展）。
 *
 * @ai-context: v0.14 B spec §2.1 裁决单色（多色=伪需求）——2026-08-31 用户明确
 *              需要内容多色，本版修订：`==[色]文本==`（色=colorPalette 12 色 id
 *              小写），无前缀保持默认黄；存量 `==文本==` 内容零迁移。未知色 id
 *              整体按原文保留（诚实降级——不猜色、不吞内容）。
 * @ai-context: 仅处理单个 text 节点内的闭合 `==...==`（跨节点/跨行/未闭合原样
 *              保留，安全降级）；code/inlineCode 子树跳过。产出 mdast 自定义
 *              节点 `mark`（children=text）+ data.hName="mark" +
 *              data.hProperties.className（"note-mark" [+ "note-mark-{colorId}"]）
 *              ——hName/hProperties 是 mdast-util-to-hast 应用 data 的通道：
 *              v0.16.1 修复：原实现纯 mdast 节点无 hName → defaultUnknownHandler
 *              落成 <div>（components.mark 按 hast tagName 匹配，永远匹配不到，
 *              荧光笔实际无样式）。样式见 note-mark.css（双主题 + WCAG 前景）。
 */
import { isColorId } from "./colorPalette";

/** mdast 文本节点最小形状（不引外部类型包，保持零依赖） */
interface MdTextNode {
  type: "text";
  value: string;
}

/** 自定义 mark 节点（react-markdown components 按 hast tagName=mark 映射渲染） */
interface MdMarkNode {
  type: "mark";
  /** 色板 id（string=有色；undefined=默认黄） */
  colorId?: string;
  children: MdTextNode[];
  data?: {
    hName: string;
    hProperties: { className: string[] };
  };
}

/** 任意 mdast 父节点（children 数组遍历用） */
interface MdParent {
  children?: unknown[];
}

/**
 * 闭合 ==文本== 或 ==[色id]文本==（内容至少 1 字符、不含换行与 =；未闭合/空/
 * 跨行不匹配——原样保留）。色 id 仅小写字母（含 12 色；大写/中文不是 id）。
 */
const MARK_RE = /==(?:\[([a-z]+)\])?([^=\n]+)==/g;

/** 构建 mark 节点（hName/hProperties 供 mdast-util-to-hast 落到 <mark class>） */
function markNode(colorId: string | undefined, text: string): MdMarkNode {
  return {
    type: "mark",
    ...(colorId ? { colorId } : {}),
    children: [{ type: "text", value: text }],
    data: {
      hName: "mark",
      hProperties: {
        className: colorId ? ["note-mark", `note-mark-${colorId}`] : ["note-mark"],
      },
    },
  };
}

/** 按 ==...== 切分文本为 text/mark 节点序列（无匹配返回 null——避免无谓替换） */
function splitMark(value: string): (MdTextNode | MdMarkNode)[] | null {
  const nodes: (MdTextNode | MdMarkNode)[] = [];
  let last = 0;
  let matched = false;
  for (const m of value.matchAll(MARK_RE)) {
    const idx = m.index ?? 0;
    const colorId = m[1];
    // 未知色 id：整体原样保留（不拆不猜——诚实降级，防吞用户内容）
    if (colorId !== undefined && !isColorId(colorId)) {
      last = idx + m[0].length;
      continue;
    }
    matched = true;
    if (idx > last) nodes.push({ type: "text", value: value.slice(last, idx) });
    nodes.push(markNode(colorId, m[2]));
    last = idx + m[0].length;
  }
  if (!matched) return null;
  if (last < value.length) nodes.push({ type: "text", value: value.slice(last) });
  return nodes;
}

/** 递归替换：文本节点含 == 才拆；代码块/行内代码整个子树跳过（== 在其中是字面量） */
function walk(node: MdParent): void {
  if (!Array.isArray(node.children)) return;
  const next: unknown[] = [];
  for (const child of node.children) {
    const c = child as MdParent;
    const type = (child as { type?: string }).type;
    if (type === "code" || type === "inlineCode") {
      next.push(child);
      continue;
    }
    if (type === "text") {
      const t = child as MdTextNode;
      const parts = splitMark(t.value);
      if (parts) {
        next.push(...parts);
        continue;
      }
    }
    next.push(child);
    walk(c);
  }
  node.children = next;
}

/** remark 插件入口（unified Plugin 形态：无参工厂返回 transformer） */
export function remarkMarkHighlight() {
  return (tree: MdParent) => {
    walk(tree);
  };
}
