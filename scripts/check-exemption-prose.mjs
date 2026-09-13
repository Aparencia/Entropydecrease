#!/usr/bin/env node
/**
 * @ai-context 豁免表「散文数字」对拍探针（批 7 T11 新造；C10.6 第 6 项那处散文的机器兜底）。
 *   ① `app_commands.rs` 登记行正文的「N 条」（generate_handler! 实条目数）—— `--write` 只刷数字列 ⇒ 零门禁；
 *   ② `App.tsx` 登记行的行数 —— 另有 `--full` 的 (e) 判据兜底，本探针作对照。判据 = 散文值 == 真源实测值。
 * 口径：行数 = countLines()（文件**全部**行数含空行；末尾换行不额外算一行），与 `scripts/line-limits.mjs` 同源。
 * ⚠️ 本脚本**不进八闸集合**（八闸集合是批次间对账基线，扩闸会让对账漂移），批 8 T17 已挂进 CI（`pr-check.yml` 的 line-limits job 内单列 step「Exemption table prose check」，`:211`）、仍不进 husky；⚠️ 若它在 CI 上频繁假红 ⇒ 回退裁决、改回手工跑，并写明回退理由。
 * 退出码：0 = 全一致 · 1 = 有不一致 · 2 = 解析失败（登记行/字段缺失，或读不到门禁输出）。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = 'docs/standards/line-limit-exemptions.md';
const REGISTRY = 'scripts/check-command-registry.mjs';
const CMD_ROW = 'app/src-tauri/src/app_commands.rs';
const APP_TSX = 'app/src/App.tsx';

const USAGE = `用法：node scripts/check-exemption-prose.mjs [--self-test]
  无参数       对拍：豁免表「N 条」↔ 命令注册门禁「定义 N」；App.tsx 登记行数 ↔ countLines 实测
  --self-test  四例内存夹具（一致 / 条数错值 / 行数错值 / 缺行）自证判据有牙 · --help 本帮助
⚠️ 本脚本不进八闸集合（八闸集合是批次间对账基线，扩闸会让对账漂移），批 8 T17 已挂进 CI（pr-check.yml 的 line-limits job 内单列 step「Exemption table prose check」，:211）、仍不进 husky；⚠️ 若它在 CI 上频繁假红 ⇒ 回退裁决、改回手工跑，并写明回退理由。`;

const countLinesText = (s) => s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
const countLines = (abs) => countLinesText(readFileSync(abs, 'utf8'));

/** 纯判定：真跑与 --self-test 共用同一实现（避免"自测走另一条代码路径"） */
function evaluate({ text, registryOut, appLines }) {
  const lines = text.split('\n');
  const row = (p) => {
    const i = lines.findIndex((l) => l.startsWith(`| ${p} |`));
    return i < 0 ? null : { no: i + 1, text: lines[i] };
  };
  const cmd = row(CMD_ROW), app = row(APP_TSX);
  const gate = /定义\s+(\d+)\s/.exec(`${registryOut} `);
  const parse = [];
  if (!cmd) parse.push(`找不到登记行：| ${CMD_ROW} |`);
  if (!app) parse.push(`找不到登记行：| ${APP_TSX} |`);
  if (!gate) parse.push(`读不到门禁「定义 N」：${registryOut.trim().slice(0, 50)}`);
  const pm = cmd && (/\*\*(\d+)\s*条\*\*/.exec(cmd.text) ?? /(\d+)\s*条/.exec(cmd.text));
  const dm = app && /^\|[^|]*\|\s*(\d+)\s*\|/.exec(app.text);
  if (cmd && !pm) parse.push(`:${cmd.no} 读不到「N 条」`);
  if (app && !dm) parse.push(`:${app.no} 读不到登记行数`);
  if (parse.length) return { parse, problems: [] };
  const prose = Number(pm[1]), declared = Number(dm[1]), gateN = Number(gate[1]);
  return { parse, problems: [
    { ok: prose === gateN, where: `:${cmd.no}`, label: `散文「${pm[0]}」${prose === gateN ? '==' : '!='} 门禁「定义 ${gateN}」`, hint: '本行的「N 条」须与 generate_handler! 实条目数同批更新（C10.6 第 6 项）' },
    { ok: declared === appLines, where: `:${app.no}`, label: `App.tsx 登记 ${declared} ${declared === appLines ? '==' : '!='} countLines ${appLines}`, hint: '登记行数须与实测同批更新（该半另有 line-limits --full 的 (e) 判据兜底）' },
  ] };
}

