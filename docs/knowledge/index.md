# 知识库索引

> 项目踩坑记录、技术方案与学习笔记汇总。详见 [知识管理规范](../standards/knowledge-management.md)、[知识卡片模板](../templates/knowledge-card-template.md)。

## 🐛 bugs/ — 踩坑记录

| 日期 | 标题 | 标签 |
|------|------|------|
| 2026-07-31 | [课堂助手精细采集三症状：视觉抓页面元数据、ASR 静音幻觉、截断 JSON 泄漏 UI](./bugs/2026-07-classroom-capture-asr-hallucination-json-leak.md) | #课堂助手 #多模态 #ASR幻觉 #prompt工程 |
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
| 2026-07-31 | [安装包分发加速：CDN 接入方案与下载源可切换设计](./solutions/2026-07-installer-cdn-distribution.md) | #CDN #阿里云 #安装包分发 #下载加速 |

## 🧠 learnings/ — 学习笔记

_（暂无）_

---

## 标签速查

- **技术**：#CSS #a11y #React #Vite #Tailwind #Zustand #CI #GitLFS #electron-builder #GitHubActions #CDN #阿里云 #环境变量 #Supabase #DesignTokens #color-mix #认证 #AuthGuard
- **类型**：#bug #方案 #学习 #复盘
- **模块**：#启动仪式 #reduced-motion #animation #发布 #安装包 #性能诊断 #测量方法 #番茄钟 #主题 #状态管理 #副作用 #数据统计 #路由守卫 #模式管理 #事件去重
