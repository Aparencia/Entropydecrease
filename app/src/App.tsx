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
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
// 批 2 包体治理：课堂页（默认页）**保持静态 import**。
// @ai-context: 它是首屏必渲染的页面 —— 改成 lazy 只是把同一批字节挪进动态 chunk，
//   首屏仍要多一次 chunk 往返，且预算读数会失真（控制方 2026-09-12 裁决 2 末条认可该判断）。
import ClassroomPage from "./pages/ClassroomPage";
// 批 2 包体治理：其余 8 个页面从静态 import 改为按页动态 import。
// @ai-context: 「保留挂载（TD-004）」的语义按页保留 —— **访问过的页常驻、永不卸载**；
//              只是「从未访问过的页」不再进入首屏 module graph。
// @ai-context: 不引入路由库（规格 §3 红线 2）：入口仍是 useState<Page> + NAV_ITEMS，
//              只是每个页面成为一个独立 chunk。
const NotesPage = lazy(() => import("./pages/NotesPage"));
const SessionsPage = lazy(() => import("./pages/SessionsPage"));
// v0.20.5：行动域页（做——行动中心独立成页，意图分层）
const ActionPage = lazy(() => import("./pages/ActionPage"));
// v0.20.10（批 5，用户问题 6）：复习域页（练——复习面独立顶层 Tab；spec §9 二期兑现）
const ReviewPage = lazy(() => import("./pages/ReviewPage"));
// v0.16.0：AI 对话页（纯聊天 + AI 任务对话视图——DSH 交互范式）
const ChatPage = lazy(() => import("./pages/ChatPage"));
// 2026-08-21 用户需求：设置页（课堂助手设置类面板迁出，单页滚动+分组）
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
// v0.13.1：知识体系页（三时钟纪律——体系进周/季度视图，不入每日复习面）
const KnowledgePage = lazy(() => import("./pages/KnowledgePage"));
// v0.18.0：学习目标页（意图层——独立 Tab，零叙事元素）
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
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
import type { AiTaskState } from "./types";

type Page = "classroom" | "sessions" | "notes" | "action" | "review" | "chat" | "knowledge" | "goals" | "settings";

const NAV_ITEMS: { key: Page; label: string }[] = [
  { key: "classroom", label: "📡 课堂助手" },
  { key: "sessions", label: "🗂 会话" },
  { key: "notes", label: "📝 笔记" },
  // v0.20.5：行动域页（做——行动裁决/SOP/练习/问题；独立 Tab 唯一入口）
  { key: "action", label: "✅ 行动" },
  // v0.20.10（批 5）：复习域页（练——到期感知唯一入口，无被动提醒；
  // 顶层 Tab=9 触发 spec §9 导航收纳观察项，收纳设计另行立项）
  { key: "review", label: "🔄 复习" },
  // v0.16.0：AI 对话页（纯聊天 + AI 任务对话视图）
  { key: "chat", label: "💬 AI 对话" },
  { key: "knowledge", label: "🧠 体系" },
  // v0.18.0：学习目标（意图层——目标=组的容器，N:M 绑定）
  { key: "goals", label: "🎯 目标" },
  { key: "settings", label: "⚙ 设置" },
];

