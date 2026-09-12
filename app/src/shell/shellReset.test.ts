// @vitest-environment node
/**
 * @ai-context `app/index.html` 的**文档级 reset 与 6px 滚动条**守卫（T0 报告 §二 · G5 的落点）。
 *
 * Why 需要它：reset（`html, body, #root { margin: 0; height: 100% }`）与细滚动条住在 Vite 的
 *   HTML 入口里、**不在任何 TS 模块中** ⇒ 全仓 **0 个测试读它**（T0 实测：只有
 *   `scripts/check-bundle-budget.mjs` 引用构建产物 `dist/index.html`）⇒ 删掉、改宽都不会红。
 *   批 3 已实证这里踩过坑：Chromium ≥121 起 `* { scrollbar-width: thin }` **压过**
 *   `::-webkit-scrollbar`（实测 10px vs 6px）—— 二者互斥，加回前者等于**静默**把滚动条变宽。
 *
 * 口径（三条，各自独立可红）：
 *   ① `html, body, #root` 规则在位，且 `margin: 0` 与 `height: 100%` **两条声明都在**；
 *   ② `::-webkit-scrollbar` 规则在位，且 `width` / `height` **恰为 6px**（规格 §1 决策 17）；
 *   ③ 样式里**不得**出现 `scrollbar-width:` / `scrollbar-color:`（它们会让 ② 静默失效）。
 *
 * ★ 判定前**先剥注释**（HTML 注释 + CSS 块注释）：index.html 的说明文字里逐字写着
 *   `scrollbar-width` 与「实测 10px ≠ 6px」—— 不剥注释，③ 会被自己的说明文字误伤
 *   （本批已多次因注释里的字面量误伤）。末条自检给出「同文本带注释必红 / 剥后必绿」的实证。
 *
 * 副作用：只读 `app/index.html`。
 * 边界（诚实）：**本条只证「声明在位」，证不了「渲染出来是 6px」**——jsdom 不算布局，
 *   像素证据只能由无头浏览器探针给（批 3 T14 的活）。本文件跑在 vitest 全局 `node` 环境
 *   （**故意不加 jsdom 头**：只读文件，不需要 DOM）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HTML_PATH = join(APP, "index.html");

/** 期望值：规格 §1 决策 17 的细滚动条宽度（px）。 */
const SCROLLBAR_PX = 6;

/** 剥 HTML 注释（`<!-- … -->` 抹成等长空白，保住换行 ⇒ 报错仍能定位行号）。 */
function stripHtmlComments(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}

/** 剥 CSS 块注释（与 HTML 注释同理：只抹正文，不抹换行）。 */
function stripCssComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/** 取文档里**全部** `<style>` 块的正文（reset 与滚动条规则住在内联样式里，不在 TS 模块）。 */
function styleBlocks(html: string): string[] {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
}

/** 判定面 = `app/index.html` 的内联样式（**先剥注释再判**）。 */
function inlineCss(html: string): string {
  return styleBlocks(stripHtmlComments(html)).map(stripCssComments).join("\n");
}

/** 取一条规则的声明体：`<选择器> { … }`（三条判据共用这一处解析口径，不各写一份正则）。 */
function ruleBody(css: string, selector: RegExp): string | null {
  const m = selector.exec(css);
  return m === null ? null : m[1];
}

/** 声明归一化（空白与冒号间距不算差异；口径是「声明在位」，不是排版）。 */
function decls(body: string): string[] {
  return body
    .split(";")
    .map((d) => d.replace(/\s+/g, " ").replace(/\s*:\s*/, ": ").trim())
    .filter((d) => d !== "");
}

/** 取声明里的 px 数值（`width: 6px` ⇒ 6；缺失或非 px ⇒ null）。 */
function pxOf(body: string, prop: string): number | null {
  const hit = decls(body).find((d) => d.startsWith(`${prop}:`));
  if (hit === undefined) return null;
  const m = /^(\d+(?:\.\d+)?)px$/.exec(hit.slice(prop.length + 1).trim());
  return m === null ? null : Number(m[1]);
}

