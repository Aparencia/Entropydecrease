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
  'app/src-tauri/src/lib.rs',
  'app/src-tauri/src/types.rs',
  'app/src-tauri/src/live_session_frame.rs',
  'app/src-tauri/src/commands_ai_refine.rs',
  'app/src/pages/ClassroomPage.tsx',
  'app/src-tauri/src/db_goals.rs',
  'app/src-tauri/src/commands_goals.rs',
  'app/src-tauri/src/ai_refine_task.rs',
  'app/src/components/SessionDetailPanel.tsx',
  'app/src/components/NoteListView.tsx',
  'app/src-tauri/src/note_filter.rs',
  'app/src-tauri/src/artifact_templates.rs',
  'app/src-tauri/src/video_profile.rs',
  'app/src/components/SessionListPanel.tsx',
  'app/src/pages/NotesPage.tsx',
];

const toPosix = (p) => p.split(sep).join('/');

/**
 * 行数口径的**唯一实现**：全部行数（含空行）。
 * 与 [System.IO.File]::ReadAllLines(path, UTF8).Count 等价：末尾换行不额外算一行。
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

function check({ full }) {
  const measured = scanTree();
  // 规模自检：没有它，扫描域失效会让 (a)/(c) 静默通过、(d) 反把 117 条登记行报成"指向不存在的文件"。
  // 更危险的是未来：FROZEN_OVER_LIMIT 被清空（0-C2/C3 拆完后）时，双失效会给出 exit 0 绿灯。
  if (measured.size === 0) {
    console.error(
      `❌ line-limits：扫描域为空 —— ${SCAN_DIRS.join(' / ')} 下没有匹配 ${SOURCE_EXT} 的文件。\n` +
        `   这几乎总是路径写错或工作目录不对，**不是"没有超限文件"**。`,
    );
    process.exit(1);
  }

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
  console.log(`✅ line-limits（${mode}）：>${HARD_LIMIT} 硬限 ${over}（棘轮内）· ${SOFT_LIMIT+1}–${HARD_LIMIT} 档 ${band} · 登记条目 ${rows.length}`);
}

// 主入口判定：**必须**用 fileURLToPath + resolve 比较。
// `import.meta.url` 在 Windows 上是 `file:///D:/.../a%20b.mjs`（三斜杠 + 空格转义成 %20），
// 拼 `file://${process.argv[1]}` 得到的字符串**永远不相等** ⇒ 脚本会静默什么都不做（本计划初稿即有此错）。
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  check({ full: process.argv.includes('--full') });
}
