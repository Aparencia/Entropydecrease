// Phase 1 spike 验证脚本 A：窗口 → PID → 应用根进程回溯
//
// 用法：node test/spike-windows.mjs
// 验收点：浏览器窗口的 pid 与 rootPid 应不同（窗口属 renderer，
// rootPid 为 browser process），且 rootProcessName 与 processName 同名。

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const addon = require('../build/Release/process_audio.node');

const windows = addon.listAudioWindows();
console.log(`枚举到 ${windows.length} 个可见顶层窗口\n`);

/** 关注的多进程应用（音频由子进程播放，必须靠 rootPid + 进程树覆盖） */
const MULTI_PROCESS = /^(chrome|msedge|firefox|brave|qqbrowser|360se|electron|entropy)/i;

const interesting = windows.filter((w) => MULTI_PROCESS.test(w.processName));
if (interesting.length === 0) {
  console.log('未发现浏览器类窗口，请打开浏览器后重试');
} else {
  console.log('多进程应用窗口（进程环回的关键场景）：');
  for (const w of interesting) {
    const differs = w.pid !== w.rootPid;
    console.log(
      `  ${differs ? '✔' : '·'} "${w.title.slice(0, 40)}"\n` +
      `      窗口进程 pid=${w.pid} (${w.processName})\n` +
      `      根进程   rootPid=${w.rootPid} (${w.rootProcessName})` +
      `${differs ? '  ← 回溯生效' : '  ← 窗口进程即根进程'}`,
    );
  }
}

console.log('\n全部窗口概览（前 15 条）：');
for (const w of windows.slice(0, 15)) {
  console.log(`  pid=${String(w.pid).padStart(6)} root=${String(w.rootPid).padStart(6)}  ${w.processName.padEnd(20)} ${w.title.slice(0, 36)}`);
}
