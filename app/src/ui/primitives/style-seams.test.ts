/**
 * @ai-context style-seams.test.ts — 原语层的**样式接缝守卫**（批 0-D Task 3；node 环境，无 DOM）。
 *
 * Why：`Text` 的类名是跨批次契约，`motion.css` 是「一次写全、后续任务不再改」的接缝宿主 ——
 * 两处的一致性只能靠机器判据守，靠自觉必然漂移：
 *   ① 字阶/字族的 `var(--ed-x, 兜底字面量)` 的兜底值必须等于真源 `SCALE_TOKENS`
 *      （生成器改档后不重跑本层，兜底值会静默退回旧档 —— 未定义变量不报错）；
 *   ② `Text.tsx` 产出的每个类，`Text.css` 里必须有对应规则（类名拼错 = 静默无样式，编译期全绿）；
 *   ③ 动效 token 的**唯一真源**（`tokens.css`，由 `scripts/gen-tokens.mjs` 生成；`motion.css` 里恒 0 条
 *      `--ed-*` 定义 —— 批 6 已把临时接缝迁走）、**`app/src` 内唯一一条** reduced-motion 块，以及规格
 *      §8.4 的「位移上限 8px」—— 批 6 靠前者钉真源与封回归，靠后两者守住覆盖与不越界；
 *   ④ `Surface.css` 的**盒子口径**（控制方 2026-09-11 裁决）：基类必须自带
 *      `box-sizing: border-box` 且**只声明一次** —— `padded` + `bordered` + `width:100%` 在
 *      content-box 下溢出 26px，而本仓**没有全局 CSS reset**，盒子原语不自己声明就没人声明。
 *
 * 副作用：只读磁盘（同目录 + `primitives/` 下的 `.css`），不修改任何文件。
 * 边界：口径与 `tokens.drift.test.ts` 一致 —— **必须归一 EOL**（本仓无 `.gitattributes` 且
 * `core.autocrlf=true`，逐字节断言会在别人机器上假阳性）；判据前先**剥掉注释**（注释里提到
 * `--ed-dur-x` / 颜色名 / `translateY(12px)` 这类反例不该让守卫误报）。颜色只做「本层不得出现
 * 字面量」的反例守门，不重述 token 真源（那是 `contrast.test.ts` / `tokens.drift.test.ts` 的职责）。
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCALE_TOKENS } from "../tokens";
import { DURATION_TOKENS, EASING_TOKENS, renderAll } from "../../../scripts/gen-tokens.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const normalizeEol = (s: string): string => s.replace(/\r\n/g, "\n");
const read = (file: string): string => normalizeEol(readFileSync(join(HERE, file), "utf8"));
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "");

const TEXT_CSS = read("Text.css");
const MOTION_CSS = read("motion.css");
const SURFACE_CSS = read("Surface.css");
const INDEX_TS = read("index.ts");

/** `Text.tsx` 产出的类名契约（与 `Text.test.tsx` 的名单同源；改名单必须同时改 CSS 与两份测试） */
const TEXT_CLASSES: readonly string[] = [
  "ed-text",
  ...[1, 2, 3, 4, 5, 6].map((n) => `ed-text--s${n}`),
  ...["ink-1", "ink-2", "ink-3", "ink-4", "stamp", "ok", "due", "link", "inherit"].map((t) => `ed-text--${t}`),
  ...["ui", "body", "mono"].map((f) => `ed-text--font-${f}`),
  "ed-text--truncate",
];

/** `motion.css` 的 12 个 `.ed-*` 基类（含本批后面才实现的选择器 —— 未实现的选择器无害） */
const MOTION_CLASSES: readonly string[] = [
  "ed-btn", "ed-surface", "ed-text", "ed-modal-overlay", "ed-modal", "ed-confirm",
  "ed-toast", "ed-empty", "ed-loading", "ed-skeleton", "ed-probe", "ed-status",
];

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/;

/** 规格 §8.4 末句：位移上限 8px（响应层/编排层/环境层一律适用；批 6 的 GSAP 也不得越过） */
const SHIFT_MAX_PX = 8;

