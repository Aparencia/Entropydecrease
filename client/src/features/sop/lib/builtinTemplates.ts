/**
 * SOP 内置模板种子 — 首次启动幂等写入
 * Built-in SOP template seeds — idempotently written on first launch
 *
 * @ai-context: source='builtin' 的只读模板。ensureBuiltinTemplates 按 id
 * 检测缺失后批量写入（含 steps），重复调用不产生重复数据；builtin 模板
 * 在 UI 上禁止编辑/删除（仅可复制为 user 模板）。
 * @ai-context: Read-only builtin templates; seeding is idempotent by id.
 * Builtins are immutable in UI (copy-to-user instead of edit/delete).
 */
import type { SopStepType } from '../types';

/** 内置模板种子定义（steps 用宽松结构，写入时补 id/order） */
export interface BuiltinTemplateSeed {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  steps: Array<{
    step_type: SopStepType;
    title: string;
    durationMinutes?: number;
    target?: string;
    module?: string;
  }>;
}

/** 2-3 个内置模板：费曼讲解 / 番茄工作法 / 错题复盘 */
export const BUILTIN_TEMPLATES: BuiltinTemplateSeed[] = [
  {
    id: 'sop-feynman-five',
    name: '费曼讲解五步',
    description: '把概念讲到别人能听懂——讲解、找缺口、补、再讲',
    icon: '🧠',
    category: '费曼学习法',
    steps: [
      { step_type: 'focus', title: '选择概念并写目标', durationMinutes: 3 },
      { step_type: 'output', title: '完整讲解一遍（录音）', durationMinutes: 15 },
      { step_type: 'review', title: '回放找出薄弱点', durationMinutes: 5 },
      { step_type: 'focus', title: '回炉补缺（查资料/重读）', durationMinutes: 10 },
      { step_type: 'output', title: '简化重讲直到无缺口', durationMinutes: 10 },
    ],
  },
  {
    id: 'sop-pomodoro-cycle',
    name: '番茄工作法',
    description: '25 分钟专注 + 5 分钟休息，四轮后长休',
    icon: '🍅',
    category: '专注节奏',
    steps: [
      { step_type: 'focus', title: '专注第 1 轮', durationMinutes: 25 },
      { step_type: 'break', title: '休息 5 分钟', durationMinutes: 5 },
      { step_type: 'focus', title: '专注第 2 轮', durationMinutes: 25 },
      { step_type: 'break', title: '休息 5 分钟', durationMinutes: 5 },
      { step_type: 'focus', title: '专注第 3 轮', durationMinutes: 25 },
      { step_type: 'break', title: '休息 5 分钟', durationMinutes: 5 },
      { step_type: 'focus', title: '专注第 4 轮', durationMinutes: 25 },
      { step_type: 'break', title: '长休息 15 分钟', durationMinutes: 15 },
    ],
  },
  {
    id: 'sop-error-replay',
    name: '错题复盘',
    description: '错题 → 重做 → 提炼规则 → 沉淀为闪卡',
    icon: '🎯',
    category: '错题管理',
    steps: [
      { step_type: 'review', title: '回顾错题与当时的思路', durationMinutes: 5 },
      { step_type: 'output', title: '不看答案重做一遍', durationMinutes: 10 },
      { step_type: 'focus', title: '对比答案，提炼错误规则', durationMinutes: 8 },
      { step_type: 'module', title: '生成闪卡到复习队列', durationMinutes: 5, target: '/flashcards', module: '闪卡' },
    ],
  },
];
