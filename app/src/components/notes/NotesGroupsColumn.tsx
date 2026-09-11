/**
 * NotesGroupsColumn — 笔记页左栏（组筛选侧栏 + 列拖拽手柄）。
 *
 * @ai-context: 本文件是**展示适配器**（自 NotesPage 拆分，行为不变）：只做「折叠
 *              窄条 ↔ GroupSidebar 原位切换 + 事件接线」，**不含业务逻辑** ——
 *              列状态在页面的 `useColumnLayout("notes-groups")`，组数据由
 *              GroupSidebar 自持，刷新令牌来自 `useNotesListData`。
 * @ai-context: prop 分组——
 *              ① 列状态：groupsCol（useColumnLayout("notes-groups")）
 *              ② 过滤与选中：groupFilter / onGroupFilterChange（页面负责"切组即回
 *                 笔记视图"的附加语义）/ selectedNoteId / inboxActive
 *              ③ 刷新与留痕：onChanged（组变更）/ refreshToken（外部令牌）/
 *                 onCleanNotice（空组清理留痕上抛父层 toast）
 *              ④ 跨页深链：onOpenReview（ⓘ 复习本组 → App 转顶层复习页，本页只透传）
 *                 / onOpenSystem（组行徽标 → 体系页）
 * @ai-context: DOM 边界——顶层**必须**返回 **fragment**：折叠窄条与
 *              `ColumnResizer` 是页面根 flex 容器的直接子元素，且手柄在**折叠态也
 *              渲染**（不得带进条件分支）；多包一层会改变三栏宽度分配。
 */
import type { ColumnLayout } from "../../hooks/useColumnLayout";
import GroupSidebar from "../GroupSidebar";
import ColumnBar from "../ColumnBar";
import ColumnResizer from "../ColumnResizer";

interface Props {
  /** 左栏列状态（页面 useColumnLayout("notes-groups")） */
  groupsCol: ColumnLayout;
  /** 当前过滤组（null=全部笔记） */
  groupFilter: number | null;
  /** 组过滤变更（页面附加"切回笔记视图"语义） */
  onGroupFilterChange: (id: number | null) => void;
  /** 组/笔记变更后的刷新（NotesPage 重载列表与令牌） */
  onChanged: () => void;
  /** ⓘ「复习本组」跨页深链（消费在 ReviewPage，本页只透传 App） */
  onOpenReview?: (groupId: number | null, name: string) => void;
  /** 当前选中笔记 id（ⓘ 弹层"移入/移出选中笔记"用；null=无） */
  selectedNoteId: number | null;
  /** 打开收件箱视图（中部列表原位切换为碎片列表） */
  onOpenInbox: () => void;
  /** 收件箱视图是否激活（高亮首项） */
  inboxActive: boolean;
  /** 外部刷新令牌（捕获/升笔记/升卡后触发本栏重载计数） */
  refreshToken: number;
  /** 跳转体系页并选中体系（v0.13.7 触点① 组行徽标） */
  onOpenSystem?: (systemId: number) => void;
  /** REQ-316（批 7）：移组触发源空组自动清理 → 上抛组标题（父层 toast 留痕） */
  onCleanNotice: (groupNames: string[]) => void;
}

export default function NotesGroupsColumn({
  groupsCol, groupFilter, onGroupFilterChange, onChanged, onOpenReview, selectedNoteId,
  onOpenInbox, inboxActive, refreshToken, onOpenSystem, onCleanNotice,
}: Props) {
  return (
    <>
      {/* ── 左侧：组筛选侧栏（240px；v0.15 可拖拽/折叠为窄条）── */}
      {groupsCol.folded ? (
        <ColumnBar icon="📁" title="笔记组" onClick={groupsCol.expand} />
      ) : (
        <GroupSidebar
          width={groupsCol.width}
          groupFilter={groupFilter}
          onGroupFilterChange={onGroupFilterChange}
          onChanged={onChanged}
          // v0.20.10：复习=顶层页深链（ⓘ「复习本组」转页预选）——无本地 Overlay
          onOpenReview={(groupId, name) => onOpenReview?.(groupId, name)}
          selectedNoteId={selectedNoteId}
          // 收件箱=全量碎片视图，与组过滤无关——清组过滤消除"组行高亮 + 收件箱"
          // 并存矛盾（审查修复）
          onOpenInbox={onOpenInbox}
          inboxActive={inboxActive}
          refreshToken={refreshToken}
          onOpenSystem={(id) => onOpenSystem?.(id)}
          onCollapse={() => groupsCol.setManualFolded(true)}
          onCleanNotice={onCleanNotice}
        />
      )}
      <ColumnResizer onResize={groupsCol.resizeBy} onReset={groupsCol.resetWidth} />
    </>
  );
}
