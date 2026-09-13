// @vitest-environment jsdom
/**
 * @ai-context 批 7 T16 —— `NotePreviewView.tsx:40 renderMarkdown` 的**表征测试**（T17 迁移前的回归网）。
 *   Why：T15 的变异体 M1（h2 字号 15 → 14px）**全仓 vitest 全绿**（§C38.2 实测）⇒ 这条链今天无覆盖；
 *   T17 要迁走它的实现（§C10.1）⇒ 迁移前先补网（§C9.3）。口径：**只钉住今天实际的行为**（含不喜欢的
 *   边角），**不判断它是否正确**（现行 bug 会被一起钉住）。做法：该函数非导出且本任务禁用生产改动 ⇒
 *   渲染真组件、读预览面 `innerHTML`（jsdom 往返后的 DOM 串 = 用户可见结果）。边界：① 只覆盖**行渲染器**
 *   （组件级取数/状态/交互不在本文件）；② 串里文本的 `"`/`'` 经解析往返为字面量，属性的 `"` 仍见 `&quot;`。
 */
import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { invokeMock, convertMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  convertMock: vi.fn((p: string): string => `CF(${p})`),
}));
// `invoke` 收 5 条挂载期命令；`convertFileSrc` 只被图片行的本地分支调用（断言其调用次数与实参）
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock, convertFileSrc: convertMock }));
// AiRefineCard 挂 `listen("ai:task-update")` —— jsdom 下真模块抛 transformCallback 未定义（本仓既有范式）
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

import NotePreviewView from "./NotePreviewView";

type Opts = { baseUrl?: string; dataDir?: string };

/** `preview_session_note` 的最小合法载荷（只有 `markdown` 参与本判据） */
function installInvoke(md: string, o: Opts = {}): void {
  const r = { title: "t", markdown: md, kept: [], ocr_points: [], ocr_screens: [],
    stats: { ui_junk: 0, duplicates: 0, fragments: 0, low_confidence: 0, ai_delete: 0 }, filtered: [], merged: [] };
  invokeMock.mockImplementation((cmd: string): Promise<unknown> => {
    switch (cmd) {
      case "preview_session_note": return Promise.resolve(r);
      case "text_filter_status": return Promise.resolve({ enabled: false, model: "m" });
      case "session_images_base_url": return Promise.resolve(o.baseUrl ?? "");
      case "app_data_dir": return Promise.resolve(o.dataDir ?? "");
      default: return Promise.resolve(null);
    }
  });
}

/** 渲染真组件并冲净挂载期异步（`act` 后 DOM 已定；连跑 3 次逐字相同，实测见 T16 报告） */
async function mount(md: string, o: Opts = {}): Promise<HTMLElement> {
  convertMock.mockClear();
  installInvoke(md, o);
  let container!: HTMLElement;
  await act(async () => { ({ container } = render(createElement(NotePreviewView, { sessionId: 1 }))); });
  return container;
}

/** 预览面的 innerHTML = `renderMarkdown(preview.markdown, baseUrl, dataDir)` 的产物 */
async function previewHtml(md: string, o: Opts = {}): Promise<string> {
  const surfaces = (await mount(md, o)).querySelectorAll(".ed-surface");
  if (surfaces.length !== 1) throw new Error(`预览面不唯一：${surfaces.length}`);
  return (surfaces[0] as HTMLElement).innerHTML;
}

const cfArgs = (): string[] => convertMock.mock.calls.map((c) => c[0]);

// 逐字模板 = 今天实际产出的字面量（任一处字面量被改 ⇒ 对应用例必红）
const P = (s: string): string => `<p style="font-size:13px;color:#374151;margin:4px 0">${s}</p>`;
const LI = (s: string): string => `<div style="font-size:12px;color:#4b5563">• ${s}</div>`;
const H3 = (s: string): string => `<h3 style="font-size:13px;margin:8px 0 4px;color:#0f766e">${s}</h3>`;
const QUOTE = (s: string): string => `<div style="font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin:6px 0">${s}</div>`;
const IMG = (src: string, alt: string): string => `<img src="${src}" alt="${alt}" loading="lazy" style="max-width:260px;border-radius:6px;border:1px solid #e5e7eb;margin:4px 0">`;
const CHIP = (ms: string, t: string): string => `<span data-ts-ms="${ms}" data-ts-chip="" style="color:#0d9488;border-bottom:1px dashed #14b8a6;background:#f0fdfa;border-radius:3px;padding:0 4px" title="⏱ ${t} 跳转到会话对应片段">⏱ ${t}</span>`;