/**
 * 取一段 CSS 里所有 `translate*()` 的**数值实参**（px/rem）并换算成 px。
 * 百分比（`translate(-50%, -50%)` 居中技巧）、`calc()`、`var()` 一律跳过 —— 它们不是「位移量」，
 * 而本条判据要守的正是「位移量 ≤ 8px」这一个规范硬数字。
 */
function shiftViolations(css: string, file: string): string[] {
  const out: string[] = [];
  for (const m of stripComments(css).matchAll(/translate(?:3d|X|Y|Z)?\(([^)]*)\)/g)) {
    for (const arg of m[1].split(",")) {
      const px = /^\s*(-?\d+(?:\.\d+)?)(px|rem)\s*$/.exec(arg);
      if (!px) continue;
      const value = px[2] === "rem" ? Math.abs(Number(px[1])) * 16 : Math.abs(Number(px[1]));
      if (value > SHIFT_MAX_PX) out.push(`${file}: ${m[0]} = ${value}px > ${SHIFT_MAX_PX}px`);
    }
  }
  return out;
}

describe("Text 类名 ↔ CSS 规则一致（类名拼错 = 静默无样式）", () => {
  it("Text.tsx 产出的每个类在 Text.css 里都有规则", () => {
    for (const cls of TEXT_CLASSES) {
      expect(TEXT_CSS, `Text.css 缺少 .${cls} 的规则`).toContain(`.${cls} {`);
    }
  });

  it("反例守门：`ed-text--mono` 是计划里的笔误写法，契约是 `ed-text--font-mono`", () => {
    expect(TEXT_CLASSES).toContain("ed-text--font-mono");
    expect(TEXT_CSS).not.toMatch(/\.ed-text--mono\b/);
  });
});

/** `Surface.tsx` 产出的 13 个类名（与 `Surface.test.tsx` 的名单同源） */
const SURFACE_CLASSES: readonly string[] = [
  "ed-surface",
  ...["sunken", "canvas", "surface", "raised"].map((l) => `ed-surface--${l}`),
  // 批 4 T17：`pill` 是 B17 第 2 条加的药丸档（切片内 `borderRadius: 999` 实测 3 处 ⇒ ≥3）⇒ 12 → 13
  ...["stamp", "control", "panel", "overlay", "pill"].map((r) => `ed-surface--r-${r}`),
  "ed-surface--bordered",
  "ed-surface--interactive",
  "ed-surface--padded",
];

describe("Surface 盒子契约（控制方 2026-09-11 裁决 · 类名 ↔ CSS 一致）", () => {
  it("基类必须自带 `box-sizing: border-box`（padded+bordered+width:100% 在 content-box 下溢出 26px）", () => {
    const clean = stripComments(SURFACE_CSS);
    const start = clean.indexOf(".ed-surface {");
    expect(start, "Surface.css 缺少 `.ed-surface` 基类规则").toBeGreaterThanOrEqual(0);
    const base = clean.slice(start, clean.indexOf("}", start));
    expect(
      base,
      "`.ed-surface` 基类必须声明盒模型口径（本仓无全局 CSS reset，原语不声明就没人声明；批 4 迁移时才溢出 = 20 个弹层逐个补样式）",
    ).toContain("box-sizing: border-box");
  });

  it("盒模型口径只声明一次（档位修饰符不得各自声明 —— 各档漂移会让「一处改对所有面」失效）", () => {
    const clean = stripComments(SURFACE_CSS);
    expect(clean.match(/box-sizing\s*:/g)).toHaveLength(1);
  });

  it("Surface.tsx 产出的每个类在 Surface.css 里都有规则；且零颜色字面量、无 z-index", () => {
    const clean = stripComments(SURFACE_CSS);
    expect(SURFACE_CLASSES).toHaveLength(13);
    for (const cls of SURFACE_CLASSES) {
      expect(clean, `Surface.css 缺少 .${cls} 的规则`).toContain(`.${cls} {`);
    }
    expect(clean, "Surface.css 出现颜色字面量（色值只在 ui/tokens.css 与生成器里）").not.toMatch(COLOR_LITERAL);
    expect(clean, "Surface.css 写了 z-index（层级是 ui/zIndex.ts 标尺的职责）").not.toMatch(/z-index/);
  });
});

