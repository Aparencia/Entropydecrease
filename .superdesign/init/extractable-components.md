# 熵减 (Entropydecrease) — 可提取组件

## 高价值可复用组件（可提取为 DraftComponent）

| 组件 | 位置 | 提取理由 |
|------|------|---------|
| KnowledgePreviewCard | features/dashboard/components/ | 知识足迹预览卡，跨模块复用价值高 |
| StreakBubble | features/retention/components/ | 连续打卡气泡（海洋隐喻），品牌叙事核心 |
| DepthMeter | features/retention/components/ | 累计深度计（身份认同） |
| CoralEcosystem | features/retention/components/ | 珊瑚生态缸（损失规避机制） |
| LearningProfile | features/retention/components/ | 学习画像洞察卡 |
| LearningPulse | features/dashboard/components/ | 学习强度曲线 |
| StartupRitual | features/dashboard/components/ | 学习启动仪式模态（宪法第三条签名时刻载体） |
| ImmersiveCanvas | features/inspiration/components/ | 沉浸式萤火海沟视图（相机飞行） |
| FilterBar | features/inspiration/components/ | 筛选栏（内容性质/认知深度/学科 chips） |
| SortPendingBanner | features/inspiration/components/ | 沉淀提醒条 |
| SignatureMoment | features/retention/components/ | 三幕签名时刻演出（静默→事件→余韵） |
| DiscoveryReveal | features/retention/components/ | 深海发现揭示弹窗 |
| WorldRecap | features/retention/components/ | 延时摄影开场（每日生长摘要） |
| FatigueEmpathy | features/retention/components/ | 疲劳共情觉察 |
| KnowledgeConstellation / KnowledgeSky | features/constellation/ + lib/3d/scenes/ | 知识星座（DOM/SVG 轨 + 3D 轨） |

## 环境光效组件

- AmbientLightPool（components/ui/AmbientLightPool.tsx）— 环境光点池
- KnowledgeGalaxy（components/ui/KnowledgeGalaxy.tsx）— 知识星系旋转光点
- InspirationConstellation — 灵感星座光点层

## 注意

- 全部组件要求 ≤300 行/文件（AI 编程规范），含 `@ai-context` 双语注释
- 设计宪法约束：不可重造 retention 引擎；降级 L1/L2 必须保留叙事语义
