// @ai-context
// 功能页内容配置类型：所有功能页共享同一结构，新增功能仅需实现该接口。
// Feature config types: shared schema for all feature landing pages.
// 纯类型文件，无运行时逻辑，不需要 "use client" 指令。

export interface FeatureMechanicsItem {
  /** 标识字段：用于回查原始数据源（如 ChronosState），避免索引耦合 */
  key?: string;
  name: string;
  icon: string;
  desc: string;
}

export interface FeatureSceneItem {
  name: string;
  rhythm: string;
  story: string;
}

export interface FeatureConfig {
  slug: string;
  name: string;
  origin: string;
  tagline: string;
  hero: { title: string; subtitle: string };
  mechanics: { title: string; hint?: string; items: FeatureMechanicsItem[] };
  scenes: { title: string; items: FeatureSceneItem[] };
  outcome: { title: string; desc: string };
  science: { title: string; points: string[] };
  cta: { text: string };
}
