// Phase 1 spike 验证脚本 E：Chromium 多进程架构下的进程树覆盖
//
// 用法：node test/spike-chromium.mjs
//
// 这是网课场景的成败验证点：Chrome/Edge/Electron 的音频均由 browser
// process 派生的 audio service utility 子进程播放。本脚本用 Electron
// 当等价声源，验证 PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
// 能否采到子进程播放的声音。
//
// 对照实验设计：
//   A) 采集 Electron browser process 的进程树 → 应采到声音（进程树覆盖生效）
//   B) 采集本 Node 进程自身 → 应为 0（证明不是把系统混音误当结果）

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const addon = require('../build/Release/process_audio.node');
const here = path.dirname(fileURLToPath(import.meta.url));

const SILENCE_RMS_THRESHOLD = 0.008;
// 复用 client 项目已安装的 Electron（本 spike 目录不单独装，避免二进制重复下载）
const clientRequire = createRequire(path.join(here, '..', '..', '..', 'package.json'));
const electronBin = clientRequire('electron'); // 返回可执行文件绝对路径
const sourceDir = path.join(here, 'chromium-source');

console.log('=== Chromium 进程树覆盖验证（网课场景成败点）===\n');

const child = spawn(electronBin, [sourceDir], { stdio: 'inherit', windowsHide: false });
const stop = () => { if (!child.killed) child.kill(); };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(1); });

// 等待 Electron 启动、加载页面并开始播放
await new Promise((r) => setTimeout(r, 5000));

// 先确认声源有效（自证伪优先）——否则“采到 0”无法区分失败原因
const stateFile = path.join(here, '.source-state.json');
let sourceState = null;
if (existsSync(stateFile)) {
  try {
    sourceState = JSON.parse(readFileSync(stateFile, 'utf-8'));
  } catch { /* 忽略解析失败 */ }
}
console.log(`声源自报状态: ${sourceState ? JSON.stringify(sourceState) : '(无状态文件)'}`);
const sourcePlaying =
  sourceState?.found === true && sourceState.paused === false && sourceState.currentTime > 0;
if (!sourcePlaying) {
  console.log('⚠ 声源未在播放，本次采集结果不具备判定意义（先修声源再评采集）\n');
} else {
  console.log('✔ 声源确认正在播放\n');
}

console.log(`Electron browser process PID=${child.pid}`);
const resolvedRoot = addon.resolveRootPid(child.pid);
console.log(`回溯得到的进程树根 = ${resolvedRoot}（应与上一行相同）\n`);

function capture(pid, label) {
  const r = addon.captureToWav({ pid, durationMs: 4000, sampleRate: 16000, channels: 1 });
  if (!r.ok) {
    console.log(`  ${label}：采集失败 —— ${r.error}`);
    return null;
  }
  console.log(
    `  ${label} (pid=${pid})：RMS=${r.rms.toFixed(6)} 峰值=${r.peak.toFixed(6)} 包数=${r.packetCount}`,
  );
  return r;
}

console.log('各采集 4s：\n');
const chromium = capture(child.pid, 'Electron 进程树');
const selfNode = capture(process.pid, '本 Node 进程');

stop();
rmSync(stateFile, { force: true });

console.log('\n判定：');
if (!chromium || !selfNode) {
  console.log('  ✖ 采集异常，无法判定');
  process.exit(1);
}
if (!sourcePlaying) {
  console.log('  ⚠ 声源无效，不作结论——请先修正声源（见上方自报状态）');
  process.exit(2);
}
const covered = chromium.rms >= SILENCE_RMS_THRESHOLD;
const notLeaking = selfNode.rms < SILENCE_RMS_THRESHOLD;
console.log(`  ${covered ? '✔' : '✖'} 进程树覆盖到 audio service 子进程（RMS ${chromium.rms.toFixed(6)}）`);
console.log(`  ${notLeaking ? '✔' : '✖'} 无声进程未串入系统混音（RMS ${selfNode.rms.toFixed(6)}）`);
console.log(
  covered && notLeaking
    ? '\n  ✅ 网课场景成立：浏览器/Electron 类多进程应用可被正确采集'
    : '\n  ❌ 未通过 —— 需改用 addon 自行枚举发声进程或调整进程树模式',
);
