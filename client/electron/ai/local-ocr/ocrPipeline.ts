/**
 * 本地 OCR 推理管线纯函数（P2-1）
 *
 * @ai-context: PP-OCRv5 det/rec 后处理纯函数层（自 RapidOCR/PaddleOCR 官方
 * 实现移植，2026-08 联调验证通过：det 二值化 0.3 → 2×2 膨胀 → 8 邻域连通域
 * → AABB 框（简化 minAreaRect/unclip，框外扩补偿）→ box score ≥0.5；
 * rec 高度 48 等比缩放 → CTC 解码（argmax → 去连续重复 → 去 blank）。
 * 输入为 RGB Float32Array（解码层在 ocrService，nativeImage），可单测。
 * @ai-context EN: Pure postprocessing for PP-OCRv5 (ported from RapidOCR,
 * verified 2026-08): DB binarize 0.3 → 2x2 dilate → 8-connected components →
 * AABB boxes with padding; rec 48-height resize + CTC greedy decode.
 */

export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  score: number;
}

// ================================================================
// 图像工具
// ================================================================

/** 最近邻缩放 RGB（源 [sw*sh*3] → 目标 [dw*dh*3]） */
export function resizeRgb(
  src: Float32Array, sw: number, sh: number, dw: number, dh: number,
): Float32Array {
  const out = new Float32Array(dw * dh * 3);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y + 0.5) * sh / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x + 0.5) * sw / dw));
      const so = (sy * sw + sx) * 3;
      const o = (y * dw + x) * 3;
      out[o] = src[so];
      out[o + 1] = src[so + 1];
      out[o + 2] = src[so + 2];
    }
  }
  return out;
}

/** CHW 归一化 (x/255-0.5)/0.5（RGB 输入 → [3*h*w]） */
export function normalizeChw(rgb: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(3 * h * w);
  const n = w * h;
  for (let i = 0; i < n; i++) {
    out[i] = (rgb[i * 3] / 255 - 0.5) / 0.5;
    out[n + i] = (rgb[i * 3 + 1] / 255 - 0.5) / 0.5;
    out[2 * n + i] = (rgb[i * 3 + 2] / 255 - 0.5) / 0.5;
  }
  return out;
}

/** 2×2 膨胀（掩码 uint8，把相邻字符块连成文本行） */
export function dilate2x2(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < h && nx < w) out[ny * w + nx] = 1;
          }
        }
      }
    }
  }
  return out;
}

/** 8 邻域连通域（栈式 BFS，返回 AABB 组件列表；maxBoxes 上限保护） */
export function connectedComponents(
  mask: Uint8Array, w: number, h: number, maxBoxes = 200,
): Array<{ minX: number; maxX: number; minY: number; maxY: number; count: number }> {
  const visited = new Uint8Array(w * h);
  const comps: Array<{ minX: number; maxX: number; minY: number; maxY: number; count: number }> = [];
  const stack = new Int32Array(w * h);
  for (let y0 = 0; y0 < h && comps.length < maxBoxes; y0++) {
    for (let x0 = 0; x0 < w && comps.length < maxBoxes; x0++) {
      const start = y0 * w + x0;
      if (!mask[start] || visited[start]) continue;
      let top = 0;
      stack[top++] = start;
      visited[start] = 1;
      let minX = x0;
      let maxX = x0;
      let minY = y0;
      let maxY = y0;
      let count = 0;
      while (top > 0) {
        const idx = stack[--top];
        const cx = idx % w;
        const cy = (idx - cx) / w;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        count++;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const nIdx = ny * w + nx;
            if (mask[nIdx] && !visited[nIdx]) {
              visited[nIdx] = 1;
              stack[top++] = nIdx;
            }
          }
        }
      }
      if (count >= 3) comps.push({ minX, maxX, minY, maxY, count });
    }
  }
  return comps;
}

// ================================================================
// det 后处理
// ================================================================

export const DET_THRESH = 0.3;
export const DET_BOX_THRESH = 0.5;
/** det 预处理：min 边放大到该值（32 倍数对齐），与 RapidOCR 默认一致 */
export const DET_LIMIT_SIDE = 736;

/**
 * det 后处理：概率图 [dh*dw] → 文本框（原图坐标）。
 * 二值化 → 膨胀 → 连通域 → AABB + 框外扩补偿（unclip 简化）→ box score 过滤 → 自上而下排序。
 */
export function detectBoxes(
  pred: Float32Array, dw: number, dh: number,
  origW: number, origH: number,
): OcrBox[] {
  const mask = new Uint8Array(dh * dw);
  for (let i = 0; i < dh * dw; i++) mask[i] = pred[i] > DET_THRESH ? 1 : 0;
  const dilated = dilate2x2(mask, dw, dh);
  const comps = connectedComponents(dilated, dw, dh);
  const sx = origW / dw;
  const sy = origH / dh;
  const boxes: OcrBox[] = [];
  for (const c of comps) {
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    if (bw < 4 || bh < 4) continue;
    // box score：框内概率均值（fast 模式近似）
    let sum = 0;
    let n = 0;
    for (let y = c.minY; y <= c.maxY; y++) {
      for (let x = c.minX; x <= c.maxX; x++) {
        sum += pred[y * dw + x];
        n++;
      }
    }
    const score = sum / n;
    if (score < DET_BOX_THRESH) continue;
    boxes.push({
      x0: Math.max(0, Math.floor(c.minX * sx)),
      y0: Math.max(0, Math.floor(c.minY * sy)),
      x1: Math.min(origW - 1, Math.ceil(c.maxX * sx)),
      y1: Math.min(origH - 1, Math.ceil(c.maxY * sy)),
      score,
    });
  }
  boxes.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  return boxes;
}

// ================================================================
// rec 后处理（CTC 解码）
// ================================================================

export const REC_IMG_HEIGHT = 48;

/**
 * CTC greedy 解码：argmax → 去连续重复 → 去 blank(0) → 字符映射；
 * 置信度 = 选中位概率均值（与 RapidOCR CTCLabelDecode 口径一致）。
 * @param probs [T][C] 二维数组（Float32Array 子视图）
 */
export function ctcDecode(
  probs: ArrayLike<number>[], character: string[],
): { text: string; confidence: number } {
  const seqLen = probs.length;
  if (seqLen === 0) return { text: '', confidence: 0 };
  const indices = new Int32Array(seqLen);
  const confs = new Float64Array(seqLen);
  for (let t = 0; t < seqLen; t++) {
    const row = probs[t];
    const C = row.length;
    let best = 0;
    let bestP = row[0];
    for (let c = 1; c < C; c++) {
      if (row[c] > bestP) {
        bestP = row[c];
        best = c;
      }
    }
    indices[t] = best;
    confs[t] = bestP;
  }
  const selected: number[] = [];
  for (let t = 0; t < seqLen; t++) {
    if (indices[t] === 0) continue;
    if (t > 0 && indices[t] === indices[t - 1]) continue;
    selected.push(t);
  }
  const chars = selected.map((t) => character[indices[t]] ?? '?');
  const conf = selected.length > 0
    ? selected.reduce((acc, t) => acc + confs[t], 0) / selected.length
    : 0;
  return { text: chars.join(''), confidence: conf };
}
