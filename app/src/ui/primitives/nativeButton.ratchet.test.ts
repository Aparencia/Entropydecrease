// @vitest-environment node
/**
 * @ai-context **原生按钮棘轮**（批 4 B4 裁决的落点）：**只许减少，不许新增**。
 *
 * Why 需要这条守卫：B4 裁定 `Button` 的范围 = `*Btn*` 常量族 + 本批新代码 + **棘轮**，理由是
 * 全仓 **510 处 / 121 文件**原生 `<button>` 单批迁不完（且 121 个文件里 77 个无同名测试）。
 * 没有棘轮，「永远迁不完」就会退化成「永远在迁」：新代码继续写原生按钮，而没有任何判据说话。
 *
 * Why 判据是「计数」而不是「逐行原文」（与 `ui/zIndex.guard.test.ts` 的口径**刻意不同**）：
 * 本批有**拆件**任务（B7：`ChatPage.tsx` 599/600 必须先拆）⇒ 逐行 key 会因为「同一行搬到了
 * 新文件」从「命中」变成「新增」而**假红**。计数口径下，搬运由 `SPLIT_MOVES` 显式登记守恒。
 *
 * ★ 扫描口径（与 `tmp/classify.mjs` 的 `buttonTag` **逐字同源**；口径本身是守卫的一部分）
 *   ① 域 = `app/src/**` 的 `.ts`/`.tsx` 减 `*.test.ts(x)` 减 `ui/primitives/**` 减 `ui/icons/**`。
 *      排除原语是因为 `ui/primitives/Button.tsx` **就是**那个 `<button>` 的落点。
 *   ② **先剥注释**（`//` 与块注释抹为等长空白）；字符串/模板字面量**只跳过、不抹内容**。
 *   ③ 计「处」= 剥注释后**整段文本**上 `/<button[\s>]/g` 的匹配数（**不是逐行** —— 逐行会把
 *      跨行标签漏掉：同一棵树实测逐行 385 vs 整段 510）。
 *   ④ 不记 `</button>`（不匹配）与 `<Button>`（大小写敏感，不匹配）。
 *   已知边界（有意保留、并有用例钉住）：字符串字面量里的 `<button` 会被计入 —— 实测本仓 0 例。
 *
 * 副作用：只读磁盘（递归遍历 `app/src`），不修改任何文件。
 * 边界：**批 4 T12 迁的是 `*Btn*` 常量族的直接消费者 91 处 / 34 文件**（两个登记例外见
 * `nativeButtonBaseline.ts` 头注）；其余余量登记给批 5/7。基线随迁移**只降不升**
 * （T1 冻结 510/121 → T5–T10 后 493/121 → T12 后 402/114）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FROZEN_BTN_STYLE_CONST_FILES,
  FROZEN_BTN_STYLE_CONST_LINES,
  FROZEN_NATIVE_BUTTON_BY_FILE,
  FROZEN_NATIVE_BUTTON_TOTAL,
  SPLIT_MOVES,
} from "./nativeButtonBaseline";

const HERE = dirname(fileURLToPath(import.meta.url));
/** `app/src` —— 基线的键就是相对这个目录的正斜杠路径。 */
const SRC = join(HERE, "..", "..");

/** 计「处」的判据：`<button` 后跟空白或 `>`。`</button>` 与 `<Button>` 均不匹配。 */
const RE_BUTTON = /<button[\s>]/g;
/** `const *Btn* = / :` 样式常量族（与 `classify.mjs` 的 `btnStyleConst` 同一正则）。 */
const RE_BTN_CONST = /const\s+\w*[Bb]tn\w*\s*[:=]/g;

/**
 * 剥注释：**与 `tmp/scan-callsites.mjs` 的 `stripComments()` 同一状态机**（刻意重写一份而不是
 * import —— 那个文件在 gitignored 的 `tmp/` 下，测试**不能**依赖它存在）。
 * 抹成等长空白以保行号；字符串/模板/正则字面量只跳过不抹内容（改口径等于改守卫）。
 */