describe("token 兜底字面量 == 真源（生成器改档后不重跑本层会静默漂移）", () => {
  it("18 个 `--ed-type-N-{size,line,weight}` 的兜底值逐条等于 SCALE_TOKENS.typeScaleVars", () => {
    expect(SCALE_TOKENS.typeScaleVars).toHaveLength(6);
    for (const [i, t] of SCALE_TOKENS.typeScaleVars.entries()) {
      const n = i + 1;
      expect(TEXT_CSS, `第 ${n} 档 size`).toContain(`var(--ed-type-${n}-size, ${t.size}px)`);
      expect(TEXT_CSS, `第 ${n} 档 line`).toContain(`var(--ed-type-${n}-line, ${t.line}px)`);
      expect(TEXT_CSS, `第 ${n} 档 weight`).toContain(`var(--ed-type-${n}-weight, ${t.weight})`);
    }
  });

  it("三档字族的兜底值与 SCALE_TOKENS.fontFamily* 逐字一致", () => {
    const families: ReadonlyArray<readonly [string, string]> = [
      ["ui", SCALE_TOKENS.fontFamilyUi],
      ["body", SCALE_TOKENS.fontFamilyBody],
      ["mono", SCALE_TOKENS.fontFamilyMono],
    ];
    for (const [name, family] of families) {
      expect(TEXT_CSS, `字族 ${name}`).toContain(`var(--ed-font-${name}, ${family})`);
    }
  });

  it("墨度只经 `var(--ed-*)` 消费；本层两个 CSS 零颜色字面量、也不写 z-index", () => {
    for (const [file, css] of [["Text.css", TEXT_CSS], ["motion.css", MOTION_CSS]] as const) {
      const clean = stripComments(css);
      expect(clean, `${file} 出现颜色字面量（色值只在 ui/tokens.css 与生成器里）`).not.toMatch(COLOR_LITERAL);
      expect(clean, `${file} 写了 z-index（层级是 ui/zIndex.ts 标尺的职责）`).not.toMatch(/z-index/);
    }
    const clean = stripComments(TEXT_CSS);
    // 8 档走色 token（ink-1..4 / stamp / ok / due / link）；`inherit` 不引 token（它继承父级墨度）
    expect(clean.match(/color: var\(--ed-/g)).toHaveLength(8);
    expect(clean).toContain(".ed-text--inherit { color: inherit; }");
  });
});

describe("动效 token 真源契约（批 6 起临时接缝已迁走 ⇒ 钉唯一真源 + 封回归路径）", () => {
  it("规格 §8.4 的 10 个动效变量落值，一个不多一个不少", () => {
    const clean = stripComments(MOTION_CSS);
    expect(
      clean.match(/--ed-[a-z0-9-]+\s*:/g) ?? [],
      "批 6 已把真源迁进 scripts/gen-tokens.mjs：motion.css 不得再有任何 --ed-* 定义",
    ).toEqual([]);
    const expected: ReadonlyArray<readonly [string, string]> = [
      ["--ed-dur-micro", "120ms"],
      ["--ed-dur-overlay-in", "200ms"],
      ["--ed-dur-overlay-out", "160ms"],
      ["--ed-dur-toast-in", "180ms"],
      ["--ed-dur-toast-out", "140ms"],
      ["--ed-dur-skeleton", "1200ms"],
      // 控制方 2026-09-11 裁决补入：批 6 的编排层 / 页面切换不得重新硬编码这三个
      ["--ed-dur-card", "220ms"],
      ["--ed-dur-reveal", "500ms"],
      ["--ed-dur-page", "150ms"],
      ["--ed-ease", "cubic-bezier(0.2, 0, 0, 1)"],
    ];
    const source = stripComments(renderAll().css);
    for (const [name, value] of expected) expect(source).toContain(`${name}: ${value};`);
    // 真源侧计数：把「一个不多一个不少」钉在生成器的名单上（不再钉临时接缝）
    expect(DURATION_TOKENS).toHaveLength(9);
    expect(EASING_TOKENS.map((t) => t.name), "缓动真源追加须同步本条").toEqual(["ease", "ease-instrument", "ease-paper"]); // G18（T8）：1 → 3 条，逐序数组相等（R14.7 I-2；净增 0 行）
  });

  it("规格 §8.4：原语 CSS 的位移一律 ≤ 8px（8px 是注释不变量，本条是它的机器判据）", () => {
    const files = readdirSync(HERE).filter((f) => f.endsWith(".css"));
    // 防空目录把守卫静默关掉（同 zIndex.guard.test.ts 的「名单非空」思路）
    expect(files.length, "primitives/ 下应有 Text.css 与 motion.css").toBeGreaterThanOrEqual(2);
    const violations = files.flatMap((f) => shiftViolations(read(f), f));
    expect(violations, `位移超过规格 §8.4 的 8px 上限：\n${violations.join("\n")}`).toEqual([]);
  });

  it("`app/src` 内唯一一条 reduced-motion 块，覆盖 12 个 `.ed-*` 基类（含 transition 与 animation 两条）", () => {
    const clean = stripComments(MOTION_CSS);
    expect(clean.match(/@media \(prefers-reduced-motion: reduce\)/g)).toHaveLength(1);
    const block = clean.slice(clean.indexOf("@media (prefers-reduced-motion"));
    for (const cls of MOTION_CLASSES) {
      expect(block, `reduced-motion 名单缺 .${cls}`).toContain(`.${cls}`);
    }
    expect(block).toContain("transition-duration: 1ms !important");
    expect(block).toContain("animation-duration: 1ms !important");
    expect(block).toContain("animation-iteration-count: 1 !important");
  });
});

describe("原语层导出面", () => {
  it("index.ts 导出 Text 并接线 motion.css（深导入单原语则不带走 reduced-motion 块）", () => {
    expect(INDEX_TS).toContain('import "./motion.css";');
    expect(INDEX_TS).toContain('export { Text } from "./Text";');
    expect(INDEX_TS).toContain('export type { TextFont, TextProps, TextSize, TextTag, TextTone } from "./Text";');
  });

  /**
   * 批 4 Task 3（B6）：新增的**取值联合**必须从 barrel 看得到 —— 批 4 起全站只许走 `index.ts`
   * （ADR-033 §1），而 `ToastPlacement` / `EmptyStateAlign` 今日**还没有消费者**（T10/T13 才迁），
   * 故「漏导出」不会被 `tsc --noEmit` 抓到（无人 import ⇒ 无 TS2305）—— 计划 Task 3 的 M3 期望
   * 在这一点上无牙（T3 报告已实测登记）。本条把导出面本身变成判据：名字必须落在**那条**
   * `export type { … } from "./<模块>"` 语句里（不是文件里随便出现一次）。
   */
  it("两条新取值联合出现在各自的 `export type { … } from` 语句里（漏导出 = 批 5 迁移时才炸）", () => {
    expect(INDEX_TS, "`ToastPlacement` 未从 barrel 导出").toMatch(
      /export type \{[^}]*\bToastPlacement\b[^}]*\} from "\.\/Toast";/,
    );
    expect(INDEX_TS, "`EmptyStateAlign` 未从 barrel 导出").toMatch(
      /export type \{[^}]*\bEmptyStateAlign\b[^}]*\} from "\.\/EmptyState";/,
    );
  });
});

