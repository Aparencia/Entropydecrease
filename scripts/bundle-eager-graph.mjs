#!/usr/bin/env node
/**
 * @ai-context 首屏静态可达性探针（批 2 包体治理的连通性尺子）。
 *
 * Why：本仓唯一的「首屏」定义是**模块加载边界**，不是「组件看起来是不是按需渲染」。
 *      批 1 的「不删清单」被证伪五次，根因就是用「看起来还有人用」代替「删除后的可达性」；
 *      包体治理是同一类问题的镜像 —— `AiConversationDock` 看起来「按需唤起」，
 *      但它被 App.tsx 静态 import 且常驻挂载，于是整条 markdown+katex 栈都在首屏。
 *      唯一可靠的判据是：从 app/src/main.tsx 出发、只沿静态 ESM import 走。
 *
 * 口径：静态边 = `from "…"` 与裸 `import "…"`；`import(…)` 是动态边界，**不跟**。
 *      相对说明符按 Node 解析顺序补扩展名（"", .ts, .tsx, .js, .jsx, /index.ts, /index.tsx）；
 *      裸说明符按包名归并（`@scope/name` 取两段）。
 *
 * 副作用：只读文件系统；不写任何文件。
 * 边界：不做 tsconfig paths 解析、不处理 `export * as ns from`（本仓未使用）。
 * 用法：node scripts/bundle-eager-graph.mjs [--json] [--entry app/src/main.tsx]
 * 退出码：0 = 正常；1 = 入口不存在。
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, relative, sep, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const AS_JSON = argv.includes("--json");
const entryArg = argv.indexOf("--entry") >= 0 ? argv[argv.indexOf("--entry") + 1] : "app/src/main.tsx";
const ENTRY = resolve(ROOT, entryArg);
const EXT = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];
const RE_FROM = /\bfrom\s*["']([^"']+)["']/g;
const RE_BARE = /\bimport\s*["']([^"']+)["']/g;

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const e of EXT) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

export function eagerGraph(entry) {
  const visited = new Set();
  const packages = new Map();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    const specs = [];
    for (const re of [RE_FROM, RE_BARE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) specs.push(m[1]);
    }
    for (const spec of specs) {
      const resolved = resolveSpec(file, spec);
      if (resolved) { if (!visited.has(resolved)) queue.push(resolved); }
      else if (!spec.startsWith(".")) {
        const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        packages.set(name, (packages.get(name) ?? 0) + 1);
      }
    }
  }
  return { files: [...visited].sort(), packages: [...packages.keys()].sort() };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (!existsSync(ENTRY)) {
    console.error(`❌ 入口不存在：${relative(ROOT, ENTRY)}`);
    process.exit(1);
  }
  const { files, packages } = eagerGraph(ENTRY);
  if (AS_JSON) {
    console.log(JSON.stringify({ entry: relative(ROOT, ENTRY), files: files.map((f) => relative(ROOT, f)), packages }, null, 2));
  } else {
    console.log(`入口：${relative(ROOT, ENTRY)}`);
    console.log(`首屏静态可达应用源文件：${files.length}`);
    console.log(`首屏拉入的 npm 包：${packages.length}`);
    for (const p of packages) console.log(`  - ${p}`);
    console.log(`逐文件清单：加 --json 输出`);
  }
}
