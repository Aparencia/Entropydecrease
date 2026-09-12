#!/usr/bin/env node
/**
 * @ai-context 前端设计系统 token 的**单一真源**（ADR-032）。
 *
 * Why：全站原有 88 个硬编码 hex、0 个 CSS 变量，样式无法治理。本脚本持有规范数据
 * （色阶/字阶/间距/圆角），并生成两个产物供运行时与测试消费 ——
 * 手改产物会被 src/ui/tokens.drift.test.ts 判失败。
 *
 * 用法：
 *   node scripts/gen-tokens.mjs          # 写盘（覆盖产物）
 *   node scripts/gen-tokens.mjs --check  # 只校验，不写盘；有漂移则 exit 1
 *
 * 副作用：无参数时写 app/src/ui/tokens.css 与 app/src/ui/tokens.gen.ts 两个文件。
 * 边界：颜色值**只允许出现在本文件**（theme.md 纪律）。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_CSS = join(HERE, "..", "src", "ui", "tokens.css");
const OUT_TS = join(HERE, "..", "src", "ui", "tokens.gen.ts");

/**
 * 对比度基准（规范 §4.1）：「面」是正文实际所在的底，「纸」是窗口底。
 * 两者相差约半档（ink-2 面对面 11.42、对纸 10.95），故断言按底分别设阈值。
 */
export const CONTRAST_BASELINE = {
  light: { canvas: "#FBFAF8", surface: "#FFFFFF" },
  dark: { canvas: "#141312", surface: "#1C1A18" },
};

/** 颜色 token：name 不带 --ed- 前缀；两档各一值（规范 §4.1） */
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
];

/**
 * 字阶结构化真源（规范 §4.2）—— CSS 变量与人读串**同源派生**，不允许各写一份。
 * 第 3 档原为无单位行高 `1.9`，其余为 px（两种写法并存会让 CSS 无法统一消费）；
 * 换算依据：15.5px × 1.9 = 29.45px ⇒ 取一位小数 **29.5px**（0.5px 是可用精度，
 * 差 0.05px 不影响任何排版判定，且比 29px 更接近真实行高）。
 */
export const TYPE_SCALE = [
  { size: 25, line: 34, weight: 600 },
  { size: 17, line: 24, weight: 600 },
  { size: 15.5, line: 29.5, weight: 400 },
  { size: 13, line: 20, weight: 400 },
  { size: 12, line: 18, weight: 500 },
  { size: 11.5, line: 16, weight: 500 },
];

/**
 * 阴影 token（规范 §4.2② · 2026-09-11 用户裁决「纸感双层暖墨」，提交 `44b6e05a`）。
 * **暗档不用投影**，改白色反相描边（沿用 `docs/product/ui-ux-system.md:204` 的既有做法）——
 * 暗底上的黑色投影看不见，只会让面板边缘糊成一团。
 */
export const SHADOW_TOKENS = [
  { name: "shadow-1", light: "0 1px 2px rgba(28,25,23,.06), 0 4px 12px rgba(28,25,23,.08)", dark: "0 0 0 1px rgba(255,255,255,.06)", usage: "低层：菜单 / 浮层 / 小卡（亮档投影；暗档反相描边）" },
  { name: "shadow-2", light: "0 2px 4px rgba(28,25,23,.06), 0 12px 32px rgba(28,25,23,.14)", dark: "0 0 0 1px rgba(255,255,255,.06)", usage: "高层：Modal / 浮窗（亮档投影；暗档反相描边）" },
];

/**
 * 动效时长 token（规格 §8.4）—— 批 6 从 `src/ui/primitives/motion.css` 的临时接缝**逐字迁入**（R2.3）。
 *
 * Why 进真源：`motion.css` 的那段 `:root{}` 是批 0-D 的**临时**落点（当时还没有动效真源），文件头逐字
 * 承诺「批 6 的动效 token 真源完成后整块删除」。迁移后本文件是时长/缓动的**唯一真源**（R1.1 单一真源，
 * 绝不双写）：`motion.css` 里不再允许出现 `--ed-*` 定义，由 `style-seams.test.ts` 的回归封条守。
 * 值**逐字照抄**临时块、一个不改；消费点写的是 `var(--ed-dur-x, <同值字面量>)` ⇒ 删块即生效、零规则改动。
 *
 * 边界：`ms` 是**纯数字**（`renderCss` 负责拼 `ms` 单位）；`usage` 只进 TS 产物，不进 CSS。
 */
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
];

/**
 * 缓动 token（规格 §8.4「`--ease cubic-bezier(0.2,0,0,1)`」）—— 与时长**分开列**：
 * 变量名是 `--ed-ease`（没有 `dur-` 段），而时长恒为 `--ed-dur-<name>`，两者的拼法不同名。
 * 批 6 的 T8 会在此追加双基调的两条缓动（`data-tone` 的仪器 / 纸），**只许追加、不许改本条**。
 */
