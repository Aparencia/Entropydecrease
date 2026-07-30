/**
 * @ai-context
 * 音效合成 DSP 引擎 — 振荡器、滤波噪声、包络、混响、归一化与 WAV 编码原语。
 * Sound synthesis DSP engine: oscillators, filtered noise, envelope, reverb, WAV encoding.
 * Why: 引擎仅提供正弦/三角波 + 1/n² 谐波叠加，从物理上杜绝裸方波/锯齿波直出（音律美规范 §8）。
 */

/* ── 全局常量（音律美设计规范） ── */
export const PEAK_TARGET = 0.5;   // -6 dBFS
export const SR_FX = 44100;       // 短音效：44.1kHz 单声道
export const SR_TRACK = 22050;    // 音轨：22.05kHz 立体声

/* ── 事件构造器：T=单音 G=滑音 N=滤波噪声 ── */
export const T = (at, dur, note, o = {}) => ({ type: 'tone', at, dur, note, ...o });
export const G = (at, dur, from, to, o = {}) => ({ type: 'tone', at, dur, from, to, ...o });
export const N = (at, dur, color, o = {}) => ({ type: 'noise', at, dur, color, ...o });

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
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function strSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ── 包络：attack（≥5ms 防爆音）+ 指数衰减 + 余弦 release 尾窗 ── */
export function envAt(t, dur, e = {}) {
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
export function addTone(buf, sr, ev, gainMul = 1) {
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
export function addNoise(buf, sr, ev, rnd, gainMul = 1) {
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
export function applyReverb(buf, sr, { decay = 0.6, mix = 0.25 } = {}) {
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
export function normalize(buf, target) {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; }
  if (peak > 0) { const s = target / peak; for (let i = 0; i < buf.length; i++) buf[i] *= s; }
}
export function fadeEdges(buf, sr, sec = 0.003) {
  const n = Math.min(buf.length >> 1, Math.floor(sec * sr));
  for (let i = 0; i < n; i++) {
    const w = i / n;
    buf[i] *= w;
    buf[buf.length - 1 - i] *= w;
  }
}
export function rmsDb(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  const r = Math.sqrt(s / buf.length);
  return r > 0 ? 20 * Math.log10(r) : -Infinity;
}

/* ── 16-bit PCM WAV 编码器（单/双声道） ── */
export function encodeWav(channels, sr) {
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
export function f32ToI16(f) {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
  return out;
}
