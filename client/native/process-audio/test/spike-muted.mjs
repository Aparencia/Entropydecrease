// Phase 1 spike 验证脚本 D：系统音量为 0 / 静音时是否仍能采集
//
// 用法（在 client/native/process-audio 目录下）：
//   node test/spike-muted.mjs
//
// 脚本会自动：启动循环声源 → 采集 4s → 停止声源，并打印 RMS 判定。
// 请按提示在采集期间把系统音量调到 0（或点静音）。
//
// 验收标准：静音状态下 RMS 仍 ≥ 0.008（asrFilters 门控阈值）即通过——
// 证明进程环回在系统混音之前截取，不受主音量影响。
// 对照：端点环回（getDisplayMedia）在此场景下必然得到 RMS = 0。

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const addon = require('../build/Release/process_audio.node');

const SILENCE_RMS_THRESHOLD = 0.008;
const WAV = 'C:\\Windows\\Media\\Alarm01.wav';
const CAPTURE_SECONDS = 4;

console.log('=== 进程环回：系统静音场景验收 ===\n');
console.log('步骤：脚本将启动一个循环播放的声源进程，随后采集 4 秒。');
console.log('请在看到「开始采集」后，立刻把系统音量拖到 0 或点击静音。\n');

// 启动独立的声源进程（PowerShell + SoundPlayer 循环播放）
const player = spawn(
  'powershell',
  [
    '-NoProfile',
    '-Command',
    `$p = New-Object System.Media.SoundPlayer '${WAV}'; $p.PlayLooping(); Start-Sleep -Seconds 60`,
  ],
  { windowsHide: true, stdio: 'ignore' },
);

const stopPlayer = () => {
  if (!player.killed) player.kill();
};
process.on('exit', stopPlayer);
process.on('SIGINT', () => { stopPlayer(); process.exit(1); });

await new Promise((r) => setTimeout(r, 2500));
console.log(`声源进程 PID=${player.pid}，已开始播放`);
console.log('\n>>> 开始采集，请现在静音系统 <<<\n');

const result = addon.captureToWav({
  pid: player.pid,
  durationMs: CAPTURE_SECONDS * 1000,
  sampleRate: 16000,
  channels: 1,
});

stopPlayer();

if (!result.ok) {
  console.error(`采集失败：${result.error}`);
  process.exit(1);
}

console.log('采集结果：');
console.log(`  生效格式  ${result.sampleRate}Hz / ${result.channels}ch`);
console.log(`  包数      ${result.packetCount}（静音包 ${result.silentPacketCount}）`);
console.log(`  RMS       ${result.rms.toFixed(6)}`);
console.log(`  峰值      ${result.peak.toFixed(6)}`);

console.log('\n判定：');
if (result.rms >= SILENCE_RMS_THRESHOLD) {
  console.log(`  ✅ 通过 —— 静音状态下仍采到有效音频（RMS ${result.rms.toFixed(6)} ≥ ${SILENCE_RMS_THRESHOLD}）`);
  console.log('     若采集期间确实处于静音，则证明进程环回不受系统主音量影响。');
} else {
  console.log(`  ❌ 未通过 —— RMS ${result.rms.toFixed(6)} < ${SILENCE_RMS_THRESHOLD}`);
  console.log('     可能原因：采集期间未真正静音 / 声源未播放 / 进程环回仍受主音量影响。');
}
console.log('\n声源进程已停止。');
