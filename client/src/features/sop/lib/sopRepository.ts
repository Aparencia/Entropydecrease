/**
 * SOP 数据访问层 — 渲染进程经通用 db IPC 访问三表
 * SOP repository — thin db IPC bridge for the three v9 tables
 *
 * @ai-context: 全部走 window.electronAPI.db 白名单通道（sopTemplates /
 * sopSteps / sopRuns 已登记）。非 Electron 环境或 IPC 失败时静默降级
 * （返回空数组/undefined），UI 不阻塞。批量写（种子/步骤重建）用
 * db:batch 单事务原子提交；sop_steps 外键 ON DELETE CASCADE，删模板
 * 自动清理步骤。
 * @ai-context: All access via the whitelisted db IPC bridge; every method
 * degrades silently outside Electron so SOP UI never breaks. Multi-row
 * writes use transactional db:batch; template delete cascades to steps.
 */
import { BUILTIN_TEMPLATES } from './builtinTemplates';
import type { SopRunRow, SopStepRow, SopTemplate, SopTemplateRow, SopStepConfig } from '../types';
import { toSopStep } from '../types';

const T_TEMPLATES = 'sopTemplates';
const T_STEPS = 'sopSteps';
const T_RUNS = 'sopRuns';

function getApi(): typeof window.electronAPI | undefined {
  return window.electronAPI;
}

