#!/usr/bin/env node
/**
 * @ai-context 行数红线的**唯一**测量与校验工具（AGENTS.md §3.1）。
 *
 * Why：红线此前无法执行 —— 规范没定口径、登记表是只追加的历史日志（同一文件多行、
 * 读者无法判断哪行有效）、且 15 个 >600 违规中有 10 个被登记表用 <600 的数字
 * 「认证为合规」。故把「测量」收进一个脚本：写表与查表共用同一套逻辑，口径只有一处实现。
 *
 * 副作用：`--write` 会重写 docs/standards/line-limit-exemptions.md（人工维护的
 * 「豁免理由 / 拆分计划」两列按路径保留）；默认模式只读。
 * 边界：只扫 app/src 与 app/src-tauri/src 下的 .ts/.tsx/.rs。>600 用**棘轮**而非
 * 「立刻为零」—— 拆分是 0-C2/C3 的事，本脚本负责让违规**不再增加**且**可见**。
 *
 * 用法：node scripts/line-limits.mjs [--write|--full]
 * 忽略任何传入的文件参数，**永远全树扫描**（门禁因此不必依赖 glob —— 旧 glob 的命中集还大于扫描域）。
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname, sep, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['app/src', 'app/src-tauri/src'];
const SOURCE_EXT = /\.(ts|tsx|rs)$/;
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
const OVER_PREFIX = `超硬限（>${HARD_LIMIT} 行），不允许豁免`;
/** 幂等：读回时先剥掉生成器自己加的前缀，否则每次 --write 都会叠加一层 */
const stripOverPrefix = (t) =>
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

/** 从登记表抽出条目：| 路径 | 行数 | … | */
export function parseTable() {
  const abs = join(ROOT, TABLE_PATH);
  if (!existsSync(abs)) return [];
  const rows = [];
  for (const line of readFileSync(abs, 'utf8').split('\n')) {
    const m = /^\|\s*`?([^|`]+?\.(?:rs|tsx?))`?\s*\|\s*(\d+)\s*\|/.exec(line);
    if (m) rows.push({ path: m[1].trim(), declared: Number(m[2]) });
  }
  return rows;
}

/** 从现有登记表按路径抽出人工维护的两列（生成器保留它们） */
function parseReasons() {
  const abs = join(ROOT, TABLE_PATH);
  const map = new Map();
  if (!existsSync(abs)) return map;
  for (const line of readFileSync(abs, 'utf8').split('\n')) {
    const m = /^\|\s*`?([^|`]+?\.(?:rs|tsx?))`?\s*\|\s*\d+\s*\|\s*([^|]*)\|\s*([^|]*)\|/.exec(line);
    if (m) map.set(m[1].trim(), { why: m[2].trim(), split: m[3].trim() });
  }
  return map;
}

/** 取该文件 `@ai-context` 的首行要点，作为自动补登时的理由 */
function autoReason(absPath) {
  const src = readFileSync(absPath, 'utf8');
  // 捕获**整行**再清洗，而不是用 `[^\n*]+` 直接卡在 `*` 上 —— 本仓大量 `@ai-context` 行以
  // `**加粗**` 开头（如 `@ai-context **域图标**几何（9 个）：…`），卡 `*` 会**一格都捕获不到**，
  // 使 45 条自动理由全部退化成占位符。
  const m = /@ai-context[：:]?\s*([^\n]+)/.exec(src);
  if (!m) return '（待补理由：本条目由生成器补登）';
  const text = m[1]
    .replace(/\*\/\s*$/, '') // 单行块注释的收尾 `*/`
    .replace(/\*\*/g, '') // 加粗标记
    .trim();
  return text ? `${text}（自动摘取，待细化）` : '（待补理由：本条目由生成器补登）';
}

/**
 * 扫描域规模守卫：`check()` 与 `writeTable()` **两个入口共用**，且必须在做任何事之前调用 ——
 * 没有它，扫描域失效时 check 会把 (a)/(c) 静默判绿、write 会把登记表清空还打印 ✅ 并 exit 0。
 */
