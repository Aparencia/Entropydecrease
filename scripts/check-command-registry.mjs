#!/usr/bin/env node
/**
 * @ai-context 命令注册一致性门禁（批 0-C3 Task 1，与 `line-limits.mjs` 同级）。
 *
 * Why：334 条 `tauri::generate_handler![…]` 注册清单已从 `lib.rs` 搬进 `app_commands.rs`。
 *      IPC 注册是唯一**静默失败**的面——漏一条 ⇒ 编译通过、`cargo test` 全绿，只有用户点到
 *      该功能才报 `command … not found`；重一条 ⇒ 同域内只是 `unreachable_patterns` **警告**。
 *      ⇒ 拆分把「一份清单」换成「数据文件 + 门禁」，人眼审计必须由本脚本接管。
 * 口径：IPC 名 = 路径**末段** ident（`tauri-macros-2.6.3/src/command/handler.rs:46-58`）⇒ 定义侧
 *      `#[tauri::command] fn foo` 与注册侧 `crate::commands_x::foo` 都归一成 `foo`；三向检查
 *      **漏注册** / **多注册** / **重名**。
 * 副作用：只读源码；`--self-test` 只在系统临时目录建夹具并清理，不碰仓库。边界：纯文本扫描
 *      （无需 Rust 工具链，pre-commit 可用）；不展开宏、不做语义分析。
 * 用法与退出码：见文末 USAGE；三向检查任一命中 = 1；参数错误 / 无法执行 = 2；自测漏抓 = 1。
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REGISTRY = 'app/src-tauri/src/app_commands.rs';
const DEFAULT_SRC_DIR = 'app/src-tauri/src';
const USAGE = `用法：node scripts/check-command-registry.mjs [--registry <p>] [--src-dir <p>] [--self-test]
  --registry <p> 注册清单文件（默认 ${DEFAULT_REGISTRY}）· --src-dir <p> 命令定义扫描根（默认 ${DEFAULT_SRC_DIR}）
  --self-test 用临时夹具构造「漏 / 多 / 重名」故障并断言全部被抓到`;

const toPosix = (p) => p.split(sep).join('/');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const rel = (p) => toPosix(relative(ROOT, p));

/**
 * 去注释、保留换行（⇒ 行号不变）、原样保留字符串与字符字面量。
 * Why：`#[tauri::command]` 会出现在**注释正文**里（app_commands.rs 的纪律说明即是），且属性与
 * `fn` 之间常隔行注释与 `#[allow(...)]`（如 commands_knowledge_core.rs:163）。不先去注释就会把
 * `fn anchored` 这类非命令函数数成定义 ⇒ 假「漏注册」。
 */
function stripComments(src) {
  const chunks = [];
  const n = src.length;
  let i = 0;
  let copyFrom = 0;
  const cut = (at) => { if (at > copyFrom) chunks.push(src.slice(copyFrom, at)); };
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      cut(i);
      while (i < n && src[i] !== '\n') i++;
      copyFrom = i;
      continue;
    }
    if (c === '/' && c2 === '*') {
      cut(i);
      const newlines = [];
      i += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        if (src[i] === '/' && src[i + 1] === '*') { depth++; i += 2; }
        else if (src[i] === '*' && src[i + 1] === '/') { depth--; i += 2; }
        else { if (src[i] === '\n') newlines.push('\n'); i++; }
      }
      chunks.push(newlines.join(''));
      copyFrom = i;
      continue;
    }
    if (c === "'") { // 字符字面量（含转义）跳过；否则是生命周期（'a / 'static）＝只占一个字符
      if (c2 === '\\') { const e = src.indexOf("'", i + 2); i = e < 0 ? n : e + 1; continue; }
      i += src[i + 2] === "'" ? 3 : 1;
      continue;
    }
    if (c === '"' || (c === 'b' && c2 === '"')) {
      let j = c === '"' ? i + 1 : i + 2;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '"' || src[j] === '\n') { j++; break; }
        j++;
      }
      i = j;
      continue;
    }
    const raw = /^(?:br|rb|r)(#*)"/.exec(src.slice(i, i + 6));
    if (raw) {
      const close = `"${raw[1]}`;
      const end = src.indexOf(close, i + raw[0].length);
      i = end < 0 ? n : end + close.length;
      continue;
    }
    i++;
  }
  cut(n);
  return chunks.join('');
}

const ATTR = /#\[tauri\s*::\s*command\b[^\]]*\]/g;
/** `#[tauri::command]`（含 `#[tauri::command(...)]`）之后、隔着其他属性与空白的下一个 `fn` 名 */
const ATTR_AND_MODS =
  /^(?:\s|#\[(?:[^[\]]|\[[^[\]]*\])*\])*(?:(?:pub(?:\s*\([^)]*\))?|async|const|unsafe|extern(?:\s+"[^"]*")?|default)\s+)*fn\s+([A-Za-z_][A-Za-z0-9_]*)/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(dir, e.name), out);
    else if (e.isFile() && e.name.endsWith('.rs')) out.push(join(dir, e.name));
  }
  return out;
}

