/**
 * App — 应用入口与导航壳：课堂助手 / 会话 / 笔记 等独立页面。
 *
 * @ai-context: 顶部标签导航 + 页面条件渲染（MVP 不引入路由库，保持轻量）；
 *              页面组件各自管理状态，切换不共享可变状态。
 * @ai-context: 批 2b 采集控制单一状态源：主窗 UI 整体包在
 *              <CaptureStatusProvider> 内（导航徽标/ClassroomPage/右栏同 context），
 *              浮窗分支（?float=1）单独实例化同一 provider——每窗口恰一个实例。
 * @ai-context: ADR-007（REQ-033）：本层为全局采集生命周期宿主——
 *              ① 导航栏常驻采集状态徽标（页面切换/最小化后仍可感知采集在跑）
 *              ② 监听 app:close-requested（Rust 侧拦截了关闭）→ 确认框 →
 *                 确认后 stop_live_session 再 close，取消则采集继续。
 *              ai:task-update 全局 toast（REQ-145 第二通道）与采集状态无关，保留。
 * @ai-context: 批 3 T7：顶栏不再在本文件的行内 JSX 里 —— 它提成 `shell/TopBar`（两档溢出是媒体
 *              查询的活，内联 style 表达不了）；AI toast 则从导航行搬到本层的 **fixed 覆盖层**
 *              （控制方裁决 A3：它是 1024 溢出的唯一主因，单项 373.75 px = 视口的 36.5%）。
 *              本文件负责装配、跨页状态与这层壳级覆盖层。
 * @ai-context: 批 3 T13：`PageSlot` / 两个窗口变体 / 对话面板**四处**都包了**叶级**错误边界并配
 *              `ShellFallback` 首访加载态（此前懒 chunk 失败会一路抛到最外层 AppErrorBoundary ⇒
 *              整个导航壳被卸载、已访问页状态一起丢）。边界在 `shell/ShellFallback.tsx`。
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
// 批 3 T6：9 个页面组件改由导航注册表提供（**单一真源**，规格 §10 批 3「9 页全走注册表」）。
// @ai-context: 本文件从此**不 import 任何页面模块** —— 「课堂页静态 import + 其余 8 页按页
//   lazy import」的包体纪律（批 2 包体治理）整段搬进 `shell/navRegistry.ts`；
//   「从未访问过的页不进首屏 module graph」与「访问过的页常驻、永不卸载（TD-004）」两条语义
//   都逐字保留（保活由下面的 PageSlot + mountedPages 实施，本任务未动它们一个字节）。
// @ai-context: 仍不引入路由库（规格 §3 红线 2）：入口依旧是 useState<Page>。
// 批 3 T11：⌘K 面板的 `onPick` 收口要用它校验页面键（运行期校验，不信任回调实参）
import { isPageKey, navComponent, type PageKey } from "./shell/navRegistry";
// 批 3 T7：A′ 顶栏（规格 §6.1）从本文件的 95 行内联 `<nav>` 提成独立组件 —— 两档溢出是媒体查询的活，
// 内联 style 表达不了；顶栏的宽度也因此第一次有了可测的单一落点（TopBar.tsx / TopBar.css）。
import { TopBar, TopBarAction } from "./shell/TopBar";
// 批 3 T11：⌘K 命令面板（规格 §6.1）—— 规格 §6.1 要它替代手写的 `focus*` 跳转入口，
// 本批只做**页面级跳转 + 对话面板**两条动作（`focus*` 状态机原样保留，收敛属 T12）。
// 自足实现、未 import 原语层（非目标 2）：遮罩/Esc/焦点都在它自己文件里，批 4 换成 `Modal`。
import { CommandPalette } from "./shell/CommandPalette";
// 批 3 T13：壳层的**首访加载态**与**叶级错误边界**（批 2 §瓶颈清单转交的三条）——自足实现、
// 刻意不 import 原语层（非目标 2，两个组件是批 4 换 `Loading` / `StatusLine` 的迁移点）。
import { ShellFallback, SlotErrorBoundary } from "./shell/ShellFallback";
// 批 4 T10：AI toast 从自足内联实现交给 L1 的 `Toast` 原语（文件末尾 `AiToast` 处）。
// @ai-context: 批 3 T7 曾把它从 56px 导航行搬到固定覆盖层（实测它是 1024 溢出的唯一主因：
//   单项 373.75 px = 视口的 36.5%；含它 1375.74 px、剔除它 997.99 px），本任务承其结论不动落点，
//   只把**定位 / 层级 / 三档墨度 / 退场**四项交给原语（fixed + `--ed-nav-h` 锚点 + `zIndex("toast")`
//   全在原语层）。⚠️ 这是 B5 的 barrel 代价在首屏的第二个触发点（T9 先到则归 T9）。
import { Toast } from "./ui/primitives";
// REQ-274（v0.19.4）：全局 AI 对话面板（丙案——按需唤起 + 内容保活）
// 批 2 包体治理：从静态 import 改为按需 import，并在它之前加一道「首开挂载」闸门。
// @ai-context: 原语义（见文件末尾 dock 渲染处的注释）是「常驻挂载——开合仅切 display，
//   选中态/后台任务保活」。本任务**只**把「首次打开之前」变成不挂载：dockOpen 为真过
//   一次 ⇒ dockMounted 永为真 ⇒ 之后的 open/close 仍是纯 display 切换，保活语义逐字保留
//   （控制方 2026-09-12 裁决 2：唯一被允许的行为差异就是首访挂载时序）。
// @ai-context: 收益来自它的静态依赖链 AiConversationDock → TaskConversationView →
//   ChatMessageMarkdown → rehype-katex + katex/dist/katex.min.css。实测这条链把
//   vendor-katex + vendor-md（79,916 + 50,618 = 130,534 字节 gzip）钉在首屏；摘掉后
//   首屏 gzip 227.08 → 92.79 kB（预算 200 kB，来源 docs/standards/performance.md:28）。
const AiConversationDock = lazy(() => import("./components/AiConversationDock"));
import AppErrorBoundary from "./components/AppErrorBoundary";
// 批 2 包体治理：两个窗口变体面板从静态 import 改为按需 import（各自独立 chunk）。
// @ai-context: 这两个面板只在**自己的窗口**里渲染（App() 顶部的 ?float=1 / ?overlay=1 早返回），
//   主窗永远用不到；静态 import 会让采集浮窗（alwaysOnTop 常驻）与覆盖层窗每次启动都拉完整主壳
//   —— 实测两窗首屏与主窗逐字节相同，且各自还白带另一个变体的面板代码。
// @ai-context: 唯一的行为差异是**首访挂载时序**（控制方 2026-09-12 裁决 2 允许的范围）：chunk 到达前
//   该窗渲染 Suspense fallback(null)；挂载后本窗无导航，不存在卸载路径，保活语义不变。
const CaptureFloatPanel = lazy(() => import("./components/CaptureFloatPanel"));
const CaptureOverlayPanel = lazy(() => import("./components/CaptureOverlayPanel"));
// v0.16.1：浏览器痕迹去除（原生右键菜单抑制 + 文本输入应用内右键小菜单）
import BrowserChrome from "./components/BrowserChrome";
// 批 2b：采集控制单一状态源（每窗口单实例 provider + 消费 hook + reason 文案）
import { CaptureStatusProvider, useCaptureControl } from "./hooks/useLiveCaptureControl";
import { pauseReasonLabel } from "./hooks/liveCaptureState";
// 批 6 T17：壳层相变态通道（规格 §6.3）—— 采集态取既有采集单一状态源，复习态由复习页自持（T19 接线）
import { useShellPhase } from "./shell/shellPhase";
import type { AiTaskState } from "./types";

// 页面键 = 注册表键集（批 3 T6：从前是 9 个字面量的手写联合，现在从注册表派生）
type Page = PageKey;

// 9 个页面组件取自注册表：`navComponent` 保留各自**精确的 props 类型**，故下面 9 段
// <PageSlot> JSX 与本任务之前逐字相同，只换了标识符的来源（注册表不得包 wrapper：
// 组件标识必须稳定，否则每次渲染都会重挂载、保活失效）。
const ClassroomPage = navComponent("classroom");
const SessionsPage = navComponent("sessions");
const NotesPage = navComponent("notes");
const ActionPage = navComponent("action");
const ReviewPage = navComponent("review");
const ChatPage = navComponent("chat");
const KnowledgePage = navComponent("knowledge");
const GoalsPage = navComponent("goals");
const SettingsPage = navComponent("settings");

// 顶栏项不再在本文件里另立清单（批 3 T7）：`NAV_ITEMS`（含 emoji 长名的派生态）已删除，
// 顶栏直接消费注册表的 `label` / `icon`（规格 §6.1 的短名 + §1 决策 5 的自绘线性图标）。
// 冻结判据在 `shell/navRegistry.test.ts` 第 ⑤ 层（顺序 + label 逐字），T7 起值 = 纯文字（emoji 出局）。

function App() {
  // URL per-window 标志早返回（不渲染主导航壳）。批 2b 采集控制单一状态源：
  // 主窗与浮窗各持**一份** CaptureStatusProvider（独立 webview 无法共享 context，
  // 各自实例化；同一窗口禁止第二实例——双监听双查询即漂移根源）
  const query = new URLSearchParams(window.location.search);
  // v0.12.0 M3：系统级覆盖层截图窗口入口（全屏透明 1:1 框选；无采集控制需求）
  if (query.get("overlay") === "1") {
    return (
      // 批 2：面板是 lazy chunk —— 加载完即常驻（本窗无导航）
      // 批 3 T13：套一层**叶级**边界 + 首访加载态 —— 此前 chunk 失败 = 本窗全空白（批 2 风险 1）
      <SlotErrorBoundary>
        <Suspense fallback={<ShellFallback />}>
          <CaptureOverlayPanel />
        </Suspense>
      </SlotErrorBoundary>
    );
  }
  // v0.12.0 M6：采集浮窗入口（独立窗口 alwaysOnTop，加载 index.html?float=1）；
  // float 标志 per-window 恒定（URL 不变）——早返回安全
  if (query.get("float") === "1") {
    return (
      // 批 2：CaptureStatusProvider 必须留在 Suspense **外层**——它是本窗「每窗恰一个实例」的
      // 采集状态源（见文件头 @ai-context），塞进 Suspense 会改变它自己的挂载时机
      // 批 3 T13：边界加在 provider **内层**（状态源层级不动）；chunk 失败不再让本窗全空白
      <CaptureStatusProvider>
        <SlotErrorBoundary>
          <Suspense fallback={<ShellFallback />}>
            <CaptureFloatPanel />
          </Suspense>
        </SlotErrorBoundary>
      </CaptureStatusProvider>
    );
  }
  return (
    // v0.8.0 真机白屏防御（2026-08-21）：全局错误边界——渲染异常显示错误卡片
    // 而非整树卸载白屏（AppErrorBoundary）
    <AppErrorBoundary>
      <CaptureStatusProvider>
        <MainShell />
      </CaptureStatusProvider>
    </AppErrorBoundary>
  );
}

/**
 * PageSlot — 页面容器：首访挂载 + 保活 + display 门控 + 独立 Suspense。
 *
 * @ai-context: 批 2 包体治理的挂载闸门，也是「保留挂载」语义的唯一实现点。
 *   · mounted=false ⇒ 整棵子树不渲染 ⇒ 该页的 lazy chunk **不会被请求**（首屏收益的来源）；
 *   · mounted=true 之后永不回到 false ⇒ 已访问页面常驻（TD-004 保活语义，状态与事件监听不重置）；
 *   · 每页一个独立 Suspense + **叶级** `SlotErrorBoundary`：只有**新挂载**的页会挂起，
 *     已经可见的页不会因为邻居加载而被替换成 fallback（避免可见的闪烁）。
 * @ai-context: 批 3 T13：fallback 从 `null` 换成 `ShellFallback`（首访加载态，静态无动效），并在
 *   ⚠️ Suspense 之外加了**叶级**边界：懒 chunk 失败原本会一路抛到最外层 AppErrorBoundary ⇒
 *   **整个 MainShell 被卸载**（已访问页状态一起丢，批 2 评审 M-1）。边界在本函数内 ⇒ 只卸载出错的
 *   那一页，兄弟槽位与壳层状态保留（证明见 `shell/ShellFallback.test.tsx` 的「叶级」用例）。
 * 副作用：无。边界：children 是懒组件元素，未 mounted 时不会被 React 渲染 ⇒ 不触发 dynamic import。
 */
