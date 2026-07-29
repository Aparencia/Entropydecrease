#!/usr/bin/env node
/**
 * generate-sounds.mjs — 课伴音效/音轨程序化合成引擎（零 npm 依赖，纯 Node）
 *
 * 产物：
 *   A. 重制 client/public/sounds/ 下 23 个既有音效（先备份到 _backup_original/）
 *   B. 新增 19 个 UI/反馈音效（ui_* 11 个 + feedback/data/sync 8 个）
 *   C. 6 个无缝循环音轨到 client/public/audio/（优先 MP3：ffmpeg → lamejs → WAV 降级）
 *
 * 运行：node scripts/generate-sounds.mjs
 * 幂等：备份目录已存在时不重复覆盖备份。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync, execSync } from 'node:child_process';

/* ════════════════════════════════════════════════════════════════════
 * 音律美设计规范（硬性约束，全部音效遵循）
 * ────────────────────────────────────────────────────────────────────
 * 1. 统一 C 大调五声音阶（C-D-E-G-A），主音区 C5
 * 2. 成功/完成类：上行纯四度/纯五度（C5→G5）或大三和弦琶音
 * 3. 错误/警告类：下行（E5→C5 方向），克制不刺耳，禁用纯方波蜂鸣
 * 4. 中性操作类：单音或大二度装饰音
 * 5. 重要成就类：三音以上琶音（C-E-G-C 上行）+ 混响尾音
 * 6. 噪声仅作纹理层且必须滤波塑形，UI/反馈音效不得以纯噪声为主体
 * 7. 峰值统一 -6dBFS（0.5 振幅）；个别标注"低音量"的音效用 peakScale 下调
 * 8. 全部禁止裸方波/锯齿波直出（引擎仅提供正弦/三角波 + 1/n² 谐波叠加）
 * ════════════════════════════════════════════════════════════════════ */
const SCALE_PENTATONIC = ['C', 'D', 'E', 'G', 'A']; // C 大调五声音阶
const TONIC = 'C5';                                  // 主音区
const PEAK_TARGET = 0.5;                             // -6 dBFS
const SR_FX = 44100;                                 // 短音效：44.1kHz 单声道
const SR_TRACK = 22050;                              // 音轨：22.05kHz 立体声

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOUNDS_DIR = path.join(ROOT, 'client', 'public', 'sounds');
const AUDIO_DIR = path.join(ROOT, 'client', 'public', 'audio');
const BACKUP_DIR = path.join(SOUNDS_DIR, '_backup_original');

/* ── 基础工具 ─────────────────────────────────────── */

