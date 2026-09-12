# ADR-033：L1 原语层与视图层契约

> 状态：已接受（2026-09-11，批 0-D 落地）
> 关联：[前端重设计规格](../superpowers/specs/2026-09-11-frontend-redesign-design.md)（§4 / §5 / §8.6.1 / §10 / §11）· [ADR-032](./ADR-032-frontend-design-system-tokens.md) · [ui-ux-system.md](../product/ui-ux-system.md) · [批 0-D 实施计划](../superpowers/plans/2026-09-11-frontend-redesign-batch0d-primitives.md) · 批次台账 `.superpowers/sdd/2026-09-11-frontend-redesign-batch0d-primitives/progress.md`

## 背景

ADR-032 交付了 token 层（色阶 / 字阶 / z-index 标尺 / 图标），但**样式仍然只能逐文件改**：实测 2,256 处内联 `style={{`、
仅 4 处 `className`、`:hover` / `:active` 在活代码里 **0 处**、`:focus*` / `:disabled` **各 0**、`aria-disabled` **0**、
禁用视觉降级全站 **1 处**、`role="dialog"` / `aria-modal` / `createPortal` **各 0**、`@keyframes` **0 个**、
`prefers-reduced-motion` 在 `app/src` 里 **0 处**（recon §2 / §3 / §8 / §10）。

后果有三条：
① **批 4 的迁移**（20 弹层 / 44 空态 / 85 加载 / 196 错误行 / 4 toast / 2 confirm / 上千处内联样式）没有靶子 —— 无处可迁；
② **批 6 的动效**（规格 §8「活的纸」）没有接缝 —— 单属性 120ms 的回执、进出场 200/160、可中断可反向，都需要一个
"下次只改一处"的挂载点，否则每加一个动效都要回头改每一处调用点；
③ 交互态与无障碍能力（键盘焦点、禁令、屏幕阅读器语义）在仓内**没有先例**，不建立即无从复用。

用户对动效纲领的答复是「**我希望我在对其进行交互时，它是活的**」（规格 §8.6.1）—— 它把重心放在**用户动作的那一刻**，
因此原语必须**内置交互态**，而不只是"长得对"。

## 决策

### 1. 原语层的落点、清单与导出面

新建子域 `app/src/ui/primitives/`，沿用 `app/src/ui/icons/` 的「子域 + 单一 `index.ts` 导出面」范式。
规格 §1（L1 裁决 6）的 **10 类原语**中，**9 类在本批落地**（第 10 类 z-index 标尺已在批 0-A 交付，本批只消费）：

| # | 原语 | 本批落地的文件（实测行数 · `countLines()` 口径） | 吸收的现状病灶 |
|---|---|---|---|
| 1 | `Text` | `Text.tsx` 89 · `Text.css` 46 · `Text.test.tsx` 130 | `fontSize` 1274 行/143 文件 · 弱化灰 256 行/100 文件 |
| 2 | `Surface` | `Surface.tsx` 97 · `Surface.css` 73 · `Surface.test.tsx` 168 | `borderRadius` 584 行/134 文件（4 值混用）· `boxShadow` 18 个不同字面值 |
| 3 | `Button` | `Button.tsx` 132 · `Button.css` 92 · `Button.test.tsx` 286 | `<button>` 510 行/121 文件全是内联样式 · 按钮样式常量 86 行/60 文件 |
| 4 | `Modal` | `Modal.tsx` 188 · `Modal.css` 81 · `Modal.test.tsx` 296 · `Modal.exit.test.tsx` 91 | 28 个手写弹层（其中 11 个早退式卸载） |
| 5 | `ConfirmDialog` | `ConfirmDialog.tsx` 192 · `ConfirmDialog.css` 58 · `ConfirmDialog.test.tsx` 297 | 23 处命令式确认（`window.confirm` 在 WebView2 下可能静默返回 false） |
| 6 | `Toast` | `Toast.tsx` 257 · `Toast.css` 76 · `Toast.test.tsx` 249 · `Toast.interrupt.test.tsx` 167 · `Toast.style.test.ts` 132 · `Toast.placement.test.tsx` 123 | 4 套自绘 toast，**全部只有进、没有出** |
| 7 | `EmptyState` | `EmptyState.tsx` 170 · `EmptyState.css` 91 · `EmptyState.test.tsx` 276 · `EmptyState.align.test.tsx` 102 | 40 行/28 文件的「暂无…」灰字，5 套空态，首启无主行动按钮 |
| 8 | `Loading` / `Skeleton` / `Probe` | `Loading.tsx` 105 · `Loading.css` 79 · `Loading.test.tsx` 238 | 85 处/30 文件的手写灰字，全站 0 骨架屏 |
| 9 | `StatusLine` | `StatusLine.tsx` 94 · `StatusLine.css` 42 · `StatusLine.test.tsx` 267 | 196 处/76 文件，三种红并存，错误常在列表最底部 |
| — | 共享内核 | `usePresence.ts` 200 · `usePresence.test.tsx` 282 · `usePresence.node.test.ts` 71 · `useFocusTrap.ts` 122 · `useFocusTrap.test.tsx` 236 · `ime.ts` 18 · `ime.test.ts` 32 | 卸载时机 / 焦点陷阱 / IME 组合态 |
| — | 接缝与守卫 | `motion.css` 74 · `index.ts` 45 · `style-seams.test.ts` 287 · `style-contract.test.ts` 233 · `motion-coverage.test.ts` 147 | 动效变量与 reduced-motion 块 · 导出面 · 机器判据见 `style-seams` / `style-contract` / `motion-coverage` 三个测试文件 |
<!-- line-count-src: files=app/src/ui/primitives/motion.css,app/src/ui/primitives/index.ts,app/src/ui/primitives/style-seams.test.ts,app/src/ui/primitives/style-contract.test.ts,app/src/ui/primitives/motion-coverage.test.ts caliber=countLines@scripts/line-limits.mjs authority=HEAD-remeasurement -->

