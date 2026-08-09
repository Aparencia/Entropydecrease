# DeepSeaWorld 深海生命元素增强设计

日期：2026-08-07
状态：已批准（用户确认方向 A 深海生命 + 克制含蓄密度）

## 背景

主页深色模式（DeepSeaWorld）背景已具备：深海渐变穹顶、生物发光粒子、焦散光斑、体积光柱、海洋雪、混沌雾（遗忘）、秩序波纹（复习）、潮汐、地层。本次新增"深海生命"层，强化学习主题叙事，遵循"背景叙事层"定位：不抢前景模块实体视觉焦点。

## 设计原则

- **克制含蓄**：透明度 0.15~0.4，位置在场景边缘/远处，动画低速
- **叙事链**：鱼群（日常思绪游弋）→ 水母（灵感浮现）→ 巨影（未知敬畏）
- **宪法第四条**：三级性能降级（high 全开 / medium 减量 / low 关闭）
- **不引入新依赖**：复用 R3F、THREE、useEffectiveTier
- **不触碰 frameloop / 合成层逻辑**：避免重蹈 R3F 渲染异常

## 元素设计

### 1. JellyfishField 水母群（灵感浮现）

- 数量：high 5 / medium 3 / low 0
- 位置：两侧边缘区（|x| 8~15, y 0~5, z -5~-10）
- 造型：半球伞盖（scale.y 呼吸脉动）+ 3~4 条触手细线（正弦摆动）+ 内发光核（AdditiveBlending）
- 颜色：生物发光色池 #22D3EE / #818CF8 / #00BFFF，透明度 0.25
- 动画：缓慢上下漂浮 + 伞盖呼吸 + 触手摆动（纯 CPU 正弦，无骨骼）

### 2. FishSchool 发光鱼群（思绪游弋）

- 数量：high 30 / medium 15 / low 0
- 位置：实体外围环形区（半径 6~10，y 0~2）
- 实现：Points 固定 buffer + drawRange（复用 OrbitalRing 模式，预定义环绕路径，非真 Boids）
- 颜色：白偏青小光点（size 0.04~0.06），透明度 0.4

### 3. LeviathanShadow 远洋巨影（未知敬畏）

- 造型：THREE.Shape 蝠鲼剪影 + ShapeGeometry，远景 z=-20~-30，scale 8~15
- 透明度：high 0.15 / medium 0.1（深海雾中隐没），low 关闭
- 动画：60~90 秒周期水平弧线滑过 + 上下起伏
- 成本：单网格 + 平移，1 draw call

## 文件与接入

- 新建：`client/src/lib/3d/objects/JellyfishField.tsx`
- 新建：`client/src/lib/3d/objects/FishSchool.tsx`
- 新建：`client/src/lib/3d/objects/LeviathanShadow.tsx`
- 接入：`client/src/lib/3d/scenes/DeepSeaWorld.tsx` 导入并挂载三个组件

**接入验证（强制）**：组件完成后必须确认 DeepSeaWorld 中存在 import 与 JSX 挂载点，防止"组件写好未接入"。

## 验证方式

- tsc -b --noEmit 零错误
- oxlint 零警告
- 现有测试套件通过
- 运行时深色主页确认元素浮现且不遮挡实体
