/**
 * NotesReadingColumn — 笔记页右栏（**视图宿主**：阅读/编辑视图 + 视图切换 + 三个插槽）。
 *
 * @ai-context: 本文件是**展示适配器**（自 NotesPage 拆分，行为不变）：只做「插槽
 *              元素构造 + 事件绑定 + 一层组合」，**不含业务逻辑** —— 编辑态与
 *              编辑器 ref 在 `useNotesPageEditing`，列表/选中/刷新中枢在
 *              `useNotesListData`，命中词深链在 `useNotesDeepLink`，删除/批量删在
 *              `useNotesBatchActions`，选区行动在 `useNoteSelectionActions`。
 * @ai-context: prop 分组——① 视图态：selected / editing / setEditing / readerSearch /
 *              noteColors / groups；② 插槽接线：editorRef / outlineCol；③ 刷新与错误：
 *              onChanged / onError / onCleanNotice；④ 跨页深链：onCreateSystem /
 *              onOpenSession；⑤ 页面命令：onOpenAi / onOpenModelCard / onSelectionAction
 *              / onPinToggle / onDelete / onTaskToggle / onTagClick / onImageOpen；
 *              ⑥ 批 5 T14 新增：`views`（视图清单，页面注入 —— C1①）。
 * @ai-context: DOM 边界——顶层**必须**是原来那个 `flex:1, minWidth:0, display:flex,
 *              overflow:hidden` 的 div（页面根 flex 的直接子元素，多包一层会改变三栏宽度
 *              分配），**它的四个属性一字未改**；T14 新增的两层包装都在它**内部**：列容器
 *              （column，承载切换器/错误行/槽位/视图区）+ 常驻容器（row = 原顶层 div 的
 *              display）⇒「大纲列 + 手柄 + 正文区」仍是同一条 flex 行，宽度分配不变。
 *              空态占位的中文文案逐字保留。
 * @ai-context: 等价红线——`outlineCol` 的 localStorage 键 `notes-outline` 与
 *              `columnSpec("notes-outline")`（批 3 T8 起：默认 180 / 140·260 /
 *              autoFoldBelow `breakpointFor("outlineCol")`=1280）由页面逐字传入，
 *              本组件不得另建列状态。批 3 T8 两处接线：① 宽度经 `outlineWidth`
 *              注入 NoteReadingView（此前组件写死 180 ⇒ J1-6「假可调」）；
 *              ② `onToggleOutline` 在**已折叠**时走 `expand()`——旧实现只翻
 *              manualFolded，窄窗自动折叠下 `folded` 恒真 ⇒ J1-3「折叠后点窄条
 *              永不展开」的死局；未折叠时（✕ 收起）仍是手动折叠，语义不变。
 * @ai-context: **批 5 T14 · 规格 §7.3 的三条硬约束落点**：① **原文永远保留**——默认视图
 *              （`views[0]`）同步渲染并包在 `data-testid="note-resident-view"` 里，只用
 *              `display` 切显隐 ⇒ 切到 `cardflow` 后原文节点**仍在 DOM**、挂载数不减；
 *              ② **非默认视图模块级惰性**——`React.lazy` 表按 `spec.load` 构建，默认视图
 *              **无 `load`** ⇒ 不进表、不经惰性；切走 ⇒ 该子树**卸载**；
 *              ③ **编辑态切视图先 `flushSave`、失败则阻断**（C4 走 (b)：**不改
 *              `NoteEditHandle` 接口**）——`try { await editorRef.current?.flushSave?.() }
 *              catch { 阻断 }`：`catch` ⇒ **不切视图 + 保持编辑态 + 在切换器旁渲染一行
 *              `StatusLine kind="error"`**（`role="alert"`、就近、可测）。**明确不用 toast**
 *              （C4 逐字拒绝：toast 是全局层、`belowNav` 堆叠缺陷已登记）。非编辑态
 *              `editorRef.current === null` ⇒ `await undefined` 直接通过（F3）。**显式登记
 *              未做**：`RichEditorView` 的 Ctrl+E / 完成按钮路径**仍不阻断**（今天就是
 *              fire-and-forget，**不是本批引入的回归**、不许顺手扩大面）；`flushSave` 返回
 *              类型升级（`Promise<void>` → `Promise<boolean>`）登记批 8 的接口卫生 follow-up。
 * @ai-context: **C11 槽位**——切换器**下方**恰 1 个空槽位（`class` + `data-` 双钩子，与
 *              `session-detail/SessionViewHost.tsx` **逐字同形**，T15 的图级守卫跨两侧查它）；
 *              批 5 **只预留结构与样式钩子**：不加 CSS 规则、**不重排**任何既有 `StatusLine`
 *              调用点（本件新增的错误行是**就近新增**，不动别处）。
 * @ai-context: **`views` 缺席的退化分支（可判、不静默）**——`views` 是**注入面**（C1①：
 *              注册表只许被两个页面直接 import）⇒ 本件**不 import 注册表**；注入缺席时退化
 *              为「单视图：原文」（不渲染切换器、不读写记忆，`defaultKey === ""` ⇒ 常驻分支
 *              可见），不会静默白屏。棘轮口径：新增代码 0 处颜色/边框/字号字面量（错误色走
 *              `StatusLine` 原语 · 间距走 `--ed-space-*`），`style` 只承载布局（ADR-033 §4）。
 */
