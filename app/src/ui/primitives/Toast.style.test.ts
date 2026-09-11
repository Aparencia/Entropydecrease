/**
 * @ai-context Toast.style.test.ts —— Toast 的**样式文本判据**（批 0-D Task 9；规格 §8.4 · §4.1）。
 *
 * Why node 环境（**不加** jsdom 头）：本文件只读 `Toast.css` / `Toast.tsx` 的文本，不挂 DOM。
 * 与行为契约 `Toast.test.tsx` 按语义拆成两份，使两份都留在**新文件 ≤300 行**的红线内
 * （批 0-D 纪律：新文件超 300 不许登记豁免，只能拆）。
 *
 * 三条判据：
 *   ① **不 animate height**（规格 §8.4 明文：「相变 chrome 用绝对定位交叉淡入，不 animate height」）
 *      —— transition 只许出现在 `opacity` / `transform` 上；高度/内边距/位置过渡会触发重排，
 *      也会让多条 toast 的堆叠逐帧抖动。第二个 `it` 用**变异样本**证明该判据有区分度。
 *   ② 进出场时长逐字取 `--ed-dur-toast-in/out`（180 / 140，**出场比进场快**）且各带同值兜底字面量
 *      —— 批 6 的动效 token 真源落地后删 `motion.css` 的变量块即生效。
 *   ③ 与其它原语同向的纪律：类名 ↔ CSS 规则一致 · 零颜色字面量 · 零 `z-index`（层级是 TS 标尺的
 *      职责）· `--ed-stamp` 不进任何 `background` 声明（规格 §4.1「绝不用于按钮」）。
 *   ④ **退场时长的两个真源对拍**（T9 评审 I-3）：`Toast.tsx` 的 `EXIT_MS` 与 `motion.css` 的
 *      `--ed-dur-toast-out` 必须同值 —— 前者还决定 `usePresence` 的兜底窗口（+80ms），两者脱钩会让
 *      "退场中途被兜底摘掉"成为无判据可抓的静默缺陷。
 *
 * 副作用：只读磁盘（同目录两个文件），不修改任何文件。
 * 边界：判据前先**剥注释**（注释里会提到反例串）；EOL 归一（本仓无 `.gitattributes` 且
 * `core.autocrlf=true`，逐字节断言会在别人机器上假阳性）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (file: string): string => readFileSync(join(HERE, file), "utf8").replace(/\r\n/g, "\n");
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "");

const CLEAN = stripComments(read("Toast.css"));
const TSX = read("Toast.tsx");
const MOTION_CSS = read("motion.css");

/** 颜色字面量（与 `style-seams.test.ts` 同一口径：本层不得出现，颜色只经 `var(--ed-*)`） */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/;

/** `Toast.tsx` 产出的类名契约（改名单必须同时改 CSS 与行为测试） */
const CLASSES: readonly string[] = ["ed-toast", "ed-toast--info", "ed-toast--ok", "ed-toast--err", "ed-toast-action"];

/** 会触发重排的属性名（规格 §8.4 只允许 compositor 友好的 opacity / transform 进场） */
const LAYOUT_PROPS = /height|padding|margin|\bwidth\b|\btop\b|\bbottom\b|\bleft\b|\bright\b|inset/;

/**
 * 判据本体（抽成函数：以便第二个 `it` 用**变异样本**证明它有区分度 —— 一条抓不到反例的守卫
 * 等于没有守卫）。
 */
function offendingTransitions(css: string): string[] {
  return [...css.matchAll(/transition(?:-property|-duration)?\s*:\s*([^;]+);/g)]
    .map((m) => m[1])
    .filter((value) => LAYOUT_PROPS.test(value));
}

/** 取一条规则的规则体（`选择器 {` 到第一个 `}`）—— 防「写在别的规则里也算过」 */
function ruleBody(selector: string): string {
  const at = CLEAN.indexOf(selector);
  expect(at, `Toast.css 缺少 \`${selector}\` 的规则`).toBeGreaterThanOrEqual(0);
  return CLEAN.slice(at, CLEAN.indexOf("}", at));
}

describe("① 不 animate height（规格 §8.4 明文）", () => {
  it("Toast.css 的 transition 只动 opacity / transform（不触发重排）", () => {
    expect(offendingTransitions(CLEAN), "过渡里出现了会重排的属性（规格 §8.4：不 animate height）").toEqual([]);
    const values = [...CLEAN.matchAll(/transition(?:-property)?\s*:\s*([^;]+);/g)].map((m) => m[1]).join(" ");
    expect(values, "进出场必须走 opacity 与 transform").toContain("opacity");
    expect(values).toContain("transform");
  });

  it("判据有区分度（反例守门）：变异样本 `transition: max-height …` 必须被同一条判据抓到", () => {
    const mutated = ".ed-toast { transition: max-height var(--ed-dur-toast-in, 180ms); }";
    expect(offendingTransitions(mutated)).toHaveLength(1);
  });
});