/** 音名 → 频率（A4 = 440Hz），如 noteToFreq('C5') ≈ 523.25 */
export function noteToFreq(name) {
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(name);
  if (!m) throw new Error(`非法音名: ${name}`);
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semi = SEMI[m[1]];
  if (m[2] === '#') semi += 1;
  if (m[2] === 'b') semi -= 1;
  const midi = (parseInt(m[3], 10) + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const freqOf = (v) => (typeof v === 'number' ? v : noteToFreq(v));

/** 可复现伪随机数（mulberry32） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function strSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ── 包络：attack（≥5ms 防爆音）+ 指数衰减 + 余弦 release 尾窗 ── */
function envAt(t, dur, e = {}) {
  const a = Math.max(0.005, e.a ?? 0.008);          // attack 下限 5ms
  const tau = e.tau ?? dur * 0.35;                   // 指数式衰减时间常数
  let v = t < a ? t / a : Math.exp(-(t - a) / tau);
  const r = e.r ?? Math.min(0.03, dur * 0.3);        // release 尾窗防边界爆音
  const rs = dur - r;
  if (t > rs) v *= 0.5 * (1 + Math.cos(Math.PI * (t - rs) / r));
  return v;
}

/* ── 振荡器：正弦/三角波 + 谐波叠加（幅度 1/n² 衰减）+ 滑音 + 微失谐 ── */
const tri = (x) => (2 / Math.PI) * Math.asin(Math.sin(x));

/**
 * 将一个音事件叠加进缓冲。ev:
 * { at, dur, note | from+to（滑音）, wave:'sine'|'triangle', harmonics:0-4,
 *   env:{a,tau,r}, gain, detune(音分，双声部微失谐) }
 */
function addTone(buf, sr, ev, gainMul = 1) {
  const off = Math.floor((ev.at ?? 0) * sr);
  const n = Math.floor(ev.dur * sr);
  const f0 = freqOf(ev.from ?? ev.note);
  const f1 = freqOf(ev.to ?? ev.note ?? ev.from);
  const H = Math.min(4, Math.max(0, ev.harmonics ?? 3)) + 1; // 基频 + 0~4 泛音
  const wave = ev.wave === 'triangle' ? tri : Math.sin;
  const amps = []; let norm = 0;
  for (let h = 1; h <= H; h++) { const a = 1 / (h * h); amps.push(a); norm += a; }
  const detunes = ev.detune ? [-ev.detune, ev.detune] : [0];
  const g = ((ev.gain ?? 1) * gainMul) / detunes.length / norm;
  for (const dc of detunes) {
    const dr = Math.pow(2, dc / 1200);
    let ph = 0;
    for (let i = 0; i < n && off + i < buf.length; i++) {
      const t = i / sr;
      const f = f0 * Math.pow(f1 / f0, t / ev.dur) * dr; // 指数滑音（水滴质感）
      ph += (2 * Math.PI * f) / sr;
      let s = 0;
      for (let h = 1; h <= H; h++) s += amps[h - 1] * wave(ph * h);
      buf[off + i] += g * envAt(t, ev.dur, ev.env) * s;
    }
  }
}

/* ── 滤波噪声：白/粉/棕 + 一阶低通/高通（低通支持扫频 lp→lpTo）── */
function addNoise(buf, sr, ev, rnd, gainMul = 1) {
  const off = Math.floor((ev.at ?? 0) * sr);
  const n = Math.floor(ev.dur * sr);
  const g = (ev.gain ?? 1) * gainMul;
  let b0 = 0, b1 = 0, b2 = 0, brown = 0, lpY = 0, hpY = 0;
  for (let i = 0; i < n && off + i < buf.length; i++) {
    const t = i / sr;
    const w = rnd() * 2 - 1;
    let x;
    if (ev.color === 'pink') {           // Paul Kellet 近似粉噪声
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      x = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else if (ev.color === 'brown') {   // 漏积分棕噪声
      brown = (brown + 0.02 * w) / 1.02;
      x = brown * 3.5;
    } else {
      x = w;
    }
    if (ev.hp) { const a = 1 - Math.exp((-2 * Math.PI * ev.hp) / sr); hpY += a * (x - hpY); x -= hpY; }
    if (ev.lp) {
      const fc = ev.lpTo ? ev.lp * Math.pow(ev.lpTo / ev.lp, t / ev.dur) : ev.lp;
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      lpY += a * (x - lpY); x = lpY;
    }
    buf[off + i] += g * envAt(t, ev.dur, ev.env) * x;
  }
}

/* ── 轻量混响：4 路并联反馈 comb + 1 路 allpass ── */
function applyReverb(buf, sr, { decay = 0.6, mix = 0.25 } = {}) {
  const outLen = buf.length + Math.ceil(decay * 1.5 * sr);
  const wet = new Float32Array(outLen);
  const delays = [0.0297, 0.0371, 0.0411, 0.0437].map((d) => Math.max(1, Math.floor(d * sr)));
  for (const D of delays) {
    const fb = Math.pow(10, (-3 * (D / sr)) / decay);
    const comb = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const x = i < buf.length ? buf[i] : 0;
      comb[i] = x + (i >= D ? comb[i - D] * fb : 0);
    }
    for (let i = 0; i < outLen; i++) wet[i] += comb[i] / delays.length;
  }
  const D = Math.max(1, Math.floor(0.005 * sr)), gA = 0.5;
  const ap = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const xd = i >= D ? wet[i - D] : 0;
    const yd = i >= D ? ap[i - D] : 0;
    ap[i] = -gA * wet[i] + xd + gA * yd;
  }
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = (i < buf.length ? buf[i] : 0) + mix * ap[i];
  return out;
}

/* ── 归一化 / 边缘防爆音 / 度量 ── */
function normalize(buf, target) {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; }
  if (peak > 0) { const s = target / peak; for (let i = 0; i < buf.length; i++) buf[i] *= s; }
}
function fadeEdges(buf, sr, sec = 0.003) {
  const n = Math.min(buf.length >> 1, Math.floor(sec * sr));
  for (let i = 0; i < n; i++) {
    const w = i / n;
    buf[i] *= w;
    buf[buf.length - 1 - i] *= w;
  }
}
function rmsDb(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  const r = Math.sqrt(s / buf.length);
  return r > 0 ? 20 * Math.log10(r) : -Infinity;
}