export const EASING_TOKENS = [
  { name: "ease", value: "cubic-bezier(0.2, 0, 0, 1)", usage: "全站唯一曲线（规格 §8.4）" },
];

/** 非颜色 token：两档共用（规范 §4.2） */
export const SCALE_SOURCE = {
  fontFamilyBody: '"Source Han Serif SC", "Songti SC", SimSun, serif',
  fontFamilyUi: '"Inter", "Segoe UI Variable", "Microsoft YaHei UI", system-ui, sans-serif',
  fontFamilyMono: '"JetBrains Mono", Consolas, ui-monospace, monospace',
  /** 字阶：字号/行高·字重（规范 §4.2，下界 12px；`11.5/16 mono` 为唯一点名例外）—— 由 TYPE_SCALE 派生 */
  typeScale: TYPE_SCALE.map((t) => `${t.size}px/${t.line}px·${t.weight}`),
  /** 间距：4 为半档，其余落 8px 网格 */
  spaceScale: [4, 8, 12, 16, 24, 32, 48],
  /**
   * 圆角：3 印章 · 5 控件与卡 · 8 面板 · 10 浮层 · 999 药丸（批 4 B17 的第 5 档；规格 §4.2 只写四档）。
   *
   * `pill` 的 999 **不是本任务自创的数字**：它是原语层 `ui/primitives/Surface.css:58` 里既有的兜底值
   * `var(--ed-radius-pill, 999px)`（全仓唯一命中，R2.3「取既有原语层兜底值」）。批 6 T5 把它升为
   * 真源档位后，真源与唯一消费者同值 —— 由 `gen-tokens.test.mjs` 的「== 原语层兜底值」对拍钉住。
   */
  radiusScale: [
    { name: "stamp", px: 3 },
    { name: "control", px: 5 },
    { name: "panel", px: 8 },
    { name: "overlay", px: 10 },
    { name: "pill", px: 999 },
  ],
  /** 遮罩透明度（配 overlay 基色） */
  overlayAlpha: 0.34,
  /** 图标规格（ADR-032 第 6 条） */
  iconGrid: 24,
  iconStroke: 1.75,
  iconSizes: [16, 20, 24],
  /**
   * 顶栏高度（规格 §1 决策 16「`--nav-h` 变量」）。
   *
   * Why 进 SCALE_SOURCE 而不是留在调用点：它是**壳层与 9 个页面共用的纵向基准**
   * （8 个页面的 `calc(100vh - 56px)` + `AiConversationDock` 的 `top: 56` + 顶栏自身 `height`），
   * 散落时改一次高度要同步 10 处，且没有任何门禁看得见漏改的那一处。
   * 值 56 是**实测的既有值**（v0.18.0 起 8 Tab 就是 56，见 App.tsx 顶栏样式），本批不改高度、只把它变成变量。
   * 与 §6.3「采集态 58px LIVE 仪表」**不同**：那是相变态的另一根高度，属批 6。
   */
  navHeight: 56,
};

const CSS_HEADER = `/*
 * tokens.css — 由 scripts/gen-tokens.mjs 生成，请勿手改。
 * 手改会被 src/ui/tokens.drift.test.ts 判失败。
 * 依据：ADR-032 · docs/superpowers/specs/2026-09-11-frontend-redesign-design.md §4
 */
`;

const TS_HEADER = `/**
 * @ai-context tokens.gen.ts — 此文件由 scripts/gen-tokens.mjs 生成，请勿手改。
 * 手改会被 src/ui/tokens.drift.test.ts 判失败。
 *
 * Why：规范数据（色阶/字阶/间距/圆角）需要同时供运行时（CSS）与测试（TS）消费。
 * 生成而非手写，是为了让两份数据不可能分叉。
 */

`;

