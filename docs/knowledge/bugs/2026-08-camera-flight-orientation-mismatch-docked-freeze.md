# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 主页选中功能后相机飞行最终视角错位、正对空白处：flyTo 只插值位置不改朝向，叠加 docked 渲染冻结无人纠错 |
| 日期 | 2026-08-03 |
| 类型 | 踩坑记录 |
| 标签 | #3D导航 #相机飞行 #四元数 #frameloop #性能档位 |

---

## 症状

用户反馈：**主页选中功能模块后，相机的飞行最终视角没有正确匹配，容易飞到空白处。** "容易"二字是关键——并非必现，而是概率性。

## 环境

| 项目 | 版本/信息 |
|------|----------|
| 相关文件 | `client/src/lib/3d/hooks/useCameraFlight.ts`、`client/src/lib/3d/navigation/SpatialNav.tsx`、`client/src/lib/3d/core/SceneProvider.tsx`、`client/src/lib/performance/performanceMode.ts` |
| 依赖 | @react-three/fiber（frameloop 策略）、three.js |

## 排查过程（按 debug-sop）

1. **分类**：3D 视觉错位，无报错；概率性出现。
2. **梳理相机控制权分层**：overview 由 OrbitControls 接管（用户可旋转视角）；entering 由 `useCameraFlight.flyTo` 独占；docked 时 `frameloop='never'` 完全冻结渲染。
3. **静态分析锁定主根因**：`flyTo/update` 只对 `camera.position` 做 lerp，**从不修改相机朝向**。飞行期间 CameraController 被 `paused`，不会 lookAt 纠正；抵达后相位迁至 docked，渲染冻结，CameraController 的 useFrame 根本不执行——相机就此保持**概览态的旧朝向**。概率性由此解释：用户没用 OrbitControls 旋转过视角时旧朝向恰好接近 -Z，看似正常；旋转过则必错。
4. **次要根因（时序错配）**：飞行时长固定 0.6s，而静谧(low)档 `dockDelayMs: 0`——渲染在飞行**中途**即被冻结，相机停在半途，位置和朝向都未到位。
5. **设计意图对照**：`CAMERA_OFFSET = [0, 0, 4]` 的语义是"相机停在模块 +Z 方向 4 单位处沿 -Z 直视模块"，该语义仅在相机朝向恰好为 -Z 时成立，进一步印证朝向缺失是根因。

## 根因

**相机飞行只插值位置、不插值朝向，且停靠后无任何机制纠正。** 三层叠加：

1. `flyTo` 不触碰 `camera.quaternion`，抵达后保持起飞时的旧朝向；
2. entering 相位 CameraController 暂停（避免双系统争抢相机），无法补 lookAt；
3. docked 相位 `frameloop='never'` 冻结渲染，此后永远没有帧循环可纠错；
4. 静谧档 `dockDelayMs=0` < 飞行时长 600ms，渲染在飞行中途冻结，错位雪上加霜。

## 修复方案

1. **`useCameraFlight` 增加朝向插值**：`flyTo(target, lookTarget?, flightDuration?)` 新增可选注视点。起飞时记录起始四元数，并用与 `Camera.lookAt` 完全相同的算法（`Matrix4.lookAt(eye, target, up)` → `setFromRotationMatrix`）计算"终点位置注视 lookTarget"的终点四元数；`update` 中位置 lerp 与四元数 slerp 按同一 ease-out cubic 进度同步推进，抵达时正对目标。未传 lookTarget 保持原行为（向后兼容）。顺带修复 `duration` 参数被硬编码 0.6 忽略的既有缺陷。
2. **`SpatialNav` 传入注视点**：进入模块 `flyTo(basePos + CAMERA_OFFSET, basePos)`（Aurora 模式用点击时记录的行星实时坐标）；退回概览 `flyTo(OVERVIEW_CAMERA_POS, [0, 0, 0])`。
3. **`SceneProvider` 停靠延迟 clamp**：`Math.max(PERFORMANCE_MODE_CONFIG[mode].dockDelayMs, 700)`，保证飞行（600ms）完成后才冻结渲染；不改 performanceMode 配置语义（0 仍表示"尽快停靠"），在使用点兜底。

## 验证

1. **新增单测** `useCameraFlight.test.ts`（mock useThree，4 用例）：指定注视点时抵达位置误差 <1e-3 且前向向量与目标方向点积 >0.999；中途持续转向（非瞬间突变）；省略注视点保持原行为；自定义时长生效。全部通过。
2. **浏览器冒烟**（chrome-devtools MCP）：概览态先模拟指针拖拽旋转视角（复现"旧朝向偏离"前置条件），数字键进入模块、Esc 退出，飞行/停靠/页面渲染全链路无卡死、无控制台错误。
3. **回归**：lint 0 errors、Vitest 737/737（基线 733 + 新增 4）、`tsc -b && vite build` 通过。

## 教训

- **相机动画必须"位置+朝向"成套设计**：只动 position 的飞行在自由视角（OrbitControls 可旋转）场景下必然埋雷——相机朝向是用户可污染的状态，任何"飞到某处"的逻辑都要回答"到了之后看哪里"。
- **"冻结渲染"优化会固化一切中间状态**：frameloop='never' 类节能策略意味着冻结瞬间的相机/场景状态就是用户看到的最终画面，所有异步时序（飞行时长 vs 停靠延迟）必须保证"冻结时已收敛"，下限 clamp 是廉价保险。
- **概率性视觉 bug 先找"用户可污染的状态"**：本例"容易飞到空白处"的概率性来自 OrbitControls 旋转历史；凡是"有时正常有时错"的相机/视角问题，优先检查是否有未重置、未接管的外部状态。
- **参数被静默忽略是隐患**：`duration` 形参存在却被硬编码 0.6 覆盖，属于"签名撒谎"；此类缺陷平时不发作，一旦有人真的传参就会踩坑。

## 相关提交

- 本次修复随工作区未提交变更交付（用户未要求提交）。