function assertScanSane(measured) {
  if (measured.size === 0) {
    console.error(
      `❌ line-limits：扫描域为空 —— ${SCAN_DIRS.join(' / ')} 下没有匹配 ${SOURCE_EXT} 的文件。\n` +
        `   这几乎总是路径写错或工作目录不对，**不是"没有超限文件"**，更不是"可以安全重写登记表"。`,
    );
    process.exit(1);
  }
  // 逐目录断言：只坏一个目录时，(b)/(d) 会刷出上百条"→ 删除该行"，把人引向删棘轮/删条目
  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) {
      console.error(`❌ line-limits：扫描目录不存在 —— ${dir}（SCAN_DIRS 配置或工作目录有问题）`);
      process.exit(1);
    }
    const hits = [...measured.keys()].filter((p) => p.startsWith(`${dir}/`)).length;
    if (hits === 0) {
      console.error(`❌ line-limits：扫描目录下没有任何匹配文件 —— ${dir}（期望 .ts/.tsx/.rs，实际 0 个）`);
      process.exit(1);
    }
  }
  // 覆盖断言（上面两条的补集）：SCAN_DIRS **少写一个目录**时列出的目录都存在且有命中 ⇒ 上面全过，但棘轮/登记表里的文件整体落到扫描域外 ⇒ (b)/(d) 报成"→ 删除该行"、--write 整片删掉仍打印 ✅（实测 ['app/src']：10×(b)+102×(d)；--write exit 0，179 → 77 行 / 138 → 36 条）。
  const declared = new Set([...FROZEN_OVER_LIMIT, ...parseReasons().keys()]);
  const uncovered = [...declared].filter((p) => !SCAN_DIRS.some((d) => p.startsWith(`${d}/`)));
  if (uncovered.length) {
    console.error(
      `❌ line-limits：扫描域覆盖不全 —— 棘轮/登记表有 ${uncovered.length} 条不在 ${SCAN_DIRS.join(' / ')} 下（如 ${uncovered[0]}）：\n` +
        `   SCAN_DIRS 少写目录会把它们误报成"→ 删除该行"，--write 更会整片删掉它们仍打印 ✅。`,
    );
    process.exit(1);
  }
}

/** 逐字保留「已拆分 / 登记移除记录」整节 */
function parseHistory() {
  const abs = join(ROOT, TABLE_PATH);
  if (!existsSync(abs)) return '';
  const src = readFileSync(abs, 'utf8');
  const at = src.indexOf('## 已拆分');
  return at < 0 ? '' : src.slice(at).trimEnd() + '\n';
}

