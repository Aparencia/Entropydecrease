/**
 * @ai-context responseSeams.test.ts — 响应层的**边界与接缝守卫**（批 6 T12；node 环境，无 DOM）。
 *
 * Why 与 `responseCoverage.test.ts` 分开：那个文件判「七类动作**有没有**回执」（覆盖面），本文件判
 * 「回执有没有**越界**」——四组边界，每组都对应一条规格/裁决的硬话：
 *   ⑤ **三档同行为**（规格 §8.5 节能档逐字「**只留响应层**」⇒ 响应层的规则不得被 `[data-motion]`
 *      降级）+ **桶边界**（§8.2 / §8.6.1 分桶裁定：响应层一律 CSS transition，keyframes 桶只留
 *      `Loading`/`Skeleton`/`Probe`）+ **单一真源**（R1.1：`motion.css` 零 `--ed-*` 定义；时长/缓动
 *      只引 token 且兜底 == `gen-tokens.mjs` 真源）+ **位移 ≤ 8px**（规格 §8.4 末句）；
 *   ⑥ **控制方 2026-09-13 追加**（T6 评审 I-2 / I-3）：「系统 `prefers-reduced-motion` 优先于档位」的
 *      **真实承重机理 = reduced-motion 块的 `!important`**（不是源序；`motion.css` 的因果注释已就地
 *      更正），以及「档位块与 reduced 块之间零规则块」；
 *   ⑦ **原语层焦点环落纸**（`Button.css`：基准态透明 `outline` 给插值起点）；
 *   ⑧ **仪器自证**（`responseScan.ts` 的口径本身是判据的一部分：正 / 反例双跑）。
 *
 * 副作用：只读磁盘（`primitives/*.css` + `gen-tokens.mjs` 的导出），不修改任何文件。
 * 边界：① 口径 = 剥注释后的文本；② 🔴 本文件不得出现 `var(--ed-dur-` / `var(--ed-ease` 的**裸串**
 *   （`motionTokens.consumption.test.ts` 会把它们当成缺兜底的消费点 ⇒ 假红）⇒ 一律用转义正则；
 *   ③ DOM 侧判据在 `responseReceipt.dom.test.tsx`。
 */
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DURATION_TOKENS, EASING_TOKENS } from "../../scripts/gen-tokens.mjs";
import {
  PRIMITIVES, REDUCED_AT, blockAt, declaredProps, declarationValue, parseRules, readPrimitiveCss,
  reducedMotionRules, responseRules, responseSection, sectionBetween, stripComments,
} from "./responseScan";

const SECTION = responseSection();
const RULES = responseRules();
const MOTION_CSS = readPrimitiveCss("motion.css");
const REDUCED_BODY = reducedMotionRules()[0].body;
const CSS_FILES: readonly string[] = readdirSync(PRIMITIVES).filter((f) => f.endsWith(".css"));