> **行数口径（唯一有效）**：`countLines()`，即 `[System.IO.File]::ReadAllLines(path, UTF8).Count` —— **含空行**的全部行数（禁用 `Get-Content` / `Measure-Object -Line` / 数 `0x0A` 字节）。
> **权威来源**：逐文件数值以机器生成的 [行数豁免登记](../standards/line-limit-exemptions.md) 为准（`node scripts/line-limits.mjs --write` 生成、`--full` 校验，**不要手改其数字**）；本表只是**人读摘要**。
> 注：本表所列原语全部 ≤300 行，在登记表内属**人工追加的记录块**（`--write` 只重算 >300 行的登记区）⇒ 两份不一致时按上句口径在 HEAD **重新实测**，再同步两份。

**导出面**：`primitives/index.ts` 是唯一公共入口（批 4 之后全站从这里 import）；**组内互引用走相对文件路径**
（`./Text`），**不 import barrel** —— 避免循环依赖。`index.ts` 另承担 `import "./motion.css";`：导入本层即带上
动效变量与 reduced-motion 块；**深导入单个原语不会带走 reduced-motion 块**（该边界写在 `index.ts` 的 `@ai-context` 里）。

**本批全部 42 个文件逐个 ≤300 行（最大 297）**，无需行数豁免登记。

### 2. 依赖方向：领域 → 视图 → 容器 → 原语，**禁止反向**

这是规格 §7.1 四部件依赖方向在原语层上的落法，也是本 ADR 的**核心约束**：

- 原语**不得** import `components/` · `pages/` · `hooks/` 里的任何东西（本批实测：0 处违反）。
- 原语之间只有**单向组合**：`EmptyState` → `Button` + `Text` + `icons`；`Modal` → `Button` + `Text` + `useFocusTrap` + `usePresence`；
  `ConfirmDialog` → `Modal`；`Toast` → `Button` + `Text` + `usePresence`；`StatusLine` → `Text`。
  **叶子原语不知道自己被谁组合** —— 故 `ConfirmDialog` 复用 `Modal` 的容器/层叠/进出场/焦点陷阱/ESC，自己只加
  「初始焦点重定向到取消」这一件事（17 行，不是第二套陷阱）。
- 反向依赖的具体危害：一旦原语 import 了某个业务组件，批 4 的迁移就会把业务耦合拖进 L1，且"换实现只改一个文件"失效。

### 3. 消费纪律：只许 `var(--ed-*)` 与 `zIndex()`

- 颜色与尺寸**一律经 CSS 变量消费 token**；`primitives/**/*.css` 内**零颜色字面量**（色值只允许出现在
  `app/scripts/gen-tokens.mjs` 与产物 `app/src/ui/tokens.css`）。
- **z-index 一律走 TS 标尺** `zIndex("modal" | "modalNested" | "toast")`，**不写裸数字**
  （规格 §4.2①：标尺是 TS 模块而不是 CSS 变量，写成变量会重新打开「谁都能随手写个数字」的口子）。
- 陷阱记录在案：`varRef()` / `cssVar()` 的入参类型是 `ColorTokenName`（16 个颜色名的字面量联合），
  **阴影与字阶变量没有门面函数**（`varRef("shadow-2")` 编译期报错）⇒ 它们**只在 CSS 里以 `var()` 消费**，
  本批**不改** `tokens.ts` 的门面签名。
- 三条机器判据（`style-seams.test.ts`）：零颜色字面量（**先剥注释**）· 动效位移 ≤ 8px · CSS 类 ↔ 规则一致。

### 4. 交互态与样式的承载方式：**CSS 类**，不是内联 style

`:hover` / `:active` / `:focus-visible` / `@keyframes` / `@media (prefers-reduced-motion)` **都无法内联表达** ——
而 §8.6.1 的四条硬约束恰恰要求这些能力。故本批全站**首次大规模使用 `className`**（改造前 4 处），
类名规约：`.ed-<原语>` 基类 + `.ed-<原语>--<档>` 修饰类 + `.ed-<原语>-<部位>` / `.ed-<原语>__<部位>` 子元素类。

`style` 仍是**纯透传**（供调用点布局与批 6 的动效接缝使用），但**视觉权威在类**：
调用点若用 `style` 覆盖四态的底色/位移，等于把"一处改对所有地方"重新打散。
**行内 `style` 覆盖 CSS 类**（`motion.css` 文件头 ⑤ 记有同一句）：批 6 若用 `style` 直驱属性值，
**类上声明的 transition 仍然在**（过渡由类规则声明），但**终值以 `style` 为准**；反之要让类规则重新当家，
必须先把 `style` 摘掉。

