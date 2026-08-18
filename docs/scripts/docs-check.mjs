#!/usr/bin/env node
/**
 * @ai-context
 * docs 体系一致性检查脚本：Markdown 相对链接完整性 + 索引引用存在性 + 命名规范。
 * 用途：文档变更时本地/CI 快速验证，防止失效链接与索引漂移。
 * Why: 历史重组曾致 100+ 失效链接；索引-文件漂移反复发生。本脚本把"链接有效、
 * 索引 1:1"变成可自动校验的门禁（与 lint/test 同级）。
 * 豁免规则：archive/ 为历史快照（按归档机制保留原貌，不检查链接）；file://
 * 绝对路径引用仅在目标文件确实不存在时报错（存在则警告"不可移植"）。
 * 用法：node scripts/docs-check.mjs [--dir docs] [--strict] [--include-archive]
 * 退出码：0 = 通过；1 = 发现问题（--strict 时索引缺失与 file:// 引用也算问题）
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative, dirname, extname, basename, sep } from 'node:path';

const ROOT = resolve(process.cwd());
const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DOCS_DIR = argOf('--dir') ? resolve(argOf('--dir')) : join(ROOT, 'docs');
const STRICT = process.argv.includes('--strict');
const INCLUDE_ARCHIVE = process.argv.includes('--include-archive');
const IGNORE_FILE = join(DOCS_DIR, '.docscheckignore');

/**
 * 读取豁免清单：docs/.docscheckignore，每行一个 glob 模式（匹配相对 DOCS_DIR 的路径）。
 * 用途：历史快照文档（如 versions/ 下已声明保留原貌的旧版本文档）豁免链接检查。
 */
function loadIgnorePatterns() {
  if (!existsSync(IGNORE_FILE)) return [];
  return readFileSync(IGNORE_FILE, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/** 简单 glob 匹配（支持 ** 与 *，不处理 []/{}） */
function globMatch(pattern, path) {
  const re = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\u0000')
        .replace(/\*/g, '[^/]*')
        .replace(/\u0000/g, '.*') +
      '$',
  );
  return re.test(path);
}

/** 收集目录下全部 markdown 文件（递归） */
function collectMd(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === '.git') continue;
    if (statSync(full).isDirectory()) out.push(...collectMd(full));
    else if (extname(full) === '.md') out.push(full);
  }
  return out;
}

/** 提取 markdown 链接目标（忽略外部 URL/锚点/图片），区分相对与 file:// */
function extractLinks(content) {
  const links = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const target = m[1].trim();
    if (!target || target.startsWith('#')) continue;
    if (/^(https?:|mailto:|data:)/.test(target)) continue;
    if (target.startsWith('file://')) {
      links.push({ kind: 'fileurl', target });
      continue;
    }
    if (target.startsWith('/')) continue; // 绝对路径引用不检查
    links.push({ kind: 'rel', target: target.split('#')[0] });
  }
  return links;
}

