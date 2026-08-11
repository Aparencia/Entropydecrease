/**
 * 灵感星座布局纯函数模块
 * @ai-context 将灵感数组映射为沉浸式视图中的光点布局坐标。
 * 按 content_nature 划分为4个深度区域，模拟深海不同水层的生物群落分布。
 * 此模块为纯函数，无副作用，可安全进行单元测试和并发调用。
 */

// ─── 类型定义 ───────────────────────────────────────────────

export interface ConstellationLayoutPoint {
  id: string;
  /** 百分比 0-100 */
  x: number;
  /** 百分比 0-100 */
  y: number;
  /** 像素 4-8 */
  size: number;
  shape: 'square' | 'diamond' | 'circle' | 'triangle';
  /** rgba 色值 */
  color: string;
  /** 呼吸脉动周期（秒） */
  breatheDuration: number;
  sortStatus?: string;
}

export interface LayoutOptions {
  /** 中心排除区域（百分比坐标），落在此区域的光点会被重新分配到边缘 */
  centerExclusion?: { xStart: number; xEnd: number; yStart: number; yEnd: number };
  /** 每个类别最多渲染数量，用于降级（L1: 5） */
  maxPerCategory?: number;
}

/** 灵感输入数据的最小接口 */
interface InspirationInput {
  id: string;
  tags: {
    content_nature: string;
    cognitive_depth: string;
    subject?: string;
  };
  sortStatus?: string;
}

// ─── 常量映射 ───────────────────────────────────────────────

/**
 * 深度区域划分（占视口高度百分比）
 * @ai-context 模拟深海水层：concept 在海面附近，todo 在海底附近
 * 区域间保留 3% 空白带作为视觉呼吸空间
 */
const ZONE_RANGES: Record<string, { yMin: number; yMax: number }> = {
  concept:     { yMin: 5,  yMax: 25 },
  inspiration: { yMin: 28, yMax: 52 },
  question:    { yMin: 55, yMax: 75 },
  todo:        { yMin: 78, yMax: 95 },
};

/** 类别顺序（用于空类别空间释放时的相邻查找） */
const ZONE_ORDER = ['concept', 'inspiration', 'question', 'todo'] as const;

/** content_nature → 形状映射 */
const NATURE_SHAPES: Record<string, ConstellationLayoutPoint['shape']> = {
  concept: 'square',
  question: 'diamond',
  inspiration: 'circle',
  todo: 'triangle',
};

/**
 * content_nature → rgba 颜色映射
 * @ai-context 蓝=概念，紫=灵感，橙=疑问，绿=待办，与深海生物发光色系对应
 */
const NATURE_COLORS: Record<string, string> = {
  concept: 'rgba(74, 155, 217, 0.6)',
  question: 'rgba(249, 115, 22, 0.6)',
  inspiration: 'rgba(168, 85, 247, 0.6)',
  todo: 'rgba(34, 197, 94, 0.6)',
};

/** cognitive_depth → 光点尺寸（像素） */
const DEPTH_SIZES: Record<string, number> = {
  shallow: 4,
  understanding: 6,
  application: 8,
};

/** cognitive_depth → 呼吸脉动周期（秒） */
const DEPTH_DURATIONS: Record<string, number> = {
  shallow: 8,
  understanding: 5,
  application: 3,
};

/** 同区域光点超过此阈值时自动缩小 x 散布范围，避免视觉重叠 */
const DENSITY_THRESHOLD = 15;

/** x 坐标默认散布范围（百分比），高密度时收缩 */
const X_SPREAD_MIN = 5;
const X_SPREAD_MAX = 95;
const X_SPREAD_DENSE_MIN = 15;
const X_SPREAD_DENSE_MAX = 85;

// ─── 确定性伪随机 ──────────────────────────────────────────
/**
 * 基于字符串 id 生成确定性伪随机数 [0, 1)
 * @ai-context 同一 id 每次计算结果相同，保证布局稳定性
 */
function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * 确定性伪随机（与 DeepSeaAmbient 相同算法）
 */
