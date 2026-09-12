/**
 * engine.guard.test.ts — GSAP **懒加载三件套守卫**（R2.1 ①②③ · R11.1 闭包交集 · R11.5 产物用例 · R14.7-I-2 插件逐序）
 *   ＋ 控制方 2026-09-13 追加的 **③‴ 动态绕开禁令**（与静态闭包判据**互补**，二者缺一不可）。
 *
 * @ai-context 业务背景：规格 §13 风险表逐字要求「GSAP 独立 chunk 懒加载」。本文件把它变成**常驻机器判据** ——
 *   T3 建了全仓唯一入口 `app/src/motion/engine.ts`（顶层 `registerPlugin`），本文件就是那把锁：谁把 GSAP 拉进
 *   首屏静态闭包 / 谁绕开 engine 直接用 GSAP / 谁改掉插件集合或顺序，谁就在这里变红。
 * @ai-context 判据本体（**不是白名单**；R11.1）：「`app/src/**` 中**静态** import `gsap` / `@gsap/react` 的文件
 *   集合 ∩ **首屏静态可达闭包** = ∅」。importer 集合「恰等于 {motion/engine.ts}」只是**诊断读数**（易腐化，
 *   供失败定位），判据取**交集** ⇒ 这是**今天无条件可跑**的那一半（导出树 / 新克隆里也有牙）。
 * @ai-context ③‴：**动态** gsap 家族说明符（`import("gsap")` 等）只许出现在 `motion/engine.ts`。静态判据看不见
 *   「绕开 engine 的动态 import」—— 那种写法让 `registerPlugin` **从未执行**、插件静默退化（陷阱 B1-6），
 *   而 ①②③ 全绿。**判据域 = 生产文件**（`*.test.ts(x)` 除外）：测试不进产物，且 T3 的 `engine.test.ts:104/:115`
 *   用 `await import("gsap/CustomEase")` **读**注册结果（观察 ≠ 绕开）。
 * @ai-context 产物判据 ①②（R11.5）：`app/dist` **不入库** ⇒ 导出树里必然不运行，故取「`runIf(existsSync(dist))`
 *   用例 + **真实构建强制命令行** + 未运行计入报告**「未验证」单列**」三轨。🔴 **未运行 ≠ 通过**，本守卫不得
 *   静默通过。T3 已在导出树做过注入式正向实测（`void import("./motion/engine")` ⇒ `vendor-gsap-BQLVn3Z6.js`
 *   105,584 B / gzip 41,161 B，首屏仍 3 chunk 不含它）⇒ 机理已证；该 chunk **首次真实出现 = 第一个调用点落地时
 *   （波 B/C）**。今天源图（静态∪动态）到不了 GSAP ⇒ ① 的「存在性分支」**未运行**（用例 `console.warn` 点名）。
 * @ai-context 插件集合与顺序（R14.7-I-2）：ADR-035 `:48` 自称「恰 4 个、**顺序逐字**」⇒ 对拍必须是**逐序数组
 *   相等**（集合相等测不出纯换序）。四插件「真的注册了」的**行为级**判据在 `engine.test.ts`（B3/B4/B5）。
 * @ai-context 仪器：剥注释复用 `ui/primitives/sliceScan.ts` 的状态机（R8.7）；静态图遍历是**正则级**（不认
 *   tsconfig paths、不认非字面量 `import()`）—— 边界见任务报告。副作用：只读 `app/src` 与 `app/dist`；② 起一个
 *   `check-bundle-budget --no-build` 子进程；遍历自证在 `os.tmpdir()` 建小树并自删，**不碰 `app/src`**。
 * @ai-context 🔴 本文件自己也在扫描域内 ⇒ 夹具里的 GSAP 说明符一律**拼接构造**（`fromSpec()`），源码文本里
 *   **不得**出现字面量的 GSAP import 语句，否则本文件会把自己扫成 importer 而自伤。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stripComments, walkSources } from "../ui/primitives/sliceScan";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, ".."); // app/src
const ROOT = resolve(HERE, "..", "..", ".."); // 仓库根
const ENTRY = join(SRC, "main.tsx");
const ENGINE_REL = "motion/engine.ts";
const CLASSROOM_REL = "pages/ClassroomPage.tsx";
const DIST = join(ROOT, "app", "dist");
const ADR = join(ROOT, "docs", "adr", "ADR-035-l4-motion-grammar-and-engine.md");
const relTo = (base: string, file: string): string => relative(base, file).split(sep).join("/");

// ───────────────────────── 仪器 1：GSAP 说明符扫描（静态 + 动态，剥注释） ─────────────────────────

/** `import|export … from "<gsap 家族>"`；排除动态形态与 `import type`（类型边不进产物）。 */
const RE_GSAP_FROM = /\b(?:import|export)\b(?!\s*\()\s(?!type\b)[^;]*?\bfrom\s*["'](gsap(?:\/[^"']*)?|@gsap\/react)["']/g;
/** 裸 `import "<gsap 家族>"`（副作用式静态边）。 */
const RE_GSAP_BARE = /\bimport\s*["'](gsap(?:\/[^"']*)?|@gsap\/react)["']/g;
/** **动态** `import("<gsap 家族>")` —— 绕开 engine 的那条路（③‴ 的判据域）。 */
const RE_GSAP_DYNAMIC = /\bimport\s*\(\s*["'](gsap(?:\/[^"']*)?|@gsap\/react)["']\s*\)/g;

function specsOf(code: string, res: readonly RegExp[]): string[] {
  const out: string[] = [];
  for (const re of res) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) out.push(m[1]);
  }
  return out;
}

