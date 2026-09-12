/**
 * @ai-context tokens.gen.ts — 此文件由 scripts/gen-tokens.mjs 生成，请勿手改。
 * 手改会被 src/ui/tokens.drift.test.ts 判失败。
 *
 * Why：规范数据（色阶/字阶/间距/圆角）需要同时供运行时（CSS）与测试（TS）消费。
 * 生成而非手写，是为了让两份数据不可能分叉。
 */

export interface ColorToken {
  /** 不含 `--ed-` 前缀；完整变量名用 `cssVar(name)` 组装 */
  readonly name: string;
  readonly light: string;
  readonly dark: string;
  readonly usage: string;
}

export const COLOR_TOKENS = [
  { name: "bg-sunken", light: "#F1EEE7", dark: "#100F0E", usage: "输入槽 / 骨架 / 内嵌" },
  { name: "bg-canvas", light: "#FBFAF8", dark: "#141312", usage: "窗口底（纸）" },
  { name: "bg-surface", light: "#FFFFFF", dark: "#1C1A18", usage: "卡片 / 列 / 阅读面" },
  { name: "bg-raised", light: "#FFFFFF", dark: "#24211E", usage: "弹层 / 菜单 / 浮窗（亮档另加 --ed-shadow-1）" },
  { name: "border", light: "#EAE7E0", dark: "#2E2A26", usage: "横格 / 分隔" },
  { name: "border-strong", light: "#C9C4B8", dark: "#423C36", usage: "输入框 / 刻度底 / 引线" },
  { name: "ink-4", light: "#909088", dark: "#6E6A62", usage: "未确认（过渡态，3.22:1，见 ADR-032 第 4 条）" },
  { name: "ink-3", light: "#6E6E68", dark: "#9A958B", usage: "已重打分（≥4.5:1）" },
  { name: "ink-2", light: "#3A3A36", dark: "#D6D1C8", usage: "已确认 · 正文基准（≥11:1）" },
  { name: "ink-1", light: "#1A1A1A", dark: "#F5F1E8", usage: "已改写 · 唯一使用字重 +1 档的档位" },
  { name: "mark-clip", light: "#F4F1E9", dark: "#221F1B", usage: "剪报底纹（默认开，仅背景色不加边框）" },
  { name: "stamp", light: "#B3271E", dark: "#E0604F", usage: "状态戳 —— 全站唯一非中性色，绝不用于按钮" },
  { name: "ok", light: "#2F7A4F", dark: "#4FAE74", usage: "掌握 / 已毕业 / 成功回执" },
  { name: "due", light: "#9F5E10", dark: "#E0A44B", usage: "到期刻度 / 低置信点线 / 记忆语义文字（亮档两次对比度修正：#B26A12 4.06:1 → #A05F10 → #9F5E10；最终值以剪报底余量 ≥0.05 为准）" },
  { name: "link", light: "#1F5FBF", dark: "#6E9BE8", usage: "链接 / 时间码 / 引用" },
  { name: "overlay", light: "#1A1A1A", dark: "#1A1A1A", usage: "遮罩基色（配 --ed-overlay-alpha 使用）" },
] as const satisfies readonly ColorToken[];

/**
 * 16 个 token 名的字面量联合 —— 门面 `cssVar` / `varRef` 的入参类型。
 *
 * Why：入参若退化成裸 `string`，批 4 的上千处 `varRef("...")` 里一个拼写错误
 * （如 `varRef("ink-5")`）**编译期全绿、运行期静默取不到值** —— 未定义的 CSS 变量不报错。
 * 窄类型把「token 名」这一业务术语变成可被编译器强制的契约（AGENTS.md §3.2）。
 */
export type ColorTokenName = (typeof COLOR_TOKENS)[number]["name"];

export const SCALE_TOKENS = {
  fontFamilyBody: "\"Source Han Serif SC\", \"Songti SC\", SimSun, serif",
  fontFamilyUi: "\"Inter\", \"Segoe UI Variable\", \"Microsoft YaHei UI\", system-ui, sans-serif",
  fontFamilyMono: "\"JetBrains Mono\", Consolas, ui-monospace, monospace",
  typeScale: ["25px/34px·600","17px/24px·600","15.5px/29.5px·400","13px/20px·400","12px/18px·500","11.5px/16px·500"],
  typeScaleVars: [{"size":25,"line":34,"weight":600},{"size":17,"line":24,"weight":600},{"size":15.5,"line":29.5,"weight":400},{"size":13,"line":20,"weight":400},{"size":12,"line":18,"weight":500},{"size":11.5,"line":16,"weight":500}],
  spaceScale: [4,8,12,16,24,32,48],
  radiusScale: [{"name":"stamp","px":3},{"name":"control","px":5},{"name":"panel","px":8},{"name":"overlay","px":10},{"name":"pill","px":999}],
  overlayAlpha: 0.34,
  iconGrid: 24,
  iconStroke: 1.75,
  navHeight: 56,
  iconSizes: [16,20,24],
} as const;

