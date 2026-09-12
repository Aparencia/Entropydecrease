/**
 * @ai-context 全站断点的**单一真源**（规格 §1 决策 16「断点 1024/1100/1180」+ §6.2 阈值口径）。
 *
 * Why 收成一处：今日同一个「窄窗自动折叠」概念在 6 个调用点写成了 3 个不同的数
 *   （860 出现 4 次、700 一次、1100 一次），且**没有一处能从数字反推出理由**。
 *   规格 §6.2 给了推导规则：「按折叠后正文是否仍 ≥520px 反推」——
 *   三列页 1024 · 两列页 1100 · 大纲列 1280。本模块把规则与数字放在一起。
 *
 * 口径：这些值是 `window.innerWidth` 的**下限**（视口宽 ≥ 该值时不折叠）；
 *   比较一律用严格小于（见 useColumnLayout: `window.innerWidth < autoFoldBelow` ⇒ 折叠）。
 *   ⇒ 写下 1100 的含义是「1099 折叠、1100 不折叠」。
 *
 * 副作用：无（纯数据）。
 * 边界：本模块**不**含 1180 之外的导航档位算术；顶栏的档位判定在 T7 的 TopBar 里，
 *   但它必须引用本模块的 `nav` / `navFull`，不得另写数字。
 */
export const BREAKPOINTS = {
  /** 导航下限 = 最小窗宽（规格 §6.1「<1024 由最小窗兜底」） */
  nav: 1024,
  /** 导航满档：≥1180 图标+文字，1024–1180 仅图标（规格 §6.1 溢出两级） */
  navFull: 1180,
  /** 两列页的自动折叠阈值（课堂源列 / 会话列表 / 体系左列 / 目标左列 / AI 侧栏） */
  twoCol: 1100,
  /** 三列页的自动折叠阈值（笔记组列 + 列表列） */
  threeCol: 1024,
  /** 大纲列（笔记第三列）：最晚折叠（规格 §6.2「大纲列 1280」） */
  outlineCol: 1280,
} as const;

export type BreakpointKind = keyof typeof BREAKPOINTS;

/** 取阈值的唯一入口（写 `BREAKPOINTS.twoCol` 也可，但走函数便于将来加权/改写） */
export function breakpointFor(kind: BreakpointKind): number {
  return BREAKPOINTS[kind];
}
