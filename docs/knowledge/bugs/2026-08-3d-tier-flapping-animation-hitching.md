# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 3D 动画有时不显示/不流畅：性能分级无滞回导致 tier 抖动，特效反复卸载；后台返回误判降级 |
| 日期 | 2026-08-01 |
| 类型 | 踩坑记录 |
| 标签 | #3D性能 #R3F #性能分级 #滞回 #drei #WebGL |

---

## 症状

内测反馈：**① 动画有时不显示，需要等很久才会重新显示；② 3D 动画不够流畅。**

具体表现：
- 场景特效（辉光、云层、景深）时有时无，消失后要过一阵才回来；
- 从最小化/切走切回后，特效经常处于"被隐藏"状态；
- 每隔几秒可能出现一次轻微卡顿。

## 环境

| 项目 | 版本/信息 |
|------|----------|
| 渲染栈 | three `0.185` + @react-three/fiber `8.18` + @react-three/drei `9.122` + @react-three/postprocessing `2.19` |
| 相关文件 | `client/src/lib/3d/core/PerformanceMonitor.tsx`、`QualityController.tsx`、`MemoryManager.tsx`、`scenes/AuroraDomeWorld.tsx`、`scenes/DeepSeaWorld.tsx` |

## 排查过程（按 debug-sop）

1. **分类**：性能问题 + 间歇性渲染异常。
2. **梳理性能链路**：`PerformanceMonitor`（测 FPS → 定 tier）→ `QualityController`（按 tier 调 pixelRatio）→ 场景组件（按 tier 决定粒子数、是否挂后处理/云层）。`tier` 被 4 个组件订阅。
3. **定位 tier 判定缺陷**（原实现）：
   ```
   if (fps < 25) setTier('low');
   else if (fps < 45) setTier('medium');
   else setTier('high');
   ```
   - **无滞回**：单一阈值（25/45），FPS 在阈值附近振荡时 tier 来回跳；
   - **无持续判定**：一个 2s 窗口测到低 FPS（着色器编译、GC、场景切换、切后台节流）就立即降级；
   - **悬崖式降级**：`high` 可直接掉到 `low`，而 `AuroraDomeWorld`/`DeepSeaWorld` 在 `tier==='low'` 时会**卸载后处理与云层**——特效"消失"，需等 FPS 回到 45+ 的窗口才重新挂载（"等很久才重新显示"）。
4. **后台返回误判**：窗口隐藏时浏览器节流 rAF，返回后第一个 2s 窗口测出极低 FPS → 立即降级 → 用户一回来特效就没了。
5. **顺带发现 `MemoryManager` 死代码**：其"每 4 帧跳 3 帧"靠在 `useFrame` 回调里 `return` 实现——但 R3F 的 `useFrame` 返回值被忽略，**return 并不能阻止当前帧渲染**，该逻辑完全无效（且注释宣称能省 GPU，误导后人）。窗口隐藏时浏览器本就会节流 rAF，无需手动跳帧。

## 根因

**性能分级（tier）的判定与切换缺少滞回（hysteresis）与持续判定（sustained threshold）。** FPS 的瞬时波动被直接、即时、悬崖式地映射为 tier 跳变，进而触发特效的反复卸载/重挂与 pixelRatio 突变——表现为"动画/特效有时不显示、要等很久才回来"以及周期性卡顿。

## 修复方案

1. **`PerformanceMonitor` 重写 tier 判定**（核心修复）：
   - **滞回**：`fps<25` 计低、`fps>50` 计高，`25~50` 为缓冲区不触发变更；
   - **持续判定**：同方向连续 2 个窗口（4s）才调整 tier；
   - **逐级调整**：`high→medium→low` 一次一级，避免悬崖式降级直接隐藏后处理；
   - **后台返回重置**：`visibilitychange` 变可见时重置测量基线，避免节流期数据被误判。
2. **`MemoryManager` 清理死代码**：移除无效的"跳帧"逻辑与仅服务于它的 blur/focus 监听，保留内存占用上报。

## 市场成熟方案（R3F 生态，均已确认在当前依赖版本可用）

| 方案 | 出处 | 作用 | 本项目适配建议 |
|------|------|------|---------------|
| `<PerformanceMonitor>` | drei | FPS 均值 + 上下界 + **flip-flop 保护**（`onIncline`/`onDecline`/`onFallback`），是"滞回+持续判定"的工业级现成实现 | 可整体替换自研监控；其 `factor`(0~1) 需映射到现有 high/medium/low 三级 |
| `<AdaptiveDpr>` | drei | 性能下降时自动降 DPR、回升时恢复，比"突变 pixelRatio"更平滑 | 配合 PerformanceMonitor 使用，可替代 `QualityController` 的阶跃式 DPR |
| `<AdaptiveEvents>` | drei | 性能下降时降低事件拾取分辨率 | 场景交互对象多时可加 |
| `EffectComposer multisampling={0}` | @react-three/postprocessing | 关闭后处理管线 MSAA（默认 8），显著降 GPU 负载 | 若锯齿可接受或另加 SMAA，是性价比很高的一项 |
| `frameloop="demand"` + `invalidate()` | R3F | 按需渲染，静止时零 GPU | 本场景持续动画，不适用；但"模块内"静态页可考虑 |
| `renderer.compile()` / `<Preload>` | three/drei | 预编译着色器，消除首帧卡顿 | 已用 `Preload`；主题切换瞬时可再补 `compile` |

## 教训

- **动态质量分级必须带滞回与持续判定**：单阈值 + 即时切换 = tier 抖动 = 特效闪烁/反复卸载。这是自适应画质系统的通用铁律（游戏引擎的 dynamic resolution 同理）。
- **降级要逐级、恢复要确认**：悬崖式降级（high→low）会一次性隐藏大量特效，用户感知强烈；逐级降 + 持续达标才升，体验平滑。
- **后台节流的测量数据不可信**：rAF 被节流期间的 FPS 不代表真实性能，返回前台必须先重置测量基线。
- **`useFrame` 里 `return` 不能跳帧**：R3F 渲染不由回调返回值控制；想真正暂停渲染应走 `frameloop`/`setAnimationLoop`，勿写"假跳帧"死代码。
- 排查"特效时有时无"类问题的高效方法：**找到控制其显隐的状态（这里是 tier），再审查该状态的所有写入点的判定逻辑**。

## 相关提交

- perf(3d): 性能分级引入滞回+持续判定+后台重置，消除 tier 抖动；清理无效跳帧死代码（待提交）
