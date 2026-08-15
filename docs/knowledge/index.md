# 知识库索引

> 项目踩坑记录、技术方案与学习笔记汇总。详见 [知识管理规范](../standards/knowledge-management.md)、[知识卡片模板](../templates/knowledge-card-template.md)。

## 🐛 bugs/ — 踩坑记录

| 日期 | 标题 | 标签 |
|------|------|------|
| 2026-08-07 | [笔记页「Failed to fetch dynamically imported module」：ELECTRON_BUILD 使 dev server 预构建依赖持续 504](./bugs/2026-08-vite-outdated-optimize-dep-dynamic-import-fail.md) | #Vite #optimizeDeps #ELECTRON_BUILD #动态导入 #base路径 #electron:dev |
| 2026-08-07 | [笔记页左/上「黑条」：FunctionalOverlay 面板渐变背景依赖的 CSS 变量未全局定义](./bugs/2026-08-dive-css-vars-missing-panel-transparent.md) | #CSS变量 #按需加载 #FunctionalOverlay #面板背景 #主题变量 |
| 2026-08-04 | [内测反馈五连修：页面切换不渲染、MCP 复制失败、构建后无音频、预设管理缺陷、番茄钟一屏适配](./bugs/2026-08-beta-feedback-five-fixes.md) | #3D导航 #竞态 #Electron #剪贴板 #file协议 #资源路径 #预设CRUD #响应式 |
| 2026-08-04 | [课堂真流式 ASR 永不激活：设置页缺失"启用本地语音识别"开关，enabled 恒为 false](./bugs/2026-08-streaming-asr-enable-toggle-missing.md) | #ASR #真流式 #设置页 #IPC死代码 #功能闸门 |
| 2026-08-04 | [课堂助手生产包报「无法获取音频，启动失败」：file:// 下 AudioWorklet 模块加载失败且无降级](./bugs/2026-08-classroom-asr-file-protocol-worklet-load-failure.md) | #ASR #AudioWorklet #file协议 #降级兜底 #课堂助手 |
| 2026-08-04 | [深色模式 3D 场景不渲染：双 EffectComposer 以 renderPriority=1 互相抢占渲染权](./bugs/2026-08-dark-mode-dual-effectcomposer-render-takeover.md) | #R3F #EffectComposer #后处理 #renderPriority #深色模式 #3D渲染 |
| 2026-08-03 | [番茄钟沉浸↔普通切换“组件重复”：两个独立 AnimatePresence 实例间 mode="wait" 无效，双视图叠加约 0.6s](./bugs/2026-08-pomodoro-immersive-dual-view-overlap.md) | #番茄钟 #framer-motion #AnimatePresence #portal #过渡排序 |
| 2026-08-03 | [主页选中功能后相机飞行视角错位、正对空白处：flyTo 只插值位置不改朝向，叠加 docked 渲染冻结无人纠错](./bugs/2026-08-camera-flight-orientation-mismatch-docked-freeze.md) | #3D导航 #相机飞行 #四元数 #frameloop #性能档位 |
| 2026-08-02 | [ASR 报错「whisper.cpp 执行失败」在代码库零匹配：运行构建落后源码 8 个版本](./bugs/2026-08-asr-whisper-cpp-stale-build-mismatch.md) | #ASR #版本错位 #sherpa-onnx #构建产物 #诊断方法 |
| 2026-08-01 | [3D 动画有时不显示/不流畅：性能分级无滞回导致 tier 抖动，特效反复卸载；后台返回误判降级](./bugs/2026-08-3d-tier-flapping-animation-hitching.md) | #3D性能 #R3F #性能分级 #滞回 #drei #WebGL |
| 2026-08-01 | [首页 3D 物体点击与功能错位：浅色模式下背景场景重复渲染了一套“只改状态不跳转”的行星](./bugs/2026-08-homepage-3d-duplicate-planets-misaligned-click.md) | #3D导航 #react-three-fiber #职责边界 #单一数据源 #浅色模式 |
| 2026-08-01 | [页面主题“有时亮有时暗”：useTheme 多实例竞态覆盖 data-theme](./bugs/2026-08-theme-flicker-multi-instance-race.md) | #主题 #竞态 #Zustand #useState多实例 #data-theme #内测反馈 |
| 2026-07-31 | [CI 编译原生模块报「Could not find any Visual Studio installation」——旧版 node-gyp 找不到 VS 2022](./bugs/2026-07-ci-node-gyp-vs2022-not-found.md) | #CI #原生模块 #node-gyp #本地能跑CI挂 |
| 2026-07-31 | [课堂助手精细采集三症状：视觉抓页面元数据、ASR 静音幻觉、截断 JSON 泄漏 UI](./bugs/2026-07-classroom-capture-asr-hallucination-json-leak.md) | #课堂助手 #多模态 #ASR幻觉 #prompt工程 |
| 2026-07-31 | [番茄钟"跳过"退化为"取消"：一个 onClose 回调承载两种意图，空目标番茄无法启动](./bugs/2026-07-pomodoro-goal-skip-acts-as-cancel.md) | #React #番茄钟 #弹窗交互 #回调语义 #意图区分 |
| 2026-07-31 | [登录失败后持续要求登录：AuthGuard 与“跳过登录”的模式降级缺口 + session-expired 事件风暴](./bugs/2026-07-login-loop-authguard-mode-gap.md) | #认证 #AuthGuard #路由守卫 #模式管理 #事件去重 #死循环 |
| 2026-07-31 | [Tailwind v3 对 `var()` 令牌色的 `/透明度` 修饰符静默失效，明亮主题弹窗背景全透明](./bugs/2026-07-tailwind-var-alpha-modifier-silent-drop.md) | #Tailwind #CSS #主题 #DesignTokens #color-mix |
| 2026-07-31 | [番茄钟计数异常：无重置路径的周期计数 + 跨模式状态残留 + store/hook 副作用双重执行](./bugs/2026-07-pomodoro-count-reset-and-duplicate-side-effects.md) | #Zustand #状态管理 #副作用 #番茄钟 #数据统计 |
| 2026-07-31 | [`.env.production` 被 gitignore 致 CI 安装包云服务地址全为空（「云服务尚未配置」）](./bugs/2026-07-ci-env-production-gitignore-supabase-placeholder.md) | #CI #环境变量 #Vite #Supabase #GitHubActions #发布 |
| 2026-07-31 | [下载慢诊断中的三次误判：对照实验缺失与观测行为污染测量](./bugs/2026-07-download-slow-misdiagnosis.md) | #性能诊断 #CDN #测量方法 #对照实验 #复盘 |
| 2026-07-30 | [Git LFS 图标未在 CI 拉取致 electron-builder 打包报 `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`](./bugs/2026-07-git-lfs-icon-electron-builder-ci-failure.md) | #CI #GitLFS #electron-builder #GitHubActions #发布 |
| 2026-07-30 | [reduced-motion 用 `animation-play-state: paused` 冻结入场动画致内容不可见](./bugs/2026-07-reduced-motion-fade-in-up-invisible.md) | #CSS #a11y #reduced-motion #animation |

## 💡 solutions/ — 技术方案

| 日期 | 标题 | 标签 |
|------|------|------|
| 2026-08-01 | [熵减性能深度分析与优化路线图](./solutions/2026-08-performance-analysis-optimization-roadmap.md) | #性能分析 #内存泄漏 #重渲染 #3D性能 #基准测试 |
| 2026-07-31 | [安装包分发加速：CDN 接入方案与下载源可切换设计](./solutions/2026-07-installer-cdn-distribution.md) | #CDN #阿里云 #安装包分发 #下载加速 |

## 📖 analysis/ — 机制分析

| 日期 | 标题 | 标签 |
|------|------|------|
| 2026-08-01 | [熵减功能模块科学机制分析](./learning-mechanisms-analysis.md) | #学习科学 #心理学机制 #脑科学 #机制缺口 |

## 🧠 learnings/ — 学习笔记

_（暂无）_

---

## 标签速查

- **技术**：#CSS #a11y #React #Vite #Tailwind #Zustand #CI #GitLFS #electron-builder #GitHubActions #CDN #阿里云 #环境变量 #Supabase #DesignTokens #color-mix #认证 #AuthGuard #3D导航 #react-three-fiber #3D性能 #R3F #drei #WebGL #ASR #sherpa-onnx #data-theme
- **类型**：#bug #方案 #学习 #复盘
- **模块**：#启动仪式 #reduced-motion #animation #发布 #安装包 #性能诊断 #测量方法 #番茄钟 #主题 #状态管理 #副作用 #数据统计 #路由守卫 #模式管理 #事件去重 #弹窗交互 #回调语义 #意图区分 #职责边界 #单一数据源 #浅色模式 #性能分级 #滞回 #版本错位 #构建产物 #诊断方法 #竞态 #useState多实例 #内测反馈
