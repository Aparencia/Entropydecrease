/**
 * AI 使能层领域类型（自 types.ts 硬拆归位；v0.8.0 REQ-138~145，与 Rust serde 契约对齐）。
 *
 * @ai-context: 覆盖 AI 设置/余额/审计、任务中心记录、精修（diff/成本预估）
 *              与知识补充（Enrich）。密钥只报存在性，不回传明文（安全红线）。
 */

// DiffOp 定义归笔记域（避免跨域重复定义——单一定义源原则）
import type { DiffOp, VersionMeta } from "./notes";

/** AI 设置视图（Rust AiSettingsView；camelCase——密钥只报存在性，不回传明文） */
export interface AiSettingsView {
  enabled: boolean;
  authorized: boolean;
  baseUrl: string;
  model: string;
  lowBalanceThreshold: number;
  rememberCostChoice: boolean;
  /** v0.12.0 M5：精修时启用画面理解（默认关——图片随精修上传，仅视频会话生效） */
  visionRefineEnabled: boolean;
  hasKey: boolean;
  /** credential（凭据库）| env（环境变量）| none */
  keySource: string;
}

/** AI 设置保存入参（Rust AiSettings；camelCase——不含 hasKey/keySource） */
export interface AiSettingsInput {
  enabled: boolean;
  authorized: boolean;
  baseUrl: string;
  model: string;
  lowBalanceThreshold: number;
  rememberCostChoice: boolean;
}

/** 余额快照（Rust AiBalance；camelCase——total/grants/topped_up 分项） */
export interface AiBalance {
  totalBalance: number;
  grantsBalance: number;
  toppedUpBalance: number;
  currency: string;
}

/** 余额视图（Rust BalanceView；camelCase——含低余额提醒文案） */
export interface BalanceView {
  balance: AiBalance;
  lowBalanceWarning: string | null;
}

/** 审计条目（Rust AiAuditEntry；snake_case 契约——上传摘要不含原文） */
export interface AiAuditEntry {
  at_unix: number;
  upload_summary: string;
  result: string;
}

/** AI 任务记录（F2 任务中心；Rust db_ai_tasks::AiTaskRecord；camelCase 契约） */
export interface AiTaskRecord {
  taskId: number;
  /** refine | enrich */
  opType: string;
  /** 精修=会话 id、补充=笔记 id */
  refId: number;
  /** pending|running|succeeded|failed */
  state: string;
  resultJson: string | null;
  costYuan: number | null;
  elapsedMs: number | null;
  model: string | null;
  error: string | null;
  slices: number | null;
  createdAt: number;
  finishedAt: number | null;
  /** 是否已采纳落库（防重启后重复采纳） */
  adopted: boolean;
}

// ────────────────────────────────────────────────────────────
// AI 精修类型（v0.8.0 M2，REQ-141/145；Rust serde 契约）
// ────────────────────────────────────────────────────────────

/** 任务失败原因（Rust AiTaskFailure：{"unauthorized":".."|"network"|..} 外部标签） */
export type AiTaskFailure = { unauthorized: string } | { network: string } | { balance: string } | { quota: string } | { server: string } | { invalid: string } | { other: string };

/** 任务状态（Rust AiTaskState：单元变体字符串 / 结构变体对象） */
export type AiTaskState =
  | "Pending"
  | { Running: { finished_slices: number; total_slices: number } }
  | "Succeeded"
  | { Failed: { reason: AiTaskFailure } };

/** 任务句柄（Rust AiTaskHandle——camelCase 契约：taskId，2026-08-21 修复） */
export interface AiTaskHandle {
  taskId: number;
  state: AiTaskState;
}

/** 精修结果（Rust AiRefineResult——diff 预览 + 采纳落库数据源；camelCase 契约） */
export interface AiRefineResult {
  title: string;
  /** 规则基线（采纳落库时作为首快照——版本链 [rule, ai-refine]） */
  baseMarkdown: string;
  refinedMarkdown: string;
  diff: DiffOp[];
  addedLines: number;
  removedLines: number;
  slices: number;
  /** F2-B4：失败片数（>0 = 部分成功——重试后仍失败保留已成功片） */
  failedSlices: number;
  model: string;
}

/** 成本预估（Rust CostEstimate；camelCase 契约；priceKnown=false → 单价未登记警告） */
export interface CostEstimate {
  estTokens: number;
  estCostYuan: number;
  pricePer1m: number;
  /** 该模型单价是否已登记（false → 显示"费用可能不准确"警告） */
  priceKnown: boolean;
}

/** 精修成本预估视图（Rust RefineEstimateView；camelCase 契约） */
export interface RefineEstimateView {
  estimate: CostEstimate;
  rememberCostChoice: boolean;
}

// ────────────────────────────────────────────────────────────
// 精修工作台类型（v0.11.5 Task 11，spec 6️⃣）
// ────────────────────────────────────────────────────────────

/** 章节 diff 状态（Rust DiffStatus；lowercase） */
export type DiffStatus = "modified" | "added" | "removed" | "unchanged";

/** 章节级 diff 分组（Rust SectionDiff；snake_case——首次出现，勿改） */
export interface SectionDiff {
  heading: string;
  status: DiffStatus;
  removed_lines: string[];
  added_lines: string[];
}

/** diff 统计（Rust DiffStats） */
export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

/** 工作台数据（Rust WorkbenchData；camelCase） */
export interface WorkbenchData {
  ruleMarkdown: string;
  refinedMarkdown: string | null;
  sections: SectionDiff[];
  stats: DiffStats;
  meta: VersionMeta | null;
}

// ────────────────────────────────────────────────────────────
// 知识补充类型（v0.8.0 M3，REQ-142；Rust serde 契约）
// ────────────────────────────────────────────────────────────

/** 补充子项（Rust AiEnrichKind；kebab-case——d1~d3 深度/b1~b6 广度） */
export type EnrichKind = "d1" | "d2" | "d3" | "b1" | "b2" | "b3" | "b4" | "b5" | "b6";

/** 补充结果（Rust AiEnrichResult——混合落位 markdown + base 供撤销；camelCase） */
export interface AiEnrichResult {
  noteId: number;
  baseMarkdown: string;
  enrichedMarkdown: string;
  blocks: number;
  depthBlocks: number;
  breadthBlocks: number;
  slices: number;
  kinds: string[];
  model: string;
}

// ────────────────────────────────────────────────────────────
// AI Provider 类型（v0.11.6 M1；Rust serde 契约）
// ────────────────────────────────────────────────────────────

/** Provider 类型（Rust ProviderKind kebab→camel 映射） */
export type ProviderKind = "openAiCompat" | "ollama";

/** Provider 视图（Rust AiProviderView；密钥只报存在性，不回传明文） */
export interface AiProviderView {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  models: string[];
  defaultModel: string;
  enabled: boolean;
  fallbackOrder: string[];
  hasKey: boolean;
  keySource: string;
  isDefault: boolean;
}

/** Provider 创建/更新入参（Rust AiProviderInput；apiKey 可选=更新留空不改） */
export interface AiProviderInput {
  id?: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  models: string[];
  defaultModel: string;
  enabled: boolean;
  fallbackOrder: string[];
  apiKey?: string;
}