function writeTable() {
  const measured = scanTree();
  // ⚠️ 必须在 parseReasons()/writeFileSync() **之前**：否则扫描域失效时它会把 138 条清成表头 + 历史节（实测 179 → 41 行）还打印 ✅、exit 0。同类破坏在"SCAN_DIRS 少写一个目录"时同样可达。
  assertScanSane(measured);
  const reasons = parseReasons();
  // 并列时必须按路径断开：`scanTree` 的 Map 迭代序来自 readdirSync，**跨平台不一致**
  // （Windows 与 Linux 的顺序可能不同）⇒ 只按行数排会让 `--write` 在不同平台产出不同字节。
  const byLinesDesc = (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]);
  const over = [...measured.entries()].filter(([, n]) => n > HARD_LIMIT).sort(byLinesDesc);
  const band = [...measured.entries()].filter(([, n]) => n > SOFT_LIMIT && n <= HARD_LIMIT).sort(byLinesDesc);
  // 单元格净化：文本里的半角 `|` 会撑破 Markdown 表格，并让下次 `parseReasons` 误切列。
  // 换**全角** `｜` 而不是 `\|` —— 转义写法在下次读取时会被再次转义，破坏 `--write` 的幂等性。
  const cell = (t, fallback) => {
    const s = (t ?? '').replace(/\|/g, '｜').replace(/\s*\n\s*/g, ' ').trim();
    return s || fallback;
  };
  const row = (p, n, why, split) => `| ${p} | ${n} | ${cell(why, '（待补理由）')} | ${cell(split, '若再增长：按职责拆分')} |`;
  // 超硬限行的说明＝**生成器常量前缀 + 人工理由**。表头 :5 宣称这两列「由人工维护，生成器按路径保留」，
  // 只写常量会让按表头指引写进这一列的文字在下一次 `--write` 被整列吞掉（旧表 15 条 / 1993 字即如此丢失）；
  // 前缀保证"不允许豁免"不可被人工理由改写，人工文字仍完整保留（`stripOverPrefix` 保证幂等）。
  const overWhy = (p) => {
    const human = stripOverPrefix(reasons.get(p)?.why ?? '');
    return human ? `${OVER_PREFIX} —— ${human}` : OVER_PREFIX;
  };

  const lines = [
    '# 单文件行数豁免登记（AGENTS.md §3：单文件 ≤300 行；301–600 行须登记本清单）',
    '',
    '> ⚠️ **本文件是生成物** —— 行数与条目成员关系由 `node scripts/line-limits.mjs --write` 生成，',
    '> **不要手改数字、手加行或手删行**（会被 `node scripts/line-limits.mjs` 判为违规）。',
    '> 「豁免理由」「拆分计划」两列由**人工**维护，生成器按路径保留；「已拆分 / 登记移除记录」节逐字保留。',
    '>',
    '> **测量口径（唯一有效）**：文件**全部行数**（含空行），等价于 `[System.IO.File]::ReadAllLines(path, UTF8).Count`。',
    '> ⚠️ **禁用** `Get-Content` 数行（本机 PowerShell 5.1 + 码页 `gb2312` 会按 GBK 解码、吞换行、**少算**）与 `Measure-Object -Line`（**只数非空行**）。',
    '>',
    `> 规则：≤${SOFT_LIMIT} 行无需登记；${SOFT_LIMIT + 1}–${HARD_LIMIT} 行须登记；**>${HARD_LIMIT} 行必须硬拆，不允许豁免**。`,
    '',
    `## 超硬限（>${HARD_LIMIT} 行，必须硬拆，不允许豁免）`,
    '',
    '> 本表受棘轮守卫保护：**只允许减少**。每完成一个拆分，从 `scripts/line-limits.mjs` 的 `FROZEN_OVER_LIMIT` 删掉对应一行。',
    '',
    // ⚠️ 本表**保持 4 列**（与下一节同形），不要"顺手"简化成 3 列 —— `parseReasons` 用 4 列正则
    // 按路径保留人工维护的两列，改成 3 列会让这些拆分计划在**下一次重生成时静默丢失**。
    '| 文件 | 行数 | 说明 | 拆分计划 |',
    '|---|---|---|---|',
    ...over.map(([p, n]) => row(p, n, overWhy(p), reasons.get(p)?.split || `**超硬限必须拆**：拆到各文件 ≤${SOFT_LIMIT} 行`)),
    '',
    `## ${SOFT_LIMIT + 1}–${HARD_LIMIT} 档（须登记）`,
    '',
    '| 文件 | 行数 | 豁免理由 | 拆分计划 |',
    '|---|---|---|---|',
    ...band.map(([p, n]) => {
      const r = reasons.get(p);
      return row(p, n, r?.why || autoReason(join(ROOT, p)), r?.split);
    }),
    '',
    parseHistory(),
  ];
  writeFileSync(join(ROOT, TABLE_PATH), lines.join('\n'), 'utf8');
  console.log(`✅ 已重写 ${TABLE_PATH}：>${HARD_LIMIT} 硬限 ${over.length} · ${SOFT_LIMIT + 1}–${HARD_LIMIT} 档 ${band.length}`);
}

