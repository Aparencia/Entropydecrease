# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | CI 编译原生模块报「Could not find any Visual Studio installation」——旧版 node-gyp 找不到 VS 2022 |
| 日期 | 2026-07-31 |
| 类型 | 踩坑记录 |
| 标签 | #CI #原生模块 #node-gyp #electron-rebuild #本地能跑CI挂 |

---

## 症状

首次在 CI 编译自研原生 addon（`client/native/process-audio`，见 ADR-001）时，
`windows-latest` 上 `electron-rebuild` 失败：

```
Error: Could not find any Visual Studio installation to use
  at VisualStudioFinder.findVisualStudio2013 (client/node_modules/node-gyp/lib/find-visualstudio.js:380)
  at VisualStudioFinder.findVisualStudio2015 (...:364)
```

关键陷阱：

- **本地（VS 2022 Community）用同一条命令完全正常**，只有 CI 失败
- runner 明确自带 VS 2022，报错却说"找不到任何 VS 安装"
- 堆栈里仍在尝试 `findVisualStudio2013/2015`——暴露了真实原因
- 该步骤配了 `continue-on-error`，所以**发布流水线全绿、版本照常发出**，
  安装包只是静默缺少原生模块（自动降级为端点环回），极易被忽略

## 环境

| 项目 | 版本/信息 |
|------|----------|
| CI | GitHub Actions `windows-latest`（自带 VS 2022 + MSVC） |
| 构建 | `@electron/rebuild` + `client/node_modules` 内的 node-gyp |
| 本地 | VS 2022 Community、Python 3.14、node-gyp ^11（addon 目录自带） |

## 排查过程

1. release.yml 三 job 全绿、v0.30.0 正常发出，但功能未生效 → 先怀疑运行时加载路径
2. 抓 `Build native process-audio module` 步骤完整日志（而非只看 job 结论），
   发现 `native:install` 成功、`native:build` 在 **8 秒内**失败——耗时过短说明
   根本没进入编译阶段
3. 读完整堆栈：路径为 `client\node_modules\node-gyp\...`，且函数名是
   `findVisualStudio2013/2015` → 用的是**旧版 node-gyp**，其 VS 探测逻辑不支持 VS 2022
4. 反问"为什么 better-sqlite3 的 rebuild 在同一 CI 上成功？"→ 因为它有
   **预编译二进制**，从不真正调用 MSVC。**CI 上从未编译过任何原生代码**，
   这是首次暴露

## 根因

`electron-rebuild` 使用的是**调用它的项目（client）内的 node-gyp**，版本较旧，
VS 探测逻辑只覆盖到 VS 2015/2017；而 addon 目录自带的新版 node-gyp（^11，
支持 VS 2022）根本没被用上。本地之所以正常，是因为本地曾直接在 addon 目录
执行 `npx node-gyp rebuild`（用的是新版）。

## 解决方案

不只改 CI（否则仍是两套路径），而是让**本地与 CI 共用同一构建入口**：

新增 `client/native/process-audio/build.mjs`：

- 固定使用 addon 目录自带的新版 node-gyp
- 从 client 的实际安装解析 Electron 版本（`require('electron/package.json').version`，
  比读 `^35.7.5` 这类范围更准）
- 显式传 `--target=<electron> --dist-url=https://electronjs.org/headers`
  保证按 Electron 的 Node ABI 编译（否则主进程 require 时报
  NODE_MODULE_VERSION 不匹配）

`package.json` 的 `native:build` 指向该脚本，CI 与本地都只调这一个命令。

## 教训

- **「本地能跑 CI 挂」的第三次同类事故**（前两次：Git LFS 指针未拉取、
  `.env.production` 被 gitignore）。规律是：**本地存在而 CI 不具备的隐式前提**
  ——已 checkout 的 LFS 文件、gitignore 掉的配置、能被解析到的新版工具链。
  新增构建步骤时应主动自问：这一步依赖的东西，CI 上真的存在且版本一致吗？
- **本地与 CI 必须共用同一构建入口**。两套命令等于两套隐式前提，差异只会在
  发版时暴露。
- **`continue-on-error` 是双刃剑**：它正确地保护了发布流水线（可选增强失败
  不该阻断发版），但也让失败变得静默。必须配套**产物存在性检查 + `::warning::`
  标注**，否则"绿灯发版但功能没进去"会被忽略数个版本。
- **排查工具链失败要看完整堆栈而非结论**：本例中 `findVisualStudio2013` 这个
  函数名直接指向了根因；只看 "Could not find any Visual Studio" 会误判为
  runner 缺少 VS 而白费力气去装编译器。
- **反问"为什么相邻的同类步骤是成功的"**：better-sqlite3 能 rebuild 却帮不到
  自研模块，是因为它走预编译。这个对比直接缩小了范围。

## 参考

- 决策背景：`docs/adr/ADR-001-audio-capture-process-loopback.md`
- 构建脚本：`client/native/process-audio/build.mjs`
- CI 步骤：`.github/workflows/release.yml`（Build native process-audio module）
- 同类卡片：[Git LFS 图标未在 CI 拉取](./2026-07-git-lfs-icon-electron-builder-ci-failure.md)、
  [`.env.production` 被 gitignore](./2026-07-ci-env-production-gitignore-supabase-placeholder.md)
