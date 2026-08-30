/**
 * App — 应用导航壳：课堂助手 / 会话 / 笔记 三个独立页面。
 *
 * @ai-context: 顶部标签导航 + 页面条件渲染（MVP 不引入路由库，保持轻量）；
 *              页面组件各自管理状态，切换不共享可变状态。
 * @ai-context: ADR-007（REQ-033）：本层为全局采集生命周期宿主——
 *              ① 导航栏常驻采集状态徽标（页面切换/最小化后仍可感知采集在跑）
 *              ② 监听 app:close-requested（Rust 侧拦截了关闭）→ 确认框 →
 *                 确认后 stop_live_session 再 close，取消则采集继续。
 */
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ClassroomPage from "./pages/ClassroomPage";
import NotesPage from "./pages/NotesPage";
import SessionsPage from "./pages/SessionsPage";
// 2026-08-21 用户需求：设置页（课堂助手设置类面板迁出，单页滚动+分组）
import SettingsPage from "./pages/SettingsPage";
// v0.13.1：知识体系页（三时钟纪律——体系进周/季度视图，不入每日复习面）
import KnowledgePage from "./pages/KnowledgePage";
import AppErrorBoundary from "./components/AppErrorBoundary";
import CaptureFloatPanel from "./components/CaptureFloatPanel";
import CaptureOverlayPanel from "./components/CaptureOverlayPanel";
import type { AiTaskState } from "./types";

type Page = "classroom" | "sessions" | "notes" | "knowledge" | "settings";

const NAV_ITEMS: { key: Page; label: string }[] = [
  { key: "classroom", label: "📡 课堂助手" },
  { key: "sessions", label: "🗂 会话" },
  { key: "notes", label: "📝 笔记" },
  { key: "knowledge", label: "🧠 体系" },
  { key: "settings", label: "⚙ 设置" },
];