/* ─────────────────── 批 0-D Task 14 追加的守卫（一）：本层 CSS **文本**反例 ───────────────────
 * 追加而非重写（`progress.md` §十「后续 Unit 若要扩守卫，尽量追加」）。口径复用本文件已有的
 * `read` / `stripComments` / `COLOR_LITERAL`（颜色字面量的定义只有一处，避免两份正则各自漂移）。
 * 另三条守卫在 `style-contract.test.ts`：reduced-motion **覆盖名单** · CSS **接线** · 联合**契约锚** ——
 * 它们判的是**跨文件**的名单与类型契约，不是单个文件的文本；两条文件各自都要守住 300 行红线
 * （硬约束：新文件超了按语义拆，不许登记豁免 ⇒ 本文件不承载那三条）。
 */

const PRIMITIVE_CSS_FILES: readonly string[] = readdirSync(HERE).filter((f) => f.endsWith(".css"));

describe("守卫① 原语 CSS 零颜色字面量（色值只许在 ui/tokens.css 与 app/scripts/gen-tokens.mjs）", () => {
  it("primitives/*.css 逐文件 0 命中（判据先剥注释：注释里提到的旧色值不算犯规）", () => {
    // 防空目录把守卫静默关掉（同 zIndex.guard.test.ts 的「名单非空」思路）
    expect(PRIMITIVE_CSS_FILES.length, "primitives/ 下的样式表数量不应减少").toBeGreaterThanOrEqual(10);
    for (const file of PRIMITIVE_CSS_FILES) {
      const clean = stripComments(read(file));
      expect(clean, `${file} 出现颜色字面量（色值只在 ui/tokens.css 与生成器里）`).not.toMatch(COLOR_LITERAL);
    }
  });

  it("口径锚：剥注释这一步真的有效（`Surface.css:15` 的旧注释曾让本判据假红 —— T4 I-1）", () => {
    const synthetic = "/* rgba(255,255,255,.06) #fff */\n.ed-x { color: var(--ed-ink-1); }";
    expect(synthetic, "锚本身必须含犯规样本，否则它在测空气").toMatch(COLOR_LITERAL);
    expect(stripComments(synthetic), "剥注释失效 ⇒ 本守卫会在注释上假红").not.toMatch(COLOR_LITERAL);
  });
});