function check({ full }) {
  const measured = scanTree();
  // 规模自检：没有它，扫描域失效会让 (a)/(c) 静默通过、(d) 反把 117 条登记行报成"指向不存在的文件"。
  // 更危险的是未来：FROZEN_OVER_LIMIT 被清空（0-C2/C3 拆完后）时，双失效会给出 exit 0 绿灯。
  // 守卫与 `--write` 入口**共用同一实现**，避免两处口径漂移。
  assertScanSane(measured);

  // 登记表缺失自检：缺了它，(c) 会把每条超限文件逐条报成"未登记"，
  // 而不提示真实原因是登记表不存在 —— 同样把人引向错误的修法。
  const tableAbs = join(ROOT, TABLE_PATH);
  if (!existsSync(tableAbs)) {
    console.error(`❌ line-limits：登记表不存在 —— ${TABLE_PATH}。先运行 --write 生成，或检查路径。`);
    process.exit(1);
  }

  const rows = parseTable();
  const registered = new Set(rows.map((r) => r.path));
  const problems = [];

  // (a) 棘轮只减不增
  const frozen = new Set(FROZEN_OVER_LIMIT);
  for (const [p, n] of measured) {
    if (n > HARD_LIMIT && !frozen.has(p)) problems.push(`(a) 新增 >${HARD_LIMIT} 硬限违规：${p}（${n} 行）→ 必须拆分，不允许登记豁免`);
  }
  // (b) 棘轮无残留
  for (const p of FROZEN_OVER_LIMIT) {
    const n = measured.get(p);
    if (n === undefined) problems.push(`(b) 冻结名单里的文件已不存在：${p} → 从 FROZEN_OVER_LIMIT 删除该行`);
    else if (n <= HARD_LIMIT) problems.push(`(b) 冻结名单里的文件已回到 ${HARD_LIMIT} 以内：${p}（${n} 行）→ 从 FROZEN_OVER_LIMIT 删除该行`);
  }
  // (c) 无漏登
  for (const [p, n] of measured) {
    if (n > SOFT_LIMIT && !registered.has(p)) problems.push(`(c) 超过 ${SOFT_LIMIT} 行但未登记：${p}（${n} 行）→ 运行 --write 补登并填写豁免理由`);
  }
  // (d) 无幽灵/过期条目
  for (const r of rows) {
    const n = measured.get(r.path);
    if (n === undefined) problems.push(`(d) 登记表条目指向不存在的文件：${r.path} → 删除该行`);
    else if (n <= SOFT_LIMIT) problems.push(`(d) 登记表条目已回落至 ${SOFT_LIMIT} 行以内：${r.path}（${n} 行）→ 删除该行`);
  }
  // (e) 数值一致（仅 --full）
  if (full) {
    for (const r of rows) {
      const n = measured.get(r.path);
      if (n !== undefined && n !== r.declared) problems.push(`(e) 行数不一致：${r.path} 声明 ${r.declared} / 实测 ${n} → 运行 --write`);
    }
  }

  const over = [...measured.entries()].filter(([, n]) => n > HARD_LIMIT).length;
  const band = [...measured.entries()].filter(([, n]) => n > SOFT_LIMIT && n <= HARD_LIMIT).length;
  const mode = full ? '--full' : '默认';
  if (problems.length) {
    console.error(`❌ line-limits（${mode}）：${problems.length} 处问题`);
    for (const p of problems) console.error(`  · ${p}`);
    console.error(`\n现状：>${HARD_LIMIT} 硬限 ${over}/${FROZEN_OVER_LIMIT.length}（棘轮）· ${SOFT_LIMIT+1}–${HARD_LIMIT} 档 ${band} · 登记条目 ${rows.length}`);
    process.exit(1);
  }
  console.log(`✅ line-limits（${mode}${full ? ' · 数值一致' : ''}）：>${HARD_LIMIT} 硬限 ${over}（棘轮内）· ${SOFT_LIMIT+1}–${HARD_LIMIT} 档 ${band} · 登记条目 ${rows.length}`);
}

// 主入口判定：**必须**用 fileURLToPath + resolve 比较。
// `import.meta.url` 在 Windows 上是 `file:///D:/.../a%20b.mjs`（三斜杠 + 空格转义成 %20），
// 拼 `file://${process.argv[1]}` 得到的字符串**永远不相等** ⇒ 脚本会静默什么都不做（本计划初稿即有此错）。
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.includes('--write')) writeTable();
  else check({ full: process.argv.includes('--full') });
}
