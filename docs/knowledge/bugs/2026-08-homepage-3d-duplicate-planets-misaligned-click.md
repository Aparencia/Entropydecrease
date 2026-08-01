# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 首页 3D 物体点击与功能错位：浅色模式下背景场景重复渲染了一套"只改状态不跳转"的行星 |
| 日期 | 2026-08-01 |
| 类型 | 踩坑记录 |
| 标签 | #3D导航 #react-three-fiber #职责边界 #单一数据源 #浅色模式 |

---

## 症状

内测反馈：**首页的 3D 物体无法对应到其功能，与下方"点击 3D 物体进入模块"的提示有差异。**

具体表现（仅浅色模式必现）：场景中可见一大一小两套行星；点击外层行星时，界面进入"模块态"遮罩，但页面内容仍是首页，没有跳转到对应功能页。

## 环境

| 项目 | 版本/信息 |
|------|----------|
| 主题 | 浅色模式（`data-theme` 非 `dark` → `aurora-dome` 场景） |
| 相关文件 | `client/src/lib/3d/scenes/AuroraDomeWorld.tsx`、`client/src/lib/3d/navigation/SpatialNav.tsx`、`client/src/lib/3d/navigation/OrbitalStore.ts` |

## 排查过程（按 debug-sop）

1. **分类**：逻辑错误（运行正常但行为不对），无报错。
2. **梳理渲染链路**：`AppLayout` → `SceneProvider` → `SceneTransition`（背景世界）+ `SpatialNav`（导航层）。
3. **隔离**：发现浅色模式下有**两套**可点击行星同时渲染——
   - `AuroraDomeWorld` 内置 `PlanetarySystem`：6 颗行星（轨道半径 5~20，且缺 `classroom`），点击回调**只调用 `enterModule(id)`（改 Zustand 状态），不调用 `navigate()`**。
   - `SpatialNav`：7 颗 `AuroraModuleEntity`（轨道半径 0~9），点击回调 `enterModule(id)` + `navigate(module.route)`，才是唯一正确的导航出口。
4. **对照深色模式**：`DeepSeaWorld` 是纯环境背景（光照 + 球体 + 后处理），不含任何模块实体，只有 `SpatialNav` 一套可点击对象——所以深色模式正常。由此锁定问题在 `AuroraDomeWorld` 多出的那套行星。
5. **推演点击外层行星的后果**：`enterModule` 把 `isInModule` 置真 → `AppLayout` 渲染 `FunctionalOverlay` + `<Outlet/>`，但路由未变，`Outlet` 仍渲染当前页（首页）→ 用户看到"进了模块但内容没变"的错位。

## 根因

**背景场景越界实现了导航职责，产生第二套可点击实体。** `AuroraDomeWorld` 作为环境背景，自带了一个 `PlanetarySystem`，其点击处理只改状态不跳转；它与 `SpatialNav` 的导航行星在 3D 空间重叠，用户点到外层行星即触发"进入模块态但不跳转"。这也违反了 `OrbitalStore` 注释中"MODULE_POSITIONS 与路由映射需与 routes 配置同步"的单一数据源约定。

## 修复方案

将 `AuroraDomeWorld` 还原为纯环境背景（对齐 `DeepSeaWorld` 的职责边界），可点击导航行星统一由 `SpatialNav` 提供：

1. 删除 `AuroraDomeWorld` 中的 `ORBIT_CONFIGS` 与 `PlanetarySystem`，以及 JSX 里的 `<PlanetarySystem />`。
2. 清理随之失效的导入：`AuroraModuleEntity`、`useOrbitalStore`、`ModuleId`，并顺带移除预先存在的未使用导入 `Float`。
3. 在原 `行星轨道系统` 分节处保留注释，说明"模块行星统一由 SpatialNav 渲染"，防止后人再次在此重复造行星。

```
// 模块行星（可点击导航）统一由 SpatialNav 渲染并负责路由跳转。
// 本场景仅作环境背景，不重复生成行星实体——否则会出现两套可点击
// 行星，外层行星只改状态不跳转，导致"点击 3D 物体"与功能错位。
```

## 教训

- **3D 场景里"背景"与"导航"职责必须分离**：背景世界（`DeepSeaWorld`/`AuroraDomeWorld`）只做环境渲染；一切可点击导航实体只能来自 `SpatialNav`。新增场景时对照 `DeepSeaWorld` 的纯净结构。
- **同一交互对象出现两套实例是高危信号**：两套行星轨道半径不同（0~9 vs 5~20）、数量不同（7 vs 6，缺 classroom）、回调行为不同，任何一处差异都会变成用户可感知的错位。
- **"只改状态不跳转"的点击回调是隐蔽 bug**：`enterModule` 不报错、UI 也有遮罩反馈，表面"有响应"，实则路由未变。排查"点了没到预期页面"时，先确认点击回调里是否真的调用了 `navigate`。
- 排查此类问题的高效方法：**沿渲染链路列出所有同类可点击实体，逐个核对其点击回调**，而不是只看其中一个。

## 后续演进（同一反馈的第二根因：标签可发现性）

移除重复行星后内测仍反馈“3D 物体不可用”。**浏览器复现**（vite dev + Playwright 截图）发现：行星确实渲染出来了，但

- **标签默认隐藏**：`showLabel={highlightAll}`，`highlightAll` 仅在新手引导某步为 true，平时只有悬浮才显示标签；
- **功能副标题受新手期门控**：`{isNewbie && subtitle && …}`，首潜完成后“专注番茄钟/学习笔记”等直白功能名消失，只剩隐喻名（深潜/结礁…）。

用户看到的是一堆**无名彩色球体**，无法对应到功能——这才是“无法对应到其功能”的直接原因。

**修复**（`b605a6f`）：
1. `SpatialNav`：概览模式（`!isInModule`）默认显示标签（`showLabel={highlightAll || !isInModule}`）；
2. `AuroraModuleEntity`/`ModuleEntity`：功能副标题改为**常驻**（移除 `isNewbie` 门控），始终展示“隐喻名 · 功能名”（如 深潜 · 专注番茄钟）。

浏览器实测：标签可见、点击行星正确跳转对应模块。

> 取舍：为了让用户能把行星对应到功能，**牺牲了“新手期后才隐藏副标题”的原设计**。隐喻名保留（品牌），功能名常驻（可用性）。移动端网格/侧边栏仍按新手期门控，如需全导航面一致可后续对齐。

## 教训补充

- **“无法对应到功能”优先查标签可发现性**：交互对象可见 ≠ 可用。若对象本身能点击跳转，但用户仍报“不可用”，多半是**缺少可识别的标签**，而非点击逻辑坏了。
- **复现优先于推测**：本轮首轮仅凭代码推测“重复行星”为唯一根因，未复现；直到浏览器截图才看到“无标签”这个真正根因。debug-sop 第二步“复现”不可跳。

## 相关提交

- `ff67320` fix(3d): 移除晨曦穹顶场景重复的行星系统，导航行星统一由 SpatialNav 渲染
- `b605a6f` fix(3d): 概览模式常驻显示模块标签与功能副标题，解决 3D 物体无法对应到功能
