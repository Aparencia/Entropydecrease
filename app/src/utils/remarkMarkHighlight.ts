/**
 * remark 插件：==文本== → mark 节点（v0.14 B 正文荧光笔，Obsidian 式单色黄）。
 *
 * @ai-context: spec §2.1 裁决——单色荧光笔 `==文本==`（多色是伪需求）；零自研
 *              解析偏好现成插件，但 remark 生态无轻量现成包（markdown-it 系
 *              才有），且 spec 要求 ≤20 行增量——自实现最小插件：仅处理单个
 *              text 节点内的闭合 `==...==`（跨节点/跨行/未闭合原样保留，安全
 *              降级）。产出 mdast 自定义节点 `mark`（children=text），由
 *              react-markdown components.mark 渲染为 <mark>。
 */

/** mdast 文本节点最小形状（不引外部类型包，保持零依赖） */
interface MdTextNode {
  type: "text";
  value: string;
}

/** 自定义 mark 节点（react-markdown components 按 type 映射渲染） */
interface MdMarkNode {
  type: "mark";
  children: MdTextNode[];
}

/** 任意 mdast 父节点（children 数组遍历用） */
interface MdParent {
  children?: unknown[];
}

/** 闭合 ==文本==（内容至少 1 字符、不含换行与 =；未闭合/空/跨行不匹配——原样保留） */
const MARK_RE = /==([^=\n]+)==/g;

/** 按 ==...== 切分文本为 text/mark 节点序列（无匹配返回 null——避免无谓替换） */
function splitMark(value: string): (MdTextNode | MdMarkNode)[] | null {
  const nodes: (MdTextNode | MdMarkNode)[] = [];
  let last = 0;
  let matched = false;
  for (const m of value.matchAll(MARK_RE)) {
    matched = true;
    const idx = m.index ?? 0;
    if (idx > last) nodes.push({ type: "text", value: value.slice(last, idx) });
    nodes.push({ type: "mark", children: [{ type: "text", value: m[1] }] });
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
