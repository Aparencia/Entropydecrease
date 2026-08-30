/**
 * domainOptions.ts — 领域标签共享常量（v0.14.1 自 RouteInfoPopover 迁出；
 * 审查修复：15 项 → 20 项与 Rust DomainKind 全量对齐——此前缺
 * cooking/photo-video/history-humanities/writing/tech-gadgets 五类，
 * 且注释"15 类同口径"为过期口径）。
 *
 * @ai-context: 与 Rust ALL_DOMAINS（video_profile_domain.rs 20 类）同源；
 *              新建组对话框、改判下拉、档案检测共用（消费方：GroupCreateDialog /
 *              RouteInfoPopover / ProfileDetector——后两者已改为 import 本常量，
 *              枚举漂移不可能再发生）。
 */
export const DOMAIN_OPTIONS: [string, string][] = [
  ["economy", "经济管理"], ["programming", "编程开发"], ["math-science", "数学理科"],
  ["language", "语言学习"], ["beauty", "化妆美妆"], ["fitness", "健身运动"],
  ["law", "法律"], ["medical", "医学健康"], ["career", "职场技能"],
  ["design", "设计创意"], ["music", "音乐"], ["handcraft", "手工"],
  ["exam", "考试考证"], ["gaming", "游戏电竞"], ["psychology", "心理成长"],
  ["cooking", "美食烹饪"], ["photo-video", "摄影视频"], ["history-humanities", "历史人文"],
  ["writing", "写作阅读"], ["tech-gadgets", "数码硬件"],
];