function PageSlot({ show, mounted, children }: { show: boolean; mounted: boolean; children: React.ReactNode }) {
  if (!mounted) return null;
  return (
    <div style={{ flex: 1, display: show ? "block" : "none", overflow: "hidden" }}>
      <SlotErrorBoundary>
        <Suspense fallback={<ShellFallback />}>{children}</Suspense>
      </SlotErrorBoundary>
    </div>
  );
}

/**
 * AiToast — AI 任务完成/失败通知的**装配层**（批 4 T10：渲染交给 L1 `Toast`）。
 *
 * @ai-context: 状态仍由 `MainShell` 持有（监听 `ai:task-update`），本组件只做「状态 → 原语 props」
 *   的映射，并把迁移前逐字保留的三样东西钉在一处：文案（含 ✨/❌，逐字沿用）、时长 **3500ms**、
 *   testId **`ai-toast`**（批 3 裁决 A3 的语义锚；B15 要求它以**渲染级**断言保住 —— 本仓
 *   `MainShell` 未导出，故判据渲染这个**真实**装配件，见 `components/toastMigration.test.tsx`）。
 *   位置档 `placement="belowNav"`（读原语 `.ed-toast--below-nav`，消费壳层 token `--ed-nav-h`）：
 *   调用点写行内 `top` 覆盖类语义被 ADR-033 §4 逐字禁止 ⇒ 走 B6 特殊条款加的那个具名 prop。
 * 副作用：无（不读 store、不发请求、不写磁盘）。自动消失由原语计时（进入 `entered` 才开始，
 *   边界①），到点走 140ms 退场后回调 `onDismiss` —— 父级自己置 `open=false` 不会收到回敬（边界②）。
 * 边界：**同文案连续事件不重置窗口**（原语边界③ 以 `message`/`kind` 判「接管」）——迁移前
 *   `MainShell` 的裸 `setTimeout` 是「每个事件都重新计时」；差异只在「两次 AI 任务在同一 3.5s 内
 *   完成且文案逐字相同」时出现（该场景下可见时长可能比旧实现短，不会更长）。已登记在 T10 报告。
 */
