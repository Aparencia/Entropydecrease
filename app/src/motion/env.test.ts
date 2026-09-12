/**
 * @ai-context env.test.ts — **环境层四件 + `@keyframes` 桶边界**的守卫（批 6 T13；node 环境，无 DOM）。
 *
 * Why：环境层四件（规格 §8.1 逐字「2–6s 循环｜应用在呼吸｜**探针摆动** · **采集脉冲** · **未确认段落墨度
 *   极缓慢起伏（幅度 2%）** · **到期刻度微光**」）今天有三件**连承载面都不存在**（采集态 LIVE 仪表在波 B
 *   的 T18、到期刻度在 T21、低置信段正文在 T25/T28）⇒ T13 落的是 **seam**：`@keyframes` + 落点类规则 +
 *   reduced-motion 名单 + 幅度真源。本文件把 seam 侧的六条判据写成机器可判（每条各带专属变异体，
 *   读数见 `task-13-report.md`）：
 *   **V1 桶边界**：`@keyframes` **只许进 `motion.css`**（`Loading.css` 仍恰 2、`Button.css`/`StatusLine.css`
 *      恰 0 —— 三条既有守卫各守一处，本文件做**全层普查**，防"第四条路"从别的文件开出来）。
 *   **V2 登记表 ↔ CSS 对拍**：`motion/env.ts` 的 `AMBIENT_ITEMS` 逐条的 `keyframes` 名必须真出现在其
 *      `selector` 规则体里，且该选择器**逐字**在 reduced-motion 名单里（G7 的既有判据再兜一层）。
 *   **V3 周期带与档位方向**：三条新落点的 standard 周期 ∈ **2000–6000ms**（§8.1 的环境层带），且一律
 *     从唯一真源 `--ed-dur-skeleton` 派生；四件在 `rich` 档周期 ∈ [2000ms, standard]（**频率只许提高**、
 *     不得越出带外）、在 `eco` 档一律 `1ms` + `iteration-count: 1`（§8.5「节能档只留响应层」）。
 *   **V4 幅度逐字 2%**：`ed-unconfirmed-breathe` 的 `opacity` 极值差 == `LOW_CONFIDENCE_INK_AMPLITUDE`，
 *     且该 keyframes **只动墨度**（不含 `transform` 族）—— 幅度只许有一个数值落点（CSS 里不写 `0.02`）。
 *   **V5 单一真源**：`motion.css` 剥注释后 `--ed-*` 定义恒 0；环境层落点的 `animation` 一律是
 *     「token + 同值兜底 + infinite」形态，**没有**裸时长字面量（唯二例外是 `Loading.css` 的 `2.4s`，
 *     已逐字登记在 `docs/standards/motion.md`）。
 *   **V6 第 ③ 件的落点侧**：`lowConfidenceClass()` 返回 `<既有基类>--<修饰>` 形状的新类名（R12.1）、
 *     阈值仍是 `< 0.5`，且 `Text.css` 真有该修饰类的规则。⚠️ **V4b/V4c（真接线的 DOM 判据与调用点计数）
 *     本任务未达成** —— 两个落点文件属 T25/T28 的写者队列（R12.4），本文件不写会红的判据来充数。
 *
 * 副作用：只读磁盘（`primitives/*.css` + 生成器导出），不修改任何文件。
 * 边界：① 口径 = 剥注释后的文本（本仓「注释字面量骗过整文件扫描器」已有 3 例）；
 *   ② 本文件不得出现 `var(--ed-` 的**裸串**（`motionTokens.consumption.test.ts` 会把它当「缺兜底的消费点」
 *      ⇒ 假红）⇒ 取 token 的正则一律写成转义形态 `var\(`；
 *   ③ 三条落点今天 **0 生产调用点** ⇒ 本文件**不**判「DOM 上真有这个类」（那是 T18/T21/T25/T28）。
 */
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DURATION_TOKENS, EASING_TOKENS } from "../../scripts/gen-tokens.mjs";
import { lowConfidenceClass } from "../components/structuredBlocks";
import { AMBIENT_ITEMS, LOW_CONFIDENCE_CLASS, LOW_CONFIDENCE_INK_AMPLITUDE } from "./env";
import {
  PRIMITIVES, blockAt, declaredProps, declarationValue, parseRules, readPrimitiveCss,
  reducedMotionSelectors, stripComments,
} from "./responseScan";

