# 熵减 (Entropydecrease) — 设计令牌

前缀 `--kb-`，双主题（`:root` 浅色=晨曦浮光 / `[data-theme="dark"]` 深色=极夜深海）。Tailwind 通过 `tokenColor()` color-mix 支持 `/alpha` 修饰符。

## 品牌色彩（深色=极夜深海主用）

- 品牌主色 `--kb-brand-*`：深空蓝紫靛蓝系。深色模式核心 `brand-400 #6366F1`、`brand-500 #818CF8`、`brand-600 #6366F1`；浅色模式 `brand-500 #3B82F6`、`brand-600 #2563EB`
- 品牌辅色 `--kb-accent-*`：深色=赛博青 `accent-500 #06B6D4`、`accent-600 #22D3EE`（AI 标识/呼吸灯）；浅色=琥珀金 `accent-500 #F59E0B`
- 模块色（Tailwind 级）：`pomodoro #5B8A72`（苔藓绿）、`note #6B9BD2`、`flashcard #7BC4B8`、`feynman #C4956A`、`classroom #14B8A6`
- 功能色：`--kb-amber #FBBF24`（顿悟时刻）、`--kb-cyber-cyan #22D3EE`、semantic success/warning/error/info

## 背景与文字（深色）

- 背景：`bg-primary #0C1524`（极夜深海）、`bg-secondary #12203A`、`bg-tertiary #182A48`
- 文字：`text-primary #E0E6F0`、`text-secondary #90A0B8`、`text-tertiary #607088`、`text-inverse #0C1524`
- 边框：`border-default #223550`、`border-strong #2E4568`

## 排印

- 字体：`--kb-font-sans` Inter（无衬线 UI）、`--kb-font-serif` 霞鹜文楷 Lite（衬线，签名/仪式文字）、`--kb-font-mono` JetBrains Mono（计时器数字）
- 字号：d1 36px / d2 30px / h1 24px / h2 20px / h3 16px / b1 16px / b2 14px / b3 12px / c1 12px / c2 10px / `--kb-text-timer: clamp(4rem, 8vw, 6rem)`（64-96px 计时器大字）
- 宪法第五条：跳率 ≥4x（64-96px 衬线大字 + 10-12px 注文、竖排注文+印章、内容占屏 ≤40%）

## 间距 / 圆角 / 阴影

- 4px 基准：xs 4 / sm 8 / md 16 / lg 24 / xl 32 / 2xl 48；节奏间距 rhythm-xs 12 / sm 20 / md 32 / lg 48 / xl 72
- 圆角：sm 8 / md 12 / lg 16 / xl 20 / full；功能面板不对称圆角 `24px 12px 20px 16px`
- 阴影：`--kb-shadow-sm/md/lg` 深色带品牌蓝弥散光晕（`0 0 16px rgba(59,130,246,0.08)`）

## 动效节拍与物理弹簧

- 节拍（120ms 基准）：beat-xs 60 / beat 120 / beat-x2 240 / beat-x3 360 / beat-x5 600ms
- 时长：fast 150 / normal 250 / slow 400 / stagger 75ms；沉浸系 immersive 600 / synapse 800 / converge 400ms
- 缓动：default `cubic-bezier(0.4,0,0.2,1)`、bounce `cubic-bezier(0.34,1.56,0.64,1)`、spring `cubic-bezier(0.175,0.885,0.32,1.275)`、synapse `cubic-bezier(0.22,0.61,0.36,1)`
- Framer Motion 弹簧（`client/src/lib/animation/springConfig.ts`）：default 300/28、bouncy 400/20、gentle 200/35、stiff 500/35
- `prefers-reduced-motion: reduce` 全局处理：动画瞬间到达终态而非冻结

## 高级视觉效果工具类（client/src/index.css）

`kb-ripple`（波纹）、`kb-glass`（毛玻璃）、`kb-tilt-card`（3D 倾斜卡）、`kb-shimmer`（流光）、`kb-glow-border`（发光描边）、`kb-stagger`（级联入场）、`kb-ambient-glow`（环境光晕）、`kb-press-bounce`（按压回弹）、`kb-gradient-text`（渐变文字）、`kb-hover-lift`、`kb-feather-border`（羽化描边）、`kb-squircle`（超椭圆）、`kb-caustic-light`（焦散光）、`kb-immersive-bg`（沉浸背景）、`kb-pulse-ring`（脉冲环）、`kb-orb-breathe`（球体呼吸）、`kb-constellation-breathe`（星座呼吸）、`kb-constellation-surface`（浮现）、`kb-stat-breathe`（统计呼吸）；body 微纸质噪点 overlay 0.035
