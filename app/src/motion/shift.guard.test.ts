/**
 * @ai-context shift.guard.test.ts — 位移上限 8px 的**扩域守卫**（批 6 T9 · R11.4 · 计划 V1/V4b）。
 *
 * Why 单独成件：计划 Step 2 要「把 `style-seams.test.ts` 的位移判据域从 `primitives/*.css` 扩到全仓」，
 * 而该文件早已贴到硬限（🔴 T14b 更正过时读数：原文写「T5 之后已 297 行（余 3）」，**实测已漂到 299 / 300，
 * 余 1**）⇒ 扩域要的遍历器与名单跟着挤不进 300 行。⚠️ 该数字**随 `style-seams.test.ts` 的每次改动漂移**
 * （本行只是落地时的读数）⇒ 引用前**必须自己用 `ReadAllLines` 口径重测**，不许照抄本行。计划 Files 表因此
 * 预置了本文件（`app/src/motion/shift.guard.test.ts`）作为**拆出去的落点**；`style-seams.test.ts` 只留
 * 一条 2 行的常量对拍（防「两边各写一个 8」）。两处判据的**正则与换算逻辑逐字同源**（原样抄自
 * `style-seams.test.ts` 的 `shiftViolations`），本件的域**严格包含**那一处的域。
 *
 * 判据域（R11.4「裁决域 = 只判 `translate*()` + `motion/` 层的位移常量」）：
 *   ① `app/src/**` 的**生产** `.css` / `.ts` / `.tsx`（剥注释后）的 `translate*()` 数值实参 ≤ 8px；
 *   ② `app/src/motion/**` 的**生产**模块里 `*_PX` 具名位移常量 ≤ 8px。
 *   🔴 **测试文件（`*.test.ts` / `*.test.tsx`）不在域内** —— 实测依据：R8.1 的「唯一正解」harness 用
 *   **大位移样本**做测量（`motion.md` 的逐字例子是 `x: 0 → 100` ⇒ `translate3d(87.5px,0px,0px)`），
 *   T3 的 `engine.test.ts` 就断言 `translate3d(50px, 0px, 0px)` ⇒ 把测试文件拉进域会让本判据**当场红在
 *   别人的已提交文件上**，而那是**测量样本**不是交付的动效（§8.4 管的是后者）。⇒ 逐条登记在报告里。
 *   ③ `margin` / `left` / `top` 的 >8px **不判**（R11.4：实测全是布局量，判它们会造假阳性）；
 *      `%` / `calc()` / `var()` 形态**有意跳过**（居中与扫光，不是位移量 —— 既有口径逐字保留）。
 *
 * 副作用：只读磁盘（整棵 `app/src`）；不写任何文件。
 * 边界：① 剥注释复用共享仪器 `ui/primitives/sliceScan.ts` 的状态机（R8.7 的正解先例；同批 T4 的
 *   `engine.guard.test.ts` 同款用法）；② **文本级扫描，不做 AST** —— 它只能证「字面量在不在」，
 *   不证实现是否真的遵守（评审 I-4 的那条限度）；③ 未按 `*_PX` 命名的位移常量（如 `CARD_LIFT = 12`）
 *   本判据抓不到，只由评审兜 —— **诚实登记，不声称封死**。
 *   ④ 🔴 **语法洞的剩余边界（R29.2 收窄后仍未关掉的面 · R36.1①）**：读口是**文本正则、不是 TS 解析器**
 *      （见 ②）。收窄后它认得「`= 字面量 ;`」这一族（可带类型标注、可套 `Number()`、可套括号、可跨行、
 *      负号按 `Math.abs` 取值）；**仍看不见**的形态逐字如下：**运算表达式**（`8 + 4`）· **三元**
 *      （`x ? 12 : 4`）· **模板串**（`` `12` ``）· **`as const`**（`12 as const`）· **十六进制**（`0xc`）·
 *      **右值来自跨文件导入或计算**（`= IMPORTED_PX` / `= BASE * 2`）。另有三条**结构性限度**：
 *      类型标注里含 `=`（如函数类型 `() => void`）会让读口错位 · 缺分号（ASI）的声明会把右值捕到**下一条**
 *      声明的 `;` · 右值里含 `;`（字符串 / 模板串内）会被截断。⇒ 这些面**由评审兜**，本判据不声称覆盖。
 *      ⚠️ **上表是实例、不是穷举**：穷举口径 = 右值折叠空白后**整段**匹配不上 `LITERAL_RHS` 的一律看不见
 *      （实测同类的还有 `.5` / `1_000` / `Number(变量)` / `Math.min(8, y)` 这类合法计算式）。
 *   ⑤ **正面口径（不许读成全覆盖）**：本判据只保证「**它看得见的形态必须 ≤ 8px**」——**不是**「所有 TS
 *      形态都被覆盖」。⇒ **有意不做 fail-closed**：非字面量 `_PX` 的**合法**来源包括跨文件导入与计算 ⇒
 *      判红会把合法写法当犯规 = **假阳性**；本仓口径 **判据错杀比漏判更坏**（它会挡住正当改动）——
 *      R36.1④ 逐字裁定「**不取 fail-closed**」。剩余边界以 ④ 为准，逐字登记，不假装全覆盖。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { relOf, stripComments } from "../ui/primitives/sliceScan";
import { SHIFT_MAX_PX } from "./shift";

const SRC_ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // app/src
const MOTION_ROOT = join(SRC_ROOT, "motion");
const DOMAIN_EXT = /\.(?:css|ts|tsx)$/;
const TEST_FILE = /\.test\.tsx?$/;
const SOURCE_FILE = /\.tsx?$/;

/** 递归收集域内文件（生产面；`.d.ts` 之类也照扫 —— 它们不产位移，扫了无害） */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (DOMAIN_EXT.test(name) && !TEST_FILE.test(name)) out.push(path);
  }
  return out;
}