const CSS_FILES: readonly string[] = readdirSync(PRIMITIVES).filter((f) => f.endsWith(".css"));
const MOTION_CSS = stripComments(readPrimitiveCss("motion.css"));
const TEXT_CSS = stripComments(readPrimitiveCss("Text.css"));
const MOTION_RULES = parseRules(MOTION_CSS);
/** ① 探针摆动复用 `Loading.css` 的既有落点（G5：本批零改动），档位调制则在本文件里判 */
const PROBE = ".ed-probe";
const KEYFRAME_NAMES = /@keyframes\s+([A-Za-z0-9_-]+)/g;
/** 声明了 `animation` / `animation-name` 的规则体（含厂商前缀与大写属性名 —— 同 motion-coverage 的口径） */
const DECLARES_ANIMATION = /(?:^|[;\s])(?:-(?:webkit|moz|ms|o)-)?animation(?:-name)?\s*:/i;

/** 一份样式表里的 `@keyframes` 名（**逐序**；注释先剥 ⇒ 注释里提到的名字不算定义） */
const keyframesIn = (file: string): string[] =>
  [...stripComments(readPrimitiveCss(file)).matchAll(KEYFRAME_NAMES)].map((m) => m[1]);

/** 规则体 → 有效周期（ms）：`calc(var(--ed-dur-skeleton, 1200ms) * N [/ M])` ⇒ `1200·N/M`；不是该形态即 `null` */
function skeletonMultipleMs(body: string): number | null {
  const m = /calc\(var\(--ed-dur-skeleton,\s*1200ms\)\s*\*\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\)/.exec(body);
  if (m === null) return null;
  return (1200 * Number(m[1])) / Number(m[2] ?? "1");
}

/** 某选择器在本层的规则（`primitives/*.css` 逐文件找；找不到即 `undefined`） */
const ruleOf = (selector: string): { readonly file: string; readonly body: string } | undefined => {
  for (const file of CSS_FILES) {
    const found = parseRules(stripComments(readPrimitiveCss(file))).find((r) => r.selector === selector);
    if (found !== undefined) return { file, body: found.body };
  }
  return undefined;
};

/** 档位规则体（`html[data-motion="<tier>"] <selector>`） */
const tierBody = (tier: string, selector: string): string | undefined =>
  MOTION_RULES.find((r) => r.selector === `html[data-motion="${tier}"] ${selector}`)?.body;