describe("守卫② 反例守卫：`--ed-stamp` 绝不作底色（规格 §4.1「绝不用于按钮」· 控制方裁决③）", () => {
  /**
   * 匹配「属性名以 `background` 开头 + 值里含该 token」。
   * ⚠️ **不得锚在行首**：本层最常见的写法是 `.ed-x { background: … }`（选择器与声明同一行），
   * 锚 `^` 会漏掉它们 —— 这是本守卫的负例探针实测出来的洞（2026-09-11，塞一条
   * `.ed-btn--probe { background: var(--ed-stamp); }` 只触发了下面第 2 条而没触发本条）。
   * 前置断言 `(?<![\w-])` 只为避开 `xbackground` 这类拼接，不是 CSS parser；本守卫是**反例守卫**，
   * 不是通用 linter（真 CSS parser 需要新依赖，违反「零新增依赖」）。
   */
  const STAMP_BG = /(?<![\w-])background[a-z-]*\s*:[^;{}]*var\(--ed-stamp\)/;
  const STAMP = "--ed-stamp";

  it("primitives/*.css 的声明里 0 命中（命中即打印 `文件:行号` 与整条声明）", () => {
    const hits: string[] = [];
    for (const file of PRIMITIVE_CSS_FILES) {
      const clean = stripComments(read(file));
      // 整文件再匹配一遍：本层约定「声明不跨行」，但守卫不能建立在约定上（跨行声明会被逐行扫描漏掉）
      const whole = [...clean.matchAll(new RegExp(STAMP_BG.source, "g"))].length;
      const byLine = clean.split("\n").flatMap((line, i) => (STAMP_BG.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : []));
      if (whole !== byLine.length) byLine.push(`${file}: 有 ${whole - byLine.length} 条命中的声明跨了行（逐行扫描漏掉）`);
      hits.push(...byLine);
    }
    expect(hits, `危险色被当作底色（它只做文字色与描边）：\n${hits.join("\n")}`).toEqual([]);
  });

  it("Button.css 的**原文**（含注释）里该 token 出现 0 次 —— 按钮连这个名字都不写（见该文件边界③）", () => {
    expect(read("Button.css").split(STAMP).length - 1).toBe(0);
  });

  it("口径锚：印章仍以「文字色 / 描边」消费该 token（证明上面那条不是空扫）", () => {
    const confirm = stripComments(read("ConfirmDialog.css"));
    expect(confirm).toContain(`border: 1px solid var(${STAMP})`);
    expect(confirm).toContain(`color: var(${STAMP})`);
  });
});
