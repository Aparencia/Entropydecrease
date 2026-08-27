// @ai-context
// 六大认知模块共享数据：首页星图与功能总览页的单一数据源。
// Shared module registry for homepage and features overview.
// Why: 两页此前各自维护六模块数组导致字段漂移（首页指向 /features、总览页指向 /download），提取后一处维护。

export interface FeatureModule {
  name: string;
  origin: string;
  desc: string;
  color: string;
  /**
   * 详情页路径。
   * 首页直接用 href（已上线模块指详情页，未上线模块指 /features 总览页）；
   * 总览页自身在渲染时覆盖未上线模块为 /download，引导下载。
   */
  href: string;
  /** 详情页是否已上线 */
  ready: boolean;
}

export const MODULES: FeatureModule[] = [
  { name: "深潜", origin: "番茄钟", desc: "切断海面噪音，潜入零干扰的心流深海。", color: "var(--kb-focus-blue)", href: "/features/dive", ready: true },
  { name: "结礁", origin: "智能笔记", desc: "将漂浮的碎片，沉淀为坚实的认知暗礁。", color: "var(--kb-brand-400)", href: "/features", ready: false },
  { name: "回声定位", origin: "课堂助手", desc: "捕捉深海回声，打捞暗流中的知识暗物质。", color: "var(--kb-cyber-cyan)", href: "/features", ready: false },
  { name: "反衰减呼吸", origin: "闪卡复习", desc: "规律吐纳，让记忆在深海高压下依然鲜活。", color: "var(--kb-moss-green)", href: "/features", ready: false },
  { name: "浮出水面", origin: "费曼学习法", desc: "向世界呼出你的理解。雾散了，轮廓就清晰了。", color: "var(--kb-amber)", href: "/features", ready: false },
  { name: "萤火海沟", origin: "灵感空间", desc: "安放微光，它们终将照亮整片深域。", color: "var(--kb-accent-400)", href: "/features", ready: false },
];