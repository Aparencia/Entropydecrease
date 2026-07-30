/**
 * @ai-context
 * 循环音轨生成器（6 个）— 22.05kHz 立体声，交叉渐变/尾音回卷实现无缝循环。
 * Loop track generators (6): rain/waves/forest/cafe/piano/ambient with seamless looping.
 * Why: 噪声类用交叉渐变（loopTrim）、乐音类用尾音回卷（wrapTail），两种循环策略对应不同声学材质。
 */
import {
  T, G, N, noteToFreq, mulberry32, strSeed, addTone, addNoise,
} from './engine.mjs';

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

export const TRACKS = [
  { file: 'rain', gen: genRain },
  { file: 'waves', gen: genWaves },
  { file: 'forest', gen: genForest },
  { file: 'cafe', gen: genCafe },
  { file: 'piano', gen: genPiano },
  { file: 'ambient', gen: genAmbient },
];