/** 既有口径（`style-seams.test.ts` 原样）：`translate*()` 的全部调用；百分比 / `calc()` / `var()` 由数值判定跳过 */
const TRANSLATE_CALL = /translate(?:3d|X|Y|Z)?\(([^)]*)\)/g;
const NUMERIC_ARG = /^\s*(-?\d+(?:\.\d+)?)(px|rem)\s*$/;

/** 一条 `translate*()` 调用里的**数值实参**（px / rem；rem 按 16 换算，与既有口径一致） */
interface ShiftSite {
  readonly call: string;
  readonly value: number;
}

function shiftSites(text: string): ShiftSite[] {
  const out: ShiftSite[] = [];
  for (const m of stripComments(text).matchAll(TRANSLATE_CALL)) {
    for (const arg of m[1].split(",")) {
      const px = NUMERIC_ARG.exec(arg);
      if (!px) continue;
      out.push({ call: m[0], value: px[2] === "rem" ? Math.abs(Number(px[1])) * 16 : Math.abs(Number(px[1])) });
    }
  }
  return out;
}

/** 计划 V1 的判据体：域内逐文件找 > `SHIFT_MAX_PX` 的位移量，返回可读的犯规清单 */
function shiftViolations(text: string, file: string): string[] {
  return shiftSites(text)
    .filter((s) => s.value > SHIFT_MAX_PX)
    .map((s) => `${file}: ${s.call} = ${s.value}px > ${SHIFT_MAX_PX}px`);
}

