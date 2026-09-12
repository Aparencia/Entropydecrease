# ADR-034：L2 壳层契约（导航注册表 / 列契约 / 断点 / 窗口尺寸 / 溢出两级）

> 状态：已接受（2026-09-12，**批 4 开工前补写**；决策本体是批 3 落地的控制方裁决 A1–A7 与其代码/守卫）
> 关联：[前端重设计规格](../superpowers/specs/2026-09-11-frontend-redesign-design.md)（§1 决策 12–18 · **§6 L2 壳层与列契约** · §10 批 3 行 · §11 · §14）· [ADR-033](./ADR-033-l1-primitives-and-view-layer-contract.md) · [ADR-032](./ADR-032-frontend-design-system-tokens.md) · [批 3 实施计划](../superpowers/plans/2026-09-11-frontend-redesign-batch3-shell.md) · [批 4 实施计划](../superpowers/plans/2026-09-12-frontend-redesign-batch4-primitives.md)

## 背景

规格 §14 的 ADR 表逐字登记：**「ADR-034/035 顺延至批 3 / 批 6」**，「**批 3 的壳层决策全部落在代码与守卫里**（`shell/` 四个纯数据模块 + `TopBar`/`CommandPalette`/`ShellFallback` + 三组守卫），A1–A7 七处控制方裁决散在批次台账（`.superpowers/**`，**不入库**）⇒ **这些决策今天没有 durable 的 ADR 载体**」，并给出建议归属「批 4 开工前补写 ADR-034（壳层：导航注册表 / 列契约 / 断点 / 窗口尺寸 / 溢出两级）**或**并入批 8 的治理收口；**由控制方裁决**」。

**控制方已于 2026-09-12 14:20 裁决**（批 3 台账 §六，逐字）：「**不在批 3 补、也不并到批 8**：**批 4 一开工就先补写 `ADR-034`**（批 4 正是 L1 原语迁移批，而 AGENTS.md §11 要求架构级变更先写 ADR；放到批 8 就太晚）。已记入批 4 计划的前置条件。」

⇒ 本 ADR 是**对已裁决并已落地事实的 durable 记录**，不新开任何设计面：**每一条决策都已在 `dev@42e88740` 的代码或守卫里存在**（逐条给落点）。凡本 ADR 与代码冲突处，按 AGENTS.md §0.4「规范与代码冲突时以规范为准；规范过时时先改规范再改代码」处理，且**先 STOP**。

## 决策

### 1. 导航形态：顶部 8 项域 Tab + ⌘K + 采集徽标 + 齿轮，由**单一注册表**渲染

- 落点：`app/src/shell/navRegistry.ts`（`NAV_ENTRIES` / `PageKey` / `navComponent(key)`）+ `app/src/shell/TopBar.tsx`。
- 设置**下沉为右上齿轮**（不再是第 9 个 Tab）；AI 对话是第 8 个域（规格 §1 决策 18「保守保留」）。
- `App.tsx` **不得直连页面模块**（页面装配是注册表的职责）——判据在 `shell/navRegistry.test.ts`。
- 域数纪律（规格 §1 决策 13）：**新增能力进域内页签，不升格为域**；`PageKey` 键集恒 8 + 设置。

### 2. 列契约：注册表**持有规格**，`useColumnLayout` **执行**（控制方 A5 裁决）