describe("V1 桶边界：`@keyframes` 只许进 motion.css（G5 的「Loading.css 恰 2」是既有断言）", () => {
  it("逐文件普查（逐序数组相等）：motion 恰 3 条新循环 · Loading 恰 2 · EmptyState 恰 1 · Button/StatusLine 恰 0", () => {
    expect(keyframesIn("motion.css"), "环境层的新 keyframes 只许写进 motion.css（桶边界的唯一出口）").toEqual([
      "ed-capture-pulse",
      "ed-unconfirmed-breathe",
      "ed-due-glow",
    ]);
    expect(keyframesIn("Loading.css"), "Loading.css 必须仍恰 2 条（Loading.test.tsx:177 的只读判据）").toEqual([
      "ed-skeleton-shimmer",
      "ed-probe-swing",
    ]);
    expect(keyframesIn("EmptyState.css")).toEqual(["ed-empty-in"]);
    expect(keyframesIn("Button.css"), "Button.css 被既有守卫禁止新增 keyframes").toEqual([]);
    expect(keyframesIn("StatusLine.css"), "分桶裁定：状态行归 transition、无循环动画").toEqual([]);
  });

  it("全层普查：`primitives/*.css` 的 keyframes 全集 = 上面三文件的并集（第四条路开不出来）", () => {
    expect(CSS_FILES.length, "primitives/ 下的样式表数量不应减少").toBeGreaterThanOrEqual(10);
    const census = CSS_FILES.flatMap((f) => keyframesIn(f).map((name) => `${f}:${name}`));
    expect([...census].sort()).toEqual([
      "EmptyState.css:ed-empty-in",
      "Loading.css:ed-probe-swing",
      "Loading.css:ed-skeleton-shimmer",
      "motion.css:ed-capture-pulse",
      "motion.css:ed-due-glow",
      "motion.css:ed-unconfirmed-breathe",
    ]);
  });

  it("口径自证（防空真）：已知 keyframes 必命中 · 注释里的名字不命中 · 无意义串 0 命中", () => {
    const synthetic = "/* @keyframes ed-not-real */\n@keyframes ed-real-one { from { opacity: 0; } }";
    expect([...stripComments(synthetic).matchAll(KEYFRAME_NAMES)].map((m) => m[1])).toEqual(["ed-real-one"]);
    expect([...stripComments(synthetic).matchAll(/@keyframes\s+ed-zzz\b/g)]).toEqual([]);
  });
});

describe("V2 登记表 ↔ CSS 对拍：`motion/env.ts` 的每条落点都必须真在 CSS 里配对", () => {
  it("三条落点（逐序）各自的规则体声明的 `animation` 名 == 登记表里的 keyframes 名", () => {
    expect(AMBIENT_ITEMS, "登记表不得缩水").toHaveLength(3);
    for (const item of AMBIENT_ITEMS) {
      const rule = ruleOf(item.selector);
      expect(rule, `primitives/*.css 里找不到落点 ${item.selector} 的规则（类名拼错 = 静默无样式）`).toBeDefined();
      expect(DECLARES_ANIMATION.test(rule?.body ?? ""), `${item.selector} 没有声明 animation`).toBe(true);
      expect(declarationValue(rule?.body ?? "", "animation"), `${item.selector} 的 animation 名与登记表不符`).toContain(
        item.keyframes,
      );
      // 定义一律在 motion.css（桶边界）—— 落点规则可以在别的文件（③ 在 Text.css），keyframes 不行
      expect(keyframesIn("motion.css"), `${item.keyframes} 的定义不在 motion.css（桶边界）`).toContain(item.keyframes);
    }
  });

  it("三条落点（含伪元素/修饰类的**选择器原文**）逐字在 reduced-motion 名单里（G7 的既有判据再兜一层）", () => {
    const entries = reducedMotionSelectors();
    expect(entries, "名单被清空 ⇒ 下面的包含断言全是空真").toContain(".ed-skeleton::after");
    for (const item of AMBIENT_ITEMS) expect(entries, `名单缺 ${item.selector}`).toContain(item.selector);
    expect(entries, "① 探针摆动复用既有落点，也必须在名单里").toContain(PROBE);
  });
});