/* ── 16-bit PCM WAV 编码器（单/双声道） ── */
function encodeWav(channels, sr) {
  const ch = channels.length, n = channels[0].length;
  const dataLen = n * ch * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
  let p = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      buf.writeInt16LE(Math.round(v * 32767), p); p += 2;
    }
  }
  return buf;
}
function f32ToI16(f) {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
  return out;
}

/* ════════════════════════════════════════════════════════════════════
 * 短音效声明式定义（42 个）
 * 事件构造器：T=单音 G=滑音 N=滤波噪声
 * ════════════════════════════════════════════════════════════════════ */
const T = (at, dur, note, o = {}) => ({ type: 'tone', at, dur, note, ...o });
const G = (at, dur, from, to, o = {}) => ({ type: 'tone', at, dur, from, to, ...o });
const N = (at, dur, color, o = {}) => ({ type: 'noise', at, dur, color, ...o });

const FX_SOUNDS = [
  /* ── 操作类（中性：单音/大二度装饰；启停成对上行/下行呼应）── */
  { file: 'capture_start', events: [T(0, 0.11, 'C5'), T(0.09, 0.16, 'E5')] },
  { file: 'capture_stop', events: [T(0, 0.11, 'E5'), T(0.09, 0.16, 'C5')] },
  { file: 'note_autosave', events: [T(0, 0.09, 'A5', { gain: 0.6, harmonics: 1 })], peakScale: 0.7 },
  { file: 'note_manual_save', events: [T(0, 0.05, 'D5', { gain: 0.5 }), T(0.045, 0.18, 'C5')] },
  { file: 'card_flip', events: [G(0, 0.08, 'E6', 'A5', { harmonics: 1 }), N(0, 0.05, 'white', { hp: 3000, lp: 9000, gain: 0.15 })] },
  { file: 'daily_checkin', events: [T(0, 0.08, 'C5'), T(0.07, 0.08, 'D5'), T(0.14, 0.16, 'G5')] },
  { file: 'feynman_record_start', events: [T(0, 0.09, 'D5'), T(0.08, 0.15, 'A5')] },
  { file: 'feynman_record_stop', events: [T(0, 0.09, 'A5'), T(0.08, 0.15, 'D5')] },

  /* ── 成就类（三音以上琶音 + 混响尾音）── */
  {
    file: 'achievement_unlocked', reverb: { decay: 0.9, mix: 0.3 },
    events: [T(0, 0.3, 'C5', { harmonics: 4 }), T(0.12, 0.3, 'E5', { harmonics: 4 }),
             T(0.24, 0.32, 'G5', { harmonics: 4 }), T(0.36, 0.55, 'C6', { harmonics: 4, env: { tau: 0.25 } }),
             T(0.5, 0.35, 'A6', { gain: 0.25, harmonics: 1 })],
  },
  {
    file: 'deck_complete', reverb: { decay: 0.6, mix: 0.25 },
    events: [T(0, 0.28, 'C5', { harmonics: 4 }), T(0.11, 0.3, 'E5', { harmonics: 4 }), T(0.22, 0.45, 'G5', { harmonics: 4 })],
  },
  {
    file: 'feynman_complete', reverb: { decay: 0.6, mix: 0.25 },
    events: [T(0, 0.28, 'E5', { harmonics: 4 }), T(0.11, 0.3, 'G5', { harmonics: 4 }), T(0.22, 0.45, 'C6', { harmonics: 4 })],
  },

  /* ── AI 类 ── */
  { file: 'ai_analysis_done', events: [T(0, 0.12, 'C5'), T(0.11, 0.22, 'G5')] },
  { file: 'feynman_weak_point', events: [T(0, 0.1, 'G5', { wave: 'triangle', harmonics: 1 }), T(0.09, 0.16, 'E5', { wave: 'triangle', harmonics: 1 })] },

  /* ── 深潜类 ── */
  { file: 'pomodoro_start', events: [G(0, 0.35, 'C5', 'G4', { env: { a: 0.015, tau: 0.18 } }), N(0, 0.35, 'brown', { lp: 500, gain: 0.12 })] },
  { file: 'pomodoro_pause', events: [T(0, 0.12, 'E5', { harmonics: 1 })] },
  {
    file: 'pomodoro_tick', peakScale: 0.55, // 极短低音量木鱼质感
    events: [T(0, 0.04, 'A4', { harmonics: 2, env: { a: 0.005, tau: 0.008 } }), N(0, 0.015, 'white', { lp: 2500, hp: 800, gain: 0.25 })],
  },
  {
    file: 'pomodoro_tick_final', peakScale: 0.65, // tick 提高小三度（A4→C5）
    events: [T(0, 0.04, 'C5', { harmonics: 2, env: { a: 0.005, tau: 0.008 } }), N(0, 0.015, 'white', { lp: 3000, hp: 900, gain: 0.25 })],
  },
  { file: 'pomodoro_5min_warning', events: [T(0, 0.14, 'G5', { gain: 0.9, harmonics: 2 }), T(0.16, 0.2, 'E5', { harmonics: 2 })] },
  { file: 'pomodoro_work_complete', events: [T(0, 0.1, 'C5'), T(0.09, 0.1, 'E5'), T(0.18, 0.2, 'G5')] },
  { file: 'pomodoro_break_end', events: [T(0, 0.1, 'G4'), T(0.09, 0.18, 'C5')] },
  { file: 'rate_remember', events: [T(0, 0.09, 'C5'), T(0.08, 0.14, 'E5')] },
  { file: 'rate_fuzzy', events: [T(0, 0.14, 'D5')] },
  { file: 'rate_forgot', events: [T(0, 0.09, 'E5'), T(0.08, 0.14, 'C5')] },

  /* ── UI 类（新增，11 个）── */
  { file: 'ui_click', events: [G(0, 0.06, noteToFreq('C5') * 0.9, 'C5', { harmonics: 1 })] },
  { file: 'ui_toggle_on', events: [T(0, 0.055, 'C5'), T(0.05, 0.09, 'D5')] },
  { file: 'ui_toggle_off', events: [T(0, 0.055, 'D5'), T(0.05, 0.09, 'C5')] },
  { file: 'ui_modal_open', events: [G(0, 0.18, 'G4', 'G5', { harmonics: 1, env: { a: 0.02, tau: 0.12 } }), N(0, 0.15, 'pink', { lp: 1200, lpTo: 4000, gain: 0.1 })] },
  { file: 'ui_modal_close', events: [G(0, 0.18, 'G5', 'G4', { harmonics: 1, env: { a: 0.02, tau: 0.12 } }), N(0, 0.15, 'pink', { lp: 4000, lpTo: 1200, gain: 0.1 })] },
  { file: 'ui_tab_switch', events: [G(0, 0.08, 'E5', 'A5', { harmonics: 1, gain: 0.8 }), N(0, 0.06, 'white', { hp: 2000, lp: 8000, gain: 0.12 })] },
  { file: 'ui_nav_switch', reverb: { decay: 0.45, mix: 0.35 }, events: [T(0, 0.2, 'A5', { detune: 6, harmonics: 2, env: { a: 0.02, tau: 0.12 } })] },
  { file: 'ui_hover_3d', peakScale: 0.6, events: [G(0, 0.05, 'E6', 'A6', { harmonics: 1 })] },
  { file: 'ui_module_enter', events: [N(0, 0.4, 'pink', { lp: 4000, lpTo: 300, gain: 0.7, env: { a: 0.02, tau: 0.25 } }), G(0, 0.4, 'C5', 'C4', { gain: 0.5, harmonics: 2, env: { a: 0.02, tau: 0.2 } })] },
  { file: 'ui_drag_start', events: [G(0, 0.1, 'G4', 'C5', { harmonics: 2 })] },
  { file: 'ui_drop', events: [G(0, 0.09, 'C5', 'G4', { harmonics: 2 }), T(0, 0.08, 'C3', { harmonics: 1, gain: 0.6, env: { a: 0.005, tau: 0.03 } })] },

  /* ── 反馈类（新增，8 个）── */
  { file: 'feedback_success', reverb: { decay: 0.3, mix: 0.2 }, events: [T(0, 0.11, 'C5'), T(0.1, 0.22, 'G5')] },
  { file: 'feedback_error', events: [T(0, 0.12, 'E5', { wave: 'triangle', harmonics: 1 }), T(0.11, 0.2, 'C5', { wave: 'triangle', harmonics: 1 })] },
  { file: 'feedback_warning', events: [T(0, 0.11, 'D5', { harmonics: 2 }), T(0.13, 0.11, 'D5', { harmonics: 2 })] },
  { file: 'feedback_delete', events: [G(0, 0.18, 'C4', 'A3', { harmonics: 2 })] },
  { file: 'data_export', events: [T(0, 0.09, 'C5'), T(0.08, 0.09, 'G5'), T(0.16, 0.14, 'C6')] },
  { file: 'data_import', events: [T(0, 0.09, 'G5'), T(0.08, 0.09, 'E5'), T(0.16, 0.14, 'C5')] },
  { file: 'data_cleared', events: [T(0, 0.12, 'A4'), T(0.11, 0.18, 'E4')] },
  { file: 'sync_complete', reverb: { decay: 0.35, mix: 0.2 }, events: [T(0, 0.1, 'E5'), T(0.09, 0.2, 'A5')] },
];

