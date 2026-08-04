# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 深色模式 3D 场景不渲染：双 EffectComposer 以 renderPriority=1 互相抢占渲染权 |
| 日期 | 2026-08-04 |
| 类型 | 踩坑记录 |
| 标签 | #R3F #EffectComposer #后处理 #renderPriority #深色模式 #3D渲染 #render-target |

---

## 症状

深色模式下萤火海沟概览页 3D 模块实体完全不显示，仅拖动相机时偶尔闪现；浅色模式正常。
诊断探针显示渲染循环正常运行（`frameloop=always`、帧数递增）、相机位置/朝向正确、画布尺寸有效，
但 `gl.info.render` 始终只有 `drawCalls=1 triangles=1`——即只有后处理输出 pass 的单个全屏三角形，场景实体从未被绘制。

## 环境

| 项目 | 版本/信息 |
|------|----------|
| 渲染栈 | `@react-three/fiber@8.18` + `@react-three/postprocessing@2.19` + `three@0.185` |
| 相关文件 | `client/src/lib/3d/scenes/SceneTransition.tsx`、`DeepSeaWorld.tsx`、`AuroraDomeWorld.tsx`、`core/SafeEffectComposer.tsx` |

## 排查过程

1. **逐层排除**：依次验证渲染循环（`useFrame` 持续执行）、相机位置/朝向（`camPos=[0,0,10]` 正对原点）、画布尺寸（683×800）、投影矩阵（有效）、视锥体裁剪（`frustumCulled={false}` 无效）、材质（换成最简 `meshBasicMaterial` 仍不显示）——全部排除。
2. **关键证据**：`gl.info.render` 恒定 `drawCalls=1 triangles=1`。这正是 `EffectComposer` 最终输出 pass 的单个全屏三角形，说明场景内容从未进入绘制，渲染被 composer 接管。
3. **定位冲突源**：`DeepSeaWorld` 与 `AuroraDomeWorld` **各自挂载了一个 `SafeEffectComposer`**，而 `SceneTransition` 为实现深海↔穹顶交叉淡入淡出**同时挂载两个场景**。两个 composer 都以 `renderPriority=1` 的 `useFrame` 抢占渲染控制权——即使某场景 `visible=false`，其 composer 的 `useFrame` 仍挂载并接管渲染，两个 composer 互相覆盖导致画面丢失。
4. **验证**：禁用全部 composer 后实体立即可见，确认 composer 为元凶。

## 根因

**多个 `EffectComposer` 同时挂载并以相同 `renderPriority` 抢占渲染权**。`@react-three/postprocessing` 的 `EffectComposer` 通过 `useFrame(cb, 1)` 接管 R3F 渲染循环；当两个场景为交叉淡入淡出而同时挂载、且各自携带 composer 时，两个 composer 互相覆盖对方的渲染结果，最终输出为空白。场景 `visible=false` 无法让其内部 composer 停止接管（`useFrame` 与对象可见性无关，只与组件是否挂载有关）。

## 修复方案

| 改动 | 文件 | 说明 |
|------|------|------|
| 移除两场景内的 composer | `DeepSeaWorld.tsx`、`AuroraDomeWorld.tsx` | 场景内不再挂载 `SafeEffectComposer`，清理相关 import |
| 后处理统一到 SceneTransition 并暂禁用 | `SceneTransition.tsx` | 全场景唯一 composer 位置；因收敛为单一 composer 后仍复现（疑似与 `alpha:true` 画布的 render-target 兼容问题），暂以 `{null}` 禁用并留注释说明恢复前提 |
| 保留 ModuleEntity 程序化纹理 | `ModuleEntity.tsx` | 纹理非本问题根因（`drawCalls=1` 指向 composer），予以保留 |

## 教训

1. **一个 R3F 场景树中同一时刻只能有一个 `EffectComposer`**——后处理必须集中在单一位置管理，绝不能在多个并列挂载的子场景里各自挂 composer。
2. **`visible=false` 不会停止子组件的 `useFrame`**——`useFrame` 只随组件挂载/卸载，与对象可见性无关。靠 `visible` 隐藏的场景，其内部接管渲染的逻辑（`renderPriority>0` 的 `useFrame`）仍在运行。
3. **`gl.info.render` 是判断"场景是否真的被绘制"的金标准**——`drawCalls` 恒为 1（仅后处理输出三角形）即说明场景内容未进入绘制，可快速锁定渲染接管类问题。
4. 诊断此类"渲染循环在跑但画面空白"的问题，优先看 `gl.info.render.calls/triangles`，而非反复怀疑相机/材质/裁剪。
5. 交叉淡入淡出需要同时挂载两个场景时，后处理必须剥离到场景之外统一管理。

## 验证

- TypeScript 编译零错误；`oxlint` 0 错误
- 深色/浅色模式切换，萤火海沟概览页 7 个模块实体均正常显示
- 待办：如需恢复 Bloom/Vignette，需先排查 `@react-three/postprocessing` 与 `alpha:true` 画布的 render-target 兼容问题，再以单一 composer 形式加回，切勿在场景内重新挂载多个 composer