- 落点：`app/src/shell/columnRegistry.ts`（13 行规格，逐行对应规格 §6.2 表）。
- **`ColumnSpec` 是 7 个字段**：`{ page: PageKey, key, default, min, max, autoFoldBelow, pinnable }`。规格 §6.2 逐字只列 6 个 ⇒ **`page` 是实现的加法**，判据收益两条：① `columnsOf(page)` 能按页取列 ② 守卫能判「列不许挂在已删页上」。
- **不取代 `useColumnLayout`**：选项 (b)「注册表自实现」被否决（会静默丢失 3 项今日无用例的运行时能力：`resetWidth` / SSR 守卫 / localStorage 异常），登记为**日后可能的合并方向，且不得声称能力对等**。
- **键名 = 既有持久化键**（`layout:col-width:{key}` / `layout:col-fold:{key}`）——改名 = 用户已记住的列宽静默丢失（评审已按 `git show` 逐字比对，7 个旧键全部保留）。
  > ⚠️ **加注⑥（2026-09-12 批 4 前置守卫评审 follow-up · 上句的证据归因；原文一字未改）**：上句「评审已按 `git show` 逐字比对，7 个旧键全部保留」是**单源**，来源 = `.superpowers/sdd/2026-09-11-frontend-redesign-batch3-shell/task-8-review.md:18`（「7 个旧持久化键逐字保留……**缺失 0**」与「仪器自检：故意把 `notes-list` 改名后重比 ⇒ 检出」**两半都在同一份里**）。批 3 收口评审 `batch-3-closing-review-t1-t6.md:347` **自陈**「T7 / T8 的任何内容……**一律未评审**」；批 3 台账 `progress.md:363` 只是**转述**（「**它**独立证实……7 个旧持久化键逐字保留」，它 = T8 评审）⇒ **不存在「两份独立评审」**（该措辞曾出现在批 4 台账 `progress.md:40`，控制方已于 2026-09-12 按前置守卫评审 I-1 更正为单源）。**独立的第二读数**由批 4 前置守卫评审给出（`.superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/batch4-pre-guards-review.md` §六：脚本 `tmp/review-guards/histkeys.mjs` 复现 **7 个旧调用点 / 7 唯一键 / `MISSING_COUNT=0`**，并带「改名 ⇒ 检出、噪声串 ⇒ 不误命中」双向仪器自检）—— 那是**本批评审的独立复现**，**不是**批 3 的第二份评审。⇒ 引用本句时请引 `task-8-review.md:18`（+ 上述复现读数）；**不新增日常守卫**（历史对拍需要 `git show` 的树外证据）。
- `pinnable` 全行 `false`：规格给了字段但**未给逐行值** ⇒ 取默认、无消费方，**登记给批 6**（与列折叠动效一起定）。
  > ⚠️ **加注①（2026-09-12 批 4 前置对码更正 · 原 `:29`；原文一字未改）**：实测 `COLUMN_SPECS` 的 `pinnable` 是 **`true` 1 行 / `false` 12 行**，`true` 的那行是 **`notes-outline`**（`app/src/shell/columnRegistry.ts:50`，值由批 3 的 `92ea5d6b` 落库、**早于**本 ADR）⇒ **上句「全行 `false`」不成立**，本条是 ADR 的**简化表述有误**。依据是规格 §6.2 该行逐字「接线拖拽+记忆**或**删钩子」+ 注册表自身注释（`columnRegistry.ts:16-18` 已写明该例外）。🔴 **控制方 2026-09-12 裁决：代码对、ADR 错** ⇒ 批 6 定值时以「`notes-outline` = `true`、其余 12 行 = `false`」为起点。另：本 ADR `:77` 的「双向注记」段只登记了 `page` 与 `navActionsFull` 两处加法，**漏了这一处**。⚠️ **登记（2026-09-12 前置守卫评审 follow-up · M-5）**：该注释的**后半句也不成立** —— 「这是本批唯一一处『规格没给值、计划者取默认』的字段」：批 3 至少另有三处「规格没给值、由本批取值」（`navActionsFull 1400` 规格未写明、A7 实测确立，见 §5 · `--nav-h = 56` 规格只给名字不给值，见 §4 · `ColumnSpec.page` 规格 §6.2 只列 6 个字段，见 §2）⇒ 该注释有**两处**表述不准。🔴 **只登记、不改该注释**：`columnRegistry.ts` 是批 3 产物，B14 已明令「不动 `columnRegistry.ts`」，改它需另行授权。
- `settings-main` **不得喂 hook**（`clamp(860, 0, 0) = 0` ⇒ 0 宽静默故障）；它只取 `.default`（**单一真源，全仓该值只此一处**）。

### 3. 断点：单一真源 `shell/breakpoints.ts`，CSS 只许写「阈值 − 1」

- 落点：`app/src/shell/breakpoints.ts`：`nav 1024` · `navFull 1180` · **`navActionsFull 1400`** · `twoCol 1100` · `threeCol 1024` · `outlineCol 1280`。
- 口径：这些值是 `window.innerWidth` 的**下限**，比较一律严格小于 ⇒ 写 `1100` 的含义是「1099 折叠、1100 不折叠」；CSS 媒体查询写 `(max-width: 1179px)` / `(max-width: 1399px)`，由守卫断言两者相差恰好 1。
- 阈值推导规则（规格 §6.2）：按「折叠后正文是否仍 ≥520px」反推 —— **三列页 1024 · 两列页 1100 · 大纲列 1280**。
- `nav === 最小窗宽`（1024）：两处不许各写一个 1024（`shell/windowSize.ts` 是窗口侧真源）。

