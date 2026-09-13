/**
 * NotesReadingColumn.parts — 笔记阅读列的**展示性子件**（自 `NotesReadingColumn.tsx` 纯搬迁：批 8 T7）。
 *
 * @ai-context: 为什么单独成件：宿主件已贴 ≤300 硬线（实测 300 / 余 0），而 T8/T10 的能力还要落在
 *              同一个宿主上 ⇒ 先按**可判据的切割线**把头寸腾出来。切下来的是**一块零状态片段**：
 *              `ResidentNoteView` —— 原文常驻视图的**整棵子树**（`NoteReadingView` + `auxPanels`
 *              + 空态占位）。
 * @ai-context: ⚠️ **C4 的就近错误行（`StatusLine`）没有搬进本件**（卡片的 ② 把它列作候选）：真构建实测
 *              「多一个子件 + 一层元素」把 `NotesPage-` 族推过 `scripts/lazyBudget.json` 的逐族容差
 *              （48,697 > 48,627 + 64）⇒ 按字节预算回退为**宿主内联**（另有独立读数，见 T7 报告 V5）。
 * @ai-context: 🔴 为什么**只有**这一块能动：`NotesReadingColumn.tsx` 上钉着 `views/architecture.guard.test.ts`
 *              **A5②③** 的逐文件判据（`isDefault` 判定 + `display: isDefault ?` 常驻三元 + 恰 1 个
 *              `<ViewSwitcher>` + 恰 1 个 `data-view-error-slot` 且**位于切换器之后**）⇒ 切换器行、
 *              C11 槽位、两个容器的开关逻辑**必须留在宿主**，搬走即红。本件只承载「宿主已算好的值
 *              怎么画」，**不含**任何状态 / ref / effect。
 * @ai-context: 组件边界不动 DOM —— 本件逐字渲染原来那棵树（`data-testid` / 类名 / 文案一字不改）。
 *              `RichEditorView` / `NoteReadingView` / `NoteHeaderActions` / `VersionPanel` / `Text` 的
 *              import 随本件走 ⇒ 宿主不再直接依赖这五个模块。宿主用 `<ResidentNoteView {...props} />`
 *              **原样透传整份 props**（比列 22 条具名属性省一个对象字面量 —— 逐族字节读数的同一处约束）。
 * 副作用：只挂 React 树（与宿主同）。边界：本件在六棘轮的 PROD 域内 ⇒ 零颜色 / 零字号 / 零边框字面量
 *   （`style` 只承载布局，ADR-033 §4），且**零原生 `<button>`**。
 */
import type { RefObject } from "react";
import type { Note, NoteGroup } from "../../types";
import type { NoteEditHandle } from "../NoteEditView";
import type { ColumnLayout } from "../../hooks/useColumnLayout";
import type { SelectionNoteAction } from "../../utils/noteSelectionMenu";
import NoteReadingView from "../NoteReadingView";
import RichEditorView from "../RichEditorView";
import NoteHeaderActions from "../NoteHeaderActions";
import VersionPanel from "../VersionPanel";
import { Text } from "../../ui/primitives";

/** 原文常驻子树的 props 面 —— 与宿主的 `Props` **逐字段同型**（本件不新增、不改窄任何一条）。 */
export interface ResidentViewProps {
  /** 当前选中笔记（null=空态占位） */
  selected: Note | null;
  /** 编辑态（useNotesPageEditing 持有） */
  editing: boolean;
  setEditing: (v: boolean) => void;
  /** 命中词阅读搜索请求（来自引用跳转；过期请求按 noteId 过滤不注入） */
  readerSearch: { noteId: number; search: string; key: number } | null;
  /** 笔记色板（noteId → 解析色，含组继承；headerExtra 色点用） */
  noteColors: Record<number, string | null>;
  groups: NoteGroup[];
  /** 编辑器命令式出口（RichEditorView 的 ref 目标——ESC 先 await 保存再刷新；C4 的守卫读它） */
  editorRef: RefObject<NoteEditHandle | null>;
  /** 大纲列状态（页面 useColumnLayout("notes-outline")） */
  outlineCol: ColumnLayout;
  /** 刷新中枢：列表重载 + 选中笔记回读（H3/AI/移组/编辑退出三个出口共用） */
  onChanged: () => void;
  /** 错误上抛（页面 status 区展示） */
  onError: (msg: string) => void;
  /** 打开体系页并建体系向导（TD-2026-09-05-A 空体系引导） */
  onCreateSystem?: () => void;
  /** 打开编辑态 AI 能力对话框（阅读态点击=页面进入编辑态 + 内容快照） */
  onOpenAi: () => void;
  /** 打开模型卡草稿对话框（组内 model 卡唯一生成链） */
  onOpenModelCard: () => void;
  /** 正文选区行动类上抛（转问题/模型卡预填——阅读与编辑两宿主同一入口） */
  onSelectionAction: (action: SelectionNoteAction, text: string) => void;
  onPinToggle: (note: Note) => void;
  onDelete: (id: number) => void;
  /** H1：任务清单勾选回写（本地先行 + 建版本快照） */
  onTaskToggle: (newContent: string) => void;
  /** 标签点击 → 页面切过滤态（清关键词 + 切回笔记视图） */
  onTagClick: (tag: string) => void;
  /** 来源会话反跳（缺省=不可跳） */
  onOpenSession?: (sessionId: number) => void;
  /** 批 6 T26：`[[ts:ms]]` 回链的带毫秒分支（透传给 `NoteReadingView`；缺省 ⇒ 退回 `onOpenSession`） */
  onOpenSessionAt?: (sessionId: number, ms: number) => void;
  /** 图片放大预览入口（阅读态与编辑态共用同一遮罩） */
  onImageOpen: (src: string, title?: string) => void;
  /** 空组清理留痕上抛（移组触发，父层 toast） */
  onCleanNotice: (groupNames: string[]) => void;
}

