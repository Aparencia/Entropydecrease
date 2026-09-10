/**
 * @ai-context 前端设计系统的对比度纯函数（ADR-032）。
 *
 * Why：规范 §4.3 允许「未确认档 3.1:1」这一有意识的 AA 例外，例外必须可被机器守护 ——
 * 否则它会在后续批次里悄悄扩散成「随便用淡色」。本模块是那一守护的度量基础。
 *
 * 副作用：无（纯函数，不触 DOM、不读环境）。
 * 边界：仅接受 `#RGB` / `#RRGGBB`；不接受 rgb()/hsl()/具名色 —— 让非法输入尽早炸掉，
 * 而不是静默返回一个错误的对比度（防御性优先于宽容）。
 */

/** 6 位 hex 的最小/最大合法长度（含 `#`） */
const HEX_LENGTHS = new Set([4, 7]);

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * 解析 hex 颜色。非法输入抛错而**不**回退默认值 —— 静默回退会让对比度断言失去意义。
 * @throws Error 当输入不是 `#RGB` / `#RRGGBB` 形式时
 */
export function parseHex(hex: string): Rgb {
  if (typeof hex !== "string" || !hex.startsWith("#") || !HEX_LENGTHS.has(hex.length)) {
    throw new Error(`无效 hex 颜色：${JSON.stringify(hex)}（需 #RGB 或 #RRGGBB）`);
  }
  const raw = hex.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error(`无效 hex 颜色：${JSON.stringify(hex)}（含非 hex 字符）`);
  }
  // 3 位缩写的语义是「每位翻倍」（#0AF → #00AAFF），不是左侧补零
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** sRGB 分量线性化（WCAG 2.1 定义，阈值 0.03928） */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 相对亮度，返回 0（黑）..1（白） */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG 对比度，返回 1..21；参数顺序不影响结果 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA 判定：正文 4.5:1，大字（≥18.66px 粗体或 ≥24px）3:1 */
export function meetsAA(ratio: number, opts: { large?: boolean } = {}): boolean {
  return ratio >= (opts.large ? 3 : 4.5);
}
