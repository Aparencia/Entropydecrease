/**
 * @ai-context shellPhase.guard.test.ts — 相变态的**静态守卫**（批 6 T19；node 环境，纯文本判定）。
 *
 * Why 每一条都配「正 / 负对照」（R8.7：**「0 命中」必须点名仪器 + 双侧自证**；R41.7：主闸是期望比对）：
 *   ① 🔴 **不 animate height**（§8.4 逐字 / R4.4 硬判据）：`motion.css` 里没有任何
 *      `transition`/`animation` 指到 `height`、`@keyframes` 体内没有 `height`、**相位块正文里连
 *      `height` 这个词都不出现**（计划 V1 的强形态）⇒ 变异体 = 给相位容器加 `transition: height …`。
 *   ② **交叉淡入确实是「绝对定位 + opacity」**：两层的基线各声明 `transition: opacity`（时长/缓动走 token，
 *      采集/复习态的隐藏规则含 `position: absolute` + `opacity`，且**全块零 `display`**
 *      （`display: none` 换形 = 没有过渡 = 「不是交叉淡入」，计划 V2 的 M2 形状）⇒ 变异体 = 换成 `display: none`。
 *   ③ **源序**：相位块 < 档位块 < reduced-motion 块（逐序行号），且**邻座不变量**（档位块末条规则结束 →
 *      reduced 块起点之间零 `{`，= `motion/responseSeams.test.ts` 的 I-3）未被破坏
 *      ⇒ 变异体 = 把相位块挪到 reduced 块之后（同时会撞 `motion-coverage.test.ts` 的「死条目」）。
 *   ④ **CSS ↔ 组件双向闭合**（T17 当年只能做「前向闭合」，因为 motion.css 相位选择器 0 条；本任务补反向）：
 *      相位块的类名逐序 == `PhaseChrome.tsx` 的三个常量值，且三个常量都真的被用作 `className`
 *      ⇒ 变异体 = 只改一边的名字。
 *   ⑤ **单一写入方**（R42⑥①）：全仓**生产**代码里 `useShellPhase(` 的调用点恰 1 处（`shell/phaseSource.ts`），
 *      `App.tsx` 只经 `useShellPhaseState(`；复习事实的发布方恰 1 处（`pages/ReviewPage.tsx`）且**带 `active`**
 *      ⇒ 变异体 = 在 `App.tsx` 里再写一次 `useShellPhase(...)`。
 *   ⑥ **单一真源**：`motion.css` 仍零 `--ed-*` 定义（本任务只能加类规则）、相位块零颜色字面量 / 零 `z-index`。
 *   ⑦ **剥注释纪律**（R8.7 / R40.2 / 派发书必带项 5）：`shell/columnRegistry.ts` 的**注释**里逐字写着
 *      `data-shell-phase`（T14b 的前向引用）⇒ 任何「谁消费了这条属性」的判定都必须先剥注释；本条即那台
 *      剥离器的正 / 负对照 ⇒ 变异体 = 去掉 `stripComments`（⑦ 与 ⑤ 同时红）。
 *
 * 副作用：只读磁盘（`app/src/**` 与 `ui/primitives/motion.css`），不修改任何文件。
 * 边界：① 文本级判据、不做 AST（真 CSS parser 需新依赖）；② `.css` 的「行号」取自**保行号掩码**后的文本
 *   （注释替换成等长空白，行号与真实文件一致）；③ 本文件判不到像素（真正的 58px / 零 chrome 进报告
 *   `## 诚实边界`）。
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stripComments, walkSources } from "../ui/primitives/sliceScan";
import { SHELL_PHASES } from "./shellPhase";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");
const read = (rel: string): string =>
  readFileSync(join(SRC, ...rel.split("/")), "utf8").replace(/\r\n/g, "\n");

/** 相位块的唯一标记（切片必须成对且唯一：缺失 / 重复一律**抛** ⇒ 守卫不得静默退化成空真）。 */
const PHASE_BEGIN = "/* ▼▼▼ 相变态（T19";
const PHASE_END = "▲▲▲ 相变态结束（T19）▲▲▲ */";

function section(text: string, begin: string, end: string): string {
  const at = text.indexOf(begin);
  const endAt = text.indexOf(end);
  if (at < 0 || endAt < 0 || endAt < at) throw new Error(`切片标记缺失或错位：${begin}`);
  if (text.indexOf(begin, at + 1) >= 0) throw new Error(`切片标记重复（切片会取错）：${begin}`);
  return text.slice(at, endAt + end.length);
}

