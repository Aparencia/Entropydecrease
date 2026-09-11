/**
 * @ai-context style-seams.test.ts — 原语层的**样式接缝守卫**（批 0-D Task 3；node 环境，无 DOM）。
 *
 * Why：`Text` 的类名是跨批次契约，`motion.css` 是「一次写全、后续任务不再改」的接缝宿主 ——
 * 两处的一致性只能靠机器判据守，靠自觉必然漂移：
 *   ① 字阶/字族的 `var(--ed-x, 兜底字面量)` 的兜底值必须等于真源 `SCALE_TOKENS`
 *      （生成器改档后不重跑本层，兜底值会静默退回旧档 —— 未定义变量不报错）；
 *   ② `Text.tsx` 产出的每个类，`Text.css` 里必须有对应规则（类名拼错 = 静默无样式，编译期全绿）；
 *   ③ `motion.css` 的 10 个动效变量、**全仓唯一一条** reduced-motion 块，以及规格 §8.4 的
 *      「位移上限 8px」—— 批 6 要靠前两者删块接管，靠第三者不越界。
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

const HERE = dirname(fileURLToPath(import.meta.url));
const normalizeEol = (s: string): string => s.replace(/\r\n/g, "\n");
const read = (file: string): string => normalizeEol(readFileSync(join(HERE, file), "utf8"));
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "");

const TEXT_CSS = read("Text.css");
const MOTION_CSS = read("motion.css");
const INDEX_TS = read("index.ts");

/** `Text.tsx` 产出的类名契约（与 `Text.test.tsx` 的名单同源；改名单必须同时改 CSS 与两份测试） */
const TEXT_CLASSES: readonly string[] = [
  "ed-text",
  ...[1, 2, 3, 4, 5, 6].map((n) => `ed-text--s${n}`),
  ...["ink-1", "ink-2", "ink-3", "ink-4", "stamp", "ok", "due", "link", "inherit"].map((t) => `ed-text--${t}`),
  ...["ui", "body", "mono"].map((f) => `ed-text--font-${f}`),
  "ed-text--truncate",
];

/** `motion.css` 的 11 个 `.ed-*` 基类（含本批后面才实现的选择器 —— 未实现的选择器无害） */
const MOTION_CLASSES: readonly string[] = [
  "ed-btn", "ed-surface", "ed-text", "ed-modal-overlay", "ed-modal", "ed-confirm",
  "ed-toast", "ed-empty", "ed-loading", "ed-skeleton", "ed-probe",
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

describe("motion.css 接缝契约（批 6 删块即接管，故名字与取值必须钉住）", () => {
  it("规格 §8.4 的 10 个动效变量落值，一个不多一个不少", () => {
    const clean = stripComments(MOTION_CSS);
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
    for (const [name, value] of expected) expect(clean).toContain(`${name}: ${value};`);
    expect(clean.match(/--ed-[a-z0-9-]+\s*:/g)).toHaveLength(expected.length);
  });

  it("规格 §8.4：原语 CSS 的位移一律 ≤ 8px（8px 是注释不变量，本条是它的机器判据）", () => {
    const files = readdirSync(HERE).filter((f) => f.endsWith(".css"));
    // 防空目录把守卫静默关掉（同 zIndex.guard.test.ts 的「名单非空」思路）
    expect(files.length, "primitives/ 下应有 Text.css 与 motion.css").toBeGreaterThanOrEqual(2);
    const violations = files.flatMap((f) => shiftViolations(read(f), f));
    expect(violations, `位移超过规格 §8.4 的 8px 上限：\n${violations.join("\n")}`).toEqual([]);
  });

  it("全仓唯一一条 reduced-motion 块，覆盖 11 个 `.ed-*` 基类（含 transition 与 animation 两条）", () => {
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
});
