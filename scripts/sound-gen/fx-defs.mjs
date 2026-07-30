/**
 * @ai-context
 * 短音效声明式定义（42 个）与渲染器 — 全部遵循 C 大调五声音阶音律美规范。
 * Declarative FX sound definitions (42) and renderer, following the pentatonic sound design spec.
 * Why: 音效以数据（事件数组）而非过程代码定义，调音只改参数不碰 DSP 逻辑。
 */
import {
  T, G, N, SR_FX, PEAK_TARGET, noteToFreq,
  mulberry32, strSeed, addTone, addNoise, applyReverb, normalize, fadeEdges,
} from './engine.mjs';

export const FX_SOUNDS = [
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
    file: 'pomodoro_tick_final', peakScale: 0.65, // tick 提高小三度（A4→C5）
    events: [T(0, 0.04, 'C5', { harmonics: 2, env: { a: 0.005, tau: 0.008 } }), N(0, 0.015, 'white', { lp: 3000, hp: 900, gain: 0.25 })],
  },
  { file: 'pomodoro_5min_warning', events: [T(0, 0.14, 'G5', { gain: 0.9, harmonics: 2 }), T(0.16, 0.2, 'E5', { harmonics: 2 })] },
  { file: 'pomodoro_work_complete', events: [T(0, 0.1, 'C5'), T(0.09, 0.1, 'E5'), T(0.18, 0.2, 'G5')] },
  { file: 'pomodoro_break_end', events: [T(0, 0.1, 'G4'), T(0.09, 0.18, 'C5')] },
  {
    file: 'pomodoro_complete', reverb: { decay: 0.7, mix: 0.28 }, // 整轮深潜完成：work_complete 琶音上延八度 C6，庆祝感强于单轮
    events: [T(0, 0.12, 'C5', { harmonics: 3 }), T(0.1, 0.12, 'E5', { harmonics: 3 }),
             T(0.2, 0.14, 'G5', { harmonics: 3 }), T(0.3, 0.42, 'C6', { harmonics: 4, env: { tau: 0.2 } })],
  },
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
export function renderFx(def) {
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
