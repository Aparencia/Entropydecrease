// @vitest-environment jsdom
/**
 * noteViews.test.tsx — 笔记「卡片流」视图 + 结构派生器的**行为级契约**（批 5 · T12 · C8/C14/C15）。
 *
 * @ai-context 判据编号照计划 Task 12 Step 3 的 N1–N7 逐条兑现。
 *   **C14② 要求「每个视图组件的第一条判据是不 invoke」⇒ 本文件 `it` 的物理首条是 N7。**
 *   N7 不 invoke 且不带 Tauri：(a) 行为面 = 渲染两条路径（非空 / 空内容）后注入的 `invoke` spy 零调用；
 *      (b) 源码面 = `views/**` **生产文件**的 `@tauri-apps` 模块说明符 0 处（含 `import type`）；
 *      (c) **阳性对照** = 本地图片引用经既有 `NoteMarkdown → NoteImage` **确实**调用
 *      `invoke("resolve_note_image")` ⇒ 既证明 spy 有牙（「0 调用」不是空真），又如实披露这条**继承**边。
 *   N1 卡片数 = **顶层块数**（`## 标题` + 2 段 + 1 列表 + 1 代码块 ⇒ 5），并断言种类**序列**。
 *   N2 嵌套不加类：`>` 引用块内的 `<p>` 不带 `data-card-kind`（顶层才带；同树的顶层 `p` 作阳性对照）。
 *   N3 卡片类走 `Surface` 族：每个卡片节点含 `ed-surface` / `ed-surface--bordered`，且类名集合与
 *      `<Surface level="surface" radius="panel" bordered padded>` **逐字相等**（防两处各写一份而漂移）。
 *   N4 `cardKindOf` 纯函数：4 条映射 + 未知 tag ⇒ `other`（+ mdast 侧同表 + 恒等性）。
 *   N5 C8 防「3 套变 4 套」：全站 `react-markdown` **运行时站点 == 2**（且是两个具名文件）；
 *      `remark-*` / `rehype-*` 站点数不变（8 处、同样两个文件）；`views/**` 含 `import type` 在内 0 站点。
 *   N6 不改既有语义：① 不传 `remarkPluginsExtra` ⇒ 0 张卡（缺省不生效）；② 传了也**不替换**既有链
 *      （`<br>` / GFM 表格 / `mark.note-mark-red` / `.katex` 四条同时在场）；③ 既有 6 用例在
 *      `NoteMarkdown.test.tsx` 里原样绿（V1 同批跑，本文件不复制它们）。
 * @ai-context 仪器边界：jsdom **不是真浏览器** —— 卡片的密度 / 断行 / 观感属 C15 的「只登记」项
 *   （见 T12 报告 §未验证）。本文件只断言 DOM 事实。
 * @ai-context 域口径（两条纪律的两半）：`@tauri-apps` 的源码扫描**排除 `*.test.tsx`** —— 本文件必须写出
 *   `vi.mock("@tauri-apps/api/core", …)` 的模块 id 字面量，不排除就会**被自己的 mock 行弄红**；
 *   `react-markdown` 的站点扫描相反是**全量含测试**，故本文件用 `RM_ID` 片段拼出模块 id，
 *   源码里不出现该字面量（避免判据在自身源码里自命中）。
 * 副作用：只挂 React 树 + 只读 `app/src/**` 与一个阳性对照文件；不写盘、不发请求。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../../types";
import type { RemarkPlugin } from "../../components/NoteMarkdown";
import { Surface } from "../../ui/primitives";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  // 只给阳性对照用：解析成功路径渲染 `<img>`（失败占位是 `<div>`，嵌在 `<p>` 里会触发 React 的
  // DOM 嵌套告警 —— 那是 `NoteImage` 既有形态，与本任务无关，不该混进本文件的输出）
  convertFileSrc: (abs: string) => `asset://localhost/${abs}`,
}));

import NoteMarkdown from "../../components/NoteMarkdown";
import NoteCardFlowView from "./NoteCardFlowView";
import { CARD_SURFACE_CLASSES, cardKindOf, noteCardPlugin } from "./noteCardModel";

const HERE = dirname(fileURLToPath(import.meta.url));
/** `app/src`（与全仓四支棘轮的域根同源） */
const SRC = join(HERE, "..", "..");
const VIEWS = join(SRC, "views");
/** 模块 id 由**片段拼出**：判据不许在自身源码里自命中（自引用空真） */
const RM_ID = ["react", "markdown"].join("-");
const PLUGIN_PKG = /["'](remark|rehype)-[^"']+["']/g;