本批建立的交互态能力（改造前均为 0）：`:hover` 三档各异 · `:active` 按下微陷 1px · `:focus-visible` 2px 焦点环
（首个落在 `Surface.css`，`Button.css` 是第二个）· `:disabled` 与 `[aria-disabled="true"]` 的统一视觉降级 ·
`cursor: not-allowed` · `:disabled` 移出 Tab 序而 `busy` 保留焦点（`aria-disabled` + `aria-busy`）。

> ⚠️ **批 4 收口就地加注 · §4 的「行内 style 禁令」自何时起有真实输入（2026-09-12；**上面原文一字未改**）**：
> - 本条禁令（「调用点不得用行内 `style` 覆盖类的底/圆角/边框」）在批 0-D 落笔时**对真实代码是空真的** —— 当时全仓 `<Surface>` **0 个**。批 4 的 `69489f9f`（`refactor(ui): migrate card borders to surface`）**第一次真正使用 `Surface`**：14 个 `<Surface>` 开标签，机器判据（`surfaceRatchet.test.ts` ⑦）实测**覆盖命中 0**；同一提交把 `FROZEN_SURFACE_TAG_TOTAL` 由 **0 → 14**（T17-A 冻结的「零」是**故意的空真登记**，一迁移就会红）。⇒ 本条禁令**自 `69489f9f` 起有真实输入**。
> - **已知边界（诚实登记，不得读成「判据完备」）**：⑦ 的文本级启发式只认 `style={{ … }}` **字面对象** ⇒ `style={S}` / `style={pick()}` 这类**间接写法是假阴**（写在 `overridesSurface()` 的文档注释里）。批 4 迁移的 14 处**全是直接形态**，故对本批读数无影响 —— 但**下游若用变量间接给 `style`，棘轮会漏**。
> - **同源的两条原语缺口（批 4 实测，登记为 follow-up 而非本批动作）**：① `SurfaceProps` 无 DOM 属性透传（`onClick`/`id`/`aria-*`/`data-*`/`dangerouslySetInnerHTML`/`ref`）⇒ 至少挡住 3 处已点名 + 未来 21 处；② `Surface` 基类**必出底色**、无「只出边框」档 ⇒ 挡住 **28 处**透明边框容器。两条都属「批 5 与视图层一并裁」（B22 第 3 条）。

### 5. 动效接缝契约：`[data-phase]` 三态 + `usePresence` + 时长变量名

- **相位协议**：`enter`（已挂载的起点态，等一帧让过渡起步）→ `entered`（终态）→ `exit`（退场中），
  由消费方写到 `[data-phase]` 上，`Modal` / `ConfirmDialog` / `Toast` 共用同一协议。
- **卸载时机**归 `usePresence`：`transitionend`（只认本节点自身的过渡）+ **超时兜底**（`exitMs + 80ms`）——
  reduced-motion 下**永远不会有 `transitionend`**，只等事件就是"关不掉的弹层"；`matchMedia` **自带守卫**
  （vitest 全局 node 环境与 jsdom 30 都没有 `window.matchMedia`）。**可中断可反向**：退场途中 `open` 回 `true`
  ⇒ 清计时器、直回 `"entered"`（不重放进场）。
- **时长变量名与数值**（`motion.css` 定义一次，消费方写 `var(--ed-dur-x, <同值字面量>)`）：
  `--ed-dur-micro 120ms` · `--ed-dur-overlay-in 200ms` / `--ed-dur-overlay-out 160ms`（**出场比进场快**）·
  `--ed-dur-toast-in 180ms` / `--ed-dur-toast-out 140ms` · `--ed-dur-skeleton 1200ms` ·
  `--ed-dur-card 220ms` · `--ed-dur-reveal 500ms` · `--ed-dur-page 150ms` · `--ed-ease cubic-bezier(0.2,0,0,1)`。
- **★ 批 6 的接管机制（本批存在的理由）**：`--ed-dur-*` / `--ed-ease` 的**真源属批 6**（0-A 计划自审已推迟）。
  本批把它们按规格 §8.4 的**名字与数值**先落在 `motion.css` 一处，所有引用点都写成
  `var(--名, 同值字面量)` ⇒ **批 6 落地真源时整块删除即可生效**，无需改任何规则；
  同理 `@media (prefers-reduced-motion)` 只写这一处（`motion.css`），新原语只要**根类进名单**就自动被覆盖。
- **★ 三方同值纪律**（T9 评审 I-3 的通用化）：JS 侧的**兜底窗口**（`usePresence` 的 `exitMs`，写在组件的
  `const EXIT_MS`）与 CSS 侧的**过渡时长**必须是同一个数，且与 `motion.css` 的 token 定值相等 —— 漂移时
  **不会有任何报错**：JS 早了 = 过渡被截断（看不见出场），JS 晚了 = 节点多残留一截（那段时间还能被点到）。
  机器判据：`style-contract.test.ts` 的「退场时长三方对拍」（`Modal.tsx`+`Modal.css` / `Toast.tsx`+`Toast.css` 各一行）。
