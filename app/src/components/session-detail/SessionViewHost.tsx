/**
 * SessionViewHost — 会话详情的**视图宿主**（批 5 T10：过渡形态 → 注册表驱动）。
 *
 * @ai-context: 自 SessionDetailPanel.tsx 抽出（批 5 T2 Step 2 · C9）；T10 把 T2 的**过渡形态**
 *              （手写 2 按钮切换组 + `preview`/`raw` 互斥分支）换成**注册表驱动**：切换器走 L1
 *              原语 `ViewSwitcher`，视图清单由页面经面板注入（C1①），本件**不 import 注册表**
 *              （A2：注册表的直接导入者恰 2 个页面）。
 * @ai-context: **三条硬约束（规格 §7.3）在本文件的落点**：
 *              ① **原文永远保留** —— 默认视图（`views[0]`）由面板同步渲染后经 `resident` 注入，
 *                 本件把它包在**常驻** `<div>` 里、只用 `display` 切换显隐 ⇒ 切到任何非默认视图后
 *                 原文节点**仍在 DOM**、**挂载数不减**（T2 的旧形态 `viewMode === "preview" ? … : …`
 *                 是互斥卸载，本任务把它**修回**）；
 *              ② **非默认视图模块级惰性** —— `React.lazy` 表按 `spec.load` 构建，默认视图
 *                 **无 `load`** ⇒ 不进表、不经惰性（`registry.ts` 的 G2 契约）；
 *              ③ 编辑态切视图先 `flushSave` —— **笔记侧的事（T14）**：会话侧无编辑态，本件无此守卫。
 * @ai-context: **受控件（不是状态持有者）—— 与计划草图的唯一偏差，逐字说明理由**：计划的行为契约
 *              #1 让本件调 `useViewMemory("session", views[0].key, keys)`、并在 props 里留
 *              `objectType`。但**视图键有两个写入者**：① 切换器点击 ② 面板 `:72-78` 的工作台深链
 *              effect（`autoRefineTaskId` 到达 ⇒ 切 `preview`，P4 钉死）；而**唯一的读者**是面板
 *              （Step 2 逐字要求 `useSessionDetailData({ viewMode: viewKey === views[0].key ? "raw" :
 *              "preview" })`）。若 hook 住本件，面板就必须再挂一条「镜像 state + 回写通道」才能同时
 *              满足读写两侧 —— 那是**两条额外同步边**，且两处各自 `useViewMemory` 会是两个独立
 *              `useState` 读同一个 localStorage 键（点击后**静默失同步**）。故 `useViewMemory` 上移
 *              到面板（**唯一真身、唯一写入者**），本件收 `viewKey` / `onViewKeyChange` 两个受控
 *              props；C5 的键口径 `view:default:{objectType}` 与「web 早退不写记忆」两条行为判据
 *              一字不变（H4/H5 逐条绿）。⇒ **本件 props 里没有 `objectType`**（它随 hook 一起上移）。
 * @ai-context: **C11 的错误槽位**：切换器行的**紧下一行**有恰 1 个空槽位（`class` + `data-` 双钩子）。
 *              批 5 **只预留结构与样式钩子**：不加 CSS 规则、**不重排**任何既有 `StatusLine`
 *              调用点（T14 的笔记侧同形，两处槽位互不相干）。
 * @ai-context: **包装元素声明（T2 的头注说"不新增 wrapper"，本任务按 §7.3① 明确改了）**：新增
 *              `<div data-testid="session-resident-view">`（常驻包裹层，`display` 三元）与
 *              `<div className="ed-view-error-slot">`（C11 槽位）。两者都**只包视图区/槽位**，
 *              切换器行仍是 T2 的那个 flex 行（`ViewSwitcher` + `SessionRefineSection` 同行）。
 *              祖先链无 `overflow` 变化 ⇒ 不影响 T11 的粘性头。
 * @ai-context: **棘轮口径**：本件 0 处裸 `<button>`（切换器迁进 L1 原语 `ui/primitives`，原语层在
 *              扫描域外）· 0 处裸色值/裸圆角/裸字体档 ⇒ 五类棘轮域内 0 命中。⚠️ 这次迁移同时把
 *              `nativeButtonBaseline.SPLIT_MOVES` 里 T2 登记的那条搬运的**目标侧计数降到 0**，
 *              该守恒判据（`nativeButton.ratchet.test.ts` ④）的处置见 T10 报告（**STOP 项，
 *              未擅自改基线**）。
 * 副作用：无（纯展示 + 只调 `onViewKeyChange`；不读 store、不发请求、不写磁盘、**不 import
 *   Tauri**）。`lazy` 表由 `useMemo` 按 `views` 引用记忆化 ⇒ 调用点必须传稳定数组。
 * 边界：`views` 为空表（G5 的未知 `objectType`）时 `defaultKey` 退化为 `""`，切换器渲染空组、
 *   常驻区仍渲染 `resident`（不抛错）。
 */
