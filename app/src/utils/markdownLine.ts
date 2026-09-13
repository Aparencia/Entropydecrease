/**
 * markdownLine — 行级 markdown → HTML 串渲染的**唯一实现**（批 7 T15 / §C10.1 的归一落点）。
 *
 * @ai-context: 迁移前有**两条各自独立**的行级 HTML 串生成器——① `components/NotePreviewView.tsx`
 *   的 `renderMarkdown`（会话笔记预览；346 行文件、**无同名测试**、无回归网）② `utils/refineDiff.ts`
 *   的 `mdLineHtml`（精修工作台行级 diff）。两支链**逻辑同源、样式不同**（`### 表 6` X6 实测：
 *   预览侧 `font-size:15px/13px/12px` + `margin:10px 0 4px`，工作台侧 `14px/13px/12px` +
 *   `margin:8px 0 3px` + diff 染色 `extra` 参数）⇒ 本模块导出**一支实现** + **两个具名模式常量**，
 *   两个模式的值**逐字取自原实现** ⇒ 两条链的可见输出**零变化**（§C11.1 的三条硬条件之一）。
 *   🔴 **归一 = 逻辑归一；观感统一未做，归批 8**（观感/像素属不可测面，§C6.4）。
 * @ai-context: 为什么**不**换成 `react-markdown`：本模块的产物是交给 `dangerouslySetInnerHTML`
 *   的**字符串**，换渲染器 = 改 DOM 形态 / 样式 / 安全面，而迁移前的 #4 **无回归网**（直接改 = 裸奔）
 *   ⇒ §C10.1 逐字禁止。
 * @ai-context: 安全面**与迁移前逐字同序**：每行文本先 `escapeHtml` 再 `renderTimestampAnchors`
 *   （`utils/html.ts` 是两者的唯一定义源）；本模块不新增任何拼接出口，也不引入 React 上下文。
 * 边界：① **不覆盖** `renderMarkdown` 的屏配图分支（`- ![alt](src)`）——它需要 `convertFileSrc` +
 *   `imageBaseUrl` / `dataDir` 两个**运行时**值，塞不进模式常量；该分支的迁移由 T17 在容器侧处置
 *   （本模块对它按段落档处理 ⇒ 迁移前**不得**用本模块渲染配图行）。② 芯片点击不在本模块（串渲染没有
 *   React 上下文）⇒ 由容器侧事件委托 `closest("[data-ts-ms]")` 处理（§C10.2）。
 */
import { escapeHtml, renderTimestampAnchors } from "./html";

/**
 * 行级渲染的**模式**（两个具名常量见下）。
 *
 * @ai-context: 模式只描述**样式族**与**染色后缀**，不描述逻辑 ⇒ 逻辑永远只有一支实现。
 */
export interface LineRenderMode {
  /** 各分支的内联样式串（每个值**逐字**取自迁移前的原实现） */
  readonly scale: {
    readonly h2: string;
    readonly h3: string;
    /** `### ` 档——🔴 **可选**：`PREVIEW` 的原实现没有这一档（`### x` 落到段落档） */
    readonly h4?: string;
    /** `> ` 档——🔴 **可选**：`COMPACT` 的原实现没有这一档（`> x` 落到段落档） */
    readonly quote?: string;
    readonly li: string;
    /** 段落档（**未染色**时的基底） */
    readonly p: string;
    /** 段落档在**染色**（`extra` 非空）时的基底——🔴 `COMPACT` 原实现的染色分支**不给 `color`**
     *  （`font-size:12px;margin:2px 0`），与未染色分支的 `p`（含 `color:#374151`）**不是同一个串**；
     *  单列才能保证逐字节对拍不红。缺省 ⇒ 复用 `p`。 */
    readonly pStained?: string;
  };
  /** 追加在同一元素 `style` 末尾的额外样式（`refineDiff` 的 diff 三态染色；空串等价于无） */
  readonly extra?: string;
}

/** **会话笔记预览模式**——值逐字取自 `NotePreviewView.renderMarkdown` 的 h2/h3/quote/li/p 五档。 */
export const PREVIEW_MODE: LineRenderMode = {
  scale: {
    h2: "font-size:15px;margin:10px 0 4px",
    h3: "font-size:13px;margin:8px 0 4px;color:#0f766e",
    quote: "font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin:6px 0",
    li: "font-size:12px;color:#4b5563",
    p: "font-size:13px;color:#374151;margin:4px 0",
  },
};

/** **精修工作台模式**——值逐字取自 `refineDiff.mdLineHtml` 的 h2/h3/h4/li/p 五档（染色由 `extra` 追加）。 */
export const COMPACT_MODE: LineRenderMode = {
  scale: {
    h2: "font-size:14px;margin:8px 0 3px",
    h3: "font-size:13px;margin:6px 0 2px;color:#0f766e",
    h4: "font-size:12px;margin:4px 0 2px;color:#374151",
    li: "font-size:12px;color:#4b5563",
    p: "font-size:12px;color:#374151;margin:2px 0",
    pStained: "font-size:12px;margin:2px 0",
  },
};

/** 染色后缀（原实现逐字形态 `extra ? ";" + extra : ""`——空串等价于无染色） */
function tinted(base: string, extra: string | undefined): string {
  return extra ? `${base};${extra}` : base;
}

/** 行内文本 → 芯片 HTML（**唯一出口**：`escapeHtml` → `renderTimestampAnchors`，与迁移前同序） */
function inline(text: string): string {
  return renderTimestampAnchors(escapeHtml(text));
}

/**
 * 单行 markdown → HTML 串（两个模式共用**这一支**实现）。
 *
 * @ai-context 分支顺序与迁移前两支链**逐字同序**（标题→引用→列表→空行→段落）；`h4` / `quote`
 *   两个档位缺失时**整条分支跳过** ⇒ 缺失档的输入落回后续分支（`PREVIEW` 的 `### x` 落段落档、
 *   `COMPACT` 的 `> x` 落段落档），与原实现一致。
 * 边界：输入是**单行**（不含 `\n`）；空行与纯空白行返回空串（不产生可见 HTML）。
 */
export function mdLineHtml(line: string, mode: LineRenderMode): string {
  const { extra } = mode;
  const s = mode.scale;
  if (line.startsWith("# ")) return `<h2 style="${tinted(s.h2, extra)}">${inline(line.slice(2))}</h2>`;
  if (line.startsWith("## ")) return `<h3 style="${tinted(s.h3, extra)}">${inline(line.slice(3))}</h3>`;
  if (s.h4 && line.startsWith("### ")) return `<h4 style="${tinted(s.h4, extra)}">${inline(line.slice(4))}</h4>`;
  if (s.quote && line.startsWith("> ")) return `<div style="${tinted(s.quote, extra)}">${inline(line.slice(2))}</div>`;
  if (line.startsWith("- ")) return `<div style="${tinted(s.li, extra)}">• ${inline(line.slice(2))}</div>`;
  if (line.trim() === "") return "";
  return `<p style="${extra ? `${s.pStained ?? s.p};${extra}` : s.p}">${inline(line)}</p>`;
}
