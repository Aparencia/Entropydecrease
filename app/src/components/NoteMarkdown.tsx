/**
 * NoteMarkdown — 笔记阅读视图 Markdown 渲染（H5 自 NotesPage 拆分）。
 *
 * @ai-context: 集中全部自定义渲染：任务清单勾选回写（H1）、标题锚点（M5）、
 *              搜索高亮（M6）、时间戳回链（L6 radix）、图片/代码/表格样式。
 * @ai-context: H1 修复——勾选 checkbox 只改目标行：渲染时按出现顺序计数，
 *              第 n 个 checkbox 对应源文本第 n 个任务行（taskLineIndices）。
 *              原实现 lines.map 匹配全部同态行 → 勾选任一即全翻转（数据损坏）；
 *              且持久化 createVersion: true 保留可回滚快照（由父组件执行）。
 * @ai-context: M6 修复——搜索高亮纯数据驱动：渲染层按关键词 split 文本输出
 *              <mark> 片段（同 SessionListPanel 模式），替代 TreeWalker 直改
 *              React 托管 DOM（surroundContents 与虚拟 DOM 协调冲突）。
 * @ai-context: M5 修复——标题行号索引渲染前 useMemo 一次预计算（Map + 出现
 *              序号消歧同名标题），替代每个标题 O(n) findIndex + as string 断言。
 * @ai-context: 批 6 T26——`[[ts:ms]]` 的 ms 不再只进 title：新增**可选** `onOpenSessionAt` 把它逐字
 *              传出（缺省时与今天逐字相同；title 一字未改）。前置缺陷见 `noteUrlTransform`：
 *              `react-markdown@10.1.0` 的默认 URL 消毒把它清成空串 ⇒ 回链芯片此前从未渲染。
 */
import { isValidElement, cloneElement, useMemo, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Note } from "../types";
import { remarkMarkHighlight } from "../utils/remarkMarkHighlight";
import NoteImage from "./NoteImage";

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
 */
const TS_HREF_RE = /^\[\[ts:(\d+)\]\]$/;
const TS_HREF_ENCODED_RE = /^%5B%5Bts:(\d+)%5D%5D$/i;
const noteUrlTransform = (url: string): string => {
  const m = TS_HREF_ENCODED_RE.exec(url);
  return m ? `[[ts:${m[1]}]]` : defaultUrlTransform(url);
};

/** 递归展平 React 子节点为纯文本（ReactNode 收窄——替代 as string 断言） */
function flattenText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (isValidElement(node)) {
    const children = (node.props as { children?: ReactNode }).children;
    return flattenText(children);
  }
  return "";
}

/**
 * 数据驱动搜索高亮：递归遍历 children，字符串叶子按关键词（大小写不敏感）
 * split 并插入 <mark> 片段；元素节点 clone 后继续下钻。不触碰真实 DOM。
 */
function highlightNode(node: ReactNode, query: string): ReactNode {
  if (!query) return node;
  const lower = query.toLowerCase();

  const walk = (n: ReactNode, keyPrefix: string): ReactNode => {
    if (typeof n === "string") {
      const parts: ReactNode[] = [];
      let rest = n;
      let seq = 0;
      let idx = rest.toLowerCase().indexOf(lower);
      while (idx >= 0) {
        if (idx > 0) parts.push(rest.slice(0, idx));
        parts.push(
          <mark
            key={`${keyPrefix}-h${seq++}`}
            data-note-search-hit=""
            style={{ background: "#fde68a", borderRadius: 2, padding: "0 1px" }}
          >
            {rest.slice(idx, idx + query.length)}
          </mark>,
        );
        rest = rest.slice(idx + query.length);
        idx = rest.toLowerCase().indexOf(lower);
      }
      if (rest) parts.push(rest);
      // 边界修复：文本整体等于关键词时 parts 仅含 1 个 <mark>（length===1），
      // 原 `length > 1 ? <>...</> : n` 会退回原始未高亮字符串（高亮丢失+计数漏计）
      if (parts.length === 0) return n;
      return parts.length === 1 ? parts[0] : <>{parts}</>;
    }
    if (Array.isArray(n)) return n.map((c, i) => walk(c, `${keyPrefix}-${i}`));
    if (isValidElement(n)) {
      // 收窄为带 children 的元素类型（ReactMarkdown 产出的节点均含 children）
      const el = n as ReactElement<{ children?: ReactNode }>;
      return cloneElement(el, { children: walk(el.props.children, keyPrefix) });
    }
    return n;
  };

  return walk(node, "hl");
}