const noop = () => {};

function noteOf(content: string): Note {
  return {
    id: 1, title: "标题", content, source: "session", session_id: 42, rule_version: null, purify_stats: null,
    tags: "[]", properties: null, pin: 0, group_id: null, created_at: 1, updated_at: 2,
  };
}
const slot = (content: string) => ({ note: noteOf(content), onTaskToggle: noop, onImageOpen: noop });
/** 渲染卡片流并返回容器（`cleanup` 由 afterEach 统一做） */
const mount = (content: string): HTMLElement => render(<NoteCardFlowView {...slot(content)} />).container;
const cardsOf = (root: Element): Element[] => [...root.querySelectorAll("[data-card-kind]")];
const kindsOf = (root: Element): string[] => cardsOf(root).map((e) => e.getAttribute("data-card-kind") ?? "");

/** N1 夹具（逐字照计划：`## 标题` + 2 段 + 1 列表 + 1 代码块 = 5 个顶层块） */
const N1_MD = ["## 标题", "", "甲段。", "", "乙段。", "", "- 项一", "- 项二", "", "```ts", "const a = 1;", "```"].join("\n");
/** N6② 夹具：四条既有语义各一处（软换行 / 荧光笔 / 数学 / GFM 表格）⇒ 顶层块 = 4 */
const N6_MD = ["甲行\n乙行", "", "==[red]重点==", "", "$E=mc^2$", "", "| A | B |", "| - | - |", "| 1 | 2 |"].join("\n");

/** 剥注释（状态机；字符串内的 `//` 不动）。与 `ui/primitives/sliceScan.ts` 同口径的最小实现 —— 不在
 *  调用点深导入原语内部模块（ADR-033 §1）。 */
function stripComments(src: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < src.length; i += 1) {
    const c = src.charAt(i);
    const next = src.charAt(i + 1);
    if (quote !== null) {
      out += c;
      if (c === "\\" && next !== undefined) { out += next; i += 1; }
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") { quote = c; out += c; }
    else if (c === "/" && next === "/") { while (i < src.length && src.charAt(i) !== "\n") i += 1; out += "\n"; }
    else if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src.charAt(i) === "*" && src.charAt(i + 1) === "/")) i += 1;
      i += 1;
    } else out += c;
  }
  return out;
}
/** `views/**`（或任意目录）下的 `.ts`/`.tsx` 绝对路径 */
function sourcesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourcesUnder(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}
const relOf = (abs: string): string => abs.slice(SRC.length + 1).replace(/\\/g, "/");
/** `@tauri-apps/*` 的 **import 边**（**先剥注释**）。只认 `from "…"` / `import "…"` / `import(…)` / `require(…)`
 *  声明 —— 注释提及与**裸字符串**都不算边（T7 的 #49：用 `includes()` 扫字面量时，规范地写着
 *  「此处零 `@tauri-apps` import」的注释反而把三个生产文件弄成假红）。 */