/** 扫描 srcDir 下全部 `#[tauri::command]` 定义：`{ name, where }` */
function scanDefinitions(srcDir) {
  const out = [];
  for (const file of walk(srcDir)) {
    const text = stripComments(readFileSync(file, 'utf8'));
    ATTR.lastIndex = 0;
    let m;
    while ((m = ATTR.exec(text))) {
      const gap = text.slice(m.index + m[0].length, m.index + m[0].length + 400);
      const fn = ATTR_AND_MODS.exec(gap);
      if (fn) out.push({ name: fn[1], where: `${rel(file)}:${lineOf(text, m.index)}` });
    }
  }
  return out;
}

/** 解析注册清单文件：返回全部**非空** `generate_handler![…]` 块及其条目（按出现顺序） */
function readRegistry(file) {
  const text = stripComments(readFileSync(file, 'utf8'));
  const blocks = [];
  const re = /generate_handler\s*!\s*\[/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '[') depth++;
      else if (text[i] === ']' && --depth === 0) { end = i; break; }
    }
    if (end < 0) throw new Error(`${rel(file)}：generate_handler! 的方括号未配平`);
    const line = lineOf(text, m.index);
    const entries = [], unparsed = [];
    const flag = (idx, t) => unparsed.push({ at: `${rel(file)}:${line + idx + 1}`, text: t });
    text.slice(start + 1, end).split('\n').forEach((raw, idx) => {
      const t = raw.trim();
      if (!t || /^#\[cfg\(.*\)\]$/.test(t)) return; // 空行 / 下一个条目的 cfg 门控
      if (!t.endsWith(',')) return flag(idx, t);
      const path = t.slice(0, -1).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*(::[A-Za-z_][A-Za-z0-9_]*)*$/.test(path)) return flag(idx, t);
      entries.push({ path, name: path.split('::').pop() });
    });
    if (entries.length) blocks.push({ entries, unparsed });
    re.lastIndex = end;
  }
  return blocks;
}

/** 三向检查核心（`--self-test` 复用同一实现，避免"自测走另一条代码路径"） */
function check({ registry, srcDir }) {
  const defs = scanDefinitions(srcDir);
  const blocks = readRegistry(registry);
  const problems = [];
  if (!blocks.length) problems.push({ kind: 'noblock', detail: `找不到非空的 generate_handler! 注册清单：${registry}` });
  if (blocks.length > 1) problems.push({ kind: 'multiblock', detail: `注册清单文件里有 ${blocks.length} 个非空 generate_handler! 块（约定：唯一一份）` });
  for (const b of blocks) for (const u of b.unparsed) problems.push({ kind: 'unparsed', detail: `${u.at} 无法解析为注册条目：${u.text}` });
  const regs = blocks.flatMap((b) => b.entries);
  const group = (list) => list.reduce((map, r) => map.set(r.name, (map.get(r.name) ?? 0) + 1), new Map());
  const defCount = group(defs), regCount = group(regs);
  const dupNames = [...new Set([...defCount.keys(), ...regCount.keys()]
    .filter((k) => (defCount.get(k) ?? 0) > 1 || (regCount.get(k) ?? 0) > 1))];
  for (const name of [...defCount.keys()].filter((k) => !regCount.has(k))) {
    problems.push({ kind: 'missing', detail: `${name}  ← ${defs.filter((d) => d.name === name).map((d) => d.where).join(' / ')}` });
  }
  for (const name of [...regCount.keys()].filter((k) => !defCount.has(k))) problems.push({ kind: 'extra', detail: name });
  for (const name of dupNames) {
    problems.push({ kind: 'duplicate', detail: `${name} —— 定义 ×${defCount.get(name) ?? 0} / 注册 ×${regCount.get(name) ?? 0}` });
  }
  return { ok: problems.length === 0, problems, defs, regs, dupNames };
}

const TITLES = {
  missing: '漏注册（有 #[tauri::command] 定义、注册清单里没有条目）',
  extra: '多注册（有条目、全仓找不到同名定义）',
  duplicate: '重名（同一 IPC 名出现两次以上）',
  unparsed: '注册清单里有无法解析的行',
  noblock: '注册清单缺失',
  multiblock: '注册清单重复',
};

function report(r) {
  if (r.ok) {
    console.log(`✅ 命令注册一致：定义 ${r.defs.length} / 注册 ${r.regs.length} / 重复 0`);
    return 0;
  }
  console.log(`❌ 命令注册不一致：定义 ${r.defs.length} / 注册 ${r.regs.length} / 重复 ${r.dupNames.length}`);
  for (const kind of Object.keys(TITLES)) {
    const list = r.problems.filter((p) => p.kind === kind);
    if (!list.length) continue;
    console.log(`  · ${TITLES[kind]}：${list.length} 条`);
    for (const p of list.slice(0, 20)) console.log(`      - ${p.detail}`);
    if (list.length > 20) console.log(`      … 另有 ${list.length - 20} 条`);
  }
  return 1;
}