/** 一段源码里的 GSAP **静态**说明符（剥注释后扫；纯函数，行为自证见下方 describe）。 */
const gsapSpecifiers = (src: string): string[] => specsOf(stripComments(src), [RE_GSAP_FROM, RE_GSAP_BARE]);
/** 一段源码里的 GSAP **动态**说明符。 */
const dynamicGsapSpecifiers = (src: string): string[] => specsOf(stripComments(src), [RE_GSAP_DYNAMIC]);

// ───────────────────────── 仪器 2：静态图遍历（正则级） ─────────────────────────

const EXT = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];
const RE_STATIC_FROM = /\b(?:import|export)\b(?!\s*\()\s(?!type\b)[^;]*?\bfrom\s*["']([^"']+)["']/g;
const RE_STATIC_BARE = /\bimport\s*["']([^"']+)["']/g;
const RE_DYNAMIC = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function resolveRelative(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const e of EXT) {
    const p = base + e;
    // 用 `!isDirectory()` 而不是 `Stats.isFile()`：本仓 `@types/node` 版本下后者报 TS2339（先例 `nativeButton.ratchet.test.ts:220`）
    if (existsSync(p) && !statSync(p).isDirectory()) return p;
  }
  return null;
}

/** 从入口出发的可达文件集（绝对路径）。`dynamic: false` ⇒ 只沿**静态**边（= 首屏闭包口径）。 */
function reachable(entry: string, opts: { dynamic: boolean }): Set<string> {
  const seen = new Set<string>();
  const queue: string[] = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const specs = specsOf(text, opts.dynamic ? [RE_STATIC_FROM, RE_STATIC_BARE, RE_DYNAMIC] : [RE_STATIC_FROM, RE_STATIC_BARE]);
    for (const spec of specs) {
      const r = resolveRelative(file, spec);
      if (r !== null && !seen.has(r)) queue.push(r);
    }
  }
  return seen;
}

// ───────────────────────── 开工读数（模块级，只读一次） ─────────────────────────

const allSources = walkSources(SRC);
/** ③‴ 的域 = 生产文件：测试不进产物，且 T3 的 `engine.test.ts` 用动态 gsap import **读**注册结果。 */
const productionSources = allSources.filter((f) => !/\.test\.tsx?$/.test(f));
const importerFiles = allSources
  .filter((f) => gsapSpecifiers(readFileSync(f, "utf8")).length > 0)
  .map((f) => relTo(SRC, f))
  .sort();
