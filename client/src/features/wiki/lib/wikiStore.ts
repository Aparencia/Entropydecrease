/**
 * 协作知识维基本地存储（local-first）
 * Collaborative wiki local storage (local-first)
 *
 * @ai-context: 维基页面持久化在 localStorage（ed_wiki_pages_v1），离线完全
 * 可用；多设备/多人合并由现有 CRDT 基座（lib/sync/crdtEngine）承载，本层
 * 只维护"版本号 + 贡献者标注"，不实现合并算法。贡献者颜色按 userId 稳定
 * 分配（同人同色，跨设备一致）。aiQuality 为本地启发式占位，接入 ai-gateway
 * 后替换为真实评估。
 * @ai-context: Pages live in localStorage so the wiki works fully offline;
 * multi-user merge is handled by the existing CRDT infra. Contributor colors
 * are stable per userId. aiQuality is a local heuristic placeholder.
 */
import type { WikiContributor, WikiPage } from '../types';

const STORAGE_KEY = 'ed_wiki_pages_v1';
const ANON_ID_KEY = 'ed_anon_id_v1';

/** 贡献者调色板（按 userId hash 稳定取色） */
const CONTRIBUTOR_COLORS = [
  '#F59E0B', '#4A9BD9', '#10B981', '#EF4444',
  '#E8B84B', '#F2CF7D', '#14B8A6', '#F97316',
  '#40AB92', '#B5D84E',
];

/** 按 userId 稳定分配贡献者颜色 */
export function colorForUserId(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return CONTRIBUTOR_COLORS[h % CONTRIBUTOR_COLORS.length];
}

/** 本地用户标识：Supabase 会话 id 或匿名 id（离线/本地模式兜底） */
export function getLocalUserId(): string {
  try {
    const existing = localStorage.getItem(ANON_ID_KEY);
    if (existing) return existing;
    const id = `anon_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(ANON_ID_KEY, id);
    return id;
  } catch {
    return 'local-user';
  }
}

/** 单页校验：缺字段（如 contributors）会在渲染时抛 TypeError，损坏项直接丢弃 */
function isValidPage(value: unknown): value is WikiPage {
  if (!value || typeof value !== 'object') return false;
  const page = value as Record<string, unknown>;
  return (
    typeof page.id === 'string' &&
    typeof page.title === 'string' &&
    Array.isArray(page.contributors)
  );
}

/** 读取全部维基页面（损坏数据静默回退空数组） */
export function loadPages(): WikiPage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    // M14: 逐项校验——localStorage 可能混入旧版/损坏数据（如缺少 contributors），
    // 只保留结构合法的条目，避免渲染层 TypeError
    return Array.isArray(parsed) ? parsed.filter(isValidPage) : [];
  } catch {
    return [];
  }
}

function persist(pages: WikiPage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch {
    // 存储不可用时静默（仅本地持久化，失败不影响内存编辑）
  }
}

function upsertContributor(list: WikiContributor[], userId: string, nickname?: string): WikiContributor[] {
  if (list.some((c) => c.userId === userId)) return list;
  return [...list, { userId, nickname, color: colorForUserId(userId) }];
}

/** 本地启发式质量占位：接入 AI 评估后替换 */
function heuristicQuality(content: string): WikiPage['aiQuality'] {
  const len = content.trim().length;
  if (len < 80) return 'needs-review';
  if (len < 240) return 'pending';
  return 'good';
}

/** 新建维基页面（含默认引导内容） */
export function createPage(title: string, nickname?: string): WikiPage {
  const userId = getLocalUserId();
  const now = Date.now();
  const page: WikiPage = {
    id: `wiki_${now}_${Math.random().toString(36).slice(2, 8)}`,
    title: title.trim() || '未命名页面',
    content: '',
    contributors: [{ userId, nickname, color: colorForUserId(userId) }],
    version: 1,
    votes: 0,
    votedByMe: false,
    aiQuality: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  const pages = loadPages();
  pages.unshift(page);
  persist(pages);
  return page;
}

/** 保存内容：版本 +1，追加贡献者（同人去重） */
export function savePageContent(page: WikiPage, content: string, nickname?: string): WikiPage {
  const updated: WikiPage = {
    ...page,
    content,
    version: page.version + 1,
    updatedAt: Date.now(),
    contributors: upsertContributor(page.contributors, getLocalUserId(), nickname),
    aiQuality: heuristicQuality(content),
  };
  const pages = loadPages();
  const idx = pages.findIndex((p) => p.id === page.id);
  if (idx >= 0) {
    pages[idx] = updated;
    persist(pages);
  }
  return updated;
}

/** 删除页面 */
export function deletePage(id: string): void {
  const pages = loadPages().filter((p) => p.id !== id);
  persist(pages);
}

/** 社区投票（本地去重，切换投票状态） */
export function toggleVote(page: WikiPage): WikiPage {
  const updated: WikiPage = {
    ...page,
    votes: page.votedByMe ? Math.max(0, page.votes - 1) : page.votes + 1,
    votedByMe: !page.votedByMe,
  };
  const pages = loadPages();
  const idx = pages.findIndex((p) => p.id === page.id);
  if (idx >= 0) {
    pages[idx] = updated;
    persist(pages);
  }
  return updated;
}