- **reduced-motion 判据 = 基类名单 + 动画落点名单**，不是"全类集合 ⊇"：`.ed-modal-head/body/foot`、`.ed-confirm-seal/-impacts/-keep`、
  `.ed-empty__title`、`.ed-toast-action` 这类**子元素类**与基类同在一个元素上，已被同一条规则覆盖（逐字枚举只会假红）；
  但 **`animation` 声明的选择器原文必须逐字进名单（含伪元素）** —— `animation-duration` / `animation-iteration-count`
  **不是可继承属性**，T11 评审用 headless Chromium（`--force-prefers-reduced-motion`）实测坐实：`.ed-skeleton` 元素是
  `0.001s / 1`，而 **`.ed-skeleton::after` 仍是 `1.2s / infinite / ed-skeleton-shimmer`** ⇒ 计划验收「让两者都静止」
  当时未达成。**裁决：名单里补 `.ed-skeleton::after`（伪元素）与 `.ed-empty-enter`（钩子类）**，理由是这一块是
  "让一切都静止"的**唯一收口处**，漏掉伪元素是**系统性洞**（未来任何原语在伪元素上做动画都会再踩）；把微光挪到元素自身
  只能修这一个实例。判据落在 `motion-coverage.test.ts`（抽取 `primitives/*.css` 里每个 `animation` / `animation-name`
  声明的选择器原文，逐个要求出现在名单里；反向再断言名单无死条目）。
- **分桶裁定（控制方 2026-09-11，回应 T12 评审 I-2）**：`StatusLine` 的接缝是**一次性浮现 `transition`（无循环动画）**，
  **keyframes 桶只留 `Loading` / `Skeleton` / `Probe`**（骨架微光 / 探针）—— 依据 §8.6.1 第 1 条「环境层永远不抢注意力」：
  状态行是**信息**不是「呼吸物」，循环动效会让它在长列表里变成噪音；"闲置时也有生命感"由 `Probe` 承担。
  规格 §8.6.1 第 3 条已按此改写。
- **本批 `@keyframes` 的先后（口径订正）**：本批**第一个** `@keyframes` 是 `EmptyState.css` 的 **`ed-empty-in`**
  （提交 `0e5e78ab`，00:06:10），`Loading.css` 的 `ed-skeleton-shimmer` / `ed-probe-swing` 在其后（`174b1893`，00:06:41）。
  `Loading.css` 原写的「全仓第一个 `@keyframes`」**与事实相反**，已由 T11 在 `44de78d5` 就地订正
  （该文件现写明不宣称任何"首个/第一"）—— 此处保留正确口径，避免后续批次再据错误断言推理。

### 6. 退场期指针事件门控（`[data-phase="exit"]` ⇒ `pointer-events: none`）

**点击是即时的，而退场是异步的**：`open=false` 后弹层仍挂载 160ms（`Modal` 的 `Modal.css`；`Toast` 140ms），
那段时间里面板还在屏上 —— 用户"手一抖"的第二次点击会真的落到按钮上。批 4 迁移 28 个手写弹层后，
这正是**删除 / 级联删除的误触面**。

契约（T7 落地，`83710e27`）：
- `.ed-modal-overlay[data-phase="exit"]` 与 `.ed-modal[data-phase="exit"]` 各加 `pointer-events: none`
  （**只加在退场相位**，进场相位不动，也不用 `!important`）；
- `ConfirmDialog` 侧另有两条**文件内缓解**（T8，`ef240816`）：两颗按钮 `busy={busy || !open}`
  （`busy` 已实测拦下 click，且不设原生 `disabled` ⇒ 退场期焦点与 Tab 序稳定），以及 `Modal` 的关闭意图
  （遮罩 / 头部关闭钮 —— 那条路 `busy` 到不了）按 `open` 门控。ESC 无需处理：`Modal` 的 ESC 监听本就以 `open` 为门控。
- **这是原语层的系统级修法**：一次覆盖**所有** Modal 消费者（含批 4 迁移的 28 个）。

### 7. 弹层唯一实现：`Modal` 是 Portal / 焦点陷阱 / ESC 栈的**唯一持有者**

批 4 的验收线是 `role="dialog"` 20/20（规格 §11 第 2 条）。原语层把三条**改造前各 0 命中**的契约从 0 变成 1：
`createPortal`（挂 `document.body`，含 `typeof document === "undefined"` 早退守卫）· `role="dialog"` + `aria-modal` +
`aria-labelledby`（指向 title 的节点文本，不硬编码 `useId`）· 焦点陷阱 + 打开聚焦首元素 + 关闭归还焦点。

**新增契约（本批实测得出，批 4 必须遵守）**：`Modal` 是**唯一**持有 Portal、焦点陷阱与 ESC 栈的实现，
**消费者不得自建第二套** —— `ConfirmDialog` 已按此改写（无 `createPortal` / 无 `zIndex` / 无文档级键盘监听，
有源码与 CSS 扫描断言钉住），批 4 的 28 个手写弹层迁移后同样不得保留自己的遮罩与 `window` ESC 监听。

