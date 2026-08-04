/**
 * SOP 业务层 — Zustand store（模板 CRUD + 执行状态机）
 * SOP business layer — store with template CRUD and run state machine
 *
 * @ai-context: 状态机迁移：running →(逐步推进)→ completed｜aborted；
 * 当前步骤为 module 时用户跳转模块置 awaiting_module，返回后继续推进。
 * step_progress 为 { stepId: { status, finished_at } } 映射，落库 JSON。
 * 所有操作经 sopRepository（db IPC），IPC 不可用时静默降级。
 * @ai-context: Run state machine drives step advancement; progress map is
 * persisted as JSON via the repository. All mutations degrade silently
 * when the db IPC bridge is unavailable.
 */
import { create } from 'zustand';
import * as repo from '../lib/sopRepository';
import type { SopRunRow, SopStep, SopTemplate } from '../types';
import { parseStepProgress } from '../types';

export interface SopState {
  /** null = 尚未加载；[] = 已加载但为空 */
  templates: SopTemplate[] | null;
  runs: SopRunRow[] | null;
  isLoading: boolean;
  error: string | null;

  /** 加载模板+执行记录，并确保内置模板种子已写入 */
  loadAll: () => Promise<void>;
  /** 新建模板（含步骤），成功后刷新列表 */
  createTemplate: (input: Parameters<typeof repo.createTemplate>[0]) => Promise<string | undefined>;
  /** 更新模板（含步骤重建） */
  updateTemplate: (id: string, input: Parameters<typeof repo.updateTemplate>[1]) => Promise<boolean>;
  /** 删除模板 */
  deleteTemplate: (id: string) => Promise<boolean>;
  /** 从模板开始一次执行，返回 runId */
  startRun: (templateId: string) => Promise<string | undefined>;
  /** 标记当前步骤完成/跳过并推进；最后一步完成后自动置 completed */
  completeStep: (runId: string, stepId: string, skip?: boolean) => Promise<void>;
  /** 模块步骤跳转时置 awaiting_module（等待用户从模块返回） */
  setModuleAwaiting: (runId: string) => Promise<void>;
  /** 中止执行 */
  abortRun: (runId: string) => Promise<void>;

  /** 便捷 getter：run + 模板组合视图 */
  getRunView: (runId: string) => { run: SopRunRow; template: SopTemplate } | null;
  /** 便捷 getter：单模板 */
  getTemplate: (templateId: string) => SopTemplate | undefined;
}

export const useSopStore = create<SopState>((set, get) => ({
  templates: null,
  runs: null,
  isLoading: false,
  error: null,

  loadAll: async () => {
    set({ isLoading: true });
    try {
      await repo.ensureBuiltinTemplates();
      const [templates, runs] = await Promise.all([repo.listTemplates(), repo.listRuns()]);
      set({ templates, runs, isLoading: false, error: null });
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  createTemplate: async (input) => {
    const id = await repo.createTemplate(input);
    if (id) await get().loadAll();
    return id;
  },

  updateTemplate: async (id, input) => {
    const ok = await repo.updateTemplate(id, input);
    if (ok) await get().loadAll();
    return ok;
  },

  deleteTemplate: async (id) => {
    const ok = await repo.deleteTemplate(id);
    if (ok) await get().loadAll();
    return ok;
  },

  startRun: async (templateId) => {
    const runId = await repo.createRun(templateId);
    if (runId) await get().loadAll();
    return runId;
  },

  completeStep: async (runId, stepId, skip = false) => {
    const run = get().runs?.find((r) => r.id === runId);
    if (!run) return;
    const progress = parseStepProgress(run.step_progress);
    const template = get().templates?.find((t) => t.id === run.template_id);
    const steps = template?.steps ?? [];
    const stepIndex = steps.findIndex((s) => s.id === stepId);
    if (stepIndex < 0) return;

    progress[stepId] = { status: skip ? 'skipped' : 'done', finished_at: new Date().toISOString() };
    const isLast = stepIndex === steps.length - 1;
    const changes: Partial<Pick<SopRunRow, 'status' | 'current_step_index' | 'step_progress' | 'finished_at'>> = {
      step_progress: JSON.stringify(progress),
    };
    if (isLast) {
      changes.status = 'completed';
      changes.finished_at = new Date().toISOString();
    } else {
      changes.current_step_index = stepIndex + 1;
    }
    const ok = await repo.updateRun(runId, changes);
    if (ok) await get().loadAll();
    // R9 SOP 首跑成就：最后一步完成且落库成功后触发（动态 import 避免循环依赖）
    if (ok && isLast) {
      import('@/lib/achievements/evaluator').then(({ checkAchievements }) => {
        checkAchievements({ type: 'sop_completed' }).then((unlocked) => {
          unlocked.forEach(a => {
            window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: a }));
          });
        }).catch(() => {});
      }).catch(() => {});
    }
  },

  setModuleAwaiting: async (runId) => {
    const ok = await repo.updateRun(runId, { status: 'awaiting_module' });
    if (ok) await get().loadAll();
  },

  abortRun: async (runId) => {
    const ok = await repo.updateRun(runId, { status: 'aborted', finished_at: new Date().toISOString() });
    if (ok) await get().loadAll();
  },

  getRunView: (runId) => {
    const run = get().runs?.find((r) => r.id === runId) ?? null;
    if (!run) return null;
    const template = get().templates?.find((t) => t.id === run.template_id);
    if (!template) return null;
    return { run, template };
  },

  getTemplate: (templateId) => get().templates?.find((t) => t.id === templateId),
}));

/** 导出步骤类型元信息（供 UI 渲染标签与配色） */
export const STEP_TYPE_META: Record<SopStep['step_type'], { label: string; badge: string }> = {
  focus: { label: '专注', badge: 'bg-blue-500/15 text-blue-400' },
  review: { label: '回顾', badge: 'bg-emerald-500/15 text-emerald-400' },
  break: { label: '休息', badge: 'bg-amber-500/15 text-amber-400' },
  module: { label: '跳转', badge: 'bg-violet-500/15 text-violet-400' },
  output: { label: '产出', badge: 'bg-rose-500/15 text-rose-400' },
};
