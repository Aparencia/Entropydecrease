/**
 * NoteMarkdown — 笔记阅读视图 Markdown 渲染（H5 自 NotesPage 拆分）。
 *
 * @ai-context: **react-markdown 站点 #1**（全站运行时站点恰 2，另一个是 `ChatMessageMarkdown`；
 *              判据 `views/note/noteViews.test.tsx:281-286`）。批 7 T13 拆件后本件只留
 *              「四条 remark 插件 + rehype-katex + URL 消毒 + 组件映射装配」这四件事，
 *              自定义渲染件与它们的闭包状态**整段**搬进 `noteMarkdownComponents.tsx`（工厂形态）——
 *              拆件的唯一目的是给 T14 的「#2 并入 #1」腾出净增头寸（本件拆前只剩 5 行余量）。
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

interface Props {
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
 * `[[ts:ms]]` 回链的**内部锚点**语法 + URL 消毒的唯一出口（批 6 T26 实测）。
 *
 * @ai-context 为什么必须显式放行：href 到 hast 阶段是**百分号编码**的 `%5B%5Bts:52500%5D%5D`，
 *   而 `react-markdown@10.1.0` 的 `defaultUrlTransform` 把无协议 URL 一律清空 ⇒ 回链芯片此前
 *   **根本没渲染**（落成 `<a href="">⏱ 00:52</a>`，下面的 `tsMatch` 永不命中；比 R5.5 顺带④ 记的还坏）。
 *   安全面零放松：只放行这一种形态（解码回规范形），其余全交回默认消毒器；该 href 仅用于识别，最终渲染成 `<span>`。
 *   ⇄ 规范形的**匹配**在 `noteMarkdownComponents.tsx` 的 `TS_HREF_RE`（`a` 渲染件用）。
 */
const TS_HREF_ENCODED_RE = /^%5B%5Bts:(\d+)%5D%5D$/i;
const noteUrlTransform = (url: string): string => {
  const m = TS_HREF_ENCODED_RE.exec(url);
  return m ? `[[ts:${m[1]}]]` : defaultUrlTransform(url);
};

export default function NoteMarkdown({ note, searchQuery, onTaskToggle, onOpenSession, onOpenSessionAt, onImageOpen, remarkPluginsExtra }: Props) {
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