> ⚠️ **批 4 收口就地加注 · 本条契约的「适用对象」与三口径并列（2026-09-12；**上面这段原文一字未改**）**：
> - **适用对象 = 对话框类（`role="dialog"` 那一类），不是「一切手写浮层」。** 上句「批 4 的 28 个手写弹层」是**本 ADR 落笔时（批 0-D / 批 4 开工前）的合计口径**；批 4 的实际执行按控制方 **B1/B2** 分成了「迁」与「不迁」两支：
>   - **迁（验收口径 = 20）**：`role="dialog"` 20/20 —— 20 个文件全部只经原语（barrel 含 `Modal` ∧ 无深导入 ∧ 无自建遮罩 ∧ 无 `keydown` ∧ 无裸 z-index），`role="dialog"` 的**源码命中**只出现在 `ui/primitives/Modal.tsx` 与已登记例外；构成 `A14 + B4 + E2` 钉在 `dialogMigration.e.test.ts` 的 `DIALOG_20`。
>   - **不迁（14）**：**11 个锚定菜单**（`BrowserChrome` · `GroupRowContextMenu` · `GroupSidebarRow` · `NoteHeaderActions` · `NoteListBatchMenu` · `NoteMoveToGroupMenu` · `NoteRowContextMenu` · `RouteInfoPopover` · `SessionRowContextMenu` · `chat/ChatLaunchMenu` · `note-selection/SelectionActionMenu`）**只落 `popover(200)`**；**3 个采集/预览覆盖层**（`CaptureOverlayPanel` · `ImagePreviewOverlay` · `ScreenSelectOverlay`）**保留裸值并逐条带理由**。这 14 个**仍须登记在案**（不许从账本里消失），且**不得 import 原语层**（两条硬守卫：`dialogMigration.e.test.ts` ② + `buttonMigration.test.ts` ④）。
> - **三口径并列（互不替代）**：**20**（本 ADR 上文「20/20」的验收口径 = 对话框类）· **28**（本 ADR 这句的**同行口径**）· **34**（**跨行容忍口径**：把 `position:fixed` 与 `inset:0` 分写两行的形态也算进来）。**等式**：`34 − 20 = 14 = 11 锚定菜单 + 3 覆盖层`；`28 ⊆ 34 ∧ |28| = 28 ∧ 28 == 34 − 6`（机器判据在 `dialogMigration.e.test.ts`）。
> - **本条的 ESC 残留纪律仍然有效且已结清登记**：上句「5 处属批 4 迁移时必须一并处理的残留」——批 4 的处置是**逐条登记、不修**（B1：改它们 = 改菜单退出语义，属批 5/8）：`note-selection/SelectionActionMenu.tsx:78` 的 `window` **捕获相**监听 + 4 处元素级 `onKeyDown`（`GroupSidebarRow` / `LinkEntityPicker` / `SessionDetailHeader` / `SessionListRow`）。⇒ 本 ADR 的「必须一并处理」**应读作「必须一并登记并给出不修的理由」**，不是「批 4 必须改掉它们」。
> - **§7 的 z-index 面**：批 4 已完成整段迁移 —— 裸数字 **58 处 / 43 文件 / 17 值 → 3 处 / 3 文件 / 3 值**（全部是上述 B2 例外）；六档标尺 6 个值（`raised 10` / `panel 100` / `popover 200` / `modal 300` / `modalNested 400` / `toast 500`）；**有意值收敛**（`50/51/60/999/1000/1100/1150 → modal(300)` · `30–61 → popover(200)` · `900 → panel(100)`）是**可见观感变化**，已在规格 §11-2 与 `docs/versions/v0.22.md` 批 4 节 durable 登记。

两条实现口径（踩过坑，勿再犯）：
- **ESC 的"最内层"判定必须用 React 树深度**（`ModalDepthContext`）：实测**朴素入栈序**（React effect 自底向上）
  与 **DOM 序**（portal 插入序会反转）都会把外层当成栈顶；最内层 `stopPropagation()` 只能拦住 `document`/`window`
  的**冒泡相**监听（仓内 15 处），拦不住 `SelectionActionMenu.tsx` 的 `window` **捕获相**与 4 处元素级 React `onKeyDown`
  —— 这 5 处属批 4 迁移时必须一并处理的残留。
- **遮罩点击走 `mousedown` + `target === currentTarget`**（用 `click` 会误伤"面板内按下、遮罩上松开"）。

`ime.ts`（`isImeComposing`：`isComposing` 或 `keyCode === 229`）**本批只建不接** —— 需要 IME 守卫的是调用点的
「Enter 提交」（规格 §5.2 第三条），批 4/5 在每个提交处消费它。

### 8. token 前置在本批补齐（原语"出生即能用"的最小前提）

1. **`--ed-shadow-1/2` 定值**（改造前 38 文件各写一份、18 个互不相同的 `boxShadow` 值）：
   - 亮档低层 `--ed-shadow-1` = `0 1px 2px rgba(28,25,23,.06), 0 4px 12px rgba(28,25,23,.08)`（菜单 / 浮层 / 小卡）
   - 亮档高层 `--ed-shadow-2` = `0 2px 4px rgba(28,25,23,.06), 0 12px 32px rgba(28,25,23,.14)`（Modal / 浮窗）
   - **暗档不用投影，改白色反相描边** `0 0 0 1px rgba(255,255,255,.06)`（沿用 `ui-ux-system.md` 既有做法：
     暗底上的黑投影不可见，描边才是"抬高"的可读信号）
   - 命名关系：`ui-ux-system.md` 原有的 `--ed-shadow-card` 被 `--ed-shadow-1` **取代**（该 token 实测 0 处代码引用，
     故不留兼容别名，只改文档）。