function App() {
  // v0.12.0 M3：系统级覆盖层截图窗口入口——URL 带 ?overlay=1 时仅渲染
  // CaptureOverlayPanel（全屏透明 1:1 框选；不渲染主导航壳；独立窗口）。
  // eslint-disable-next-line react-hooks/rules-of-hooks
  if (new URLSearchParams(window.location.search).get("overlay") === "1") {
    return <CaptureOverlayPanel />;
  }
  // v0.12.0 M6：采集浮窗入口——URL 带 ?float=1 时仅渲染 CaptureFloatPanel
  //（不渲染主导航壳；浮窗独立窗口 alwaysOnTop，加载 index.html?float=1）。
  // 规则：float 标志 per-window 恒定（URL 不变），故此处 before-hooks 早返回安全；
  // 它使浮窗不注册主导航的 live:* 监听（数据流由 CaptureFloatPanel 的 hook 持有）。
  // eslint-disable-next-line react-hooks/rules-of-hooks
  if (new URLSearchParams(window.location.search).get("float") === "1") {
    return <CaptureFloatPanel />;
  }
  const [page, setPage] = useState<Page>("classroom");
  // 2026-08 A4：跨页直达目标会话（课堂助手融合完成 → 会话页自动打开详情）
  const [focusSessionId, setFocusSessionId] = useState<number | null>(null);
  // v0.7.1：跨页直达目标笔记（会话页"查看笔记" → 笔记页自动选中并滚动可见）
  const [focusNoteId, setFocusNoteId] = useState<number | null>(null);
  // v0.13.7：跨页直达目标体系（组行徽标/结算简报 → 体系页自动选中）
  const [focusSystemId, setFocusSystemId] = useState<number | null>(null);
  // v0.14 C2：图谱组节点 → 笔记页过滤该组（同 focusNoteId 模式）
  const [focusGroupId, setFocusGroupId] = useState<number | null>(null);
  // 全局采集状态（ADR-007：与页面解耦，徽标常驻导航栏）
  const [capturing, setCapturing] = useState(false);
  const [recovering, setRecovering] = useState(false);
  // 2026-08 A1：会话暂停（live:paused/resumed 事件；徽标区分暂停态）
  const [paused, setPaused] = useState(false);
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
      // 采集主状态：recording=采集中；stopped/failed=结束（live_session 事件）
      unlisteners.push(
        await listen<string>("live:status", (e) => {
          if (disposed) return;
          setCapturing(e.payload === "recording");
          if (e.payload !== "recording") {
            setRecovering(false);
            setPaused(false);
          }
        }),
      );
      // REQ-175（v0.7.5）：停止残留兜底——融合开始 = 采集已停的可靠信号
      // （session:fusing 在会话停止后无条件发出；live:status stopped 可能
      // 因线程卡死/事件丢失而不到达——会话31 实证"采集中"残留至重启翻案）
      unlisteners.push(
        await listen<number>("session:fusing", () => {
          if (disposed) return;
          setCapturing(false);
          setRecovering(false);
          setPaused(false);
        }),
      );
      // 2026-08 A1：暂停/恢复（全局徽标显示"⏸ 已暂停"）
      unlisteners.push(
        await listen("live:paused", () => {
          if (!disposed) setPaused(true);
        }),
      );
      unlisteners.push(
        await listen("live:resumed", () => {
          if (!disposed) setPaused(false);
        }),
      );
      // 音频自动重连中（ADR-007）：会话未死，UI 提示恢复态
      unlisteners.push(
        await listen("live:recovering", () => {
          if (disposed) return;
          setCapturing(true);
          setRecovering(true);
        }),
      );
      unlisteners.push(
        await listen("live:recovered", () => {
          if (!disposed) setRecovering(false);
        }),
      );
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

  return (
    // v0.8.0 真机白屏防御（2026-08-21）：全局错误边界——渲染异常显示错误
    // 卡片而非整树卸载白屏；console 打印调用栈便于定位（AppErrorBoundary）
    <AppErrorBoundary>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      {/* 顶部导航 */}
      <nav
        style={{
          height: 56,
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
        {/* 全局采集徽标（ADR-007）：切页/最小化后仍可见采集状态；2026-08 A1 暂停态 */}
        {capturing && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 12,
              fontWeight: 600,
              color: paused ? "#b45309" : recovering ? "#b45309" : "#0d9488",
              background: paused ? "#fffbeb" : recovering ? "#fffbeb" : "#f0fdfa",
              border: `1px solid ${paused ? "#f59e0b" : recovering ? "#f59e0b" : "#14b8a6"}`,
              borderRadius: 12,
              padding: "3px 10px",
            }}
          >
            {/* 审查修复（观察 2026-08-29-2）：恢复态文案区分"暂停挂起"——
                暂停期重连风暴曾显示"采集中/恢复中"误导，现在明确"暂停中"语义 */}
            {recovering ? (paused ? "⏸ 暂停挂起（重连中）" : "⚠️ 采集恢复中") : paused ? "⏸ 已暂停" : "🎙 采集中"}
          </span>
        )}
        {/* v0.8.0 F2：AI 任务完成通知（全局 toast——跨页面可见） */}
        {aiToast && (
          <span
            style={{
              marginLeft: capturing ? 8 : "auto",
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
        <div style={{ flex: 1, display: page === "classroom" ? "block" : "none", overflow: "hidden" }}>
          {/* 2026-08 A4：融合完成直达会话（onOpenSessions 跳转 + focusSessionId 定位） */}
          <ClassroomPage
            onOpenSessions={(id) => {
              setFocusSessionId(id);
              setPage("sessions");
            }}
          />
        </div>
        <div style={{ flex: 1, display: page === "sessions" ? "block" : "none", overflow: "hidden" }}>
          {/* v0.7.1：active 驱动列表刷新（display:none 挂载不刷新根治）+ 查看笔记跨页直达 */}
          <SessionsPage
            focusSessionId={focusSessionId}
            active={page === "sessions"}
            onOpenNote={(id) => {
              setFocusNoteId(id);
              setPage("notes");
            }}
          />
        </div>
        <div style={{ flex: 1, display: page === "notes" ? "block" : "none", overflow: "hidden" }}>
          {/* v0.7.1：focusNoteId 定位 + 来源会话反向跳转（与课堂助手 onOpenSessions 同模式） */}
          <NotesPage
            focusNoteId={focusNoteId}
            focusGroupId={focusGroupId}
            onOpenSystem={(id) => {
              setFocusSystemId(id);
              setPage("knowledge");
            }}
            onOpenSessions={(id) => {
              setFocusSessionId(id);
              setPage("sessions");
            }}
          />
        </div>
        <div style={{ flex: 1, display: page === "knowledge" ? "block" : "none", overflow: "hidden" }}>
          {/* v0.13.1：知识体系页（三时钟纪律——体系进周/季度视图，不与每日复习面混排）
              v0.13.7：focusSystemId 跨页直达（组行徽标/结算简报 → 自动选中体系） */}
          <KnowledgePage
            focusSystemId={focusSystemId}
            onOpenNote={(id) => { setFocusNoteId(id); setPage("notes"); }}
            onOpenGroup={(id) => { setFocusGroupId(id); setPage("notes"); }}
          />
        </div>
        <div style={{ flex: 1, display: page === "settings" ? "block" : "none", overflow: "hidden" }}>
          {/* 2026-08-21：设置页（保留挂载——面板状态不因切页重置；TD-004 同模式） */}
          <SettingsPage />
        </div>
      </main>
      </div>
    </AppErrorBoundary>
  );
}

export default App;
