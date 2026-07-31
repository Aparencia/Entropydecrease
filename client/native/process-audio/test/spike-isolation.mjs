// Phase 1 spike 验证脚本 C：杂音隔离对照实验（主要收益的严格证明）
//
// 用法：node test/spike-isolation.mjs <发声进程PID> <静默进程PID> [秒数]
//
// 设计：同一时刻系统内只有"发声进程"在播放音频。
//   - 采集发声进程 → RMS 应显著 > 0
//   - 采集静默进程 → RMS 应 ≈ 0（若为端点环回，此处会采到发声进程的声音）
// 后者为 0 即证明进程环回实现了声音隔离。

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const addon = require('../build/Release/process_audio.node');

const loudPid = Number(process.argv[2]);
const quietPid = Number(process.argv[3]);
const seconds = Number(process.argv[4] ?? 4);

if (!loudPid || !quietPid) {
  console.error('用法: node test/spike-isolation.mjs <发声进程PID> <静默进程PID> [秒数]');
  process.exit(1);
}

function capture(pid, label) {
  const r = addon.captureToWav({ pid, durationMs: seconds * 1000, sampleRate: 16000, channels: 1 });
  if (!r.ok) {
    console.log(`  ${label} (pid=${pid})：采集失败 —— ${r.error}`);
    return null;
  }
  console.log(
    `  ${label} (pid=${pid})：RMS=${r.rms.toFixed(6)} 峰值=${r.peak.toFixed(6)} ` +
    `包数=${r.packetCount} 样本=${r.sampleCount}`,
  );
  return r;
}

console.log(`各采集 ${seconds}s（串行，同一声源持续播放中）：\n`);
const loud = capture(loudPid, '发声进程');
const quiet = capture(quietPid, '静默进程');

const THRESHOLD = 0.008; // 与 asrFilters 静音门控一致
console.log('\n判定：');
if (!loud || !quiet) {
  console.log('  ✖ 采集异常，无法判定');
  process.exit(1);
}
const loudOk = loud.rms >= THRESHOLD;
const isolated = quiet.rms < THRESHOLD;
console.log(`  ${loudOk ? '✔' : '✖'} 发声进程采到有效音频（RMS ${loud.rms.toFixed(6)} ${loudOk ? '≥' : '<'} ${THRESHOLD}）`);
console.log(`  ${isolated ? '✔' : '✖'} 静默进程未采到其他应用的声音（RMS ${quiet.rms.toFixed(6)} ${isolated ? '<' : '≥'} ${THRESHOLD}）`);
if (loudOk && isolated) {
  const ratio = quiet.rms > 0 ? (loud.rms / quiet.rms).toFixed(0) : '∞';
  console.log(`\n  ✅ 杂音隔离成立：两者能量比 ${ratio}× —— 端点环回在此场景下两次都会采到同样的声音`);
} else {
  console.log('\n  ❌ 隔离未成立或声源无效，需复查');
}