### 4. 窗口与 `--nav-h`：默认 1280×800 / 最小 1024×640；导航高走 token 生成器

- 落点：`app/src-tauri/tauri.conf.json`（`width/height/minWidth/minHeight` 四键）+ `app/src/shell/windowSize.ts` + `app/scripts/gen-tokens.mjs`（`--ed-nav-h`）→ `app/src/ui/tokens.css`。
- **`--nav-h = 56` 是实测取值，不是规格给定值**（规格只给名字不给值）：T14 用真实产物探针实测**顶栏高 56 / clientHeight 55 / 最高子项 38 / 纵向溢出 false（余 17 px）**。取值变更必须以同款实测为依据，并同步规格 §6.3 的「采集态 58px LIVE 仪表」关系。
- 全局 `html,body,#root` reset 与 6px 滚动条同批落地；⚠️ Chromium ≥121 起 `* { scrollbar-width: thin }` **压过** `::-webkit-scrollbar`（实测 10px vs 6px）⇒ 二者互斥，仓内取 `::-webkit-scrollbar`。
- `app/src-tauri/tauri.conf.json` 属 AGENTS.md §10 额外审查文件 ⇒ 审查记录已 durable 落在 `docs/versions/v0.22.md` 的批 3 节。

### 5. 溢出两级（**右簇是第二级，规格未写明，由 A7 实测确立**）

| 层 | 阈值 | 形态 | 依据 |
|---|---|---|---|
| 8 个域 Tab | ≥ `navFull`(1180) | 自绘线性图标 **+ 纯文字 label** | 规格 §6.1 / §1 决策 14 |
| 8 个域 Tab | 1024–1180 | 仅图标 + `title`（悬浮名） | 规格 §1 决策 14 |
| **右侧簇**（⌘K / 对话面板 / 齿轮） | < `navActionsFull`(**1400**) | **仅图标 + `title`** | **A7/R2 裁决**（规格未写明） |

- **右簇必须用独立修饰类**，不得与域 Tab 共用隐藏规则（混用 ⇒ 守卫必红）。
- 实测支撑（A7，CDP 精确视口）：改前 `natural = 1281.8 px` 在**默认窗宽 1280 上溢出 16.8 px**（把 ⚙ 推出右缘）而**没有任何测试看得见**；R2 后 `1027.94`（预测 1073.94），与规格「约 1070px」同一量级 ⇒ **R2 是把规格原本的设想补回来**。最坏徽标变体（145.58 px）：1180 档余量 +65.06、1280 档 +165.06。
- **emoji 出局**（A2）：规格 §1 决策 5 的「**自绘**线性图标集」是唯一规范态；`§6.1` 行内的 emoji 是排版示意。附带收益：emoji 是**测量毒物**（同一元素在 `--dump-dom` 路径下随视口漂移 +28%）。

### 6. 层级与相变：AI toast 不在导航行；一切 z-index 走六档标尺

- **A3**：AI toast 移入 `MainShell` 最外层的 **fixed 覆盖层**（`top: calc(var(--ed-nav-h) + 8px)`），因为它曾是 1024 档溢出的**唯一主因**（单项 373.75 px = 视口 36.5%）；`T7` 与 `T11` 的改动**合并为一次提交**（否则会留下「两个常驻状态同时消失」的中间提交）。
- 采集徽标与对话面板入口**保留在顶栏**（规格 §6.1 明列「采集状态」；T11-b 裁定保留 `dock-toggle`）。
- z-index **只有六档**（`ui/zIndex.ts` 的 TS 标尺，刻意不做 CSS 变量）：`raised 10` · `panel 100` · `popover 200` · `modal 300` · `modalNested 400` · `toast 500`。
- 相变两态（规格 §6.3）与列折叠动效**不在本 ADR 管辖**，归批 6。

### 7. 判据与棘轮（壳层自带的可回归性）

- **判据一律在「已提交的树」上判**，且尺寸类判据必须给 **Δ + 机理核查**，**不使用裸绝对数**：同一个「首屏静态可达」曾被三方测出 38/39/49（工具口径 47→48→57）⇒ 绝对数不可复现；最干净的第二口径是**用 TS 编译器 API 剔掉 `import type`**（编译期被完全擦除的边不算静态可达）。
- 文本型棘轮三条形态：`ui/zIndex.guard.test.ts`（裸 z-index 只许减少；冻结名单**不许有过期项**）· `ui/icons/no-inline-svg.test.ts`（内联 svg 冻结基线为空）· `shell/columnConsumption.test.ts`（旧字面量消失，**先剥注释再判**）。
- **文本扫描型判据必须剥注释**，且**任何「0 命中」结论都要先证明仪器能命中一个已知存在的串**；中文串一律不经 PowerShell 字符串层（PS 5.1 按 GBK 误解码 ⇒ 假 0 命中）。