/** `--self-test`：临时夹具构造「干净 / 漏 / 多 / 重名 / 缺清单」五例，断言判定正确（漏抓 = exit 1） */
function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), 'cmd-registry-selftest-'));
  const failures = [];
  const write = (relPath, text) => {
    const p = join(root, relPath);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text, 'utf8');
    return p;
  };
  const expect = (label, cond) => {
    console.log(`  ${cond ? '✓' : '✗'} ${label}`);
    if (!cond) failures.push(label);
  };
  try {
    // 夹具覆盖真实形态：`pub(crate) async fn`、属性与 fn 之间夹 #[allow]、纯 `fn`、参数化属性，以及
    // **注释里提到 `#[tauri::command] fn ghost`**（定义扫描必须不数它——本门禁最脆弱的一处）。
    const srcDir = join(root, 'src');
    write('src/commands_fixture.rs', [
      '//! 夹具：注释里提到 #[tauri::command] fn ghost 但不是定义。',
      '#[tauri::command]',
      'pub fn alpha() {}',
      '',
      '#[tauri::command]',
      '#[allow(clippy::too_many_arguments)]',
      'pub(crate) async fn beta(app: AppHandle) {}',
      '',
      '#[tauri::command]',
      'fn gamma() {}',
      '',
      '#[tauri::command(rename_all = "snake_case")]',
      'pub async fn delta() {}',
      'fn ghost() {}',
      '',
    ].join('\n'));
    const reg = (entries) => write(`reg/${entries.join('_') || 'empty'}.rs`, [
      'pub fn handle() -> impl Fn(Invoke<Wry>) -> bool {',
      '    anchored(tauri::generate_handler![',
      ...entries.map((e) => `        crate::commands_fixture::${e},`),
      '    ])',
      '}',
      '',
    ].join('\n'));
    const all = ['alpha', 'beta', 'gamma', 'delta'];
    const names = (r, side) => (side === 'def' ? r.defs : r.regs).map((x) => x.name).sort().join(',');
    const has = (r, kind, test = () => true) => r.problems.some((p) => p.kind === kind && test(p));

    console.log('--self-test：夹具 1/5 干净（含注释假定义 / async / pub(crate) / 参数化属性）');
    const clean = check({ registry: reg(all), srcDir });
    expect(`定义 = 注册 = ${names(clean, 'def')}`, names(clean, 'def') === 'alpha,beta,delta,gamma' && names(clean, 'reg') === names(clean, 'def'));
    expect('判为一致（0 问题）', clean.ok && clean.problems.length === 0);

    console.log('--self-test：夹具 2/5 漏注册（beta 有定义、无条目）');
    const miss = check({ registry: reg(['alpha', 'gamma', 'delta']), srcDir });
    expect('抓到「漏注册」且点名 beta', has(miss, 'missing', (p) => p.detail.startsWith('beta ')));

    console.log('--self-test：夹具 3/5 多注册（omega 有条目、无定义）');
    expect('抓到「多注册」且点名 omega', has(check({ registry: reg([...all, 'omega']), srcDir }), 'extra', (p) => p.detail === 'omega'));

    console.log('--self-test：夹具 4/5 重名（alpha 注册两次）');
    const dup = check({ registry: reg(['alpha', 'alpha', 'beta', 'gamma', 'delta']), srcDir });
    expect('抓到「重名」且点名 alpha', has(dup, 'duplicate') && dup.dupNames.join(',') === 'alpha');

    console.log('--self-test：夹具 5/5 无 generate_handler! 的文件');
    expect('报「注册清单缺失」', has(check({ registry: join(srcDir, 'commands_fixture.rs'), srcDir }), 'noblock'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  if (failures.length) {
    console.log(`❌ --self-test 失败：${failures.length} 项断言未通过 —— ${failures.join('；')}`);
    return 1;
  }
  console.log('✅ --self-test 通过：5 个夹具（干净 / 漏 / 多 / 重名 / 缺清单）全部判定正确');
  return 0;
}

function main(argv) {
  let registry = DEFAULT_REGISTRY;
  let srcDir = DEFAULT_SRC_DIR;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { const v = argv[++i]; if (!v) throw new Error(`${arg} 需要一个路径参数`); return v; };
    if (arg === '--self-test') return runSelfTest();
    if (arg === '--registry') registry = next();
    else if (arg === '--src-dir') srcDir = next();
    else if (arg === '--help' || arg === '-h') { console.log(USAGE); return 0; }
    else { console.error(`未知参数：${arg}\n${USAGE}`); return 2; }
  }
  return report(check({ registry: resolve(ROOT, registry), srcDir: resolve(ROOT, srcDir) }));
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(`❌ 命令注册门禁无法执行：${err.message}`);
  process.exitCode = 2;
}