2. **18 个字阶 CSS 变量**（6 档 × `size`/`line`/`weight`）交付为 `--ed-type-<n>-{size,line,weight}`（`n` 自 1 起）；
   第 3 档的无单位行高 `1.9` 统一为 `29.5px`（15.5 × 1.9 = 29.45，取一位小数；无单位与 px 并存会让 CSS 无法统一消费）。
3. **`ui/tokens.css` 入口接线**（`app/src/main.tsx:5` 的 `import "./ui/tokens.css";`）：此前 `tokens.css` **从未被 import**
   （实测全仓只有 `note-mark.css` 被入口引入）⇒ 不接线的话，本批原语里每一处 `var(--ed-shadow-2)` / `var(--ed-dur-micro)`
   在**运行时根本没有值**（未定义变量不报错），原语等于没生效。该文件只定义 `:root` / `[data-theme="dark"]` 的自定义属性、
   无任何选择器 ⇒ **零视觉变化**。防回归断言落在 `tokens.drift.test.ts`。
4. **`--due` 亮档第二次对比度修正**：`#A05F10` → **`#9F5E10`**。
   触发底是**剪报底纹**（`--ed-mark-clip #F4F1E9`）这**第三种底**：`#A05F10` 在其上仅 **4.4950:1**，低于正文 4.5:1 线。
   求解规则 = 保持色相、RGB 三通道按**同一系数 `f`** 缩放（`hex(round(ch × f))`），取满足「① 纸 `#FBFAF8` ≥4.5
   且 ② 面 `#FFFFFF` ≥4.5 且 ③ 剪报底 `#F4F1E9` ≥**4.55**」的最小加深量 ⇒ **`f = 0.994`**。
   三底实测（WCAG 2.1）：**剪报底 4.5571** / 纸 4.9309 / 面 5.1436；暗档 `#E0A44B` **不动**（剪报底 7.4863 本就达标）。
   余量 0.05 是硬要求：`#A05F10` 正是"卡在 4.4950"的反例 —— hex 量化与将来底色微调都会吃掉没有余量的值。
   旧值 `#A05F10` 在剪报底上不达标的反例守门落在 `app/src/ui/contrast.test.ts`。
   （ADR-032 的「后果」一节记的是**第一次**修正 `#B26A12 → #A05F10`，属决策历史，**刻意不改**。）
5. **`--ed-ink-4` 禁止用于剪报底纹**（不新增前景 token）：剪报底纹**只改背景**，文字仍用所在层级的 `--ed-ink-*`；
   §4.3 的四档阈值是按**阅读面**定的，换底就必须逐对实测 —— `ink-4` 在剪报底上亮档 **2.8489** / 暗档 **3.0480**，
   **连 3:1 的过渡态例外都不满足**（它的例外只在阅读面上成立：面对 3.22:1）。
   ⇒ **规则（写死）：剪报底纹上只用 `ink-3` 及更深（`ink-3`/`ink-2`/`ink-1`）**。
   反例守门：`contrast.test.ts`（`toBeLessThan(3)`）+ `ui-ux-system.md` 的同款条款 + 本 ADR。
6. **危险/错误语义 = 不新增 token**：`--ed-stamp` 是全站唯一非中性色，规格 §4.1 原文写明「**绝不用于按钮**」⇒
   - `StatusLine` 的 `error` 用 `--ed-stamp` 作**文字色**（`warn → --ed-due` · `ok → --ed-ok` · `info → --ed-ink-3`）；
     该原语**不渲染任何按钮**（`action` 是纯插槽），于是"不能有按钮底色"成为**结构保证**而非纪律；
   - `ConfirmDialog` 的破坏性确认按钮**保持中性**（`variant="secondary"`，**没有 `danger` 变体**），
     危险信号由**印章标记**（该 token 只作 `color` + `border`）+ **级联影响清单**承载；
   - **反例守卫**（`style-seams.test.ts`）：`primitives/**/*.css` 里凡属性名以 `background` 开头且值含
     `var(--ed-stamp)` 即失败；另断言 `Button.css` 内该 token 出现 **0** 次（含注释 —— 按钮连这个名字都不写）。

### 9. 本批不迁移任何调用点；迁移时 z-index 必须**按叠放段整段推进**

本批只交付"被迁移的靶子"：20 弹层 / 44 空态 / 85 加载 / 196 错误行 / 4 toast / 2 confirm / 上千处内联 style
的替换**全属批 4**（规格 §10）。**界面外观零变化是设计意图**（规格 §10「批 0–1 期间界面几乎不变」），
故类规则只作用于 `.ed-*` 元素，而现存组件没有这些类。

z-index 的迁移纪律（0-A 交接第 3 条）：**必须按叠放段整段推进**，不许零散替换 —— 叠放顺序是渲染的，
而不是被设计的；段内混用标尺值与裸数字会让"谁在上面"变得不可推理。

## 后果

