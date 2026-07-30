/**
 * 关键帧图片标记处理工具（[图:N] → Markdown 图片）
 * Keyframe image marker utilities: remap batch-local markers and
 * resolve [图:N] markers into markdown images with local file URLs.
 *
 * @ai-context: 与 AI 网关 Prompt 协议对应——模型在与某帧强相关的知识点处
 * 单独一行输出 [图:N]（N 为分析时关键帧数组的 1-based 序号）。本模块负责：
 * ①增量批次局部编号重映射为全局编号（remapKeyframeMarkers）
 * ②[图:N] → ![第N帧](fileUrl) 替换，无 fileUrl 时移除标记优雅降级
 * ③整篇无标记时按时间就近在二级标题下兜底插入至多一张关键帧图片
 * （fallback: nearest keyframe per H2 heading with MM:SS time, at most one）。
 */

/** 供标记替换使用的关键帧引用（fileUrl 缺省表示图片未成功落盘） */
export interface KeyframeImageRef {
  fileUrl?: string;
  /** 课程内相对秒数（与笔记标题中的 MM:SS 时间标注同基准） */
  relativeSeconds: number;
}

/** [图:N] 标记匹配（兼容半角/全角冒号） */
const MARKER_RE = /\[图[:：](\d+)\]/g;

/** 二级标题内的 MM:SS 时间标注（如 "## 二叉树遍历（03:25）"） */
const HEADING_TIME_RE = /^##\s.*?(\d{1,3})[:：](\d{2})/;

export interface ResolveOptions {
  /** 整篇无 [图:N] 标记时是否按时间就近兜底插入图片（默认开启） */
  fallbackInsert?: boolean;
}

/**
 * 将增量批次内的局部帧编号（1-based）重映射为全局编号
 * 越界编号（模型幻觉产生）直接移除
 *
 * @param markdown     增量分析返回的片段 Markdown
 * @param globalOffset 本批第 1 帧在全量关键帧数组中的 0-based 偏移
 * @param batchSize    本批帧数（用于越界校验）
 */
export function remapKeyframeMarkers(
  markdown: string,
  globalOffset: number,
  batchSize: number,
): string {
  return markdown.replace(MARKER_RE, (_m, n: string) => {
    const local = parseInt(n, 10);
    if (local < 1 || local > batchSize) return '';
    return `[图:${globalOffset + local}]`;
  });
}

/**
 * 把 [图:N] 标记替换为 Markdown 图片 ![第N帧](fileUrl)
 * - N 为分析时关键帧数组的 1-based 序号
 * - 对应帧无 fileUrl（保存失败）时移除标记，优雅降级
 * - 整篇无任何标记时，按时间就近在各二级标题下兜底插入最多 1 张图片
 */
export function resolveKeyframeMarkers(
  markdown: string,
  keyframes: KeyframeImageRef[],
  options?: ResolveOptions,
): string {
  let hasMarker = false;
  const out: string[] = [];

  for (const line of markdown.split('\n')) {
    const markers: number[] = [];
    const stripped = line.replace(MARKER_RE, (_m, n: string) => {
      hasMarker = true;
      markers.push(parseInt(n, 10));
      return '';
    });
    if (markers.length === 0) {
      out.push(line);
      continue;
    }
    // 保留标记外的剩余文本（标记要求单独成行，此处兼容行内混排）
    const rest = stripped.replace(/\s+$/, '');
    if (rest.trim()) out.push(rest);
    for (const n of markers) {
      const url = keyframes[n - 1]?.fileUrl;
      if (url) out.push(`![第${n}帧](${url})`);
    }
  }

  let result = out.join('\n');
  if (!hasMarker && (options?.fallbackInsert ?? true)) {
    result = insertFallbackImages(result, keyframes);
  }
  return result;
}

/**
 * 兜底插入：模型未输出任何 [图:N] 时，为每个带 MM:SS 时间标注的
 * 二级标题就近匹配一张未使用的关键帧图片（每帧最多用一次）
 */
function insertFallbackImages(
  markdown: string,
  keyframes: KeyframeImageRef[],
): string {
  const usable = keyframes
    .map((kf, idx) => ({ idx, fileUrl: kf.fileUrl, seconds: kf.relativeSeconds }))
    .filter((kf): kf is { idx: number; fileUrl: string; seconds: number } => !!kf.fileUrl);
  if (usable.length === 0) return markdown;

  const used = new Set<number>();
  const out: string[] = [];
  for (const line of markdown.split('\n')) {
    out.push(line);
    const m = line.match(HEADING_TIME_RE);
    if (!m) continue;
    const headingSeconds = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    // 时间就近选择未使用的帧
    let best: { idx: number; dist: number; fileUrl: string } | null = null;
    for (const kf of usable) {
      if (used.has(kf.idx)) continue;
      const dist = Math.abs(kf.seconds - headingSeconds);
      if (!best || dist < best.dist) best = { idx: kf.idx, dist, fileUrl: kf.fileUrl };
    }
    if (best) {
      used.add(best.idx);
      out.push('', `![第${best.idx + 1}帧](${best.fileUrl})`);
    }
  }
  return out.join('\n');
}
