# 熵减 (Entropydecrease) — 页面依赖树

## DashboardPage（client/src/features/dashboard/pages/DashboardPage.tsx，709 行）

「知识星空」沉浸式学习生态可视化。依赖：
- 数据：useLearningAnalytics、useCheckIn、pomodoro/flashcard/note/feynman stores、useKnowledgeGraph、retention stores
- 组件：`StartupRitual`（学习启动仪式模态）、`LearningPulse`（学习强度曲线）、`KnowledgePreviewCard`（知识预览卡）、lazy：`StreakBubble`/`DepthMeter`/`CoralEcosystem`/`LearningProfile`（留存四件套）、`KnowledgeConstellation`/`KnowledgeSky`（知识星座双轨）
- 布局：Hero 区（问候语 text-d2 + 日期 + 连续学习徽章 + 4 个核心统计卡 grid-cols-4 + 快捷操作）→ 留存区（3 列 grid + 右上角绝对定位 StreakBubble）→ 知识星座区 → 学习脉搏区（kb-section-blend）→ 知识预览区（grid-cols-3 卡片）
- 动画：staggerContainer（staggerChildren 0.08 + delayChildren 0.1）、heroStatVariant（SPRING.gentle）、kb-stat-breathe、fadeInUp
- 样式：`styles/dashboard.css`（页面级 CSS）

## InspirationPage（client/src/features/inspiration/pages/InspirationPage.tsx，431 行）

「萤火海沟」灵感收集。依赖：
- 组件：`FilterBar`、`InspirationCard`、`ImmersiveCanvas`（沉浸式视图）、`GlassInspirationCard`、`SortPendingBanner`（沉淀提醒条）、`AIThinkingIndicator`、EmptyState
- 数据：useInspirationStore、useAITagContent（AI 自动打标）、useBatchSort、useSortPendingReminder、useImmersiveState（沉浸状态机）
- 布局：Header（渐变图标 + 标题 + 沉浸入口按钮）→ 快速输入区（毛玻璃 backdrop-blur-2xl + focus 光效 + Ctrl+Enter）→ 筛选栏 → 灵感卡片列表（分组球群）
- 动画变体：pageVariants/headerVariants/inputVariants/filterVariants/listVariants（constants.ts）
- ⚠️ 硬编码色证据：`from-purple-400 to-purple-600`、`shadow-purple-500/20`、`from-purple-500 to-cyan-500`、`focus-within:border-purple-400/50`、`rgba(147,51,234,0.1)`（紫色，非品牌令牌）

## InspirationConstellation（client/src/features/inspiration/components/InspirationConstellation.tsx，282 行）

灵感星座光点层（沉浸背景组件）：
- 纯函数布局 `calculateConstellationLayout`（constellationLayout.ts）+ `calculateFlyInAnimation`（flyInAnimation.ts）+ `useRandomSurface`（随机浮现）
- L1 降级每类 ≤5 光点；L2 完全不渲染
- 4 种形状（circle/square/diamond/triangle clip-path）、3 种尺寸；双层动画：`kb-float-up`（14-24s 浮动）+ `kb-constellation-breathe`（呼吸脉动）
- FlyInDot：新灵感从中心飞入（CSS transition，left/top）
- CENTER_EXCLUSION 中心排除区（30-70%），为创作区留白
- ⚠️ `title={point.sortStatus ?? point.id}` 直接暴露内部状态而非叙事化文案

## PomodoroPage（client/src/features/pomodoro/pages/PomodoroPage.tsx，390 行）

「深潜」专注番茄钟：计时器大字（--kb-text-timer clamp 64-96px JetBrains Mono）+ 环形进度 + 模式切换 + 会话列表。

## NotesPage / FlashcardsPage / FeynmanPage / SettlingPage / ClassroomPage

各模块列表页：页头（渐变图标 + 隐喻名标题 + 副标题）+ 内容列表/网格 + 空状态。

## OnboardingPage（client/src/pages/OnboardingPage.tsx + components/onboarding/）

六步引导（Step1Welcome ~ Step7Shortcuts）+ OnboardingOverlay + ModuleTourToast + HelpCenter。
