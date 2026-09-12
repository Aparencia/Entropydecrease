/**
 * @ai-context 未接入三处的**列接线守卫**（规格 §6.2 的三个「本次改动」格：AI 对话侧栏 /
 *   目标左列 / 设置主列）——批 3 Task 9。
 *
 * Why 存在：这三处今日把列宽写死在组件/页面里（240 / 380 / 720），而规格口径是
 *   「规格住在 `shell/columnRegistry`，运行时由 `useColumnLayout` 执行」。没有机器判据时
 *   「接线」会退化成一次性人工动作——下一个人改回字面量不会有任何东西变红。
 *
 * 判据分三层，每层都能独立变红（变异体实测见 T9 报告）：
 *   ① **代码层**（先剥注释再判）：三个落点不得再出现旧字面量，且必须出现新消费点；
 *   ② **原始文本层**（第二仪器，刻意更严）：整个文件文本里**连注释都不许**残留旧字面量
 *      —— 仓内约定是「要提到会触发守卫的串时改述」（DISPATCH §二「文本扫描型守卫」）；
 *      ① 才是语义判据，② 只防「注释里留着旧写法」这类误导性残留。
 *   ③ **扫描域自检**：四个文件都读得到且够长（防路径写错 ⇒ 0 命中 ⇒ 假绿），
 *      剥注释器与三个旧字面量正则各带正/负样本自检（不能失败的判据不算判据）。
 *
 * ⚠️ 仪器局限（诚实边界）：本文件**只看源码文本**——看不到「列实际渲染了多宽」。
 *   `ChatSidebar` / `GoalsPage` / `SettingsPage` / `ChatPage` 今日**都没有组件测试**，
 *   故宽度与折叠的真实行为在本批**没有自动化覆盖**：像素证据归 T14 的探针，
 *   本文件跑在 vitest 全局 `node` 环境（纯文本判定，刻意不加 jsdom 头）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/** 剥注释：块注释 + 整行 `//` 注释（与 `shell/TopBar.test.tsx:35`、`columnRegistry.test.ts` 同款口径）。
 *  Why：注释里提到旧字面量（「此前写死 240」）不是「仍在硬编码」——裸文本计数会**假红**。 */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = (rel: string) => stripComments(read(rel));

/** 四个落点（相对 `app/src`） */
const FILES = [
  "components/ChatSidebar.tsx",
  "pages/GoalsPage.tsx",
  "pages/SettingsPage.tsx",
  "pages/ChatPage.tsx",
] as const;

/** 旧字面量（**只在这一个数组里写一次**，① 与 ② 共用） */
const LEGACY: readonly (readonly [string, RegExp])[] = [
  ["components/ChatSidebar.tsx", /width:\s*240\b/],
  ["pages/GoalsPage.tsx", /width:\s*380\b/],
  ["pages/SettingsPage.tsx", /maxWidth:\s*720\b/],
] as const;