function App() {
  // URL per-window 标志早返回（不渲染主导航壳）。批 2b 采集控制单一状态源：
  // 主窗与浮窗各持**一份** CaptureStatusProvider（独立 webview 无法共享 context，
  // 各自实例化；同一窗口禁止第二实例——双监听双查询即漂移根源）
  const query = new URLSearchParams(window.location.search);
  // v0.12.0 M3：系统级覆盖层截图窗口入口（全屏透明 1:1 框选；无采集控制需求）
  if (query.get("overlay") === "1") {
    return (
      // 批 2：面板是 lazy chunk —— 首次拉取期间渲染 fallback(null)，加载完即常驻（本窗无导航）
      <Suspense fallback={null}>
        <CaptureOverlayPanel />
      </Suspense>
    );
  }
  // v0.12.0 M6：采集浮窗入口（独立窗口 alwaysOnTop，加载 index.html?float=1）；
  // float 标志 per-window 恒定（URL 不变）——早返回安全
  if (query.get("float") === "1") {
    return (
      // 批 2：CaptureStatusProvider 必须留在 Suspense **外层**——它是本窗「每窗恰一个实例」的
      // 采集状态源（见文件头 @ai-context），塞进 Suspense 会改变它自己的挂载时机
      <CaptureStatusProvider>
        <Suspense fallback={null}>
          <CaptureFloatPanel />
        </Suspense>
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
 *   · 每页一个独立 Suspense（fallback=null）：只有**新挂载**的页会挂起，
 *     已经可见的页不会因为邻居加载而被替换成 fallback（避免可见的闪烁）。
 * @ai-context: 为什么 fallback 是 null 而不是原语层的 Loading：本批是**尺寸治理批**，
 *   引入原语会把它连同 CSS 一起拉进首屏，与目标冲突；「首访加载态」登记给批 3/4
 *   （壳层与加载原语一起做），见计划 Task 11 的瓶颈清单。
 * @ai-context: 动态 import 失败时 React 会把它抛到最近的错误边界 —— App.tsx 的
 *   AppErrorBoundary 仍在最外层包着 MainShell，因此「chunk 加载失败」有兜底 UI，不会白屏。
 * 副作用：无。边界：children 是懒组件元素，未 mounted 时不会被 React 渲染 ⇒ 不触发 dynamic import。
 */
function PageSlot({ show, mounted, children }: { show: boolean; mounted: boolean; children: React.ReactNode }) {
  if (!mounted) return null;
  return (
    <div style={{ flex: 1, display: show ? "block" : "none", overflow: "hidden" }}>
      <Suspense fallback={null}>{children}</Suspense>
    </div>
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
  // v0.8.0 F2（2026-08-21）：AI 任务完成通知——全局监听 ai:task-update，
  // 跨页面可见（REQ-145"完成通知"落地；内联卡片之外的第二通道）
  const [aiToast, setAiToast] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  // 审查修复（2026-08-21）：toast 计时器用 ref 持有——组件卸载/新事件时
  // 清理旧 timer（原实现每个事件都新起 timer，卸载后仍残留空转）
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          // toast 自动消失（清理旧 timer 重新计时——连续任务只显示最新）
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => {
            if (!disposed) setAiToast(null);
          }, 3500);
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
      if (toastTimer.current) clearTimeout(toastTimer.current);
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

  return (
    // 全局错误边界在 App 外层（批 2b 结构调整后包住 provider+壳，职责不变）
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      {/* v0.16.1：浏览器痕迹去除——原生右键菜单抑制 + 文本输入应用内右键小菜单 */}
      <BrowserChrome />
      {/* 顶部导航 */}
      <nav
        style={{
          height: "var(--ed-nav-h)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 16px",
          borderBottom: "1px solid #e5e7eb",
          background: "#fff",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15, marginRight: 20 }}>熵减 · 本地知识提取</span>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => setPage(item.key)}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: page === item.key ? 600 : 400,
              color: page === item.key ? "#0d9488" : "#4b5563",
              background: page === item.key ? "#f0fdfa" : "transparent",
              border: "none",
              borderBottom: page === item.key ? "2px solid #0d9488" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        ))}
        {/* REQ-274：全局 AI 对话面板入口（按需唤起；Ctrl+Shift+A 等效） */}
        <button
          data-testid="dock-toggle"
          onClick={() => setDockOpen((v) => !v)}
          title="AI 任务对话面板（Ctrl+Shift+A）"
          style={{
            marginLeft: "auto",
            padding: "6px 12px", fontSize: 12, cursor: "pointer",
            border: dockOpen ? "1px solid #4f46e5" : "1px solid #d1d5db",
            background: dockOpen ? "#eef2ff" : "#fff",
            color: dockOpen ? "#3730a3" : "#374151", borderRadius: 8,
          }}
        >
          🤖 对话面板
        </button>
        {/* 全局采集徽标（ADR-007）：切页/最小化后仍可见采集状态。
            批 2b：paused → pausedReason 三态文案（manual/media/foreground 同源，
            与右栏/浮窗一致）；recovering 与 paused 组合文案保持原语义 */}
        {capture.active && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 12,
              fontWeight: 600,
              color: capture.pausedReason || capture.recovering ? "#b45309" : "#0d9488",
              background: capture.pausedReason || capture.recovering ? "#fffbeb" : "#f0fdfa",
              border: `1px solid ${capture.pausedReason || capture.recovering ? "#f59e0b" : "#14b8a6"}`,
              borderRadius: 12,
              padding: "3px 10px",
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
        {/* v0.8.0 F2：AI 任务完成通知（全局 toast——跨页面可见） */}
        {aiToast && (
          <span
            style={{
              marginLeft: capture.active ? 8 : "auto",
              fontSize: 12,
              fontWeight: 500,
              color: aiToast.kind === "ok" ? "#047857" : "#b91c1c",
              background: aiToast.kind === "ok" ? "#ecfdf5" : "#fef2f2",
              border: `1px solid ${aiToast.kind === "ok" ? "#a7f3d0" : "#fecaca"}`,
              borderRadius: 12,
              padding: "3px 10px",
              maxWidth: 420,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {aiToast.text}
          </span>
        )}
      </nav>

      {/* 页面区（TD-004：保留挂载 + display 切换——页面切换不重挂载，
          避免 ClassroomPage 每次进入重复窗口枚举 100-500ms 停顿；状态与事件监听保留） */}
      <main style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <PageSlot show={page === "classroom"} mounted={mountedPages.has("classroom")}>
          {/* 2026-08 A4：融合完成直达会话（onOpenSessions 跳转 + focusSessionId 定位） */}
          <ClassroomPage
            onOpenSessions={(id) => {
              setFocusSessionId(id);
              setPage("sessions");
            }}
          />
        </PageSlot>
        <PageSlot show={page === "sessions"} mounted={mountedPages.has("sessions")}>
          {/* v0.7.1：active 驱动列表刷新（display:none 挂载不刷新根治）+ 查看笔记跨页直达 */}
          <SessionsPage
            focusSessionId={focusSessionId}
            // v0.16.1：工作台深链 / 精修启动 → AI 对话页（focus 消费后即清空）
            focusRefineTaskId={focusRefineTaskId}
            onFocusRefineTaskConsumed={() => setFocusRefineTaskId(null)}
            onRefineTaskStarted={(_sessionId, taskId) => {
              setFocusChatTaskId(taskId);
              setPage("chat");
            }}
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
            // v0.20.10（批 5）：ⓘ「复习本组」深链 → 复习页组预选
            onOpenReview={(groupId) => {
              setFocusReviewGroupId(groupId);
              setPage("review");
            }}
            onOpenSystem={(id) => {
              setFocusSystemId(id);
              setPage("knowledge");
            }}
            onCreateSystem={() => {
              setCreateSystemSignal((s) => s + 1);
              setPage("knowledge");
            }}
            onOpenSessions={(id) => {
              setFocusSessionId(id);
              setPage("sessions");
            }}
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
            onOpenSessions={(id) => { setFocusSessionId(id); setPage("sessions"); }}
            onOpenNote={(id) => { setFocusNoteId(id); setPage("notes"); }}
            onOpenNoteHighlight={(noteId, search) => {
              setFocusNoteId(noteId);
              setFocusNoteSearch({ noteId, search, key: Date.now() });
              setPage("notes");
            }}            onOpenSettings={() => setPage("settings")}
            // v0.16.1：任务进入对话页（会话页精修启动自动跳转）；任务视图 → 工作台深链
            focusTaskId={focusChatTaskId}
            onFocusTaskConsumed={() => setFocusChatTaskId(null)}
            // REQ-274：对话面板「在对话页继续」直达会话（消费后清空）
            focusChatId={focusChatId}
            onFocusChatConsumed={() => setFocusChatId(null)}
            onOpenRefineWorkbench={(sessionId, taskId) => {
              setFocusSessionId(sessionId);
              setFocusRefineTaskId(taskId);
              setPage("sessions");
            }}
          />
        </PageSlot>
        <PageSlot show={page === "knowledge"} mounted={mountedPages.has("knowledge")}>
          {/* v0.13.1：知识体系页（三时钟纪律——体系进周/季度视图，不与每日复习面混排）
              v0.13.7：focusSystemId 跨页直达（组行徽标/结算简报 → 自动选中体系） */}
          <KnowledgePage
            focusSystemId={focusSystemId}
            createSystemSignal={createSystemSignal}
            onOpenNote={(id) => { setFocusNoteId(id); setPage("notes"); }}
            onOpenGroup={(id) => { setFocusGroupId(id); setPage("notes"); }}
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
      {/* REQ-274：全局 AI 对话面板（常驻挂载——开合仅切 display，选中态/后台任务保活）。
          批 2：闸门只加在**首开之前** —— dockMounted 一旦为真永不复位，此后 open/close
          仍是纯 display 切换（保活语义逐字保留）；独立 Suspense(fallback=null) 与 PageSlot
          同理由：chunk 首次到达前不渲染任何东西，加载失败由外层 AppErrorBoundary 兜底。 */}
      {dockMounted && (
        <Suspense fallback={null}>
          <AiConversationDock
            open={dockOpen}
            onClose={() => setDockOpen(false)}
            onOpenChat={(chatId) => { setFocusChatId(chatId); setPage("chat"); }}
            onOpenTaskInChat={(taskId) => { setFocusChatTaskId(taskId); setPage("chat"); }}
            onOpenSessions={(id) => { setFocusSessionId(id); setPage("sessions"); }}
            onOpenNote={(id) => openNotePlain(id)}
            onOpenRefineWorkbench={(sessionId, taskId) => {
              setFocusSessionId(sessionId);
              setFocusRefineTaskId(taskId);
              setPage("sessions");
            }}
          />
        </Suspense>
      )}
      </div>
  );
}

export default App;