/* ── 短音效渲染 ── */
function renderFx(def) {
  const sr = SR_FX;
  let dur = 0;
  for (const ev of def.events) dur = Math.max(dur, (ev.at ?? 0) + ev.dur);
  let buf = new Float32Array(Math.ceil((dur + 0.03) * sr));
  const rnd = mulberry32(strSeed(def.file));
  for (const ev of def.events) {
    if (ev.type === 'noise') addNoise(buf, sr, ev, rnd);
    else addTone(buf, sr, ev);
  }
  if (def.reverb) buf = applyReverb(buf, sr, def.reverb);
  normalize(buf, PEAK_TARGET * (def.peakScale ?? 1));
  fadeEdges(buf, sr);
  return buf;
}

/* ════════════════════════════════════════════════════════════════════
 * 循环音轨生成（22.05kHz 立体声，首尾交叉渐变/尾音回卷实现无缝循环）
 * ════════════════════════════════════════════════════════════════════ */
const XFADE = 1.5; // 噪声类音轨循环交叉渐变时长（秒）

/** 连续噪声底（每声道独立种子实现立体声去相关） */
function noiseBed(n, sr, color, lp, gain, seed) {
  const buf = new Float32Array(n);
  const rnd = mulberry32(seed);
  addNoise(buf, sr, { at: 0, dur: n / sr + 1, color, lp, gain, env: { a: 0.005, tau: 1e9, r: 0.001 } }, rnd);
  return buf;
}

