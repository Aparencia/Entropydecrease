/**
 * @ai-context
 * MP3 编码降级链 — ffmpeg → lamejs（自动临时安装）→ 调用方保留 WAV。
 * MP3 encoding fallback chain: ffmpeg → lamejs (auto temp-install) → caller keeps WAV.
 * Why: 零 npm 依赖原则下，lamejs 仅在 ffmpeg 缺失时临时安装到 scripts/.mp3tmp，不污染项目依赖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync, execSync } from 'node:child_process';

import { encodeWav, f32ToI16 } from './engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function detectFfmpeg() {
  try {
    const r = spawnSync('ffmpeg', ['-version'], { stdio: 'pipe', shell: true });
    return r.status === 0;
  } catch { return false; }
}

export function ensureLame() {
  const tmpDir = path.join(ROOT, 'scripts', '.mp3tmp');
  const tryDirs = [path.join(ROOT, 'client'), tmpDir];
  for (const dir of tryDirs) {
    try {
      const req = createRequire(path.join(dir, 'noop.js'));
      return req('lamejs');
    } catch { /* 继续 */ }
  }
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    const pkg = path.join(tmpDir, 'package.json');
    if (!fs.existsSync(pkg)) fs.writeFileSync(pkg, '{"name":"mp3tmp","private":true}');
    console.log('  [mp3] 正在临时安装 lamejs@1.2.0 ...');
    execSync('npm install lamejs@1.2.0 --no-save --no-audit --no-fund --loglevel=error', { cwd: tmpDir, stdio: 'pipe', timeout: 120000 });
    const req = createRequire(path.join(tmpDir, 'noop.js'));
    return req('lamejs');
  } catch (e) {
    console.log(`  [mp3] lamejs 安装失败: ${String(e.message || e).slice(0, 200)}`);
    return null;
  }
}

export function encodeMp3Lame(lame, chans, sr, kbps = 128) {
  const enc = new lame.Mp3Encoder(chans.length, sr, kbps);
  const n = chans[0].length;
  const l16 = f32ToI16(chans[0]);
  const r16 = chans[1] ? f32ToI16(chans[1]) : null;
  const chunks = [];
  const B = 1152;
  for (let i = 0; i < n; i += B) {
    const lb = l16.subarray(i, Math.min(i + B, n));
    const out = r16 ? enc.encodeBuffer(lb, r16.subarray(i, Math.min(i + B, n))) : enc.encodeBuffer(lb);
    if (out.length) chunks.push(Buffer.from(out));
  }
  const end = enc.flush();
  if (end.length) chunks.push(Buffer.from(end));
  return Buffer.concat(chunks);
}

export function encodeMp3Ffmpeg(chans, sr, outPath) {
  const tmpWav = outPath + '.tmp.wav';
  fs.writeFileSync(tmpWav, encodeWav(chans, sr));
  const r = spawnSync('ffmpeg', ['-y', '-i', tmpWav, '-codec:a', 'libmp3lame', '-b:a', '128k', outPath], { stdio: 'pipe', shell: true });
  fs.rmSync(tmpWav, { force: true });
  if (r.status !== 0) throw new Error('ffmpeg 转码失败');
}