- **正面**：批 4 有了迁移靶子，批 6 有了动效接缝（`[data-phase]` 三态 + 一套时长变量 + 一处 reduced-motion 块）；
  三条全仓新契约（`createPortal` / `role="dialog"` + `aria-modal` / 焦点陷阱与归还）从 0 变成 1；
  交互态从零基础建立；样式首次被机器判据守住：`style-seams` / `style-contract` / `motion-coverage`
  三个测试文件（见下"合规性验证"）。**此处不写判据条数** —— 条数在历次修订中漂移过（同一份 ADR 内曾同时
  出现三个数字），写死会让后续批次误以为还有判据没落地；**以三个守卫文件的断言为准**。
- **负面 / 代价**：
  ① 迁移期会出现「内联 `style` + 新原语类」两种写法并存的窗口（与 token 迁移期同性质）；
  ② 原语层是**第三层**，组件树多了一层间接（换来的是"一处改对所有地方"）；
  ③ `motion.css` 的时长变量块是**临时真源**，批 6 必须整块删除并并入 `app/scripts/gen-tokens.mjs`（已登记）。
- **风险**：
  ① `ink-4` 的 3:1 例外被误用（§4.3 三条规则 + 剪报底禁令 + 反例守门兜底）；
  ② reduced-motion 名单漏项（由"基类名单双向一致"判据兜底）；
  ③ `busy` 态的焦点环被同规则的 `opacity: .55` 衰减到 55% —— **本批唯一"视觉降级压过无障碍"处**，
  已登记给批 6 一并处理；
  ④ `ConfirmDialogProps` 无 `tier` ⇒ 弹层内再弹拿不到 `modalNested`（登记为批 4 观察项）。
     ✅ **批 4 Task 2 已结清**（2026-09-12；就地加注，上面的原决策文字保留）：实测**≥3 处结构性嵌套**
     （`InterviewDialog → GoalPlanApprovalDialog` · `NoteAiDialog → RefineLaunchDialog/RefineWorkbench` ·
     `RouteInfoPopover → GroupDeleteConfirm/ModelCardCreateDialog`）⇒ 按 B6 阈值「≥3 共用 ⇒ 改原语」加
     `ConfirmDialogProps.tier?: ModalTier`（默认 `"modal"`）并**透传给 `Modal`**；**不新增档位**
     （`ModalTier` 仍两档 ⇒ `style-contract` 的全枚举表不动）。判据 = `ConfirmDialog.tier.test.tsx`（7 条）。
     ⚠️ **依据更正（批 4 T11，2026-09-12；上一段那半句「按 B6 阈值 ≥3」原文保留，但不再作为依据）**：
     那半句**是错的** —— 上面那三对「结构性嵌套」全是**自绘弹层**、**不含 `<ConfirmDialog>`**；实测
     「弹层内再弹的 `ConfirmDialog` 消费者」= **0 个**（T11 落地前全仓 `ui/primitives` import 数 = 0 ⇒
     `tier` 无任何消费者；T11 的 8 处迁移全在页面/面板顶层，也不传 `tier`）⇒ **≥3 主判据不成立**。
     真实依据 = **B6 的特殊条款**（原文**结构上无法表达**）：本缺口的「改调用点」一支不可表达
     （调用点拿不到 `modalNested`）⇒ 走例外通道加**一个具名、有文档的 prop**。
     **代码不变**（标准透传、默认 `"modal"`、不新增档位、不碰 `style-contract` 全枚举、未违反 §4）；
     与 ⑤ 的阈值判据的关系：特殊条款是 ≥3 之外的**唯一**例外通道，本行即该通道的实例。
     **同批同源缺口**：`Modal` 的 **body 滚动锁**（20 个弹层共用 ⇒ 改原语）＝ 引用计数 + 原值快照、
     门控 `presence.mounted`（不是 `open` —— 退场 160ms 内面板还在屏上）；判据 = `Modal.scroll-lock.test.tsx`（6 条）。
     ⚠️ 该观察项的另一半「未做：body 滚动锁」逐字住在**规格**
     `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md:274`，**ADR 正文无此句** ⇒ 只在本行结清并指向规格。
  ⑤ **原语「结构上表达不了」的两处能力缺口已在批 4 Task 3 按 B6 特殊条款结清**（2026-09-12，
     实施单元 T3；本行是**就地加注**，上面的原决策文字一律保留）：
     - `Toast` 的**位置**：`App.tsx` 的 AI toast 要贴导航条下方（`top: calc(var(--ed-nav-h) + 8px)`），
       而 `--ed-nav-h` 是**壳层 token**（`ui/tokens.css`）—— L1 原语**结构上读不到**它（§2 依赖方向禁止反向）。
       ⇒ 加**一个具名档位** `ToastProps.placement: "viewport" | "belowNav"`（默认 `"viewport"` = 基类形态），
       实现走类 `.ed-toast--below-nav`（`Toast.css`，`top` 消费 `var(--ed-nav-h, 56px)` + `bottom: auto`），
       **绝不**用行内 `style` 覆盖类语义（§4 逐字禁止）。
     - `EmptyState` 的**对齐**：44 处空态（33 文件）里的内联排版在原语里无处安放（本组件边界① 逐字
       「不加 `className`/`style`」）⇒ 加**一个受控排版档位** `EmptyStateProps.align: "center" | "start"`
       （默认 `"center"` = 基类形态），实现走类 `.ed-empty--start`（`align-items` + `text-align`）。
       **不放开裸 `className`** —— `fontSize`/墨度仍归 `Text` 字阶、空气仍归 `compact`。
     - **阈值判据（批 4 起沿用）**：同一缺口 **≥3 个调用点共用 ⇒ 改原语；<3 ⇒ 改调用点**；
       「原语结构上无法表达」是唯一的例外通道，且例外只许加**一个具名、有文档的 prop**。
       两处判据分别落在 `Toast.placement.test.tsx` / `EmptyState.align.test.tsx`（含"不许行内 `style`"
       与"不许写死数值"的反例样本），取值联合 ↔ CSS 类的全枚举锚在 `style-contract.test.ts`。
     - 已知未覆盖面（诚实登记）：`belowNav` 档只定**纵向**锚点，从 `App.tsx` 今日的 `right: 16` 迁过来
       仍有 **2px 横向差异**（§10 已承认「观感从批 4 开始变」）；存量 44 处空态的 `fontSize`（实测 35 处）
       与内联灰（38 处）不在这两档的能力内，由 `Text` / `compact` 吸收，**逐处迁移时若仍表达不了 ⇒ 按上面
       的阈值判据登记后再议**（不许就地加第三个口子）。