import { Suspense, createElement, lazy, useCallback, useMemo, useState } from "react";
import type { RefObject } from "react";
import type { Note, NoteGroup } from "../../types";
import type { NoteEditHandle } from "../NoteEditView";
import type { ColumnLayout } from "../../hooks/useColumnLayout";
import type { SelectionNoteAction } from "../../utils/noteSelectionMenu";
import type { NoteViewSlot, ViewSpec } from "../../views/registry";
import { useViewMemory } from "../../views/useViewMemory";
import NoteReadingView from "../NoteReadingView";
import RichEditorView from "../RichEditorView";
import NoteHeaderActions from "../NoteHeaderActions";
import VersionPanel from "../VersionPanel";
import { ShellFallback } from "../../shell/ShellFallback";
import { StatusLine, Text, ViewSwitcher } from "../../ui/primitives";

/** `views` 缺席时的空清单：**模块级常量**（稳定引用 ⇒ 下面的 `useMemo` 不每渲染重算） */
const NO_VIEWS: readonly ViewSpec<NoteViewSlot>[] = [];

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
  /** 图片放大预览入口（阅读态与编辑态共用同一遮罩） */
  onImageOpen: (src: string, title?: string) => void;
  /** 空组清理留痕上抛（移组触发，父层 toast） */
  onCleanNotice: (groupNames: string[]) => void;
  /** 视图清单（`NotesPage` 注入 `viewsFor("note")` —— C1①；缺席 ⇒ 单视图退化，见文件头） */
  views?: readonly ViewSpec<NoteViewSlot>[];
}

