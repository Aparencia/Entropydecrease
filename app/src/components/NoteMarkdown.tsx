/**
 * NoteMarkdown — 笔记阅读视图 Markdown 渲染（H5 自 NotesPage 拆分）。
 *
 * @ai-context: **react-markdown 站点 #1；批 7 T14 把站点 #2 `ChatMessageMarkdown`（52 行）并入本件
 *              后删除该文件 ⇒ 全站运行时站点 2 → 1、`remark-*`/`rehype-*` 站点 8 → 4**；判据 =
 *              `views/note/noteViews.test.tsx:281-286`（三条站点断言，见该文件的 N5）。原站点 #2 的
 *              三个消费点（`ChatMessageList.tsx:117` / `:146` · `TaskConversationView.tsx:189`）
 *              改为调用本件（`content` 槽，见下）。
 * @ai-context: **两模式、两棵渲染树，各自逐字保留**：① 笔记模式（`note` 槽 = 今天的形态**一字未改**）；
 *              ② 聊天模式（`content` 槽 = 并入前 `ChatMessageMarkdown` 的语义**逐字**）。T14 是
 *              **纯搬迁**（§C26.4 · §C9.19 第 1 条「只搬不改」）⇒ 两侧的 DOM 输出都必须**逐字节不变**：
 *              聊天侧保留它自己的 wrapper `<div>`、**三条** remark 插件（无荧光笔）、**默认** URL 消毒
 *              与自定 `code` 渲染件；笔记侧保留四条插件 + `noteUrlTransform` + 组件映射工厂。
 * @ai-context: **为什么不做「单路径 + `previewMaxChars?` / `codeRenderer?` 参数化」**（计划 Interfaces
 *              的原拟形态）：① 聊天侧入参是**裸字符串**、没有 `Note`（那一侧根本给不出 `note`/`searchQuery`
 *              /`onTaskToggle`/`onImageOpen` 四槽）；② 两侧的 `components` 映射、外层 wrapper、
 *              `urlTransform` 全都不同 ⇒ 参数化**必然**改掉其中一侧的 DOM 形态（C10.1 逐字禁止改渲染形态）
 *              ⇒ 并入的可行形态只能是「同一模块内两条渲染路径，各自逐字保留」。截断语义仍由调用方
 *              （`TaskConversationView`）用 `truncatePreview` 施加 —— 与并入前**同一处、同一默认值**，
 *              不在渲染器内部新增第二条截断路径（那会是行为改动，违反「只搬不改」）。
 * @ai-context: 站点判据是**按文件**的（`noteViews.test.tsx` 的 `edgesOf`）⇒ 本件里出现第二条
 *              `ReactMarkdown` 调用不改变该读数；但本件**仍只许有那 4 行** `remark-*`/`rehype-*` 说明符
 *              的 import（多一行会把插件站点读数抬高、污染 C8 的锚）。
 * @ai-context: 批 7 T13 拆件后，本件的 `components` 槽由 `noteMarkdownComponents.tsx` 的工厂产出
 *              （自定义渲染件与它们的闭包状态整段搬去那边）；T13 拆件的目的是给 T14 的并入腾头寸
 *              （拆前只剩 5 行余量）。
 * @ai-context: 集中全部自定义渲染：任务清单勾选回写（H1）、标题锚点（M5）、
 *              搜索高亮（M6）、时间戳回链（L6 radix）、图片/代码/表格样式。
 *              —— 逐条实现与修复背景见 `noteMarkdownComponents.tsx` 的同名 `@ai-context`。
 * @ai-context: 批 6 T26——`[[ts:ms]]` 的 ms 不再只进 title：新增**可选** `onOpenSessionAt` 把它逐字
 *              传出（缺省时与今天逐字相同；title 一字未改）。前置缺陷见 `noteUrlTransform`：
 *              `react-markdown@10.1.0` 的默认 URL 消毒把它清成空串 ⇒ 回链芯片此前从未渲染。
 */
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
// 批 7 T14：顶层 `katex` 的裸 CSS 说明符随聊天路径一并搬入本件（**不丢** —— 丢掉它 = 全站 `.katex`
// 排版掉样式；两侧都渲染 `.katex` 结点，而全仓只有这一条 CSS 边）。C20.1 的四形态普查按此读数。
import "katex/dist/katex.min.css";
import type { Note } from "../types";
import { remarkMarkHighlight } from "../utils/remarkMarkHighlight";
import { noteMarkdownComponents } from "./noteMarkdownComponents";

