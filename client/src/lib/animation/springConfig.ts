/**
 * 物理弹簧动效配置
 *
 * @ai-context: stiffness/damping 数值源自《颜色与风格简析》动效节奏规范，
 * 与 BEAT 节拍常量联动构成全局动效体系；所有动画必须可中断（spring 类型天然可中断）。
 * 修改参数会全局改变应用手感，需设计侧确认。
 */
export const SPRING = {
  default: { type: 'spring' as const, stiffness: 300, damping: 28 },
  bouncy: { type: 'spring' as const, stiffness: 400, damping: 20 },
  gentle: { type: 'spring' as const, stiffness: 200, damping: 35 },
  stiff: { type: 'spring' as const, stiffness: 500, damping: 35 },
} as const;

/** 节拍时长常量 (ms) */
export const BEAT = {
  xs: 60,
  normal: 120,
  x2: 240,
  x3: 360,
  x5: 600,
} as const;

/** 3D透视配置 */
export const PERSPECTIVE = {
  base: 1200,
  zNear: 50,
  zFar: -200,
} as const;

/** 标准过渡变体 */
export const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: SPRING.default },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: SPRING.default },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
};

/** 3D翻转变体（闪卡等） */
export const flip3D = {
  front: { rotateY: 0, transition: SPRING.bouncy },
  back: { rotateY: 180, transition: SPRING.bouncy },
};
