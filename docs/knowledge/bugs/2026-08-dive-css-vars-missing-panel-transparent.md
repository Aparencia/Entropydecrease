# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 笔记页左/上「黑条」：FunctionalOverlay 面板渐变背景依赖的 CSS 变量未全局定义 |
| 日期 | 2026-08-07 |
| 类型 | 踩坑记录 |
| 标签 | #CSS变量 #按需加载 #FunctionalOverlay #面板背景 #主题变量 |

---

## 症状

笔记页（`/#/notes`）面板内容区左侧、上侧出现「黑条」——面板 padding（p-8，32px）区域呈现
接近纯黑的模糊底色，与内容区（三栏毛玻璃）形成明显断层，看起来"小容器的空间没被应用"。
其他模块（如番茄钟）无此现象。

## 环境

| 项目 | 信息 |
|------|------|
| OS | Windows |
| 运行构建 | 开发模式（Vite dev server + Electron） |
| 复现步骤 | 深色主题下直接进入 `/notes`（不经过番茄钟模块） |

## 排查过程

1. **几何分析**：FunctionalOverlay 面板 `p-3 sm:p-5 md:p-8` padding 32px 区域露出"黑条"，
   说明页面内容（三栏有半透明背景）从 padding 内侧才开始，padding 区渲染为深色。
2. **样式取证**（getComputedStyle）：面板 `backgroundImage: "none"`、`backgroundColor: transparent`——
   面板内联渐变背景**整体失效**，而非"渲染成黑色"。
3. **变量取证**：面板内联样式为 `background: linear-gradient(180deg, var(--kb-dive-top) ...)`，
   但 `getComputedStyle(document.documentElement).getPropertyValue('--kb-dive-top')` 返回**空字符串**，
   全部 styleSheets 中均无 `:root`/`[data-theme]` 下的 `--kb-dive-*` 定义。
4. **加载链取证**：`--kb-dive-*` 唯一定义在 `client/src/features/pomodoro/styles/pomodoro-dive.css`，
   该文件只被 `DiveBackground.tsx`（番茄钟模块组件）import。用户直接进笔记页（lazy 加载），
   DiveBackground 从未挂载 → CSS 从未注入 → 变量未定义 → 面板背景声明无效 → 透明。

## 根因

**共享组件（FunctionalOverlay）的背景依赖模块内 CSS 文件定义的主题变量，而该 CSS 按模块按需加载**：
`--kb-dive-*` 只定义在 `pomodoro-dive.css`（被番茄钟模块组件 import），
未进入番茄模块的会话中变量缺失，`linear-gradient(..., var(--kb-dive-top), ...)` 整体失效，
面板退化为透明 + backdrop-blur → 背后深色 3D 场景透出形成"黑条"。

- 番茄钟页面正常：DiveBackground 挂载时注入 CSS，变量就位。
- 笔记页异常：依赖链不含 DiveBackground → 变量缺失。
- 浅色主题下同样失效（表现为"浅色条/白条"），深色主题下最显眼（黑条）。

## 解决方案

**把 `--kb-dive-*` 变量提升为全局主题变量**（本仓库已修）：
在 `client/src/styles/tokens.css` 的 `:root`（浅色）与 `[data-theme="dark"]`（深色）块末尾
各补充 `--kb-dive-top/mid/bot/bubble/ray/fog` 六项（值与 `pomodoro-dive.css` 一致）。
`tokens.css` 经 `index.css` @import 全局注入，任何模块/页面下变量始终就位；
`pomodoro-dive.css` 内定义保留（同值重复定义，加载顺序靠后者覆盖，无副作用）。

验证：深色主题下进入 `/#/notes`，`--kb-dive-top` 计算值为 `rgba(24, 42, 72, 0.9)`，
面板 computed background 恢复 `linear-gradient(rgba(24,42,72,0.9) 0%, ...)`；
elementFromPoint 探测 padding 区命中面板自身渐变（非透明）。0 控制台错误。

## 教训

- **共享组件（overlay/布局/弹层）的样式不得依赖模块级 CSS 变量的按需注入**：
  CSS 变量会随 import 它的组件是否挂载而"时有时无"，导致共享组件背景/主题在部分路由下静默失效。
  凡跨模块共享的样式变量必须定义在全局样式入口（tokens.css / index.css）。
- **"透明"不等于"黑色"**：面板失效的视觉表现是背后 3D 场景透出（深色主题下像黑条）。
  用 getComputedStyle 核对 backgroundImage 是否真的渲染，而不是直接改颜色值。
- **排查 CSS 变量缺失用三层取证**：① 面板 computed style 是否含该背景；② `getComputedStyle(document.documentElement)`
  读变量值是否为空；③ 遍历 styleSheets 找变量定义文件，再反查该 CSS 的 import 链与组件挂载条件。

## 参考

- 全局主题变量：`client/src/styles/tokens.css`（`:root` / `[data-theme="dark"]`）
- 模块内旧定义：`client/src/features/pomodoro/styles/pomodoro-dive.css`
- 共享面板组件：`client/src/components/overlay/FunctionalOverlay.tsx`（内联渐变背景）
- [Debug 标准操作流程](../../standards/debug-sop.md)
