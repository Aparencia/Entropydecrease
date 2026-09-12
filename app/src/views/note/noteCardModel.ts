/** 结构派生器，批 7 归一 */
/**
 * noteCardModel —— 笔记卡片流的**结构派生器**（批 5 · T12 · C8 的落点）。
 *
 * @ai-context 为什么叫「派生器」不叫「解析器」（C8 逐字）：笔记卡片流的派生器**不得手写
 *   markdown 解析器** —— 必须复用既有 `react-markdown` 栈。故本文件**没有一行 markdown
 *   词法/语法分析**：它拿到的是 `react-markdown`（unified 的 remark 阶段）**已经解析好的
 *   mdast 树**，只做一次结构改写 —— 给 `tree.children`（**仅顶层**）的每个块挂上「卡片」的
 *   类名族与 `data-card-kind`；渲染仍走 `NoteMarkdown` 那条既有管线（GFM / 数学 / 荧光笔 /
 *   换行四条语义一条不少）。全站 `react-markdown` 站点数因此**不增加**（仍是 2，见 N5）。
 * @ai-context **临时件，批 7 归一**：批 5 **不做**三套 markdown 渲染器的归一（`ChatMessageMarkdown`
 *   的归并、`NotePreviewView` 手写解析器的替换都转批 7，裁决见 `rulings.md` C8）。本文件是批 7
 *   归一时会被吸收/替换的中间形态 ⇒ **文件头第一行**显式命名，避免「3 套变 4 套」时无人认领。
 * @ai-context 为什么只改**顶层**：嵌套的 `p` / `ul` 若也挂卡片类会得到「卡中卡」（每个列表项再
 *   加一层底与边框）⇒ 遍历**只**走 `tree.children`，绝不下钻（N2 的机器判据钉住这一点）。
 * @ai-context 为什么走 `data.hProperties` 而不是 `hName`：`hName` 会**换掉元素本身**
 *   （`utils/remarkMarkHighlight.ts` 头注记录了 v0.16.1 的教训：自定义节点无 hName 时落到
 *   `defaultUnknownHandler` 的 `<div>`，`components.mark` 永远匹配不到）；`hProperties` 是
 *   `mdast-util-to-hast` **应用 data 的通道**（同该头注 `:25` 的结论），只加属性、不动元素身份。
 * 副作用：无 —— 纯 AST 变换：就地改写入参树；不取数、不渲染、不 import Tauri、无 I/O。
 * 边界：① 只处理 mdast 顶层块；不产出新节点、不解析文本；不认识的块类型照样挂类（挂得上挂不上
 *   由 `mdast-util-to-hast` 决定，本层不猜、不跳过）；② 顶层 `code` 节点有一条**实测形状**：
 *   `mdast-util-to-hast` 的 code handler 先对**内层 `<code>`** 应用 data、之后才包外层 `<pre>`
 *   ⇒ 卡片类落内层 `<code>`（如实登记，不在本层绕开；见 T12 报告「派生器契约」）。
 */
import type { RemarkPlugin } from "../../components/NoteMarkdown";

/** 顶层块的**卡片种类**（派生器的输出词汇；`other` 是不认识的块的诚实降级） */
export type CardKind = "heading" | "para" | "list" | "quote" | "code" | "table" | "rule" | "media" | "other";

/**
 * 卡片面类族 —— 逐字取自 `ui/primitives/Surface` 的类名族（`level="surface"` + `radius="panel"`
 * + `bordered` + `padded`）。**零新 CSS 文件**：卡片样式复用既有 `ed-surface` 类族 ⇒ 不发散设计
 * 体系、不新增被守卫扫描的 CSS。与 `Surface` 的一致性由 `noteViews.test.tsx` 的对拍用例钉住。
 */
export const CARD_SURFACE_CLASSES: readonly string[] = [
  "ed-surface",
  "ed-surface--bordered",
  "ed-surface--surface",
  "ed-surface--r-panel",
  "ed-surface--padded",
];

/** `h1`–`h6`（hast 侧）与 `heading`（mdast 侧）同属一类 */
const HEADING_TAG = /^h[1-6]$/;

/**
 * 块 → 卡片种类。入参同时接受 **mdast 节点类型**（插件侧：`heading` / `paragraph` / `code`…）
 * 与 **hast 标签名**（判据侧：`h2` / `ul` / `pre`…）—— 两套命名指向同一个种类，映射只有这一处。
 * 纯函数：同入参恒同出参，不读外部状态、无副作用（AAA 可单测）。
 */
export function cardKindOf(tag: string): CardKind {
  if (tag === "heading" || HEADING_TAG.test(tag)) return "heading";
  switch (tag) {
    case "paragraph": case "p": return "para";
    case "list": case "listItem": case "ul": case "ol": case "li": return "list";
    case "blockquote": return "quote";
    case "code": case "pre": return "code";
    case "table": case "tableRow": case "tableCell": return "table";
    case "thead": case "tbody": case "tr": case "th": case "td": return "table";
    case "thematicBreak": case "hr": return "rule";
    case "image": case "imageReference": case "img": return "media";
    default: return "other";
  }
}

/** mdast 节点的最小形状（**自声明**，不引外部类型包 —— 照 `remarkMarkHighlight` 的形态先例） */
interface MdBlockData {
  hName?: string;
  hChildren?: unknown[];
  hProperties?: Record<string, unknown>;
  [key: string]: unknown;
}
interface MdBlock {
  type?: string;
  data?: MdBlockData;
  children?: unknown[];
}
interface MdTree {
  children?: MdBlock[];
}

/**
 * remark 插件：给**顶层**块挂卡片类族 + `data-card-kind`（只加属性，**不换元素**）。
 * 形态照 `remarkMarkHighlight`（无参工厂返回 transformer）⇒ 与既有插件同构、可混排。
 * `satisfies RemarkPlugin` 把「它就是 `remarkPlugins` 槽要的那个类型」钉在**定义点**上
 * （同时保留可调用性 ⇒ 变换函数可脱离 DOM 单测）。
 */
export const noteCardPlugin = (() => (tree: MdTree | null | undefined): void => {
  const blocks = tree?.children;
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const prev = block.data?.hProperties;
    const raw = prev?.className;
    const own = Array.isArray(raw) ? raw.filter((c): c is string => typeof c === "string") : [];
    block.data = {
      ...block.data,
      hProperties: {
        ...prev,
        className: [...CARD_SURFACE_CLASSES, ...own],
        "data-card-kind": cardKindOf(block.type ?? ""),
      },
    };
  }
}) satisfies RemarkPlugin;