/** 立体声定点混音（等功率声像），支持音/噪声事件 */
function panTone(L, R, sr, ev, pan, rnd) {
  const gl = Math.cos((pan * Math.PI) / 2), gr = Math.sin((pan * Math.PI) / 2);
  if (ev.type === 'noise') {
    const rng = rnd ?? mulberry32(strSeed(`${ev.at}-${ev.dur}`));
    addNoise(L, sr, ev, rng, gl);
    if (R) addNoise(R, sr, ev, rng, gr);
    return;
  }
  addTone(L, sr, ev, gl);
  if (R) addTone(R, sr, ev, gr);
}

/** 交叉渐变裁剪为无缝循环 */
function loopTrim(ch, sr, durSec, xf = XFADE) {
  const Dn = Math.floor(durSec * sr), Xn = Math.floor(xf * sr);
  const out = new Float32Array(Dn);
  out.set(ch.subarray(0, Dn));
  for (let i = 0; i < Xn && Dn + i < ch.length; i++) {
    const w = i / Xn;
    out[i] = out[i] * w + ch[Dn + i] * (1 - w);
  }
  return out;
}

/** 尾音回卷（乐音类：结尾余音叠加到开头实现无缝） */
function wrapTail(ch, sr, durSec) {
  const Dn = Math.floor(durSec * sr);
  const out = new Float32Array(Dn);
  out.set(ch.subarray(0, Dn));
  for (let i = 0; Dn + i < ch.length && i < Dn; i++) out[i] += ch[Dn + i];
  return out;
}