describe("⑤ 三档同行为 + 桶边界 + 单一真源（§8.5「节能档只留响应层」）", () => {
  it("响应层节里零 `[data-motion`，且全仓没有任何 `[data-motion]` 规则碰这些元素", () => {
    expect(SECTION).not.toContain("data-motion");
    const keywords = ["button", "input", "textarea", "summary", "draggable", "separator"];
    const touching = CSS_FILES.flatMap((f) =>
      parseRules(readPrimitiveCss(f))
        .filter((r) => r.selector.includes("data-motion"))
        .filter((r) => keywords.some((k) => r.selector.includes(k)))
        .map((r) => `${f}: ${r.selector}`),
    );
    expect(touching, `档位规则碰到了响应层元素 ⇒ 响应层被降级（§8.5 节能档只留响应层）：\n${touching.join("\n")}`).toEqual([]);
  });

  it("桶边界与形状：零新 `.ed-*` 基类 · 零 `@media` / `@keyframes` / `animation` · 零 `--ed-*` 定义", () => {
    const classes = [...new Set([...SECTION.matchAll(/\.(ed-[A-Za-z0-9_-]+)/g)].map((m) => m[1]))];
    const registered = new Set(["ed-btn"]);
    const unregistered = classes.filter((c) => !registered.has(c) && !c.includes("--") && !c.includes("__"));
    expect(unregistered, `响应层新增了未登记的 .ed-* 类名：\n${unregistered.join("\n")}`).toEqual([]);
    expect(SECTION, "响应层不得新增 @media（app/src 内只许一条 reduced-motion 块）").not.toContain("@media");
    expect(SECTION, "响应层不得写 @keyframes（桶边界：只留 Loading/Skeleton/Probe 的循环动效）").not.toContain("@keyframes");
    expect(SECTION).not.toMatch(/(?:^|[;\s])animation\s*:/);
    expect(SECTION.match(/--ed-[a-z0-9-]+\s*:/g) ?? [], "响应层不得定义任何 --ed-* 变量（真源只有 gen-tokens.mjs）").toEqual([]);
    expect(SECTION, "响应层出现颜色字面量（色值只在 tokens.css 与生成器里）").not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/);
    expect(SECTION, "响应层写了 z-index（层级是 ui/zIndex.ts 标尺的职责）").not.toMatch(/z-index/);
  });

  it("位移 ≤ 8px（规格 §8.4 末句；`%` 形态是居中技巧、不是位移量，按既有口径跳过）", () => {
    const over: string[] = [];
    for (const m of SECTION.matchAll(/translate(?:3d|X|Y|Z)?\(([^)]*)\)/g)) {
      for (const arg of m[1].split(",")) {
        const px = /^\s*(-?\d+(?:\.\d+)?)(px|rem)\s*$/.exec(arg);
        if (px && Math.abs(Number(px[1])) > 8) over.push(`${m[0]} → ${arg.trim()}`);
      }
    }
    expect(over, `响应层位移超过 8px 上限：\n${over.join("\n")}`).toEqual([]);
  });

  it("时长 / 缓动只引 token，且兜底字面量 == 生成器真源（改真源不改兜底必红）", () => {
    const truth = new Map<string, string>([
      ...DURATION_TOKENS.map((t) => [`--ed-dur-${t.name}`, `${t.ms}ms`] as const),
      ...EASING_TOKENS.map((t) => [`--ed-${t.name}`, t.value] as const),
    ]);
    const bad: string[] = [];
    for (const r of RULES) {
      const dur = declarationValue(r.body, "transition-duration");
      if (dur !== null) {
        const m = /^var\((--ed-dur-[a-z-]+),\s*(\d+ms)\)$/.exec(dur);
        if (!m) bad.push(`${r.selector}: transition-duration 不是「token + 同值兜底」形态 → ${dur}`);
        else if (truth.get(m[1]) !== m[2]) bad.push(`${r.selector}: ${m[1]} 兜底 ${m[2]} ≠ 真源 ${truth.get(m[1])}`);
      }
      const ease = declarationValue(r.body, "transition-timing-function");
      if (ease !== null) {
        const m = /^var\((--ed-ease),\s*(cubic-bezier\([^)]*\))\)$/.exec(ease);
        if (!m) bad.push(`${r.selector}: transition-timing-function 不是「token + 同值兜底」形态 → ${ease}`);
        else if (truth.get(m[1]) !== m[2]) bad.push(`${r.selector}: ${m[1]} 兜底 ${m[2]} ≠ 真源 ${truth.get(m[1])}`);
      }
    }
    expect(bad, `响应层的时长 / 缓动脱离了唯一真源：\n${bad.join("\n")}`).toEqual([]);
    expect(truth.size, "真源名册读空了 ⇒ 上面两条是空真").toBe(DURATION_TOKENS.length + EASING_TOKENS.length);
  });
});