const eagerClosure = new Set([...reachable(ENTRY, { dynamic: false })].map((f) => relTo(SRC, f)));
const buildGraph = new Set([...reachable(ENTRY, { dynamic: true })].map((f) => relTo(SRC, f)));
/** 「GSAP 会进构建」的源图口径：任一声明式 importer 落在静态∪动态可达集合里。 */
const gsapInBuildGraph = importerFiles.some((f) => buildGraph.has(f));
const hasDist = existsSync(join(DIST, "index.html"));
const distJs = hasDist ? readdirSync(join(DIST, "assets")).filter((f) => f.endsWith(".js")) : [];
const gsapChunks = distJs.filter((f) => /^vendor-gsap-/.test(f));

// 夹具构造：拼接出语句，源码文本里不出现字面量的 GSAP import（见文件头最后一条）
const Q = '"';
const fromSpec = (spec: string): string => "from " + Q + spec + Q + ";";
const importOf = (pkg: string): string => "import { x } " + fromSpec(pkg);
const typeImportOf = (pkg: string): string => "import type { X } " + fromSpec(pkg);
const dynamicOf = (pkg: string): string => "const m = await import(" + Q + pkg + Q + ");";
const PKG = "gsap";
const PKG_REACT = "@gsap/react";

describe("仪器自证（防真空：喂已知样本必须命中、无意义串必须 0）", () => {
  it("说明符扫描器：静态具名 / 多行 / 裸 import / export…from / 子路径 与 动态形态 都必须命中", () => {
    expect(gsapSpecifiers(importOf(PKG))).toEqual([PKG]);
    expect(gsapSpecifiers(importOf(PKG_REACT))).toEqual([PKG_REACT]);
    expect(gsapSpecifiers(importOf(PKG + "/Flip"))).toEqual([PKG + "/Flip"]);
    expect(gsapSpecifiers("import {\n  Flip,\n} " + fromSpec(PKG + "/CustomEase"))).toEqual([PKG + "/CustomEase"]);
    expect(gsapSpecifiers("import " + Q + PKG + Q + ";")).toEqual([PKG]);
    expect(gsapSpecifiers("export { x } " + fromSpec(PKG))).toEqual([PKG]);
    expect(dynamicGsapSpecifiers(dynamicOf(PKG))).toEqual([PKG]);
    expect(dynamicGsapSpecifiers(dynamicOf(PKG + "/ScrollToPlugin"))).toEqual([PKG + "/ScrollToPlugin"]);
  });

  it("说明符扫描器：注释 / type-only / 无意义串 都必须 0 命中，且静态与动态互不串味", () => {
    expect(gsapSpecifiers("// " + importOf(PKG))).toEqual([]);
    expect(gsapSpecifiers("/* " + importOf(PKG) + " */")).toEqual([]);
    expect(gsapSpecifiers(typeImportOf(PKG))).toEqual([]);
    expect(gsapSpecifiers("export type { X } " + fromSpec(PKG_REACT))).toEqual([]);
    expect(gsapSpecifiers(importOf("gsap-core"))).toEqual([]);
    expect(gsapSpecifiers(importOf("not-gsap"))).toEqual([]);
    expect(dynamicGsapSpecifiers(importOf(PKG))).toEqual([]); // 静态 ≠ 动态
    expect(dynamicGsapSpecifiers("// " + dynamicOf(PKG))).toEqual([]);
    expect(dynamicGsapSpecifiers(dynamicOf("not-gsap"))).toEqual([]);
    expect(dynamicGsapSpecifiers("const s = 'gsap';")).toEqual([]);
  });

  it("静态图遍历：只沿静态边（含传递边与目录 index），动态边只在 dynamic 口径下跟", () => {
    const dir = mkdtempSync(join(tmpdir(), "ed-t4-guard-"));
    try {
      const w = (name: string, text: string): void => {
        const p = join(dir, name);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, text);
      };
      w("entry.ts", "import { a } " + fromSpec("./a") + "\n" + dynamicOf("./dyn"));
      w("a.ts", "import " + Q + "./sub" + Q + ";");
      w("sub/index.tsx", "export const s = 1;");
      w("dyn.ts", "import " + Q + "./dynChild" + Q + ";");
      w("dynChild.ts", "export const d = 2;");
      w("unreached.ts", "export const u = 3;");
      const names = (dynamic: boolean): string[] =>
        [...reachable(join(dir, "entry.ts"), { dynamic })].map((f) => relTo(dir, f)).sort();
      expect(names(false)).toEqual(["a.ts", "entry.ts", "sub/index.tsx"]);
      expect(names(true)).toEqual(["a.ts", "dyn.ts", "dynChild.ts", "entry.ts", "sub/index.tsx"]);
      expect(names(true)).not.toContain("unreached.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("③ 懒加载边界（R2.1 判据 ③ → R11.1 的闭包交集；今天无条件可跑的那一半）", () => {
  it("③′ 诊断读数：静态 import GSAP 家族的文件集恰 = {motion/engine.ts}，且说明符 ≥ 4（防真空）", () => {
    expect(importerFiles).toEqual([ENGINE_REL]);
    expect(gsapSpecifiers(readFileSync(join(SRC, ENGINE_REL), "utf8")).length).toBeGreaterThanOrEqual(4);
  });

  it("③ 判据本体：静态 GSAP importer 集合 ∩ 首屏静态可达闭包 = ∅（含两个阳性对照）", () => {
    // 阳性对照：遍历必须能到达两个**已知在首屏**的文件 —— 否则「交集为空」可能只是遍历静默失效
    expect(eagerClosure.has("ui/primitives/index.ts"), "遍历到不了 ui/primitives/index.ts ⇒ 仪器失效，交集读数不可信").toBe(true);
    expect(eagerClosure.has(CLASSROOM_REL), "遍历到不了课堂页 ⇒ 仪器失效，交集读数不可信").toBe(true);
    const inter = importerFiles.filter((f) => eagerClosure.has(f));
    expect(inter, `交集非空 ⇒ GSAP 进了首屏静态闭包（vendor-gsap 独立懒 chunk 的承诺落空）：${inter.join(", ")}`).toEqual([]);
  });

  it("③″ 派生禁令（R11.1 连带③）：课堂页（首屏静态页）自身零 GSAP 静态说明符", () => {
    expect(gsapSpecifiers(readFileSync(join(SRC, CLASSROOM_REL), "utf8"))).toEqual([]);
  });

  it("③‴ 动态绕开禁令（控制方追加）：生产文件里的**动态** gsap 说明符只许出现在 motion/engine.ts", () => {
    expect(productionSources.length, "域为空 ⇒ 判据恒真，先修域").toBeGreaterThan(100);
    const offenders = productionSources
      .map((f) => [relTo(SRC, f), dynamicGsapSpecifiers(readFileSync(f, "utf8"))] as const)
      .filter(([, hits]) => hits.length > 0)
      .map(([f]) => f)
      .sort();
    expect(offenders, `动态 gsap 绕开 engine ⇒ registerPlugin 从未执行（陷阱 B1-6 插件静默退化）：${offenders.join(", ")}`).toEqual([]);
  });
});

interface BudgetJson {
  firstScreen: { count: number; chunks: { name: string }[] };
}

describe("①② 产物判据（R11.5：runIf(existsSync(dist))；🔴 未运行 ≠ 通过）", () => {
  it.runIf(hasDist)(
    "① 产物独立性：源图到达 GSAP ⇔ 出现独立的 vendor-gsap-*.js（今天源图未到达 ⇒ 存在性分支未运行，见报告「未验证」单列）",
    () => {
      if (!gsapInBuildGraph) {
        // 今天的真相：源图（静态∪动态）零边到达 GSAP ⇒ 下面那条存在性断言今天**跑不到**（R11.5：不计入绿）
        console.warn(
          "[guard①] 存在性分支今天未运行：源图未到达任何 GSAP 静态 importer ⇒ 本分支计入报告「未验证」单列。" +
            "机理已证（T3 注入树：vendor-gsap-BQLVn3Z6.js 105,584 B / gzip 41,161 B，首屏 3 chunk 不含它）；" +
            "首次真实出现 = 第一个调用点落地时（波 B/C）。",
        );
      } else {
        expect(gsapChunks, "源图已到达 GSAP ⇒ 产物必须出现 vendor-gsap-*.js；实得零个").not.toEqual([]);
      }
      // 反向（今天就跑）：产物不得出现源图到不了的「幽灵 gsap chunk」—— 或源图漏判，或 dist 过期
      expect(
        gsapChunks.length > 0 && !gsapInBuildGraph,
        `产物出现 ${gsapChunks.join(", ")}，但源图（静态∪动态）没有任何边到达 GSAP ⇒ 遍历漏判或 app/dist 过期`,
      ).toBe(false);
    },
  );

  it.runIf(hasDist)("② firstScreen.chunks 不含 vendor-gsap（仓库自己的 check-bundle-budget --no-build --json）", () => {
    const raw = execFileSync(process.execPath, [join(ROOT, "scripts", "check-bundle-budget.mjs"), "--no-build", "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    const budget = JSON.parse(raw) as BudgetJson;
    expect(budget.firstScreen.count, "首屏 chunk 读数为 0 ⇒ JSON 解析或产物异常，别把空读数当绿").toBeGreaterThan(0);
    const names = budget.firstScreen.chunks.map((c) => c.name);
    expect(names.filter((n) => n.includes("vendor-gsap")), `首屏出现 vendor-gsap：${names.join(", ")}`).toEqual([]);
  });
});

/** `registerPlugin(...)` 的实参序列（只认**标识符**级实参；`…` 这类占位注释形态天然被过滤）。 */
function pluginArgVariants(code: string): string[][] {
  const out: string[] = [];
  for (const m of code.matchAll(/registerPlugin\(([^)]*)\)/g)) {
    const args = m[1].split(",").map((s) => s.trim());
    if (args.length > 0 && args.every((a) => /^[A-Za-z_$][\w$]*$/.test(a))) out.push(JSON.stringify(args));
  }
  return [...new Set(out)].map((s) => JSON.parse(s) as string[]);
}

describe("ADR-035 §2 ⇄ engine.ts 插件**逐序**数组相等（R14.7-I-2；ADR:48「恰 4 个、顺序逐字」）", () => {
  it("抽取仪器自证：标识符级实参、注释里的占位调用不算、无调用返回空", () => {
    expect(pluginArgVariants("gsap.registerPlugin(A, B);")).toEqual([["A", "B"]]);
    expect(pluginArgVariants("// registerPlugin(useGSAP, …)")).toEqual([]);
    expect(pluginArgVariants("const x = 1;")).toEqual([]);
    // 剥注释后只剩真调用（engine.ts 的头注里也写了同名调用 ⇒ 不剥注释会取到注释那份）
    expect(pluginArgVariants(stripComments("// registerPlugin(A, B)\ngsap.registerPlugin(A, C);"))).toEqual([["A", "C"]]);
  });

  it("engine.ts 的 registerPlugin 实参序列 == ADR-035 §2 冻结快照的实参序列（逐序，恰 4 个）", () => {
    const fence = /```ts\r?\n([\s\S]*?)```/.exec(readFileSync(ADR, "utf8"));
    expect(fence, "ADR-035 §2 的 ts 冻结快照代码块不见了").not.toBeNull();
    const adrVariants = pluginArgVariants((fence as RegExpExecArray)[1]);
    const engineVariants = pluginArgVariants(stripComments(readFileSync(join(SRC, ENGINE_REL), "utf8")));
    expect(adrVariants, "ADR-035 §2 里出现互相不一致的插件序列（标题与代码块漂移）").toHaveLength(1);
    expect(engineVariants, "engine.ts 里出现互相不一致的插件序列").toHaveLength(1);
    expect(engineVariants[0]).toHaveLength(4);
    expect(engineVariants[0]).toEqual(adrVariants[0]);
  });
});