/** 读口（R29.2 收窄）：`export const <名>[: <标注>] = <右值>;` —— 右值**整段**交给 `LITERAL_RHS` 判形态 */
const NUMERIC_CONST = /export const ([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*([\s\S]*?);/g;
/** 字面量右值：裸数字 / `Number(...)` 包装 / 任意层括号（跨行已折叠空白）；**不匹配 ⇒ 跳过、不判红**（文件头 ④⑤） */
const LITERAL_RHS = /^\(*\s*(?:Number\s*\(\s*)?(-?\d+(?:\.\d+)?)(?:\s*\))?\s*\)*$/;
const PX_NAME = /_PX$/;

interface NumericConst {
  readonly name: string;
  readonly value: number;
}

function numericConstants(text: string, onlyPxNames: boolean): NumericConst[] {
  const out: NumericConst[] = [];
  for (const m of stripComments(text).matchAll(NUMERIC_CONST)) {
    if (onlyPxNames && !PX_NAME.test(m[1])) continue;
    const lit = LITERAL_RHS.exec(m[2].replace(/\s+/g, " ").trim());
    if (lit === null) continue; // 非字面量右值：本读口看不见 —— 剩余边界见文件头 ④（有意不 fail-closed，见 ⑤）
    out.push({ name: m[1], value: Math.abs(Number(lit[1])) });
  }
  return out;
}

const readText = (file: string): string => readFileSync(file, "utf8");

describe("V1 全仓生产文件的 `translate*()` 数值实参 ≤ 8px（R11.4 的扩域半）", () => {
  it("域内生产文件逐条扫（实测 330 件），>8px 的位移量为 0（剥注释后）", () => {
    const files = walk(SRC_ROOT);
    const rels = files.map((f) => relOf(SRC_ROOT, f));
    // 防空扫：遍历器必须看得见这几件（含动效宿主样式表与本模块自身），否则下面的 `[]` 一文不值
    expect(files.length, "扫描域不该缩到空（T9 实测生产面 330 件）").toBeGreaterThanOrEqual(300);
    for (const known of ["main.tsx", "ui/primitives/motion.css", "motion/shift.ts"]) {
      expect(rels, `域内必须含 ${known}（遍历器静默失效时本判据会变恒真）`).toContain(known);
    }

    const violations = files.flatMap((f) => shiftViolations(readText(f), relOf(SRC_ROOT, f)));
    expect(violations, `全仓位移超过规格 §8.4 的 ${SHIFT_MAX_PX}px 上限：\n${violations.join("\n")}`).toEqual([]);
  });

  it("域收窄的守门：测试文件一个都不许进域（否则 R8.1 的测量样本会当场假红）", () => {
    const leaked = walk(SRC_ROOT)
      .map((f) => relOf(SRC_ROOT, f))
      .filter((f) => TEST_FILE.test(f));
    expect(leaked, "测试文件被拉进域 ⇒ `engine.test.ts` 实测的 50px 测量样本会假红（域收窄理由见文件头）").toEqual([]);
  });

  it("口径锚：>8px 命中 / =8px 不命中 / `%`·`var()` 跳过 / 注释里的字面量不算命中 / rem 按 16 换算", () => {
    // 犯规样本用拼接写（本文件文本里不出现完整犯规字面量 —— 防「全文件文本扫描」型守卫的误伤）
    const bad = "transform: rotate(0deg) translateY(" + "12px)";
    expect(shiftViolations(bad, "synth.css")).toEqual(["synth.css: translateY(12px) = 12px > 8px"]);

    expect(shiftViolations("transform: translateY(" + "8px)", "synth.css"), "8px 恰在上限上（`>` 不是 `>=`）").toEqual([]);
    expect(shiftViolations("transform: translate(-50%, -50%)", "synth.css"), "居中技巧不是位移量").toEqual([]);
    expect(shiftViolations("transform: translateX(var(--ed-x, 4px))", "synth.css"), "var() 不是字面量").toEqual([]);

    const hidden = "/* translateY(" + "12px) */\n.x { transform: translateY(" + "1px); }";
    expect(hidden, "锚自身必须含犯规样本，否则它在测空气").toContain("translateY(");
    expect(shiftViolations(hidden, "synth.css"), "剥注释失效 ⇒ 本守卫会在注释上假红").toEqual([]);

    expect(shiftViolations("transform: translateY(0.6rem)", "synth.css"), "0.6rem = 9.6px 应被判红").toHaveLength(1);
    expect(shiftViolations("transform: translateY(0.5rem)", "synth.css"), "0.5rem = 8px 不判").toEqual([]);
  });
});

describe("V4b `motion/` 层的位移常量 ≤ 8px（R11.4 的第二半）", () => {
  it("`motion/**` 生产模块的 `*_PX` 具名常量逐条 ≤ SHIFT_MAX_PX", () => {
    const files = walk(MOTION_ROOT).filter((f) => SOURCE_FILE.test(f));
    const consts = files.flatMap((f) =>
      numericConstants(readText(f), true).map((c) => ({ file: relOf(SRC_ROOT, f), ...c })),
    );
    // 防空扫：本层的位移出口常量必须在这份名单里（否则是遍历器/正则失效）
    expect(consts.map((c) => c.name), "`motion/` 层的 `*_PX` 名单里必须有唯一出口常量").toContain("SHIFT_MAX_PX");
    for (const c of consts) {
      expect(c.value, `${c.file}: ${c.name} = ${c.value} 越过 §8.4 的 ${SHIFT_MAX_PX}px`).toBeLessThanOrEqual(SHIFT_MAX_PX);
    }
  });

  it("`shift.ts` 自身的**全部**导出数值常量 ≤ 8px（不只 `_PX` 命名面 —— 它是位移模块，时长不该住这）", () => {
    const consts = numericConstants(readText(join(MOTION_ROOT, "shift.ts")), false);
    expect(consts.map((c) => c.name)).toContain("SHIFT_MAX_PX");
    for (const c of consts) {
      expect(c.value, `motion/shift.ts: ${c.name} = ${c.value} 越过 §8.4 的 ${SHIFT_MAX_PX}px`).toBeLessThanOrEqual(SHIFT_MAX_PX);
    }
  });

  it("口径锚：合成的 `_PX` 常量 —— >8px 必须被抓到、=8px 不抓、非 `_PX` 名在 `_PX` 口径下不抓", () => {
    const bad = "export const CARD_LIFT_PX = " + "12;";
    const ok = "export const SHIFT_MAX_PX = " + "8;";
    const other = "export const STAGGER_MS = " + "60;";
    expect(numericConstants(bad, true).map((c) => c.value)).toEqual([12]);
    expect(numericConstants(ok, true).map((c) => c.value)).toEqual([8]);
    expect(numericConstants(other, true), "`_PX` 口径只收位移常量（毫秒常量不在此列）").toEqual([]);
    expect(numericConstants(other, false).map((c) => c.value), "`shift.ts` 全量口径收得下它").toEqual([60]);
  });
});
