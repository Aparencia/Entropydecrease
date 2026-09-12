# 动效规范（L4）

> **纲领原文（用户，2026-09-11）**：「我希望我的软件是充满动效的、充满创新设计、充满生命力的，而不是呆板、死板的。」
> 本规范是 **L4 动效层**的唯一规范载体；上游规格 = [前端重构设计 · §8 L4 动效纲领](../superpowers/specs/2026-09-11-frontend-redesign-design.md)（**凡引用规格处的行号锚点都指向该文件**；`docs/` 内同族规范用相对链接互引、**不带锚点**）。规格 §14（:836）登记的「`docs/standards/` 新增动效规范章节」即本文件。
> 🔴 **执行序**：本规范**先于任何动效代码**落地 —— AGENTS.md §0.4「规范与代码冲突时以规范为准；规范过时时先改规范再改代码」。
> 🔴 **`## 判据纪律（可测与不可测）` 一节是下游的机械输入**：其中的字符串被测试底座与守卫**逐字复用**，改写即判据失配。
> 🔗 **反向引用（T35 补 · R14.3；2026-09-13）**：本规范的**上位决策载体** = [`ADR-035` L4 动效纲领与引擎](../adr/ADR-035-l4-motion-grammar-and-engine.md)（引擎与唯一入口 / token 真源 / 三档与双基调载体 / 位移上限 / 判据纪律的**决策记录**）。规格 §14（`:836`）登记本文件、本文件回指 `ADR-035` ⇒ **引用双向闭合**（此前为单向：`ADR-035` → 本文件）。

## 目的

把「充满生命力」从形容词变成**三条硬指标 + 一套机器判据**：

1. **可执行**：四层时间尺度（响应 / 环境 / 编排 / 生长）各有量级、落点与配重。
2. **可验收**：三档强度可切换、可降级；每个签名动效**可中断、可反向**；`prefers-reduced-motion` **优先于档位**。
3. **可判**：凡能落成 DOM 结构 / `data-*` / 类名 / 属性值的，一律优先于时间判据；不可判的（真实帧率 / 真实几何位移 / 真机观感）**只登记，不编造弱判据**。

## 适用时机

- 新增或修改任何 `transition` / `animation` / `@keyframes` / GSAP tween·timeline·Flip 之前
- 新增动效落点（选择器、类名、`data-*` 锚点）、动效 token、强度档位通道、基调通道之前
- 改动 reduced-motion 名单之前
- 评审任何「动效已交付」「60fps 已达成」类结论之前（见「常见误区」）
- **不适用**：静态排版 / 配色 / 间距改动（属 L1 / L2 规范）；规格 §8.7（:569）明确不做的三类

## 四层纲领

规格 §8.1（:489）逐字表（**数值不得改写**）：

| 层 | 时间尺度 | 解决什么 | 具体点 |
|---|---|---|---|
| **响应层** | 80–180ms | 应用在听你说话 | 墨渍 hover（从指针位置扩散）· 按下微陷 · 焦点环落纸 · 勾选框落笔 |
| **环境层** | 2–6s 循环 | 应用在呼吸 | 探针摆动 · 采集脉冲 · **未确认段落墨度极缓慢起伏（幅度 2%）** · 到期刻度微光 |
| **编排层** | 400–900ms | 签名时刻 | 对齐 · 显影编排 · 相变凝固 · 时间码回跳 · 记忆浮现 · 图谱浮现 |
| **生长层** | 秒 → 天 | 熵减看得见 | 到期刻度生长 · 笔记树生长 · 知识图谱次第落位 · 一场课结构化过程中的收拢 |

**配重（规格 §8.6.1（:552）第 1 条，用户二次确认后定稿）**：

- **第一优先 = 响应层（80–180ms）+ 用户动作触发的编排层**：交互的那一刻才是「活」的主战场。
- **第二优先 = 环境层（2–6s）保持「可感知的生命感」**：用户原话「交互时最重要，**但闲置时也要有生命感（环境层别退太多）**」⇒ **不得**把环境层降为纯背景、**不得**压到看不见；「丰富」档**如实变丰富**（幅度与频率提高），而不是只在响应层加料。
- **分界**：环境层**永远不抢注意力**（幅度上限不动）、不阻塞交互、`prefers-reduced-motion` 下**整体静态**；响应层**每次动作都必须给回执**。
- 环境层的幅度上限（含 2% 的墨度起伏）**必须写成具名常量**，不许散落字面量。