/**
 * `remarkPlugins` 槽的元素类型（= `react-markdown` 的 `Options["remarkPlugins"]` 的元素）。
 *
 * @ai-context 类型取自**已有的默认导入**，而不是再为 `Options` 写一行 import type：
 *   C8 的机器判据是「全站 `react-markdown` **运行时站点数不增加**（今天 2 处）」，而该判据的原始命令
 *   是**按行**匹配那个模块说明符（`tmp/t1/c8-markdown-sites.md` 逐字给了命令与读数）⇒ 多写一行
 *   import type 会把读数变成 3、污染 C8 的锚。`Parameters<typeof ReactMarkdown>[0]` 与之**语义等价**
 *   （`Markdown(options: Readonly<Options>)`，见 `react-markdown/lib/index.d.ts`），已由 `tsc` 与
 *   `views/note/noteViews.test.tsx` 的赋值断言双向钉住。
 */
export type RemarkPlugin = NonNullable<Parameters<typeof ReactMarkdown>[0]["remarkPlugins"]>[number];

/**
 * `components` 槽的类型（= `react-markdown` 的 `Components`）—— 与上一条**同手法**（取自已有的默认导入，
 * 不新增一行模块说明符）。批 7 T13 拆件后由 `noteMarkdownComponents.tsx` 经 **type-only import** 取用。
 *
 * @ai-context 为什么类型要从主件「反向」取：那个新件里**不许**出现 `react-markdown` 说明符（同上，
 *   否则运行时站点读数变 3）。`import type` 是编译期擦除的 ⇒ **无运行时循环依赖**，
 *   先例 `components/NoteListToolbar.tsx:16` 的 `import type { SortMode } from "./NoteListView"`。
 */
export type MarkdownComponents = NonNullable<Parameters<typeof ReactMarkdown>[0]["components"]>;

/**
 * **笔记模式**的入参与今天**逐字同义**（T14 未增删任何一项）。
 */
interface NoteModeProps {
  note: Note;
  /** 搜索关键词（空串=不高亮）——由 NoteReadingView 按 searchActive 门控传入 */
  searchQuery: string;
  onTaskToggle: (newContent: string) => void;
  onOpenSession?: (sessionId: number) => void;
  /** `[[ts:ms]]` 回链的**带毫秒**分支（批 6 T26 · R5.5 顺带④）：跳会话**并**把目标毫秒带出去。
   *  @ai-context 两参而不是 `onSeekMs(ms)`：ms 只在**知道哪条会话**时才有意义 ⇒ 会话 id 由本件补；
   *  缺省 ⇒ 退回既有 `onOpenSession(sessionId)`（两分支**互斥**，都调会重复导航；既有 6 条判据不动）。
   *  边界：定位精度受音频对齐的块粒度 **±200 ms** 限制（不得声称毫秒级定位）。 */
  onOpenSessionAt?: (sessionId: number, ms: number) => void;
  onImageOpen: (src: string, title?: string) => void;
  /**
   * **只许追加、不许替换**的 remark 插件槽（C8）。
   *
   * @ai-context 唯一消费者是笔记卡片流（`views/note/NoteCardFlowView`，批 5 T12）。追加项排在既有四条
   *   **之后**，而 transformer 型插件不参与词法（micromark 扩展在解析前注册）⇒ 既有 GFM / 数学 /
   *   荧光笔 / 换行四条语义一条不少（N6 的行为判据钉住）。缺省时 `?? []` ⇒ **不传即与今天逐字相同**
   *   （`NoteMarkdown.test.tsx` 的 6 条原样绿）。替换式覆盖（`remarkPlugins={remarkPluginsExtra}`）
   *   会同时动三条既有语义 ⇒ **禁止**。
   */
  remarkPluginsExtra?: readonly RemarkPlugin[];
}

/**
 * **聊天模式**的入参（批 7 T14 并入的站点 #2 形态）—— 只有一条：裸 markdown 文本。
 *
 * @ai-context 判据：这条槽的存在使得「3 个消费点改调 `NoteMarkdown`」不必伪造 `Note`。缺省不出现
 *   ⇒ 笔记模式的类型面**一字未变**（`note` 仍是必填）。
 */
interface ChatModeProps {
  content: string;
}

export type NoteMarkdownProps = NoteModeProps | ChatModeProps;

/**
 * `[[ts:ms]]` 回链的**内部锚点**语法 + URL 消毒的唯一出口（批 6 T26 实测）。
 *
 * @ai-context 为什么必须显式放行：href 到 hast 阶段是**百分号编码**的 `%5B%5Bts:52500%5D%5D`，
 *   而 `react-markdown@10.1.0` 的 `defaultUrlTransform` 把无协议 URL 一律清空 ⇒ 回链芯片此前
 *   **根本没渲染**（落成 `<a href="">⏱ 00:52</a>`，下面的 `tsMatch` 永不命中；比 R5.5 顺带④ 记的还坏）。
 *   安全面零放松：只放行这一种形态（解码回规范形），其余全交回默认消毒器；该 href 仅用于识别，最终渲染成 `<span>`。
 *   ⇄ 规范形的**匹配**在 `noteMarkdownComponents.tsx` 的 `TS_HREF_RE`（`a` 渲染件用）。
 *   ⚠️ 聊天模式**不走**它（并入前 `ChatMessageMarkdown` 也没有 `urlTransform`）：那一侧保留默认消毒器，
 *   否则 `[[ts:ms]]` 会在聊天里变成回链芯片 —— 那是**行为变化**，「只搬不改」不允许。
 */