export function AiToast({
  toast,
  onDismiss,
}: {
  toast: { text: string; kind: "ok" | "err" } | null;
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <Toast
      open={toast !== null}
      message={toast?.text ?? ""}
      kind={toast?.kind ?? "ok"}
      durationMs={3500}
      placement="belowNav"
      testId="ai-toast"
      onDismiss={onDismiss}
    />
  );
}

/** 主导航壳（唯一实例由 App 包入 provider——同窗单实例纪律；状态与事件监听
 *  保留挂载语义不变，TD-004） */
function MainShell() {
  const [page, setPage] = useState<Page>("classroom");
  // 批 2：首访挂载集合。初始只有默认页 —— 其余页面在首次被选中后的下一帧挂载。
  // @ai-context: 用 useState + useEffect 而不是「渲染期 ref.add」：渲染期改 ref 在
  //   StrictMode 下虽幂等，但仍是渲染副作用；本仓 React 19 StrictMode 会双调用渲染。
  //   代价是切页时首帧内容区为空（本来也要等 chunk 下载），无观感回归。
  const [mountedPages, setMountedPages] = useState<ReadonlySet<Page>>(() => new Set<Page>(["classroom"]));
  useEffect(() => {
    setMountedPages((prev) => (prev.has(page) ? prev : new Set(prev).add(page)));
  }, [page]);
  // 2026-08 A4：跨页直达目标会话（课堂助手融合完成 → 会话页自动打开详情）
  const [focusSessionId, setFocusSessionId] = useState<number | null>(null);
  // v0.7.1：跨页直达目标笔记（会话页"查看笔记" → 笔记页自动选中并滚动可见）
  const [focusNoteId, setFocusNoteId] = useState<number | null>(null);
  // v0.19.1（REQ-260）：引用跳笔记 + 命中词高亮（key 递增——同笔记重复引用可重触发）
  const [focusNoteSearch, setFocusNoteSearch] = useState<{ noteId: number; search: string; key: number } | null>(null);

  // v0.19.1 审查 H1 修复：普通打开统一清带词态——focusNoteSearch 只写不清时，
  // NotesPage 合并 effect 会优先取残留的旧引用笔记，后续普通跨页跳转被重定向
  // 到错误笔记（本函数为唯一普通入口；带词打开走 onOpenNoteHighlight 双设）
  const openNotePlain = (noteId: number) => {
    setFocusNoteSearch(null);
    setFocusNoteId(noteId);
    setPage("notes");
  };

  // 批 3 T12（规格 §6.1「⌘K 命令入口用来替代现在手写的 `focus*` 参数跳转」）：把这 10 个 `focus*`
  // 字段的**跨页跳转入口**收敛成具名函数 —— ⌘K 命令与页内回调从此走**同一实现**（此前同一段
  // 「setFocus…+setPage」在 2–4 处各写一遍）。⚠️ 边界（计划 Step 5 明写）：**只收敛入口** ——
  // 状态机、字段类型、各页消费逻辑一个字节未动（删字段 / 改路由参数是批 5 的视图层重构）。
  // 入口映射：⌘K 侧能独立发起的是页面命令（9 个）· 建体系向导 · 检索结果（带 ID 的笔记深链）；
  // 其余带 ID 的深链（会话/体系/复习组/工作台/对话）仍由**页内入口**发起 —— ID 只有页内有。
  const goSessions = (sessionId: number) => {
    setFocusSessionId(sessionId);
    setPage("sessions");
  };
  // REQ-260：带词高亮打开（引用卡片与 ⌘K 检索结果的**共同实现**）——与上面的普通打开是两条路：
  // 普通打开必须清带词态（审查 H1），带词打开双设 focusNoteSearch（key 递增让同笔记可重触发）
  const openNoteHighlight = (noteId: number, search: string) => {
    setFocusNoteId(noteId);
    setFocusNoteSearch({ noteId, search, key: Date.now() });
    setPage("notes");
  };
  const goSystem = (systemId: number) => { setFocusSystemId(systemId); setPage("knowledge"); };
  const goGroup = (groupId: number) => { setFocusGroupId(groupId); setPage("notes"); };
  // 组预选允许 null（NotesPage 的「复习全部」路径——收敛前那个内联箭头也是这么推出来的）
  const goReviewGroup = (groupId: number | null) => { setFocusReviewGroupId(groupId); setPage("review"); };
  const goChatSession = (chatId: number) => { setFocusChatId(chatId); setPage("chat"); };
  const goChatTask = (taskId: number) => { setFocusChatTaskId(taskId); setPage("chat"); };
  const goRefineWorkbench = (sessionId: number, taskId: number) => {
    setFocusSessionId(sessionId);
    setFocusRefineTaskId(taskId);
    setPage("sessions");
  };
  // 10 个 focus* 字段里**唯一无载荷**的入口（建体系向导不需要 ID）⇒ 它能由 ⌘K 独立发起
  const openSystemWizard = () => { setCreateSystemSignal((s) => s + 1); setPage("knowledge"); };
  // v0.13.7：跨页直达目标体系（组行徽标/结算简报 → 体系页自动选中）
  const [focusSystemId, setFocusSystemId] = useState<number | null>(null);
  // TD-2026-09-05-A：外部请求打开建体系向导（笔记页空体系引导 → 体系页向导）
  const [createSystemSignal, setCreateSystemSignal] = useState(0);
  // v0.14 C2：图谱组节点 → 笔记页过滤该组（同 focusNoteId 模式）
  const [focusGroupId, setFocusGroupId] = useState<number | null>(null);
  // v0.20.10（批 5）：跨页直达复习页并预选组（笔记域 ⓘ「复习本组」深链；
  // 仿 focusGroupId 模式——ReviewPage 消费后经 onFocusGroupConsumed 清空）
  const [focusReviewGroupId, setFocusReviewGroupId] = useState<number | null>(null);
  // v0.16.1：工作台深链（对话页任务视图 → 会话页自动展开精修工作台）与
  // 任务进入对话页（会话页精修启动 → AI 对话页选中该任务）
  const [focusRefineTaskId, setFocusRefineTaskId] = useState<number | null>(null);
  const [focusChatTaskId, setFocusChatTaskId] = useState<number | null>(null);
  // REQ-274：对话面板开合 + 「在对话页继续」直达会话（消费后清空）
  const [dockOpen, setDockOpen] = useState(false);
  // 批 2：首次打开之前的挂载闸门（打开过即常驻，见 import 处的 @ai-context）。
  // @ai-context: 用 effect 而不是「渲染期 if (dockOpen) setDockMounted(true)」——渲染期改
  //   state 会让 React 19 多跑一轮渲染（StrictMode 下更明显）；代价只是首开首帧 dock 仍
  //   缺席（本来也要等它的 chunk 下载），无观感回归。与 mountedPages 同一模式。
  // 副作用：仅置真、无回落路径 ⇒ 一旦挂载过就永不卸载（TD-004 保活）。
  const [dockMounted, setDockMounted] = useState(false);
  useEffect(() => {
    if (dockOpen) setDockMounted(true);
  }, [dockOpen]);
  const [focusChatId, setFocusChatId] = useState<number | null>(null);
  // 全局采集状态（ADR-007：与页面解耦，徽标常驻导航栏）。
  // 批 2b：capturing/recovering/paused 三份本地状态删除——采集控制单一状态源
  // （CaptureStatusProvider context；挂载拉取+事件+看门狗全在其内）
  const capture = useCaptureControl();
  // 批 6 T17（规格 §6.3 / R4.4）：本层是壳层相变的**唯一写入方**——采集进行中 ⇒ "capture"（58px LIVE
  // 仪表相位），否则 "idle"（常态）。不新增 state / effect：相位由既有 `capture.active` 派生。
  useShellPhase(capture.active ? "capture" : "idle");
  // v0.8.0 F2（2026-08-21）：AI 任务完成通知——全局监听 ai:task-update，
  // 跨页面可见（REQ-145"完成通知"落地；内联卡片之外的第二通道）
  const [aiToast, setAiToast] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  // 批 4 T10：本层原有的 `toastTimer` ref 与 `setTimeout(…, 3500)` 整段删除——计时权归
  // `Toast` 原语（时长由 `AiToast` 的 `durationMs={3500}` 给，逐字保留），到点退场后回调
  // `onDismiss` 置空。卸载清理也随之归原语（边界⑤：cleanup 直接读 ref，快照 ref = 死守卫）。

  useEffect(() => {
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    // 监听器注册为异步（listen 返回 Promise<UnlistenFn>）；组件卸载时统一解绑
    (async () => {
      // v0.8.0 F2：AI 任务完成通知（状态终态 → 全局 toast，3.5s 自动消失）
      unlisteners.push(
        await listen<[number, AiTaskState]>("ai:task-update", (e) => {
          if (disposed) return;
          const st = e.payload[1];
          if (st === "Succeeded") {
            setAiToast({ text: "✨ AI 任务已完成——可到内联卡片或「AI 任务中心」查看结果并采纳", kind: "ok" });
          } else if (typeof st === "object" && st !== null && "Failed" in st) {
            const reason = st.Failed.reason;
            const [kind, msg] = Object.entries(reason)[0] ?? ["other", "未知错误"];
            setAiToast({ text: `❌ AI 任务失败（${kind}）：${msg}`, kind: "err" });
          }
          // 批 4 T10：原先此处「清理旧 timer 重新计时」的两行已删——连续任务只显示最新这条
          // 由原语边界③（显示中 message/kind 变化 = 接管并重排计时；先清后排 ⇒ 至多一个计时器）承担。
        }),
      );
      // 批 2b：live:status / session:fusing / live:paused / live:resumed /
      // live:recovering / live:recovered 监听删除——采集控制状态收敛全部下沉
      // CaptureStatusProvider（本壳徽标消费 context；recovering 组合文案同源）
      // Rust 侧 CloseRequested 拦截（采集进行中）→ 用户确认后才停止并退出
      unlisteners.push(
        await listen("app:close-requested", async () => {
          const ok = await confirm("当前正在进行采集，确定要停止并退出吗？", {
            title: "熵减",
            kind: "warning",
          });
          if (ok) {
            // 停止采集（失败也继续尝试关闭——无活动会话时 CloseRequested 直接放行；
            // 若会话仍存活则再次拦截弹框，用户可二次决定）
            // Low 清扫：不吞异常——失败时记录上下文便于诊断（不阻断退出流程）
            await invoke("stop_live_session").catch((e) => {
              console.warn("[App] app:close-requested 停止采集失败（继续关闭）:", e);
            });
            await getCurrentWindow().close();
          }
        }),
      );
    })();
    return () => {
      disposed = true;
      unlisteners.forEach((u) => u());
    };
  }, []);

  // REQ-274：对话面板本地快捷键 Ctrl+Shift+A（v1 本地 window 级——全局
  // 快捷键随插件能力后续升级）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        setDockOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 批 3 T11：⌘K / Ctrl+K 命令面板（规格 §6.1）。与上面的 Ctrl+Shift+A 并列而**互不遮蔽**：
  // 本处理器显式排除 Shift 与 Alt，且两条组合各自判 `e.key`（先判更具体的组合是纪律，不是巧合）。
  // ⚠️ 平台取舍：规格写的是「⌘K」（macOS 的 Command），本实现只判 `ctrlKey` —— 本应用是 Windows
  // 目标（Tauri 主窗），且 T7 顶栏按钮的文案/提示已定为「Ctrl+K」（单一说法）。
  // ⇒ macOS 的 `metaKey` 适配登记给做 macOS 支持的那一批（批 4/6 任一处），不在本任务里加半套。
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    // 全局错误边界在 App 外层（批 2b 结构调整后包住 provider+壳，职责不变）
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      {/* v0.16.1：浏览器痕迹去除——原生右键菜单抑制 + 文本输入应用内右键小菜单 */}
      <BrowserChrome />
      {/* 批 3 T7：A′ 顶栏（规格 §6.1）。原内联 9-Tab + 双 `marginLeft:auto` 布局已删除，
          改为 `shell/TopBar`（8 个域 Tab + ⌘K + ⚙ 齿轮，两档溢出走媒体查询）。
          `right` 插槽里是**两个常驻状态件**（都是已接线功能，不许在本步消失）：
            · `dock-toggle` —— REQ-274 全局 AI 对话面板的**唯一显式入口**（T11-b 裁定：**保留**；
              T11 的命令面板里另给一条「对话面板」命令，那条是**增量**入口，不替代它）；
            · 采集徽标 —— ADR-007，切页/最小化后仍可见采集状态（规格 §6.1 明确列了「采集状态」）。
          AI toast **不在**这里：它是本文件下方 `MainShell` 最外层渲染的 fixed 覆盖层（裁决 A3）。 */}
      <TopBar
        page={page}
        onSelect={(key) => setPage(key)}
        onOpenSettings={() => setPage("settings")}
        // 批 3 T11：⌘K 按钮与 Ctrl+K 快捷键都开同一个面板（T7 时这里还是空实现）
        onOpenPalette={() => setPaletteOpen(true)}
        right={
          <>
            <TopBarAction
              testId="dock-toggle"
              icon="ai"
              label="对话面板"
              title="AI 任务对话面板（Ctrl+Shift+A）"
              pressed={dockOpen}
              onClick={() => setDockOpen((v) => !v)}
            />
            {/* 全局采集徽标（ADR-007）：切页/最小化后仍可见采集状态。
                批 2b：paused → pausedReason 三态文案（manual/media/foreground 同源，
                与右栏/浮窗一致）；recovering 与 paused 组合文案保持原语义。
                T7：`marginLeft:auto` 删除 —— 定位由 `.ed-topbar__right`（整块 margin-left:auto）负责。 */}
            {capture.active && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: capture.pausedReason || capture.recovering ? "#b45309" : "#0d9488",
                  background: capture.pausedReason || capture.recovering ? "#fffbeb" : "#f0fdfa",
                  border: `1px solid ${capture.pausedReason || capture.recovering ? "#f59e0b" : "#14b8a6"}`,
                  borderRadius: 12,
                  padding: "3px 10px",
                  whiteSpace: "nowrap",
                }}
              >
                {/* 审查修复（观察 2026-08-29-2）：恢复态文案区分"暂停挂起"——
                    暂停期重连风暴曾显示"采集中/恢复中"误导，现在明确"暂停中"语义 */}
                {capture.recovering
                  ? capture.pausedReason
                    ? "⏸ 暂停挂起（重连中）"
                    : "⚠️ 采集恢复中"
                  : capture.pausedReason
                    ? pauseReasonLabel(capture.pausedReason)
                    : "🎙 采集中"}
              </span>
            )}
          </>
        }
      />

      {/* 页面区（TD-004：保留挂载 + display 切换——页面切换不重挂载，
          避免 ClassroomPage 每次进入重复窗口枚举 100-500ms 停顿；状态与事件监听保留） */}
      <main style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <PageSlot show={page === "classroom"} mounted={mountedPages.has("classroom")}>
          {/* 2026-08 A4：融合完成直达会话（onOpenSessions 跳转 + focusSessionId 定位） */}
          <ClassroomPage onOpenSessions={goSessions} />
        </PageSlot>
        <PageSlot show={page === "sessions"} mounted={mountedPages.has("sessions")}>
          {/* v0.7.1：active 驱动列表刷新（display:none 挂载不刷新根治）+ 查看笔记跨页直达 */}
          <SessionsPage
            focusSessionId={focusSessionId}
            // 批 5 C6：深链消费后复位（同会话再次跳转才能重新触发——旧形态固定值粘滞）
            onFocusSessionConsumed={() => setFocusSessionId(null)}
            // v0.16.1：工作台深链 / 精修启动 → AI 对话页（focus 消费后即清空）
            focusRefineTaskId={focusRefineTaskId}
            onFocusRefineTaskConsumed={() => setFocusRefineTaskId(null)}
            // 精修启动 → AI 对话页（T12：入口收敛为 goChatTask；sessionId 仍被忽略——与收敛前逐字一致）
            onRefineTaskStarted={(_sessionId, taskId) => goChatTask(taskId)}
            active={page === "sessions"}
            onOpenNote={(id) => openNotePlain(id)}
          />
        </PageSlot>
        <PageSlot show={page === "notes"} mounted={mountedPages.has("notes")}>
          {/* v0.7.1：focusNoteId 定位 + 来源会话反向跳转（与课堂助手 onOpenSessions 同模式） */}
          <NotesPage
            focusNoteId={focusNoteId}
            focusNoteSearch={focusNoteSearch}
            focusGroupId={focusGroupId}
            // 批 5 C6：三个 focus* 共用一个复位回调（消费即清——复位后同目标再次跳转仍触发）
            onFocusNoteConsumed={() => { setFocusNoteId(null); setFocusNoteSearch(null); setFocusGroupId(null); }}
            // v0.20.10（批 5）：ⓘ「复习本组」深链 → 复习页组预选（T12：入口收敛为 goReviewGroup）
            onOpenReview={goReviewGroup}
            onOpenSystem={goSystem}
            onCreateSystem={openSystemWizard}
            onOpenSessions={goSessions}
          />
        </PageSlot>
        {/* v0.20.5：行动域页（保活挂载 + active 门控切回重载——TD-004 模式） */}
        <PageSlot show={page === "action"} mounted={mountedPages.has("action")}>
          <ActionPage active={page === "action"} />
        </PageSlot>
        {/* v0.20.10（批 5）：复习域页（保活挂载 + active 门控切回重载——
            闪卡域无事件总线，TD-004 模式同 ActionPage；focusReviewGroupId 深链
            组预选，消费后清空） */}
        <PageSlot show={page === "review"} mounted={mountedPages.has("review")}>
          <ReviewPage
            active={page === "review"}
            focusGroupId={focusReviewGroupId}
            onFocusGroupConsumed={() => setFocusReviewGroupId(null)}
          />
        </PageSlot>
        <PageSlot show={page === "chat"} mounted={mountedPages.has("chat")}>
          {/* v0.16.0：AI 对话页——跨页跳转复用 focus 机制（任务对话引用 → 会话/笔记/设置）。
              2026-09-09 批 1：active 门控透传——保活挂载下切回重同步（别页发起/完成的
              AI 任务本页无感知；SessionsPage/ActionPage 同款 active 语义） */}
          <ChatPage
            active={page === "chat"}
            onOpenSessions={goSessions}
            onOpenNote={(id) => { setFocusNoteId(id); setPage("notes"); }}
            onOpenNoteHighlight={openNoteHighlight}
            onOpenSettings={() => setPage("settings")}
            // v0.16.1：任务进入对话页（会话页精修启动自动跳转）；任务视图 → 工作台深链
            focusTaskId={focusChatTaskId}
            onFocusTaskConsumed={() => setFocusChatTaskId(null)}
            // REQ-274：对话面板「在对话页继续」直达会话（消费后清空）
            focusChatId={focusChatId}
            onFocusChatConsumed={() => setFocusChatId(null)}
            onOpenRefineWorkbench={goRefineWorkbench}
          />
        </PageSlot>
        <PageSlot show={page === "knowledge"} mounted={mountedPages.has("knowledge")}>
          {/* v0.13.1：知识体系页（三时钟纪律——体系进周/季度视图，不与每日复习面混排）
              v0.13.7：focusSystemId 跨页直达（组行徽标/结算简报 → 自动选中体系） */}
          <KnowledgePage
            focusSystemId={focusSystemId}
            // 批 5 C6：深链消费后复位（同体系再次跳转才能重新触发）
            onFocusSystemConsumed={() => setFocusSystemId(null)}
            createSystemSignal={createSystemSignal}
            onOpenNote={(id) => { setFocusNoteId(id); setPage("notes"); }}
            onOpenGroup={goGroup}
          />
        </PageSlot>
        <PageSlot show={page === "goals"} mounted={mountedPages.has("goals")}>
          {/* v0.18.0：学习目标页（意图层——列表是导航不是仪表盘） */}
          <GoalsPage />
        </PageSlot>
        <PageSlot show={page === "settings"} mounted={mountedPages.has("settings")}>
          {/* 2026-08-21：设置页（保留挂载——面板状态不因切页重置；TD-004 同模式）；
              active 透传——学习库段 8s 轮询按可见性门控（v0.19.1 审查 L2） */}
          <SettingsPage active={page === "settings"} />
        </PageSlot>
      </main>
      {/* v0.8.0 F2：AI 任务完成通知（全局 toast——跨页面可见）。
          批 3 T7（控制方裁决 A3）：**从 `<nav>` 行内搬到 fixed 覆盖层** —— 它曾是 1024 溢出的唯一主因
          （单项 373.75 px = 视口的 36.5%；含它 1375.74、剔除它 997.99），规格 §6.1 的顶栏清单里
          也没有它。落在 `MainShell` 最外层（**不是** nav 的子节点）⇒ 不参与顶栏宽度分配，
          1024 档的宽度验收因此**不必**把 toast 剔出去（剔除读数求通过是本批禁止的自我欺骗）。
          跨页面可见性不变：它挂在导航壳上，与页面切换无关。
          批 4 T10：**渲染交给 L1 的 `Toast` 原语**（`<AiToast>` 装配件，见本文件上方）——
          自足内联的定位 / 三档配色 / `zIndex("toast")` / 计时器整段删除；`.ed-toast` 的 fixed 定位、
          `.ed-toast--below-nav` 的 `--ed-nav-h` 锚点、层级标尺都在原语层（判据随之搬到
          `shell/TopBar.test.tsx` 的原语层断言 + `components/toastMigration.test.tsx`）。
          ⚠️ 观感差异三处（全部登记）：① 横向 16 → 18px（原语基类的 `right`）② 圆角/内边距/字号走
          原语类与 `Text` 字阶（不再逐字沿用旧内联值）③ 多出 180ms 进场 / 140ms 退场（B9「迁移即
          上线动效」）。文案与 testId `ai-toast` 逐字保留。 */}
      <AiToast toast={aiToast} onDismiss={() => setAiToast(null)} />
      {/* 批 3 T11/T12：⌘K 命令面板（规格 §6.1）。它是**壳级覆盖层**，与 toast 一样挂在导航壳最外层、
          不是任何页面的子节点（切页不重挂、也不参与页面布局）。
          `onPick` 收口三类动作（回调实参不被信任）：页面级 `setPage`（key 仍经 `isPageKey` 运行期校验）·
          打开对话面板 · **T12 新增的两类** —— 检索结果（`kind:"hit"`：带载荷的深链入口，落到
          `focusNoteId` + `focusNoteSearch`，与引用卡片共用 `openNoteHighlight`）与无载荷的 `focus*`
          入口（`kind:"create-system"`）。`focus*` 状态机本身原样不动（收敛的只是入口，见 T12 报告）。
          Esc / 点遮罩 / 焦点都在组件内部（自足实现，见 `shell/CommandPalette.tsx` 文件头）。 */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onPick={(pick) => {
          if (pick.kind === "dock") {
            setDockOpen(true);
            return;
          }
          if (pick.kind === "hit") {
            openNoteHighlight(pick.jump.noteId, pick.jump.search);
            return;
          }
          if (pick.kind === "create-system") {
            openSystemWizard();
            return;
          }
          if (isPageKey(pick.key)) setPage(pick.key);
        }}
      />
      {/* REQ-274：全局 AI 对话面板（常驻挂载——开合仅切 display，选中态/后台任务保活）。
          批 2：闸门只加在**首开之前** —— dockMounted 一旦为真永不复位，此后 open/close
          仍是纯 display 切换（保活语义逐字保留）；独立 Suspense 与 PageSlot 同理由：chunk 首次
          到达前渲染 `ShellFallback`（批 3 T13），加载失败由**这一层的叶级边界**兜底（不再拖垮整壳）。 */}
      {dockMounted && (
        <SlotErrorBoundary>
          <Suspense fallback={<ShellFallback />}>
            <AiConversationDock
              open={dockOpen}
              onClose={() => setDockOpen(false)}
              onOpenChat={goChatSession}
              onOpenTaskInChat={goChatTask}
              onOpenSessions={goSessions}
              onOpenNote={openNotePlain}
              onOpenRefineWorkbench={goRefineWorkbench}
            />
          </Suspense>
        </SlotErrorBoundary>
      )}
      </div>
  );
}

export default App;