> 🔻 **批 6 收口就地加注 · 「丰富」档的兑现口径（R42.2 ① 的理由改写；2026-09-13，**上面原文一字未改**）**：上条逐字「『丰富』档**如实变丰富**（幅度与频率提高）」在批 6 的**实际兑现 = 频率**（档位块里 `rich` 由 `--ed-dur-skeleton` 派生 `* 5 / 3` = 2000ms = 2–6s 带的下限）；**幅度上限未动** —— 真正依据**不是**「CSS 无原语」（逐档 `@keyframes` 是可行的），而是本规范上游规格 §8.6.1 第 1 条逐字「环境层**永远不抢注意力（幅度上限不动）**」⇒ 两处不冲突：**频率提高**合法、**幅度上限**是硬边界。⇒ 兑现度表**不得**写成「三档全兑现」。

**生长层是数据驱动的长时程**（到期刻度 / 笔记树 / 知识图谱）：它不靠一次性时间线表达，靠**真实数据的变化**；本批只做「到期刻度生长」（规格 §8.6（:536）表的第 4 行），其余登记。

## 引擎与分界规则

**引擎 = GSAP core + Flip + ScrollTo + CustomEase，配 `@gsap/react` 的 `useGSAP()` 做清理**（React 19 StrictMode 会双调用 effect，裸 `useEffect` + `gsap.to` 会留下重复 tween）。版本冻结 `gsap@3.15.0` + `@gsap/react@2.1.2`；**只进自己的 chunk 懒加载**（规格 §13（:811）的「GSAP 独立 chunk 懒加载」；验收口径见规格 §11-9（:760））。

分界判据（规格 §8.2（:498）逐字表）：

| 判据 | 用什么 |
|---|---|
| 单属性 · 无时序 · <200ms | **CSS transition**（hover 底色、焦点环、按下 scale） |
| 多元素 · 有时序 · 需中断/反向/seek | **GSAP timeline** |
| 「从 A 布局滑到 B 布局」 | **GSAP Flip** |
| 循环环境动效（骨架 / 探针 / 脉冲） | **CSS keyframes**（不占 JS 主线程，reduced-motion 一条媒体查询即静态） |

**唯一入口与插件注册**：全仓唯一 GSAP 入口 = `app/src/motion/engine.ts`，该模块**必须**在顶层执行 `gsap.registerPlugin(useGSAP, Flip, ScrollToPlugin, CustomEase)`。

- **为什么必须注册**（测试底座独有的事实）：`gsap` 的 `exports["."]` 把 `import → index.js`（ESM）与 `require → dist/gsap.js`（CJS）分成**两个物理文件**，而 `@gsap/react@2.1.2` 无 `exports`、`main` 指 CJS ⇒ Vitest external 后 `@gsap/react` 拿到 **CJS 运行时**、应用拿到 **ESM 运行时**，两个 `_context` ⇒ `context.revert()` **静默空转、无任何警告**。实测：未注册时 StrictMode 下 **2 个 tween**、卸载后 `transform` 残留；注册后 **1 个 tween**、卸载后 `transform=""`。**浏览器构建不受影响**（Vite 认 `module` 字段）。
- **懒加载边界**：`app/src/**` 中**静态** import `gsap` / `@gsap/react` 的文件集合 ∩ **首屏静态可达闭包 = ∅**（结构性判据，不用易腐化的白名单）。连带：需要 `useGSAP` 的组件**自身必须位于动态 import 链上**（首屏静态页里的 GSAP 动画要抽成 `React.lazy` 子件）。
  - 🔴 **`app/src/motion/controls.ts` 的适用面（T35 补 · R41.3 经 R61 重述）**：**不许从「首屏静态可达」的模块静态 import `controls.ts`**（它内部静态 `import { gsap } from "./engine"`）⇒ **惰性视图（`React.lazy` / 注册表驱动）静态 import 它是安全的**。⚠️ 该文件头今天仍写着一句**过宽**的绝对规则（「本模块只许经 `await import()` 到达」）—— **属波 D 标签清扫的待改项**（改它 = 改 `app/**` 源码注释，**不在 T35 的零生产代码面内**，只登记）。
