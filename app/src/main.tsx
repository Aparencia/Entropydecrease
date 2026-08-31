import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// v0.16.1：正文多色荧光笔样式（remarkMarkHighlight 注入类名 note-mark[-{colorId}]）
import "./note-mark.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
