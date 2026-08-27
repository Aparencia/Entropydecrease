// @ai-context
// Chronos 六态形态定义与视觉参数：类型、展示元数据、Canvas 演示渲染参数。
// Chronos six-state definitions and visual params for the web demo.
// Why: 状态机与展示数据集中定义，ChronosDemo 组件与 dive 内容配置共享同一来源，避免漂移。

export type ChronosState =
  | "asleep"
  | "breathing"
  | "focus"
  | "short_break"
  | "long_break"
  | "milestone";

export interface ChronosStateMeta {
  key: ChronosState;
  name: string;
  icon: string;
  desc: string;
}

export const CHRONOS_STATES: ChronosStateMeta[] = [
  { key: "asleep", name: "沉睡", icon: "🌑", desc: "暗红余烬脉动，等待被唤醒。" },
  { key: "breathing", name: "呼吸", icon: "🌕", desc: "60bpm 心跳红光，准备好开始。" },
  { key: "focus", name: "专注", icon: "🔥", desc: "白炽星体，粒子随倒计时消散。" },
  { key: "short_break", name: "短休", icon: "🌱", desc: "嫩绿种子自旋，萌芽新生。" },
  { key: "long_break", name: "长休", icon: "🌳", desc: "种子破土，长成参天大树。" },
  { key: "milestone", name: "划时代点", icon: "💡", desc: "把时间抽象，变成有生命的伙伴。" },
];

/** 六态渲染参数：RGB 主色 / 心跳强度(0-1) / 粒子规模 / 漂移速度 / 光晕强度 / 是否粒子消散 */
export interface ChronosStateStyle {
  color: [number, number, number];
  pulse: number;
  scale: number;
  drift: number;
  glow: number;
  dissipate: boolean;
}

export const STATE_STYLE: Record<ChronosState, ChronosStateStyle> = {
  asleep:      { color: [156, 59, 59],  pulse: 0.35, scale: 0.55, drift: 0.25, glow: 0.22, dissipate: false },
  breathing:   { color: [239, 68, 68],  pulse: 1.0,  scale: 1.0,  drift: 0.4,  glow: 0.4,  dissipate: false },
  focus:       { color: [249, 115, 22], pulse: 0.2,  scale: 1.2,  drift: 0.7,  glow: 0.55, dissipate: true },
  short_break: { color: [74, 222, 128], pulse: 0.55, scale: 0.9,  drift: 0.55, glow: 0.45, dissipate: false },
  long_break:  { color: [34, 197, 94],  pulse: 0.3,  scale: 1.1,  drift: 0.35, glow: 0.5,  dissipate: false },
  milestone:   { color: [251, 191, 36], pulse: 0.9,  scale: 1.15, drift: 0.6,  glow: 0.6,  dissipate: false },
};