- **插件静默退化**：未 `registerPlugin(CustomEase)` 时 `gsap.parseEase("自定义名")` 返回 `undefined`（只有一条 stderr 警告），动画**照跑**（走默认 ease）⇒ 依赖自定义 ease 的判据必须先断 `typeof parseEase(name) === "function"`。

**token 真源与位移上限**：

- 规格 §8.4（:518）的时长 / 缓动**只有一个真源** = `app/scripts/gen-tokens.mjs` ⇒ 产物 `app/src/ui/tokens.css` + `app/src/ui/tokens.gen.ts`；`motion.css` **不得**再出现 `:root{}` 的 `--ed-dur-*` / `--ed-ease` 定义（单一真源、绝不双写）。生成物**永不手改**：改 `gen-tokens.mjs` 后**必须**重生成，并**同提交**带上两个产物。
- 既有 10 个变量：`--ed-dur-micro` 120ms · `--ed-dur-overlay-in` / `-out` 200 / 160ms · `--ed-dur-toast-in` / `-out` 180 / 140ms · `--ed-dur-skeleton` 1200ms · `--ed-dur-card` 220ms · `--ed-dur-reveal` 500ms · `--ed-dur-page` 150ms · `--ed-ease` `cubic-bezier(0.2, 0, 0, 1)`（**出场比进场快**）。
- **位移上限 8px**（规格 §8.4（:518）末句）：任何动效位移（CSS `translate*()` 实参、GSAP tween 的位移参数）**≤ 8px**；GSAP 侧的位移参数经 `app/src/motion/` 层的**唯一出口**集中定义 —— 编排层的「远」靠**时长与错开**表达，不靠位移。
- 位移**不做成 CSS 变量**：没有消费者 = 死变量（还会给人「已被强制」的错觉）。强制手段是机器判据 —— 扫**全仓** `app/src/**` 的**生产文件**（`.css` / `.ts` / `.tsx`；**测试文件不在域内** —— 那里的 >8px 位移是 R8.1 的**测量样本**，实测 `motion/engine.test.ts` 的 `translate3d(50px, 0px, 0px)`）的 `translate*()` 数值实参，以及 `motion/` 层的位移常量，> 8px 即红（**判据域以裁决 R11.4 为准**：`margin` / `left` / `top` 这类**布局量不判** —— 实测那一类确有 >8px，但**全是布局量**，判它们会造假阳性；「动画不得动布局属性」由 `## 判据纪律` 的**属性集合审计**单独覆盖）。
- **相变 chrome 用绝对定位交叉淡入，不 animate height**；**列折叠内容先淡出 120ms 后宽度瞬跳**（宽度本身不做 transition，除非走 Flip）。

**`@keyframes` 桶边界（硬）**：循环环境动效**只留三处** —— `Loading` / `Skeleton` / `Probe`。`StatusLine` 归 **transition（无循环动画）**：状态行是**信息**不是「呼吸物」，循环动效会让它在长列表里变成噪音（「闲置时也有生命感」由 `Probe` 承担）。新循环动效**只能写进 `motion.css`** —— `Loading.css` / `Button.css` / `StatusLine.css` 三处均被既有守卫禁止新增 keyframes。

- **环境层的时长来源（登记，R16.3④ 的落点）**：环境层四件里**唯一未 token 化**的时长是 `Loading.css` 的 `ed-probe-swing 2.4s`（硬编码字面量）。批 6 **不**把它升成 token：`Loading.css` 在本批是零改动文件（G5），而在别处再写一个 `2.4s`/`2400ms` 就是第二个真源 ⇒ 采「**不发明数字**优先于凑齐 token」；它因此是**唯一**一条非 token 环境层时长，逐字登记在此。其余三条循环（采集脉冲 / 未确认段落墨度起伏 / 到期刻度微光）的周期一律从唯一真源 `--ed-dur-skeleton`（1200ms）以 `calc()` **倍数**派生 ⇒ 不新增时长字面量，`rich` 档的频率提高同样走 token 派生（`* 5 / 3` = 2000ms = 本节 2–6s 带的下限）。

**`usePresence`（既有事实 · 本批零改动）**：规格 §8.4（:518）第三段的落点 —— `app/src/ui/primitives/usePresence.ts` **已存在**（**200 行** · barrel 已导出 · 三相位 `enter/entered/exit` · 默认 `exitMs` 160 + `timeoutSlackMs` 80）。

