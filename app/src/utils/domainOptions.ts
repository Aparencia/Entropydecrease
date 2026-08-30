/**
 * domainOptions.ts — 领域标签共享常量（v0.14.1 自 RouteInfoPopover 迁出）。
 *
 * @ai-context: 与 Rust DomainKind 15 类同口径（commands_groups 校验 kebab-case
 *              白名单）；新建组对话框与改判下拉共用，防两处枚举漂移。
 */
export const DOMAIN_OPTIONS: [string, string][] = [
  ["economy", "经济管理"], ["programming", "编程开发"], ["math-science", "数学理科"],
  ["language", "语言学习"], ["beauty", "化妆美妆"], ["fitness", "健身运动"],
  ["law", "法律"], ["medical", "医学健康"], ["career", "职场技能"],
  ["design", "设计创意"], ["music", "音乐"], ["handcraft", "手工"],
  ["exam", "考试考证"], ["gaming", "游戏电竞"], ["psychology", "心理成长"],
];
