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
 * 2026-09-12（T9 评审 I-1 · 控制方裁决 e）：① 与 ④ 按「列状态**整体**注入（`col`）+
 *   手柄在 `ChatSidebar` 内渲染」改写——旧断言逐字绑在散 prop 形态上，与裁决后的实现
 *   不相容（`ChatPage` 只有 1 行余量，散 prop 与对象不能并存）。改写**同强度不降**：
 *   新增 `onResize={col.resizeBy}`（手柄真接线）与「散 prop 不得复辟」「页面不得重复
 *   渲染手柄」三条判据，`it` 数 6 → 6 不变。
 *
 * ⚠️ 仪器局限（诚实边界）：本文件**只看源码文本**——看不到「列实际渲染了多宽」。
 *   `ChatPage` 今日**没有组件测试**（页面级接线只有本文件的文本判据），故宽度与折叠的
 *   真实行为在本批仍无自动化覆盖：像素证据归 T14 的探针；`ChatSidebar` 的行为层现在
 *   由 `components/ChatSidebar.test.tsx`（jsdom，⑤⑥⑦ = 手柄/拖拽改宽/折叠态手柄）承担。
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
  it("① ChatSidebar 不再写死列宽；列状态整体注入 + 手柄在组件内（I-1 修正）", () => {
    const c = code("components/ChatSidebar.tsx");
    expect(/width:\s*240\b/.test(c), "ChatSidebar 代码里仍硬编码 240").toBe(false);
    expect(c.includes("export interface ChatSidebarProps")).toBe(true);
    // 2026-09-12 T9 评审 I-1（控制方裁决 e）：三个散 prop 收敛为**整对象** col
    expect(c.includes("col?: ColumnLayout"), "列状态未收敛为一个对象").toBe(true);
    expect(c.includes("col.folded"), "折叠态未取自列状态").toBe(true);
    expect(c.includes('columnSpec("chat-sidebar")'), "宽度缺省值未取注册表").toBe(true);
    // 「假可调」的机器判据：注册表承诺 200..320 ⇒ 必须真有一个手柄，且它**接到列状态上**
    // （只判「文件里出现 ColumnResizer」会被「渲染了但没接 onResize」的形态骗过）
    expect(c.includes("<ColumnResizer"), "侧栏没有拖拽手柄 ⇒ 注册表承诺的区间不可达").toBe(true);
    expect(c.includes("onResize={col.resizeBy}"), "手柄未接 resizeBy（拖了不改宽）").toBe(true);
    // 折叠态必须整列换成窄条（与其它列同款）
    expect(c.includes("<ColumnBar"), "折叠态未渲染 ColumnBar 窄条").toBe(true);
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
    // 2026-09-12 T9 评审 I-1（控制方裁决 e）：改为**一次对象传递**。散传 width/folded/
    // onExpand 时 resizeBy 到不了 UI（=§6.2 的「假可调」），故加**反向判据**防复辟。
    expect(usage.includes("col={chatCol}"), "未把列状态整体注入 ChatSidebar").toBe(true);
    for (const scattered of ["width={chatCol.width}", "folded={chatCol.folded}", "onExpand={chatCol.expand}"]) {
      expect(usage.includes(scattered), `散 prop ${scattered} 复辟（手柄拿不到 resizeBy）`).toBe(false);
    }
    // 手柄只有一处渲染（在 ChatSidebar 内）——页面不得再渲染第二个
    expect(c.includes("<ColumnResizer"), "手柄应由 ChatSidebar 渲染，页面不得重复渲染").toBe(false);
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
