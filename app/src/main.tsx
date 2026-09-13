import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// 设计系统 token（ADR-032）：只定义 :root / [data-theme="dark"] 的自定义属性，无选择器 ⇒ 零视觉变化
import "./ui/tokens.css";
// v0.16.1：正文多色荧光笔样式（remarkMarkHighlight 注入类名 note-mark[-{colorId}]）
import "./note-mark.css";
// 批 8 T9：审校模式的墨度覆盖（规格 §4.3③）—— 🔴 **必须在 token CSS（:5）之后**
import "./ui/proofread.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
