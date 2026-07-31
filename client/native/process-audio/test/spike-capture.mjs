// Phase 1 spike 验证脚本 B：进程环回采集两条硬验收
//
// 用法：node test/spike-capture.mjs [窗口标题关键字] [采集秒数]
//   例：node test/spike-capture.mjs bilibili 6
//
// 验收点 1（消除静默失败）：把系统主音量调到 0/静音后重跑，rms 仍应 > 0
// 验收点 2（杂音隔离，主要收益）：采集浏览器时让微信/QQ 发出提示音，
//   波形与 rms 不应受其影响；对比 endpoint 环回会把提示音一并采入
//
// 判据用 rms 客观数值，不依赖人耳；同时落盘 WAV 供人工复核。

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const addon = require('../build/Release/process_audio.node');
const here = path.dirname(fileURLToPath(import.meta.url));

const keyword = (process.argv[2] ?? 'edge').toLowerCase();
const seconds = Number(process.argv[3] ?? 5);

const windows = addon.listAudioWindows();
const target = windows.find(
  (w) =>
    w.title.toLowerCase().includes(keyword) ||
    w.processName.toLowerCase().includes(keyword),
);

if (!target) {
  console.error(`未找到匹配 "${keyword}" 的窗口。当前窗口：`);
  for (const w of windows) console.error(`  ${w.processName}  ${w.title.slice(0, 50)}`);
  process.exit(1);
}

console.log('采集目标：');
console.log(`  标题     ${target.title}`);
console.log(`  窗口进程 pid=${target.pid} (${target.processName})`);
console.log(`  进程树根 rootPid=${target.rootPid} (${target.rootProcessName})`);
console.log(`\n开始采集 ${seconds}s —— 请确保目标窗口正在播放声音...\n`);

const outPath = path.join(here, `spike-${target.rootPid}-${Date.now()}.wav`);
const result = addon.captureToWav({
  pid: target.rootPid,
  durationMs: seconds * 1000,
  sampleRate: 16000,
  channels: 1,
  outPath,
});

if (!result.ok) {
  console.error(`采集失败：${result.error}`);
  process.exit(1);
}

const requested = result.sampleRate === 16000 && result.channels === 1;
console.log('采集结果：');
console.log(`  生效格式   ${result.sampleRate}Hz / ${result.channels}ch ` +
  `${requested ? '（16k mono 请求被接受，无需重采样 ✔）' : '（已回退，需在原生侧重采样）'}`);
console.log(`  样本数     ${result.sampleCount}`);
console.log(`  数据包     ${result.packetCount}（其中静音包 ${result.silentPacketCount}）`);
console.log(`  RMS        ${result.rms.toFixed(6)}`);
console.log(`  峰值       ${result.peak.toFixed(6)}`);
console.log(`  WAV        ${result.wavWritten ? outPath : '(未写入)'}`);

// 与 asrFilters 的静音门控阈值对齐，直接判断这段音频能否进入 ASR
const SILENCE_RMS_THRESHOLD = 0.008;
console.log('\n判定：');
if (result.packetCount === 0) {
  console.log('  ✖ 未收到任何数据包 —— 目标进程树可能未播放音频，或进程树未覆盖发声进程');
} else if (result.rms >= SILENCE_RMS_THRESHOLD) {
  console.log(`  ✔ 采到有效音频（RMS ${result.rms.toFixed(6)} ≥ 门控阈值 ${SILENCE_RMS_THRESHOLD}）`);
} else {
  console.log(`  ⚠ 采到数据但能量低于门控阈值（RMS ${result.rms.toFixed(6)} < ${SILENCE_RMS_THRESHOLD}）—— 会被 asrFilters 判为静音`);
}