describe("V3 周期带（§8.1「环境层 2–6s」）与档位方向（rich 只许提高频率 · eco 减弱/停）", () => {
  const ENV_SELECTORS: readonly string[] = [PROBE, ...AMBIENT_ITEMS.map((i) => i.selector)];

  it("三条新落点的 standard 周期 ∈ [2000ms, 6000ms]，且一律从 `--ed-dur-skeleton` 派生（无新时长字面量）", () => {
    for (const item of AMBIENT_ITEMS) {
      const body = ruleOf(item.selector)?.body ?? "";
      const ms = skeletonMultipleMs(body);
      expect(ms, `${item.selector} 的周期不是 token 派生的 calc() 倍数形态 → ${declarationValue(body, "animation")}`).not.toBeNull();
      expect(ms ?? 0, `${item.selector} 的周期 ${ms}ms 出了 §8.1 的环境层带（2–6s）`).toBeGreaterThanOrEqual(2000);
      expect(ms ?? 0).toBeLessThanOrEqual(6000);
    }
  });

  it("rich 档：四件都有规则，且周期 ∈ [2000ms, standard]（频率只许提高、不得越出带外）", () => {
    const probeStandard = Number(/(\d+(?:\.\d+)?)s/.exec(declarationValue(ruleOf(PROBE)?.body ?? "", "animation") ?? "")?.[1]) * 1000;
    expect(probeStandard, "`Loading.css` 的探针周期读不出来 ⇒ 下面的比较是空真").toBe(2400);
    for (const selector of ENV_SELECTORS) {
      const body = tierBody("rich", selector);
      expect(body, `rich 档缺 ${selector} 的规则（环境层在「丰富」档必须如实变丰富）`).toBeDefined();
      const rich = skeletonMultipleMs(body ?? "");
      expect(rich, `rich 档 ${selector} 的周期不是 token 派生的 calc() 倍数`).not.toBeNull();
      const standard = selector === PROBE ? probeStandard : (skeletonMultipleMs(ruleOf(selector)?.body ?? "") ?? 0);
      expect(rich ?? 0, `rich 档 ${selector} 的周期反而变长了（频率只许提高）`).toBeLessThanOrEqual(standard);
      expect(rich ?? 0, `rich 档 ${selector} 的周期出了 §8.1 的带（2–6s）`).toBeGreaterThanOrEqual(2000);
      expect(body ?? "", "rich 档一律直接覆写时长，不引私变量、不加 `!important`（那会反转无障碍优先级）").not.toContain("!important");
      expect(body ?? "", "rich 档只覆写 animation-duration（写 `animation:` 会让该选择器必须再进名单）").not.toMatch(
        /(?:^|[;\s])animation\s*:/,
      );
    }
  });

  it("eco 档：四件都有规则且都停住（`animation-duration: 1ms` + `iteration-count: 1`，§8.5「只留响应层」）", () => {
    for (const selector of ENV_SELECTORS) {
      const body = tierBody("eco", selector);
      expect(body, `eco 档缺 ${selector} 的规则（§8.5 节能档只留响应层）`).toBeDefined();
      expect(declarationValue(body ?? "", "animation-duration"), `eco 档没把 ${selector} 的环境层循环停掉`).toBe("1ms");
      expect(declarationValue(body ?? "", "animation-iteration-count")).toBe("1");
    }
  });
});