## 后果

- **正面**：批 3 的七处控制方裁决（A1–A7）与四个纯数据模块的契约**首次有了 durable 载体**；批 4+ 的迁移点（层级、列、断点、窗口）都有单一真源可引；「右簇第二级阈值 1400」这一**规格未写明的形态**被显式记录（而非只活在代码里）。
- **负面 / 代价**：
  ① 本 ADR 是**事后追记**（决策发生时无 ADR）⇒ 它的权威性来自「与代码逐条对码」而非「事前批准」；对码结果见 §合规性验证。
  ② 规格 §6.1 的两个估数（约 1070px / 约 720px）各自带前提，**引用时必须说明前提**，否则会凭空少算 ≈334 px（不含 toast）/ ≈708 px（含 toast）。
  ③ `ColumnSpec` 比规格多一个字段（`page`）、`navActionsFull` 是规格没有的第二个阈值 ⇒ 规格与实现的**双向注记**必须同步（批 3 收口已就地回写 §6.1/§6.2）。
- **风险**：
  ① 阈值散落复发 —— 由 `breakpoints.test.ts`（数字 + 相对序）与 `columnRegistry.test.ts`（**行 ↔ 档位映射**，不只判「值 ∈ BREAKPOINTS」）双侧兜底；
  ② 列键改名 ⇒ 用户列宽静默丢失 —— 由「键名与旧持久化键逐字一致」判据兜底；
  ③ 层级零散替换 ⇒ 叠放不可推理 —— ADR-033 §9 已定「**按叠放段整段推进**」，批 4 T4 是它的执行单元。

## 替代方案与否决理由

- **把 ADR-034 并入批 8 治理收口**：否决（控制方 2026-09-12 14:20 裁决）。批 4 正是 L1 原语迁移批，AGENTS.md §11 要求「任何架构级变更先写 ADR」；放到批 8 则批 4 的迁移要在**无 durable 契约**的状态下开工。
- **并入 ADR-033（L1 原语层与视图层契约）**：否决。ADR-033 的管辖面是 L1/L3（原语与视图），壳层是 L2；合写会让「原语不得反向依赖」这条核心约束被壳层细节稀释。
- **把六档 z-index 写成 CSS 变量**：否决（规格 §4.2①）。写成变量等于重新打开「谁都能随手写个数字」的口子。
- **删 `useColumnLayout`、注册表自实现**：否决（A5）。见 §2。
- **右簇在窄档保留文字 / 抬 `navFull` 到 1400**：否决（A7）。R1（抬 `navFull`）会让规格数字 1180 被实测推翻且 Tab 文字在 1180 档丢失；R2 只需给右簇加一级，且与规格「约 1070px」只差 3.94 px。

## 合规性验证

> 本 ADR 的每一条**决策**都必须能在已提交的树上被判据钉住；下表的「落点」是**断言所在文件**，不是「注释里提过」。

| 断言 | 落点 |
|---|---|
| 9 页目的地全走注册表 · `App.tsx` 不直连页面模块 · 保活三式不被改 | `shell/navRegistry.test.ts` · `shell/TopBar.persistent.test.tsx` |
| 顶栏 8 项且**可见文字 === 注册表 label**、无 emoji | `shell/TopBar.test.tsx`（② 渲染 + ⑤ 注册表值冻结 + emoji 负判据） |
| 右簇在 `<1400` 只显示图标（独立修饰类，不与 Tab 共用） · CSS 阈值 = `navFull−1` / `navActionsFull−1` | `shell/TopBar.test.tsx`（③ 静态判据） |
| 13 行列规格逐行 == 规格 §6.2 · `autoFoldBelow` **行 ↔ 档位映射** · 键名 == 旧持久化键 | `shell/columnRegistry.test.ts` |
| `settings-main` 不被喂 hook（喂了 ⇒ 0 宽） · 三处页面接线取自注册表 | `shell/columnConsumption.test.ts` |
| 断点五数逐字 + 相对序（三列 < 两列 < 大纲）+ `nav === NAV_MIN_WIDTH` | `shell/breakpoints.test.ts` |
| 窗口四键与常量逐字一致 | `shell/windowSize.test.ts`（读 `tauri.conf.json`） |
| `--nav-h` 的消费（10 处旧字面量 → 0，逐文件判 token 消费） | `shell/navHeight.consumption.test.ts` |
| 裸数字 z-index 只许减少 + 冻结名单无过期项 | `ui/zIndex.guard.test.ts` |
| 入口 token 接线未被回退 | `ui/tokens.drift.test.ts` |
| 顶栏宽度（三档 × toast 三态 × 徽标两变体） | CDP 探针 `.superpowers/sdd/**/tmp/`（**不入库**）与 `docs/versions/v0.22.md` 批 3 节的读数表 |

