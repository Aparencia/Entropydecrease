/**
 * 实施意图仓储（A4）— 渲染进程经 db IPC 访问 implementation_intentions 表
 * Implementation intention repository via the generic db IPC bridge
 *
 * @ai-context: 本地优先——意图数据仅存本地 SQLite（schema v6）。所有方法
 * 在非 Electron 环境或 IPC 失败时静默降级（返回空/undefined），不阻塞 UI。
 * 到期判断复用 dashboard ritualHelpers.isIntentionDue 纯函数，避免规则分叉。
 * @ai-context: Local-first persistence; every method degrades silently when
 * electronAPI is unavailable so the ritual UI never breaks.
 */
import { isIntentionDue } from '@/features/dashboard/utils/ritualHelpers';

/** 实施意图行结构（与 schema v6 implementation_intentions 表一一对应） */
export interface ImplementationIntention {
  id: string;
  if_clause: string;
  then_clause: string;
  trigger_at: string | null;
  status: 'active' | 'completed' | 'skipped';
  created_at: string;
}

const TABLE = 'implementation_intentions';

/**
 * 创建一条实施意图。
 * @returns 新记录 ID；环境不可用或失败时返回 undefined（不阻塞仪式收尾）
 */
export async function createIntention(input: {
  ifPart: string;
  thenPart: string;
  /** 可选提醒时间（ISO 字符串）；空表示不设定时提醒 */
  triggerAt?: string;
}): Promise<string | undefined> {
  const api = window.electronAPI;
  if (!api) return undefined;
  const id = crypto.randomUUID();
  try {
    await api.db.insert(TABLE, {
      id,
      if_clause: input.ifPart.trim(),
      then_clause: input.thenPart.trim(),
      trigger_at: input.triggerAt?.trim() || null,
      status: 'active',
      created_at: new Date().toISOString(),
    });
    return id;
  } catch {
    return undefined;
  }
}

/**
 * 查询全部进行中的意图（status='active'），按创建时间倒序。
 * IPC 仅支持 getAll，状态过滤在渲染层完成（数据量小，无性能顾虑）。
 */
export async function getActiveIntentions(): Promise<ImplementationIntention[]> {
  const api = window.electronAPI;
  if (!api) return [];
  try {
    const rows = await api.db.query<ImplementationIntention[]>(TABLE, 'getAll');
    return (rows ?? [])
      .filter(r => r.status === 'active')
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch {
    return [];
  }
}

/**
 * 找出当前到期可提醒的意图（active 且 trigger_at 已到/未设）。
 * 觉察 > 管控：只返回最近一条，避免多意图同时打扰。
 */
export async function findDueIntention(now: Date = new Date()): Promise<ImplementationIntention | undefined> {
  const actives = await getActiveIntentions();
  return actives.find(i => isIntentionDue(i.trigger_at, now));
}

/**
 * 标记意图状态（completed=已执行 / skipped=主动跳过）。
 * 可逆原则：skipped 不删除记录，仅退出提醒循环。
 */
export async function setIntentionStatus(
  id: string,
  status: 'completed' | 'skipped',
): Promise<void> {
  const api = window.electronAPI;
  if (!api) return;
  try {
    await api.db.update(TABLE, id, { status });
  } catch {
    /* 静默降级——状态同步失败不影响用户操作 */
  }
}
