# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | reduced-motion 用 `animation-play-state: paused` 冻结入场动画致内容不可见 |
| 日期 | 2026-07-30 |
| 类型 | 踩坑记录 |
| 标签 | #CSS #a11y #reduced-motion #React #animation #启动仪式 |

---

## 症状

系统"减少动态效果"（`prefers-reduced-motion: reduce`）开启时，学习启动仪式（StartupRitual）弹层**中间步骤内容区整片空白**：

- 左上角音量图标、右上角跳过图标、底部分页圆点、"下一步"按钮均正常显示
- 但回顾闪回 / 微目标 / 呼吸三个步骤的实际内容看不见
- 完成屏（RitualComplete）、dashboard 的 toast 等所有用 `fade-in-up` 入场动画的元素同样不可见

无任何报错日志——DOM 存在、有高度（`offsetHeight=542`），但视觉透明。

```
computedStyle: opacity="0", animationPlayState="paused", animationFillMode="none"
```

## 环境

| 项目 | 版本/信息 |
|------|----------|
| OS | Windows（辅助功能"动画效果"关闭 → reduced-motion 生效） |
| 框架 | React 18 + Vite + Tailwind CSS |
| 相关文件 | `client/src/index.css`（全局 reduced-motion 规则） |
| 受影响组件 | 所有使用 `animate-[fade-in-up...]` 的组件（仪式 4 步 + dashboard toast 等） |

## 排查过程

1. 从多张截图观察到"仪式中间一直空白，但按钮/图标正常" → 排除仪式功能逻辑，怀疑可见性/CSS
2. 分页点是 2 个而非 3 个 → 一度怀疑 `buildRitualPlan` 时序竞态；后确认是 `useLastSession` 异步未就绪时按规则裁掉 review 步骤，**属正常行为**，非本 bug
3. 浏览器实测：步骤内容 div `opacity=0`、`animationPlayState=paused`、DOM 有高度 → 定位到"动画被冻结在初始帧"
4. 关键发现：`fade-in-up` 的 `@keyframes` 第 0 帧是 `opacity:0`，而全局 reduced-motion 规则用 `animation-play-state: paused` 把动画**冻结在第 0 帧**

## 根因

`client/src/index.css` 的 reduced-motion 规则：

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-play-state: paused !important;  /* ← 元凶 */
  }
}
```

`paused` 把动画冻结在**当前帧（入场动画即第 0 帧）**。对 `fade-in-up`（`0% { opacity:0 }`）而言，元素被永久钉在透明态。原注释"暂停所有动画而非移除，保留视觉状态"——设计意图与实现效果矛盾：保留的是**初始帧**而非**终态**。

## 解决方案

改用 web.dev 推荐写法：让动画**瞬间跑完到终态**，而非冻结在初始帧。

```css
/* 减少动效支持 — 动画瞬间跑完到终态（web.dev 推荐），而非冻结在初始帧 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;   /* 防止无限循环动画反复瞬跑 */
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

验证：reduced-motion 条件下步骤内容 `opacity` 从 `0` → `1`，内容正常可见；`npm run build/lint/test` 全绿。

## 教训

- **下次如何避免**：reduced-motion 降级永远用 `animation-duration: 0.01ms`（跑到终态）或 `animation: none`，**绝不用 `animation-play-state: paused`**——后者会把任何以 `opacity:0`/`translate` 起手的入场动画冻结成不可见。
- **如何更快定位**：UI"结构在、内容不可见、无报错"时，第一时间查 `computedStyle` 的 `opacity` 与 `animationPlayState`；并在 DevTools 中主动模拟 `prefers-reduced-motion: reduce` 复现。
- **需要补充的监控/测试**：关键弹层/入场动画组件的可见性测试应覆盖 reduced-motion 分支（组件层 mock `matchMedia` reduced=true，断言最终态可见）。
- **诊断环境陷阱**：开发/测试机若长期开启"减少动效"，会持续掩盖此类问题——评审 UI 时应两种模式都验证。

## 参考

- [web.dev — prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion)
- 修复提交涉及文件：`client/src/index.css`
- 关联特性：v0.27.0 学习启动仪式（`client/src/features/dashboard/components/ritual/`）
