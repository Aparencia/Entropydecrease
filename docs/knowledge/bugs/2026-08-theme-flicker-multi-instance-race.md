# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 页面主题"有时亮有时暗"：useTheme 多实例竞态覆写 data-theme |
| 日期 | 2026-08-01 |
| 类型 | 踩坑记录 |
| 标签 | #主题 #竞态 #Zustand #useState多实例 #data-theme #内测反馈 |

---

## 症状

内测用户反馈：闪卡页面有时候是亮的有时候是暗的，不确定何时触发。其他页面偶有类似现象。

## 环境

| 项目 | 版本/信息 |
|------|----------|
| 主题机制 | `document.documentElement` 的 `data-theme` 属性 + CSS token 双套 |
| 相关文件 | `client/src/hooks/useTheme.ts`、`App.tsx`、`Navbar.tsx`、`Sidebar.tsx`、`AppearanceSettings.tsx` |

## 排查过程

1. **定位唯一写入点**：全局搜索 `setAttribute('data-theme')` 仅 `useTheme.ts:18` 一处
2. **发现多实例结构**：`useTheme()` 是普通 `useState` hook，被 4 个组件独立调用 → 4 个互不同步的状态实例，各自拥有写 DOM 的 `useEffect`
3. **竞态路径确认**：
   - Sidebar 切换主题 → 仅自身实例状态更新 + 写 DOM/localStorage
   - App/Navbar 实例持有陈旧值（effect 依赖未变不重跑，暂无症状）
   - 路由切换 / Suspense / ErrorBoundary 恢复导致组件 remount → 新实例 effect 立即执行，用重初始化的值覆写 DOM
   - 多实例 `toggleTheme` 语义也不一致：各自 toggle 自己的旧值，两个按钮产生相同结果
4. **附加缺陷**：`index.html` 无防闪脚本，CSS 默认 `:root` = 亮色 token，每次加载 React effect 执行前短暂闪亮色

## 根因

**主题状态是"多实例局部状态"而非"全局单一事实来源"**。N 个独立 `useState` 实例各自写同一个 DOM 属性，任何实例的 mount/remount 都会用自己的值覆写全局状态——典型的"共享可变状态 + 无协调"竞态。

## 修复方案

| 改动 | 文件 | 说明 |
|------|------|------|
| 新增 Zustand 全局主题 store | `client/src/stores/useThemeStore.ts` | 唯一状态源 + 唯一 DOM 写入点（`applyTheme`），store 创建时同步应用，监听系统主题变化 |
| useTheme 改为兼容包装层 | `client/src/hooks/useTheme.ts` | API 不变（`{ theme, toggleTheme, setTheme }`），4 处消费方零修改 |
| index.html 内联防闪脚本 | `client/index.html` | `<head>` 内同步读取 localStorage/系统偏好设置 data-theme，CSS 渲染前生效 |

## 教训

1. **任何写入全局 DOM 属性的状态必须是全局 store**——`document.documentElement`、`<body>` class 等是进程级单例，用局部 useState 管理等于 N 个人抢一支笔
2. 判断标准：如果一个 hook 内部有 `document.xxx.setAttribute/appendChild` 等副作用，且该 hook 可能被多处调用 → 必须提升为全局 store 或确保单点调用
3. `index.html` 防闪脚本是主题系统的标配——CSS 默认 token 与持久化主题之间的空窗期只能由内联脚本填补

## 验证

- TypeScript 编译零错误
- 50 个测试文件 / 488 用例全部通过
- 验证路径：切换主题 → 跨页面导航 → 刷新 → 主题一致；Sidebar/Navbar 两个切换按钮行为一致