- 它只负责**卸载时机**（GSAP 不管这个）：`transitionend` 监听**只认本节点**（`event.target === event.currentTarget`；子元素冒泡不得卸载本节点）+ **超时兜底**（reduced-motion 下不会有 `transitionend`，缺兜底会「关不掉的弹层」）。
- `matchMedia` **必须自带守卫**（`typeof window.matchMedia !== "function"`；vitest 全局 node 环境无此 API）。
- **本批不动它**（不扩 `propertyName`、不改签名）；GSAP 路径的挂载 / 卸载时机另建 `app/src/motion/useMotionPresence.ts`（R2.4）。

## 双基调

规格 §8.3（:511）逐字表：

| 面 | 基调 | 缓动 | 适用 |
|---|---|---|---|
| **有「读数」的界面** | 精密仪器 | `power3.inOut`，匀速段更长，沿轴线、带刻度感 | 采集 · 复习 · 时间轴 · 到期刻度 |
| **有「文字」的界面** | 活的纸 | `power2.out` / 自定义「洇开」曲线，带**惯性沉降**（**不是回弹**） | 笔记 · 会话 · 体系 |

- **载体 = `data-tone` 属性**，取值逐字 `"instrument"` | `"paper"`；**每个动效落点显式声明基调**。**禁止**在 CSS 里用类名区分基调（会与既有 `ed-*` 类名空间冲突）。
- 缓动落点 = `tokens.gen.ts` 的两个缓动 token；GSAP 侧经 `CustomEase.create()` 注册**具名 ease**（默认 ease 不承担基调语义）。
- 「惯性沉降」是**减速到停**（无过冲、无二次反方向运动）；「回弹」属规格 §8.7（:569）明确不做的三类之一。

## 强度三档与 reduced-motion 优先级

规格 §8.5（:526）逐字表：

| 档 | 行为 |
|---|---|
| 节能 | 只留响应层；编排层直接跳终态 |
| 标准（默认） | 四层全开，环境层幅度减小 |
| 丰富 | 环境层幅度与频率提高，编排层加长、错开更明显 |

- **载体 = `data-motion` 写在 `<html>` 上**，取值逐字 `"eco"` | `"standard"` | `"rich"`，**默认 `"standard"`**；持久化键逐字 `motion:intensity`（照 `useViewMemory` 范式：纯函数 + 注入 `Storage` + 惰性读取 + 静默降级）。
- **初值 = 跟随系统**：`prefers-reduced-motion: reduce` ⇒ `"eco"`，否则 `"standard"`。`matchMedia` **必须自带守卫**（`typeof window.matchMedia !== "function"`；jsdom 无此 API）。
- 🔴 **系统 `prefers-reduced-motion` 优先于档位**：本规范的**强制级**（非可选优化），规格 §8.5（:526）逐字；reduced-motion 下**整体静态**。🔴 **承重机理（R18.1 的因果更正）**：真正让系统赢的是 **reduced-motion 块的每条声明都带 `!important`**（档位块不带）—— 按 CSS Cascade，即使把两块顺序对调，reduced 仍然赢。**档位规则块必须写在 reduced-motion 块之前**这条源序要求仍然成立，但性质是**防御性钦定**（守的是「reduced 块带 `!important`、档位块不带」这两条前提被无意改动）；🔴 **不得**给档位块加 `!important` —— 那会**反转**无障碍优先级，违反规格 §8.6.1（:552）第 4 条「『活』不得以无障碍为代价」。两条机器判据：`ui/primitives/motion-coverage.test.ts` 的源序 describe（行号比对）+ `motion/responseSeams.test.ts` 的 I-2（逐条声明带 `!important`）/ I-3（两块之间零规则块）。
- **reduced-motion 覆盖率 100%**（规格 §11-5（:741））：名单是**双向的** —— ① 每类原语的**根类**（动效挂在它身上的选择器）必须在名单里；② **每一处 `animation` 声明的选择器原文（含伪元素）必须逐字进名单**。`animation-duration` / `animation-iteration-count` **不是可继承属性** ⇒ 只写宿主基类时伪元素（如 `.ed-skeleton::after`）**拿不到**覆盖（实测仍是 `1.2s / infinite`）。
- 名单**只许加进 `app/src` 内那一条 reduced-motion 块**（`motion.css`），**不得**新开第二条媒体查询；块**位置唯一**，名单可增长。
- 新动效落点的类名必须是 **`<既有基类>--<修饰>`** 形状（修饰类与基类同元素、已被同一条规则覆盖，**不进**基类名单；新起一个 `.ed-*` 基类名会撞既有守卫的选择器域）。