const PENT_HI = ['C6', 'D6', 'E6', 'G6', 'A6'];

/* rain：滤波粉噪声底 + 五声音阶随机雨滴脉冲 */
function genRain(D, sr, stereo) {
  const n = Math.ceil((D + XFADE) * sr);
  const L = noiseBed(n, sr, 'pink', 2800, 0.3, 101);
  const R = stereo ? noiseBed(n, sr, 'pink', 2800, 0.3, 202) : null;
  const rnd = mulberry32(strSeed('rain-drops'));
  let t = 0.3;
  while (t < D + XFADE - 0.2) {
    const f = noteToFreq(PENT_HI[Math.floor(rnd() * PENT_HI.length)]) * (rnd() < 0.4 ? 0.5 : 1);
    const ev = G(t, 0.05 + rnd() * 0.05, f * 1.4, f, { harmonics: 1, gain: 0.04 + rnd() * 0.05, env: { a: 0.005, tau: 0.03 } });
    panTone(L, R, sr, ev, 0.2 + rnd() * 0.6);
    t += 0.2 + rnd() * 0.8;
  }
  return [loopTrim(L, sr, D), R && loopTrim(R, sr, D)].filter(Boolean);
}

/* waves：低频 LFO（周期 8-12s，整数周期保证循环连续）调制棕噪声涌动 */
function genWaves(D, sr, stereo) {
  const n = Math.ceil((D + XFADE) * sr);
  const k1 = Math.max(1, Math.round(D / 10)), k2 = Math.max(1, Math.round(D / 8.5));
  const chans = [];
  const seeds = stereo ? [303, 404] : [303];
  for (let c = 0; c < seeds.length; c++) {
    const ch = noiseBed(n, sr, 'brown', 650, 0.9, seeds[c]);
    const phase = c * 0.9;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const lfo = 0.5 + 0.32 * Math.sin((2 * Math.PI * k1 * t) / D + phase) + 0.18 * Math.sin((2 * Math.PI * k2 * t) / D + 1.3 + phase);
      ch[i] *= Math.max(0.08, lfo);
    }
    chans.push(loopTrim(ch, sr, D));
  }
  return chans;
}

