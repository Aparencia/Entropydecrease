/**
 * useSessionListView — 会话列表视图模型（批 0-C2 自 SessionListPanel 拆出）。
 *
 * @ai-context: 纯派生链、零副作用：items/groups + 筛选排序态 → sorted → filtered →
 *              groupedView → visibleOrder。面板只消费结果（渲染与选择域基准），
 *              不再持有推导逻辑。筛选/排序均为面板本地状态——数据已在
 *              SessionListItem 里，零后端往返。
 * @ai-context 边界：
 *              ① time-desc 保持后端序**不重排**（后端已按新→旧返回）；
 *              ② endOf 在 ended_at==null 时取 Date.now() —— 「时长」排序对**进行中**
 *                 会话每次求值结果可能不同（既有事实，本批只搬家不优化）；
 *              ③ groupedView 组内同样应用筛选 + 排序，空组剔除；
 *              ④ visibleOrder 必须保持 useMemo：它是 Shift 区间、选集裁剪、全选三态
 *                 的唯一基准，跨 hook 传递时**不得** .map() 再包装（依赖每帧变化会让
 *                 裁剪 effect 每帧空跑）——折叠组隐藏行不在序内（与笔记树同语义）。
 */
import { useCallback, useMemo } from "react";
import type { CourseGroup, Session, SessionListItem } from "../types";

export type StatusFilter = "all" | "recording" | "finished" | "failed";
export type ConvertedFilter = "all" | "todo" | "done";
export type SortBy = "time-desc" | "time-asc" | "duration";

interface Options {
  items: SessionListItem[];
  groups: CourseGroup[] | null;
  grouped: boolean;
  /** 分组折叠表（course → 是否折叠）；折叠组行不进 visibleOrder */
  collapsed: Record<string, boolean>;
  filterStatus: StatusFilter;
  filterConverted: ConvertedFilter;
  /** 标题即时过滤关键词（搜索域：标题 + 来源窗口） */
  keyword: string;
  sortBy: SortBy;
}

export function useSessionListView({
  items, groups, grouped, collapsed, filterStatus, filterConverted, keyword, sortBy,
}: Options) {
  /** 筛选谓词（列表与课程分组共用） */
  const matchFilters = useCallback(
    (item: SessionListItem) => {
      if (filterStatus !== "all" && item.session.status !== filterStatus) return false;
      if (filterConverted === "todo" && (item.hasNote || !item.hasContent)) return false;
      if (filterConverted === "done" && !item.hasNote) return false;
      const kw = keyword.trim().toLowerCase();
      if (kw) {
        const hay = `${item.session.title} ${item.session.source_window ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    },
    [filterStatus, filterConverted, keyword],
  );

  /** 本地排序（时间倒序为后端默认序，保持稳定不重排） */
  const sorted = useMemo(() => {
    const list = [...items];
    const endOf = (s: Session) => s.ended_at ?? Math.floor(Date.now() / 1000);
    if (sortBy === "time-asc") {
      list.sort((a, b) => a.session.started_at - b.session.started_at);
    } else if (sortBy === "duration") {
      list.sort(
        (a, b) =>
          (endOf(b.session) - b.session.started_at) - (endOf(a.session) - a.session.started_at),
      );
    }
    return list;
  }, [items, sortBy]);

  const filtered = useMemo(() => sorted.filter(matchFilters), [sorted, matchFilters]);

  /** 课程分组视图（组内同样应用筛选 + 排序） */
  const groupedView = useMemo(() => {
    if (!groups) return null;
    const endOf = (s: Session) => s.ended_at ?? Math.floor(Date.now() / 1000);
    return groups
      .map((g) => ({
        ...g,
        sessions: g.sessions.filter(matchFilters).sort((a, b) => {
          if (sortBy === "time-asc") return a.session.started_at - b.session.started_at;
          if (sortBy === "duration")
            return (endOf(b.session) - b.session.started_at) - (endOf(a.session) - a.session.started_at);
          return 0; // time-desc：后端已按新→旧
        }),
      }))
      .filter((g) => g.sessions.length > 0);
  }, [groups, matchFilters, sortBy]);

  // 当前可见行序（批 4 区间语义基准）：分组视图=展开组顺次；平铺=筛选后序。
  // 折叠组行不可见——不参与区间与选集裁剪（与笔记树语义一致）
  const visibleOrder = useMemo(() => {
    if (grouped && groupedView) {
      const out: number[] = [];
      for (const g of groupedView) {
        if (collapsed[g.course]) continue;
        for (const i of g.sessions) out.push(i.session.id);
      }
      return out;
    }
    return filtered.map((i) => i.session.id);
  }, [grouped, groupedView, filtered, collapsed]);

  return { filtered, groupedView, visibleOrder };
}
