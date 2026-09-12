/**
 * NotesReadingColumn — 笔记页右栏（阅读/编辑视图宿主 + 三个插槽）。
 *
 * @ai-context: 本文件是**展示适配器**（自 NotesPage 拆分，行为不变）：只做「插槽
 *              元素构造 + 事件绑定 + 一层组合」，**不含业务逻辑** —— 编辑态与
 *              编辑器 ref 在 `useNotesPageEditing`，列表/选中/刷新中枢在
 *              `useNotesListData`，命中词深链在 `useNotesDeepLink`，删除/批量删在
 *              `useNotesBatchActions`，选区行动在 `useNoteSelectionActions`。
 * @ai-context: prop 分组——
 *              ① 视图态：selected / editing / setEditing / readerSearch / noteColors / groups
 *              ② 插槽接线：editorRef（编辑器命令式出口）/ outlineCol（大纲列状态）
 *              ③ 刷新与错误：onChanged（刷新中枢，完成编辑·版本回滚·移组·精修采纳共用）
 *                 / onError（页面 status 单一真源）/ onCleanNotice（空组清理留痕）
 *              ④ 跨页深链：onCreateSystem / onOpenSession
 *              ⑤ 页面命令：onOpenAi / onOpenModelCard / onSelectionAction / onPinToggle
 *                 / onDelete / onTaskToggle / onTagClick / onImageOpen
 * @ai-context: DOM 边界——顶层**必须**是原来那个 `flex:1, minWidth:0, display:flex,
 *              overflow:hidden` 的 div（页面根 flex 的直接子元素，多包一层会改变
 *              三栏宽度分配）；空态占位的中文文案与硬编码色 `#9ca3af` 逐字保留
 *              （本批不 token 化）。
 * @ai-context: 等价红线——`outlineCol` 的 localStorage 键 `notes-outline` 与
 *              `columnSpec("notes-outline")`（批 3 T8 起：默认 180 / 140·260 /
 *              autoFoldBelow `breakpointFor("outlineCol")`=1280）由页面逐字传入，
 *              本组件不得另建列状态。批 3 T8 两处接线：① 宽度经 `outlineWidth`
 *              注入 NoteReadingView（此前组件写死 180 ⇒ J1-6「假可调」）；
 *              ② `onToggleOutline` 在**已折叠**时走 `expand()`——旧实现只翻
 *              manualFolded，窄窗自动折叠下 `folded` 恒真 ⇒ J1-3「折叠后点窄条
 *              永不展开」的死局；未折叠时（✕ 收起）仍是手动折叠，语义不变。
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

interface Props {
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
  /** 编辑器命令式出口（RichEditorView 的 ref 目标——ESC 先 await 保存再刷新） */
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
  /** 图片放大预览入口（阅读态与编辑态共用同一遮罩） */
  onImageOpen: (src: string, title?: string) => void;
  /** 空组清理留痕上抛（移组触发，父层 toast） */
  onCleanNotice: (groupNames: string[]) => void;
}

export default function NotesReadingColumn({
  selected, editing, setEditing, readerSearch, noteColors, groups, editorRef, outlineCol,
  onChanged, onError, onCreateSystem, onOpenAi, onOpenModelCard, onSelectionAction,
  onPinToggle, onDelete, onTaskToggle, onTagClick, onOpenSession, onImageOpen, onCleanNotice,
}: Props) {
  // H3：辅助面板插槽——VersionPanel（知识补充已迁移至编辑态 🤖 AI 菜单——
  // v0.17.0 REQ-246：阅读态独立面板移除，用 AI 直接进入编辑态）
  const auxPanels = selected ? (
    <>
      <VersionPanel key={`version-${selected.id}`} noteId={selected.id} onChanged={() => void onChanged()} />
    </>
  ) : null;

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", overflow: "hidden" }}>
      {selected ? (
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
          onTaskToggle={onTaskToggle}
          onImageOpen={(src, title) => onImageOpen(src, title)}
          // 批 8（REQ-317）：阅读态选区行动类（转问题/模型卡预填）
          onSelectionAction={onSelectionAction}
        />
      ) : (
        <Text as="div" size={4} tone="ink-3" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          从左侧选择一条笔记查看
        </Text>
      )}
    </div>
  );
}