import { Suspense, createElement, lazy, useMemo } from "react";
import type { ReactNode } from "react";
import SessionRefineSection from "./SessionRefineSection";
import type { SessionViewSlot, ViewSpec } from "../../views/registry";
import { ShellFallback } from "../../shell/ShellFallback";
import { ViewSwitcher } from "../../ui/primitives";

interface Props {
  /** 视图清单（由 `SessionsPage` 经面板注入；`[0]` 恒为默认视图 —— C1①） */
  readonly views: readonly ViewSpec<SessionViewSlot>[];
  /** 当前视图键（受控；真身 = 面板的 `useViewMemory`） */
  readonly viewKey: string;
  /** 切换请求（面板写入记忆并下沉 state） */
  readonly onViewKeyChange: (key: string) => void;
  /** 注入给非默认视图的槽（数据全在这里，视图自身零取数 —— C14②） */
  readonly slot: SessionViewSlot;
  /** **默认视图**的同步元素（原文；面板直接渲染，不经 `React.lazy`）——常驻（§7.3①） */
  readonly resident: ReactNode;
  /** C11 预留槽的内容（批 5 不传 ⇒ 槽位恒空；批 8 才落像素判定） */
  readonly errorSlot?: ReactNode;
  /** 精修工具条的显隐/启用条件（面板按 detail 计算后传入，与 T2 逐字相同） */
  readonly refining: boolean;
  readonly onStartRefine: () => void;
  readonly canSecondPass: boolean;
  readonly onOpenPass2: () => void;
  readonly onOpenProofread: () => void;
}

export default function SessionViewHost({
  views,
  viewKey,
  onViewKeyChange,
  slot,
  resident,
  errorSlot,
  refining,
  onStartRefine,
  canSecondPass,
  onOpenPass2,
  onOpenProofread,
}: Props) {
  /** 默认视图键（`views` 空表 ⇒ `""`，切换器渲染空组而不是抛错） */
  const defaultKey = views.length > 0 ? views[0].key : "";
  /**
   * 惰性映射：**默认视图的 `load` 缺省 ⇒ 值为 `null`**，永不进 `React.lazy`（G2/A4 的构造性证据）。
   * `lazy()` 只在这里按 `views` 引用建一次 —— 每次渲染新建会让子树恒重挂（H1 的挂载计数会当场红）。
   */
  const lazyOf = useMemo(
    () => new Map(views.map((spec) => [spec.key, spec.load ? lazy(spec.load) : null])),
    [views],
  );
  const isDefault = viewKey === defaultKey;
  const LazyView = lazyOf.get(viewKey) ?? null;

  return (
    <>
      {/* 切换器行：L1 分段控件 + 精修工具条三按钮（T2 的 DOM 顺序与同行关系逐字保留） */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <ViewSwitcher
          options={views}
          value={viewKey}
          onChange={onViewKeyChange}
          ariaLabel="会话视图"
          testId="session-view-switcher"
        />
        {/* v0.11.5（spec 5️⃣）+ v0.20.2（REQ-268/270）：精修工具条三按钮 */}
        <SessionRefineSection
          refining={refining}
          onStartRefine={onStartRefine}
          canSecondPass={canSecondPass}
          onOpenPass2={onOpenPass2}
          onOpenProofread={onOpenProofread}
        />
      </div>

      {/* C11：正文列头部的固定错误区槽位 —— 恰 1 个、批 5 恒空、批 8 才落像素与重排 */}
      <div className="ed-view-error-slot" data-view-error-slot="">
        {errorSlot}
      </div>

      {/* §7.3① 默认视图常驻：`display` 三元只切显隐，节点与挂载数不减 */}
      <div data-testid="session-resident-view" style={{ display: isDefault ? undefined : "none" }}>
        {resident}
      </div>

      {/* §7.3② 非默认视图：模块级惰性 + `Suspense`（复用 `ShellFallback`）；切走 ⇒ 卸载 */}
      {!isDefault && LazyView ? (
        <Suspense fallback={<ShellFallback />}>{createElement(LazyView, slot)}</Suspense>
      ) : null}
    </>
  );
}
