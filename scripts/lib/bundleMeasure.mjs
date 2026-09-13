/**
 * @ai-context 首屏预算守卫的**度量实现**（批 7 T8 从 `scripts/check-bundle-budget.mjs` 纯搬迁而来）。
 *
 * Why 独立成件：主件是**唯一**判首屏的门禁，而它当时 **299/300 行（余 1）** —— 批 7 还要往主件加
 *      懒侧字节门禁（C9.6 第 4 条逐字「先拆件再加门禁」）⇒ 先把「度量」与「CLI / 报表 / 退出码」
 *      物理分离。⚠️ 本件**不在** `scripts/line-limits.mjs:23` 的 `SOURCE_EXT = /\.(ts|tsx|rs)$/` 视野内
 *      ⇒ 「≤150 行」是自设预算、**不是**绑定约束（`.mjs` 不受行数门禁管辖）。
 *
 * 口径（与主件文件头的「口径」一节是**同一个**口径，勿在此另立一套；真伪由主件 `--self-test` 的
 *      负样本夹具证）：首屏 = `dist/index.html` 里 `<script type="module">` 指向的入口 chunk，
 *      **加上从入口出发只沿静态 ESM `import` / `export … from` 可达的全部 `.js` chunk**；
 *      `import(…)` 动态边是断点；gzip = `zlib.gzipSync(buf, { level: 6 })`；kB = 十进制 ÷1000
 *      （vite 口径，不是 KiB ÷1024）。
 *
 * 副作用：**只读**文件系统（`dist` 与其 `assets/`）；**无进程出口**（见下方 `fail` 的形态）。
 * 边界：vite 的 chunk 一律平铺在 `dist/assets/` 下（本件按 basename 解析）；不解析 sourcemap、
 *      不解析 CSS 里的 `url()`、不认带 query 的说明符 —— 三者在本仓产物中都不存在。
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/** ⚠️ 本件住 `scripts/lib/` ⇒ 仓库根上溯**两级**；搬迁前主件住 `scripts/` 只上溯一级，改目录结构须同步改此行。 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * 本件唯一的失败信号：主件 `catch` 到它才转 `fail()`（exit 2）。
 * Why 专属类型而非裸 `Error`：拆前的 `fail()` 立即 `process.exit(2)`、**不吞别的异常**；若主件无差别
 * 地把任何异常都转成 exit 2，会把「未预期 IO 异常」的退出形态（未捕获栈 + exit 1）静默改掉 —— 那才是
 * 真的行为变化。故只认这一个类型，其余异常原样上抛。
 */
export class BudgetError extends Error {}

const rel = (p) => relative(ROOT, p).split("\\").join("/");
/**
 * 与主件 `fail()` **同名同参**，但**只抛不退出** —— 度量模块不得持有进程出口（拆前它在这里直接
 * `process.exit(2)`，等于把「产物缺失」变成库的副作用）。🔴 这是拆件中**唯一**一处语义改写：4 个调用点
 * 与消息文本逐字未动，主件在同名出口里保留 `console.error` + `process.exit(2)` 并由
 * `e instanceof BudgetError` 桥接 ⇒ stderr 文案与退出码逐字相同（对拍证据在 `tmp/t8/`）。
 */
function fail(msg) {
  throw new BudgetError(msg);
}
const fmtB = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const kB = (n) => (Math.round(n / 10) / 100).toFixed(2); // 半进位：与 vite 打印口径一致（11745 B：toFixed 给 11.74、vite 给 11.75）
const gzBytes = (buf) => gzipSync(buf, { level: 6 }).length;

/** 动态形态先整段剥掉；静态形态要求引号紧跟 `from` / `import`（产物里就是 `from"./x.js"`）。 */
const RE_DYNAMIC = /import\s*\(\s*["'][^"']+["']\s*\)/g;
const RE_STATIC = [/\bfrom\s*["']\.\/([^"'/\\]+\.js)["']/g, /\bimport\s*["']\.\/([^"'/\\]+\.js)["']/g];

