/**
 * @ai-context: 页面标题管理 Hook，标题模板含品牌名——品牌文案变更需检查此处。
 */
import { useLocation } from 'react-router-dom';

const routeTitles: Record<string, string> = {
  '/': '学习看板',
  '/pomodoro': '深潜',
  '/pomodoro/stats': '专注统计',
  '/pomodoro/settings': '深潜设置',
  '/notes': '结礁',
  '/flashcards': '反衰减呼吸',
  '/feynman': '浮出水面',
  '/settings': '设置',
  '/analytics': '数据分析',
  '/inspiration': '萤火海沟',
  '/onboarding': '欢迎',
};

export function usePageTitle(): string {
  const { pathname } = useLocation();

  // Exact match first
  if (routeTitles[pathname]) return routeTitles[pathname];

  // Prefix match for dynamic routes
  if (pathname.startsWith('/notes/')) return '编辑结礁';
  if (pathname.match(/^\/flashcards\/[^/]+\/study$/)) return '学习会话';
  if (pathname.startsWith('/flashcards/')) return '卡组详情';
  if (pathname.startsWith('/feynman/')) return '浮出水面会话';

  return '熵减';
}

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

/** 将路径段映射为可读标签 */
const segmentLabels: Record<string, string> = {
  pomodoro: '深潜',
  stats: '专注统计',
  settings: '设置',
  notes: '结礁',
  flashcards: '反衰减呼吸',
  study: '学习会话',
  feynman: '浮出水面',
  analytics: '数据分析',
  inspiration: '萤火海沟',
};

/**
 * 根据当前路由路径生成面包屑。
 * 例如 `/notes/edit/xxx` → `['首页', '笔记', '编辑']`
 */
export function useBreadcrumb(): { crumbs: BreadcrumbItem[]; title: string } {
  const { pathname } = useLocation();
  const title = usePageTitle();

  // 首页无需面包屑
  if (pathname === '/') {
    return { crumbs: [{ label: '首页' }], title };
  }

  const segments = pathname.split('/').filter(Boolean);

  const crumbs: BreadcrumbItem[] = [{ label: '首页', path: '/' }];

  let accumulated = '';
  for (const segment of segments) {
    accumulated += `/${segment}`;

    // 跳过纯 ID 段（UUID / 数字 ID）
    // Bug #19: 数字 ID 限制 1-20 位，排除 4 位年份（2020-2030）
    const isId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
      (/^\d{1,20}$/.test(segment) && !/^20[2-3]\d$/.test(segment));

    if (isId) continue;

    const label = segmentLabels[segment] ?? segment;

    // 最后一段不加 path（当前页）
    const isLast = accumulated === pathname || accumulated + '/' === pathname;
    crumbs.push({ label, path: isLast ? undefined : accumulated });
  }

  return { crumbs, title };
}
