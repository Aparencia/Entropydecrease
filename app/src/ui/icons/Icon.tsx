/**
 * @ai-context 图标的**唯一渲染入口**（ADR-032 决策 6）。
 *
 * Why：把「几何数据 → DOM」这一步收在一处，才能保证全站图标在网格、描边、着色、可及性上
 * 一致。`currentColor` 是关键：它让图标继承父级墨度 —— 于是 D 显影的四档墨度、选中/禁用/
 * 危险三态都能**自动**作用于图标，而 emoji 做不到这一点。
 *
 * 副作用：无（纯展示组件，不读 store、不发请求）。
 * 边界：描边宽度取自 `--ed-icon-stroke`，**带字面量兜底** —— 测试环境（jsdom）未加载
 * `tokens.css`，无兜底时描边会退化为默认 1，使快照与观感不符。
 */

import type { IconProps } from "./types";
import { ICON_PATHS } from "./paths";
import { SCALE_TOKENS } from "../tokens";

export function Icon({ name, size = 20, label, className }: IconProps) {
  const geometry = ICON_PATHS[name];
  const stroke = `var(--ed-icon-stroke, ${SCALE_TOKENS.iconStroke})`;
  // 装饰性图标不进可及性树；带 label 时角色变为 img 并暴露名字
  const a11y = label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${SCALE_TOKENS.iconGrid} ${SCALE_TOKENS.iconGrid}`}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      className={className}
      {...a11y}
    >
      {geometry.elements.map((el, i) => {
        const key = `${name}-${i}`;
        if (el.tag === "path") return <path key={key} d={el.d} />;
        if (el.tag === "circle") return <circle key={key} cx={el.cx} cy={el.cy} r={el.r} />;
        return <rect key={key} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx} />;
      })}
    </svg>
  );
}