const TAURI_EDGE =
  /\bfrom\s*["'](@tauri-apps\/[^"']*)["']|\b(?:import|require)\s*\(\s*["'](@tauri-apps\/[^"']*)["']|\bimport\s*["'](@tauri-apps\/[^"']*)["']/g;
const tauriEdgesIn = (source: string): string[] =>
  [...stripComments(source).matchAll(TAURI_EDGE)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
/** 测试侧的 mdast 最小形状（与被测模块**自声明**的那份结构同构，故可直接喂给插件） */
interface AstBlock {
  type?: string;
  value?: string;
  data?: { hName?: string; hChildren?: unknown[]; hProperties?: Record<string, unknown>; [key: string]: unknown };
  children?: AstBlock[];
}

/** 一行里对某个包 id 的 import 边（`type` = 仅类型；裸字符串不算边） */
interface Edge { readonly line: number; readonly kind: "runtime" | "type" | "dynamic" }
function edgesOf(source: string, id: string): Edge[] {
  const quoted = [`"${id}"`, `'${id}'`];
  const out: Edge[] = [];
  stripComments(source).split(/\r?\n/).forEach((line, i) => {
    if (!quoted.some((q) => line.includes(q))) return;
    if (/\b(?:import|require)\s*\(/.test(line)) out.push({ line: i + 1, kind: "dynamic" });
    else if (/^\s*import\s+type\b/.test(line)) out.push({ line: i + 1, kind: "type" });
    else if (/^\s*import\b/.test(line) || /\bfrom\s*["']/.test(line)) out.push({ line: i + 1, kind: "runtime" });
  });
  return out;
}
/** 一行里对某个包前缀（`remark-` / `rehype-`）的 import 边 */
const pluginEdgesIn = (source: string): string[] =>
  stripComments(source).split(/\r?\n/).filter((line) => (/\bfrom\s*["']/.test(line) || /^\s*import\b/.test(line)))
    .flatMap((line) => [...line.matchAll(PLUGIN_PKG)].map((m) => m[0].slice(1, -1)));

beforeEach(() => { invokeMock.mockReset(); });
afterEach(cleanup);

describe("N7 不 invoke 且不带 Tauri（C14② 的第一条判据）", () => {
  it("N7① 两条渲染路径 ⇒ invoke 零调用；N7② views/** 生产文件 0 个 @tauri-apps 说明符；N7③ 阳性对照", async () => {
    // ★ 两个面各自收集问题、最后一次性断言：硬 `expect` 会在第一个面上中止 ⇒ 第二个面拿不到读数。
    const problems: string[] = [];
    const nonEmpty = cardsOf(mount(N1_MD)).length;
    cleanup();
    mount(""); // 空内容路径也要渲染一遍：两条路径都不许取数
    cleanup();
    if (nonEmpty !== 5 || invokeMock.mock.calls.length > 0) {
      problems.push(`① 不 invoke：渲染出 ${nonEmpty} 张卡，却调用了 invoke ${invokeMock.mock.calls.length} 次`);
    }

    const prod = sourcesUnder(VIEWS).filter((p) => !/\.test\.tsx?$/.test(p));
    expect(prod.length, "views/** 生产文件数为 0（域过滤失效 ⇒ 判据空真）").toBeGreaterThan(0);
    expect(prod.some((p) => p.endsWith("NoteCardFlowView.tsx")), "被测文件自己不在扫描域里").toBe(true);
    const hits = prod.filter((p) => tauriEdgesIn(readFileSync(p, "utf8")).length > 0).map(relOf);
    if (hits.length > 0) problems.push(`② 不带 Tauri：views/** 出现 @tauri-apps import 边 -> ${hits.join(", ")}`);

    // 仪器自证（这几条不并入 `problems`：它们证明扫描器可信，不是被测对象的行为）
    const positiveSrc = readFileSync(join(SRC, "components", "session-detail", "SessionScreenCards.tsx"), "utf8");
    expect(tauriEdgesIn(positiveSrc), "阳性对照没命中 ⇒ 扫描器不可信（0 命中不算数）").toEqual(["@tauri-apps/api/core"]);
    expect(tauriEdgesIn('// import type { X } from "@tauri-apps/api/webviewWindow";'), "注释里的提及被当成 import 边").toEqual([]);
    expect(tauriEdgesIn('const s = "本层零 @tauri-apps/api 依赖";'), "裸字符串被当成 import 边（#49 的假红通道）").toEqual([]);
    expect(tauriEdgesIn('import type { W } from "@tauri-apps/api/webviewWindow";'), "`import type` 没被算成边（C14② 明文要求含它）").toEqual(["@tauri-apps/api/webviewWindow"]);
    expect(tauriEdgesIn('const m = await import("@tauri-apps/api/core");'), "动态 import 漏扫").toEqual(["@tauri-apps/api/core"]);

    // ③ 阳性对照 + 继承边披露：本地图片引用走既有的 NoteMarkdown → NoteImage 解析（本任务零改动）
    //    夹具用**列表项**（不是段落）：`NoteImage` 的加载占位是 `<div>`，嵌进 `<p>` 会触发 React 的
    //    DOM 嵌套告警（`NoteImage` 既有形态，与本任务无关）—— 放进 `<li>` 则合法，输出保持干净。
    invokeMock.mockClear();
    invokeMock.mockResolvedValue("C:\\data\\session-images\\a.png");
    await act(async () => { render(<NoteCardFlowView {...slot("- ![图](session-images/a.png)")} />); });
    cleanup();
    expect(invokeMock.mock.calls.map((c) => c[0]), "阳性对照没命中 ⇒ invoke spy 无牙（上面的 0 调用不算数）")
      .toContain("resolve_note_image");

    expect(problems, "「不 invoke 且不带 Tauri」的两个面各自独立成立").toEqual([]);
  });
});

describe("N1 / N2 卡片结构：顶层成卡、嵌套不加类", () => {
  it("N1 卡片数 = 顶层块数（5）且种类序列 = heading/para/para/list/code；换夹具计数跟着变", () => {
    expect(kindsOf(mount(N1_MD))).toEqual(["heading", "para", "para", "list", "code"]);
    cleanup();
    // 反例守卫：把「5」写死的实现会在这里红（顶层块只有 2 个）
    expect(kindsOf(mount("## 标题\n\n只有一段。"))).toEqual(["heading", "para"]);
  });

  it("N2 引用块内的 <p> 不带 data-card-kind / 不带 ed-surface（嵌套不成卡）", () => {
    const container = mount(["> 引用首段", ">", "> 引用次段", "", "正文段落。"].join("\n"));
    const bq = container.querySelector("blockquote");
    expect(bq?.getAttribute("data-card-kind"), "顶层引用块本身必须是卡片").toBe("quote");
    const nested = [...(bq?.querySelectorAll("p") ?? [])];
    expect(nested, "夹具自证：引用块内确有 2 个段落").toHaveLength(2);
    expect(nested.filter((p) => p.hasAttribute("data-card-kind"))).toEqual([]);
    expect(nested.filter((p) => p.classList.contains("ed-surface"))).toEqual([]);
    // 阳性对照：同一棵树里的**顶层** p 带着标记 ⇒ 上面的 0 不是空扫
    expect(container.querySelectorAll("p[data-card-kind='para']")).toHaveLength(1);
  });
});

describe("N3 卡片类走 Surface 族（不新写 CSS）", () => {
  it("每个卡片节点含 ed-surface / ed-surface--bordered；类名集合 == <Surface level=surface radius=panel bordered padded>", () => {
    const cards = cardsOf(mount(N1_MD));
    expect(cards).toHaveLength(5);
    for (const c of cards) {
      expect(c.classList.contains("ed-surface"), `${c.tagName} 缺 ed-surface`).toBe(true);
      expect(c.classList.contains("ed-surface--bordered"), `${c.tagName} 缺 ed-surface--bordered`).toBe(true);
    }
    cleanup();
    const { container } = render(<Surface level="surface" radius="panel" bordered padded>底</Surface>);
    const surfaceEl = container.querySelector(".ed-surface");
    expect(surfaceEl, "Surface 一个面都没渲染出来 ⇒ 对拍无效").not.toBeNull();
    expect([...CARD_SURFACE_CLASSES].sort(), "卡片类族与原语 Surface 的类名漂移了（两处各写一份 ⇒ 必红）")
      .toEqual(Array.from(surfaceEl?.classList ?? []).sort());
  });
});

describe("N4 noteCardModel：纯函数（AAA 可单测）", () => {
  it("cardKindOf：h2→heading · ul→list · pre→code · 未知→other（+ mdast 侧同表 + 恒等性）", () => {
    expect(cardKindOf("h2")).toBe("heading");
    expect(cardKindOf("ul")).toBe("list");
    expect(cardKindOf("pre")).toBe("code");
    expect(cardKindOf("molestiae-unknown")).toBe("other");
    // 插件实际吃的是 mdast 节点类型 ⇒ 同表必须覆盖 mdast 侧
    expect(["heading", "paragraph", "list", "blockquote", "code", "table", "thematicBreak", "image"].map(cardKindOf))
      .toEqual(["heading", "para", "list", "quote", "code", "table", "rule", "media"]);
    // 纯函数：同入参恒同出参（无记忆、不读外部状态）
    expect([cardKindOf("table"), cardKindOf("table"), cardKindOf("h5")]).toEqual(["table", "table", "heading"]);
  });

  it("插件只改**顶层**：顶层块挂类与 data-card-kind，嵌套节点逐字不变；已有 className 合并不覆盖", () => {
    const nested: AstBlock = { type: "paragraph", children: [{ type: "text", value: "嵌套" }] };
    const top: AstBlock = { type: "heading" };
    const tree: AstBlock = { children: [top, { type: "blockquote", children: [nested] }] };
    const nestedBefore = JSON.stringify(nested);
    noteCardPlugin()(tree);
    expect(top.data?.hProperties).toEqual({ className: [...CARD_SURFACE_CLASSES], "data-card-kind": "heading" });
    expect(JSON.stringify(nested), "嵌套节点被改写了（改成递归遍历 ⇒ 卡中卡）").toBe(nestedBefore);
    // 合并不覆盖：`remark-math` 的 `math math-display` 必须留在卡片类**之后**（否则 KaTeX 失效）
    const math: AstBlock = { type: "math", data: { hProperties: { className: ["math", "math-display"] } } };
    noteCardPlugin()({ children: [math] });
    expect(math.data?.hProperties?.className).toEqual([...CARD_SURFACE_CLASSES, "math", "math-display"]);
    expect(math.data?.hProperties?.["data-card-kind"]).toBe("other");
    // 防御：非树入参不抛（插件可能拿到空树）
    expect(() => noteCardPlugin()(undefined)).not.toThrow();
  });

  it("类型面：noteCardPlugin 满足 NoteMarkdown 的 remarkPluginsExtra 槽（C8 的 RemarkPlugin）", () => {
    const asSlot: RemarkPlugin = noteCardPlugin;
    expect(typeof asSlot).toBe("function");
  });
});

describe("N6 不改既有语义（只追加、不替换）", () => {
  it("N6① 不传新槽 ⇒ 0 张卡；N6② 传了也保留 breaks/GFM/荧光笔/数学四条既有语义", () => {
    const plain = render(<NoteMarkdown note={noteOf(N1_MD)} searchQuery="" onTaskToggle={noop} onImageOpen={noop} />).container;
    expect(plain.querySelectorAll("[data-card-kind]"), "缺省也成卡 ⇒ 槽不是「只追加」").toHaveLength(0);
    expect(plain.querySelectorAll(".ed-surface"), "缺省也带了卡片类 ⇒ 槽污染了既有渲染").toHaveLength(0);
    cleanup();

    const { container } = render(<NoteCardFlowView {...slot(N6_MD)} />);
    const problems: string[] = [];
    if (!container.querySelector("br")) problems.push("remark-breaks 失效（软换行没成 <br>）");
    if (!container.querySelector("table")) problems.push("remark-gfm 失效（表格没渲染）");
    if (!container.querySelector("mark.note-mark.note-mark-red")) problems.push("remarkMarkHighlight 失效（==[red]== 没成 mark）");
    if (!container.querySelector(".katex")) problems.push("remark-math + rehype-katex 失效（数学没成 .katex）");
    if (cardsOf(container).length !== 4) problems.push(`卡片数 ${cardsOf(container).length}（期望 4）`);
    expect(problems, "新槽必须是**追加**：既有四条语义与新卡片结构必须同时在场").toEqual([]);
  });
});

describe("N5 C8 防「3 套变 4 套」：react-markdown 站点计数", () => {
  it("全站运行时站点 == 2（且是两个具名文件）· views/** 含 import type 在内 0 站点 · 插件站点数不变", () => {
    const all = sourcesUnder(SRC);
    expect(all.length, "扫描域为空 ⇒ 下面所有计数都空真").toBeGreaterThan(150);
    const sites = all.flatMap((abs) => edgesOf(readFileSync(abs, "utf8"), RM_ID).map((e) => ({ file: relOf(abs), ...e })));
    expect(sites.filter((s) => s.kind === "runtime").map((s) => s.file).sort(), "运行时站点必须恰是这两个文件（多一个 = 第 4 套渲染器）")
      .toEqual(["components/ChatMessageMarkdown.tsx", "components/NoteMarkdown.tsx"]);
    expect(sites.filter((s) => s.file.startsWith("views/")), "views/** 里出现了 react-markdown 站点（含 import type 也算）").toEqual([]);
    const pluginSites = all.flatMap((abs) => pluginEdgesIn(readFileSync(abs, "utf8")).map((spec) => ({ file: relOf(abs), spec })));
    expect(pluginSites.length, "remark-*/rehype-* 站点数变了（新增插件站点也算「第 4 套」的开端）").toBe(8);
    expect([...new Set(pluginSites.map((s) => s.file))].sort()).toEqual(["components/ChatMessageMarkdown.tsx", "components/NoteMarkdown.tsx"]);

    // 仪器双侧自证：真 import 必命中、`import type` 单列、注释与裸字符串必不命中
    expect(edgesOf(`import X from "${RM_ID}";`, RM_ID)).toEqual([{ line: 1, kind: "runtime" }]);
    expect(edgesOf(`import type { O } from "${RM_ID}";`, RM_ID)).toEqual([{ line: 1, kind: "type" }]);
    expect(edgesOf(`const p = await import("${RM_ID}");`, RM_ID)).toEqual([{ line: 1, kind: "dynamic" }]);
    expect(edgesOf(`// import X from "${RM_ID}";`, RM_ID), "注释里的写法被当成了站点").toEqual([]);
    expect(edgesOf(`const s = "${RM_ID}";`, RM_ID), "裸字符串被当成了站点").toEqual([]);
  });
});
