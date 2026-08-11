/**
 * 卡片纹理生成（CanvasTexture）
 * Card texture generation (CanvasTexture)
 *
 * @ai-context: 3D 空间中的笔记卡片位图——canvas 2D 绘制圆角背景、模板色条、
 * 标题与元信息，作为 billboard 平面纹理。1.5x 抗锯齿（384×240），sRGB 色彩
 * 空间 + 4x 各向异性过滤保证文字清晰。深色形态暗底浅字、浅色形态暖白底深字
 * （暗域画主义：卡片是暗域中的发光体）。
 * @ai-context: Note card bitmap for 3D space — canvas 2D rounded background,
 * template color bar, title and meta info as a billboard plane texture.
 * 1.5x supersampled, sRGB + 4x anisotropy for crisp text.
 */
import * as THREE from 'three';
import { TEMPLATE_COLORS, TEMPLATE_FALLBACK, type ReefMorph, type ReefNote } from './reefTypes';

/** 纹理源尺寸（1.5x 抗锯齿；世界尺寸 1.6 时清晰度/内存平衡） */
const TEX_W = 384;
const TEX_H = 240;

/** 卡片世界尺寸（与 ReefCards / FloatedNote 共用） */
export const CARD_W = 1.7;
export const CARD_H = 1.06;

/** 圆角矩形路径（兼容无 ctx.roundRect 环境） */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 文本按像素宽截断 */
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/** 生成卡片纹理（canvas 2D：圆角背景 + 模板色条 + 标题 + 元信息） */
export function buildCardTexture(note: ReefNote, morph: ReefMorph): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // 极端环境兜底：纯色纹理
    return new THREE.CanvasTexture(canvas);
  }
  const w = canvas.width;
  const h = canvas.height;
  const color = TEMPLATE_COLORS[morph][note.template] ?? TEMPLATE_FALLBACK[morph];
  const dark = morph === 'abyss';
  const radius = 20;

  // 背景 + 边框（暗域画主义：卡片是暗域中的发光体）
  ctx.fillStyle = dark ? 'rgba(13,26,38,0.94)' : 'rgba(255,250,242,0.96)';
  roundRectPath(ctx, 0, 0, w, h, radius);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  roundRectPath(ctx, 1.5, 1.5, w - 3, h - 3, radius - 1.5);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 模板色条（左侧）
  ctx.fillStyle = color;
  ctx.fillRect(10, 12, 7, h - 24);

  // 标题（1 行截断）
  ctx.fillStyle = dark ? '#E2EAF2' : '#3A342C';
  ctx.font = '600 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(truncateText(ctx, note.title || '无标题', w - 52), 38, 64);

  // 元信息（字数 + 首标签）
  ctx.fillStyle = dark ? '#647B90' : '#8A8578';
  ctx.font = '22px "Segoe UI", system-ui, sans-serif';
  const meta = `${note.wordCount} 字${note.tags[0] ? ` · #${note.tags[0]}` : ''}`;
  ctx.fillText(truncateText(ctx, meta, w - 52), 38, 106);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