const RESET = /html\s*,\s*body\s*,\s*#root\s*\{([^}]*)\}/;
const BAR = /::-webkit-scrollbar\s*\{([^}]*)\}/;
const BANNED = /(?:^|[;{\s])(scrollbar-(?:width|color)\s*:)/gm;

/** ① 的判据（返回违规清单；空 = 绿）。 */
function resetViolations(css: string): string[] {
  const body = ruleBody(css, RESET);
  if (body === null) return ["缺 `html, body, #root { … }` 规则（整窗会留 UA 8px margin 与底缘白条）"];
  const d = decls(body);
  const bad: string[] = [];
  if (!d.some((x) => /^margin: 0(px)?$/.test(x))) bad.push("reset 缺 `margin: 0`");
  if (!d.some((x) => /^height: 100%$/.test(x))) bad.push("reset 缺 `height: 100%`");
  return bad;
}

/** ② 的判据。 */
function scrollbarViolations(css: string): string[] {
  const body = ruleBody(css, BAR);
  if (body === null) return ["缺 `::-webkit-scrollbar { … }` 规则（细滚动条退回系统默认宽）"];
  const bad: string[] = [];
  for (const prop of ["width", "height"]) {
    const px = pxOf(body, prop);
    if (px !== SCROLLBAR_PX) bad.push(`::-webkit-scrollbar 的 ${prop} 不是 ${SCROLLBAR_PX}px（实测 ${String(px)}）`);
  }
  return bad;
}

/** ③ 的判据。 */
function bannedViolations(css: string): string[] {
  return [...css.matchAll(BANNED)].map(
    (m) => `出现 ${m[1].trim()} —— Chromium ≥121 起它压过 ::-webkit-scrollbar（实测 10px ≠ 6px）`,
  );
}

const HTML = readFileSync(HTML_PATH, "utf8");
const CSS = inlineCss(HTML);

describe("app/index.html：文档级 reset 与 6px 滚动条（规格 §1 决策 17）", () => {
  it("① html, body, #root 的 reset 在位（margin: 0 + height: 100%）", () => {
    expect(resetViolations(CSS), "index.html 的 reset 被删或被改").toEqual([]);
  });

  it(`② ::-webkit-scrollbar 的 width / height 恰为 ${SCROLLBAR_PX}px`, () => {
    expect(scrollbarViolations(CSS), "细滚动条规则被删或被改宽").toEqual([]);
  });

  it("③ 不得出现 scrollbar-width / scrollbar-color（它们会压过 ②）", () => {
    expect(bannedViolations(CSS), "加回 scrollbar-width / scrollbar-color ⇒ 6px 静默失效").toEqual([]);
  });

  it("仪器自检：真实文件读得到（防路径写错 ⇒ 空判据假绿）", () => {
    expect(HTML).toContain("<!doctype html>");
    expect(styleBlocks(HTML).length, "读不到 <style> 块 ⇒ 三条判据都会「合规」得毫无意义").toBeGreaterThan(0);
    expect(CSS).toContain("::-webkit-scrollbar");
  });

  it("仪器自检：三条判据各自的阳性/阴性样本（走同一条代码路径）+ 剥注释实证", () => {
    // 两个**合法**片段（阴性样本按需替换其中之一 ⇒ 才能声称「只有那一条红」）
    const resetOk = "html, body, #root { margin: 0; height: 100%; }";
    const barOk = "::-webkit-scrollbar { width: 6px; height: 6px; }";

    // 阳性对照：完整合法片段 ⇒ 三条全绿
    expect(resetViolations(`${resetOk}\n${barOk}`)).toEqual([]);
    expect(scrollbarViolations(`${resetOk}\n${barOk}`)).toEqual([]);
    expect(bannedViolations(`${resetOk}\n${barOk}`)).toEqual([]);

    // 阴性对照①：删整条规则 / 只删 `margin: 0` / 只删 `height: 100%` ⇒ **只有** ① 红
    expect(resetViolations(barOk)).toHaveLength(1);
    expect(resetViolations(`html, body, #root { height: 100%; }\n${barOk}`)).toEqual(["reset 缺 `margin: 0`"]);
    expect(resetViolations(`html, body, #root { margin: 0; }\n${barOk}`)).toEqual(["reset 缺 `height: 100%`"]);
    expect(scrollbarViolations(`html, body, #root { height: 100%; }\n${barOk}`)).toEqual([]);

    // 阴性对照②：只改 width / 只改 height / 删整条规则 ⇒ **只有** ② 红
    expect(scrollbarViolations(`${resetOk}\n::-webkit-scrollbar { width: 10px; height: 6px; }`)).toHaveLength(1);
    expect(scrollbarViolations(`${resetOk}\n::-webkit-scrollbar { width: 6px; height: 10px; }`)).toHaveLength(1);
    expect(scrollbarViolations(resetOk)).toHaveLength(1);
    expect(resetViolations(`${resetOk}\n::-webkit-scrollbar { width: 10px; height: 6px; }`)).toEqual([]);
    // ② 不吃注释里的数字：说明文字写「实测 10px ≠ 6px」不算违规（走 inlineCss 剥注释）
    expect(scrollbarViolations(inlineCss(`<style>/* 实测 10px ≠ 6px */\n${resetOk}\n${barOk}</style>`))).toEqual([]);

    // 阴性对照③：加回 scrollbar-width / scrollbar-color ⇒ **只有** ③ 红
    const bannedWidth = `${resetOk}\n${barOk}\n* { scrollbar-width: thin; }`;
    const bannedColor = `${resetOk}\n${barOk}\nhtml { scrollbar-color: #c9c4b8 transparent; }`;
    expect(bannedViolations(bannedWidth)).toHaveLength(1);
    expect(bannedViolations(bannedColor)).toHaveLength(1);
    expect(resetViolations(bannedWidth)).toEqual([]);
    expect(scrollbarViolations(bannedWidth)).toEqual([]);

    // ★ 剥注释实证：同一段文本，**不剥**注释时 ③ 把说明文字判成违规、**剥掉**后绿
    const commented = `<style>\n<!-- 别加 scrollbar-width: thin（会压过 ::-webkit-scrollbar） -->\n${resetOk}\n${barOk}\n</style>`;
    expect(bannedViolations(commented), "不剥注释 ⇒ 被自己的说明文字误伤").toHaveLength(1);
    expect(bannedViolations(inlineCss(commented)), "剥注释后必须绿").toEqual([]);
  });
});