function seeded(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

// ─── 空间释放 ────────────────────────────────────────────
/**
 * 计算实际 y 范围：空类别释放空间给相邻类别
 * @ai-context 当某个类别无灵感数据时，其占据的 y 区间按比例分配给上下相邻的非空类别
 */
function resolveZoneRanges(
  grouped: Record<string, InspirationInput[]>,
): Record<string, { yMin: number; yMax: number }> {
  const result: Record<string, { yMin: number; yMax: number }> = {};

  // 统计各类别是否有数据
  const nonEmpty = ZONE_ORDER.filter((k) => (grouped[k]?.length ?? 0) > 0);

  if (nonEmpty.length === 0) return result;

  // 收集所有空类别的区间跨度
  let totalEmptySpan = 0;
  for (const key of ZONE_ORDER) {
    if ((grouped[key]?.length ?? 0) === 0) {
      const range = ZONE_RANGES[key];
      totalEmptySpan += range.yMax - range.yMin;
    }
  }

  // 将空区间平均分配给非空类别
  const bonus = nonEmpty.length > 0 ? totalEmptySpan / nonEmpty.length : 0;

  for (const key of nonEmpty) {
    const base = ZONE_RANGES[key];
    result[key] = {
      yMin: base.yMin - bonus / 2,
      yMax: base.yMax + bonus / 2,
    };
  }

  // 边界夹紧
  for (const key of nonEmpty) {
    result[key].yMin = Math.max(2, result[key].yMin);
    result[key].yMax = Math.min(98, result[key].yMax);
  }

  return result;
}

// ─── 中心排除 ────────────────────────────────────────────
/**
 * 检查坐标是否在中心排除区域内
 */
function isInCenterExclusion(
  x: number,
  y: number,
  exclusion: LayoutOptions['centerExclusion'],
): boolean {
  if (!exclusion) return false;
  return (
    x >= exclusion.xStart &&
    x <= exclusion.xEnd &&
    y >= exclusion.yStart &&
    y <= exclusion.yEnd
  );
}

/**
 * 将落在中心排除区的光点重新分配到区域边缘
 * @ai-context 为中心创作区留出视觉空间，光点被推到左右两侧
 */
function redistributeFromCenter(
  x: number,
  y: number,
  seed: number,
  exclusion: NonNullable<LayoutOptions['centerExclusion']>,
): number {
  // 随机推到左侧或右侧边缘
  const goLeft = seeded(seed * 41 + 19) > 0.5;
  if (goLeft) {
    // 散布在 [5%, exclusion.xStart - 2%]
    return X_SPREAD_MIN + seeded(seed * 43 + 23) * (exclusion.xStart - X_SPREAD_MIN - 2);
  }
  // 散布在 [exclusion.xEnd + 2%, 95%]
  return exclusion.xEnd + 2 + seeded(seed * 47 + 29) * (X_SPREAD_MAX - exclusion.xEnd - 2);
}

// ─── 主入口 ─────────────────────────────────────────────

/**
 * 将灵感数组映射为沉浸式视图中的光点布局坐标
 * @ai-context 按 content_nature 划分为4个深度区域，模拟深海生物群落分布。
 * 纯函数，可安全进行单元测试和并发调用。
 *
 * @param inspirations - 灵感数据数组
 * @param options - 布局选项（中心排除区、降级限制）
 * @returns 光点布局坐标数组
 */
export function calculateConstellationLayout(
  inspirations: InspirationInput[],
  options?: LayoutOptions,
): ConstellationLayoutPoint[] {
  if (inspirations.length === 0) return [];

  // 1. 按 content_nature 分组
  const grouped: Record<string, InspirationInput[]> = {};
  for (const item of inspirations) {
    const nature = item.tags.content_nature;
    if (!grouped[nature]) grouped[nature] = [];
    grouped[nature].push(item);
  }

  // 2. 应用 maxPerCategory 降级截断
  if (options?.maxPerCategory) {
    for (const key of Object.keys(grouped)) {
      if (grouped[key].length > options.maxPerCategory) {
        grouped[key] = grouped[key].slice(0, options.maxPerCategory);
      }
    }
  }

  // 3. 计算实际 y 范围（空类别释放空间）
  const ranges = resolveZoneRanges(grouped);

  // 4. 逐类别生成光点
  const points: ConstellationLayoutPoint[] = [];

  for (const nature of ZONE_ORDER) {
    const items = grouped[nature];
    if (!items || items.length === 0) continue;

    const range = ranges[nature];
    if (!range) continue;

    // 密度控制：超过阈值时收缩 x 散布范围
    const dense = items.length > DENSITY_THRESHOLD;
    const xMin = dense ? X_SPREAD_DENSE_MIN : X_SPREAD_MIN;
    const xMax = dense ? X_SPREAD_DENSE_MAX : X_SPREAD_MAX;
    const xSpan = xMax - xMin;

    const ySpan = range.yMax - range.yMin;
    const shape = NATURE_SHAPES[nature] ?? 'circle';
    const color = NATURE_COLORS[nature] ?? 'rgba(168, 85, 247, 0.6)';

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const baseSeed = hashId(item.id);

      // x 坐标：seeded 伪随机，范围由密度控制
      let x = xMin + seeded(baseSeed * 7 + 3) * xSpan;

      // y 坐标：在类别范围内随机偏移（±5%）
      const yCenter = range.yMin + ySpan * ((i + 0.5) / items.length);
      const yOffset = (seeded(baseSeed * 13 + 5) - 0.5) * 10; // ±5%
      let y = Math.max(2, Math.min(98, yCenter + yOffset));

      // 中心排除：将落在中心区域的光点重新分配到边缘
      if (options?.centerExclusion && isInCenterExclusion(x, y, options.centerExclusion)) {
        x = redistributeFromCenter(x, y, baseSeed, options.centerExclusion);
      }

      // size 基于 cognitive_depth
      const size = DEPTH_SIZES[item.tags.cognitive_depth] ?? 6;

      // breatheDuration 基于 cognitive_depth
      const breatheDuration = DEPTH_DURATIONS[item.tags.cognitive_depth] ?? 6;

      points.push({
        id: item.id,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        size,
        shape,
        color,
        breatheDuration,
        sortStatus: item.sortStatus,
      });
    }
  }

  return points;
}
