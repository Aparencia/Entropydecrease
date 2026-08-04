/**
 * SOP 标准作业流程 — 原子层类型定义（单一事实来源）
 * SOP atomic types — single source of truth for domain models
 *
 * @ai-context: 与 schema v9 三表（sop_templates / sop_steps / sop_runs）字段
 * 一一对应，snake_case 直通 db IPC。config 与 step_progress 在 SQLite 中为
 * JSON 字符串，渲染层经 parse/stringify 工具转换；状态机仅允许 schema
 * CHECK 约束内的四态（running / awaiting_module / completed / aborted）。
 * @ai-context: Mirrors schema v9 tables 1:1; config/step_progress are JSON
 * strings in SQLite converted via helpers; run status is restricted to the
 * four CHECK-enforced states.
 */

/** 步骤类型——lint 规则与执行器渲染均依赖此枚举 */
export type SopStepType = 'focus' | 'review' | 'break' | 'module' | 'output';

/** 步骤配置（config 列的 JSON 解析结果） */
export interface SopStepConfig {
  /** 预期时长（分钟），lint 与执行器进度条共用 */
  durationMinutes?: number;
  /** 跨模块跳转目标路由（如 '/feynman/session'），仅 module 步骤使用 */
  target?: string;
  /** 目标模块名（人类可读，如「费曼」），仅 module 步骤使用 */
  module?: string;
}

/** 模板行（sop_templates） */
export interface SopTemplateRow {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  /** builtin=内置模板（只读种子），user=用户自建 */
  source: 'builtin' | 'user';
  created_at: string;
  updated_at: string;
}

/** 步骤行（sop_steps） */
export interface SopStepRow {
  id: string;
  template_id: string;
  step_type: SopStepType;
  title: string;
  /** JSON 字符串，经 parseStepConfig 解析 */
  config: string;
  order: number;
}

/** 执行记录行（sop_runs）——status 严格受 schema CHECK 约束 */
export interface SopRunRow {
  id: string;
  template_id: string;
  status: 'running' | 'awaiting_module' | 'completed' | 'aborted';
  current_step_index: number;
  /** JSON 字符串，经 parseStepProgress 解析 */
  step_progress: string;
  started_at: string;
  finished_at: string | null;
}

/** 渲染层组合视图：模板 + 其步骤列表 */
export interface SopTemplate extends SopTemplateRow {
  steps: SopStep[];
}

/** 渲染层步骤视图：行 + 解析后的 config */
export interface SopStep extends SopStepRow {
  configParsed: SopStepConfig;
}

/** 单步完成记录（step_progress JSON 值） */
export interface StepProgressEntry {
  status: 'done' | 'skipped';
  finished_at: string;
}

export type StepProgressMap = Record<string, StepProgressEntry>;

// ── JSON 编解码工具（与 db 层字符串字段互转）──────────────────

/** 解析步骤 config JSON，失败回退空对象 */
export function parseStepConfig(raw: string | undefined | null): SopStepConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as SopStepConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** 解析执行进度 JSON，失败回退空映射 */
export function parseStepProgress(raw: string | undefined | null): StepProgressMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as StepProgressMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** 行 → 渲染视图（附加解析后的 config） */
export function toSopStep(row: SopStepRow): SopStep {
  return { ...row, configParsed: parseStepConfig(row.config) };
}

/** 模板总预期时长（分钟），无时长步骤不计入 */
export function templateTotalMinutes(template: Pick<SopTemplate, 'steps'>): number {
  return template.steps.reduce((sum, s) => sum + (s.configParsed.durationMinutes ?? 0), 0);
}