## 判据纪律（可测与不可测）

> 本节是**机械输入**：下列字符串被测试底座与守卫**逐字复用**，改写即判据失配。
> 🔴 **限度**：本规范的**纪律串判据是机械的**：只证「字符串在不在」，**不证**实现是否真的遵守。
> 依据：规格 §11-10（:766）「6 个签名动效各自**可中断、可反向**，reduced-motion 下正确降级」。

### 可用判据（四类，优先级即此序）

| # | 类别 | 形态 |
|---|---|---|
| 1 | **DOM 结构 / `data-*` / 类名 / 属性值** | 结构锚点：`data-motion` · `data-tone` · `data-shell-phase` · `data-phase`。最稳、最快：**凡能落成结构的优先落结构** |
| 2 | **确定性时序** | `gsap.timeline({paused:true})` + `tl.time(t)`（见下） |
| 3 | **tween 计数 + 属性值双断言** | 计数取 `gsap.globalTimeline.getChildren().length`；属性值取目标元素 `style.transform`（⚠️ **口径（T35 补 · §三十四 #14）**：`getChildren()` **默认是递归口径** ⇒ 本实现下「只剩 1 条补间」的**正确值是 2**（旧时间线的子 tween 也在递归层）；只有 **`getChildren(false, true, true)`**（非递归）才 `=== 1`。T11 的判据**两种都断**） |
| 4 | **被动画属性集合审计** | 「60fps」在本环境**唯一**的机器抓手（见下） |

### 确定性推进：唯一正解与四个禁用项

| 项 | 逐字 | 为什么 |
|---|---|---|
| ✅ **唯一正解** | `gsap.timeline({paused:true})` + `tl.time(t)` | 时间由测试给定，与墙钟 / 帧调度无关。实测精度：`power2` tween（dur 0.5、`x: 0 → 100`）在 `tl.time(0.25)` ⇒ `translate3d(87.5px,0px,0px)` **逐字精确** |
| 🔴 禁用 | `gsap.updateRoot` | 被漂移的 `globalTimeline._start` 偏移（实测 0 → 0.105 → 0.199） |
| 🔴 禁用 | `gsap.ticker.tick` | **墙钟驱动**，紧循环推进 ≈ 0 |
| 🔴 禁用 | `gsap.ticker.sleep` | 新建 tween 会**同步唤醒**并立刻跑一帧 |
| 🔴 禁用 | `await sleep` | 真实定时器 / fake timers：实测不可复现（`5.6 / 18` 与 `97 / 90.9` 两组读数） |

禁用项**一律不得**作为推进手段；测试里的推进调用**只能是**正解。

### 可中断 / 可反向：必须双断言

**同时**断 `gsap.globalTimeline.getChildren().length`（或旧 tween 的 `totalTime()` 冻结）**与** 目标元素 `style.transform`。
**只看 `style.transform` 会假绿** —— GSAP 3 默认 `overwrite:false` ⇒ 覆盖同属性时旧 tween **仍在跑**。

任一签名动效（规格 §8.6（:536）的 6 条）**四者缺一即不达标**：① 起始态被**持有**（可反向的状态源）② **可中断**（下一个输入接管，不排队）③ reduced-motion 下**正确降级**（跳终态）④ **三档下的三档行为**。

### 性能判据 = 被动画属性集合审计（代理判据）

被动画的 CSS 属性集合必须 **⊆ `{transform, translate, rotate, scale, opacity, filter}`**（即**未动 layout 属性**）。实测对照：动 `x + opacity` 只写 `translate/rotate/scale/transform/opacity`；动 `width` 会写 `width`。
⇒ 需要几何变化的动效走 **transform 路径**（例：Flip 用 `scale: true`）—— **不放宽本判据去迁就实现**。

### 不可用判据（只能登记，不许编造弱判据）

真实 60fps · Flip 几何位移 · 真实媒体播放 · `window` 级滚动 · 真机 / WebView2 观感 · 视图密度观感 · 切视图卡顿 · 惰性挂载的运行时内存效果 · 暗档（`data-theme`）实际生效。

