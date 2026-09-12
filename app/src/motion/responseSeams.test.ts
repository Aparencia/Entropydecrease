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

/**
 * 时长 / 缓动消费点的**名字模式**（T13 修：与 `motionTokens.consumption.test.ts` 的 `CONSUMER` 同类缺陷）。
 *
 * Why：`--ed-ease` 后接 `-` 处正是**词边界** ⇒ 只认 `--ed-ease`（或用 `\b` 收尾）会把
 * `--ed-ease-instrument` / `--ed-ease-paper` **前缀吞成** `--ed-ease`，随后因「兜底形态不符」把一处
 * **完全合规**的消费点报成违规 —— 波 B/C 第一次用新缓动名时就会误红（双基调的两条缓动 T8 已进真源，
 * 今天 0 CSS 消费点，所以这条一直是潜伏的）。四类名字都要覆盖：
 * `--ed-dur-*` · `--ed-ease` · `--ed-ease-instrument` · `--ed-ease-paper`。
 * ⚠️ 写成**转义**形态（`var\(`）⇒ `motionTokens.consumption.test.ts` 的全树扫描不会把本文件当消费点
 * （本文件头注边界②）。
 *
 * 🔴 **名字字符集含数字 / 大写 / 下划线**（T13b 修，合并评审 I-1 的上送项）：T13 只统一了「四类名」的口径，
 * `[a-z-]` 仍把 `--ed-dur-micro2` / `--ed-ease-instrument2` / `--ed-ease-Instrument` 三形态**全部漏掉**
 * （终止符前瞻 `(?=[\s,)])` 回溯到底也不成立，T13b 实测三形态解析器命中数 = 0）。真源名册今天全是
 * 小写连字符 ⇒ 无现实影响；但将来真源引入带数字 / 大写的 name 时，**整条消费点会静默漏检**。
 */
const DURATION_VALUE = new RegExp(String.raw`^var\((--ed-dur-[A-Za-z0-9-]+),\s*(\d+ms)\)$`);
const EASING_VALUE = new RegExp(String.raw`^var\((--ed-ease(?:-[A-Za-z0-9-]+)?),\s*(cubic-bezier\([^)]*\))\)$`);
/**
 * **形态计数**用的名字模式（T13b 追加）：与上面两台解析器**独立**，字符集再放宽到下划线。
 * Why 需要它：两台解析器只看得见 `transition-duration` / `transition-timing-function` 两个属性的**值**
 * ⇒ 一处落在别的属性（`transition` 简写 / `transition-delay`）里的 token 消费**完全不被看见**（静默）；
 * 名字带数字 / 大写时也只是以笼统的「形态不符」面貌出现。本模式只做**计数**：响应层里每处
 * `var(--ed-dur-*` / `var(--ed-ease*` 都必须被解析器吃下 —— 数得到却认不出 ⇒ 当场红。
 * ⚠️ 写成**转义**形态（`var\(`）⇒ 本文件不会被 `motionTokens.consumption.test.ts` 当成消费点（边界②）。
 */
