#!/usr/bin/env node
/**
 * 全项目验证脚本 — 一键执行各子项目 lint/typecheck/test/build。
 *
 * @ai-context: session-route.mjs 的 rule-build-validation 路由目标
 * （2026-08 工程卫生审计 #14：该文件此前缺失造成悬空引用）。
 * 与 client/package.json 的 check（lint+typecheck×2+test）聚合门禁对齐，
 * 覆盖四个子项目；任一步失败立即退出非零（set -e 语义）。
 *
 * 用法：node scripts/validate-all.mjs [--skip-build]
 * 退出码：0 = 全部通过；非 0 = 首个失败步骤的退出码
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_BUILD = process.argv.includes('--skip-build');

const steps = [
  { name: 'client lint', cwd: 'client', cmd: 'npm', args: ['run', 'lint'] },
  { name: 'client typecheck', cwd: 'client', cmd: 'npm', args: ['run', 'typecheck'] },
  { name: 'client typecheck:electron', cwd: 'client', cmd: 'npm', args: ['run', 'typecheck:electron'] },
  { name: 'client test', cwd: 'client', cmd: 'npm', args: ['run', 'test'] },
  ...(SKIP_BUILD
    ? []
    : [{ name: 'client build', cwd: 'client', cmd: 'npm', args: ['run', 'build'] }]),
  { name: 'website lint', cwd: 'website', cmd: 'npm', args: ['run', 'lint'] },
  { name: 'website typecheck', cwd: 'website', cmd: 'npx', args: ['tsc', '--noEmit'] },
  { name: 'ai-gateway pytest', cwd: 'server/ai-gateway', cmd: 'python', args: ['-m', 'pytest', 'tests/', '-q'] },
  { name: 'sync-service go test', cwd: 'server/sync-service', cmd: 'go', args: ['test', './...', '-count=1'] },
  { name: 'docs check', cwd: '.', cmd: 'node', args: ['scripts/docs-check.mjs'] },
];

let failed = false;
for (const step of steps) {
  process.stdout.write(`▶ ${step.name} ... `);
  const r = spawnSync(step.cmd, step.args, {
    cwd: join(ROOT, step.cwd),
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
  if (r.status === 0) {
    console.log('✅');
  } else {
    console.log(`❌ (exit ${r.status ?? r.signal ?? 'unknown'})`);
    const out = (r.stdout?.toString() ?? '') + (r.stderr?.toString() ?? '');
    // 只回显尾部（完整输出通常很长）
    const lines = out.split(/\r?\n/).filter(Boolean);
    console.log(lines.slice(-15).join('\n'));
    failed = true;
    break;
  }
}

if (failed) {
  console.error('\n❌ validate-all: 存在失败步骤，已中止（先修复当前失败项再重跑）');
  process.exit(1);
}
console.log('\n✅ validate-all: 全部步骤通过');