export default function NoteMarkdown({ note, searchQuery, onTaskToggle, onOpenSession, onOpenSessionAt, onImageOpen, remarkPluginsExtra }: Props) {
  // H1：任务行索引（源文本中每个任务行的行号，按出现顺序）
  // 正则与 remark-gfm 清单语法对齐：-/*/+ 无序 + 有序列表（\d{1,9}[.)]），
  // 勾选框大小写均认（[x]/[X]）——否则渲染序号与索引数组错位会写错行
  const taskLineRegex = /^\s*(?:[-*+]|\d{1,9}[.)])\s+\[[ xX]\]/;
  const taskLineIndices = useMemo(() => {
    const idxs: number[] = [];
    note.content.split("\n").forEach((line, i) => {
      if (taskLineRegex.test(line)) idxs.push(i);
    });
    return idxs;
  }, [note.content]);

  // M5：标题文本→行号索引一次预计算（key=`级别:文本`，同名标题按出现序消歧）
  const headingIndexMap = useMemo(() => {
    const map = new Map<string, number[]>();
    note.content.split("\n").forEach((line, i) => {
      const m = line.match(/^(#{1,6})\s+(.+)/);
      if (m) {
        const key = `${m[1].length}:${m[2].trim()}`;
        const arr = map.get(key);
        if (arr) arr.push(i);
        else map.set(key, [i]);
      }
    });
    return map;
  }, [note.content]);

  // 渲染期计数器（每次渲染先清零——react-markdown 按源顺序同步渲染子节点）
  const taskCounterRef = useRef(0);
  const headingOccRef = useRef(new Map<string, number>());
  taskCounterRef.current = 0;
  headingOccRef.current.clear();

  /** 标题锚点 id（M5：查预计算索引 + 出现序号消歧） */
  const headingId = (level: number, children: ReactNode): string | undefined => {
    const key = `${level}:${flattenText(children).trim()}`;
    const occ = headingOccRef.current.get(key) ?? 0;
    headingOccRef.current.set(key, occ + 1);
    const idx = headingIndexMap.get(key)?.[occ];
    return idx != null ? `heading-${idx}` : undefined;
  };

  /** checkbox 勾选回写（H1：仅替换目标行索引） */
  const handleTaskChange = (order: number, checked: boolean) => {
    const targetIdx = taskLineIndices[order];
    if (targetIdx == null) return;
    const lines = note.content.split("\n");
    const line = lines[targetIdx];
    // 防御：该行若已不是任务行（渲染与内容不同步），放弃而非误改
    if (!taskLineRegex.test(line)) return;
    // 字符级替换：只动勾选框本身，兼容 [x]/[X] 与任意清单标记（-/*+/有序）
    lines[targetIdx] = checked
      ? line.replace(/\[[ xX]\]/, "[x]")
      : line.replace(/\[[xX]\]/, "[ ]");
    onTaskToggle(lines.join("\n"));
  };

  const hl = (children: ReactNode): ReactNode => highlightNode(children, searchQuery);

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
      components={{
        // v0.14 B：==文本== 荧光笔（remark 插件产出 mdast mark 节点 + hName/hProperties）
        // v0.16.1：多色——className 由插件注入（note-mark[-{colorId}]，样式见 note-mark.css）；
        //          原实现硬编码单色黄（且无 hName 经 defaultUnknownHandler 落 div——
        //          组件按 hast tagName 匹配实际从未命中，现由插件 hName 修复）
        mark: ({ node, className, children, ...props }) => (
          <mark className={className} {...props}>{hl(children)}</mark>
        ),
        // 任务清单勾选（H1：渲染时记录序号 → 仅替换对应源行）
        input: ({ node, ...props }) => {
          const order = taskCounterRef.current++;
          return <input {...props} onChange={(e) => handleTaskChange(order, e.target.checked)} />;
        },
        // 标题锚点供大纲跳转（M5：预计算索引，无 as string 断言）
        h1: ({ node, children, ...props }) => (
          <h1 id={headingId(1, children)} {...props} style={{ fontSize: 20, margin: "16px 0 8px", borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>{hl(children)}</h1>
        ),
        h2: ({ node, children, ...props }) => (
          <h2 id={headingId(2, children)} {...props} style={{ fontSize: 17, margin: "14px 0 6px" }}>{hl(children)}</h2>
        ),
        h3: ({ node, children, ...props }) => (
          <h3 id={headingId(3, children)} {...props} style={{ fontSize: 15, margin: "12px 0 4px", color: "#374151" }}>{hl(children)}</h3>
        ),
        h4: ({ node, children, ...props }) => <h4 id={headingId(4, children)} {...props}>{hl(children)}</h4>,
        h5: ({ node, children, ...props }) => <h5 id={headingId(5, children)} {...props}>{hl(children)}</h5>,
        h6: ({ node, children, ...props }) => <h6 id={headingId(6, children)} {...props}>{hl(children)}</h6>,
        p: ({ node, children, ...props }) => <p {...props}>{hl(children)}</p>,
        li: ({ node, children, ...props }) => <li {...props}>{hl(children)}</li>,
        // 时间戳回链渲染（P1/A5 预览预备；L6：parseInt 补 radix 10）
        a: ({ node, href, children, ...props }) => {
          const tsMatch = href?.match(TS_HREF_RE);
          if (tsMatch) {
            const ms = parseInt(tsMatch[1], 10);
            const sec = Math.floor(ms / 1000);
            const min = Math.floor(sec / 60);
            const secStr = String(sec % 60).padStart(2, "0");
            return (
              <span
                style={{ cursor: "pointer", color: "#0d9488", borderBottom: "1px dashed #14b8a6", background: "#f0fdfa", borderRadius: 3, padding: "0 4px" }}
                onClick={() => {
                  if (!note.session_id) return;
                  // T26：带 ms 的分支优先（ms 逐字传出，不截断）；缺省退回既有单参回调
                  if (onOpenSessionAt) onOpenSessionAt(note.session_id, ms);
                  else onOpenSession?.(note.session_id);
                }}
                title={`⏱ 跳转到会话 ${Math.floor(ms / 60000)}:${secStr} 处 —— 点击查看视频对应片段`}
              >
                ⏱ {min}:{secStr}
              </span>
            );
          }
          return <a href={href} {...props} style={{ color: "#2563eb" }}>{hl(children)}</a>;
        },
        // 代码块（inline 高亮走字符串叶子 split）
        code: ({ node, className, children, ...props }) => {
          const isInline = !className;
          if (isInline) {
            return <code style={{ background: "#f3f4f6", padding: "1px 4px", borderRadius: 3, fontSize: 13 }} {...props}>{hl(children)}</code>;
          }
          return (
            <pre style={{ background: "#1f2937", color: "#e5e7eb", borderRadius: 6, padding: 12, overflowX: "auto", fontSize: 13 }}>
              <code className={className} {...props}>{children}</code>
            </pre>
          );
        },
        // 表格
        table: ({ node, ...props }) => (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }} {...props} />
          </div>
        ),
        th: ({ node, children, ...props }) => <th style={{ border: "1px solid #d1d5db", padding: "6px 10px", background: "#f9fafb", fontWeight: 600 }} {...props}>{hl(children)}</th>,
        td: ({ node, children, ...props }) => <td style={{ border: "1px solid #d1d5db", padding: "6px 10px" }} {...props}>{hl(children)}</td>,
        // 图片（v0.10.1：本地相对引用经 resolve+convertFileSrc，点击放大；外部 URL 直出）
        img: ({ src, alt }) => (
          <NoteImage src={src ?? ""} alt={alt ?? ""} noteId={note.id} onOpen={(url, title) => onImageOpen(url, title)} />
        ),
        // 引用
        blockquote: ({ node, children, ...props }) => (
          <blockquote style={{ borderLeft: "3px solid #0d9488", margin: "8px 0", padding: "4px 12px", color: "#6b7280", background: "#f9fafb" }} {...props}>{hl(children)}</blockquote>
        ),
      }}
    >
      {note.content}
    </ReactMarkdown>
  );
}
