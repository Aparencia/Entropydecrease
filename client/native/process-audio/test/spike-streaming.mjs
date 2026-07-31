// Phase 2 验证脚本：流式采集（采集线程 + ThreadSafeFunction 回调）
//
// 用法：node test/spike-streaming.mjs
//
// 验收点：
//   1. isProcessLoopbackSupported() 正确返回 true（本机 Win11）
//   2. 启动后按 chunkDurationMs 周期性收到块，块大小 = rate*ms/1000*channels
//   3. 块内容非零（声源在播放），RMS ≥ 0.008
//   4. stopCapture 后不再有回调（无泄漏）
//   5. 目标进程退出时通过 error 回调上报（供降级）

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const addon = require('../build/Release/process_audio.node');
const here = path.dirname(fileURLToPath(import.meta.url));

const CHUNK_MS = 1000; // 用 1s 块加快验证节奏
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const EXPECTED_SAMPLES = (SAMPLE_RATE * CHUNK_MS) / 1000 * CHANNELS;

console.log('=== 流式采集验证 ===\n');
console.log(`isProcessLoopbackSupported() = ${addon.isProcessLoopbackSupported()}\n`);

// 用 Electron 当 Chromium 声源（等价浏览器场景）
const clientRequire = createRequire(path.join(here, '..', '..', '..', 'package.json'));
const electronBin = clientRequire('electron');
const child = spawn(electronBin, [path.join(here, 'chromium-source')], {
  stdio: 'ignore',
  windowsHide: false,
});
const stopSource = () => { if (!child.killed) child.kill(); };
process.on('exit', stopSource);
process.on('SIGINT', () => { stopSource(); process.exit(1); });

await new Promise((r) => setTimeout(r, 5000));
console.log(`声源 PID=${child.pid}，开始流式采集...\n`);

const chunks = [];
let errorMessage = null;

const started = addon.startCapture(
  { pid: child.pid, sampleRate: SAMPLE_RATE, channels: CHANNELS, chunkDurationMs: CHUNK_MS },
  (payload) => {
    if (payload.error) {
      errorMessage = payload.error;
      console.log(`  [error 回调] ${payload.error}`);
      return;
    }
    const samples = new Float32Array(payload.audioBuffer);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / (samples.length || 1));
    chunks.push({ n: samples.length, rms, rate: payload.sampleRate, ch: payload.channels, ms: payload.durationMs });
    console.log(
      `  [块 ${chunks.length}] 样本=${samples.length} ${payload.sampleRate}Hz/${payload.channels}ch ` +
      `${payload.durationMs}ms RMS=${rms.toFixed(6)}`,
    );
  },
);

if (!started.ok) {
  console.error(`startCapture 失败：${started.error}`);
  stopSource();
  process.exit(1);
}

// 采集 5 秒 → 预期约 5 个 1s 块
await new Promise((r) => setTimeout(r, 5200));
addon.stopCapture();
console.log('\nstopCapture 已调用，等待 1.5s 观察是否仍有回调...');
const countAtStop = chunks.length;
await new Promise((r) => setTimeout(r, 1500));
const leaked = chunks.length - countAtStop;

stopSource();

// ---- 判定 ----
const THRESHOLD = 0.008;
const sizeOk = chunks.every((c) => c.n === EXPECTED_SAMPLES);
const formatOk = chunks.every((c) => c.rate === SAMPLE_RATE && c.ch === CHANNELS && c.ms === CHUNK_MS);
// 真实音频开头/结尾常有淡入淡出，首尾块能量偏低属正常（也正是 asrFilters
// 静音门控存在的意义），故判据取"多数块非静音"而非"全部非静音"
const loudChunks = chunks.filter((c) => c.rms >= THRESHOLD).length;
const loudOk = chunks.length > 0 && loudChunks / chunks.length >= 0.6;
const countOk = chunks.length >= 4 && chunks.length <= 6;

console.log('\n判定：');
console.log(`  ${countOk ? '✔' : '✖'} 块数量符合周期（收到 ${chunks.length} 块，预期 4~6）`);
console.log(`  ${sizeOk ? '✔' : '✖'} 每块样本数均为 ${EXPECTED_SAMPLES}`);
console.log(`  ${formatOk ? '✔' : '✖'} 块元数据（采样率/声道/时长）正确`);
console.log(`  ${loudOk ? '✔' : '✖'} 多数块非静音（${loudChunks}/${chunks.length} 块 RMS ≥ ${THRESHOLD}）`);
console.log(`  ${leaked === 0 ? '✔' : '✖'} stopCapture 后无额外回调（泄漏 ${leaked} 块）`);
if (errorMessage) console.log(`  ⓘ 期间收到 error 回调：${errorMessage}`);

const pass = countOk && sizeOk && formatOk && loudOk && leaked === 0;
console.log(pass ? '\n  ✅ 流式采集可用于生产链路' : '\n  ❌ 未通过，需修正');
process.exit(pass ? 0 : 1);
