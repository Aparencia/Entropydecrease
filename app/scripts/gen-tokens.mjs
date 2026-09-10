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
  { name: "ink-4", light: "#909088", dark: "#6E6A62", usage: "未确认（过渡态，3.1:1，见 ADR-032 第 4 条）" },
  { name: "ink-3", light: "#6E6E68", dark: "#9A958B", usage: "已重打分（≥4.5:1）" },
  { name: "ink-2", light: "#3A3A36", dark: "#D6D1C8", usage: "已确认 · 正文基准（≥11:1）" },
  { name: "ink-1", light: "#1A1A1A", dark: "#F5F1E8", usage: "已改写 · 唯一使用字重 +1 档的档位" },
  { name: "mark-clip", light: "#F4F1E9", dark: "#221F1B", usage: "剪报底纹（默认开，仅背景色不加边框）" },
  { name: "stamp", light: "#B3271E", dark: "#E0604F", usage: "状态戳 —— 全站唯一非中性色，绝不用于按钮" },
  { name: "ok", light: "#2F7A4F", dark: "#4FAE74", usage: "掌握 / 已毕业 / 成功回执" },
  { name: "due", light: "#A05F10", dark: "#E0A44B", usage: "到期刻度 / 低置信点线 / 记忆语义文字（亮档原 #B26A12 实测仅 4.06:1，不合格，已改）" },
  { name: "link", light: "#1F5FBF", dark: "#6E9BE8", usage: "链接 / 时间码 / 引用" },
  { name: "overlay", light: "#1A1A1A", dark: "#1A1A1A", usage: "遮罩基色（配 --ed-overlay-alpha 使用）" },
];

/** 非颜色 token：两档共用（规范 §4.2） */
export const SCALE_SOURCE = {
  fontFamilyBody: '"Source Han Serif SC", "Songti SC", SimSun, serif',
  fontFamilyUi: '"Inter", "Segoe UI Variable", "Microsoft YaHei UI", system-ui, sans-serif',
  fontFamilyMono: '"JetBrains Mono", Consolas, ui-monospace, monospace',
  /** 字阶：字号/行高·字重（规范 §4.2，下界 12px） */
  typeScale: ["25px/34px·600", "17px/24px·600", "15.5px/1.9·400", "13px/20px·400", "12px/18px·500", "11.5px/16px·500"],
  /** 间距：4 为半档，其余落 8px 网格 */
  spaceScale: [4, 8, 12, 16, 24, 32, 48],
  /** 圆角：3 印章 · 5 控件与卡 · 8 面板 · 10 浮层 */
  radiusScale: [
    { name: "stamp", px: 3 },
    { name: "control", px: 5 },
    { name: "panel", px: 8 },
    { name: "overlay", px: 10 },
  ],
  /** 遮罩透明度（配 overlay 基色） */
  overlayAlpha: 0.34,
  /** 图标规格（ADR-032 第 6 条） */
  iconGrid: 24,
  iconStroke: 1.75,
  iconSizes: [16, 20, 24],
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

  /* 间距（4 为半档，仅图标内边距） */
${SCALE_SOURCE.spaceScale.map((n) => `  --ed-space-${n}: ${n}px;`).join("\n")}

  /* 圆角 */
${SCALE_SOURCE.radiusScale.map((r) => `  --ed-radius-${r.name}: ${r.px}px;`).join("\n")}

  /* 遮罩 */
  --ed-overlay-alpha: ${SCALE_SOURCE.overlayAlpha};

  /* 图标 */
  --ed-icon-stroke: ${SCALE_SOURCE.iconStroke};
}

[data-theme="dark"] {
${dark}
}
`;
}

function renderTs() {
  const colorRows = COLOR_TOKENS.map(
    (t) => `  { name: ${JSON.stringify(t.name)}, light: ${JSON.stringify(t.light)}, dark: ${JSON.stringify(t.dark)}, usage: ${JSON.stringify(t.usage)} },`,
  ).join("\n");
  return `${TS_HEADER}export interface ColorToken {
  /** 不含 \`--ed-\` 前缀；完整变量名用 \`cssVar(name)\` 组装 */
  readonly name: string;
  readonly light: string;
  readonly dark: string;
  readonly usage: string;
}

export const COLOR_TOKENS: readonly ColorToken[] = [
${colorRows}
];

export const SCALE_TOKENS = {
  fontFamilyBody: ${JSON.stringify(SCALE_SOURCE.fontFamilyBody)},
  fontFamilyUi: ${JSON.stringify(SCALE_SOURCE.fontFamilyUi)},
  fontFamilyMono: ${JSON.stringify(SCALE_SOURCE.fontFamilyMono)},
  typeScale: ${JSON.stringify(SCALE_SOURCE.typeScale)},
  spaceScale: ${JSON.stringify(SCALE_SOURCE.spaceScale)},
  radiusScale: ${JSON.stringify(SCALE_SOURCE.radiusScale)},
  overlayAlpha: ${SCALE_SOURCE.overlayAlpha},
  iconGrid: ${SCALE_SOURCE.iconGrid},
  iconStroke: ${SCALE_SOURCE.iconStroke},
  iconSizes: ${JSON.stringify(SCALE_SOURCE.iconSizes)},
} as const;

export const THEMES = ["light", "dark"] as const;
export type ThemeName = (typeof THEMES)[number];
`;
}

/** 纯渲染：返回两份产物的完整文本，不触磁盘 */
export function renderAll() {
  return { css: renderCss(), ts: renderTs() };
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
      if (have !== want) {
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
