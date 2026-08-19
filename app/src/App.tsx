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
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ClassroomPage from "./pages/ClassroomPage";
import NotesPage from "./pages/NotesPage";
import SessionsPage from "./pages/SessionsPage";

type Page = "classroom" | "sessions" | "notes";

const NAV_ITEMS: { key: Page; label: string }[] = [
  { key: "classroom", label: "📡 课堂助手" },
  { key: "sessions", label: "🗂 会话" },
  { key: "notes", label: "📝 笔记" },
];

function App() {
  const [page, setPage] = useState<Page>("classroom");
  // 2026-08 A4：跨页直达目标会话（课堂助手融合完成 → 会话页自动打开详情）
  const [focusSessionId, setFocusSessionId] = useState<number | null>(null);
  // v0.7.1：跨页直达目标笔记（会话页"查看笔记" → 笔记页自动选中并滚动可见）
  const [focusNoteId, setFocusNoteId] = useState<number | null>(null);
  // 全局采集状态（ADR-007：与页面解耦，徽标常驻导航栏）
  const [capturing, setCapturing] = useState(false);
  const [recovering, setRecovering] = useState(false);
  // 2026-08 A1：会话暂停（live:paused/resumed 事件；徽标区分暂停态）
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    // 监听器注册为异步（listen 返回 Promise<UnlistenFn>）；组件卸载时统一解绑
    (async () => {
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
            await invoke("stop_live_session").catch(() => {});
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

  return (
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
            {paused ? "⏸ 已暂停" : recovering ? "⚠️ 采集恢复中" : "🎙 采集中"}
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
            onOpenSessions={(id) => {
              setFocusSessionId(id);
              setPage("sessions");
            }}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
