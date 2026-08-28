/**
 * 组侧栏纯函数层（v0.14 C1 Obsidian 式改造）。
 *
 * @ai-context: spec §4.1——分区依据 NoteGroup.kind（展示层组织，不改组模型）；
 *              过滤纯函数 filterGroups；最近使用 LRU（上限 5，访问组时写入）；
 *              折叠记忆 localStorage。storage 依赖注入——node 环境可单测。
 */

/** 组最小形状（避免依赖 NoteGroup 全量类型） */
export interface SidebarGroup {
  id: number;
  name: string;
  kind: string;
}

/** 分区顺序与标题（展示层组织；kind → 分区） */
export const GROUP_SECTIONS: { kind: string; title: string }[] = [
  { kind: "course", title: "📚 课程" },
  { kind: "topic", title: "🏷 主题" },
  { kind: "standalone", title: "📄 独立" },
  { kind: "feed", title: "⚡ feed" },
];

/** 关键词过滤组列表（组名 contains，大小写不敏感；空查询原样返回） */
export function filterGroups<T extends SidebarGroup>(groups: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups.filter((g) => g.name.toLowerCase().includes(q));
}

/** 最近使用上限（spec §4.1） */
export const RECENT_LIMIT = 5;

/** 最近使用 LRU 推进（纯函数：访问 id 移到队首，去重，截断上限） */
export function pushRecentGroup(ids: number[], id: number, limit: number = RECENT_LIMIT): number[] {
  return [id, ...ids.filter((x) => x !== id)].slice(0, limit);
}

/** 折叠记忆 key（spec §4.1：group-sidebar-folded:{kind}） */
export function foldedKey(kind: string): string {
  return `group-sidebar-folded:${kind}`;
}

/** 最近使用 storage key */
export const RECENT_KEY = "group-sidebar-recent";

/** 读最近使用（storage 注入；损坏/缺失回退空数组——防御性） */
export function readRecentGroupIds(storage: Pick<Storage, "getItem">): number[] {
  try {
    const raw = storage.getItem(RECENT_KEY);
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

/** 写最近使用（storage 注入；写失败静默——纯增强功能不阻断交互） */
export function writeRecentGroupIds(storage: Pick<Storage, "setItem">, ids: number[]): void {
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    /* localStorage 不可用（隐私模式等）——静默降级 */
  }
}

/** 读分区折叠态（storage 注入；缺失默认展开） */
export function readFolded(storage: Pick<Storage, "getItem">, kind: string): boolean {
  try {
    return storage.getItem(foldedKey(kind)) === "1";
  } catch {
    return false;
  }
}

/** 写分区折叠态（写失败静默） */
export function writeFolded(storage: Pick<Storage, "setItem">, kind: string, folded: boolean): void {
  try {
    storage.setItem(foldedKey(kind), folded ? "1" : "0");
  } catch {
    /* 静默降级 */
  }
}
