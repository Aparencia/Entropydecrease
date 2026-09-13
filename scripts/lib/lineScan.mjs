/**
 * @ai-context 自 scripts/line-limits.mjs 拆出（批 8 T1，控制方 §2 G1）；口径与语义逐字不变 —— `countLines` 仍是全仓行数的唯一实现。
 *
 * Why：红线此前无法执行 —— 规范没定口径、登记表是只追加的历史日志（同一文件多行、读者无法判断哪行有效）、
 * 且 15 个 >600 违规中有 10 个被登记表用 <600 的数字「认证为合规」。故把「测量」收进一处：写表与查表共用同一套逻辑，口径只有一处实现。
 * 批 8 T1 只做**搬迁**：把这份「测量与表解析」从 CLI 主件搬进本件，主件只留进程级副作用（argv / 主入口）。
 *
 * 边界：只扫 app/src 与 app/src-tauri/src 下的 .ts/.tsx/.rs。>600 用**棘轮**而非「立刻为零」——
 * 拆分是 0-C2/C3 的事，本件负责让违规**不再增加**且**可见**。
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 仓库根：本件位于 scripts/lib/ ⇒ 上溯两级（原主件在 scripts/ 时上溯一级；`resolve()` 后逐字相同） */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCAN_DIRS = ['app/src', 'app/src-tauri/src'];
export const SOURCE_EXT = /\.(ts|tsx|rs)$/;
export const TABLE_PATH = 'docs/standards/line-limit-exemptions.md';
export const HARD_LIMIT = 600;
export const SOFT_LIMIT = 300;

/**
 * >600 硬限违规的**冻结名单** —— 只允许减少。
 * 每完成一个拆分（0-C2 / 0-C3），就从这里删掉对应一行。
 */
export const FROZEN_OVER_LIMIT = [
];

const toPosix = (p) => p.split(sep).join('/');

/** 超硬限表格的**生成器前缀**：人工理由追在其后，靠 `stripOverPrefix` 保证 `--write` 幂等 */
export const OVER_PREFIX = `超硬限（>${HARD_LIMIT} 行），不允许豁免`;
/** 幂等：读回时先剥掉生成器自己加的前缀，否则每次 --write 都会叠加一层 */
export const stripOverPrefix = (t) =>
  t.startsWith(OVER_PREFIX) ? t.slice(OVER_PREFIX.length).replace(/^\s*——\s*/, '').trim() : t.trim();

/**
 * 行数口径的**唯一实现**：全部行数（含空行）。
 * 与 [System.IO.File]::ReadAllLines(path, UTF8).Count 对**全部常规文本**等价（末尾换行不额外算一行）；
 * 例外仅两处（评审 15 例边界比对中唯二不等，仓内 0 命中）：纯 `\r` 分行（无 `\n`）的文件、内容只有 BOM 的文件。
 */
export function countLines(absPath) {
  const s = readFileSync(absPath, 'utf8');
  if (s === '') return 0;
  return s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
}

/** 递归收集源文件，返回 Map<仓库相对路径(正斜杠), 行数> */
export function scanTree() {
  const out = new Map();
  const walk = (absDir) => {
    for (const entry of readdirSync(absDir)) {
      const abs = join(absDir, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (SOURCE_EXT.test(entry)) out.set(toPosix(relative(ROOT, abs)), countLines(abs));
    }
  };
  for (const d of SCAN_DIRS) {
    const abs = join(ROOT, d);
    if (existsSync(abs)) walk(abs);
  }
  return out;
}

/**
 * 从登记表抽出条目行：| 路径 | 行数 | 豁免理由 | 拆分计划 | —— **查表与写表共用这一处解析口径**。
 * Why 合并（原为 parseTable / parseReasons 两份近似正则）：两者解析的是同一张表，改一处忘一处就会让
 * `check` 与 `--write` 对行数/理由的理解漂移；且只有 4 列全取，写入口才能保留人工维护的两列。
 */
export function parseTable() {
  const abs = join(ROOT, TABLE_PATH);
  if (!existsSync(abs)) return [];
  const rows = [];
  for (const line of readFileSync(abs, 'utf8').split('\n')) {
    const m = /^\|\s*`?([^|`]+?\.(?:rs|tsx?))`?\s*\|\s*(\d+)\s*\|\s*([^|]*)\|\s*([^|]*)\|/.exec(line);
    if (m) rows.push({ path: m[1].trim(), declared: Number(m[2]), why: m[3].trim(), split: m[4].trim() });
  }
  return rows;
}

/** 自动理由的**来源标记**：带它的单元格是生成物 ⇒ 每次 `--write` 重新摘取（见 `humanWhy`） */
const AUTO_SUFFIX = '（自动摘取，待细化）';
/** 注释行前缀（`//` `//!` `///` `*` `/*`）—— 续读时逐行剥离；无前缀的行（裸代码）即注释块已结束 */
const COMMENT_EDGE = /^[ \t]*(?:\/\/[/!]*|\/\*+|\*+\/?)[ \t]?/;
/** 续读上限：当前最长自然终止（`。！？` 句末）需 11 行，12 只作防御（防无空行无句末的注释块被整块吞进单元格） */
const REASON_MAX_LINES = 12;

/**
 * 取该文件 `@ai-context` 的**首句**要点，作为自动补登时的理由。
 * Why 抓整行再清洗：本仓大量 `@ai-context` 行以 `**加粗**` 开头（如 `@ai-context **域图标**几何（9 个）：…`），
 * 用 `[^\n*]+` 直接卡在 `*` 上会**一格都捕获不到**，使自动理由全部退化成占位符。
 * Why 续读：`@ai-context` 常折行（首行停在 `（`/`——`/`+` 等连接符处）⇒ 只取第一个物理行会让理由半句截断
 * （2026-09-11 实测 43 条里 41 条如此）。续读到**句末 / 空行 / 注释块收尾**；句末只认 `。！？` —— 把 `；` 也算句末会停在未闭合括号里（实测 122 条有 1 条）。
 */
export function autoReason(absPath) {
  const lines = readFileSync(absPath, 'utf8').split('\n');
  const at = lines.findIndex((l) => l.includes('@ai-context'));
  if (at < 0) return '（待补理由：本条目由生成器补登）';
  const parts = [];
  for (let i = at; i < lines.length && i < at + REASON_MAX_LINES; i++) {
    const raw = lines[i];
    const close = raw.indexOf('*/'); // 行内块注释收尾：只取它前面的文字
    const bare = close < 0 ? raw : raw.slice(0, close);
    if (i > at && !COMMENT_EDGE.test(bare)) break; // 无注释前缀 = 注释块已结束
    // 首行只取 `@ai-context` 之后的文字；续行剥注释前缀（折行处不补空格 —— 本仓注释在中英混排处断行）
    const body = (i === at ? bare.replace(/^[\s\S]*?@ai-context[：:]?\s*/, '') : bare.replace(COMMENT_EDGE, '')).trim();
    if (body) parts.push(body);
    if (!body || close >= 0 || /[。！？]$/.test(body)) break; // 空行 / 块注释收尾 / 句末
  }
  const text = parts.join('').replace(/\*\*/g, '').trim();
  return text ? `${text}${AUTO_SUFFIX}` : '（待补理由：本条目由生成器补登）';
}

/** 逐字保留「已拆分 / 登记移除记录」整节 */
export function parseHistory() {
  const abs = join(ROOT, TABLE_PATH);
  if (!existsSync(abs)) return '';
  const src = readFileSync(abs, 'utf8');
  const at = src.indexOf('## 已拆分');
  return at < 0 ? '' : src.slice(at).trimEnd() + '\n';
}