/* forest：轻噪声底 + C 大调高音区随机鸟鸣 chirp */
function genForest(D, sr, stereo) {
  const n = Math.ceil((D + XFADE) * sr);
  const mk = (s1, s2) => {
    const a = noiseBed(n, sr, 'pink', 5000, 0.07, s1);
    const b = noiseBed(n, sr, 'brown', 400, 0.1, s2);
    for (let i = 0; i < n; i++) a[i] += b[i];
    return a;
  };
  const L = mk(505, 506);
  const R = stereo ? mk(607, 608) : null;
  const rnd = mulberry32(strSeed('forest-birds'));
  const BIRD = ['C6', 'D6', 'E6', 'G6', 'A6', 'C7'];
  let t = 1.0;
  while (t < D + XFADE - 0.8) {
    const pan = 0.15 + rnd() * 0.7;
    const segs = 2 + Math.floor(rnd() * 3);
    let tt = t;
    for (let s = 0; s < segs; s++) {
      const f1 = noteToFreq(BIRD[Math.floor(rnd() * BIRD.length)]);
      const f2 = f1 * (rnd() < 0.5 ? 1.12 : 0.9);
      const d = 0.05 + rnd() * 0.07;
      panTone(L, R, sr, G(tt, d, f1, f2, { harmonics: 1, gain: 0.05 + rnd() * 0.05, env: { a: 0.008, tau: 0.05 } }), pan);
      tt += d + 0.03 + rnd() * 0.05;
    }
    t += 1.5 + rnd() * 3.5;
  }
  return [loopTrim(L, sr, D), R && loopTrim(R, sr, D)].filter(Boolean);
}

/* cafe：棕噪声底 + 低频嗡嗡带 + 偶发杯碟音高点缀 */
function genCafe(D, sr, stereo) {
  const n = Math.ceil((D + XFADE) * sr);
  const kMod = Math.max(1, Math.round(D / 7));
  const mk = (seed, phase) => {
    const ch = noiseBed(n, sr, 'brown', 1100, 0.55, seed);
    const hi = noiseBed(n, sr, 'pink', 3000, 0.09, seed + 7);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const wob = 0.85 + 0.15 * Math.sin((2 * Math.PI * kMod * t) / D + phase);
      ch[i] = ch[i] * wob + hi[i] + 0.03 * Math.sin(2 * Math.PI * 90 * t) + 0.018 * Math.sin(2 * Math.PI * 120 * t);
    }
    return ch;
  };
  const L = mk(701, 0);
  const R = stereo ? mk(802, 1.1) : null;
  const rnd = mulberry32(strSeed('cafe-clinks'));
  const CLINK = ['C7', 'E7', 'G7'];
  let t = 2.0;
  while (t < D + XFADE - 0.5) {
    const pan = 0.2 + rnd() * 0.6;
    panTone(L, R, sr, T(t, 0.12, CLINK[Math.floor(rnd() * CLINK.length)], { harmonics: 2, gain: 0.05, env: { a: 0.005, tau: 0.03 } }), pan);
    if (rnd() < 0.5) panTone(L, R, sr, N(t + 0.01, 0.03, 'white', { hp: 4000, lp: 10000, gain: 0.03, env: { a: 0.005, tau: 0.015 } }), pan, rnd);
    t += 3 + rnd() * 5;
  }
  return [loopTrim(L, sr, D), R && loopTrim(R, sr, D)].filter(Boolean);
}