- **真实帧率不可判**（jsdom 无 paint / 无 layout-shift、`getBoundingClientRect` 恒 0、rAF 实测 ≈ 39fps）⇒ 结论**不得**出现「60fps 已达成」，只能写「真实帧率**未测**；代理判据 = 未动 layout 属性」。
- **Flip 几何零可观测**（`Flip.getState` 的 `bounds` 全 0、`Flip.from()` 的位移增量恒 `translate3d(0px,0px,0px)`）⇒ 只用「结构契约 + Flip 已注册 + timeline 存在 + 属性集合 ⊆ transform 族」的弱判据 + headless / 登记。
- **`ScrollToPlugin` 的 `window` 目标不可用**（读数恒 0，且抛 `Not implemented: Window's scrollTo()`）⇒ 判据收敛到**元素级** `scrollTop` / `scrollLeft`。
- **暗档**：`[data-theme="dark"]` 今天只有定义、**无写入方**（运行时永不生效）⇒ 新增动效 CSS **不得假设亮档**，一律 `var(--ed-*)`，且**不得**用 `[data-theme]` 做前提。

> 🔻 **批 6 收口就地加注 · 上列九项的**本批读数**（T35 · 逐条给「本批未做 / 仪器不可达」；2026-09-13，**上面原文一字未改**）**：口径 = `task-34-report.md` §12（诚实单列）。
> | # | 不可判项 | 本批读数（逐条） |
> |---|---|---|
> | 1 | 真实 **60fps** | **未测**（jsdom 无合成器；rAF 实测 ≈ 39fps）⇒ 代理判据 = 「未动 layout 属性」（T11 的属性集合审计）；🔴 收口**不得**出现「60fps 已达成」 |
> | 2 | **Flip 几何位移** | **零可观测**（`Flip.getState` 的 `bounds` 全 0、位移增量恒 `translate3d(0px,0px,0px)`）⇒ 只判「结构契约 + Flip 已注册 + timeline 存在 + 属性集合 ⊆ transform 族」；**T33 落地 2 / 8 处**（授权路径 B） |
> | 3 | **真实媒体播放 / seek** | **不可达**（jsdom 无媒体栈 · headless Edge 不说 `asset:` 协议 · 真机已裁决跳过）⇒ **不得**声称「播放已可用 / seek 已验证」；只有 `<audio>` 属性契约 + Rust 路径边界 + 纯函数两级判据 |
> | 4 | **`window` 级滚动** | **不可用**（读数恒 0、抛 `Not implemented`）⇒ 判据收敛到**元素级** `scrollTop` / `scrollLeft`（T25/T31 实测可精确断言） |
> | 5 | **真机 / WebView2 观感** | **未测**（用户已裁决跳过）⇒ 无代理、只登记 |
> | 6 | **视图密度观感** | **未测**（jsdom 无排版）⇒ T25/T27/T31 只判结构属性 |
> | 7 | **切视图卡顿** | **未测**（无合成器、无真实 chunk 加载时序）⇒ 只登记 |
> | 8 | **惰性挂载的运行时内存效果** | **未测**（字节面可测、内存面不可测）⇒ 只登记 |
> | 9 | **暗档 `data-theme` 实际生效** | **无写入方**（运行时永不生效）⇒ 本批新增动效 CSS 一律 `var(--ed-*)`、不假设亮档；接线登记批 7/8 |
> - 另两条**本批专属**的不可判：**三档「看起来不一样」**（jsdom 无排版、几何无差异）⇒ 只判档位映射 + DOM 属性 + 源序 + 时长参数 · **环境层「在呼吸」的观感** ⇒ 只判幅度（2% 逐字）/ 频率 / 桶 / 名单 / 形状 / 类名落点。
> - ⚠️ **本批的措辞纪律（收口复检）**：`charRate` **不得**被称为「真实语速」（它是**字符率近似**，规格未定义语速函数）；`aligned === false` **不得**被描述为「未对齐」（是「无基准、**不能保证**」）；「落了 seam」**≠**「已交付」；「判据绿」**≠**「体验已验证」。
> - **未编造弱判据**：上列九项 + 两条**本批一律只登记**，未为它们新造判据（唯一例外 = 真实构建产物的 `vendor-gsap` 三件套与 `engine.guard` 的闭包交集，那是**已有工具可算**的硬判据，不是为本清单新造的）。

### 两条 API 陷阱

