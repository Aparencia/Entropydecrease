#!/usr/bin/env node
/**
 * @ai-context 首屏 JS 预算守卫 —— 批 2 包体治理把「达标」变成机器判据的唯一工具。
 *
 * Why：规格 §10 的验收是「首屏 gzip 降到达标**或**给出瓶颈清单」，而「达标」「首屏」原本都没有机器
 *      口径 —— 没有机器判据时，「达标」只是形容词。预算数字取自**既有标准**、非本脚本发明：
 *      `docs/standards/performance.md:28`「页面包大小 (JS) | **< 200KB (gzip)** | Bundle 分析」。
 *
 * 口径（控制方已批准，勿自行改）：
 *  1. 首屏 chunk 集合 = `app/dist/index.html` 里 `<script type="module">` 指向的入口 chunk，
 *     **加上从入口出发只沿静态 ESM `import` / `export … from` 可达的全部 `.js` chunk**；
 *     仅经 `import(…)` **动态**可达的 chunk 不计（动态边是断点）。
 *  2. **只算 `.js`**：CSS / 字体资产不进这 200 kB，但**必须一并打印**（防它们借「不计入」失控）。
 *  3. gzip = `zlib.gzipSync(buf, { level: 6 })`；kB = **十进制 ÷1000**（vite 自己打印的口径，不是 KiB ÷1024）。
 *     冻结校准点：今天单一 chunk 构建下入口 chunk = **654,722 B = 654.72 kB**，与 vite 打印值逐字相等
 *     （计划者 / Task 1 / 控制方三方独立复现）。**若本脚本与此值不符，先怀疑脚本，绝不改数字。**
 *  4. **懒侧（仅动态可达的 `.js`）有独立的第二个预算**（批 7 §C9.6 / §C10.4）：族前缀**清单等式** +
 *     **逐族 gzip 上限** + **懒侧总 gzip 上限**（另加 chunk 数上限），基线 = `scripts/lazyBudget.json` 的
 *     **实测冻结值**、只许降（写「预算值」式的乐观目标会立刻红）。判据键是**族前缀**（`vendor-katex-*`）而非
 *     chunk 名（后者带内容 hash、不稳定）。🔴 首屏与懒侧是**两个独立读数**：懒侧判定不得影响首屏字段。
 *
 * 仪器陷阱（本批实测，勿改回）：
 *  - 静态边在产物里长 `from"./x-abc.js"`：**引号必须紧跟** `from` / `import`，故 `import(` 天然不匹配；
 *    另先整段剥掉 `import("…")` 形态再扫，双保险（自检含「仅动态可达必须不计」的负样本夹具）。
 *  - chunk basename 必须用 `[^"'/\\]+\.js`：产物名含 `-` 与 `.`，收窄成 `\w+` 会一个 chunk 都扫不到。
 *  - 扫描是正则级、不做 AST：注释/字符串里恰好出现 `from"./x.js"` 会误判（本仓产物实测未触发）。
 *  - `modulepreload` 交叉核对只作参考、不影响退出码（vite 对动态依赖的预载发生在运行时）。
 * 边界：vite 的 chunk 一律**平铺**在 `dist/assets/` 下（本脚本按 basename 解析）；不解析 sourcemap、
 *      不解析 CSS 里的 `url()`、不认带 query 的说明符 —— 三者在本仓产物中都不存在。
 *
 * 副作用：默认执行 `cd app && npm run build`（写 `app/dist/`）；`--no-build` 只读既有产物。
 *        `--self-test` 在 `os.tmpdir()` 下建夹具并在结束时删除，**不碰真实 `app/dist`**。
 * 用法：node scripts/check-bundle-budget.mjs [--no-build] [--budget <kB>] [--json] [--self-test] [--dist <目录>] [--no-lazy]
 *        `--dist` 供自检夹具 / 备用产物目录使用（默认 `app/dist`），与构建互斥、须配 `--no-build`。
 *        `--json` 与默认构建同用会把 vite 输出混进 stdout；机器消费请配 `--no-build`。
 *        `--no-lazy` **只**给 `--dist` 的夹具用，且**不得**指向默认产物目录 ⇒ CI / husky / 收口读数都不带它，
 *        **真实产物上懒侧门禁恒开**（它不是「可以关掉的守卫」）。
 * 退出码：0 = **首屏与懒侧两个预算都达标** · 1 = **任一预算超标（首屏 / 懒侧）** ·
 *        2 = 构建失败 / 产物缺失 / 自检失败。两个读数**互相独立**：懒侧判定**不得**影响首屏字段（批 7 §C11.5）。
 */
