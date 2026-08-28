/**
 * setup.ts — vitest 全局测试桩（v0.14 子项目 A 引入）。
 *
 * Why：CodeMirror 6 挂载时测量文本尺寸（measureTextSize）调用
 * Range#getClientRects/getBoundingClientRect，jsdom 未实现 → 测试崩溃。
 * 桩返回空几何（length 0 / 全 0 矩形），CM 视作无布局正常降级；
 * node 环境无 Range，条件守卫跳过（纯函数测试不受影响）。
 */

/** 空 DOMRectList 桩：length 0 + 可迭代 */
const emptyRectList: DOMRectList = {
  length: 0,
  item: () => null,
  [Symbol.iterator]: function* () {
    /* 空 */
  },
} as unknown as DOMRectList;

/** 全 0 矩形桩（jsdom 无法计算布局，CM 对 0 尺寸有降级路径） */
const zeroRect: DOMRect = {
  x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
  toJSON: () => ({}),
} as DOMRect;

if (typeof Range !== "undefined") {
  Range.prototype.getClientRects = () => emptyRectList;
  Range.prototype.getBoundingClientRect = () => zeroRect;
}