describe("② 进出场时长与三态（规格 §8.4：Toast 180/140，出场比进场快）", () => {
  it("基类进场取 --ed-dur-toast-in / 180ms；exit 态取 --ed-dur-toast-out / 140ms", () => {
    expect(ruleBody(".ed-toast {")).toContain("var(--ed-dur-toast-in, 180ms)");
    expect(ruleBody('.ed-toast[data-phase="exit"]')).toContain("transition-duration: var(--ed-dur-toast-out, 140ms)");
  });

  it("[data-phase] 三态齐全：enter 起点透明、entered 终态、exit 出场", () => {
    expect(ruleBody('.ed-toast[data-phase="enter"]')).toContain("opacity: 0");
    expect(ruleBody('.ed-toast[data-phase="entered"]')).toContain("opacity: 1");
    expect(ruleBody('.ed-toast[data-phase="exit"]')).toContain("opacity: 0");
  });
});

describe("③ 纪律判据（与批 0-D 其它原语同向）", () => {
  it("Toast.tsx 产出的每个类在 Toast.css 里都有规则（类名拼错 = 静默无样式）", () => {
    for (const cls of CLASSES) expect(CLEAN, `Toast.css 缺少 .${cls} 的规则`).toContain(`.${cls} {`);
  });

  it("零颜色字面量、零 z-index（层级是 ui/zIndex.ts 标尺的职责）", () => {
    expect(CLEAN, "Toast.css 出现颜色字面量（色值只在 ui/tokens.css 与生成器里）").not.toMatch(COLOR_LITERAL);
    expect(CLEAN, "Toast.css 写了 z-index").not.toMatch(/z-index/);
  });

  it("`--ed-stamp` 只作文字色与描边，绝不进任何 background 声明（规格 §4.1「绝不用于按钮」）", () => {
    const offenders = CLEAN.split("\n").filter(
      (line) => /^\s*background[a-z-]*\s*:/.test(line) && line.includes("var(--ed-stamp)"),
    );
    expect(offenders).toEqual([]);
  });

  it("Toast.tsx 的层级经标尺取（裸数字由 zIndex.guard 棘轮守）；且 import 了自己的 CSS", () => {
    expect(TSX).toContain('zIndex("toast")');
    expect(TSX).not.toMatch(/zIndex\s*:\s*\d/);
    expect(TSX, "不 import 自己的 CSS ⇒ 全部类静默无样式").toContain('import "./Toast.css";');
  });
});

describe("④ 退场时长的两个真源对拍（T9 评审 I-3）", () => {
  /**
   * `Toast.tsx` 的 `EXIT_MS` 与 `motion.css` 的 `--ed-dur-toast-out` 是**并列的真源**：前者还是
   * `usePresence` 兜底窗口的一半（`EXIT_MS + timeoutSlackMs(80)` = 220ms）。若将来有人只把 token
   * 调大（如 260ms）而 `EXIT_MS` 不动 ⇒ 名义过渡比兜底还长，**退场演到一半就被兜底计时器摘掉**，
   * 而没有任何断言会红。故把两者钉成同一个数字。
   *
   * 边界（本条**不覆盖**）：① 只判"两个数字相等"，不判 CSS 是否真的引用了该变量（那是 ② 的职责）；
   * ② `usePresence` 的 slack 默认值（80）不在此判据内 —— 改它须连 `usePresence.test.tsx` 一起改；
   * ③ 若批 6 把时长搬进 token 真源并删掉 `motion.css` 的变量块，本条会红，届时按新的唯一真源改写。
   */
  it("`const EXIT_MS` == `--ed-dur-toast-out`（否则兜底窗口会把退场中途摘掉）", () => {
    const exitMs = /const EXIT_MS = (\d+);/.exec(TSX)?.[1];
    const tokenMs = /--ed-dur-toast-out:\s*(\d+)ms;/.exec(MOTION_CSS)?.[1];
    expect(exitMs, "Toast.tsx 缺 `const EXIT_MS = <n>;`").toBeDefined();
    expect(tokenMs, "motion.css 缺 `--ed-dur-toast-out: <n>ms;`").toBeDefined();
    expect(Number(exitMs), "退场名义时长必须与 --ed-dur-toast-out 同值（兜底窗口 = EXIT_MS + 80）").toBe(Number(tokenMs));
  });
});
