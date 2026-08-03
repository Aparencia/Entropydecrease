# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 番茄钟沉浸↔普通模式切换出现"组件重复"：两个独立 AnimatePresence 实例间 mode="wait" 无效，双视图叠加约 0.6s |
| 日期 | 2026-08-03 |
| 类型 | 踩坑记录 |
| 标签 | #番茄钟 #framer-motion #AnimatePresence #portal #过渡排序 |

---

## 症状

用户反馈：**番茄（深潜）页面的区域组件出现重复**。截图呈现双曝光观感：浅色背景上叠着半透明大圆与横条，两套视图轮廓同时可见。

## 环境

| 项目 | 版本/信息 |
|------|----------|
| 相关文件 | `client/src/features/pomodoro/pages/PomodoroPage.tsx` |
| 依赖 | framer-motion v12（AnimatePresence / createPortal 组合） |

## 排查过程（按 debug-sop）

1. **分类**：UI 渲染异常（无报错），与模式切换时机强相关。
2. **隔离**：逐一排除重复挂载源——路由仅一处渲染 PomodoroPage；PresetTabs/TimerRing/Modal/AuthGuard 均无重复实例；StrictMode 双调用不影响 DOM 单份输出。
3. **结构分析**：页面有两个**独立** AnimatePresence 实例——沉浸层包在 `createPortal(..., document.body)` 内部一个，普通视图在布局内另一个。代码注释声称 `mode="wait"` "确保沉浸模式完全退出后再显示普通模式"，但 **mode="wait" 只在同一 AnimatePresence 实例内排序子项，跨实例完全无效**。
4. **浏览器复现**（chrome-devtools MCP + 逐帧 DOM 采样）：模拟滑动退出沉浸，在过渡期每 50ms 采样两套视图的 DOM 在场情况，确认叠加存在（旧指示器含沉浸层内部同名 svg 的污染，后改用普通视图容器 `.flex-1.px-4.py-12` 与沉浸层 `.fixed.inset-0.z-40` 作为精确标记复核）。
5. **机制推演**：`isImmersive` 翻转后，沉浸层开始 0.5s 退场动画的同时，普通视图立即开始 0.3s 进场动画——二者同屏叠加约 0.6s，即用户看到的"重复"。

## 根因

**两个独立 AnimatePresence 实例之间不存在出场/进场排序。** 沉浸层（portal 内）与普通视图分属不同实例，`mode="wait"` 只约束同一实例的直接子项；切换时旧视图退场与新视图进场并行执行，产生双视图叠加残帧。

修复中的插曲（二次踩坑）：第一版修复尝试把 `createPortal(...)` 作为单一 AnimatePresence（mode="wait"）的直接子项，指望跨 portal 的 PresenceContext 完成排序——**framer-motion v12 下该组合失效**：退场完成后新视图（portal 分支）始终不挂载，页面进入"双视图全空、只剩计时"的卡死态。回退为显式状态机方案。

## 修复方案

在 `PomodoroPage` 内引入四态视图状态机 `view: 'normal' | 'immersive' | 'switching-to-immersive' | 'switching-to-normal'`，显式串行化过渡：

1. `isImmersive` 翻转时迁入对应 `switching-*` 中间态：**此刻仅旧视图挂在各自的 AnimatePresence 中播放退场动画，新视图不挂载**。
2. 各自的 `onExitComplete` 回调在退场完成后迁入目标态，新视图才挂载播放进场动画。
3. 快速反向切换（退场中用户又切回）：中间态直接迁回目标态，framer-motion 自动取消退场重新进场，无卡死。
4. 全部动画参数（0.5s/0.3s、缩放、透明度）原样保留，仅消除叠加。

## 验证

浏览器逐帧采样（40ms 间隔，3s 窗口）双向过渡各一次：

- 退出方向序列 `III…→NNN…`、进入方向 `NNN…→III…`，**同时在场帧数 = 0**。
- 回归：lint 0 errors、Vitest 737/737、`tsc -b && vite build` 通过。

## 教训

- **AnimatePresence 的 mode（wait/sync/popLayout）只在其自身实例的直接子项间生效**。"A 视图退完再进 B 视图"若两个视图分属不同 AnimatePresence（尤其一方经 createPortal 独立成树），必须用外部状态显式排序，不能靠注释里的意图。
- **portal + AnimatePresence 的组合要实测**：把 createPortal 当作 AnimatePresence 直接子项在 framer-motion v12 不可靠（退场完成回调链断裂、新视图不挂载）。portal 场景优先"portal 内放 AnimatePresence + 外部状态门控"。
- **过渡叠加类 bug 用逐帧 DOM 采样复现**：切换瞬间肉眼难辨，脚本以 40~50ms 间隔记录两套视图标记的在场情况，可直接量化叠加帧数；注意标记必须能区分两套视图（本例沉浸层内部也有同款 280 viewBox 的 svg，曾污染指示器）。
- **修复动画 bug 不得削减动画**：本修复保留全部时长与缓动，只改挂载时序。

## 相关提交

- 本次修复随工作区未提交变更交付（用户未要求提交）。
