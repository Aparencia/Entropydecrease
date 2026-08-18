/**
 * App — 应用导航壳：课堂助手 / 会话 / 笔记 三个独立页面。
 *
 * @ai-context: 顶部标签导航 + 页面条件渲染（MVP 不引入路由库，保持轻量）；
 *              页面组件各自管理状态，切换不共享可变状态。
 */
import { useState } from "react";
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
      </nav>

      {/* 页面区 */}
      <main style={{ flex: 1, minHeight: 0 }}>
        {page === "classroom" && <ClassroomPage />}
        {page === "sessions" && <SessionsPage />}
        {page === "notes" && <NotesPage />}
      </main>
    </div>
  );
}

export default App;