> ⚠️ **加注②（2026-09-12 批 4 前置对码更正 · 原 `:97` 行（上表第 1 行）的落点归属；上表原文一字未改）**：「保活三式不被改」的判据在 **`app/src/shell/navRegistry.test.ts:141-150`**（三式字面量逐条，实测 3/3）；**`app/src/shell/TopBar.persistent.test.tsx:175-212` 判的是另一件事** —— 两个常驻状态件在 `right` 插槽里的**结构尺 + 渲染尺**（实测该文件对 `mountedPages` /「保活」**0 命中**）。⇒ 该格第二个文件指错了对象（断言本身成立）。
>
> ⚠️ **加注③（2026-09-12 批 4 前置对码更正 · 原 `:102` 行（上表「断点」行）的数字；上表原文一字未改）**：断点是**六数**不是五数 —— `app/src/shell/breakpoints.ts` 现有 6 个键：`nav 1024` · `navFull 1180` · **`navActionsFull 1400`** · `twoCol 1100` · `threeCol 1024` · `outlineCol 1280`，`app/src/shell/breakpoints.test.ts:14-34` **字面量钉住其中 4 个**（`nav` `:15` · `twoCol` `:16` · `navFull` `:17` · `navActionsFull` `:32`），`threeCol` / `outlineCol` **只有相对序**（`:21-22` 的 `threeCol < twoCol < outlineCol`，全仓无字面量断言）⇒ 另 2 个改值（如 `threeCol` 1024→1000、`outlineCol` 1280→1290）**照样绿**。⇒ 上表「五数」少算了 `navActionsFull 1400`（本 ADR §3 自己列的就是 6 个键）。

## 登记（非本 ADR 管辖，供后续批次接手）

- **ADR-035 = L4 动效纲领与引擎**（GSAP + 四层 + 三档 + 双基调 + 6 个签名动效）：**批 6**。
- 相变两态（规格 §6.3）· 列折叠的连续运动（Flip）· `pinnable` 定值：**批 6**。
- `docs/tech-debt/`（审查文档，未入库）的处置：**待用户裁决**。
- `scripts/**/*.mjs` 与 `app/vite.config.ts` 不在 `line-limits` 扫描域 · `check-bundle-budget.mjs` 未接 CI：**批 8**。
- 「会话详情头改粘性」与「笔记工具栏三层合并为单行」（规格 §6.2「本次改动」列的两条）：**批 3 未做**，登记给**批 4/批 5**。
  > ⚠️ **加注④（2026-09-12 批 4 前置对码 · 原 `:115`；原文一字未改）**：这两条在**批 4 计划的 19 个任务里无人承接**（T0 对码报告 §四 · S-4：登记 ≠ 承接，批 3 已因此丢过一次）。🔴 **控制方 2026-09-12 已裁：由 T18 收口承接、或按批次归属登记**（本 ADR 不代裁去向，只写明这条裁决）。在 T18 落定前，本行**保持「批 4/批 5」的登记不变**。
- 批 4 从本 ADR 接手的壳层残留：`shell/CommandPalette.tsx`（自建遮罩/Esc/焦点 → `Modal`）· `shell/ShellFallback.tsx`（→ `Loading`/`StatusLine`）· `App.tsx` 的 AI toast（→ `Toast`）· `App.tsx` 对话面板的裸 `zIndex: 900`（→ `panel`）——**逐条见批 4 计划的任务总表**。

## 加注⑤ · 本次新增的两条守卫 + T0 报告 §四 五条建议的登记（2026-09-12 批 4 前置单元）

> 口径：本 ADR 的**登记**类条目（上一节 §登记 及其 `:115` 加注④）一律**不代控制方裁决**是否采纳、也不代定去向；本节的五条建议同理 —— **只登记 + 注明待承接单元**。

**（一）本次新落库的两条守卫**（此前两条契约的现状分别是「仅代码」与「无判据」）：