export default function NotesReadingColumn({
  selected, editing, setEditing, readerSearch, noteColors, groups, editorRef, outlineCol,
  onChanged, onError, onCreateSystem, onOpenAi, onOpenModelCard, onSelectionAction,
  onPinToggle, onDelete, onTaskToggle, onTagClick, onOpenSession, onImageOpen, onCleanNotice,
  views,
}: Props) {
  // H3：辅助面板插槽——VersionPanel（知识补充已迁移至编辑态 🤖 AI 菜单——
  // v0.17.0 REQ-246：阅读态独立面板移除，用 AI 直接进入编辑态）
  const auxPanels = selected ? (
    <>
      <VersionPanel key={`version-${selected.id}`} noteId={selected.id} onChanged={() => void onChanged()} />
    </>
  ) : null;

  // ── 批 5 T14：视图宿主（C1① 注入 · C5 记忆 · C4 守卫 · C11 槽位）──
  const specs = views ?? NO_VIEWS;
  const keys = useMemo(() => specs.map((v) => v.key), [specs]);
  /** 默认视图键（= `views[0].key`；空清单 ⇒ `""`，此时常驻分支恒可见） */
  const defaultKey = specs.length > 0 ? specs[0].key : "";
  // C5：键口径 `view:default:note`（`objectType` 粒度、不含 kind）；垃圾值/无记忆 ⇒ 回退 defaultKey
  const [viewKey, setViewKey] = useViewMemory("note", defaultKey, keys);
  const [viewError, setViewError] = useState<string | null>(null);
  // 异步守卫期间整组禁用（C4：`flushSave` 在飞 ⇒ 连点两次不会产生第二条切换）
  const [pending, setPending] = useState(false);

  /** C4 (b)：先 flushSave 再切；抛异常 ⇒ **阻断**（不切视图 + 保持编辑态 + 就近提示） */
  const changeView = useCallback(
    async (key: string) => {
      if (key === viewKey) return;
      setPending(true);
      setViewError(null);
      try {
        // 非编辑态 `editorRef.current === null` ⇒ `await undefined` 直接通过（F3）
        await editorRef.current?.flushSave?.();
      } catch (e) {
        // 阻断：不 setViewKey（值/视图都不动）、保持在编辑态；提示不用 toast（C4 逐字）
        setViewError(`保存失败，未切换视图：${e}`);
        setPending(false);
        return;
      }
      setViewKey(key);
      setPending(false);
    },
    [viewKey, editorRef, setViewKey],
  );

  /**
   * 惰性映射：**默认视图无 `load` ⇒ 值为 `null`**，永不进 `React.lazy`（§7.3② 的构造性证据）。
   * `lazy()` 只按 `specs` 引用建一次 —— 每渲染新建会让子树恒重挂（F5 的挂载计数会当场红）。
   */
  const lazyOf = useMemo(
    () => new Map(specs.map((spec) => [spec.key, spec.load ? lazy(spec.load) : null])),
    [specs],
  );
  const isDefault = viewKey === defaultKey;
  const LazyView = isDefault ? null : lazyOf.get(viewKey) ?? null;
  /** 非默认视图的槽（数据全在这里，视图自身零取数 —— C14②）；空态 ⇒ `null`（连卡片流都不挂） */
  const slot: NoteViewSlot | null = selected
    ? { note: selected, onTaskToggle, onOpenSession, onImageOpen }
    : null;

  /** 默认视图（原文）节点：T14 之前逐字相同，只是现在由常驻容器承载（§7.3①） */
  const residentView = selected ? (
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
  );

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", overflow: "hidden" }}>
      {/* 批 5 T14：列包装（在顶层 div 内部——顶层那四个属性一字未改） */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* 空态（无对象 ⇒ 无视图）：切换器/错误行/槽位一律不渲染，**不写记忆**（F8） */}
        {selected && specs.length > 0 ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--ed-space-8, 8px)", padding: "var(--ed-space-4, 4px) var(--ed-space-8, 8px)" }}>
              <ViewSwitcher
                options={specs}
                value={viewKey}
                onChange={(key) => void changeView(key)}
                ariaLabel="笔记视图"
                disabled={pending}
                testId="note-view-switcher"
              />
            </div>
            {/* C4：就近错误行（`role="alert"` 由原语给；不用 toast） */}
            {viewError !== null ? (
              <div style={{ padding: "0 var(--ed-space-8, 8px)" }}>
                <StatusLine kind="error" testId="note-view-error">{viewError}</StatusLine>
              </div>
            ) : null}
            {/* C11：固定错误区槽位——恰 1 个、批 5 恒空、批 8 才落像素与重排 */}
            <div className="ed-view-error-slot" data-view-error-slot="" />
          </>
        ) : null}

        {/* §7.3① 默认视图常驻：`display` 三元只切显隐，节点与挂载数不减 */}
        <div
          data-testid="note-resident-view"
          style={{ flex: 1, minWidth: 0, display: isDefault ? "flex" : "none", overflow: "hidden" }}
        >
          {residentView}
        </div>

        {/* §7.3② 非默认视图：模块级惰性 + `Suspense`（复用 `ShellFallback`）；切走 ⇒ 卸载。
            滚动容器由本件提供 —— `NoteCardFlowView` 是纯展示列（自身无滚动容器） */}
        {!isDefault && LazyView && slot ? (
          <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "var(--ed-space-16, 16px)" }}>
            <Suspense fallback={<ShellFallback />}>{createElement(LazyView, slot)}</Suspense>
          </div>
        ) : null}
      </div>
    </div>
  );
}