function renderCss() {
  const light = COLOR_TOKENS.map((t) => `  --ed-${t.name}: ${t.light}; /* ${t.usage} */`).join("\n");
  const dark = COLOR_TOKENS.map((t) => `  --ed-${t.name}: ${t.dark};`).join("\n");
  return `${CSS_HEADER}
:root {
${light}

  /* 字族（界面用黑体，正文用中文衬线 —— 衬线只给正文） */
  --ed-font-body: ${SCALE_SOURCE.fontFamilyBody};
  --ed-font-ui: ${SCALE_SOURCE.fontFamilyUi};
  --ed-font-mono: ${SCALE_SOURCE.fontFamilyMono};

  /* 字阶（规范 §4.2）：--ed-type-<n>-{size,line,weight}，n 与 TYPE_SCALE 下标同序（1 起） */
${TYPE_SCALE.map((t, i) => [
  `  --ed-type-${i + 1}-size: ${t.size}px;`,
  `  --ed-type-${i + 1}-line: ${t.line}px;`,
  `  --ed-type-${i + 1}-weight: ${t.weight};`,
].join("\n")).join("\n")}

  /* 间距（4 为半档，仅图标内边距） */
${SCALE_SOURCE.spaceScale.map((n) => `  --ed-space-${n}: ${n}px;`).join("\n")}

  /* 圆角 */
${SCALE_SOURCE.radiusScale.map((r) => `  --ed-radius-${r.name}: ${r.px}px;`).join("\n")}

  /* 阴影（规范 §4.2②）：亮档投影；暗档在 [data-theme="dark"] 里改为反相白描边 */
${SHADOW_TOKENS.map((t) => `  --ed-${t.name}: ${t.light}; /* ${t.usage} */`).join("\n")}

  /* 遮罩 */
  --ed-overlay-alpha: ${SCALE_SOURCE.overlayAlpha};

  /* 壳层纵向基准（规格 §1 决策 16）：顶栏高度 —— 页面用 calc(100vh - var(--ed-nav-h)) 消费 */
  --ed-nav-h: ${SCALE_SOURCE.navHeight}px;

  /* 动效（规格 §8.4）：9 个时长 + 1 个缓动 —— 批 6 从 primitives/motion.css 的临时接缝迁入，值逐字不变 */
${DURATION_TOKENS.map((t) => `  --ed-dur-${t.name}: ${t.ms}ms;`).join("\n")}
${EASING_TOKENS.map((t) => `  --ed-${t.name}: ${t.value};`).join("\n")}

  /* 图标 */
  --ed-icon-stroke: ${SCALE_SOURCE.iconStroke};
}

[data-theme="dark"] {
${dark}

  /* 阴影：暗档不用投影，改白色反相描边（暗底上黑色投影不可见） */
${SHADOW_TOKENS.map((t) => `  --ed-${t.name}: ${t.dark};`).join("\n")}
}
`;
}

function renderTs() {
  const colorRows = COLOR_TOKENS.map(
    (t) => `  { name: ${JSON.stringify(t.name)}, light: ${JSON.stringify(t.light)}, dark: ${JSON.stringify(t.dark)}, usage: ${JSON.stringify(t.usage)} },`,
  ).join("\n");
  const durationRows = DURATION_TOKENS.map(
    (t) => `  { name: ${JSON.stringify(t.name)}, ms: ${t.ms}, usage: ${JSON.stringify(t.usage)} },`,
  ).join("\n");
  const easingRows = EASING_TOKENS.map(
    (t) => `  { name: ${JSON.stringify(t.name)}, value: ${JSON.stringify(t.value)}, usage: ${JSON.stringify(t.usage)} },`,
  ).join("\n");
  // 合并名册：与上面两份同源派生（同一份 DURATION_TOKENS/EASING_TOKENS 数据），不是第二份手写数据
  const motionRows = [
    ...DURATION_TOKENS.map(
      (t) => `  { name: ${JSON.stringify(`dur-${t.name}`)}, cssVar: ${JSON.stringify(`--ed-dur-${t.name}`)}, kind: "duration", value: ${JSON.stringify(`${t.ms}ms`)} },`,
    ),
    ...EASING_TOKENS.map(
      (t) => `  { name: ${JSON.stringify(t.name)}, cssVar: ${JSON.stringify(`--ed-${t.name}`)}, kind: "easing", value: ${JSON.stringify(t.value)} },`,
    ),
  ].join("\n");
  return `${TS_HEADER}export interface ColorToken {
  /** 不含 \`--ed-\` 前缀；完整变量名用 \`cssVar(name)\` 组装 */
  readonly name: string;
  readonly light: string;
  readonly dark: string;
  readonly usage: string;
}

export const COLOR_TOKENS = [
${colorRows}
] as const satisfies readonly ColorToken[];

/**
 * 16 个 token 名的字面量联合 —— 门面 \`cssVar\` / \`varRef\` 的入参类型。
 *
 * Why：入参若退化成裸 \`string\`，批 4 的上千处 \`varRef("...")\` 里一个拼写错误
 * （如 \`varRef("ink-5")\`）**编译期全绿、运行期静默取不到值** —— 未定义的 CSS 变量不报错。
 * 窄类型把「token 名」这一业务术语变成可被编译器强制的契约（AGENTS.md §3.2）。
 */
export type ColorTokenName = (typeof COLOR_TOKENS)[number]["name"];

export const SCALE_TOKENS = {
  fontFamilyBody: ${JSON.stringify(SCALE_SOURCE.fontFamilyBody)},
  fontFamilyUi: ${JSON.stringify(SCALE_SOURCE.fontFamilyUi)},
  fontFamilyMono: ${JSON.stringify(SCALE_SOURCE.fontFamilyMono)},
  typeScale: ${JSON.stringify(SCALE_SOURCE.typeScale)},
  typeScaleVars: ${JSON.stringify(TYPE_SCALE)},
  spaceScale: ${JSON.stringify(SCALE_SOURCE.spaceScale)},
  radiusScale: ${JSON.stringify(SCALE_SOURCE.radiusScale)},
  overlayAlpha: ${SCALE_SOURCE.overlayAlpha},
  iconGrid: ${SCALE_SOURCE.iconGrid},
  iconStroke: ${SCALE_SOURCE.iconStroke},
  navHeight: ${SCALE_SOURCE.navHeight},
  iconSizes: ${JSON.stringify(SCALE_SOURCE.iconSizes)},
} as const;

export interface DurationToken {
  /** 不含 \`--ed-dur-\` 前缀；完整变量名 = \`--ed-dur-\` + name */
  readonly name: string;
  readonly ms: number;
  readonly usage: string;
}

export interface EasingToken {
  /** 不含 \`--ed-\` 前缀（今日只有全站唯一曲线 \`ease\`） */
  readonly name: string;
  readonly value: string;
  readonly usage: string;
}

/** 动效时长（规格 §8.4）—— 值**逐字**来自批 0-D 的临时接缝 primitives/motion.css，批 6 迁入此处 */
export const DURATION_TOKENS = [
${durationRows}
] as const satisfies readonly DurationToken[];

/** 时长短名的字面量联合：门面收窄入参用（拼错必须编译期报错，不是运行期静默取不到值） */
export type DurationTokenName = (typeof DURATION_TOKENS)[number]["name"];

/** 缓动曲线（规格 §8.4）—— 批 6 的 T8 会追加双基调的两条，只许追加 */
export const EASING_TOKENS = [
${easingRows}
] as const satisfies readonly EasingToken[];

/**
 * 时长 + 缓动的**合并名册**：\`name\` 是不含前缀的短名（\`dur-micro\` / \`ease\`），
 * \`cssVar\` 是 CSS 变量全名，\`value\` 是 CSS 里的字面量（时长带 \`ms\` 单位）。
 *
 * Why：消费方（守卫 / GSAP / 文档回写）要的正是「变量全名 ↔ 定值」这一层；两份数据同源派生，
 * 故合并名册不可能与上面两份分叉。
 */
export const MOTION_TOKENS = [
${motionRows}
] as const;

export type MotionTokenName = (typeof MOTION_TOKENS)[number]["name"];

export const THEMES = ["light", "dark"] as const;
export type ThemeName = (typeof THEMES)[number];
`;
}

