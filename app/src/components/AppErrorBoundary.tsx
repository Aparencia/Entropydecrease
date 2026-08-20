/**
 * AppErrorBoundary — 全局错误边界（真机白屏防御，2026-08-21 用户反馈"启用
 * AI 精修后界面白屏"）。
 *
 * @ai-context: React 无错误边界时，任何组件渲染异常都会卸载整棵组件树 →
 *              全窗口白屏且无任何线索。本边界把白屏变为错误卡片（显示
 *              error.message + 重试/重载按钮），并 console.error 打印调用栈
 *              ——dev 模式可查，定位根因后修复即移除或保留为兜底。
 */
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // dev 模式 WebView 控制台可见（tauri dev 窗口 F12 / Ctrl+Shift+I）
    console.error("[AppErrorBoundary] 渲染异常:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "0 auto" }}>
          <h2 style={{ color: "#b91c1c", fontSize: 16, marginBottom: 8 }}>
            ⚠️ 界面出错了（已捕获，不再白屏）
          </h2>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 12,
              color: "#374151",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              padding: 12,
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            {this.state.error.message || String(this.state.error)}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => this.setState({ error: null })}
              style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6, cursor: "pointer", border: "1px solid #d1d5db", background: "#fff" }}
            >
              重试渲染
            </button>
            <button
              onClick={() => location.reload()}
              style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6, cursor: "pointer", border: "none", background: "#0d9488", color: "#fff" }}
            >
              重新加载应用
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