export interface DurationToken {
  /** 不含 `--ed-dur-` 前缀；完整变量名 = `--ed-dur-` + name */
  readonly name: string;
  readonly ms: number;
  readonly usage: string;
}

export interface EasingToken {
  /** 不含 `--ed-` 前缀（今日只有全站唯一曲线 `ease`） */
  readonly name: string;
  readonly value: string;
  readonly usage: string;
}

/** 动效时长（规格 §8.4）—— 值**逐字**来自批 0-D 的临时接缝 primitives/motion.css，批 6 迁入此处 */
export const DURATION_TOKENS = [
  { name: "micro", ms: 120, usage: "响应层：单属性、无时序的交互回执（规格 §8.2 判据）" },
  { name: "overlay-in", ms: 200, usage: "弹层遮罩与面板进场（规格 §8.4「进出场：弹层 200/160」）" },
  { name: "overlay-out", ms: 160, usage: "弹层遮罩与面板出场 —— 出场比进场快（规格 §8.4）" },
  { name: "toast-in", ms: 180, usage: "Toast 进场（规格 §8.4「Toast 180/140」）" },
  { name: "toast-out", ms: 140, usage: "Toast 出场 —— 出场比进场快（规格 §8.4）" },
  { name: "skeleton", ms: 1200, usage: "循环环境动效：骨架微光（规格 §8.4「--dur-skeleton 1200ms」）" },
  { name: "card", ms: 220, usage: "面板 / 视图 / 列折叠（规格 §8.4「--dur-card 220ms」）；今日 0 生产消费者，波 C 首次消费" },
  { name: "reveal", ms: 500, usage: "显影 / 编排层（规格 §8.4「--dur-reveal 500ms」）；今日 0 生产消费者，波 C 首次消费" },
  { name: "page", ms: 150, usage: "页面切换（规格 §8.4「--dur-page 150ms」）；今日 0 生产消费者，波 C 首次消费" },
] as const satisfies readonly DurationToken[];

/** 时长短名的字面量联合：门面收窄入参用（拼错必须编译期报错，不是运行期静默取不到值） */
export type DurationTokenName = (typeof DURATION_TOKENS)[number]["name"];

/** 缓动曲线（规格 §8.4）—— 批 6 的 T8 会追加双基调的两条，只许追加 */
export const EASING_TOKENS = [
  { name: "ease", value: "cubic-bezier(0.2, 0, 0, 1)", usage: "全站唯一曲线（规格 §8.4）" },
] as const satisfies readonly EasingToken[];

/**
 * 时长 + 缓动的**合并名册**：`name` 是不含前缀的短名（`dur-micro` / `ease`），
 * `cssVar` 是 CSS 变量全名，`value` 是 CSS 里的字面量（时长带 `ms` 单位）。
 *
 * Why：消费方（守卫 / GSAP / 文档回写）要的正是「变量全名 ↔ 定值」这一层；两份数据同源派生，
 * 故合并名册不可能与上面两份分叉。
 */
export const MOTION_TOKENS = [
  { name: "dur-micro", cssVar: "--ed-dur-micro", kind: "duration", value: "120ms" },
  { name: "dur-overlay-in", cssVar: "--ed-dur-overlay-in", kind: "duration", value: "200ms" },
  { name: "dur-overlay-out", cssVar: "--ed-dur-overlay-out", kind: "duration", value: "160ms" },
  { name: "dur-toast-in", cssVar: "--ed-dur-toast-in", kind: "duration", value: "180ms" },
  { name: "dur-toast-out", cssVar: "--ed-dur-toast-out", kind: "duration", value: "140ms" },
  { name: "dur-skeleton", cssVar: "--ed-dur-skeleton", kind: "duration", value: "1200ms" },
  { name: "dur-card", cssVar: "--ed-dur-card", kind: "duration", value: "220ms" },
  { name: "dur-reveal", cssVar: "--ed-dur-reveal", kind: "duration", value: "500ms" },
  { name: "dur-page", cssVar: "--ed-dur-page", kind: "duration", value: "150ms" },
  { name: "ease", cssVar: "--ed-ease", kind: "easing", value: "cubic-bezier(0.2, 0, 0, 1)" },
] as const;

export type MotionTokenName = (typeof MOTION_TOKENS)[number]["name"];

export const THEMES = ["light", "dark"] as const;
export type ThemeName = (typeof THEMES)[number];