/** 一段 chunk 代码里的静态 ESM 依赖（basename 集合）；`export … from` 与裸 `import` 都算静态边。 */
function staticDeps(code) {
  const text = code.replace(RE_DYNAMIC, "");
  const out = new Set();
  for (const re of RE_STATIC) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) out.add(m[1]);
  }
  return out;
}

/** 从 index.html 取入口 chunk 的 basename；解析不到即产物问题 ⇒ exit 2（属性顺序无关）。 */
function entryChunkName(dist) {
  const htmlPath = join(dist, "index.html");
  if (!existsSync(htmlPath) || !statSync(htmlPath).isFile()) {
    fail(`找不到 ${rel(htmlPath)} —— 产物缺失。先跑「cd app; npm run build」，或去掉 --no-build 让本脚本代跑。`);
  }
  const html = readFileSync(htmlPath, "utf8");
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\btype\s*=\s*["']module["']/i.test(tag)) continue;
    const m = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag);
    const base = m ? m[1].split(/[?#]/)[0].split("/").pop() : "";
    if (base && base.endsWith(".js")) return base;
  }
  fail(`${rel(htmlPath)} 里没有带 src 的 <script type="module"> —— 空/损坏的 dist 走这条，不是「零字节首屏」。`);
}

/** 首屏闭包：从入口 BFS，**只沿静态边**；动态可达的 chunk 不会进来。返回 Map<basename,{bytes,gzip}>。 */
function firstScreenChunks(dist) {
  const entry = entryChunkName(dist);
  const assets = join(dist, "assets");
  if (!existsSync(assets) || !statSync(assets).isDirectory()) fail(`找不到 ${rel(assets)} 目录 —— 产物缺失。`);
  const eager = new Map();
  const queue = [entry];
  while (queue.length) {
    const name = queue.shift();
    if (eager.has(name)) continue;
    const p = join(assets, name);
    if (!existsSync(p) || !statSync(p).isFile()) fail(`首屏 chunk 静态引用了 ${name}，但 ${rel(p)} 不存在 —— 产物残缺。`);
    const bytes = readFileSync(p);
    eager.set(name, { bytes: bytes.length, gzip: gzBytes(bytes) });
    for (const dep of staticDeps(bytes.toString("utf8"))) if (!eager.has(dep)) queue.push(dep);
  }
  return eager;
}

/** 产物资产清单（vite 把 chunk / CSS / 字体平铺在 dist/assets 下）。 */
function listAssets(dist) {
  const assets = join(dist, "assets");
  if (!existsSync(assets) || !statSync(assets).isDirectory()) return [];
  return readdirSync(assets)
    .map((name) => join(assets, name))
    .filter((p) => statSync(p).isFile())
    .map((p) => ({ name: p.slice(assets.length + 1), path: p, bytes: statSync(p).size }));
}

/** 唯一的度量实现（报表与 JSON 共用）：量一次产物，返回全部读数。 */
function measure(dist) {
  const assets = listAssets(dist);
  const eager = firstScreenChunks(dist);
  const gzFile = (p) => gzBytes(readFileSync(p));
  const shaped = (a) => { const g = gzFile(a.path); return { name: a.name, bytes: a.bytes, gzipBytes: g, gzipKb: Number(kB(g)) }; };
  const htmlPath = join(dist, "index.html");
  return {
    dist,
    eager,
    eagerBytes: [...eager.values()].reduce((a, c) => a + c.gzip, 0),
    rawBytes: [...eager.values()].reduce((a, c) => a + c.bytes, 0),
    lazy: assets.filter((a) => a.name.endsWith(".js") && !eager.has(a.name)).map(shaped),
    excluded: assets.filter((a) => !a.name.endsWith(".js")).map(shaped),
    htmlBytes: existsSync(htmlPath) ? statSync(htmlPath).size : 0,
    htmlGzip: existsSync(htmlPath) ? gzFile(htmlPath) : 0,
  };
}

/** 对外接口 = 主件所需 + T9 的懒侧门禁复用（**同一个**度量实现才保证两个读数同口径）⇒ `rel` 一并导出。 */
export { rel, fmtB, kB, gzBytes, staticDeps, entryChunkName, firstScreenChunks, listAssets, measure };