function realRun() {
  let out;
  try {
    out = execFileSync(process.execPath, [join(ROOT, REGISTRY)], { cwd: ROOT, encoding: 'utf8' });
  } catch (err) {
    out = `${err.stdout ?? ''}`; // 门禁自身红灯（exit 1）仍带可用读数
    if (!/定义\s+\d+/.test(out)) { console.error(`❌ 无法执行 ${REGISTRY}：${err.message}`); return 2; }
  }
  const r = evaluate({ text: readFileSync(join(ROOT, TABLE), 'utf8'), registryOut: out, appLines: countLines(join(ROOT, APP_TSX)) });
  if (r.parse.length) {
    console.log('❌ 解析失败（exit 2）：');
    for (const p of r.parse) console.log(`  · ${p}`);
    return 2;
  }
  let bad = 0;
  for (const c of r.problems) {
    console.log(`${c.ok ? '✅' : '❌'} ${c.label}（${TABLE}${c.where}）`);
    if (!c.ok) { bad++; console.log(`     ⇒ ${c.hint}`); }
  }
  console.log(bad ? `❌ 散文与真源不一致：${bad} 处` : '✅ 散文与真源一致（本脚本不进八闸集合；批 8 T17 起为 CI 门禁、单列 step，仍不进 husky）');
  return bad ? 1 : 0;
}

const fixture = (prose, declared) => [`| 文件 | 行数 | 豁免理由 | 拆分计划 |`, '|---|---|---|---|',
  `| ${APP_TSX} | ${declared} | 夹具行 | 若再增长：拆分 |`,
  `| ${CMD_ROW} | 476 | 夹具：**${prose} 条** 注册点 | 不拆（数据文件） |`, ''].join('\n');
const GATE = (n) => `✅ 命令注册一致：定义 ${n} / 注册 ${n} / 重复 0`;

/** `--self-test`：夹具自带数值（不读仓库现状 ⇒ T19 把 310 改成 311 后仍成立） */
function runSelfTest() {
  const fails = [];
  const expect = (label, cond) => { console.log(`  ${cond ? '✓' : '✗'} ${label}`); if (!cond) fails.push(label); };
  const go = (text, gate, appLines) => evaluate({ text, registryOut: GATE(gate), appLines });
  const clean = go(fixture(310, 549), 310, 549);
  expect('夹具 1/4 一致（310==310 · 549==549）⇒ 0 问题 / 0 解析失败', clean.parse.length === 0 && clean.problems.every((p) => p.ok));
  const bad1 = go(fixture(313, 549), 310, 549);
  expect('夹具 2/4 手工错值「313 条」对门禁 310 ⇒ 报不等', bad1.problems.some((p) => !p.ok && p.label.includes('313') && p.label.includes('310')));
  const bad2 = go(fixture(310, 548), 310, 549);
  expect('夹具 3/4 手工错值登记 548 对实测 549 ⇒ 报不等', bad2.problems.some((p) => !p.ok && p.label.includes('548') && p.label.includes('549')));
  const missing = go('没有那张表\n', 310, 549);
  expect('夹具 4/4 缺登记行 ⇒ 判解析失败（exit 2 路径）', missing.parse.filter((p) => p.includes('找不到登记行')).length === 2);
  expect('countLines 口径自证：末尾带 / 不带换行都算 2 行', countLinesText('a\nb\n') === 2 && countLinesText('a\nb') === 2);
  if (fails.length) { console.log(`❌ --self-test 失败：${fails.length} 项断言未通过`); return 1; }
  console.log('✅ --self-test 通过：4 例夹具 + countLines 口径自证全部判定正确');
  return 0;
}

function main(argv) {
  for (const a of argv) {
    if (a === '--help' || a === '-h') { console.log(USAGE); return 0; }
    if (a === '--self-test') return runSelfTest();
    console.error(`未知参数：${a}\n${USAGE}`);
    return 2;
  }
  return realRun();
}

try { process.exitCode = main(process.argv.slice(2)); }
catch (err) { console.error(`❌ 探针无法执行：${err.message}`); process.exitCode = 2; }