const TS_HREF_ENCODED_RE = /^%5B%5Bts:(\d+)%5D%5D$/i;
const noteUrlTransform = (url: string): string => {
  const m = TS_HREF_ENCODED_RE.exec(url);
  return m ? `[[ts:${m[1]}]]` : defaultUrlTransform(url);
};

/**
 * 全站唯一的 markdown 渲染入口（批 7 T14 归一后的形态）。
 *
 * @ai-context 分派：`content` 槽 ⇒ 聊天模式（`ChatMarkdown`，并入前的站点 #2 逐字）；
 *   否则 ⇒ 笔记模式（今天的路径逐字）。**两模式不会互相切换**（同一调用点的槽固定）⇒
 *   `ChatMarkdown` 与笔记模式的 hooks（`noteMarkdownComponents` 工厂内的两个 `useMemo`/两个 `useRef`）
 *   各自在各自的分支里无条件执行，hooks 顺序与并入前**同序**。
 */
export default function NoteMarkdown(props: NoteMarkdownProps) {
  if ("content" in props) return <ChatMarkdown content={props.content} />;
  const { note, searchQuery, onTaskToggle, onOpenSession, onOpenSessionAt, onImageOpen, remarkPluginsExtra } = props;
  return (
    <ReactMarkdown
      // v0.15：remark-breaks——单换行（软换行）渲染为 <br>，与编辑态所见一致
      // （CommonMark 标准语义是软换行=空格，导致"编辑态换行、阅读态连上"；
      // 存量笔记内容零数据变更自动修复；`\` 与两空格强断行语义保留）
      remarkPlugins={[remarkGfm, remarkMath, remarkMarkHighlight, remarkBreaks, ...(remarkPluginsExtra ?? [])]}
      rehypePlugins={[rehypeKatex]}
      // 批 6 T26：放行内部 `[[ts:ms]]` 锚点（默认消毒器会清空它 ⇒ 回链芯片曾整条不可达；
      // 见 `noteUrlTransform`）。**不是**放松消毒：其余 URL 仍走 `defaultUrlTransform`。
      urlTransform={noteUrlTransform}
      // 批 7 T13：自定义渲染件整段搬到 `noteMarkdownComponents.tsx`（工厂吃同一组上下文；
      // 工厂在渲染体内无条件调用恰一次 ⇒ 其内部 hooks 与搬迁前同序）
      components={noteMarkdownComponents({ note, searchQuery, onTaskToggle, onOpenSession, onOpenSessionAt, onImageOpen })}
    >
      {note.content}
    </ReactMarkdown>
  );
}

/* ------------------------------------------------------------------------------------------------
 * 以下为批 7 T14 并入的**站点 #2**（原 `components/ChatMessageMarkdown.tsx`，52 行）：
 * 组件体、`PREVIEW_MAX_CHARS` 与 `truncatePreview` **逐字**搬来（只去缩进/改组件名与可见性），
 * 语义一字未改 —— 证据 = 并入前/后两棵树的渲染输出逐字节对拍（§C26.4，探针在 `tmp/t14/`）。
 * ---------------------------------------------------------------------------------------------- */

/** 深度预览截断（轨迹/结果展开用——长文不撑爆 DOM） */
export const PREVIEW_MAX_CHARS = 2000;

export function truncatePreview(text: string, max: number = PREVIEW_MAX_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n…（内容过长已截断，仅展示前 ${max} 字符）`;
}

/**
 * 聊天消息的渲染体（并入前 = `ChatMessageMarkdown` 的默认导出）。
 *
 * @ai-context: 聊天渲染专用轻量栈（GFM + 数学 + 换行），**不复用**笔记域的组件映射
 *              （那是笔记域——任务勾选回写/时间戳回链/图片组件耦合笔记上下文）；
 *              聊天消息无这些语义，保持渲染器单一职责。
 * @ai-context 为什么保留独立 wrapper `<div>`：并入前它就带 `fontSize: 13.5 / lineHeight: 1.7 /
 *              wordBreak: break-word`，而笔记模式**不套 wrapper**（`NoteMarkdown.test.tsx:89` 甚至
 *              断言根下无 `div`）⇒ 两者不能共用一层。
 */
function ChatMarkdown({ content }: ChatModeProps) {
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.7, wordBreak: "break-word" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code: ({ className, children }) => {
            const isBlock = className?.includes("language-");
            const text = String(children).replace(/\n$/, "");
            if (isBlock) {
              return (
                <pre style={{ background: "#f6f8fa", padding: 10, borderRadius: 6, overflowX: "auto" }}>
                  <code className={className}>{text}</code>
                </pre>
              );
            }
            return <code style={{ background: "#f1f5f9", padding: "1px 4px", borderRadius: 4 }}>{text}</code>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
