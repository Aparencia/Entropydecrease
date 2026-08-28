/**
 * 视觉系统色板（v0.14 B 子项目）。
 *
 * @ai-context: 12 色语义色板双主题变体 + WCAG 对比度纯函数 + 四级颜色解析
 *              （笔记显式 > 组继承 > 标签 > 默认灰）。纯函数层——
 *              isThemeSafe/onColorText 决定色块上的文字颜色（黑/白取高对比），
 *              resolveNoteColor 统一卡片/列表/侧栏的颜色来源（spec §4.3）。
 *              未知色板 id 一律回退默认灰（数据损坏防御，不崩溃）。
 */

/** 色板 id（12 色；null=未设置/默认灰） */
export type ColorId =
  | "red" | "orange" | "yellow" | "green" | "teal" | "blue"
  | "purple" | "pink" | "brown" | "gray" | "black" | "white";

/** 主题模式（与 App.css prefers-color-scheme 对齐） */
export type ThemeMode = "light" | "dark";

/** 色板定义：双主题变体 + 中文语义（spec §4.1 表） */
export const COLOR_PALETTE: Record<ColorId, { label: string; light: string; dark: string }> = {
  red: { label: "红", light: "#E5484D", dark: "#FF6369" },
  orange: { label: "橙", light: "#F76B15", dark: "#FF8B3D" },
  yellow: { label: "黄", light: "#F5D90A", dark: "#FFE45C" },
  green: { label: "绿", light: "#30A46C", dark: "#3DD68C" },
  teal: { label: "青", light: "#12A594", dark: "#29E0CB" },
  blue: { label: "蓝", light: "#0091FF", dark: "#5EB1FF" },
  purple: { label: "紫", light: "#8E4EC6", dark: "#C59BFF" },
  pink: { label: "粉", light: "#D6409F", dark: "#FF8AD8" },
  brown: { label: "棕", light: "#8D6E63", dark: "#B89B8A" },
  gray: { label: "灰", light: "#8E8E93", dark: "#9E9EA3" },
  black: { label: "黑", light: "#1C1C1E", dark: "#F2F2F7" },
  white: { label: "白", light: "#FFFFFF", dark: "#1C1C1E" },
};

/** 色板 id 有序列表（选择器渲染顺序） */
export const COLOR_IDS: ColorId[] = Object.keys(COLOR_PALETTE) as ColorId[];

/** 未知/未设置色板 id 的回退（数据损坏防御） */
export const DEFAULT_COLOR: ColorId = "gray";

/** 色板 id 是否合法（未知 id 回退默认灰） */
export function isColorId(v: unknown): v is ColorId {
  return typeof v === "string" && v in COLOR_PALETTE;
}

/** hex 色值 → 相对亮度（WCAG：sRGB 通道线性化） */
export function relativeLuminance(hex: string): number {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 两色对比度（WCAG：≥4.5:1 为 AA 文本级，≥3:1 为 AA 大字号/图形级） */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** 取色板色值（未知 id 回退默认灰；主题变体） */
export function paletteHex(colorId: string | null | undefined, theme: ThemeMode): string {
  const id = isColorId(colorId) ? colorId : DEFAULT_COLOR;
  return COLOR_PALETTE[id][theme];
}

/** 色块上文字取黑/白（对比度更高者；黑/白其一必 ≥4.5:1） */
export function onColorText(colorId: ColorId, theme: ThemeMode): "black" | "white" {
  const hex = COLOR_PALETTE[colorId][theme];
  return contrastRatio(hex, "#000000") >= contrastRatio(hex, "#FFFFFF") ? "black" : "white";
}

/**
 * 主题安全校验（spec §4.1）：该色变体上黑/白文字至少一种 ≥4.5:1（WCAG AA）。
 * 定义期拦截用（测试覆盖全 12 色 × 双主题）；运行期不校验。
 */
export function isThemeSafe(colorId: ColorId, theme: ThemeMode): boolean {
  const hex = COLOR_PALETTE[colorId][theme];
  return contrastRatio(hex, "#000000") >= 4.5 || contrastRatio(hex, "#FFFFFF") >= 4.5;
}

/** 解析 Note.properties JSON（损坏/缺失回退空对象——防御性） */
export function parseNoteProperties(note: { properties?: string | null }): Record<string, string> {
  if (!note.properties) return {};
  try {
    const v = JSON.parse(note.properties);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** 解析 tags JSON 为字符串数组（损坏回退空数组；与 NoteListView.parseTags 同契约） */
export function parseNoteTags(note: { tags?: string }): string[] {
  try {
    const t = JSON.parse(note.tags ?? "[]");
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

/**
 * 四级颜色解析（spec §4.3 渲染优先级）：
 * 笔记显式 properties.color > 组继承 color > 首个有色的标签 > null（默认灰）。
 * 返回色板 id；全链路未知 id 由 paletteHex 兜底默认灰。
 */
export function resolveNoteColor(
  note: { properties?: string | null; tags?: string },
  group: { color?: string | null } | null | undefined,
  tagColors: Record<string, string>,
): string | null {
  const props = parseNoteProperties(note);
  if (props.color) return props.color;
  if (group?.color) return group.color;
  for (const t of parseNoteTags(note)) {
    if (tagColors[t]) return tagColors[t];
  }
  return null;
}