describe("T9 · 未接入三处的列接线（规格 §6.2）", () => {
  it("① ChatSidebar 不再写死列宽，且接受 width/folded/onExpand", () => {
    const c = code("components/ChatSidebar.tsx");
    expect(/width:\s*240\b/.test(c), "ChatSidebar 代码里仍硬编码 240").toBe(false);
    expect(c.includes("export interface ChatSidebarProps")).toBe(true);
    expect(c.includes("width?: number")).toBe(true);
    expect(c.includes("folded?: boolean")).toBe(true);
    expect(c.includes('columnSpec("chat-sidebar")'), "宽度缺省值未取注册表").toBe(true);
    // 折叠态必须整列换成窄条（与其它列同款），且是「早返回」而非藏在某分支里
    expect(/if\s*\(folded\)\s*return\s*<ColumnBar/.test(c), "折叠态未渲染 ColumnBar 窄条").toBe(true);
  });

  it("② GoalsPage 不再写死 380，且可拖拽 + 可折叠", () => {
    const c = code("pages/GoalsPage.tsx");
    expect(/width:\s*380\b/.test(c), "GoalsPage 代码里仍硬编码 380").toBe(false);
    expect(c.includes('useColumnLayout("goals-left", columnSpec("goals-left"))'), "未从注册表取规格").toBe(true);
    expect(c.includes("width: goalsCol.width"), "左列宽度未消费 hook").toBe(true);
    expect(c.includes("<ColumnResizer"), "目标左列没有拖拽手柄").toBe(true);
    // J1-3 同款死局：窄条点击必须走 expand()（写 setManualFolded 则自动折叠下点了不展开）
    expect(c.includes("onClick={goalsCol.expand}"), "窄条点击未走 expand()").toBe(true);
  });

  it("③ SettingsPage 改为居中 860（取注册表 default，不喂 hook）", () => {
    const c = code("pages/SettingsPage.tsx");
    expect(/maxWidth:\s*720\b/.test(c), "SettingsPage 代码里仍是 720").toBe(false);
    expect(c.includes('columnSpec("settings-main").default'), "主列宽未取注册表 default").toBe(true);
    expect(/margin:\s*"0 auto"/.test(c), "主列未居中（规格：720 左对齐 → 改居中）").toBe(true);
    // 反向判据：settings-main 的 min=max=0 ⇒ clamp(860,0,0)=0，喂 hook 会把主列压成 0
    expect(c.includes("useColumnLayout"), "settings-main 不得走 useColumnLayout（clamp ⇒ 0）").toBe(false);
  });

  it("④ ChatPage 是 AI 侧栏的唯一宿主（规格 §6.2 允许的唯一改动）", () => {
    const c = code("pages/ChatPage.tsx");
    expect(c.includes('useColumnLayout("chat-sidebar", columnSpec("chat-sidebar"))'), "页面未从注册表取规格").toBe(true);
    const usage = c.slice(c.indexOf("<ChatSidebar"));
    expect(usage.includes("width={chatCol.width}"), "未把列宽注入 ChatSidebar").toBe(true);
    expect(usage.includes("folded={chatCol.folded}"), "未把折叠态注入 ChatSidebar").toBe(true);
    expect(usage.includes("onExpand={chatCol.expand}"), "未注入 expand（窄条点不开）").toBe(true);
  });

  it("⑤ 第二仪器（原始文本 · 刻意更严）：旧字面量连注释里都不许残留", () => {
    const hits = LEGACY.filter(([f, re]) => re.test(read(f))).map(([f]) => f);
    expect(hits, `这些文件的原始文本里仍有旧字面量（注释里也请改述）：\n${hits.join("\n")}`).toEqual([]);
  });

  it("⑥ 扫描域自检：四个文件都读得到、够长；剥注释器与三个正则的正/负样本", () => {
    for (const f of FILES) expect(read(f).length, `${f} 读不到或过短（路径写错？）`).toBeGreaterThan(500);
    // 三个旧字面量正则各来一对正/负样本（负样本 = 迁移后的新写法）
    expect(LEGACY[0][1].test("  width: 240,")).toBe(true);
    expect(LEGACY[0][1].test("  width,")).toBe(false);
    expect(LEGACY[1][1].test("width: 380,")).toBe(true);
    expect(LEGACY[1][1].test("width: goalsCol.width,")).toBe(false);
    expect(LEGACY[2][1].test('maxWidth: 720,')).toBe(true);
    expect(LEGACY[2][1].test('maxWidth: columnSpec("settings-main").default,')).toBe(false);
    // 剥注释器自检：代码行必须留下、整行注释与块注释必须被剥掉
    expect(LEGACY[0][1].test(stripComments("const s = { width: 240 };"))).toBe(true);
    expect(LEGACY[0][1].test(stripComments("  // 此前 width: 240"))).toBe(false);
    expect(LEGACY[0][1].test(stripComments("/* 旧写法 width: 240 */"))).toBe(false);
  });
});
