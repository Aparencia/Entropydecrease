/**
 * 统一收件箱数据访问层 — inbox_items 表 IPC 封装
 * Unified inbox repository — thin db IPC bridge for inbox_items
 *
 * @ai-context: 三路来源（clipboard / inspiration / import）统一收件。
 * 剪贴板收藏带内容去重（同文本 24h 内不重复入箱，返回既有 id）。
 * 非 Electron 环境或 IPC 失败时静默降级，收件箱 UI 不阻塞。
 * @ai-context: Three ingestion sources converge here; clipboard capture
 * dedupes identical text within 24h. Methods degrade silently outside
 * Electron so the inbox UI never breaks.
 */
import type { InboxItem } from '../types';

const TABLE = 'inboxItems';

/** 内容去重窗口（毫秒）：同文本 24h 内不重复入箱 */
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

function getApi(): typeof window.electronAPI | undefined {
  return window.electronAPI;
}

/** 从正文派生标题：首行截断 */
function deriveTitle(content: string): string {
  const firstLine = content.split('\n')[0]?.trim() ?? '';
  return firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine;
}

/** 读取全部收件箱条目（新→旧） */
export async function listInboxItems(): Promise<InboxItem[]> {
  const api = getApi();
  if (!api) return [];
  try {
    const rows = await api.db.query<InboxItem[]>(TABLE, 'getAll');
    return (rows ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch {
    return [];
  }
}

/**
 * 收藏剪贴板文本到收件箱（去重后写入）。
 * @returns { id, duplicated }——duplicated=true 表示 24h 内已存在同文本
 */
export async function captureClipboardText(text: string): Promise<{ id: string; duplicated: boolean } | undefined> {
  const trimmed = text.trim();
  const api = getApi();
  if (!api) return undefined;
  if (!trimmed) return undefined;

  try {
    // 去重：遍历现有条目，命中同文本且在窗口期内则直接返回既有 id
    const existing = await listInboxItems();
    const now = Date.now();
    const dup = existing.find((i) => {
      if (i.content !== trimmed) return false;
      const age = now - new Date(i.created_at).getTime();
      return age >= 0 && age < DEDUP_WINDOW_MS;
    });
    if (dup) return { id: dup.id, duplicated: true };

    const id = crypto.randomUUID();
    await api.db.insert(TABLE, {
      id,
      source: 'clipboard',
      title: deriveTitle(trimmed),
      content: trimmed,
      status: 'new',
      created_at: new Date().toISOString(),
    });
    return { id, duplicated: false };
  } catch {
    return undefined;
  }
}

/** 更新条目状态（settled=已沉淀 / archived=已归档，可逆原则：不物理删除） */
export async function updateInboxStatus(id: string, status: InboxItem['status']): Promise<boolean> {
  const api = getApi();
  if (!api) return false;
  try {
    await api.db.update(TABLE, id, { status });
    return true;
  } catch {
    return false;
  }
}

/** 删除条目（垃圾清理用，与归档二选一） */
export async function deleteInboxItem(id: string): Promise<boolean> {
  const api = getApi();
  if (!api) return false;
  try {
    await api.db.delete(TABLE, id);
    return true;
  } catch {
    return false;
  }
}