describe("⑥ 控制方 2026-09-13 追加（T6 评审 I-2 / I-3）：优先级机理与两块隔离", () => {
  it("I-2：reduced-motion 块的**每条**声明都带 `!important`（「系统优先于档位」的真实承重机理）", () => {
    const decls = [...REDUCED_BODY.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)].map((m) => ({ prop: m[1], value: m[2].trim() }));
    expect(decls.length, "reduced-motion 块里一条声明都抽不到 ⇒ 本条是空真").toBeGreaterThanOrEqual(3);
    const weak = decls.filter((d) => !d.value.endsWith("!important")).map((d) => `${d.prop}: ${d.value}`);
    expect(weak, `这些声明没有 !important ⇒ 档位块（无 !important）可能盖掉系统无障碍设置：\n${weak.join("\n")}`).toEqual([]);
    // 反向：档位块**不得**带 !important（那会反转无障碍优先级）
    const tierBodies = parseRules(MOTION_CSS).filter((r) => r.selector.includes("data-motion")).map((r) => r.body);
    expect(tierBodies.length, "档位规则一条都没解析到 ⇒ 反向判据是空真").toBeGreaterThanOrEqual(3);
    expect(tierBodies.join(" "), "档位块带了 !important ⇒ 反转无障碍优先级").not.toContain("!important");
  });

  it("I-3：档位块与 reduced 块之间零规则块（两块必须相邻）", () => {
    const tierAt = MOTION_CSS.lastIndexOf("[data-motion=");
    const reducedAt = MOTION_CSS.indexOf(REDUCED_AT);
    expect(tierAt, "motion.css 里找不到档位块").toBeGreaterThanOrEqual(0);
    expect(reducedAt, "motion.css 里找不到 reduced-motion 块").toBeGreaterThanOrEqual(0);
    expect(tierAt, "档位块必须在 reduced 块之前").toBeLessThan(reducedAt);
    // 起点 = 档位块最后一条规则的 `}`（`[data-motion=…]` 那一行自己的 `{` 不算"插入的规则块"）
    const tierEnd = MOTION_CSS.indexOf("}", tierAt);
    expect(tierEnd, "档位块最后一条规则未闭合").toBeGreaterThan(tierAt);
    const between = MOTION_CSS.slice(tierEnd + 1, reducedAt);
    expect((between.match(/\{/g) ?? []).length, `两块之间插入了规则块（§8.5 的源序前提被破坏）：\n${between}`).toBe(0);
  });
});

describe("⑦ 原语层：焦点环落纸（`Button.css`，109 处 `<Button>` + 段控件共用）", () => {
  const BUTTON_CSS = readPrimitiveCss("Button.css");
  const base = parseRules(BUTTON_CSS).find((r) => r.selector === ".ed-btn");
  const focus = parseRules(BUTTON_CSS).find((r) => r.selector === ".ed-btn:focus-visible");

  it("基准态给透明 outline 与 offset 0（否则焦点环没有插值起点 ⇒ 仍是 0ms 硬跳）", () => {
    expect(base, "Button.css 缺 .ed-btn 基类规则").toBeDefined();
    expect(declarationValue(base?.body ?? "", "outline")).toBe("2px solid transparent");
    expect(declarationValue(base?.body ?? "", "outline-offset")).toBe("0");
    const dur = declarationValue(base?.body ?? "", "transition") ?? "";
    expect(dur, "基类 transition 未覆盖 outline 两个属性 ⇒ 落纸无过渡").toContain("outline-color");
    expect(dur).toContain("outline-offset");
  });

  it("焦点态仍是 token 墨色 + 2px offset，且 Button.css 零 `[data-motion]`（响应层三档同行为）", () => {
    expect(focus, "Button.css 缺 .ed-btn:focus-visible 规则").toBeDefined();
    expect(focus?.body).toContain("outline: 2px solid var(--ed-ink-1)");
    expect(declarationValue(focus?.body ?? "", "outline-offset")).toBe("2px");
    expect(BUTTON_CSS, "原语层被档位降级了（§8.5 节能档只留响应层）").not.toContain("data-motion");
  });
});

describe("⑧ 仪器自证（`responseScan.ts` 的行为判据：口径本身是判据的一部分）", () => {
  it("`parseRules`：逗号展开 + 注释剔除 + `@media` 块按配对括号整段跳过", () => {
    const css =
      "/* 注释里的 .ed-x { color: red } 不该被解析 */\n@media (x) { .a { color: var(--ed-ink-1); } }\n.foo, .bar {\n  opacity: .5;\n}";
    const rules = parseRules(stripComments(css));
    expect(rules.map((r) => r.selector)).toEqual([".foo", ".bar"]);
    expect(rules[0].body).toContain("opacity: .5");
    expect(declaredProps(rules[0].body)).toEqual(["opacity"]);
  });

  it("`sectionBetween`：标记缺失 / 重复必须**抛**（守卫不得静默退化成空真）", () => {
    expect(() => sectionBetween("x", "[begin]", "[end]")).toThrow();
    expect(() => sectionBetween("[begin][begin]x[end]", "[begin]", "[end]")).toThrow();
    expect(sectionBetween("a[begin]b[end]c", "[begin]", "[end]")).toBe("[begin]b[end]");
  });

  it("`blockAt`：定位与配对（跨行、含嵌套规则）", () => {
    const css = "x { a { b: 1; } } y";
    const [open, close] = blockAt(css, 0);
    expect(css.slice(open, close + 1)).toBe("{ a { b: 1; } }");
    expect(() => blockAt("没有花括号", 0)).toThrow();
  });
});