const TOKEN_SHAPE = /var\(--ed-(?:dur-|ease)[A-Za-z0-9_-]*(?=[\s,)])/g;

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
        const m = DURATION_VALUE.exec(dur);
        if (!m) bad.push(`${r.selector}: transition-duration 不是「token + 同值兜底」形态 → ${dur}`);
        else if (!truth.has(m[1])) bad.push(`${r.selector}: ${m[1]} 是死兜底（真源名册里没有这个 token 名）`);
        else if (truth.get(m[1]) !== m[2]) bad.push(`${r.selector}: ${m[1]} 兜底 ${m[2]} ≠ 真源 ${truth.get(m[1])}`);
      }
      const ease = declarationValue(r.body, "transition-timing-function");
      if (ease !== null) {
        const m = EASING_VALUE.exec(ease);
        if (!m) bad.push(`${r.selector}: transition-timing-function 不是「token + 同值兜底」形态 → ${ease}`);
        else if (!truth.has(m[1])) bad.push(`${r.selector}: ${m[1]} 是死兜底（真源名册里没有这个 token 名）`);
        else if (truth.get(m[1]) !== m[2]) bad.push(`${r.selector}: ${m[1]} 兜底 ${m[2]} ≠ 真源 ${truth.get(m[1])}`);
      }
    }
    expect(bad, `响应层的时长 / 缓动脱离了唯一真源：\n${bad.join("\n")}`).toEqual([]);
    expect(truth.size, "真源名册读空了 ⇒ 上面两条是空真").toBe(DURATION_TOKENS.length + EASING_TOKENS.length);
  });

  /* T13b 追加（合并评审 I-1 的「形态计数」建议）：上面那台解析器只看得见**两个属性的值**
   * ⇒ ① 名字带数字 / 大写时它以笼统的「形态不符」出现（实测：三形态解析命中数 = 0）；
   * ② 落在别的属性（`transition` 简写 / `transition-delay`）里的 token 消费**连看都不看**（静默）。
   * 这条把「数得到却认不出」变成显式红：数目是数得出来的，吃不下就不许过。 */
  it("T13b 形态计数：响应层每处 `var(--ed-dur-*` / `var(--ed-ease*` 都必须被解析器吃下", () => {
    const shaped = [...SECTION.matchAll(TOKEN_SHAPE)].map((m) => m[0]);
    expect(SECTION.length, "响应层节读空了 ⇒ 本条是空真").toBeGreaterThan(500);
    expect(shaped.length, "响应层一处 token 消费都没有 ⇒ 本条是空真").toBeGreaterThan(0);
    // 「解析成功」按**声明体去重**计：`RULES` 的逗号选择器已展开，逐条计会把同一处数成多次
    let parsed = 0;
    for (const body of new Set(RULES.map((r) => r.body))) {
      for (const prop of ["transition-duration", "transition-timing-function"]) {
        const v = declarationValue(body, prop);
        if (v !== null && (DURATION_VALUE.test(v) || EASING_VALUE.test(v))) parsed += 1;
      }
    }
    expect(
      shaped.length,
      `响应层有 ${shaped.length} 处 token 消费点，两台解析器只吃下 ${parsed} 处 ⇒ 名字带数字 / 大写、或落在别的属性里的消费点被**静默跳过**：\n${shaped.join("\n")}`,
    ).toBe(parsed);
    // 双侧自证（防空真）：宽字符集必须真能数到数字 / 大写名，而 T13b 之前的窄字符集一个都数不到
    const nextGen = ["var" + "(--ed-dur-micro2, 120ms)", "var" + "(--ed-ease-Instrument, cubic-bezier(0.4, 0, 0.2, 1))"].join("; ");
    expect([...nextGen.matchAll(TOKEN_SHAPE)].length, "形态计数看不见数字 / 大写的名字 ⇒ 它比它看守的解析器还弱").toBe(2);
    expect([...nextGen.matchAll(/var\(--ed-(?:dur-|ease)[a-z-]*(?=[\s,)])/g)].length, "窄字符集（T13b 之前的口径）本就数不到这两个名字 —— 这就是盲区本身").toBe(0);
  });

  /* T13 追加（控制方 2026-09-13 指令）：「两条正则只认旧名」是与 `motionTokens.consumption.test.ts`
   * 被 T6b 修掉的那条**同一类**缺陷（`--ed-ease` 前缀吞掉 `--ed-ease-<name>`）⇒ 口径本身要有自证。
   * 样本一律**拼接写**：本文件不得出现 `var(--ed-` 的裸串（见文件头边界②）。 */
  it("口径自证：四类 token 名都能被**整段**解析（`ease-…` 不得被前缀吞成 `--ed-ease` / 不得误判形态）", () => {
    const durSamples: ReadonlyArray<readonly [string, string, string]> = [
      ["var" + "(--ed-dur-micro, 120ms)", "--ed-dur-micro", "120ms"],
      ["var" + "(--ed-dur-card, 220ms)", "--ed-dur-card", "220ms"],
    ];
    for (const [value, name, fallback] of durSamples) {
      const m = DURATION_VALUE.exec(value);
      expect([m?.[1], m?.[2]], `时长消费点被漏解析 / 名字被截断：${value}`).toEqual([name, fallback]);
    }
    const easeSamples: ReadonlyArray<readonly [string, string, string]> = [
      ["var" + "(--ed-ease, cubic-bezier(0.2, 0, 0, 1))", "--ed-ease", "cubic-bezier(0.2, 0, 0, 1)"],
      ["var" + "(--ed-ease-instrument, cubic-bezier(0.4, 0, 0.2, 1))", "--ed-ease-instrument", "cubic-bezier(0.4, 0, 0.2, 1)"],
      ["var" + "(--ed-ease-paper, cubic-bezier(0.215, 0.61, 0.355, 1))", "--ed-ease-paper", "cubic-bezier(0.215, 0.61, 0.355, 1)"],
    ];
    for (const [value, name, fallback] of easeSamples) {
      const m = EASING_VALUE.exec(value);
      // 名字必须**整段**取到（前缀吞掉时 m[1] 会是 `--ed-ease`、m 直接为 null 也在这里现形）
      expect([m?.[1], m?.[2]], `缓动消费点被漏解析 / 名字被前缀吞掉：${value}`).toEqual([name, fallback]);
    }
    // 反例（防空真）：形态不符的写法必须**不**被放过 —— 无兜底 / 兜底类型错位 / 值里带别的写法
    for (const badValue of ["var" + "(--ed-ease)", "var" + "(--ed-ease, 120ms)", "var" + "(--ed-dur-micro, cubic-bezier(0.2, 0, 0, 1))"]) {
      const ok = DURATION_VALUE.test(badValue) || EASING_VALUE.test(badValue);
      expect(ok, `这台解析器把不合规的写法也放过了：${badValue}`).toBe(false);
    }
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

  /* T13 追加（控制方 2026-09-13 第二次追加 B）：R18.1 的 `!important` 判据只管**档位块**与 reduced 块，
   * 响应层节自己「零 `!important`」今天没有判据 —— 有人往里加一条 `!important` 就会反转
   * 「行内样式优先于类规则」这条 ADR-033 §4 的既成语义（`motion.css` 头部 ⑤ 逐字），而全仓无人察觉。 */
  it("I-4：响应层节**零** `!important`（防反转「行内优先于类」的语义）", () => {
    const flagged = (text: string): string[] =>
      [...text.matchAll(/([a-z-]+)\s*:\s*([^;{}]*!important[^;{}]*)/g)].map((m) => `${m[1]}: ${m[2].trim()}`);
    expect(SECTION.length, "响应层节读空了 ⇒ 本条是空真").toBeGreaterThan(500);
    expect(
      flagged(SECTION),
      `响应层出现了 !important ⇒ 行内样式再也盖不过类规则（ADR-033 §4 的「行内优先于类」被反转）：\n${flagged(SECTION).join("\n")}`,
    ).toEqual([]);
    // 反例对照（防空真）：同一台扫描器对已知样本必须报满，对干净样本必须 0
    expect(flagged(".x { opacity: .5 !important; transition-duration: 1ms !important; }")).toEqual([
      "opacity: .5 !important",
      "transition-duration: 1ms !important",
    ]);
    expect(flagged(".x { opacity: .5; transition-duration: 1ms; }")).toEqual([]);
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