import { readFileSync, existsSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { measure, rel, fmtB, kB, BudgetError } from "./lib/bundleMeasure.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF), "..");
const APP = join(ROOT, "app");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (f, dflt) => (argv.indexOf(f) >= 0 && argv[argv.indexOf(f) + 1] !== undefined ? argv[argv.indexOf(f) + 1] : dflt);
const NO_BUILD = has("--no-build");
const AS_JSON = has("--json");
const SELF_TEST = has("--self-test");
const NO_LAZY = has("--no-lazy");
const DIST = resolve(opt("--dist", join(APP, "dist")));
const BUDGET_KB = Number(opt("--budget", "200"));
const BUDGET_SOURCE = "docs/standards/performance.md:28";
const LAZY_BUDGET = join(dirname(SELF), "lazyBudget.json");

/** 全部失败路径的统一出口：**必须** exit 2（1 只留给「超预算」），并给出可执行的下一条命令。 */
function fail(msg) {
  console.error(`❌ 首屏预算守卫：${msg}`);
  process.exit(2);
}

/**
 * 懒侧基线（冻结值）：**缺失即失败**，绝不静默放行 —— 「读不到基线就当达标」是这类门禁最典型的失效形态。
 */
function loadLazyBudget(p) {
  if (!existsSync(p) || !statSync(p).isFile()) fail(`找不到懒侧基线 ${rel(p)} —— 基线缺失时不得静默按「达标」放行。`);
  const b = JSON.parse(readFileSync(p, "utf8"));
  const ok = Array.isArray(b.families) && b.families.length > 0 && Number.isFinite(b.lazyTotalGzipBytesMax) && Number.isFinite(b.lazyChunkCountMax) && b.families.every((f) => typeof f.prefix === "string" && Number.isFinite(f.gzipBytesMax));
  if (!ok) fail(`懒侧基线 ${rel(p)} 结构不完整（需要 families[{prefix,gzipBytesMax}] + lazyTotalGzipBytesMax + lazyChunkCountMax）。`);
  return b;
}

/** 族前缀 = 去掉**8 位定长**内容 hash 的 chunk 名 + `-`。hash 字母表含 `-`（实测 `CaptureFloatPanel-CJ-lF7pj.js`）。 */
const HASH_SUFFIX = /-[A-Za-z0-9_-]{8}\.js$/;
const familyPrefixOf = (name) => (HASH_SUFFIX.test(name) ? name.replace(HASH_SUFFIX, "") + "-" : null);

/**
 * 懒侧四条判据：① **清单等式**（每个懒侧 chunk 都必须归属某个已登记族 —— 没有 `others` 白名单，就是要让
 * 产物演进**红**而不是静默通过）② **逐族 gzip 上限** ③ **总 gzip 上限** ④ chunk 数上限。
 * 每条**各产生一条具名 reason**（C9.6 第 3 条：必须红在具名断言上）。
 */
function judgeLazy(r, base) {
  const fams = new Map(base.families.map((f) => [f.prefix, { prefix: f.prefix, gzipBytesMax: f.gzipBytesMax, chunks: [], gzipBytes: 0 }]));
  const unlisted = [];
  for (const c of r.lazy) {
    const f = fams.get(familyPrefixOf(c.name));
    if (!f) { unlisted.push(c.name); continue; }
    f.chunks.push(c.name);
    f.gzipBytes += c.gzipBytes;
  }
  const families = [...fams.values()];
  const totalBytes = r.lazy.reduce((a, c) => a + c.gzipBytes, 0);
  const overFamilies = families.filter((f) => f.gzipBytes > f.gzipBytesMax);
  const reasons = [];
  if (unlisted.length) reasons.push(`① 族前缀清单等式：未归族 ${unlisted.length} 个（${unlisted.join(", ")}）`);
  for (const f of overFamilies) reasons.push(`② 逐族上限：${f.prefix} gzip ${fmtB(f.gzipBytes)} B > 上限 ${fmtB(f.gzipBytesMax)} B`);
  if (totalBytes > base.lazyTotalGzipBytesMax) reasons.push(`③ 懒侧总 gzip：${fmtB(totalBytes)} B > 上限 ${fmtB(base.lazyTotalGzipBytesMax)} B`);
  if (r.lazy.length > base.lazyChunkCountMax) reasons.push(`④ 懒侧 chunk 数：${r.lazy.length} > 上限 ${base.lazyChunkCountMax}`);
  return { families, unlisted, overFamilies, totalBytes, totalMax: base.lazyTotalGzipBytesMax, count: r.lazy.length, countMax: base.lazyChunkCountMax, reasons, pass: reasons.length === 0 };
}

/** 参考项：HTML 用 modulepreload 声明但静态闭包没覆盖的 .js —— 值得人看一眼，不影响判定。 */
function preloadUncovered(dist, eager) {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const base = (tag) => { const s = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag); return s ? s[1].split(/[?#]/)[0].split("/").pop() : ""; };
  const tags = [...html.matchAll(/<link\b[^>]*\brel\s*=\s*["']modulepreload["'][^>]*>/gi)].map((m) => base(m[0]));
  return [...new Set(tags.filter((n) => n.endsWith(".js") && !eager.has(n)))];
}

function printHuman(r, pass, lazy) {
  console.log(`首屏预算守卫 · 产物 ${rel(r.dist)}`);
  console.log(`  单位：kB = 字节 ÷ 1000（十进制，vite 口径；勿与 ÷1024 的 KiB 混用，混用会产生假 Δ）· gzip = zlib level 6`);
  console.log(`  口径：module 入口 + 只沿静态 ESM import 可达的 .js，动态 import 不计 · 预算 ${BUDGET_KB} kB gzip（来源 ${BUDGET_SOURCE}）`);
  console.log(`首屏 chunk（${r.eager.size} 个）：`);
  for (const [name, c] of r.eager) {
    console.log(`  ${name.padEnd(34)} ${fmtB(c.bytes).padStart(10)} B  →  gzip ${fmtB(c.gzip).padStart(9)} B = ${kB(c.gzip).padStart(8)} kB`);
  }
  console.log(`  首屏 JS 合计：原始 ${fmtB(r.rawBytes)} B · gzip ${fmtB(r.eagerBytes)} B = ${kB(r.eagerBytes)} kB`);
  console.log(`  ⇒ 首屏预算 ${pass ? "✅ 达标" : "❌ 超标"}：${pass ? "余量" : "超出"} ${kB(Math.abs(BUDGET_KB * 1000 - r.eagerBytes))} kB${pass ? "" : `（${(r.eagerBytes / 1000 / BUDGET_KB).toFixed(2)}× 预算）`}`);
  const lazyBytes = r.lazy.reduce((a, c) => a + c.gzipBytes, 0);
  console.log(`懒加载 chunk（仅动态可达，独立于首屏预算）：${r.lazy.length} 个 · gzip ${fmtB(lazyBytes)} B = ${kB(lazyBytes)} kB`);
  if (lazy) {
    console.log(`  懒侧口径：族前缀清单等式 + 逐族 gzip 上限 + 懒侧总 gzip 上限 · 基线 ${rel(LAZY_BUDGET)}（实测冻结值，只许降）· 未归族与超上限都红`);
    console.log(`  ⇒ 懒侧预算 ${lazy.pass ? "✅ 达标" : "❌ 超标"}：gzip ${kB(lazy.totalBytes)} kB / 上限 ${kB(lazy.totalMax)} kB · chunk ${lazy.count} 个 / 上限 ${lazy.countMax} 个 · 未归族 ${lazy.unlisted.length} 个 · 超上限族 ${lazy.overFamilies.length} 个`);
  } else console.log(`  ⇒ 懒侧预算 ⏭ 未判（--no-lazy，仅供 --dist 夹具；真实产物上恒判）`);
  console.log(`不计入预算但须报告（CSS / 字体）：index.html ${fmtB(r.htmlBytes)} B = ${kB(r.htmlBytes)} kB · gzip ${kB(r.htmlGzip)} kB`);
  const byExt = new Map();
  for (const a of r.excluded) {
    const ext = (/\.[a-z0-9]+$/i.exec(a.name) ?? [".(无扩展名)"])[0].toLowerCase();
    const cur = byExt.get(ext) ?? { n: 0, bytes: 0, gzip: 0 };
    byExt.set(ext, { n: cur.n + 1, bytes: cur.bytes + a.bytes, gzip: cur.gzip + a.gzipBytes });
  }
  for (const [ext, v] of [...byExt].sort()) {
    console.log(`  ${ext.padEnd(8)} ${String(v.n).padStart(3)} 个  ${fmtB(v.bytes).padStart(10)} B = ${kB(v.bytes).padStart(8)} kB · gzip ${kB(v.gzip).padStart(7)} kB`);
  }
}

const jsonOf = (r, pass, lazy) => ({
  dist: rel(r.dist),
  budgetKb: BUDGET_KB,
  budgetSource: BUDGET_SOURCE,
  unit: "kB = bytes / 1000（十进制，vite 口径）· gzip = zlib.gzipSync level 6 · 只算 .js",
  firstScreen: {
    count: r.eager.size,
    chunks: [...r.eager].map(([name, c]) => ({ name, bytes: c.bytes, gzipBytes: c.gzip, gzipKb: Number(kB(c.gzip)) })),
    totalBytes: r.eagerBytes,
    totalKb: Number(kB(r.eagerBytes)), pass,
  },
  lazy: { count: r.lazy.length, chunks: r.lazy, totalBytes: r.lazy.reduce((a, c) => a + c.gzipBytes, 0) },
  lazyBudget: lazy
    ? {
        pass: lazy.pass,
        baseline: rel(LAZY_BUDGET),
        count: lazy.count,
        countMax: lazy.countMax,
        totalBytes: lazy.totalBytes,
        totalKb: Number(kB(lazy.totalBytes)),
        totalMaxBytes: lazy.totalMax,
        unlisted: lazy.unlisted,
        fails: lazy.reasons,
        families: lazy.families.map((f) => ({ prefix: f.prefix, chunkCount: f.chunks.length, gzipBytes: f.gzipBytes, gzipBytesMax: f.gzipBytesMax, pass: f.gzipBytes <= f.gzipBytesMax })),
      }
    : { pass: true, skipped: "--no-lazy（仅供 --dist 夹具；真实产物上恒判）" },
  excludedFromBudget: { indexHtml: { bytes: r.htmlBytes, gzipBytes: r.htmlGzip }, assets: r.excluded },
  pass,
});

/**
 * 报表 + 退出码：0 = **两个预算都达标** · 1 = **任一超标**（首屏 / 懒侧，各自点名）。
 * 🔴 顶层 `pass` 是**首屏** pass（既有消费方的兼容字段）；懒侧见 `lazyBudget.pass`。
 */
function finish(r) {
  const pass = r.eagerBytes / 1000 < BUDGET_KB;
  const lazy = NO_LAZY ? null : judgeLazy(r, loadLazyBudget(LAZY_BUDGET));
  if (AS_JSON) {
    console.log(JSON.stringify(jsonOf(r, pass, lazy), null, 2));
  } else {
    printHuman(r, pass, lazy);
    const uncovered = preloadUncovered(r.dist, r.eager);
    if (uncovered.length) console.log(`ℹ️ modulepreload 声明但静态闭包未覆盖 ${uncovered.length} 个：${uncovered.join(", ")}（参考项，不影响判定）`);
  }
  if (!pass) {
    console.error(
      `❌ 首屏 JS gzip ${fmtB(r.eagerBytes)} B = ${kB(r.eagerBytes)} kB ≥ 预算 ${BUDGET_KB} kB` +
        `（${(r.eagerBytes / 1000 / BUDGET_KB).toFixed(2)}×）—— 退出码 1。降首屏只能靠 import() 切断静态边；manualChunks 只切文件、一字节不降。`,
    );
  }
  if (lazy && !lazy.pass) console.error(`❌ 懒侧 gzip 预算超标（退出码 1）—— 具名断言：${lazy.reasons.join("；")}。基线 ${rel(LAZY_BUDGET)} 只许降（§C9.6 第 2 条）。`);
  process.exit(pass && (!lazy || lazy.pass) ? 0 : 1);
}

/**
 * 仪器自检：夹具证明「静态边真的在走」（含传递边与 `export … from`）、「动态边真的被切断」
 * （含只经动态 chunk 传递可达者）、「只算 .js」、「modulepreload 不算首屏」，
 * 再用子进程证明退出码契约 2 / 1 / 0 真的成立。真实产物的校准点**只报告不断言**（Task 6 后合法下降）。
 */
function selfTest() {
  const problems = [];
  const check = (ok, msg) => { console.log(`  ${ok ? "✅" : "❌"} ${msg}`); if (!ok) problems.push(msg); };
  const dir = mkdtempSync(join(tmpdir(), "dsh-budget-selftest-"));
  try {
    mkdirSync(join(dir, "assets"), { recursive: true });
    const w = (p, text) => writeFileSync(join(dir, p), text);
    w("index.html",
      `<!doctype html><html><head><link rel="modulepreload" href="/assets/preload-only.js">` +
        `<script type="module" crossorigin src="/assets/entry-abc.js"></script>` +
        `<link rel="stylesheet" href="/assets/app.css"></head><body></body></html>`);
    w("assets/entry-abc.js", `import{d}from"./static-a.js";import"./static-b.js";export*from"./static-d.js";import("./dyn-only.js");`);
    w("assets/static-a.js", `import"./static-c.js";export const a=1;`);
    w("assets/static-b.js", `export const b=2;`);
    w("assets/static-c.js", `export const c=3;`);
    w("assets/static-d.js", `export const d=4;`);
    w("assets/dyn-only.js", `import"./dyn-child.js";`);
    w("assets/dyn-child.js", `export const e=5;`);
    w("assets/preload-only.js", `export const f=6;`);
    w("assets/app.css", `body{color:#000}`);

    const { eager } = measure(dir);
    const names = [...eager.keys()].sort();
    const want = ["entry-abc.js", "static-a.js", "static-b.js", "static-c.js", "static-d.js"];
    check(JSON.stringify(names) === JSON.stringify(want), `静态闭包 = ${names.join(",")}（期望 ${want.join(",")}：含传递边与 export…from）`);
    check(!eager.has("dyn-only.js"), "动态 import 的 chunk 不在首屏（dyn-only.js —— 动态边被切断）");
    check(!eager.has("dyn-child.js"), "只经动态 chunk 传递可达者不在首屏（dyn-child.js —— 闭包没穿过动态边界）");
    check(!eager.has("preload-only.js"), "只在 <link rel=modulepreload> 出现的 chunk 不在首屏（口径只认静态 ESM import 边）");
    check(!eager.has("app.css"), "CSS 不在首屏 JS（只算 .js）");
    check(eager.get("entry-abc.js").bytes === statSync(join(dir, "assets/entry-abc.js")).size, "入口 chunk 原始字节 == 文件系统字节（没量错文件）");
    const sum = want.reduce((a, n) => a + gzipSync(readFileSync(join(dir, "assets", n)), { level: 6 }).length, 0);
    check([...eager.values()].reduce((a, c) => a + c.gzip, 0) === sum, `gzip 求合 == zlib level 6 独立复算（${sum} B）`);

    for (const d of ["empty", "noscript/assets", "partial/assets"]) mkdirSync(join(dir, d), { recursive: true });
    w("noscript/index.html", `<!doctype html><html><body></body></html>`);
    w("partial/index.html", `<script type="module" src="/assets/gone.js"></script>`);
    // 夹具产物是人工造的（`dyn-only.js` 之类不可能命中真实基线）⇒ 夹具子进程显式关懒侧判定，本自检继续只证**首屏**口径与退出码契约 ⇒ 读数逐字不变。⚠️ `--no-lazy` 必须排在**所有带值旗标之后**（`opt()` 取旗标的下一个 argv 元素；紧跟 `--dist` 会把它吃掉）。
    const child = (...args) => spawnSync(process.execPath, [SELF, "--no-build", "--dist", ...args, "--no-lazy"], { encoding: "utf8" });
    const cases = [
      ["dist 不存在", 2, [join(dir, "nope")]],
      ["空 dist（无 index.html）", 2, [join(dir, "empty")]],
      ["index.html 无 module script", 2, [join(dir, "noscript")]],
      ["index.html 指向不存在的 chunk（产物残缺）", 2, [join(dir, "partial")]],
      ["--budget 非数字", 2, [dir, "--budget", "abc"]],
      ["夹具超预算（--budget 0.001）", 1, [dir, "--budget", "0.001"]],
      ["夹具达标（--budget 100000）", 0, [dir, "--budget", "100000"]],
    ];
    for (const [label, wantCode, args] of cases) {
      const r = child(...args);
      const firstErr = r.stderr ? r.stderr.trim().split("\n")[0] : "";
      check(r.status === wantCode, `${label} ⇒ 期望 exit ${wantCode}，实得 ${r.status}${r.status === wantCode ? "" : ` · ${firstErr}`}`);
    }

    const realDist = join(APP, "dist");
    if (existsSync(join(realDist, "index.html"))) {
      const real = measure(realDist);
      console.log(`self-test｜真实产物校准（只报告不断言，Task 6 之后该值会合法下降）：`);
      console.log(`  ${rel(realDist)}：首屏 ${real.eager.size} 个 chunk · gzip ${fmtB(real.eagerBytes)} B = ${kB(real.eagerBytes)} kB`);
      console.log(`  冻结校准点（单一 chunk 构建）= 654,722 B = 654.72 kB —— 不符时先怀疑脚本，绝不改数字。`);
    } else {
      console.log("self-test｜未发现 app/dist/index.html ⇒ 跳过真实产物校准（夹具断言不依赖它）");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (problems.length) {
    console.error(`❌ self-test 失败 ${problems.length} 项：`);
    for (const p of problems) console.error(`  · ${p}`);
    process.exit(2);
  }
  console.log("✅ self-test 通过（静态跟随含传递边 / 动态切断 / 只算 .js / 退出码契约 0·1·2）");
  process.exit(0);
}

if (!Number.isFinite(BUDGET_KB) || BUDGET_KB <= 0) {
  fail(`--budget 需要正数（实得 "${opt("--budget", "")}"）—— 预算解析失败时绝不能静默按「超标」处理。`);
}
if (has("--dist") && !NO_BUILD) fail(`--dist 与构建互斥：--dist 用于既有产物或自检夹具，请配 --no-build。`);
// `--no-lazy` 是**夹具通道**而不是「守卫开关」：只许与 `--dist` 同用，且不得指向默认产物目录
// ⇒ 真实产物（CI / husky / 收口读数）上懒侧门禁**恒开**。
if (NO_LAZY && (!has("--dist") || DIST === resolve(join(APP, "dist")))) fail(`--no-lazy 只许配 --dist 且不得指向默认产物目录 ${rel(join(APP, "dist"))} —— 真实产物上懒侧门禁恒判。`);
// 度量已搬进 `./lib/bundleMeasure.mjs`：那边的 `fail()` **只抛** `BudgetError`（度量模块不得持有进程
// 出口），这里把它桥回本件的统一出口（`console.error` + `exit 2`，文案逐字不变）。用**专属类型**是为了
// 让其余异常继续原样上抛 —— 拆前它们就是未捕获栈 + exit 1，无差别转 exit 2 才是真的行为变化。
try {
  if (SELF_TEST) selfTest();
  if (!NO_BUILD) {
    console.log(`▶ cd app && npm run build（--no-build 可跳过；产物写入 app/dist）`);
    const r = spawnSync("npm", ["run", "build"], { cwd: APP, stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) fail(`npm run build 失败（exit ${r.status}）—— 构建不绿时「首屏 gzip」没有意义，先修构建。`);
  }
  finish(measure(DIST));
} catch (e) {
  if (e instanceof BudgetError) fail(e.message);
  throw e;
}