describe("V4 幅度逐字 2%（§8.1）且未确认段落的起伏**只动墨度**", () => {
  /** keyframes 体（取不到时**抛**，不让「找不到」静默退化成空真 —— 同 responseScan 的口径） */
  const breatheBody = (): string => {
    const at = MOTION_CSS.indexOf("@keyframes ed-unconfirmed-breathe");
    if (at < 0) throw new Error("motion.css 里找不到 `@keyframes ed-unconfirmed-breathe`");
    const [open, close] = blockAt(MOTION_CSS, at);
    return MOTION_CSS.slice(open + 1, close);
  };

  it("`opacity` 极值差 === `LOW_CONFIDENCE_INK_AMPLITUDE`（0.02），且 CSS 里不写第二个 0.02", () => {
    const body = breatheBody();
    const values = [...body.matchAll(/opacity\s*:\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    expect(values.length, "抓不到 opacity 极值 ⇒ 本条是空真").toBeGreaterThanOrEqual(2);
    expect(Math.max(...values) - Math.min(...values), "墨度起伏的幅度不是 §8.1 逐字的 2%").toBeCloseTo(
      LOW_CONFIDENCE_INK_AMPLITUDE,
      10,
    );
    expect(LOW_CONFIDENCE_INK_AMPLITUDE, "幅度真源被改了（§8.1 逐字 2%）").toBe(0.02);
    expect(body, "幅度被写死进 CSS ⇒ 第二个真源（真源只在 motion/env.ts）").not.toContain("0.02");
  });

  it("该 keyframes 只声明 `opacity`（未确认段落的起伏是墨度，不是位置/缩放）", () => {
    const body = breatheBody();
    expect([...new Set(declaredProps(body))], "出现了 `opacity` 之外的声明（位移/缩放会把「极缓慢起伏」变成晃动）").toEqual([
      "opacity",
    ]);
    expect(body).not.toMatch(/transform|translate|scale|rotate/);
  });
});

describe("V5 单一真源：环境层零 `--ed-*` 定义 · 落点一律「token + 同值兜底 + infinite」", () => {
  it("`motion.css` 剥注释后零 `--ed-*` 定义（T5 的回归封条在环境层节上同样成立）", () => {
    expect(MOTION_CSS.match(/--ed-[a-z0-9-]+\s*:/g) ?? [], "motion.css 又出现了 `--ed-*` 定义").toEqual([]);
  });

  it("三条新落点的 `animation` 只有一处时间字面量（= `--ed-dur-skeleton` 的同值兜底 1200ms），且是 infinite", () => {
    const truth = new Set<string>([
      ...DURATION_TOKENS.map((t) => `--ed-dur-${t.name}`),
      ...EASING_TOKENS.map((t) => `--ed-${t.name}`),
    ]);
    for (const item of AMBIENT_ITEMS) {
      const value = declarationValue(ruleOf(item.selector)?.body ?? "", "animation") ?? "";
      const times = [...value.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)].map((m) => m[0]);
      expect(times, `${item.selector} 的周期里出现了 token 兜底之外的时间字面量：${value}`).toEqual(["1200ms"]);
      expect(value, `${item.selector} 不是无限循环（环境层「闲置时也要有生命感」）`).toContain("infinite");
      const consumed = [...value.matchAll(/var\((--ed-[a-z-]+)(?=[\s,)])/g)].map((m) => m[1]);
      expect(consumed.length, `${item.selector} 没消费任何动效 token：${value}`).toBeGreaterThanOrEqual(2);
      const unknown = consumed.filter((name) => !truth.has(name));
      expect(unknown, `${item.selector} 消费了真源名册里没有的 token（名字打错了？）`).toEqual([]);
    }
  });
});

describe("V6 第 ③ 件的落点侧（R11.3 / R12.1）：新类名形状 + `Text.css` 真有规则", () => {
  it("`lowConfidenceClass()` 返回既有基类的修饰类（阈值仍 `< 0.5`，不改第二阈值）", () => {
    expect(lowConfidenceClass(0.3), "低置信段没有拿到新类名").toBe(LOW_CONFIDENCE_CLASS);
    expect(LOW_CONFIDENCE_CLASS.startsWith("ed-text--"), "类名必须是既有基类 `ed-text` 的修饰类（选择器域约束）").toBe(
      true,
    );
    expect([lowConfidenceClass(0.5), lowConfidenceClass(null), lowConfidenceClass(undefined)]).toEqual(["", "", ""]);
  });

  it("`Text.css` 里有该修饰类的规则、它声明了环境层的 keyframes，且逐字进 reduced-motion 名单", () => {
    const rule = parseRules(TEXT_CSS).find((r) => r.selector === `.${LOW_CONFIDENCE_CLASS}`);
    expect(rule, `Text.css 缺 .${LOW_CONFIDENCE_CLASS} 的规则（类名对、样式静默失效）`).toBeDefined();
    expect(declarationValue(rule?.body ?? "", "animation")).toContain("ed-unconfirmed-breathe");
    expect(reducedMotionSelectors(), "名单缺这条落点 ⇒ reduced-motion 下照旧起伏").toContain(`.${LOW_CONFIDENCE_CLASS}`);
  });
});