| 新增守卫（`app/src/shell/`） | 覆盖的 ADR 条目 | 此前的现状 |
|---|---|---|
| `shellReset.test.ts` | §4 的「全局 `html,body,#root` reset 与 6px 滚动条同批落地」与「Chromium ≥121 二者互斥，仓内取 `::-webkit-scrollbar`」（原 `:43`） | **无判据** —— 全仓 0 个测试读 `app/index.html`（只有 `scripts/check-bundle-budget.mjs` 读构建产物） |
| `columnKeys.freeze.test.ts` | §2 的「键名 = 既有持久化键（改名 = 用户已记住的列宽静默丢失）」（原 `:28`）：13 个键**逐字字面量冻结** + 持久化键前缀冻结 | **仅代码** —— 合规性验证表的「键名 == 旧持久化键」当时无守卫（批 3 只用 `git show` 人工比对过：**单源 = T8 评审 `task-8-review.md:18`**，见 §2 下加注⑥） |

**（二）T0 对码报告（`.superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/task-0-report.md`）§四 五条「建议补写」登记：**

| # | 缺的条目（T0 §四 逐条） | 依据 | 登记去向（**待承接**，本 ADR 不代裁） |
|---|---|---|---|
| **S-1** | 批 4 迁移 `shell/CommandPalette.tsx` / `App.tsx` 的 AI toast / dock 裸 `900` 的**授权与边界** | 本节上方已登记四条残留，但**正文没有对应的决策条**；批 4 计划的 T9 / T10 / T4 要按它执行 | **待批 4 承接**（T9 / T10 / T4） |
| **S-2** | A3 四条声明里**哪几条是可迁移的判据、哪几条随迁移搬到原语层** | B13 逐字要求三条断言**同提交**搬到原语层；ADR §6 的 A3 只有 T7 的决策记录 | **待批 4 承接**（T7 / T10；B13） |
| **S-3** | 🔴 `TopBar.test.tsx:182`（`data-testid="ai-toast"` 那条）在 T10 后**同样落空**，而 B13 的授权只覆盖 `:183/:184/:185` ⇒ **存在一条授权缺口** | `:182` 断言的是 `App.tsx` 的**源码文本**（`toContain('data-testid="ai-toast"')`）；B13 ④「`:182` 保留」只说了保留 testid 字符串，不等于「`:182` 不用改」 | **待批 4 承接**；🔴 **须控制方显式扩权到 4 条、或裁定 T10 在 `App.tsx` 保留该字面量**（本 ADR 不代裁）—— ⚠️ **时点差更正（2026-09-12 前置守卫评审 follow-up · M-4）**：**控制方同日已裁 `rulings.md` B15**（`:71-73`）⇒ **授权扩展到 4 条**（`:182`/`:183`/`:184`/`:185`），条件与 B13 相同（搬到**原语层**、**等价或更强**、**每条各带变异体**、逐条说明「改了哪条 / 为什么 / 强度为何不降」）；**语义要求** = `ai-toast` 这个 testid 仍须**渲染级可达**（改写后用**渲染级**断言证明「渲染出的元素带 `data-testid="ai-toast"`」，不再断言源码里出现过该字符串）。🔴 **本行的「须显式扩权」已不是待办：T10 不必为此再停一次**（`783a62ae` 的加注① 已回写 B14，本处补 B15） |
| **S-4** | 规格 §6.2「本次改动」两条（会话详情头改粘性 / 笔记工具栏三层合并）的**承接** | 本节 `:115` 的登记给批 4/批 5，但**批 4 计划 19 个任务无人承接** | 🔴 **控制方已裁：由 T18 收口承接、或按批次归属登记** —— 见上文 §登记 下 `:115` 的就地加注④ |
| **S-5** | 六档 z-index 的**消费进度**锚点 | ADR §6 只列六档与「刻意不做 CSS 变量」；批 4 的 T4 要迁 58 处 / 43 文件 / 17 值 | **待批 4 承接**（T4；**唯一真源** = `ui/zIndex.guard.test.ts` 的冻结名单） |

## 相关决策

- [ADR-033](./ADR-033-l1-primitives-and-view-layer-contract.md)：L1 原语层与视图层契约（原语不得反向依赖；`Modal` 是弹层唯一实现）
- [ADR-032](./ADR-032-frontend-design-system-tokens.md)：前端设计系统与 token 层（本 ADR 的 `--nav-h` 与六档标尺的来源）
