# 熵减 (Entropydecrease) — Design System

> 浓缩自 `docs/product/entropy-visualization-constitution.md`（最高宪法）+ `docs/product/ui-ux-system.md`（执行圣经）+ `client/src/styles/tokens.css`（令牌）+ `client/src/index.css`（高级效果类）。

## 品牌核心叙事（宪法第一条，一票否决）

**形式即概念——热力学第二定律是本产品唯一的视觉主角。** 叙事范式：「万物趋于无序，而你在此造序」。

核心映射表（学习变量→视觉元素，禁止破坏）：
| 学习变量 | 视觉元素 |
|---------|---------|
| 概念掌握度 | 发光体亮度 |
| 遗忘 | 混沌雾（≤40% 不透明度） |
| 复习 | 秩序波纹 |
| 累计专注 | 珊瑚地形 |
| 灵感数 | 萤火 |

品牌美学 DNA：「深海生物发光美学」——深海萤火 / 认知琥珀金 / 赛博青。

**第二条 焦虑防线**：零负向语言、零倒计时（禁止红色倒计时压力）、零赤字、一切可关闭、回归奖赏。

**第三条 签名时刻**：三幕结构（静默 1-2s → 事件 4-6s → 余韵 2s，总 ≤10s），可打断、可变重奏、声音占一半。

**第五条 排印**：跳率 ≥4x（64-96px 衬线大字 + 10-12px 注文；竖排注文+印章；内容占屏 ≤40%）。

**第四条 性能降级**：high/medium/low 三级——粒子 ≤1500/≤500/≤100、Bloom+DoF/仅 Bloom/关闭。降级不删叙事，只调精度。

## 双世界主题

| | 深色「深海意识」（主用） | 浅色「晨曦穹顶」 |
|--|--|--|
| 背景 | `#0C1524` / `#12203A` / `#182A48` | `#FAF8F5` / `#F2EDE6` / `#EBE5DC` |
| 品牌主色 | 靛蓝 `brand-400 #6366F1` / `brand-500 #818CF8` | 蓝 `brand-500 #3B82F6` / `brand-600 #2563EB` |
| 品牌辅色 | 赛博青 `accent-500 #06B6D4` / `accent-600 #22D3EE`（AI 呼吸灯） | 琥珀金 `accent-500 #F59E0B` |
| 文字 | `#E0E6F0` / `#90A0B8` / `#607088` | `#2C2720` / `#7A7570` / `#9C9590` |
| 功能色 | `--kb-amber #FBBF24`（顿悟）、moss `#82C9A3`（进展）、cyber-cyan `#22D3EE`（AI） | 同族浅色 |

模块色（Tailwind 级）：pomodoro `#5B8A72`（深潜）、note `#6B9BD2`（结礁）、flashcard `#7BC4B8`（反衰减呼吸）、feynman `#C4956A`（浮出水面）、classroom `#14B8A6`（回声定位）。

## 排印 / 间距 / 圆角 / 阴影

- 字体：Inter（UI）/ 霞鹜文楷 Lite（衬线，仪式文字）/ JetBrains Mono（计时器 `clamp(4rem,8vw,6rem)`）
- 字号：d1 36 / d2 30 / h1 24 / h2 20 / h3 16 / b1 16 / b2 14 / b3 12 / c1 12 / c2 10
- 间距 4px 基准（xs4 sm8 md16 lg24 xl32 2xl48）；节奏 rhythm 12/20/32/48/72
- 圆角：8/12/16/20/full；功能面板不对称 `24px 12px 20px 16px`
- 阴影：深色带品牌蓝弥散光晕（`0 0 16px rgba(59,130,246,0.08)`）

## 动效系统

- 节拍 120ms 基准：60/120/240/360/600ms；时长 150/250/400ms；沉浸 600/synapse 800/converge 400ms
- 缓动：default `cubic-bezier(0.4,0,0.2,1)`、bounce `(0.34,1.56,0.64,1)`、spring `(0.175,0.885,0.32,1.275)`
- Framer Motion 弹簧：default 300/28、bouncy 400/20、gentle 200/35、stiff 500/35
- `prefers-reduced-motion: reduce` → 动画瞬间到终态（不冻结）
- 核心动效词汇：kb-float-up（14-24s 浮动）、kb-constellation-breathe（呼吸脉动）、kb-pulse-ring、kb-orb-breathe、kb-caustic-light（焦散光）、kb-immersive-bg、kb-shimmer、kb-glow-border、kb-stagger、kb-tilt-card、kb-press-bounce、kb-squircle

## 组件风格约束

- 毛玻璃面板：`bg-bg-secondary/60 backdrop-blur-xl border border-border/40`
- 按钮：primary `bg-brand-600` / secondary 边框 / ghost / ai 渐变 `from-accent-500 to-brand-500`；active:scale-0.97
- 图标：Lucide 线性 1.5 stroke；尺寸 14/16/20/24/32
- 卡片 hoverable：-translate-y-0.5 + shadow 增强
- 布局三层：Layer 0 3D 场景（z-0）/ Layer 1 功能面板（毛玻璃）/ Layer 2 标题栏

## 已知设计缺口（改进方向线索）

1. **硬编码色**：InspirationPage 用 `from-purple-400 to-purple-600`、`purple-500 to-cyan-500`、slate 灰，偏离品牌靛蓝/赛博青令牌
2. **3D 场景仍为概念原型**：深海缺粒子系统/生物发光体/焦散光落地
3. **动效分布不均**：灵感激活动效集中在 inspiration 模块；仪表盘统计卡 `kb-stat-breathe` 为唯一常驻动效
4. **叙事弱化**：部分状态直接暴露内部数据（如星座 title=sortStatus），未做叙事化翻译