const MOTION = read("ui/primitives/motion.css");
/** 注释**就地掩码**（等长空白、保留换行）：注释里逐字写着 `height` / `transition` 这些词（R8.7）。 */
const maskComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const MOTION_CODE = maskComments(MOTION);
/** 相位块正文（**已剥注释**）—— 判据一律打在它身上，注释里的词不算数。 */
const PHASE_CODE = stripComments(section(MOTION, PHASE_BEGIN, PHASE_END)).trim();
const lineAt = (index: number): number => MOTION_CODE.slice(0, index).split("\n").length;
/** 扁平规则解析（本层 CSS 无嵌套；逗号选择器保留原文，逐条断言按前缀 / 后缀匹配）。 */
const rules = [...PHASE_CODE.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selector: m[1].trim().replace(/\s+/g, " "),
  body: m[2],
}));
const bodyOf = (pred: (selector: string) => boolean): string => {
  const hit = rules.filter((r) => pred(r.selector));
  if (hit.length !== 1) throw new Error(`期望恰 1 条规则命中，实得 ${hit.length} 条`);
  return hit[0].body;
};

describe("① 硬判据：**不 animate height**（§8.4 逐字 / R4.4）", () => {
  const HEIGHT_ANIM = /(?:transition|animation)[^;{}]*\b(?:max-)?height\b/;
  /** 样本一律**拼接写**（避免本文件自己成为守卫的命中源）；`+` 只为绕开「字面量就在文字里」的歧义。 */
  const sample = (decl: string): string => `.probe { ${decl} }`.replace("height", "he" + "ight");

  it("全文件零「transition/animation → height」（含 max-height），且相位块正文里连 height 都不出现", () => {
    expect(MOTION_CODE.length, "motion.css 读空了 ⇒ 下面是空真").toBeGreaterThan(2000);
    expect(MOTION_CODE, "motion.css 出现 height 动画 ⇒ 违反 §8.4「不 animate height」").not.toMatch(HEIGHT_ANIM);
    expect(PHASE_CODE, "相位块正文里出现 height / max-height（计划 V1 的强形态）").not.toMatch(/\b(?:max-)?height\b/);
    // 正 / 负对照：同一台扫描器对两形态必须报满，对合规样本必须 0
    expect([HEIGHT_ANIM.test(sample("transition: he" + "ight 220ms;")), HEIGHT_ANIM.test(sample("animation: grow 1s;"))]).toEqual([true, false]);
    expect(HEIGHT_ANIM.test(sample("transition: opacity 220ms;"))).toBe(false);
    expect(HEIGHT_ANIM.test(".probe { transition-property: opacity, max-he" + "ight; }")).toBe(true);
  });

  it("`@keyframes` 体内零 height（三条既有环境层循环 + 相位块零 keyframes）", () => {
    const bodies = [...MOTION_CODE.matchAll(/@keyframes\s+[A-Za-z0-9_-]+\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
    expect(bodies.length, "一条 keyframes 都抽不到 ⇒ 本条是空真").toBeGreaterThanOrEqual(3);
    expect(bodies.filter((b) => /\b(?:max-)?height\b/.test(b)), "keyframes 里动了 height").toEqual([]);
    expect(PHASE_CODE, "相位块新增了 @keyframes（桶边界：只留 Loading/Skeleton/Probe）").not.toContain("@keyframes");
  });
});

describe("② 交叉淡入 = 绝对定位 + opacity + transition: opacity（不是 display 换形）", () => {
  it("两层基线各自声明 `transition: opacity` 且时长 / 缓动走 token + **同值兜底**（逐字，逐序）", () => {
    const dur = "var(--ed-dur-card, 220ms)";
    const ease = "var(--ed-ease, cubic-bezier(0.2, 0, 0, 1))";
    const expected = `transition: opacity ${dur} ${ease};`;
    expect([bodyOf((s) => s === ".shell-phase__idle").trim(), bodyOf((s) => s === ".shell-phase__live").includes(expected)]).toEqual([
      expected,
      true,
    ]);
  });

  it("采集/复习态的隐藏规则含 `position: absolute` + `opacity`；显示规则含 `opacity: 1`", () => {
    const capIdle = bodyOf((s) => s.startsWith('html[data-shell-phase="capture"]') && s.endsWith("__idle"));
    const revIdle = bodyOf((s) => s.startsWith('html[data-shell-phase="review"]') && s.endsWith("__idle"));
    const capLive = bodyOf((s) => s.startsWith('html[data-shell-phase="capture"]') && s.endsWith("__live"));
    expect([
      capIdle.includes("position: absolute"),
      capIdle.includes("opacity: 0"),
      capIdle.includes("pointer-events: none"),
      revIdle.includes("opacity: 0"),
      capLive.includes("opacity: 1"),
    ]).toEqual([true, true, true, true, true]);
    // 采集层在采集态**回到流里**（容器高度由它给 = LiveBar 自己的 58px 契约）；复习态则继续浮着
    expect([capLive.includes("position: static"), revIdle.includes("position: absolute")]).toEqual([true, false]);
  });

  it("全块零 `display`（`display: none` 换形 = 没有过渡 ⇒ 计划 V2 的 M2 形状）", () => {
    const DISPLAY = /(?:^|[;{\s])display\s*:/;
    expect(PHASE_CODE, "相位块用 display 换形 ⇒ 相位切换是瞬变，不是交叉淡入").not.toMatch(DISPLAY);
    expect(".shell-phase__live { display: none; }", "反例样本未被判否 ⇒ 本条无牙").toMatch(DISPLAY);
  });
});

describe("③ 源序（相位块 < 档位块 < reduced 块）与邻座不变量", () => {
  it("三块逐序（行号取自保行号掩码后的文本，与真实文件一致）", () => {
    const phaseAt = MOTION_CODE.indexOf("[data-shell-phase=");
    const tierAt = MOTION_CODE.search(/\[data-motion="(?:eco|standard|rich)"\]/);
    const reducedAt = MOTION_CODE.indexOf("@media (prefers-reduced-motion");
    expect([phaseAt >= 0, tierAt >= 0, reducedAt >= 0], "三块必须都在，否则下面是空真").toEqual([true, true, true]);
    const order = [lineAt(phaseAt), lineAt(tierAt), lineAt(reducedAt)];
    expect(order, `源序应为 相位 < 档位 < reduced，实测行号 ${order.join(" / ")}`).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size, "两块落在同一行 ⇒ 切片口径漂了").toBe(3);
  });

  it("邻座不变量：档位块末条规则 → reduced 块起点之间零规则块（responseSeams I-3 同口径）", () => {
    const tierEnd = MOTION_CODE.indexOf("}", MOTION_CODE.lastIndexOf("[data-motion="));
    const reducedAt = MOTION_CODE.indexOf("@media (prefers-reduced-motion");
    expect(tierEnd, "档位块末条规则未闭合").toBeGreaterThan(0);
    const between = MOTION_CODE.slice(tierEnd + 1, reducedAt);
    expect((between.match(/\{/g) ?? []).length, `相位块挤进了档位块与 reduced 块之间：\n${between}`).toBe(0);
  });
});

describe("④ CSS ↔ 组件双向闭合（T17 只能前向闭合的那一半，本任务补反向）", () => {
  const TSX = read("shell/PhaseChrome.tsx");
  const cssClasses = [...new Set([...PHASE_CODE.matchAll(/\.(shell-[A-Za-z0-9_-]+)/g)].map((m) => m[1]))];
  const constNames = [...TSX.matchAll(/export const (PHASE_[A-Z_]+) = "([^"]+)"/g)].map((m) => m[1]);
  const constValues = [...TSX.matchAll(/export const PHASE_[A-Z_]+ = "([^"]+)"/g)].map((m) => m[1]);

  it("相位块的类名逐序 == `PhaseChrome.tsx` 的常量值（改名只改一边必红）", () => {
    expect(cssClasses.length, "相位块的选择器域读空了").toBeGreaterThan(0);
    expect(cssClasses, "相位块沿用 `.ed-*` 命名会撞 motion-coverage 的未登记基类判据 ⇒ 这里的名册必须是 shell-*").toEqual(constValues);
  });

  it("三个常量都真的被用作 `className`（声明了不用 = 名册在自说自话）", () => {
    expect(constNames.length, "常量数变了 ⇒ 双向闭合的名册要同步").toBe(3);
    const unused = constNames.filter((n) => !TSX.includes(`className={${n}}`));
    expect(unused, `这些常量没有用在 className 上：\n${unused.join("\n")}`).toEqual([]);
  });
});

describe("⑤ 单一写入方与 `active` 门控（R42⑥）", () => {
  /** 生产文件（剥注释；排除测试文件 —— 测试里合法地直接调 `useShellPhase`）。 */
  const prod = walkSources(SRC)
    .map((abs) => ({ rel: relative(SRC, abs).split(sep).join("/"), text: stripComments(readFileSync(abs, "utf8")) }))
    .filter((f) => !/\.test\.tsx?$/.test(f.rel));
  const textOf = (rel: string): string => {
    const hit = prod.find((f) => f.rel === rel);
    if (hit === undefined) throw new Error(`生产文件不在域内：${rel}`);
    return hit.text;
  };

  it("`useShellPhase(` 的调用点恰 1 处（`shell/phaseSource.ts`）；`App.tsx` 只经 `useShellPhaseState(`", () => {
    const callers = prod.filter((f) => f.text.includes("useShellPhase(")).map((f) => f.rel).sort();
    // `shell/shellPhase.ts` 是**定义**（`export function useShellPhase(`），不是调用点 —— 单独点名核实
    expect(callers, `相位的写入方多了/少了（双写者互擦就是这么来的）：${callers.join(", ")}`).toEqual([
      "shell/phaseSource.ts",
      "shell/shellPhase.ts",
    ]);
    expect(textOf("shell/shellPhase.ts")).toContain("export function useShellPhase(");
    expect([...textOf("shell/phaseSource.ts").matchAll(/useShellPhase\(/g)].length, "决策点里应恰 1 次调用").toBe(1);
    expect(textOf("App.tsx"), "App.tsx 直接调 useShellPhase ⇒ 绕过了唯一决策点").not.toContain("useShellPhase(");
    expect(textOf("App.tsx")).toContain("useShellPhaseState(");
  });

  it("复习事实的发布方恰 1 处（`pages/ReviewPage.tsx`）且带 `active` 门控", () => {
    const publishers = prod.filter((f) => f.text.includes("usePublishReviewSession(") && f.rel !== "shell/phaseSource.ts").map((f) => f.rel);
    expect(publishers, `发布方不是恰一处：${publishers.join(", ")}`).toEqual(["pages/ReviewPage.tsx"]);
    expect(
      read("pages/ReviewPage.tsx"),
      "发布点没把 `active` 传下去（门控本体在 phaseSource 里，这里防的是写死 true）",
    ).toMatch(/usePublishReviewSession\(\s*active\s*,/);
  });
});

describe("⑥ 单一真源与相位块的边界（零 `--ed-*` 定义 / 零颜色字面量 / 零 z-index）", () => {
  it("`motion.css` 仍零 `--ed-*` 定义；相位块只能加类规则", () => {
    expect(MOTION_CODE.match(/--ed-[a-z0-9-]+\s*:/g) ?? [], "真源只有 gen-tokens.mjs：motion.css 不许定义变量").toEqual([]);
    expect(PHASE_CODE.match(/--ed-[a-z0-9-]+\s*:/g) ?? []).toEqual([]);
    // 正对照（防空真）：同一台读法在 tokens.css 上必须数得到定义
    expect((read("ui/tokens.css").match(/--ed-[a-z0-9-]+\s*:/g) ?? []).length, "读法失效 ⇒ 上面的 0 命中不是证据").toBeGreaterThan(10);
  });

  it("相位块零颜色字面量、零 z-index（色值只在 tokens.css / 层级只在 ui/zIndex.ts）", () => {
    expect(PHASE_CODE, "相位块出现颜色字面量").not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/);
    expect(PHASE_CODE, "相位块写了 z-index").not.toMatch(/z-index/);
  });
});

describe("⑦ 剥注释纪律（R8.7 / R40.2）：注释字面量不算消费方", () => {
  it("正 / 负对照：`columnRegistry.ts` 注释里的 `data-shell-phase` 剥掉后 0 命中，而真选择器不被误剥", () => {
    const raw = read("shell/columnRegistry.ts");
    const clean = stripComments(raw);
    expect(raw.includes("data-shell-phase"), "正对照失败：该文件的注释里本该有这条字面量（T14b 的前向引用）").toBe(true);
    expect(clean.includes("data-shell-phase"), "剥注释后仍命中 ⇒ 这台剥离器没有牙（守卫会被注释骗到）").toBe(false);
    const phaseSels = [...stripComments(MOTION).matchAll(/\[\s*data-shell-phase\s*=\s*"([^"]*)"\s*\]/g)].map((m) => m[1]);
    expect(phaseSels.length, "剥注释把真选择器也剥掉了 ⇒ 上面的 0 命中不是证据").toBeGreaterThan(0);
    expect(phaseSels.filter((v) => !(SHELL_PHASES as readonly string[]).includes(v)), "相位值写到名册外（拼错？）").toEqual([]);
  });
});