## 替代方案与否决理由

- **原语扁平直放 `app/src/ui/`**：否决。9 类 × 3 文件会把现为「5 个扁平模块 + 1 个子目录」的 `ui/` 冲垮，
  且失去 `icons/` 已证明的单一导出面。
- **交互态用「`onMouseEnter` + 局部 state」**：否决。那正是现状 13 个文件的写法，会让批 6 被迫逐处改，
  且**写不出** `:focus-visible` 与 `@keyframes`。
- **一个 `primitives.css` 承载全部原语样式**：否决。会让 T3–T12 串行改写同一文件，与「文件随职责走」和并行纪律冲突。
- **字阶一次性改名为语义档（`--ed-text-body` 等）**：否决。控制方裁决要求**数值命名法**（`--ed-type-<n>-*`），
  与 `--ed-ink-1..4` / `--ed-space-*` 一致。
- **为危险/错误语义新增 token**：否决。现有色阶已够用，新增 token 会把"哪一种红才算错"的问题重新打开。
- **本批连调用点一起迁移**：否决。迁移是 20+44+85+196 处的大面，与"外观零变化"的批次纪律冲突，且会掩盖原语自身的缺陷。

## 合规性验证

| 断言 | 落点 |
|---|---|
| 原语 CSS 零颜色字面量（**剥注释**后判，注释里的旧色值不算犯规） | `style-seams.test.ts`「守卫①」 |
| `--ed-stamp` 不作底色 + `Button.css` 内计数为 0 | `style-seams.test.ts`「守卫②」（含口径锚：印章仍以 `color`/`border` 消费它） |
| reduced-motion 覆盖率：**基类**名单逐一覆盖 + **动画落点**（含伪元素）逐字覆盖 + 名单无死条目 + 5 个非原语 `.ed-*` 名排除 | `motion-coverage.test.ts` |
| 每个 `primitives/*.css` 被其宿主模块 import（删掉那行 import 时其余用例仍全绿 —— T3 评审实测的洞） | `style-contract.test.ts` |
| 13 个取值联合 ↔ CSS 类规则的全枚举锚（`Record<Union, …>` 编译期双向 + 档数运行期冗余；`ToastPlacement` / `EmptyStateAlign` 由批 4 Task 3 补入，原 11 = 10 联合 + `PresencePhase` 三态） | `style-contract.test.ts` |
| 退场时长三方对拍：`EXIT_MS` == 组件 CSS 的 `var(--ed-dur-*, <n>ms)` 兜底 == `motion.css` 定值 | `style-contract.test.ts` |
| 位移 ≤ 8px · token 兜底值 == 真源 · 类名 ↔ 规则 | `style-seams.test.ts`（T3/T4 既有节） |
| `ui/tokens.css` 入口接线未被回退 | `tokens.drift.test.ts` |
| 裸数字 z-index 只许减少 | `ui/zIndex.guard.test.ts` |

## 登记（非本批，供后续批次接手）

- **ADR-034 = L2 壳层与列契约**（按规格 §10 推定为批 3 落地时）。
- **ADR-035 = L4 动效纲领与引擎**（推定为批 6 接入 GSAP 时）。
- **ADR-010 修订为退役** —— ✅ **批 1 已落（2026-09-11 裁决 / 2026-09-12 落地）**，见其「退役修订」节（规格 §10 批 1 明写）。
- ⚠️ 以上三条归属是**计划者按批次内容推定**，控制方若另有安排以控制方为准。
- `docs/tech-debt/` 的 **TD-2026-08-31-C**（`App.css` 死样式）由批 0-D Task 13 实质闭环（该目录未入库，故只在此记录闭环关系）；
  **TD-2026-09-11-AG**（`structuredBlocks.ts` 整模块无生产调用方）仍 open，属批 1/4。
- 动效 token（`--ed-dur-*` / `--ed-ease`）的真源、GSAP、四层动效与三档强度：**批 6**。

## 相关决策

- [ADR-032](./ADR-032-frontend-design-system-tokens.md)：前端设计系统与 token 层落地（本 ADR 的前置）
- [ADR-010](./ADR-010-gap-filling-ai.md)：补缝式 AI —— **已废弃（2026-09-11 退役修订；本地优先/授权/降级条款仍生效）**
