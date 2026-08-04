# 熵减 (Entropydecrease) — 共享布局

## AppLayout（client/src/components/layout/AppLayout.tsx）

三层渲染模型（设计系统 §3D 分层）：
- **Layer 2**：`CustomTitlebar`（Electron 标题栏，始终最顶）
- **Layer 0**：3D 场景全屏背景 — `SceneProvider` → `SceneTransition` → `SpatialNav`（桌面端）；移动端降级为 `MobileNavGrid` 2D 导航网格
- **Layer 1**：`FunctionalOverlay`（功能覆盖层，常驻挂载，`overlayVisible` 控制显隐）内含路由级 `AnimatePresence mode="wait"`（opacity 0.2s 淡入淡出）+ `<Outlet />`

全局：`BottomNav`（移动端底部标签栏）、`FirstDiveGate`、`OnboardingOverlay`、`ModuleTourToast`、`HelpCenter`、`CommandPalette`、`PWAInstallPrompt`、`CloseConfirmDialog`。
`MotionConfig reducedMotion` 按性能模式降级。快捷键：Esc 退出模块、数字键 0-7 导航、Ctrl+/ 帮助。

## Sidebar（client/src/components/layout/Sidebar.tsx，453 行）

桌面端左侧导航（240px / 折叠 56px，`w-14`），结构：
- 用户信息区（头像 + 昵称，motion 悬停）
- 导航三区段：导航（首页）/ 学习（深潜/结礁/反衰减呼吸/浮出水面，带模块色点 dotColor）/ 更多（数据分析/萤火海沟/回声定位）
- 学习进度条（真实数据聚合，brand-500 渐变填充，0.6s 动画）
- Ghost Tasks（蔡格尼克效应待继续提示池，accent-400 脉冲点 + 斜体文字）
- 底部：主题切换/反馈/设置/折叠按钮
- Active 指示器：`layoutId="sidebar-active-indicator"` 3px 品牌色竖线弹簧跟随

侧边栏背景：深色 `linear-gradient(90deg, var(--kb-bg-primary), color-mix 97% white)`，右缘 4px 渐变过渡带。
代码已迁移为 Tailwind 令牌类为主，仅主题渐变保留内联 style。

## CustomTitlebar（client/src/components/layout/CustomTitlebar.tsx，104 行）

Electron 无边框窗口标题栏（拖拽区 + 最小化/最大化/关闭）。

## BottomNav（client/src/components/layout/BottomNav.tsx，62 行）

移动端底部标签导航（图标 + 标签，active 品牌色）。

## FunctionalOverlay（client/src/components/overlay/FunctionalOverlay.tsx，84 行）

功能面板容器：毛玻璃背景 `backdrop-blur`，进入/退出 spring 动画（stiffness 300 damping 30），不对称圆角 `24px 12px 20px 16px`。

## PageTransition（client/src/components/layout/PageTransition.tsx，46 行）

页面级转场变体（fade + slide）。