describe("NotePreviewView.renderMarkdown 表征（钉住今天的行渲染行为，不判断对错）", () => {
  afterEach(() => { cleanup(); invokeMock.mockReset(); });

  it("可达性：真树里预览面是唯一的 .ed-surface ⇒ 下面每条断言都落在 renderMarkdown 的产物上", async () => {
    const cls = Array.from((await mount("X")).querySelectorAll(".ed-surface")).map((e) => e.className);
    expect(cls).toEqual(["ed-surface ed-surface--surface ed-surface--r-panel ed-surface--bordered ed-surface--padded"]);
  });

  it("普通段落：正文唯一出口是 <p> 且内联样式逐字（T17 迁移后 DOM 不得变）", async () => {
    expect(await previewHtml("Q05 普通段落")).toBe(P("Q05 普通段落"));
  });

  it("h1 `# ` → <h2> 15px（T15 的 M1 把 15 改成 14 曾全仓绿 —— 本条就是那个洞）", async () => {
    expect(await previewHtml("# 标题一")).toBe(`<h2 style="font-size:15px;margin:10px 0 4px">标题一</h2>`);
  });
  it("h2 `## ` → <h3> 13px 青绿（第二级标题不是 h2：标签名与「级」错位是现状）", async () => {
    expect(await previewHtml("## 标题二")).toBe(H3("标题二"));
  });
  it("h3/h4 `### `/`#### ` 无专支 ⇒ 仍落 <p>（只有 h1/h2 两档存在）", async () => {
    expect(await previewHtml("### 标题三\n#### 标题四")).toBe(P("### 标题三") + P("#### 标题四"));
  });
  it("标题分支不判内容：`# ` 后为空仍产出空 <h2>；行首有空格则落 <p>（判定不做 trim）", async () => {
    expect(await previewHtml("# ")).toBe(`<h2 style="font-size:15px;margin:10px 0 4px"></h2>`);
    expect(await previewHtml(" # 缩进标题")).toBe(P(" # 缩进标题"));
  });

  it("反引号（行内 `` ` `` 与围栏 ```）原样保留、不产 <code>/<pre>（该链不做行内/块级语法解析）", async () => {
    expect(await previewHtml("前 `code` 后")).toBe(P("前 `code` 后"));
    expect(await previewHtml("```js")).toBe(P("```js"));
  });
  it("表格行只当普通文本、不产 <table>（T17 迁移后不得顺手升级成表格）", async () => {
    expect(await previewHtml("| a | b |")).toBe(P("| a | b |"));
  });
  it("未闭合的 `**` 原样输出（无行内强调解析 ⇒ 不存在「半个标签」）", async () => {
    expect(await previewHtml("**未闭合")).toBe(P("**未闭合"));
  });

  it("列表 `- x` → 圆点 div（12px 灰），不是 <ul>/<li>", async () => {
    expect(await previewHtml("- 列表项")).toBe(LI("列表项"));
  });
  it("列表分支不判内容：`- ` 空项仍产出 `• `；`-x` 缺空格则落 <p>", async () => {
    expect(await previewHtml("- ")).toBe(LI(""));
    expect(await previewHtml("-x")).toBe(P("-x"));
  });
  it("缩进列表 `  - x` ⇒ 落 <p> 且保留前导空格（列表判定不 trim，与图片行的 `\\s*` 不对称）", async () => {
    expect(await previewHtml("  - 缩进列表")).toBe(P("  - 缩进列表"));
  });
  it("引用 `> x` → 琥珀警示块 div（T17 迁移后样式串必须逐字不变）", async () => {
    expect(await previewHtml("> 会话异常")).toBe(QUOTE("会话异常"));
  });

  it("markdown 链接不解析：`[t](url)` 原样落 <p>，全树 0 个 <a>（该链不产任何链接）", async () => {
    expect(await previewHtml("[t](https://e.com)")).toBe(P("[t](https://e.com)"));
  });
  it("`javascript:` 链接同样不产 <a>/href ⇒ 注入面无「可点协议」入口", async () => {
    const out = await previewHtml("[x](javascript:alert(1))");
    expect(out).toBe(P("[x](javascript:alert(1))"));
    expect(out).not.toContain("<a");
  });
  it("<script> 载荷被 escapeHtml ⇒ 产物无可解析标签（该链走 dangerouslySetInnerHTML）", async () => {
    const out = await previewHtml("<script>alert(1)</script>");
    expect(out).toBe(P("&lt;script&gt;alert(1)&lt;/script&gt;"));
    expect(out).not.toContain("<script");
  });
  it("`<img onerror>` 载荷同样只落文本（事件属性注入面为零）", async () => {
    expect(await previewHtml("<img src=x onerror=alert(1)>")).toBe(P("&lt;img src=x onerror=alert(1)&gt;"));
  });
  it("`&` 被转义、引号在文本节点里字面量往返（DOM 串口径；属性口径见下方图片行）", async () => {
    expect(await previewHtml(`a & b " c ' d`)).toBe(P(`a &amp; b " c ' d`));
  });

  it("时间码芯片（T15 后的现行形态）：保毫秒 data-ts-ms + data-ts-chip + title 逐字", async () => {
    expect(await previewHtml("[⏱ 00:05]([[ts:5000]]) 尾巴")).toBe(P(`${CHIP("5000", "00:05")} 尾巴`));
  });
  it("🔴 芯片「今天不可点」：<span> 属性表恰 4 项、不在 <a> 内（T17 会刻意改变这一点）", async () => {
    const c = await mount("[⏱ 00:05]([[ts:5000]])");
    const chip = c.querySelector("[data-ts-chip]") as HTMLElement;
    expect([chip.tagName, ...Array.from(chip.attributes).map((a) => a.name)]).toEqual(["SPAN", "data-ts-ms", "data-ts-chip", "style", "title"]);
    expect(c.querySelectorAll("a").length).toBe(0);
  });
  it("章节锚点包裹形态 `## x [[⏱ mm:ss]([[ts:ms]])]` 也替换成芯片（并吃掉外层方括号）", async () => {
    expect(await previewHtml("## 章节 [[⏱ 00:09]([[ts:9000]])]")).toBe(H3(`章节 ${CHIP("9000", "00:09")}`));
  });
  it("伪锚点（ms 为空 / ms 非数字 / 秒非两位）一律不替换 ⇒ 原样落 <p>", async () => {
    const a = "[⏱ 00:05]([[ts:]])", b = "[⏱ 00:05]([[ts:abc]])", c = "[⏱ 0:5]([[ts:5000]])";
    expect(await previewHtml(`${a}\n${b}\n${c}`)).toBe(P(a) + P(b) + P(c));
  });

  it("图片行 `session-images/` 前缀 ⇒ dataDir 经 convertFileSrc（恰 1 次，实参逐字）", async () => {
    const out = await previewHtml("- ![a](session-images/q.png)", { dataDir: "/data", baseUrl: "/base" });
    expect(out).toBe(IMG("CF(/data/session-images/q.png)", "a"));
    expect(cfArgs()).toEqual(["/data/session-images/q.png"]);
  });
  it("图片行相对路径 ⇒ imageBaseUrl 经 convertFileSrc（session-images/ 不重复拼 baseUrl）", async () => {
    const out = await previewHtml("- ![b](q.png)", { dataDir: "/data", baseUrl: "/base" });
    expect(out).toBe(IMG("CF(/base/q.png)", "b"));
    expect(cfArgs()).toEqual(["/base/q.png"]);
  });
  it("http(s) 与 data: 外链直出、**不**经 convertFileSrc（唯一离开本机的渲染请求）", async () => {
    const out = await previewHtml("- ![c](https://evil.com/c.png)\n- ![d](data:image/png;base64,AAAA)");
    expect(out).toBe(IMG("https://evil.com/c.png", "c") + IMG("data:image/png;base64,AAAA", "d"));
    expect(cfArgs()).toEqual([]);
  });
  it("前缀基准为空 ⇒ src=\"\" 且 convertFileSrc 0 次（宁缺不拼半截路径；两条分支对称）", async () => {
    expect(await previewHtml("- ![a](session-images/q.png)", { baseUrl: "/base" })).toBe(IMG("", "a"));
    expect(await previewHtml("- ![b](q.png)", { dataDir: "/data" })).toBe(IMG("", "b"));
    expect(cfArgs()).toEqual([]);
  });
  it("多图行：每张本地图各 1 次 convertFileSrc、外链 0 次（调用数与图数对齐）", async () => {
    const md = "- ![a](session-images/a.png)\n- ![b](b.png)\n- ![c](https://x/c.png)";
    expect(await previewHtml(md, { dataDir: "/data", baseUrl: "/base" }))
      .toBe(IMG("CF(/data/session-images/a.png)", "a") + IMG("CF(/base/b.png)", "b") + IMG("https://x/c.png", "c"));
    expect(cfArgs()).toEqual(["/data/session-images/a.png", "/base/b.png"]);
  });
  it("图片行允许前导空白与制表符（`\\s*`）—— 与列表分支的不对称是现状", async () => {
    expect(await previewHtml("  - ![a](q.png)", { baseUrl: "/base" })).toBe(IMG("CF(/base/q.png)", "a"));
    expect(await previewHtml("\t- ![a](q.png)", { baseUrl: "/base" })).toBe(IMG("CF(/base/q.png)", "a"));
  });
  it("🔴 图片行尾多一个空格 ⇒ 整行匹配失败、退化成列表行（T17 最易做坏的退化形态）", async () => {
    const out = await previewHtml("- ![a](q.png) ", { baseUrl: "/base" });
    expect(out).toBe(LI("![a](q.png) "));
    expect(cfArgs()).toEqual([]);
  });
  it("图片正则的两个非匹配边界：src 含 `)`（`[^)]*` 硬边界）与 `- !x` ⇒ 都退化成列表行", async () => {
    expect(await previewHtml("- ![a](q).png)", { baseUrl: "/base" })).toBe(LI("![a](q).png)"));
    expect(await previewHtml("- !x")).toBe(LI("!x"));
  });
  it("alt/src 属性按不可信输入转义（`\" onerror=\"` 逃不出属性）；空 alt 仍产出 alt=\"\"", async () => {
    expect(await previewHtml(`- ![a" onerror="x](q.png)`, { baseUrl: "/base" })).toBe(IMG("CF(/base/q.png)", "a&quot; onerror=&quot;x"));
    expect(await previewHtml(`- ![](q"onerror="x.png)`, { baseUrl: "/base" })).toBe(IMG('CF(/base/q&quot;onerror=&quot;x.png)', ""));
    expect(await previewHtml("- ![](q.png)", { baseUrl: "/base" })).toBe(IMG("CF(/base/q.png)", ""));
  });

  it("空串与纯空白（含空行、制表符）⇒ 产物为空串，不是 <p></p>", async () => {
    expect(await previewHtml("")).toBe("");
    expect(await previewHtml("   \n\n\t\n  ")).toBe("");
  });
  it("多行拼接**无分隔符**：相邻块首尾直接相接（空行只是空串，不产 <br>）", async () => {
    expect(await previewHtml("L1\n\nL2")).toBe(P("L1") + P("L2"));
  });
  it("极长单行（4000 字）完整落单个 <p>：不截断、不折成多段", async () => {
    const long = "Z" + "长".repeat(4000) + "Z";
    const out = await previewHtml(long);
    expect(out).toBe(P(long));
    expect(out.split("<p ").length).toBe(2);
  });
});