/** file:// URL 解码为仓库相对路径（Windows 盘符与 %20 编码） */
function fileUrlToRel(target) {
  const decoded = decodeURIComponent(target.replace(/^file:\/\//, ''));
  const norm = decoded.replace(/\\/g, '/');
  const m = norm.match(/^([a-zA-Z]:)?(\/.*)$/);
  if (!m) return null;
  const abs = m[2];
  const rootNorm = ROOT.replace(/\\/g, '/').toLowerCase();
  const absLower = abs.toLowerCase();
  if (absLower.startsWith(rootNorm)) return abs.slice(rootNorm.length + 1);
  return null; // 仓库外引用
}

const files = collectMd(DOCS_DIR);
const ignorePatterns = loadIgnorePatterns();
const isIgnored = (f) => {
  const rel = relative(DOCS_DIR, f).split(sep).join('/');
  return ignorePatterns.some((p) => globMatch(p, rel));
};
const activeFiles = files.filter((f) => {
  if (isIgnored(f)) return false;
  if (INCLUDE_ARCHIVE) return true;
  return !relative(ROOT, f).split(sep).includes('archive');
});

const broken = []; // 真实失效（相对链接目标不存在）
const fileUrlMissing = []; // file:// 指向仓库内但文件不存在
const fileUrlWarn = []; // file:// 指向仓库内且存在（不可移植）
const naming = [];
const missingFromIndex = [];

for (const file of activeFiles) {
  const content = readFileSync(file, 'utf8');
  const dir = dirname(file);
  for (const { kind, target } of extractLinks(content)) {
    if (kind === 'rel') {
      const resolved = resolve(dir, target);
      if (!existsSync(resolved)) broken.push({ file: relative(ROOT, file), target });
    } else {
      const rel = fileUrlToRel(target);
      if (rel === null) continue; // 仓库外引用不判断
      if (existsSync(join(ROOT, rel))) fileUrlWarn.push({ file: relative(ROOT, file), target: rel });
      else fileUrlMissing.push({ file: relative(ROOT, file), target: rel });
    }
  }
  const name = basename(file);
  if (/\s/.test(name)) naming.push({ file: relative(ROOT, file), issue: '文件名含空格' });
  if (/重制|副本|_tmp|\.tmp|copy|-\d+$/i.test(name)) {
    naming.push({ file: relative(ROOT, file), issue: '疑似临时后缀命名' });
  }
}

// 索引覆盖检查（按目录分组，仅检查有 README 的目录）
const dirs = new Map();
for (const file of activeFiles) {
  const dir = dirname(file);
  if (!dirs.has(dir)) dirs.set(dir, { readme: null, files: [] });
  const entry = dirs.get(dir);
  if (basename(file).toLowerCase() === 'readme.md') entry.readme = file;
  else entry.files.push(file);
}
for (const [dir, info] of dirs) {
  if (!info.readme) continue;
  const idxContent = readFileSync(info.readme, 'utf8');
  for (const file of info.files) {
    const name = basename(file);
    if (!idxContent.includes(name)) {
      missingFromIndex.push({ file: relative(ROOT, file), issue: `未收录于 ${relative(ROOT, info.readme)}` });
    }
  }
}

let exitCode = 0;
console.log(
  `docs-check: 扫描 ${files.length} 个 Markdown 文件（检查 ${activeFiles.length} 个，archive 快照与豁免清单除外）`,
);

if (broken.length) {
  exitCode = 1;
  console.error(`\n❌ 失效相对链接 ${broken.length} 处:`);
  for (const b of broken.slice(0, 30)) console.error(`   ${b.file} → ${b.target}`);
  if (broken.length > 30) console.error(`   …另有 ${broken.length - 30} 处`);
} else {
  console.log('✅ 相对链接全部有效');
}

if (fileUrlMissing.length) {
  exitCode = 1;
  console.error(`\n❌ file:// 引用目标不存在 ${fileUrlMissing.length} 处:`);
  for (const b of fileUrlMissing.slice(0, 20)) console.error(`   ${b.file} → ${b.target}`);
} else {
  console.log(`✅ file:// 引用目标均存在${fileUrlWarn.length ? `（${fileUrlWarn.length} 处不可移植，建议改相对链接）` : ''}`);
}

if (naming.length) {
  exitCode = 1;
  console.error(`\n❌ 命名不规范 ${naming.length} 处:`);
  for (const n of naming) console.error(`   ${n.file}（${n.issue}）`);
} else {
  console.log('✅ 文件名规范');
}

if (missingFromIndex.length) {
  console.warn(`\n⚠️ ${missingFromIndex.length} 个文件未收录于本目录索引:`);
  for (const m of missingFromIndex.slice(0, 20)) console.warn(`   ${m.file}（${m.issue}）`);
  if (STRICT) exitCode = 1;
} else {
  console.log('✅ 索引覆盖完整');
}

console.log(exitCode === 0 ? '\n✅ docs-check 通过' : '\n❌ docs-check 发现问题');
process.exit(exitCode);
