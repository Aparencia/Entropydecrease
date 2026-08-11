# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 笔记页「Failed to fetch dynamically imported module」：ELECTRON_BUILD 使 dev server 预构建依赖持续 504 |
| 日期 | 2026-08-07 |
| 类型 | 踩坑记录 |
| 标签 | #Vite #optimizeDeps #ELECTRON_BUILD #动态导入 #base路径 #electron:dev |

---

## 症状

打开笔记模块（`/#/notes`）报错，页面无法渲染：

```
TypeError: Failed to fetch dynamically imported module: http://localhost:5173/src/features/notes/pages/NotesPage.tsx
```

控制台同时出现大量 `504 (Outdated Optimize Dep)`，全部指向 `node_modules/.vite/deps/` 下的预构建依赖
（`@tiptap_core.js`、`@tiptap_starter-kit.js`、`tiptap-markdown.js`、`@tanstack_react-virtual.js` 等）。

## 环境

| 项目 | 信息 |
|------|------|
| OS | Windows |
| 运行构建 | 开发模式（Electron + Vite dev server，`localhost:5173`） |
| Vite | v8.1.3（`client/node_modules`） |
| 复现步骤 | 打开应用导航到 `/notes` 或任意依赖 tiptap/@tanstack/react-virtual 的 lazy 页面 |

## 排查过程

1. **服务器侧编译正常**：直接请求 `http://localhost:5173/src/features/notes/pages/NotesPage.tsx` 返回 200（179KB JS）。
   错误发生在浏览器端模块加载，而非源码编译。
2. **浏览器复现取证**（Playwright）：`#/notes` 产生 31 个错误——21 个 `504 (Outdated Optimize Dep)`
   命中预构建依赖，随后才是动态导入失败。`#/`（首页，依赖链不含这些包）0 错误 → 问题隔离到
   **Vite 预构建依赖层**，而非 NotesPage 源码。
3. **磁盘取证**：`client/node_modules/.vite/` 下只有 `vitest` 目录，**`deps` 预构建目录完全不存在**；
   请求 `_metadata.json` 返回 index.html（SPA fallback）→ 预构建产物从未写盘，但 dev server
   内存中仍持有旧版本号 `f5f8e892`，对旧 URL 持续回 504，且从未完成重新预构建。
4. **进程取证**：监听 5173 的 dev server 命令行是 `cross-env ELECTRON_BUILD=1 vite --mode test`
   （`npm run electron:dev` 启动方式），已运行 1.5 小时。
5. **根因确认**：`ELECTRON_BUILD=1` 令 `vite.config.ts` 中 `base: './'` 生效——该配置本意只服务
   构建产物（file:// 协议加载）。dev 模式下 `base: './'` 使预构建依赖 URL 解析异常，
   deps 产物无法正确生成/匹配，全部预构建依赖持续 504，任何依赖它们的 lazy 页面动态导入失败。

## 根因

**`base: './'` 被错误地应用到 dev server**：`electron:dev` 脚本给 vite 也加了
`ELECTRON_BUILD=1`（该变量仅构建需要），vite.config.ts 的 `base: isElectronBuild ? './' : '/'`
未区分 build/dev。dev 模式下预构建依赖 URL 异常 → `.vite/deps` 无法生成 →
`504 (Outdated Optimize Dep)` 持续 → lazy 页面动态导入失败。

- 首页不受影响：依赖链不含 tiptap/@tanstack/react-virtual 等预构建包。
- Electron 主进程根本不读 `ELECTRON_BUILD`（按 `NODE_ENV === 'development' || !app.isPackaged`
  判断，直连 `http://localhost:5173`），给 vite 传该变量纯属误用。

## 解决方案

1. **vite.config.ts（防御，本仓库已修）**：`base` 仅在 `command === 'build'` 时用 `'./'`，
   dev 模式恒为 `'/'`——即使再有人用 `ELECTRON_BUILD=1 vite` 启动 dev server 也不会坏。
2. **package.json（清理错误用法，本仓库已修）**：`electron:dev` 脚本 vite 侧去掉
   `cross-env ELECTRON_BUILD=1`，与 `dev` 脚本一致（`vite --mode test`）。
3. **运行侧修复**：终止损坏的 dev server 进程，以标准方式重启（`npm run dev` 或修复后的
   `npm run electron:dev`），等待依赖预构建完成（`node_modules/.vite/deps` 生成），
   Electron 窗口刷新/重启后恢复。

验证：修复后以 `ELECTRON_BUILD=1 vite --mode test`（模拟旧启动方式）实测——
预构建正常生成 127 个依赖文件，`#/notes`、`#/`、`#/notes/:id` 全部 0 模块错误。

## 教训

- **`ELECTRON_BUILD` / `NODE_ENV` 等构建变量必须区分 build/dev 用途**：凡影响 `base`、
  `outDir`、插件启用（`applyToEnvironment`）的配置，dev server 与 build 走同一份
  `defineConfig` 时要用 `command` 参数分流，否则 dev 模式会继承构建期行为。
- **`504 (Outdated Optimize Dep)` 是预构建层故障的指纹**：看到它先查
  `node_modules/.vite/deps` 是否真实存在，再查 dev server 启动方式与环境变量，
  而不是查报错 URL 对应的源码文件。
- **lazy 页面动态导入失败的报错 URL ≠ 问题模块**：报错指向顶层 `import()` 的模块，
  真正失败的是其依赖链中任一个预构建/编译失败的模块；先看同批控制台的其他资源错误。
- **"服务器能返回 200"不等于"模块能加载"**：Vite 对源码模块按需 transform（200），
  预构建产物（node_modules 依赖）走另一条缓存路径，两条路径要分开验证。

## 参考

- 相关配置：`client/vite.config.ts`（`base`、`defineConfig(({ command }) => ...)`）
- 启动脚本：`client/package.json`（`dev` / `electron:dev`）
- Electron 加载逻辑：`client/electron/windowManager.ts`（`loadURL('http://localhost:5173')`）
- [Debug 标准操作流程](../../standards/debug-sop.md)
