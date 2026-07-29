/**
 * 新灵感飞入动画参数计算（纯函数模块）
 * @ai-context 计算新灵感从视口中心飞向群落目标位置的 CSS transform 参数。
 * 用于新建灵感后的视觉反馈——光点从中心"飞入"所属类别群落。
 * 此模块为纯函数，无副作用，可安全进行单元测试和并发调用。
 */

// ─── 类型定义 ───────────────────────────────────────────────

export interface FlyInParams {
  /** 目标 x 百分比 (0-100) */
  targetX: number;
  /** 目标 y 百分比 (0-100) */
  targetY: number;
  /** 中心 x 百分比，默认 50 */
  centerX?: number;
  /** 中心 y 百分比，默认 50 */
  centerY?: number;
  /** 动画时长 ms，默认 800 */
  duration?: number;
}

export interface FlyInResult {
  /** 起始 x 百分比（中心） */
  fromX: number;
  /** 起始 y 百分比（中心） */
  fromY: number;
  /** 目标 x 百分比 */
  toX: number;
  /** 目标 y 百分比 */
  toY: number;
  /** CSS transform translateX（从中心到目标的偏移量） */
  translateX: string;
  /** CSS transform translateY（从中心到目标的偏移量） */
  translateY: string;
  /** 动画时长 ms */
  duration: number;
  /** CSS easing 曲线 */
  easing: string;
}

// ─── 常量 ───────────────────────────────────────────────────

const DEFAULT_CENTER_X = 50;
const DEFAULT_CENTER_Y = 50;
const DEFAULT_DURATION = 800;

/**
 * 飞入动画缓动曲线
 * @ai-context cubic-bezier 模拟"先快后慢"的抛射体运动，
 * 光点从中心快速弹出，接近目标时减速归位
 */
const FLY_IN_EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

// ─── 纯函数 ─────────────────────────────────────────────────

/**
 * 计算新灵感从视口中心飞向目标位置的动画参数
 * @ai-context 输入目标坐标（百分比），输出 CSS transform 所需的 translate 偏移。
 * translateX/Y 以 vw/vh 为单位，因为光点使用百分比定位。
 *
 * @param params - 飞入动画参数
 * @returns CSS transform 动画所需的完整参数
 */
export function calculateFlyInAnimation(params: FlyInParams): FlyInResult {
  const centerX = params.centerX ?? DEFAULT_CENTER_X;
  const centerY = params.centerY ?? DEFAULT_CENTER_Y;
  const duration = params.duration ?? DEFAULT_DURATION;

  // 偏移量 = 目标 - 中心，单位为 vw/vh（与百分比定位一致）
  const offsetX = params.targetX - centerX;
  const offsetY = params.targetY - centerY;

  return {
    fromX: centerX,
    fromY: centerY,
    toX: params.targetX,
    toY: params.targetY,
    translateX: `${offsetX}vw`,
    translateY: `${offsetY}vh`,
    duration,
    easing: FLY_IN_EASING,
  };
}