/** 组装模板 + 步骤的组合视图 */
function composeTemplates(rows: SopTemplateRow[], stepRows: SopStepRow[]): SopTemplate[] {
  const byTemplate = new Map<string, SopStepRow[]>();
  for (const s of stepRows) {
    const list = byTemplate.get(s.template_id) ?? [];
    list.push(s);
    byTemplate.set(s.template_id, list);
  }
  return rows
    .map((t) => ({
      ...t,
      steps: (byTemplate.get(t.id) ?? [])
        .sort((a, b) => a.order - b.order)
        .map(toSopStep),
    }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/** 读取全部模板（含步骤） */
export async function listTemplates(): Promise<SopTemplate[]> {
  const api = getApi();
  if (!api) return [];
  try {
    const [rows, stepRows] = await Promise.all([
      api.db.query<SopTemplateRow[]>(T_TEMPLATES, 'getAll'),
      api.db.query<SopStepRow[]>(T_STEPS, 'getAll'),
    ]);
    return composeTemplates(rows ?? [], stepRows ?? []);
  } catch {
    return [];
  }
}

/** 读取单个模板（含步骤） */
export async function getTemplate(id: string): Promise<SopTemplate | undefined> {
  const api = getApi();
  if (!api) return undefined;
  try {
    const [row, stepRows] = await Promise.all([
      api.db.query<SopTemplateRow | undefined>(T_TEMPLATES, 'getById', [id]),
      api.db.query<SopStepRow[]>(T_STEPS, 'getAll'),
    ]);
    if (!row) return undefined;
    return composeTemplates([row], (stepRows ?? []).filter((s) => s.template_id === id))[0];
  } catch {
    return undefined;
  }
}

/** 写入内置模板种子（幂等：按 id 检测缺失后批量写入） */
export async function ensureBuiltinTemplates(): Promise<void> {
  const api = getApi();
  if (!api) return;
  try {
    const existing = await api.db.query<SopTemplateRow[]>(T_TEMPLATES, 'getAll');
    const existingIds = new Set((existing ?? []).map((t) => t.id));
    const missing = BUILTIN_TEMPLATES.filter((t) => !existingIds.has(t.id));
    if (missing.length === 0) return;

    const now = new Date().toISOString();
    const ops: Array<Record<string, unknown>> = [];
    for (const seed of missing) {
      ops.push({
        type: 'create',
        table: T_TEMPLATES,
        item: {
          id: seed.id,
          name: seed.name,
          description: seed.description,
          icon: seed.icon,
          category: seed.category,
          source: 'builtin',
          created_at: now,
          updated_at: now,
        },
      });
      seed.steps.forEach((s, i) => {
        ops.push({
          type: 'create',
          table: T_STEPS,
          item: {
            id: crypto.randomUUID(),
            template_id: seed.id,
            step_type: s.step_type,
            title: s.title,
            config: JSON.stringify({
              durationMinutes: s.durationMinutes,
              target: s.target,
              module: s.module,
            }),
            order: i,
          },
        });
      });
    }
    await api.db.batch(ops);
  } catch {
    /* 种子写入失败静默——用户可自建模板，不阻塞 */
  }
}

/**
 * 创建模板（含步骤，单事务）。
 * @returns 模板 id；失败返回 undefined
 */
export async function createTemplate(input: {
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  steps: Array<{ step_type: string; title: string; config: SopStepConfig }>;
}): Promise<string | undefined> {
  const api = getApi();
  if (!api) return undefined;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    const ops: Array<Record<string, unknown>> = [
      {
        type: 'create',
        table: T_TEMPLATES,
        item: {
          id,
          name: input.name.trim(),
          description: input.description?.trim() ?? '',
          icon: input.icon ?? '',
          category: input.category ?? '',
          source: 'user',
          created_at: now,
          updated_at: now,
        },
      },
    ];
    input.steps.forEach((s, i) => {
      ops.push({
        type: 'create',
        table: T_STEPS,
        item: {
          id: crypto.randomUUID(),
          template_id: id,
          step_type: s.step_type,
          title: s.title.trim(),
          config: JSON.stringify(s.config ?? {}),
          order: i,
        },
      });
    });
    await api.db.batch(ops);
    return id;
  } catch {
    return undefined;
  }
}

/**
 * 更新模板行并重建步骤（先删旧 steps 再批量写入，单事务）。
 * builtin 模板禁止调用（UI 层已限制）。
 */
export async function updateTemplate(
  id: string,
  changes: { name?: string; description?: string; icon?: string; category?: string; steps?: Array<{ step_type: string; title: string; config: SopStepConfig }> },
): Promise<boolean> {
  const api = getApi();
  if (!api) return false;
  try {
    const ops: Array<Record<string, unknown>> = [
      {
        type: 'update',
        table: T_TEMPLATES,
        id,
        changes: {
          name: changes.name?.trim(),
          description: changes.description?.trim(),
          icon: changes.icon,
          category: changes.category,
          updated_at: new Date().toISOString(),
        },
      },
    ];
    if (changes.steps) {
      const oldSteps = await api.db.query<SopStepRow[]>(T_STEPS, 'getAll');
      (oldSteps ?? [])
        .filter((s) => s.template_id === id)
        .forEach((s) => ops.push({ type: 'delete', table: T_STEPS, id: s.id }));
      changes.steps.forEach((s, i) => {
        ops.push({
          type: 'create',
          table: T_STEPS,
          item: {
            id: crypto.randomUUID(),
            template_id: id,
            step_type: s.step_type,
            title: s.title.trim(),
            config: JSON.stringify(s.config ?? {}),
            order: i,
          },
        });
      });
    }
    await api.db.batch(ops);
    return true;
  } catch {
    return false;
  }
}

/** 删除模板（steps 由外键级联清理） */
export async function deleteTemplate(id: string): Promise<boolean> {
  const api = getApi();
  if (!api) return false;
  try {
    await api.db.delete(T_TEMPLATES, id);
    return true;
  } catch {
    return false;
  }
}

/** 创建执行记录（从模板开始运行） */
export async function createRun(templateId: string): Promise<string | undefined> {
  const api = getApi();
  if (!api) return undefined;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await api.db.insert(T_RUNS, {
      id,
      template_id: templateId,
      status: 'running',
      current_step_index: 0,
      step_progress: '{}',
      started_at: now,
      finished_at: null,
    });
    return id;
  } catch {
    return undefined;
  }
}

/** 读取全部执行记录（新→旧） */
export async function listRuns(): Promise<SopRunRow[]> {
  const api = getApi();
  if (!api) return [];
  try {
    const rows = await api.db.query<SopRunRow[]>(T_RUNS, 'getAll');
    return (rows ?? []).sort((a, b) => b.started_at.localeCompare(a.started_at));
  } catch {
    return [];
  }
}

/** 读取单条执行记录 */
export async function getRun(id: string): Promise<SopRunRow | undefined> {
  const api = getApi();
  if (!api) return undefined;
  try {
    return await api.db.query<SopRunRow | undefined>(T_RUNS, 'getById', [id]);
  } catch {
    return undefined;
  }
}

/** 更新执行记录（推进/完成/中止） */
export async function updateRun(id: string, changes: Partial<Pick<SopRunRow, 'status' | 'current_step_index' | 'step_progress' | 'finished_at'>>): Promise<boolean> {
  const api = getApi();
  if (!api) return false;
  try {
    await api.db.update(T_RUNS, id, changes);
    return true;
  } catch {
    return false;
  }
}
