/**
 * SOP 模板 lint 规则 — 编辑器实时提示（纯函数，无副作用）
 * SOP template lint rules — pure-function editor feedback
 *
 * @ai-context: 5 条规则：no-break-long（休息过长）/ no-review（无回顾步骤）/
 * too-many-steps（步骤过多）/ no-output（无产出步骤）/ short-total（总时长过短）。
 * 每条规则返回 { rule, severity, message }；severity 区分 warn（建议）与
 * error（必须修正），编辑器据此展示黄/红提示。
 * @ai-context: Five rules checked against a draft template; severity drives
 * warning vs error styling in the editor.
 */
import type { SopTemplate } from '../types';
import { templateTotalMinutes } from '../types';

export interface SopLintIssue {
  /** 规则标识，前端据此去重与渲染图标 */
  rule: 'no-break-long' | 'no-review' | 'too-many-steps' | 'no-output' | 'short-total';
  severity: 'warn' | 'error';
  message: string;
}

/** 休息步骤单步时长上限（分钟）——超过视为"长休息"风险 */
const MAX_BREAK_MINUTES = 30;

/** 步骤总数上限——超过视为过载流程 */
const MAX_STEPS = 12;

/** 总时长下限（分钟）——低于视为不足以形成有效流程 */
const MIN_TOTAL_MINUTES = 10;

/**
 * 对模板草稿执行全部 lint 规则。
 * @param draft 编辑器中的未持久化模板（steps 为原始行，config 可为 '{}'）
 * @returns 问题列表（空数组 = 通过）
 */
export function lintSopTemplate(draft: Pick<SopTemplate, 'steps'>): SopLintIssue[] {
  const issues: SopLintIssue[] = [];
  const steps = draft.steps;

  if (steps.length === 0) {
    issues.push({
      rule: 'too-many-steps',
      severity: 'error',
      message: '流程还没有任何步骤——请至少添加一个步骤',
    });
    return issues;
  }

  // no-break-long：任一休息步骤超过上限
  const longBreak = steps.find((s) => s.step_type === 'break' && (s.configParsed.durationMinutes ?? 0) > MAX_BREAK_MINUTES);
  if (longBreak) {
    issues.push({
      rule: 'no-break-long',
      severity: 'warn',
      message: `「${longBreak.title}」休息 ${longBreak.configParsed.durationMinutes} 分钟过长，建议 ≤${MAX_BREAK_MINUTES} 分钟`,
    });
  }

  // no-review：流程无回顾/复习步骤（跨模块跳转复习不计入）
  if (!steps.some((s) => s.step_type === 'review')) {
    issues.push({
      rule: 'no-review',
      severity: 'warn',
      message: '流程中没有回顾（review）步骤——缺少巩固环节，建议添加',
    });
  }

  // too-many-steps：步骤过多
  if (steps.length > MAX_STEPS) {
    issues.push({
      rule: 'too-many-steps',
      severity: 'warn',
      message: `步骤数 ${steps.length} 超过 ${MAX_STEPS}，长流程难以坚持，建议拆分`,
    });
  }

  // no-output：无产出步骤（focus 含产出物描述不视为 output）
  if (!steps.some((s) => s.step_type === 'output')) {
    issues.push({
      rule: 'no-output',
      severity: 'warn',
      message: '流程中没有产出（output）步骤——结束时缺少可见成果，建议添加',
    });
  }

  // short-total：总时长过短
  const total = templateTotalMinutes({ steps });
  if (total > 0 && total < MIN_TOTAL_MINUTES) {
    issues.push({
      rule: 'short-total',
      severity: 'warn',
      message: `总时长仅 ${total} 分钟，低于 ${MIN_TOTAL_MINUTES} 分钟，建议延长`,
    });
  }

  return issues;
}