export function ResidentNoteView({
  selected, editing, setEditing, readerSearch, noteColors, groups, editorRef, outlineCol,
  onChanged, onError, onCreateSystem, onOpenAi, onOpenModelCard, onSelectionAction,
  onPinToggle, onDelete, onTaskToggle, onTagClick, onOpenSession, onOpenSessionAt, onImageOpen, onCleanNotice,
}: ResidentViewProps) {
  // H3：辅助面板插槽——VersionPanel（知识补充已迁移至编辑态 🤖 AI 菜单——
  // v0.17.0 REQ-246：阅读态独立面板移除，用 AI 直接进入编辑态）
  const auxPanels = selected ? (
    <>
      <VersionPanel key={`version-${selected.id}`} noteId={selected.id} onChanged={() => void onChanged()} onOpenSessionAt={onOpenSessionAt} />
    </>
  ) : null;

  /** 默认视图（原文）节点：T14 之前逐字相同，只是现在由常驻容器承载（§7.3①） */
  return selected ? (
    <NoteReadingView
      note={selected}
      editing={editing}
      // v0.19.1：命中词阅读搜索（仅当请求属于当前选中笔记——过期请求不注入）
      externalSearch={readerSearch && selected?.id === readerSearch.noteId
        ? { key: readerSearch.key, query: readerSearch.search }
        : null}
      outlineFolded={outlineCol.folded}
      // 批 3 T8：大纲列宽/拖拽经 props 注入（此前 NoteReadingView 写死 180，
      // hook 的宽度记忆与 min/max 夹取全部失效——审计 J1-6「假可调」）
      outlineWidth={outlineCol.width}
      onOutlineResize={outlineCol.resizeBy}
      onOutlineReset={outlineCol.resetWidth}
      // 批 3 T8（J1-3）：窄条（ColumnBar）点击必须走 expand()——它同时清自动/手动
      // 折叠态；旧实现只翻 manualFolded，窄窗自动折叠下 folded 恒为真 ⇒ 点窄条
      // 永不展开。未折叠时的 ✕「收起大纲」仍是手动折叠（与 NotesGroupsColumn 的
      // bar=expand / onCollapse=setManualFolded 同款形态）
      onToggleOutline={() =>
        outlineCol.folded ? outlineCol.expand() : outlineCol.setManualFolded(true)
      }
      editor={
        <RichEditorView
          key={selected.id}
          ref={editorRef}
          note={selected}
          onCancel={() => {
            // v0.13.6：完成编辑 → 列表重载 + 选中笔记重取（右栏立即显示新标题/正文）
            setEditing(false);
            void onChanged();
          }}
          // v0.14 A：编辑态图片点击放大（与阅读态同一入口）
          onImageOpen={(src, title) => onImageOpen(src, title)}
          // 批 8（REQ-317）：编辑态选区行动类（转问题/模型卡预填）
          onSelectionAction={onSelectionAction}
        />
      }
      auxPanels={auxPanels}
      headerExtra={
        <NoteHeaderActions
          key={`hdr-${selected.id}`}
          note={selected}
          resolvedColor={noteColors[selected.id] ?? null}
          groups={groups}
          onChanged={() => void onChanged()}
          onError={(m) => onError(m)}
          onGotoKnowledgeSystem={onCreateSystem}
          onOpenAi={onOpenAi}
          onOpenModelCard={onOpenModelCard}
          onCleanNotice={onCleanNotice}
        />
      }
      onEdit={() => setEditing(true)}
      onPinToggle={() => void onPinToggle(selected)}
      onDelete={() => void onDelete(selected.id)}
      onTagClick={onTagClick}
      onOpenSession={(id) => onOpenSession?.(id)}
      onOpenSessionAt={onOpenSessionAt}
      onTaskToggle={onTaskToggle}
      onImageOpen={(src, title) => onImageOpen(src, title)}
      // 批 8（REQ-317）：阅读态选区行动类（转问题/模型卡预填）
      onSelectionAction={onSelectionAction}
    />
  ) : (
    <Text as="div" size={4} tone="ink-3" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      从左侧选择一条笔记查看
    </Text>
  );
}