/* piano：C 大调琶音，I-vi-IV-V 进行，65 BPM，尾音回卷无缝循环 */
function genPiano(targetDur, sr, stereo) {
  const BPM = 65, beat = 60 / BPM, cycle = beat * 16;
  const cycles = Math.max(1, Math.round(targetDur / cycle));
  const D = cycles * cycle;
  const n = Math.ceil((D + 3) * sr);
  const L = new Float32Array(n);
  const R = stereo ? new Float32Array(n) : null;
  const CHORDS = [
    { bass: 'C2', arp: ['C4', 'E4', 'G4', 'C5', 'E5'] },  // I
    { bass: 'A2', arp: ['A3', 'C4', 'E4', 'A4', 'C5'] },  // vi
    { bass: 'F2', arp: ['F3', 'A3', 'C4', 'F4', 'A4'] },  // IV
    { bass: 'G2', arp: ['G3', 'B3', 'D4', 'G4', 'B4'] },  // V
  ];
  const PATTERN = [0, 2, 3, 4, 3, 2, 3, 1];
  for (let c = 0; c < cycles; c++) {
    for (let ci = 0; ci < 4; ci++) {
      const t0 = (c * 16 + ci * 4) * beat;
      const ch = CHORDS[ci];
      panTone(L, R, sr, T(t0, beat * 4, ch.bass, { harmonics: 3, gain: 0.4, detune: 2, env: { a: 0.006, tau: 1.6, r: 0.5 } }), 0.5);
      for (let s = 0; s < 8; s++) {
        const note = ch.arp[PATTERN[s]];
        const pan = 0.38 + 0.24 * (PATTERN[s] / 4);
        panTone(L, R, sr, T(t0 + s * beat * 0.5, 0.9, note, { harmonics: 4, gain: 0.3, detune: 3, env: { a: 0.006, tau: 0.55, r: 0.3 } }), pan);
      }
    }
  }
  return [wrapTail(L, sr, D), R && wrapTail(R, sr, D)].filter(Boolean);
}

/* ambient：正弦 pad 和弦垫（I-vi-IV-V）+ 慢 LFO 缓慢演变 */
function genAmbient(D, sr, stereo) {
  const seg = D / 4;
  const n = Math.ceil((D + 4) * sr);
  const L = new Float32Array(n);
  const R = stereo ? new Float32Array(n) : null;
  const PADS = [
    ['C3', 'G3', 'C4', 'E4', 'G4'],
    ['A2', 'E3', 'A3', 'C4', 'E4'],
    ['F2', 'C3', 'F3', 'A3', 'C4'],
    ['G2', 'D3', 'G3', 'B3', 'D4'],
  ];
  for (let ci = 0; ci < 4; ci++) {
    for (let vi = 0; vi < PADS[ci].length; vi++) {
      const pan = 0.3 + 0.1 * vi;
      panTone(L, R, sr, T(ci * seg, seg + 2.5, PADS[ci][vi], {
        harmonics: 2, gain: 0.35, detune: 4 + vi,
        env: { a: 2.5, tau: seg * 1.4, r: 2.5 },
      }), pan);
    }
  }
  const kL = Math.max(1, Math.round(D / 12));
  const chans = [L, R].filter(Boolean);
  for (let c = 0; c < chans.length; c++) {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      chans[c][i] *= 1 + 0.12 * Math.sin((2 * Math.PI * kL * t) / D + c * 1.4);
    }
  }
  return chans.map((ch) => wrapTail(ch, sr, D));
}

const TRACKS = [
  { file: 'rain', gen: genRain },
  { file: 'waves', gen: genWaves },
  { file: 'forest', gen: genForest },
  { file: 'cafe', gen: genCafe },
  { file: 'piano', gen: genPiano },
  { file: 'ambient', gen: genAmbient },
];

/* ════════════════════════════════════════════════════════════════════
 * MP3 编码降级链：ffmpeg → lamejs（自动安装）→ 保留 WAV
 * ════════════════════════════════════════════════════════════════════ */
function detectFfmpeg() {
  try {
    const r = spawnSync('ffmpeg', ['-version'], { stdio: 'pipe', shell: true });
    return r.status === 0;
  } catch { return false; }
}

function ensureLame() {
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

function encodeMp3Lame(lame, chans, sr, kbps = 128) {
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

function encodeMp3Ffmpeg(chans, sr, outPath) {
  const tmpWav = outPath + '.tmp.wav';
  fs.writeFileSync(tmpWav, encodeWav(chans, sr));
  const r = spawnSync('ffmpeg', ['-y', '-i', tmpWav, '-codec:a', 'libmp3lame', '-b:a', '128k', outPath], { stdio: 'pipe', shell: true });
  fs.rmSync(tmpWav, { force: true });
  if (r.status !== 0) throw new Error('ffmpeg 转码失败');
}

/* ════════════════════════════════════════════════════════════════════
 * 主流程
 * ════════════════════════════════════════════════════════════════════ */
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
