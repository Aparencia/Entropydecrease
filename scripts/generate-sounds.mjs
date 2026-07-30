#!/usr/bin/env node
/**
 * @ai-context
 * generate-sounds.mjs — 熵减音效/音轨程序化合成入口（零 npm 依赖，纯 Node）。
 * Entry point of the Entropydecrease procedural sound synthesis pipeline.
 * Why: 主流程只做编排（备份→音效→格式决策→音轨→校验），DSP/定义/编码分别在 sound-gen/ 子模块。
 *
 * 产物：
 *   A. 重制 client/public/sounds/ 下既有音效（先备份到 _backup_original/）
 *   B. UI/反馈音效（共 42 个短音效）
 *   C. 6 个无缝循环音轨到 client/public/audio/（优先 MP3：ffmpeg → lamejs → WAV 降级）
 *
 * 运行：node scripts/generate-sounds.mjs
 * 幂等：备份目录已存在时不重复覆盖备份。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SR_FX, SR_TRACK, PEAK_TARGET, encodeWav, normalize, rmsDb } from './sound-gen/engine.mjs';
import { FX_SOUNDS, renderFx } from './sound-gen/fx-defs.mjs';
import { TRACKS } from './sound-gen/tracks.mjs';
import { detectFfmpeg, ensureLame, encodeMp3Lame, encodeMp3Ffmpeg } from './sound-gen/mp3.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOUNDS_DIR = path.join(ROOT, 'client', 'public', 'sounds');
const AUDIO_DIR = path.join(ROOT, 'client', 'public', 'audio');
const BACKUP_DIR = path.join(SOUNDS_DIR, '_backup_original');

function main() {
  const report = { fx: [], tracks: [], backup: '', trackFormat: '', issues: [] };

  /* 1. 备份（幂等） */
  if (fs.existsSync(BACKUP_DIR)) {
    report.backup = '备份目录已存在，跳过（幂等保护，保留最初原始文件）';
  } else {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    let count = 0;
    for (const f of fs.readdirSync(SOUNDS_DIR)) {
      if (f.endsWith('.wav')) { fs.copyFileSync(path.join(SOUNDS_DIR, f), path.join(BACKUP_DIR, f)); count++; }
    }
    report.backup = `已备份 ${count} 个原始 WAV 到 _backup_original/`;
  }
  console.log(`[备份] ${report.backup}`);

  /* 2. 短音效（42 个 WAV，44.1kHz 单声道） */
  console.log(`[音效] 生成 ${FX_SOUNDS.length} 个短音效 ...`);
  for (const def of FX_SOUNDS) {
    const buf = renderFx(def);
    const wav = encodeWav([buf], SR_FX);
    const out = path.join(SOUNDS_DIR, `${def.file}.wav`);
    fs.writeFileSync(out, wav);
    report.fx.push({ file: `${def.file}.wav`, bytes: wav.length, dur: +(buf.length / SR_FX).toFixed(3), rms: +rmsDb(buf).toFixed(1) });
  }

  /* 3. 音轨格式决策 */
  console.log('[音轨] 检测 MP3 编码能力 ...');
  const haveFfmpeg = detectFfmpeg();
  let lame = null;
  if (!haveFfmpeg) lame = ensureLame();
  const mp3Ok = haveFfmpeg || !!lame;
  report.trackFormat = haveFfmpeg ? 'mp3 (ffmpeg 128kbps)' : lame ? 'mp3 (lamejs 128kbps)' : 'wav (22.05kHz 单声道降级)';
  console.log(`  [mp3] ffmpeg=${haveFfmpeg} lamejs=${!!lame} → 最终格式: ${report.trackFormat}`);

  // mp3 可用：72s 立体声；不可用：降级 WAV 需 ≤2.5MB → 22.05kHz 单声道 ~54s
  const stereo = mp3Ok;
  const targetDur = mp3Ok ? 72 : 54;

  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  /* 4. 音轨生成 */
  for (const tr of TRACKS) {
    console.log(`[音轨] 合成 ${tr.file} ...`);
    const chans = tr.gen(targetDur, SR_TRACK, stereo);
    for (const ch of chans) normalize(ch, PEAK_TARGET);
    // 循环无缝性已由 loopTrim/wrapTail 保证，此处不做整轨边缘淡入淡出（会破坏循环）
    const durSec = chans[0].length / SR_TRACK;
    let outPath, bytes;
    if (mp3Ok) {
      outPath = path.join(AUDIO_DIR, `${tr.file}.mp3`);
      if (haveFfmpeg) {
        encodeMp3Ffmpeg(chans, SR_TRACK, outPath);
      } else {
        fs.writeFileSync(outPath, encodeMp3Lame(lame, chans, SR_TRACK, 128));
      }
      bytes = fs.statSync(outPath).size;
    } else {
      outPath = path.join(AUDIO_DIR, `${tr.file}.wav`);
      const wav = encodeWav(chans, SR_TRACK);
      fs.writeFileSync(outPath, wav);
      bytes = wav.length;
    }
    report.tracks.push({ file: path.basename(outPath), bytes, dur: +durSec.toFixed(2), ch: chans.length });
  }

  /* 5. 校验：WAV 头 + 汇总输出 */
  console.log('\n[校验] 抽查 WAV 头 ...');
  let headerOk = 0, headerBad = 0;
  for (const it of report.fx) {
    const fd = fs.openSync(path.join(SOUNDS_DIR, it.file), 'r');
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WAVE') headerOk++;
    else { headerBad++; report.issues.push(`${it.file} WAV 头无效`); }
  }
  console.log(`  WAV 头有效: ${headerOk}/${report.fx.length}${headerBad ? `，无效: ${headerBad}` : ''}`);

  console.log('\n════════ 生成报告 ════════');
  console.log(`备份: ${report.backup}`);
  console.log(`音轨最终格式: ${report.trackFormat}`);
  console.log('\n-- 短音效 (client/public/sounds/) --');
  for (const it of report.fx) console.log(`  ${it.file.padEnd(28)} ${String(it.bytes).padStart(8)} B  ${String(it.dur).padStart(6)}s  RMS ${it.rms} dBFS`);
  console.log('\n-- 循环音轨 (client/public/audio/) --');
  for (const it of report.tracks) console.log(`  ${it.file.padEnd(28)} ${String(it.bytes).padStart(9)} B  ${String(it.dur).padStart(6)}s  ${it.ch}ch`);
  console.log(`\n合计: ${report.fx.length} 音效 + ${report.tracks.length} 音轨 = ${report.fx.length + report.tracks.length} 个文件`);
  if (report.issues.length) { console.log('问题:'); for (const i of report.issues) console.log(`  - ${i}`); }
  else console.log('问题: 无');
}

main();