/** 纯渲染：返回两份产物的完整文本，不触磁盘 */
export function renderAll() {
  return { css: renderCss(), ts: renderTs() };
}

/**
 * 行尾归一：`\r\n` 与孤立 `\r` 一律折成 `\n`。
 *
 * Why：本仓库没有 `.gitattributes`，而 `core.autocrlf=true` —— 新克隆/新检出时 git 会把
 * 产物转成 CRLF，而本脚本的模板恒为 LF。若 `--check` 逐字节比对，此时会报「漂移」，
 * 但同一份产物在 src/ui/tokens.drift.test.ts 里（已按本函数同口径归一）却是绿的 ——
 * 两个守卫对同一份产物结论相反，且报错原因与「有人手改了产物」无关，属**假阳性**。
 * 归一后仍守住真正要守的：**内容**漂移（值/行/结构变了就仍不相等）。
 *
 * 边界：本函数**只**抹平行尾差异，不碰空白与缩进 —— 故不掩盖内容漂移。
 * 一致性：`--check` 与漂移测试走的是**同一个**函数（测试直接 import 本模块）；
 * 此前两边各持一份实现且口径已分叉（`\r\n?` vs `\r\n`），同一份产物两个守卫结论相反 ——
 * 故不再保留第二份实现，也**不得**再复制一份。
 */
export function normalizeEol(s) {
  return s.replace(/\r\n?/g, "\n");
}

function main() {
  const check = process.argv.includes("--check");
  const { css, ts } = renderAll();
  if (check) {
    let drifted = false;
    for (const [path, want] of [[OUT_CSS, css], [OUT_TS, ts]]) {
      let have = "";
      try {
        have = readFileSync(path, "utf8");
      } catch {
        have = "";
      }
      if (normalizeEol(have) !== normalizeEol(want)) {
        console.error(`✗ 漂移：${path}（跑 node scripts/gen-tokens.mjs 重新生成）`);
        drifted = true;
      }
    }
    process.exit(drifted ? 1 : 0);
  }
  writeFileSync(OUT_CSS, css);
  writeFileSync(OUT_TS, ts);
  console.log(`✓ 已生成 ${OUT_CSS}\n✓ 已生成 ${OUT_TS}`);
}

if (process.argv[1] && process.argv[1].endsWith("gen-tokens.mjs")) main();
