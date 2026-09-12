/**
 * @ai-context **加载态棘轮的扫描仪器**（收口评审 I-3 的落点：`loadingRatchet.test.ts` 已贴 300 行硬限，
 * 加两条锚必须先把仪器析出 —— 与 T13 把仪器析出成 `sliceScan.ts` 同一处置）。
 *
 * Why 单独成件：本件**不含任何断言、不读基线**，只做「把 `app/src` 变成 `文件 → 五个事实`」。
 *   判定逻辑仍只有一份（`isHandwritten` / `factsOf`），测试与仪器自证共用同一实现 ⇒ 不会出现
 *   「两套口径各自漂移」。
 *
 * ★ 剥注释**改用共享仪器** `sliceScan.stripComments`（原来在 `loadingRatchet.test.ts` 里逐字重写
 *   了一份）：两份状态机各自漂移的风险是真的 —— `sliceScan` 那份刚修掉「`</x>` 的 `/` 被当成
 *   正则起点」的假阴（收口评审 **I-1**），重写的那份**同样中招**（本仓 `Loading` 族的扫描域里
 *   恰好没有「两个闭合标签之间夹加载文案」的形态，所以没暴露 ⇒ 更该并成一份）。
 *
 * ★ 扫描口径（与 `tmp/scan-callsites.mjs` / T1 的 loading 类**同源**；口径本身是判据的一部分）
 *   ① 域 = `app/src/**` 的 `.ts`/`.tsx` 减 `*.test.ts(x)` 减 `ui/primitives/**` 减 `ui/icons/**`；
 *   ② 先剥注释（`sliceScan` 抹等长空白保行号）；字符串/模板只跳过不抹内容 —— 判据读的正是可见文案；
 *   ③ 行口径 `/加载[^"'`\n]{0,8}(中|…)/`，同行多次命中算 1 行（与 T1 的 18 行读数可比）；
 *      **唯一例外**：文案由原语的 `label` 承载时**不计**（`label="…"` / `label={…}` —— 那是迁移的
 *      终点形态，不是手写占位）。冻结时域内 `label=` 载体 0 处 ⇒ 与 T1 读数逐字可比；跨行 label 会
 *      被误计，实测本仓 0 例（迁移面 5 处 label 全在同行），已由 ① 的仪器对照钉住。
 *
 * 副作用：模块加载时**只读**磁盘一次（递归遍历 `app/src`）。边界：文本级仪器、不做 AST。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./sliceScan";

/** `app/src` —— 基线的键就是相对这个目录的正斜杠路径。 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 可见加载文案（与 T1 的 loading 类同源；`g` 只用于统计，逐行判断用 `test`）。 */
export const RE_LOADING_TEXT = /加载[^"'`\n]{0,8}(中|…)/;
/** 原语 `label` 载体：`label="…"` / `label={'…'}` / `label={…}`（该行不计入手写占位）。 */
export const RE_PRIMITIVE_LABEL = /(?<![\w-])\blabel\s*=(?:\{|["'`])/;
/** 原语用法：`<Loading …` / `<Skeleton …`（`</Loading>` 不算、深导入不算 —— 只认标签）。 */
export const RE_PRIMITIVE_USE = /<(?:Loading|Skeleton)[\s/>]/;
export const RE_SKELETON_USE = /<Skeleton[\s/>]/;
export const RE_LOADING_USE = /<Loading[\s/>]/;
/** `busy` 承载：`busy={loading}` / `busy` 简写。 */
export const RE_BUSY = /\bbusy(?:=\{|[>\s])/;

/** 单行的「手写占位」判定（仪器自证与扫描共用同一实现，防「两套口径」） */
export function isHandwritten(line: string): boolean {
  return RE_LOADING_TEXT.test(line) && !RE_PRIMITIVE_LABEL.test(line);
}

/** 剥注释（转发共享仪器；本文件与测试都不再自带一份） */
export { stripComments };

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

export const isTest = (f: string): boolean => /\.test\.(ts|tsx)$/.test(f);
export const isPrim = (f: string): boolean => f.includes(`${sep}ui${sep}primitives${sep}`);
export const isIcons = (f: string): boolean => f.includes(`${sep}ui${sep}icons${sep}`);

export interface FileFacts {
  /** 剥注释后文本里可见加载文案的**行数** */
  hits: number;
  hasPrimitive: boolean;
  hasSkeleton: boolean;
  hasLoading: boolean;
  hasBusy: boolean;
}

/** 扫单个文件的五个事实（供扫描与仪器自证共用） */
export function factsOf(abs: string): FileFacts {
  const stripped = stripComments(readFileSync(abs, "utf8"));
  const lines = stripped.split("\n");
  return {
    hits: lines.filter(isHandwritten).length,
    hasPrimitive: RE_PRIMITIVE_USE.test(stripped),
    hasSkeleton: RE_SKELETON_USE.test(stripped),
    hasLoading: RE_LOADING_USE.test(stripped),
    hasBusy: RE_BUSY.test(stripped),
  };
}

/** 域内逐文件事实（键 = 相对 `app/src` 的正斜杠路径） */
export function scan(): Map<string, FileFacts> {
  const map = new Map<string, FileFacts>();
  for (const f of walk(SRC)) {
    if (isTest(f) || isPrim(f) || isIcons(f)) continue;
    map.set(relative(SRC, f).split(sep).join("/"), factsOf(f));
  }
  return map;
}

/** 扫描结果（模块加载时算一次；`HITTING` = 命中 > 0 的文件，`TOTAL` = 命中行总数） */
export const SCAN: Map<string, FileFacts> = scan();

export const HITTING: [string, FileFacts][] = [...SCAN.entries()].filter(([, v]) => v.hits > 0);

export const TOTAL: number = HITTING.reduce((n, [, v]) => n + v.hits, 0);
