# 熵减 · 前端（Tauri 2 + React 19 + TypeScript 5.8）

本目录是桌面应用的前端与 Tauri 壳：

- `src/` —— React 前端。壳层在 `src/shell/`（导航注册表 / 列注册表 / 断点 / 窗口尺寸 / 顶栏 / 命令面板 / 页级错误边界），
  设计系统 token 与 L1 原语在 `src/ui/`，页面在 `src/pages/`。
- `src-tauri/` —— Rust 主进程（Tauri commands、本地 ASR/OCR、SQLite）。**命令注册表由仓库根的
  `scripts/check-command-registry.mjs` 守卫**（定义数 = 注册数，重复 0）。
- `scripts/gen-tokens.mjs` —— 设计 token 的**单一真源**；`src/ui/tokens.{css,gen.ts}` 是生成产物，
  **不要手改**（`src/ui/tokens.drift.test.ts` 会判失败）。

## 常用命令（在本目录下执行）

```bash
npm run dev      # Tauri 开发模式（需先 npm install）
npm run build    # 前端构建（tsc && vite build），产物写 dist/
npx tsc --noEmit # 类型检查（⚠️ vitest 不暴露 TS6133/TS2873 这类错，必须单独跑）
npx vitest run   # 前端测试（Vitest 4）
```

Rust 侧在 `src-tauri/`：`cargo test --test app_lib_tests` 是**唯一**测试入口。

## 仓库级门禁（在仓库根执行）

`node scripts/line-limits.mjs --full`（行数红线，唯一有效口径）· `node scripts/docs-check.mjs` ·
`node scripts/check-command-registry.mjs` · `node scripts/check-bundle-budget.mjs`（首屏 gzip 预算）。

## 约定的两处易踩点

- **单文件 ≤300 行**（全部行数含空行；口径 = `scripts/line-limits.mjs` 的 `countLines()`，
  **不要**用 `Get-Content` / `Measure-Object -Line` 数行）。
- **组件测试首行必须写 jsdom 环境指令**（`vitest.config.ts` 全局是 `node`），且本仓**未装**
  `jest-dom` 与 `user-event` ⇒ 断言用原生 DOM API、交互用 `fireEvent`。