- `tl.to()` 返回 **Timeline 本身**，不是 Tween ⇒ 「旧 tween 冻结」判据要拿句柄，必须用 `tl.to(...).getChildren()` 或直接用 `gsap.to(...)`（否则 `totalTime()` 永远为真 = 假绿）。
- **绝不可把 jsdom 的 `performance` 挂到 `globalThis`**（`Performance-impl.js:14` 自调用 ⇒ 栈溢出，整个测试进程挂掉）。

## 检查清单

- [ ] 动效所属层已判定（响应 / 环境 / 编排 / 生长），时间尺度落在该层区间内
- [ ] 引擎已判定（CSS transition / GSAP timeline / Flip / CSS keyframes），且未越界（如 < 200ms 的单属性不要上 timeline）
- [ ] 位移 ≤ 8px，且位移经 `motion/` 层唯一出口（CSS 侧无 > 8px 的 `translate*()` 实参）
- [ ] 被动画属性集合 ⊆ `{transform, translate, rotate, scale, opacity, filter}`
- [ ] 时长 / 缓动**只**引用 token（无新字面量、无第二个真源），生成物未手改
- [ ] 落点声明了 `data-tone`；行为在 `eco` / `standard` / `rich` 三档下都成立
- [ ] 该落点在 reduced-motion 名单里（选择器**含伪元素**逐字进名单；块位置未新增、未移位）
- [ ] 交互触发的动效**可中断**（下一个输入接管，不排队）且**可反向**（起始态被持有）
- [ ] 判据落在四类可用判据内；不可判的项已写进「只能登记」清单（未编造弱判据）
- [ ] 未向 `Loading.css` / `Button.css` / `StatusLine.css` 新增 `@keyframes`；`StatusLine` 仍是 transition、无循环

## 输出物

| 输出物 | 格式 | 存放位置 |
|---|---|---|
| 动效落点登记（层 / 基调 / 档位行为） | `data-*` 结构锚点 + 断言 | `app/src/**`（结构锚点即登记面） |
| 判据与变异体 | Vitest 用例 + 变异体记录 | `app/src/**/*.test.ts(x)` + 批次台账（不入库） |
| 「只能登记」清单（不可判项） | Markdown | 批次收口报告 + 版本文件的诚实代价节 |
| 规范本体 | Markdown | 本文件 |

## 常见误区

| 误区 | 正确做法 |
|---|---|
| 「动效都写了」= 已交付 | 逐条给**兑现度**；「落了接缝但 0 调用点」**不算**交付 |
| 用真实定时器推进动画再断言 | 只用 `gsap.timeline({paused:true})` + `tl.time(t)` |
| 只断 `style.transform` 就宣称可中断 | **双断言**（tween 计数 / 冻结 **与** 属性值） |
| 声称「60fps 已达成」 | 真实帧率**未测**（仪器不可达）；用属性集合代理判据 |
| 为 Flip 写几何位移验收 | jsdom 里几何零可观测 ⇒ 弱判据 + headless / 登记 |
| 给新循环动效新起 `.ed-*` 基类名 | 用 `<既有基类>--<修饰>` 形状；名单只加进同一条 reduced-motion 块 |
| 把系统 reduced-motion 当「可选优化」 | 系统优先于档位（**源序**保证），覆盖率 100% |
| 新增动效 CSS 假设亮档 / 拿 `[data-theme]` 做前提 | 一律 `var(--ed-*)`；暗档今天无写入方（登记批 7 / 8） |
| 用类名区分双基调 | 用 `data-tone` 属性 + 两个缓动 token |
| 在 `motion.css` 里再写一份时长 / 缓动 | 真源只有 `gen-tokens.mjs`；`motion.css` 零 `--ed-dur-*` / `--ed-ease` 定义 |

## 相关文档

- [AI 协作与代码生成七维度](ai-coding.md) — 注释 / 强类型 / 可测试性
- [测试策略](testing.md) — 确定性时序底座的落点
- [性能优化工作流](performance.md) — 首屏预算与懒加载边界
- [文档编写规范](documentation.md) — 就地加注与登记写法
- [前端重构设计 · §8 L4 动效纲领](../superpowers/specs/2026-09-11-frontend-redesign-design.md) — 本规范的上游规格
- [UI/UX 系统](../product/ui-ux-system.md) · [主题](../product/theme.md) — token 与观感口径