function stripComments(src: string): string {
  const out = src.split("");
  const blank = (a: number, b: number): void => {
    for (let i = a; i < b; i++) if (out[i] !== "\n") out[i] = " ";
  };
  const isRegexStart = (k: number): boolean => {
    let j = k - 1;
    while (j >= 0 && /\s/.test(src.charAt(j))) j--;
    if (j < 0) return true;
    return "(,=:[!&|?{};+-*%~^<>".includes(src.charAt(j));
  };
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src.charAt(i);
    if (c === "/" && src.charAt(i + 1) === "/") {
      const end = src.indexOf("\n", i);
      blank(i, end < 0 ? n : end);
      i = end < 0 ? n : end;
      continue;
    }
    if (c === "/" && src.charAt(i + 1) === "*") {
      const end = src.indexOf("*/", i + 2);
      blank(i, end < 0 ? n : end + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src.charAt(j) !== c) {
        if (src.charAt(j) === "\\") j++;
        if (src.charAt(j) === "\n") break;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (c === "`") {
      let j = i + 1;
      while (j < n && src.charAt(j) !== "`") {
        if (src.charAt(j) === "\\") j++;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (c === "/" && isRegexStart(i)) {
      let j = i + 1;
      let cls = false;
      let ok = false;
      while (j < n) {
        const d = src.charAt(j);
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (d === "\n") break;
        if (d === "[") cls = true;
        else if (d === "]") cls = false;
        else if (d === "/" && !cls) {
          ok = true;
          break;
        }
        j++;
      }
      if (ok) {
        blank(i + 1, j);
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  return out.join("");
}

/** 纯计数（供扫描与仪器自证共用）：`new RegExp(re.source,"g")` —— **不是** `eval`。 */
function countOf(text: string, re: RegExp): number {
  return (text.match(new RegExp(re.source, "g")) ?? []).length;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const isTest = (f: string): boolean => /\.test\.(ts|tsx)$/.test(f);
const isPrim = (f: string): boolean => f.includes(`${sep}ui${sep}primitives${sep}`);
const isIcons = (f: string): boolean => f.includes(`${sep}ui${sep}icons${sep}`);

interface Scan {
  /** 相对 `app/src` 的正斜杠路径 → `<button` 处数（只含 >0 的文件） */
  buttonByFile: Map<string, number>;
  buttonTotal: number;
  btnConstLines: number;
  btnConstFiles: number;
}

function scan(): Scan {
  const buttonByFile = new Map<string, number>();
  let buttonTotal = 0;
  let btnConstLines = 0;
  let btnConstFiles = 0;
  for (const f of walk(SRC)) {
    if (isTest(f) || isPrim(f) || isIcons(f)) continue;
    const stripped = stripComments(readFileSync(f, "utf8"));
    const rel = relative(SRC, f).split(sep).join("/");
    const n = countOf(stripped, RE_BUTTON);
    if (n > 0) {
      buttonByFile.set(rel, n);
      buttonTotal += n;
    }
    const c = countOf(stripped, RE_BTN_CONST);
    if (c > 0) {
      btnConstLines += c;
      btnConstFiles += 1;
    }
  }
  return { buttonByFile, buttonTotal, btnConstLines, btnConstFiles };
}

const SCAN = scan();
const BASELINE = FROZEN_NATIVE_BUTTON_BY_FILE;
const SPLIT_TARGETS = new Set(SPLIT_MOVES.map((m) => m.split("|")[0]));

describe("原生按钮棘轮（B4）：基线随迁移只降不升（T12 后 402 处 / 114 文件）", () => {
  it("仪器自证：能命中已知存在的串 · 对无意义串报 0 · 且剥注释生效（末条是**已知边界**）", () => {
    expect(countOf("const a = <button onClick={f}>x</button>;", RE_BUTTON)).toBe(1);
    expect(countOf("const a = <butto n />;", RE_BUTTON)).toBe(0);
    // 剥注释：整行注释与块注释里的标签都不算命中（仓内已多次注释误伤）
    expect(countOf(stripComments("// <button style={x}>\n"), RE_BUTTON)).toBe(0);
    expect(countOf(stripComments("/* <button style={x}> */\n"), RE_BUTTON)).toBe(0);
    // 已知边界（有意保留）：字符串字面量里的标签**仍会被计入** —— 实测本仓 0 例
    expect(countOf(stripComments('const s = "<button>";\n'), RE_BUTTON)).toBe(1);
    // 真实文件阳性对照：本文件被排除，另点一个**域内**且已知含按钮的文件
    expect(SCAN.buttonByFile.get("components/ImageGallery.tsx") ?? 0).toBeGreaterThan(0);
    expect(BASELINE["components/ImageGallery.tsx"]).toBeGreaterThan(0);
  });

  it("① 总量只减不增（`<button` 处数 ≤ 冻结基线）", () => {
    expect(
      SCAN.buttonTotal,
      `全仓原生 \`<button>\` 已从基线 ${FROZEN_NATIVE_BUTTON_TOTAL} 涨到 ${SCAN.buttonTotal} —— 新代码请用 \`Button\`（barrel: ui/primitives）`,
    ).toBeLessThanOrEqual(FROZEN_NATIVE_BUTTON_TOTAL);
  });

  it("② 逐文件只减不增（拆分面回潮就是这里红）", () => {
    const regressions: string[] = [];
    for (const [file, cur] of SCAN.buttonByFile) {
      const base = BASELINE[file];
      if (base === undefined) {
        if (!SPLIT_TARGETS.has(file)) regressions.push(`${file}: 新增文件带 ${cur} 处，基线里没有（拆件请登记 SPLIT_MOVES）`);
        continue;
      }
      if (cur > base) regressions.push(`${file}: ${base} → ${cur}（+${cur - base}）`);
    }
    expect(regressions, `以下文件的原生按钮数超过冻结基线：\n${regressions.join("\n")}`).toEqual([]);
  });

  it("③ 基线无僵尸键（清单里的每个文件都还在扫描域内存在）", () => {
    const zombies: string[] = [];
    for (const file of Object.keys(BASELINE)) {
      const abs = join(SRC, file);
      // 用 `existsSync` 而不是 `statSync(...).isFile()`：本仓的 `@types/node` 版本下
      // `Stats.isFile` 在 tsc 下报 TS2339（同 `columnRegistry.test.ts:43` 记的 withFileTypes 缺口）。
      if (!existsSync(abs)) zombies.push(`${file}: 文件不存在`);
      else if (isTest(abs) || isPrim(abs) || isIcons(abs)) zombies.push(`${file}: 已移出扫描域`);
    }
    expect(zombies, `基线里的键已失效（拆件/改名后请更新基线）：\n${zombies.join("\n")}`).toEqual([]);
  });

  it("④ 拆件搬运守恒（`SPLIT_MOVES` 的每条 `新文件|源文件` 两侧之和 == 基线源键）", () => {
    const broken: string[] = [];
    const seen = new Set<string>();
    for (const move of SPLIT_MOVES) {
      const parts = move.split("|");
      if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] === parts[1]) {
        broken.push(`${move}: 形态必须是 "新文件|源文件"（两段非空且不同）`);
        continue;
      }
      const [target, source] = parts;
      if (seen.has(target)) broken.push(`${target}: 同一个新文件登记了多次搬运`);
      seen.add(target);
      const sourceBase = BASELINE[source];
      if (sourceBase === undefined) {
        broken.push(`${move}: 源文件 ${source} 不在基线里`);
        continue;
      }
      if (BASELINE[target] !== undefined) broken.push(`${move}: 目标 ${target} 已在基线里（它只能是拆件产物）`);
      const targetNow = SCAN.buttonByFile.get(target) ?? 0;
      const sourceNow = SCAN.buttonByFile.get(source) ?? 0;
      if (targetNow + sourceNow !== sourceBase) {
        broken.push(`${move}: 搬运不守恒 —— ${target}(${targetNow}) + ${source}(${sourceNow}) ≠ 基线 ${sourceBase}`);
      }
    }
    expect(broken, `SPLIT_MOVES 登记有误：\n${broken.join("\n")}`).toEqual([]);
  });

  it("⑤ `const *Btn*` 样式常量族只减不增（行数与文件数双口径）", () => {
    expect(
      SCAN.btnConstLines,
      `\`const *Btn*\` 样式常量的行数已从 ${FROZEN_BTN_STYLE_CONST_LINES} 涨到 ${SCAN.btnConstLines} —— 新按钮请用 \`Button\`，别再声明局部样式常量`,
    ).toBeLessThanOrEqual(FROZEN_BTN_STYLE_CONST_LINES);
    expect(
      SCAN.btnConstFiles,
      `带 \`const *Btn*\` 的文件数已从 ${FROZEN_BTN_STYLE_CONST_FILES} 涨到 ${SCAN.btnConstFiles}`,
    ).toBeLessThanOrEqual(FROZEN_BTN_STYLE_CONST_FILES);
  });
});
