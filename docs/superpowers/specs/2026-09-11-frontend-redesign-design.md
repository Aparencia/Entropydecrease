# 2026-09-11 · 前端重设计：组件体系 / 布局 / 动效（L0–L6 全层设计）

> 状态：**设计已批准（2026-09-11 用户逐项裁决）· 待实施**
> 定位：一次覆盖全站的前端重设计。回答用户的三个要求 —— ① 重新设计组件类型（是否有更好的组件负责已有功能）② 重新布局设计 ③ 为各组件添加动效 —— 并补齐用户未提到的基座、治理、未接线落地三类任务。
> 方法：三层只读侦察（未接线命令 / 组件与布局清单 / 动效与规格审计，证据均带 `文件:行`）+ 14 屏用户逐项裁决。
> 关联：[长期优化清单](../../Foresight/long-term-optimization-checklist.md) · [UX 市场惯例审计](../../Foresight/ux-market-convention-audit.md) · [需求池](../../product/requirements-pool.md) · [ADR-010](../../adr/ADR-010-gap-filling-ai.md) · [v0.20](../../versions/v0.20.md)
> 原则：**本地优先不破**（数据不出本机、云端能力默认关闭且有本地降级）· **不引入路由库** · **不砍任何已接线功能** · **每批可编译可测试可回滚**。

---

## 0. 一句话

把「一份内容只有一种样子」的产品，改造成「**一份内容有多种样子 + 会呼吸、会生长、会显影的纸**」——
在此之前先补上它从未有过的地基：**token 层、原语层、视图层**。

---

## 1. 决策记录（用户逐项裁决，L0–L5）

### L0 · 视觉基座

| # | 分叉 | 裁决 |
|---|---|---|
| 1 | 基座路线 | **C 全部从代码**：回写 `ui-ux-system.md` / `theme.md` 为目标态，壳层与视觉自由重设计 |
| 2 | 视觉方向 | **C 活页**（纸色 + 中文衬线正文 + 印章状态 + 到期刻度） |
| 3 | 材质语言 | **D 显影**（四档墨度 = 确定度；未确认档 3.22:1 + 三条升档规则） |
| 4 | 来源标记 | **① 剪报底纹，默认开启**；②边注线不做；③套准角标不做 |
| 5 | 图标语言 | **A 自绘线性图标集**（约 44 个 / 1.75px / 小圆角 / 零依赖） |

### L1 · 原语层

| # | 分叉 | 裁决 |
|---|---|---|
| 6 | 收敛范围 | 10 类原语（Modal / z-index 标尺 / EmptyState / Loading / StatusLine / Toast / ConfirmDialog / Button / Surface / Text） |
| 7 | 删除哲学 | **甲 两档分级**：低危可逆 → 撤销 toast 10s；高危不可逆 → 确认框并列明级联；**级联不给撤销** |
| 8 | 软删/回收站 | **不做**（需 schema 迁移），登记为独立技术债 |
| 9 | 拆件顺序 | NotesPage → NoteListView → SessionDetailPanel → ClassroomPage（**行为等价**） |
| 10 | ADR | ADR-032 / 033 / 034 / 035 四条 + **修订 ADR-010** |
| 11 | 原语消息通道 | 保留「探针」与「骨架屏微光」两条旧规格（分工：骨架=已知结构，探针=时长未知） |

### L2 · 容器与壳

| # | 分叉 | 裁决 |
|---|---|---|
| 12 | 导航形态 | **A′ 顶部 Tab**（8 项：7 域 + AI 对话；设置下沉右上齿轮）+ ⌘K 命令入口 |
| 13 | 域数纪律 | **新增能力进域内页签，不再升格为域**（v0.20.5 已写下但未执行到底的原则） |
| 14 | 顶栏溢出 | **两级**：≥1180 图标+文字；1024–1180 仅图标+悬浮名；<1024 由最小窗兜底 |
| 15 | 相变壳层 | **两态**：采集态（LIVE 仪表 + 域导航隐藏）· 复习态（零 chrome）。不做四态 |
| 16 | 列契约 | **三列上限** + 单一注册表 `ColumnSpec` + 断点 1024/1100/1180 + `--nav-h` 变量 |
| 17 | 窗口 | 默认 **1280×800**，最小 **1024×640**；补 `html,body,#root` reset；滚动条 6px |
| 18 | AI 对话 Tab | **保守保留为第 8 项** —— dock 是否承载 ChatPage 全部能力**尚未核实**，先核对再删 |

### L3 · 视图层

| # | 分叉 | 裁决 |
|---|---|---|
| 19 | 视图层四部件 | `ViewSpec` · `viewRegistry` · `ViewSwitcher` 原语 · 依赖方向 领域→视图→容器→原语 |
| 20 | 本批视图 | 会话 4（三轨 / 印样 / 原文 / 卡片流）· 笔记 3（原文 / 卡片流 / 带证据三轨）＝**新增 5 个组件** |
| 21 | 范围纪律 | 其余域的视图**登记不排期** |
| 22 | 三条硬约束 | 原文永远保留 · 非默认视图惰性挂载 · 编辑态切视图先 flushSave（失败则阻断） |
| 23 | 视图记忆 | 按**对象类型**记（`view:default:{objectType}`），不按单个对象 |

### L4 · 动效

| # | 分叉 | 裁决 |
|---|---|---|
| 24 | 引擎 | **GSAP**（core + Flip + ScrollTo + CustomEase）+ `@gsap/react/useGSAP` |
| 25 | 纲领 | **「活的纸」四层**：响应 / 环境 / 编排 / 生长。**统一语法而非限制数量** |
| 26 | 基调 | **丙 双基调**：凡有「读数」的界面用**精密仪器**，凡有「文字」的界面用**纸墨** |
| 27 | 强度档 | **三档**（节能 / 标准 / 丰富），**系统 `prefers-reduced-motion` 优先于档位** |
| 28 | 「不做」清单 | 从 7 条降至 **3 条**（3D 翻转/粒子 · 夸张响应 · 页面转场滑动），且**降级为材质判断而非设计原则** |
| 29 | 用户纲领 | 用户明确要求：**「充满动效、充满创新设计、充满生命力，而不是呆板死板」** —— 本节为准绳 |

### L5 · 未接线落地

| # | 分叉 | 裁决 |
|---|---|---|
| 30 | A 桶 | **能接入 UI 的尽量接入**（15 条 → 本批 12 条 + 登记不排期） |
| 31 | B 桶 | **4 条接入 UI；3 条从 IPC 撤下但保留内部函数** |
| 32 | C 桶 | 除视频档案四连外**删去** |
| 33 | 视频档案四连 | 删 3（`video_profile_by_kind` / `video_profile_spec_by_kind` / `remember_video_profile`）· 留 `video_profile_memory`（诊断）· 留 `video_profile_for_spec`（档位读端） |
| 34 | 档位通道 | **A 做完整**：`start_live_session` 加 tier + 记忆加 tier 字段 + 新 `remember_video_profile_tier` 命令 |
| 35 | 标签线 | **A 补完**：标签可写 + 标签色成对 + `tag_colors` 补种子/迁移 |
| 36 | AI 补缝三连 | **C 全删** + 连带模块 + **修订 ADR-010 为退役** |

---

## 2. 现状基线（三层侦察实测，实施前须复核）

| 维度 | 实测 |
|---|---|
| 壳层 | 无路由；`useState<Page>` + 9 个顶部 Tab；**9 页全部常驻挂载**（`display:none`）；13 个窗口级状态，其中 9 个是手写「带参路由」`focus*` 字段 |
| 组件 | 131 个非测试组件，**0 死组件**；25 个 >300 行；**4 个 >600 行硬限违规**（ClassroomPage 724 / SessionDetailPanel 656 / NoteListView 609 / NotesPage 602） |
| 样式 | **2,256 处内联 style** / 仅 3 处 `className` / **0 个 CSS 变量** / 88 个不同 hex / 2,533 处 hex 字面量；`App.css` 是**未 import 的死文件且非合法 UTF-8** |
| 弹层 | 20 个手写全屏弹层 · **17 个各不相同 z-index** · `createPortal` **0** · `role="dialog"` **0** · 焦点陷阱 **0** · **无退出动画机制** |
| 重复实现 | 空态 44 · 加载态 85 · 错误行 **196 处 / 76 文件** · 弱化文本 251 · 卡片边框 180 · **toast 4 套** · **确认框 2 套（21 处）** · markdown 渲染器 3 套 |
| 布局 | `useColumnLayout` 只被 **4/9 页**采用；ChatPage 硬编码 240、GoalsPage 硬编码 380；`calc(100vh - 56px)` 复制进 **7 个文件** |
| 动效 | **0 个 `@keyframes`**；5 条存活 `transition`；**1 条坏动画**（`ChatMessageList.tsx:147` 引用不存在的 `chatBlink`）；`prefers-reduced-motion` **0 处**；无动效库 |
| 包体 | **JS 2,093.85 kB / gzip 651.25 kB**（单个 chunk，零代码分割）；`performance.md` 预算为 **<200KB gzip** → **超标 3.26 倍** |
| 未接线 | 334 个 Tauri 命令中 **47 个前端从未调用**；其中 **30 个连 Rust 内部也无调用方** |

> **2026-09-12 批 2 回写（原文一律保留）**：上表「包体」行的 **651.25 kB 是批 2 开工前的过期快照** —— `dev@f12aba6d` 实测 **2,106.46 kB 原始 / gzip 654.72 kB**（+12.61 原始 / +3.47 gzip），故「超标 3.26 倍」应作 **3.27×**。
> **批 2 已收口（2026-09-12，`e46e0e82..9921767c`）**：首屏 JS gzip **654.72 → 92.79 kB（−85.83%）⇒ ✅ 达标**（预算来源 `docs/standards/performance.md:28` 的 < 200 kB gzip，守卫 `scripts/check-bundle-budget.mjs` exit 0，余量 107.21 kB）。
> **诚实代价（不许省略）**：全部 JS gzip **+12.91 kB（+1.97%）**· `>500 kB` 警告仍在（`vendor-editor` 208.59 kB，懒 chunk）· `dist` 总量只降 **4,415 B（−0.14%）**，59 个 KaTeX 字体 **1,072,948 B 一字节未动** ⇒ **磁盘与安装包不因此变小**。
> 包体瓶颈清单、逐条复现命令与 follow-ups 见 [批 2 实施计划 §收口回写](../plans/2026-09-11-frontend-redesign-batch2-bundle.md)（**批 3+ 计划的前置输入就是该清单**）。

> **2026-09-12 批 3 回写（原文一律保留，只加注）—— 本表 4 处已漂移（D1–D7 中的 D1/D2/D7 + D3/D6 见 §6.2）**
> **D1 · 「壳层」行**逐字写「**9 个顶部 Tab**」——**不完整**：批 3 开工时顶栏的真实形态是 **9 个 Tab（含「⚙ 设置」）+ 对话面板钮 + 采集徽标 + AI toast**（`App.tsx:286-380`，四项同在一行）。批 3 后：**8 个域 Tab + ⌘K + 采集徽标 + 齿轮**（设置下沉为齿轮），**AI toast 移出导航行**（进 fixed 覆盖层）⇒ 本行是**开工前快照**，今日形态以 §6.1 与其回写注为准。
> **D2 · 「布局」行**逐字写「`useColumnLayout` 只被 **4/9 页**采用」——**页数一致、处数不同**：实测 **4 页 / 7 处**（`NotesPage` 一页 3 处）。批 3 后：**9/9 页**的目的地都在 `shell/columnRegistry.ts` 里，执行仍由该 hook（7 处旧调用点 + 4 处新接入）。
> **D7 · 「壳层」行**逐字写「9 个是手写『带参路由』`focus*` 字段」——实测 **10 个**（多 `focusChatId`）。批 3 **一个字段未删**（只做入口收敛，状态机归批 5）。
> **D4 · 审计侧（不在本表）**：审计 J1-8 写「56px 魔数硬编码**三处**」，实测 **10 处 / 9 文件**（`App.tsx` height + `AiConversationDock` top + 8 个页面的 `calc(100vh - 56px)`，其中 `ReviewPage` 占 2 处）——批 3 T2/T3 已把这 10 处全部改为消费 `--ed-nav-h`。**审计文档本身未改**（归批 8 的文档 pass）。
> **D5 · 审计侧（不在本表）**：审计落点 `NotesPage:395` / `App:225` 因批 0-C2 拆件**已过期**（行号不再指向原处）——**只登记**，同归批 8 的文档 pass。

> ⚠️ **`[DEAD]` 标记有污染**：原侦察的「有无内部调用方」判定被测试文件引用污染（例：`set_tag_color` 实际零调用，因被自己单测引用而被误判为「有内部调用方」）。**实施删命令时必须逐条重新确认一次调用方**。

---

## 3. 红线与经批准的例外

**红线（不得触碰）**

1. **本地优先**：数据不出本机；云端能力默认关闭、须用户授权，且必须有本地降级路径。
2. **不引入路由库**：延续「页面保活挂载」模式；导航形态可改，技术底座不换。
3. **不砍任何已接线功能**：所有视图切换都是「+1 种形式」，不是「换掉原来的」。
4. **每步可验证**：每批结束 `npx tsc --noEmit` 0 错 · `npx vitest run` 全绿 · `cargo test` 全绿。
5. **行数红线**：新原语必须是独立小文件；**不往 4 个超限文件里加代码，先拆再加**。
6. **后端数据模型零改动** —— **除下列两处经批准的例外**。

**经批准的两处例外（各自需登记原因 / 影响面 / 回滚方式）**

| # | 例外 | 原因 | 影响面 | 回滚 |
|---|---|---|---|---|
| E1 | `MemoryEntry` 增加 `tier` 字段 | 档案记忆库**根本没有 tier 轴**，导致「画面档位选完不生效、也不跨会话记住」 | `video_profile_memory.json` 序列化结构 + lookup/apply 路径 | 旧 JSON 无该字段时按 `None` 读取（向后兼容读，无需迁移） |
| E2 | `tag_colors` 补种子/迁移写入 | 表建了但**永远没有数据**，导致前端色板第三档恒不生效 | 一条迁移 + 标签色写入路径 | 迁移可空跑；标签色本身是可逆 UI 状态 |

---

## 4. L0 · 视觉基座

### 4.1 色阶（亮为主档，暗为「夜读」第二档）

| 变量 | 亮（主） | 暗（夜读） | 用途 / 约束 |
|---|---|---|---|
| `--bg-sunken` | `#F1EEE7` | `#100F0E` | 输入槽 / 骨架 / 内嵌 |
| `--bg-canvas` | `#FBFAF8` | `#141312` | 窗口底（纸） |
| `--bg-surface` | `#FFFFFF` | `#1C1A18` | 卡片 / 列 / 阅读面 |
| `--bg-raised` | `#FFFFFF` + `--shadow-1` | `#24211E` | 弹层 / 菜单 / 浮窗 |
| `--border` | `#EAE7E0` | `#2E2A26` | 横格 / 分隔 |
| `--border-strong` | `#C9C4B8` | `#423C36` | 输入框 / 刻度底 / 引线 |
| `--ink-4` 未确认 | `#909088` | `#6E6A62` | **3.08 纸 / 3.22 面**（暗 **3.45 / 3.22**）—— 过渡态，见 4.3 |
| `--ink-3` 已重打分 | `#6E6E68` | `#9A958B` | 4.92 / **5.13**（暗 6.23 / 5.82） |
| `--ink-2` 已确认 | `#3A3A36` | `#D6D1C8` | 10.95 / **11.42**（暗 12.21 / 11.41）—— 正文基准 |
| `--ink-1` 已改写 | `#1A1A1A` | `#F5F1E8` | 16.68 / 17.40（暗 16.46 / 15.39）；**唯一使用字重 +1 档的档位** |
| `--mark-clip` | `#F4F1E9` | `#221F1B` | 剪报底纹（默认开） |
| `--stamp` | `#B3271E` | `#E0604F` | **唯一非中性色**，只用于状态戳 |
| `--ok` 掌握 | `#2F7A4F` | `#4FAE74` | 掌握 / 已毕业 |
| `--due` 到期 | `#9F5E10` | `#E0A44B` | 4.93 / **5.14**（暗 8.47 / 7.92）· **剪报底 4.56**（第二次修正，见下）· 到期刻度 / 低置信点线 / 记忆语义文字 |
| `--link` | `#1F5FBF` | `#6E9BE8` | 链接 / 时间码 / 引用 |
| `--overlay` | `#1A1A1A`（配 `--ed-overlay-alpha: 0.34`） | 同左 | 弹层遮罩**基色** —— 两档同值：遮罩是叠加在内容之上的中性压暗，不随主题翻转 |

> **变量前缀**：上表为可读性省略了前缀，**实际变量名一律带 `--ed-`**（如 `--ed-bg-canvas`、`--ed-ink-2`）。前缀沿用 `theme.md` 既有意图，并避免与第三方 CSS（katex / `@xyflow/react`）的变量碰撞。

> **两组 token 的交付形态（防止批 4 迁移时重新硬编码）**：
> ① **z-index 六档标尺以 TS 模块交付**（`app/src/ui/zIndex.ts`，见 §5.1 与批 0-A 计划 Task 4），**不作为 CSS 变量** —— 组件以 `zIndex("modal")` 消费它；写成 CSS 变量反而会重新打开「谁都能随手写个数字」的口子。§4.2 表中列 z-index 只为集中陈述档位值，不代表它是 CSS 变量。
> ② **`--ed-shadow-1` / `--ed-shadow-2` 已定值（2026-09-11，用户裁决「纸感双层暖墨」；批 0-D 落地）**：
>    - 亮档低层 `--ed-shadow-1`（菜单 / 浮层 / 小卡）= `0 1px 2px rgba(28,25,23,.06), 0 4px 12px rgba(28,25,23,.08)`
>    - 亮档高层 `--ed-shadow-2`（Modal / 浮窗）= `0 2px 4px rgba(28,25,23,.06), 0 12px 32px rgba(28,25,23,.14)`
>    - **暗档不用投影**，改**白色反相描边** `0 0 0 1px rgba(255,255,255,.06)`（沿用 `docs/product/ui-ux-system.md:204` 的既有做法）
>    - 定值依据：全仓 `boxShadow` 实测 38 文件各写一份、**18 个互不相同的值**且天然聚成两档（低 `0 4px 12px .12`×6；高 `0 8px 24px .14`×5 / `0 10px 40px .15`×4 / `0 12px 40px .2`×3）—— 用户选的是**纸感方向**而非照抄这两簇。**批 4 迁移时不得临时硬编码阴影**。
>    - 命名关系：`ui-ux-system.md:186` 原有的 `--ed-shadow-card`（亮/暗各一）**被 `--ed-shadow-1` 取代**，批 0-D 在该文档注明并给出新值（该文档属 AGENTS.md §10，文档与代码同提交）。

> **对比度纪律**：亮档强调色**不可照搬暗档** —— 同一 `#17C3B2` 在暗底 8.6:1、在白底仅 2.2:1（实测 2.21）。故两档各给一值。
>
> **表中数字均为实测**（WCAG 2.1 公式，「纸」= `--bg-canvas`、「面」= `--bg-surface`）。两张底不同：正文实际坐在**面**上，故正文类断言以**面**为基准。上一版规格写的是估算值（11.6 / 5.0 / 3.1 / 11.5），与实测有 4 处出入，已按实测修正 —— 这也是为什么 token 层必须配对比度测试（见批 0-A 计划 Task 2/3）。
>
> **`--due` 亮档从 `#B26A12` 改为 `#A05F10`**（**第一次**修正）：原值对纸底仅 4.06:1、对面 4.23:1，**低于正文 4.5:1 线**，而它要承载「记忆语义」文字（如「3 天后」）。新值 4.86 / 5.07 达标。
>
> **`--due` 亮档第二次对比度修正（2026-09-11，批 0-D Task 1 落地）**：`#A05F10` → **`#9F5E10`**。触发底是**剪报底纹**（`--ed-mark-clip #F4F1E9`）这第三种底：`#A05F10` 在其上仅 **4.4950:1**，低于正文线。求解规则 = 保持色相、RGB 三通道按**同一系数 `f`** 缩放（`hex(round(ch × f))`），取满足「① 纸 `#FBFAF8` ≥4.5 且 ② 面 `#FFFFFF` ≥4.5 且 ③ 剪报底 `#F4F1E9` ≥**4.55**」的**最小加深量** ⇒ **`f = 0.994`**（余量 0.05 是硬要求：`#A05F10` 正是「卡在 4.4950」的反例，hex 量化与将来底色微调都会吃掉没有余量的值）。实测：**剪报底 4.5571** / 纸 4.9309 / 面 5.1436。暗档 `#E0A44B` **不动**（剪报底 7.4863 本就达标）。旧值 `#A05F10` 在剪报底上 <4.5 的反例守门落在 `app/src/ui/contrast.test.ts`。

### 4.2 其余 token

| 组 | 值 |
|---|---|
| 正文字体 | `"Source Han Serif SC", "Songti SC", SimSun, serif` · **15.5px / 行高 1.9（= 29.5px）** · **只随包 400 / 600 两个字重**（子集 3–4MB） |
| 界面字体 | `"Inter", "Segoe UI Variable", "Microsoft YaHei UI", system-ui, sans-serif`（标题/按钮/标签用黑体；`system-ui` 为最终回落槽） |
| 等宽字体 | `"JetBrains Mono", Consolas, ui-monospace, monospace` + `tabular-nums`（时间码 / 元数据；`monospace` 为最终回落槽） |
| 字阶 | `25/34·600` · `17/24·600` · **`15.5/29.5·400`** · `13/20·400` · `12/18·500` · `11.5/16·500` mono（**下界 12px 约束正文与界面文字；`11.5/16 mono` 是唯一被点名的例外** —— 等宽用于时间码与元数据，11.5px 等宽的可读性高于同尺寸黑体。10px / 11px 一律消灭） |
| 间距 | 4 · 8 · 12 · 16 · 24 · 32 · 48 |
| 圆角 | 3 印章 · 5 控件与卡 · 8 面板 · 10 浮层 |
| 图标 | 24 网格 · 描边 1.75 · 尺寸 16/20/24 · `currentColor` · 小圆角 |
| z-index | t1=10 吸顶 · t2=100 常驻面板/dock · t3=200 锚定弹层/菜单 · t4=300 Modal+遮罩 · t5=400 Modal 内嵌 · t6=500 Toast |

> **字重与随包字体的关系**：上表「正文字体」行的「只随包 400 / 600 两个字重」**仅约束衬线正文字体（思源宋体子集）**；`500` 两档（`12/18`、`11.5/16`）属**界面字体**体系，由系统字体栈提供 —— Inter 与 Segoe UI Variable 有 500；**微软雅黑只有 400/700，故在无 500 的系统上回落为 400**，这是可接受的降级（小字标签用 400 亦成立），**不因此增包第三个字重**。
>
> **字阶的 CSS 交付形态（批 0-D Task 1 落地）**：字阶除人读串 `SCALE_TOKENS.typeScale` 外，另以 **6 档 × 3 属性 = 18 个 CSS 变量**交付 —— **`--ed-type-<n>-size` / `--ed-type-<n>-line` / `--ed-type-<n>-weight`**（`n` = 生成器 `TYPE_SCALE` 下标 + 1，自 1 起）。**第 3 档的无单位行高 `1.9` 统一为 `29.5px`**（15.5 × 1.9 = 29.45，按可用精度取一位小数 0.5px；差 0.05px 不影响任何排版判定，且比 29px 更接近真实行高）—— 无单位与 px 两种写法并存会让 CSS 无法统一消费。人读串由同一份结构化真源派生（`TYPE_SCALE.map(...)`），不允许各写一份。

> **🔻 批 4 收口就地加注（2026-09-12，**§4.2 上表「圆角」行原文逐字保留**：`| 圆角 | 3 印章 · 5 控件与卡 · 8 面板 · 10 浮层 |`）—— **批 4 新增第 5 档 `pill`：上表是四档、今日实盘是五档**：
> - **实测处数 = 3**（域 = `app/src/**` 的 `.ts`/`.tsx` 减 `*.test.ts(x)` 减 `ui/primitives/**`，先剥注释；切片内处数同为 **3**）：`components/AiConversationDock.tsx:52` · `components/RefineWorkbench.tsx:405` · `:410`。
> - **判定依据**：控制方 **B17 第 2 条**逐字「切片内实测处数 ≥3 ⇒ 回来给原语加一档 `radius="pill"`」⇒ **3 ≥ 3 ⇒ 加档**；落 **T17-A 的 `2360c3d9`**（`feat(ui): add pill radius tier to surface`，5 个文件 = `Surface.{tsx,css}` + `Surface.test.tsx` + `style-contract.test.ts` + `style-seams.test.ts`）。
> - **代价（必须一并读）**：① 本表**没有** `pill` 档，token 真源 `SCALE_TOKENS.radiusScale` 与 `app/src/ui/tokens.drift.test.ts:52` 的 `toEqual([3,5,8,10])` **今日仍是 4 档** ⇒ 原语走 **`var(--ed-radius-pill, 999px)` 兜底**（同 `Text.css` 的数值兜底范式）；**补 token 档要动四处**（`app/scripts/gen-tokens.mjs` · `ui/tokens.gen.ts` · `ui/tokens.css` · `ui/tokens.drift.test.ts:52`）—— **归批 5/6**；② **出处更正**：本行是「四档圆角」的**唯一原文出处**（`docs/product/ui-ux-system.md` **无**「四档圆角」字样，其圆角表述是 2026-08-24 旧目标态、§十一 自陈「待批 8 统一回写」⇒ 批 4 **不动它**）；③ T17-B **没有落点用到 `pill`**（3 处药丸落点按 B20 第 3 条属控件/徽标形态 ⇒ 不迁，登记在案）。
> - ⚠️ **一并登记的守卫性质**：`ui/primitives/style-seams.test.ts` 的 `SURFACE_CLASSES` 与 `toHaveLength(13)` 实测是**自计数式**守卫（变异 MS1b：拿掉 `pill` **且**同步把 13 改回 12 ⇒ 绿）；完整性方向的牙在 `style-contract.test.ts` 的 `Record<SurfaceRadius, string>`（缺键 = **TS2739**）。**是否升级为真判据 ⇒ follow-up（批 4 计划 §收口回写 §七）**。

### 4.3 D 显影的四档墨度 —— 可及性裁决（必须写进规范）

四档墨度在**浏览态**下（「面对」= `--bg-surface`，正文实际所在的底）：已确认 **11.42:1** · 已重打分 **5.13:1** · **未确认 3.22:1（低于正文 4.5:1 线）**。规则：

1. **未确认档是过渡态，不得承载唯一关键信息**；
2. **任何交互（悬停/聚焦/选中）立即升到正文墨度**；
3. **进入「审校模式」时全部升到 ≥4.5:1** —— 即「你真正开始读它的时候，它一定够黑」。

> **🔻 批 4 收口就地加注（2026-09-12，**上面三条原文一字未改**）—— **条件 ③ 在仓内无实现**，这一事实直接决定了批 4 的 `Text` 取值：
> - **实测**：`审校模式` / `proofread` 这一状态在 `app/src/**` 里**没有任何实现**（无该模式的开关、无「全体升到 ≥4.5:1」的墨度切换逻辑）⇒ 条件 ③ **今日不可满足**（不是「已满足但没测」，是**没有这个模式**）。
> - **后果（T16-B 的保守取值，可逆）**：`Text` 迁移的墨度判定按判据原文「三条任一不满足 ⇒ 取 `ink-3`」执行 ⇒ **`ink-4` 全程 0 使用**（`tone` 一律 `ink-3` = 5.13:1），仓内 `ink-4` 的生产调用点 = **0**。
> - **去向**：批 5/6 补「审校模式」实现之后，`ink-4` 的 3.22:1 例外才可能被合法使用（这是本行 ③ 的**前置条件**）。出处：`task-16b-report.md` §2 · 控制方 2026-09-12 追认。
> - **不受影响的两条**：① 未确认档仍是过渡态、不承载唯一关键信息；② 交互立即升到正文墨度 —— 都在批 4 的 `Text` 档位与 `interactive` 语义内有落点。

### 4.4 剪报底纹的防御性规则

底纹依赖「这段文字来自哪一路」。**没有来源标记 → 按「无标记」渲染，绝不猜、绝不默认成某一通道**；用户手写/改写的段落永远不标底纹。否则会出现「用户手写的句子被标成来自屏幕 OCR」这种事实性错误 —— 而这条底纹的全部价值就在于它**可信**。

**前景裁决（2026-09-11 控制方，批 0-D Task 1 落地）**：剪报底纹**只改背景**，文字仍用所在层级的 `--ed-ink-*`，**不新增前景 token**。但 §4.3 的四档阈值是按「阅读面」定的 —— 换到剪报底就是换了一个底，故「底 × 墨」必须**逐对实测**（下列比值实测于 WCAG 2.1 公式，亮档底 `--ed-mark-clip #F4F1E9`、暗档底 `#221F1B`）：

| 墨 | 亮档 / 剪报底 | 暗档 / 剪报底 | 判定 |
|---|---|---|---|
| `ink-1` | 15.4197 | 14.5564 | ✅ ≥4.5 |
| `ink-2` | 10.1204 | 10.7931 | ✅ ≥4.5 |
| `ink-3` | 4.5454 | 5.5052 | ✅ ≥4.5（亮档余量仅 0.045） |
| `ink-4` | **2.8489** | 3.0480 | ❌ 亮档**连 3:1 过渡态例外都不满足** |
| `stamp` | 5.7679 | 4.6533 | ✅ ≥4.5 |
| `ok` | 4.6310 | 5.9688 | ✅ ≥4.5 |
| `due` | 4.5571（第二次修正后） | 7.4863 | ✅ ≥4.5（修正前 `#A05F10` 仅 4.4950） |
| `link` | 5.3968 | 5.8732 | ✅ ≥4.5 |

**规则（写死）**：**剪报底纹上只用 `ink-3` 及更深（`--ed-ink-3` / `--ed-ink-2` / `--ed-ink-1`）；`--ed-ink-4` 禁止用于剪报底纹** —— 它的 3:1 例外只在**阅读面**上成立（面对 3.22:1），剪报底上亮档实测 2.8489、暗档 3.0480。反例守门断言落在 `app/src/ui/contrast.test.ts`（「ink-4 亮档不得用于剪报底纹」`toBeLessThan(3)`），同一文档规则同步写进 `docs/product/ui-ux-system.md` §九。

---

## 5. L1 · 原语层

> **落地状态（批 0-D，2026-09-11）**：**9 类原语已落地**（第 10 类 z-index 标尺在批 0-A 已交付，本批只消费）。
> 目录 `app/src/ui/primitives/`（**42 个文件，逐个 ≤300 行**，最大 297），唯一导出面 `index.ts`；契约见
> [ADR-033](../../adr/ADR-033-l1-primitives-and-view-layer-contract.md)。**本批不迁移任何调用点** —— §5.1 的现状病灶要到**批 4** 才收敛，
> 界面外观零变化是设计意图（§10）。
>
> | 原语 | 实际文件（实测行数 · `countLines()` 口径） |
> |---|---|
> | `Text` | `Text.tsx` 89 · `Text.css` 46 · `Text.test.tsx` 130 |
> | `Surface` | `Surface.tsx` 97 · `Surface.css` 73 · `Surface.test.tsx` 168 |
> | `Button` | `Button.tsx` 132 · `Button.css` 92 · `Button.test.tsx` 286 |
> | `Modal` | `Modal.tsx` 188 · `Modal.css` 81 · `Modal.test.tsx` 296 · `Modal.exit.test.tsx` 91 |
> | `ConfirmDialog` | `ConfirmDialog.tsx` 192 · `ConfirmDialog.css` 58 · `ConfirmDialog.test.tsx` 297 |
> | `Toast` | `Toast.tsx` 210 · `Toast.css` 65 · `Toast.test.tsx` 249 · `Toast.interrupt.test.tsx` 167 · `Toast.style.test.ts` 132 |
> | `EmptyState` | `EmptyState.tsx` 127 · `EmptyState.css` 81 · `EmptyState.test.tsx` 276 |
> | `Loading` / `Skeleton` / `Probe` | `Loading.tsx` 105 · `Loading.css` 79 · `Loading.test.tsx` 238 |
> | `StatusLine` | `StatusLine.tsx` 94 · `StatusLine.css` 42 · `StatusLine.test.tsx` 267 |
> | 共享内核 | `usePresence.ts` 200 · `usePresence.test.tsx` 282 · `usePresence.node.test.ts` 71 · `useFocusTrap.ts` 122 · `useFocusTrap.test.tsx` 236 · `ime.ts` 18 · `ime.test.ts` 32 |
> | 接缝 / 导出面 / 守卫 | `motion.css` 74 · `index.ts` 45 · `style-seams.test.ts` 271 · `style-contract.test.ts` 214 · `motion-coverage.test.ts` 147 |
> <!-- line-count-src: files=app/src/ui/primitives/motion.css,app/src/ui/primitives/index.ts,app/src/ui/primitives/style-seams.test.ts,app/src/ui/primitives/style-contract.test.ts,app/src/ui/primitives/motion-coverage.test.ts caliber=countLines@scripts/line-limits.mjs authority=HEAD-remeasurement -->
>
> **行数口径（唯一有效）**：`countLines()`，即 `[System.IO.File]::ReadAllLines(path, UTF8).Count` —— **含空行**的全部行数（禁用 `Get-Content` / `Measure-Object -Line` / 数 `0x0A` 字节）。
> **权威来源**：逐文件数值以机器生成的 [行数豁免登记](../../standards/line-limit-exemptions.md) 为准（`node scripts/line-limits.mjs --write` 生成、`--full` 校验，**不要手改其数字**）；本表只是**人读摘要**。
> 注：本表所列原语全部 ≤300 行，在登记表内属**人工追加的记录块**（`--write` 只重算 >300 行的登记区）⇒ 两份不一致时按上句口径在 HEAD **重新实测**，再同步两份。

### 5.1 收敛账本

| 原语 | 吸收 | 现状病灶 |
|---|---|---|
| `Modal` | 20 文件 | `role="dialog"` 0 · `createPortal` 0 · 焦点陷阱 0 · 无退出机制 |
| z-index 标尺 | 17 → 6 档 | 32 文件 45 处硬编码，值域 10…1150 两个不相交段 |
| `EmptyState` | 44 处 / 33 文件 | 5 套空态并存，首启路径无主行动按钮 |
| `Loading` / `Skeleton` / 探针 | 85 处 / 30 文件 | 全站 0 骨架屏，长任务只有一行灰字 |
| `StatusLine` | 196 处 / 76 文件 | 三种红并存；错误常在列表最底部（视觉盲区） |
| `Toast` | 4 套 → 1 | 现状嵌在导航行里，徽标一出现即被裁切 |
| `ConfirmDialog` | 21 处 → 1 | `window.confirm` 在 WebView2 下可能静默返回 false |
| `Button` | 107 处 / 63 文件 | 每面板重声明一份 `btnStyle` 常量 |
| `Surface` | 180 处 / 91 文件 | `1px solid #e5e7eb`，radius 6/8/10/12 混用 |
| `Text` | 251 处 / 98 文件 | 字号与两个灰手写组合，对比度逐处失控 |

> **🔻 批 4 收口就地加注 · 五行各给「批 4 实测口径」（2026-09-12，**上表原文一字未改**）**。口径：命令 + 读数 + 出处（`HEAD = 199da54b`）；**「计划数 → 实测数」一律并列，不许只换数字**。
>
> | 原语（上表行） | 计划口径 | 批 4 实测口径（含机器判据） |
> |---|---|---|
> | `Modal` | 20 文件 | **20/20 全部只经原语** —— `dialogMigration.{a1,a2,b,e}.test.ts` 逐文件断言「barrel 含 `Modal` ∧ 无深导入 ∧ 无自建遮罩 ∧ 无 `keydown` ∧ 无裸数字 z-index」；`role="dialog"` 的**源码命中**只允许出现在 `ui/primitives/Modal.tsx`（恰 1）与已登记例外（`shell/CommandPalette.tsx` 用 `Modal`）。**构成 = A14 + B4 + E2 = 20**（清单钉死在 `dialogMigration.e.test.ts` 的 `DIALOG_20`）；另 **14 个跨行命中不迁**（11 锚定菜单 B1 + 3 覆盖层 B2，见 §11-2）。 |
> | z-index 标尺 | 17 → 6 档 | **裸值 58 处 / 43 文件 / 17 值 → 3 处 / 3 文件 / 3 值**（`10` / `999` / `1000`，**全部是 B2 例外**且 `ZINDEX_ACCOUNTS` 逐条带 >20 字理由）；**冻结名单 58 → 3**（`ui/zIndex.guard.test.ts`，7 用例，既有 4 条断言一字未改）；**六档逐字** = `raised 10` · `panel 100` · `popover 200` · `modal 300` · `modalNested 400` · `toast 500`（`ui/zIndex.ts` 的 `Z_TIER`）。**⚠️ 有意值收敛（可见观感变化，durable 登记）**：`50/51/60/999/1000/1100/1150 → modal(300)` · `30–61 → popover(200)` · `900 → panel(100)` —— 出处 `task-4-report.md:208-212`。 |
> | `EmptyState` | 44 处 / 33 文件 | **B11 切片 = 28 文件**（判据 ① 本批已触碰 ∪ ② `pages/**` ∪ ③ 有同名测试）⇒ **切片内非例外命中 = 0**（`emptyStateRatchet.test.ts` ②）；**例外 8 条**（逐条锚点 + 非空理由 + 尚未走原语）；**余量 5 文件冻结**（只许减，转「冻结值恰等于实测值」）；全仓 **≤44** 棘轮 + 新增文件不得命中词表。**切片外余量**：见批 4 计划 §收口回写 §七（去向批 5/7）。 |
> | `Loading` / `Skeleton` / 探针 | 85 处 / 30 文件 | 棘轮域口径 = **可见加载文案 18 行 / 18 文件**（裁：本仓「85 处」的读法不可复现 —— 计划写 19/19 是 `includes("/ui/primitives/")` 在 Windows 反斜杠下失效所致，见批 4 陷阱 #26）；**切片 14 文件 / 余量 4 文件**；**T14 迁移后收口到 8**（`FROZEN_LOADING_TEXT_TOTAL = 8 == RESIDUAL 8`：4 余量 + 3 `button-busy` + 1 例外）；`MIGRATED_FILES` 10 个文件 **0 命中**且必须含 `<Loading`/`<Skeleton`（⑤）；冻结表 **18 键**被「迁移面(0) ∪ 残留面(1)」逐格钉死。 |
> | `StatusLine` | 196 处 / 76 文件 | **迁移面 49 文件**（`MIGRATED` 长度硬断言；原 55 减 **6 个 B1/B2 回退文件** —— 那 6 个属 `NON_MIGRATED_14`，守卫禁止其 import 原语层，见 B21）；**三红字面量冻结 114 处 / 67 文件**（**剥注释口径**；未剥注释是 116，其中 2 处来自注释：`ClassroomBanners.tsx:13`、`utils/refineDiff.ts:13`）；逐文件下界 `MIN_CALLS`（8 个 >1 的键 + 默认 1）。 |
> | `Toast` | 4 套 → 1 | **4 套 → 3 套收敛 + 1 套机器可判例外**：① `App.tsx` AI toast（3500ms · `belowNav`）② `SessionsPage`（改 `useTransientToast(3000)`，**14 个调用点 diff 0 行**）③ `useTransientToast`（状态机/API 保留，仅换渲染；档位由 `popover(200)` 归 **`toast(500)`**）④ **面板级内联 banner 不迁**（带 4 条理由 + 「仍无 fixed/role」+ 变异即红）。判据 `toastMigration.test.tsx`（15 例）+ 原语层 `Toast.placement.test.tsx`（6 例）。 |
> | `ConfirmDialog` | 21 处 → 1 | 域内 `confirm(` 命中 **24 处** = **8 处 `window.confirm`（全部迁移，落 6 个文件）** + 16 处非 `window.confirm`（同名本地 helper 等，**未迁、登记**）⇒ 上表「21 处」与计划 Task 11 的「16 处」**两个数都不成立**（见「计划错处累计 ⑭」）。判据 `confirmMigration.test.tsx`（10 例，**按 DOM 顺序逐段恰等**，含总长守卫）。`tier` 走 **B6 特殊条款**（主判据 ≥3 不成立，实测消费者 0）⇒ 见 ADR-033 后果④ 的更正加注。 |
> | `Button` | 107 处 / 63 文件 | **口径变化（三个实测口径并列）**：**510 处 / 121 文件**（原生 `<button>`）· **80 行 / 55 文件**（`const *Btn*` 常量族）· **103 行 / 37 文件**（`style={xxxBtn}` 消费者）。**上表的 107/63 不可考**（`btnStyle` 标识符全仓 **0 命中**）⇒ 批 4 走 B4：`*Btn*` 常量族 + 新代码 + **原生按钮棘轮**。**终态**：原生 `<button>` **493 → 394 处 / 121 → 114 文件**（Δ −99，逐文件 Δ 之和 = −99 对拍成立）· `const *Btn*` **79 → 56 行 / 55 → 44 文件** · `FROZEN_NATIVE_BUTTON_TOTAL` **510 → 394**（且在 `buttonMigration.test.ts` ④ 补了 `FROZEN == sum(entries)` 与 `≤ PRE_T12` 双判据）。**余量 ≈407 处（原生按钮口径）→ 登记批 5/7**。 |
> | `Surface` | 180 处 / 91 文件 | **三族实测（域 = `app/src/**` 减测试减 `ui/primitives/**`，先剥注释）**：① 边框 `1px solid #e5e7eb`（含复合）**240 处 / 111 文件 → 226 处 / 108 文件**；② 越界圆角 `6\|12\|14\|999\|2` **270 → 261 处 / 112 → 109 文件**；③ `boxShadow:` **24 处（值 11 种 → 6 种；20 处换 token，4 处有理由不改）**；④ `FROZEN_SURFACE_TAG_TOTAL` **0 → 14**。**「180 处卡片边框」高估了迁移面**：今日 240 处按属性名分桶 = **整圈 `border` 172（真面）** · **单向 57（分隔线，`bordered` 只出整圈 ⇒ 表达不了）** · **三元条件边框色 11（`interactive` 给不了任意状态色）**；172 再分 = 控件 96 · NM14 14 · 锚定菜单 4 · 交互 4 · 条件底色 4 · 透明容器 28 · 有底色容器 22 ⇒ 够格 21、**实迁 14**。**`6→8` 计划 254 处 ⇒ 实改 9 处**（6 处随 `<Surface radius="panel">` + 3 处就地改）—— 分区与去向逐条见批 4 计划 §收口回写 §八。 |
> | `Text` | 251 处 / 98 文件 | 弱化灰 `#9ca3af` **249 = 迁移 186 + 例外 63**（**44 文件 / 7 类**：`interactive*` 35 · `ternary-no-equivalent` 10 · `nontext` 6 · `b1-non-migrated` 9 · `tag` 1 · `colorMap` 2 · C 类 2），逐条理由进 `textBaseline.RESIDUAL`（未登记 0 · 僵尸豁免 0）；**字号越界 558 处 / 120 文件只冻结、一处未动**（映射规则已写在 `tmp/t16a/slice.md`，**批 5/6 执行**）；`tone` 一律 `ink-3`（5.13:1），**`ink-4` 0 使用**（§4.3 条件③无实现）。⚠️ **口径教训**：T16-A 的**行级**归属把「同行 `background:` + `color:` 三元」记成 background ⇒ 计划的「24 处非弱化文本」**作废**，**属性级**重扫实为 **6 处**（`color` 241 · `background` 3 · `border` 2 · 常量/映射 3 = 249）。 |
>
> **本表的读法**：上表的「现状病灶」是**批 0-D 时点的侦察数**（含 180 / 251 / 107 这类计划期估算）；**终态一律以本加注的实测口径为准**，且**任何一格都不得被读成「全量已清零」** —— 五类里只有切片内清零，余量各带去向（B11 的中间态，见 §11-3 加注）。

> **🔻 批 4 收口后更正（2026-09-12 · 收口评审 **I-6** + 13 条 Minor + 收口修复单元 `ed07d491` / `531eb93f` 的 3 处数字变化；**上表两行与本节其余加注的原文一字未改**，此处只追加）**：
> - **`Button` 行（上表第 **8** 行）的「终态 493 → 394 处 / 121 → 114 文件」是 `f6dd012f` 时点的读数，不是 HEAD（收口评审 M-11）**。收口修复单元 `531eb93f` 把 `nativeButtonBaseline` 收紧到实测 ⇒ **终态 = 394 → 393 处 / 121 → 115 文件**（`FROZEN_NATIVE_BUTTON_TOTAL = 393`；文件数 **+1** 来自 T13-b 拆件把 `components/chat/ChatLaunchMenu.tsx` 计入，`SPLIT_MOVES` 已登记守恒、守卫未失效）。**独立复算**（`node .superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/tmp/docfix/measure.mjs <tree>/app/src`；域 = `app/src/**` 减 `*.test.ts(x)` 减 `ui/primitives/**` 减 `ui/icons/**`，剥注释后整段 `/<button[\s>]/g`）：`f6dd012f` 导出树 **394 处 / 114 文件** · HEAD **393 处 / 115 文件**。
> - **`Text` 行的弱化灰例外在收口后由 63 变 64**：`FROZEN_MUTED_GRAY_TOTAL = 63` 是**旧剥注释仪器的读数**；`ed07d491` 修掉 `sliceScan.stripComments` 把 JSX 闭合标签 `</x>` 的 `/` 当正则起点的假阴后，受害行 `components/NoteRowContextMenu.tsx:175` 由「被抹掉」变「被数到」⇒ **`FROZEN_MUTED_GRAY_TOTAL = 64`**、逐文件格 `components/NoteRowContextMenu.tsx` **1 → 2**（条目数仍 **44**、文件数仍 **44**）。物理恒等式 = **250 = 迁移 186 + 例外 64**；`249 = 186 + 63` 是**旧仪器口径**下的恒等式。
>   - **独立复算（同一探针，HEAD 工作树；三个剥注释实现并列）**：OLD（`091d1c3d` 的 `sliceScan`）**63 行 / 44 文件** · NEW（HEAD 的 `sliceScan`）**64 行 / 44 文件** · NAIVE（朴素 `/* */` + `//`，不做正则启发式）**64 行 / 44 文件**；三口径**唯一差异文件 = `components/NoteRowContextMenu.tsx`（OLD 1 / NEW 2 / NAIVE 2）**。
> - **上表 `Text` 行的「7 类」逐类分解两种口径都不对（收口评审 I-6）**：原文写 `interactive*` 35 · `ternary-no-equivalent` 10 · `nontext` 6 · `b1-non-migrated` 9 · `tag` 1 · `colorMap` 2 · C 类 2 —— **自列之和 = 65 ≠ 63**，且 **`colorMap` 与「C 类」是同一类的重复计数**（65 − 63 = 2 正来自这里）。真源 = `textBaseline.RESIDUAL`（44 条）+ `FROZEN_MUTED_GRAY_BY_FILE`（44 键）联立；**我自测**（`node …/tmp/docfix/d2-kind.mjs`）：**条目数** `interactive` 14 · `interactive-no-equivalent` 8 · `ternary-no-equivalent` 9 · `b1-non-migrated` 7 · `nontext` 4 · `tag` 1 · `colorMap` 1（**Σ44**）· **处数** `interactive` 19 · `interactive-no-equivalent` 11 · `ternary-no-equivalent` 11 · `b1-non-migrated` **14** · `nontext` 7 · `tag` 1 · `colorMap` 1（**Σ64**）。**合并口径**：`interactive*` = **22 条目 / 30 处**（不是 35）。
> - **计划「296 是手抄噪声」这个机理不成立（收口评审 M-6）**：**296 是朴素剥注释口径的真值**，295 才是旧 `sliceScan` 的真值 —— 差额恰为 `components/NoteRowContextMenu.tsx:175` 那一处。**独立复算（`42e88740` 导出树）**：OLD **295 行 / 105 文件** · NEW **296 行 / 105 文件** · NAIVE **296 行 / 105 文件**。⇒ 那是**口径差**，不是手抄错；解释读数差异必须点明是哪两种口径（台账 §四 #32 的追加一例已入册）。

> **🔻 批 5 收口就地加注 · 错误行「位置」的处置（A6 = C11 = D11；2026-09-12，**上面全部加注与本表原文一字未改**）—— 批 5 **只预留槽位**，**不重排**任何既有 `StatusLine` 调用点；位置与像素判定转**批 8****：
> - **槽位形态（两侧逐字一致）**：`class="ed-view-error-slot" data-view-error-slot=""`，**各恰 1 个**，**位于切换器之后**、**内容为空** —— 会话侧 `app/src/components/session-detail/SessionViewHost.tsx:121`（**剥注释后 1 处**；裸子串 2 处，第 **32** 行那处是**头注释里的引文** ⇒ 裸/声明级两个读数并列）· 笔记侧 `app/src/components/notes/NotesReadingColumn.tsx:268`（**自闭合空元素**）；切换器行号 **103/108**（会话）与 **252/258**（笔记）⇒ **槽位在切换器之后** ✅（顺序判据）。
> - **机器判据**：`app/src/views/architecture.guard.test.ts:250-258`（**A5③**：剥注释 + 顺序 + 「恰 1 处」+ 类名钩子，**2 passed**）。**反向对照（有牙）**：**T15-M-A5**（删掉会话侧槽位）⇒ `failed 1 / passed 16`，红 = A5③；**T15-M-A5c**（槽位整体上移到切换器**之前**，数量与属性**逐字不变**）⇒ `failed 1 / passed 16`，红 = A5③（**顺序**那一半）；**反向对照（必绿）**：**T15-R-A5b**（槽位加**合法**属性 `role`/`aria-live`，位置与数量不变）⇒ `0 failed / 17 passed` ✅。
> - **既有调用点一处未动**：本批**没有**把任何页面级 `StatusLine` 从列表底部搬到顶部（那会把页面级 status 拆成 5+ 个 state，状态面扩张且与三条硬约束无关）⇒ **「底部 vs 顶部」的可达性差异在 jsdom 里判不了**（需真实视口 + 用户行为），实现与像素判定归**批 8 的布局/像素 pass**。
> - **出处**：批 5 计划 §收口回写 §四（C11 行）· `tmp/t18/measurements.md` §2.3。

### 5.2 Modal 契约

- **尺寸三档**：S 380（确认类）· M 520（表单类）· L 720（向导/工作台）；遮罩统一 `rgba(26,26,26,.34)`，圆角 10。
  **落地（批 0-D）**：三档 = `.ed-modal--s|m|l`（`ModalSize`），层级两档 `tier: "modal" | "modalNested"`（300 / 400，
  值一律从 `zIndex()` 标尺取），默认 `m` / `modal`。
- **四个必补能力**：① `role="dialog"` + `aria-modal` + `aria-labelledby`；② 焦点陷阱 + 打开聚焦首元素 + 关闭归还焦点；③ ESC / 点遮罩关闭（脏表单时先内联确认）；④ **进出场接口**（L4 动效的前置）。
  **落地（批 0-D）**：①②③④ **全部已实现**（三条全仓 0 命中的契约 `createPortal` / `role="dialog"` / `aria-modal` 从 0 变成 1；
  进出场 200/**160**，出场比进场快）。未做：body 滚动锁（现状 20 个弹层也没有，批 4 观察项）。
- **`Enter` 提交必须带 IME 组合守卫** —— 现状全库仅 1/9 处有，中文输入法回车会直接触发危险动作。
  **落地（批 0-D）**：判定出口 `isImeComposing()`（`ime.ts`）**只建不接** —— 本批无表单；批 4/5 在每个「Enter 提交」处消费它。
- **★ 两条批 0-D 实测新增的契约**（不是设计推导，是踩出来的；批 4 必须遵守）：
  1. **`Modal` 是 Portal / 焦点陷阱 / ESC 栈的唯一持有者，消费者不得自建第二套**。`ConfirmDialog` 已按此改写
     （无 `createPortal` / 无 `zIndex` / 无文档级键盘监听 —— 有源码与 CSS 扫描断言钉住），28 个手写弹层迁移后同样不得
     保留自己的遮罩与 `window` ESC 监听。ESC 的「最内层」判定**必须用 React 树深度**：实测朴素入栈序（effect 自底向上）
     与 DOM 序（portal 插入序反转）都会把外层当成栈顶。
  2. **退场相位必须禁指针事件**：`[data-phase="exit"]` ⇒ `pointer-events: none`。`open=false` 后弹层仍挂载 160ms
     （`Modal.css`），那段时间面板还在屏上 —— 点击是**即时**的而退场是**异步**的，删除 / 级联删除的误触面就在这里。
     **已落盘**（T7 `83710e27`，遮罩与面板各一条；`ConfirmDialog` 侧另有两条文件内缓解，T8 `ef240816`）。
     附带纪律：**JS 侧兜底窗口与 CSS 侧过渡时长必须同值**（`Modal.tsx` / `Toast.tsx` 的 `EXIT_MS` ↔
     `var(--ed-dur-overlay-out|toast-out, …)` ↔ `motion.css` 定值，三方对拍守卫在 `style-contract.test.ts`）。

### 5.3 删除语义（两档分级）

| 档 | 动作 | 通道 |
|---|---|---|
| 低危可逆（单条笔记 / 单图 / 单引用） | 立即生效 | **撤销 toast 10s** —— 用保留的原行载荷重新插入，**不改 schema** |
| 高危不可逆（组删除 / 体系级联 / 采集弃置 / 毕业结算） | 确认框 | `ConfirmDialog`，**框内必须列明级联影响与保留项**（例：「将删除 1 个组 · 3 条排序记录 · **笔记 7 篇保留**」） |
| 级联 | — | **一律不给撤销**（只给确认），保持撤销栈边界清晰 |

### 5.4 拆件（行为等价，测试全绿，本批不加功能）

| 序 | 文件 | 行数 | 拆成 |
|---|---|---|---|
| ① | `pages/NotesPage.tsx` | 602 | `NotesToolbar` · `useNotesKeyboard` · `useNotesBatchActions` |
| ② | `components/NoteListView.tsx` | 609 | `NoteListToolbar` · `NoteListTree` · `useNoteListSelection` · `NoteListContextMenuHost` |
| ③ | `components/SessionDetailPanel.tsx` | 656 | `SessionDetailHeader`（粘性头）· `SessionTranscriptPane` · `SessionScreenCards` · `SessionSegmentsTimeline` · `useSessionDetailData` |
| ④ | `pages/ClassroomPage.tsx` | 724 | `ClassroomSourceColumn` · `ClassroomCapturePanel` · `ClassroomInputPanels` · `ClassroomBanners` · `useClassroomShortcuts` |

**豁免表同步纠偏**：~11 个 >300 行未登记（RefineWorkbench 471 · GoalDetail 371 · SessionsPage 352 · EnrichPanel 324 等）· 8 个登记值与实测不符 · 1 个可移除（AiConversationDock）· 统一「前端测试文件是否登记」的口径。

---

## 6. L2 · 壳层与列契约

### 6.1 壳层

- 顶栏 **8 项**（📡 课堂 · 🗂 会话 · 📝 笔记 · ✅ 行动 · 🔄 复习 · 🧠 体系 · 🎯 目标 · 💬 AI 对话）+ 右上 **⌘K** + 采集状态 + **⚙ 齿轮**。
- **溢出两级**：≥1180 图标+文字（约 1070px，余量 ~200px）；1024–1180 仅图标 + 悬浮名（约 720px）。
- **⌘K 命令入口** 用来替代现在手写的 9 个 `focus*` 参数跳转，数据源接 `kb_search`。

> **2026-09-12 批 3 回写（原文一律保留，只加注）**
> **① 「约 1070px / 约 720px」两个估数的前提与实测（W20）**：
> · **≥1180 档**：实测**改前** `natural = 1281.8 px`（默认窗 1280 上溢出 16.8 px，A7 实测），比「约 1070px」**高 ≈212 px**。
>   逐元素拆解（T7 探针 `parts`）：brand 135.53 + tabs 716.83 + **右侧簇 389.44**（`Ctrl+K` 97.86 + `对话面板` 110 + 徽标 73.58 + `设置` 84 + gaps 24）+ padding 32 + gaps 8。
>   ⇒ **该估数只有在「右侧簇不带文字」的前提下成立** —— A7 裁决 R2 把右侧簇（⌘K / 对话面板 / 齿轮）在 `<1400px` 收成**仅图标 + `title`**、把 Tab 的 padding/gap 收紧后，**实测 1027.94 px**（含徽标；预测 1073.94，实现后更小），与「约 1070px」同一量级。
>   ⇒ **R2 是把规格原本的设想补回来，不是偏离规格**；1281.8 才是偏离。
> · **1024 档**：「约 720px」**准确** —— 实测改前 **717.11 px**（Δ2.89）；R2 后 **691.11 px**（含徽标）。
> · **最坏徽标变体**（「⏸ 暂停挂起（重连中）」= 145.58 px）：1180 档 **1099.94**（余量 **+65.06**）· 1280 档余量 **+165.06** ⇒ 三档 × toast 三态 × 徽标两变体 **48 行全 OK**（改前 21 行溢出）。
> **② 「图标+文字」的适用对象（W18 / A2）**：本行「≥1180 图标+文字」指的是**8 个域 Tab**；**右侧簇（⌘K / 对话面板 / 齿轮）在 `max-width:1399px` 内只有图标 + `title`** —— 这是规格**未写明的形态**，由 A7 裁决 R2 落地，两级阈值分别住在 `shell/breakpoints.ts` 的 `navFull = 1180` 与 `navActionsFull = 1400`（**单一真源**，CSS 里写 `1179px` / `1399px` 由守卫断言钉住）。
>   另：本行括号里的 **emoji 是排版示意，不是规范态** —— 规范态是 §1 决策 5 的「自绘线性图标集」（A2 裁决：emoji 出局；它同时是**测量毒物**，见批 3 陷阱 #16）。
> **③ 「9 个 `focus*` 参数跳转」实测是 10 个（D7）**：多出 `focusChatId`。批 3 的 ⌘K 覆盖了其中 2 类有载荷入口（检索命中 → 笔记高亮；新建体系）+ 页面命令覆盖全部 9 页目的地，**10 个字段一个未删**（收敛状态机归批 5）；逐条映射表见批 3 计划 §收口回写。
> **④ 采集状态的口径（A3）**：本行「+ 采集状态」= 顶栏右簇的**采集徽标**；**AI toast 不在本行** —— 它已按 A3 移入 `MainShell` 最外层的 **fixed 覆盖层**（`top: calc(var(--ed-nav-h) + 8px)`），因为它是 1024 档溢出的**唯一主因**（单项 373.75 px = 视口 36.5%）。

### 6.2 列契约

`ColumnSpec = { key, default, min, max, autoFoldBelow, pinnable }`，**由单一注册表汇总**，页面不再自建 hook。

| 页 | 列 | 默认/最小/最大 | autoFoldBelow | 本次改动 |
|---|---|---|---|---|
| 📡 课堂 | 源列 | 320 / 240 / 420 | 1100 | 阈值 860→1100；**采集态整列隐藏** |
| 📡 课堂 | 右面板 | flex | — | 统一 wrapper，消灭 640/全宽两档跳动 |
| 🗂 会话 | 列表列 | 320 / 240 / 420 | 1100 | 详情头改**粘性** |
| 📝 笔记 | 组列 | 240 / 180 / 320 | 1024 | 并入注册表 |
| 📝 笔记 | 列表列 | 320 / 240 / 420 | 1024 | 工具栏三层**合并为单行** |
| 📝 笔记 | 大纲列 | 180 / 140 / 260 | 1280 | **接线**拖拽+记忆或删钩子（现为「假可调」） |
| ✅ 行动 | 单列 | 页签内分区 | — | 不变 |
| 🔄 复习 | 单列 | — | — | **复习态零 chrome** |
| 💬 AI 对话 | 侧栏 | 260 / 200 / 320 | 1100 | **接入列基础设施**（现硬编码 240） |
| 🧠 体系 | 体系列 | 260 / 200 / 360 | 1100 | 阈值 860→1100；折叠态持久化 |
| 🧠 体系 | 详情列 | 320 / 260 / 420 | 不折叠 | 34px 窄条收进统一列头 |
| 🎯 目标 | 左列 | 320 / 240 / 420 | 1100 | **接入列基础设施**；默认 380 → **320** |
| ⚙ 设置 | 单列 | 居中 860 | — | 现 720 **左对齐** → 改居中 |

**阈值口径**：按「折叠后正文是否仍 ≥520px」反推 —— 三列页 1024 · 两列页 1100 · 大纲列 1280。

**记忆规则**：记忆列宽与手动折叠态；**不记忆**自动折叠态、顶栏档位、相变态。

> **2026-09-12 批 3 回写（原文一律保留，只加注）**
> **① `ColumnSpec` 实际是 7 个字段（W21）**：上面那句列了 6 个 —— `{ key, default, min, max, autoFoldBelow, pinnable }`；**实现多一个 `page: PageKey`**（`app/src/shell/columnRegistry.ts`）。加它的**判据收益**有两条：① `columnsOf(page)` 能按页取列（顶栏/页面接线不必另立清单）② 守卫能判「**列不许挂在已删页上**」（`page ∈ 导航注册表键集`）。⇒ 这是**实现的加法**，不是规格的反悔；本行**原文保留**，字段清单以这 7 个为准。
> **② `pinnable` 是计划取的默认、无消费方**：规格给了字段但**未给逐行值** ⇒ 批 3 全行写 `false`，**今天没有任何消费方**（登记给批 6，与列折叠动效一起定）。
> **③ 大纲列「接线拖拽+记忆**或**删钩子」的裁决（W22 / D6）**：走**接线**（不删钩子）。计划 Task 8 Step 4 逐字写「`onToggleOutline` **改为 `outlineCol.expand()`**」——**字面照做会把 ✕「收起大纲」也变成 `expand()`**，凭空制造一个新缺陷；实现取 `folded ? expand() : setManualFolded(true)`（窄条 → 展开、✕ → 手动折叠），**两个控件各自语义正确**。旧实现的死局（J1-3：窄窗自动折叠下 `folded ≡ true`，点窄条永不展开）由此解开。
> **④ 笔记列表列的阈值（D3）**：本表写 `autoFoldBelow = 1024`，而**今日实测是 700**（且三值并存：`860×4 / 700×1 / 1100×1`）——批 3 已按 §1 决策 16 与「折叠后正文仍 ≥520px」的口径**改判为 `BREAKPOINTS.threeCol = 1024`**，三值并存消灭；本行原文保留。
> **⑤ 本表 13 行的落地状态**：13 行**全部**进 `shell/columnRegistry.ts`（单一注册表）；页面**不再自建宽/夹取/阈值**，但**执行器仍是 `useColumnLayout`**（A5 裁决：注册表持规格、hook 执行）。7 处旧调用点 + 4 处未接入点（`ChatSidebar` / `GoalsPage` / `SettingsPage` / `ClassroomRightPane`）全部改为从注册表取规格。
> **⑥ 「本次改动」列里未做的两条**：`🗂 会话 · 详情头改粘性` 与 `📝 笔记 · 工具栏三层合并为单行` **不属批 3**（壳层与列契约），未做 —— 登记去向见批 3 计划 §收口回写「未做」表。
> **⑦ 34px 窄条（`🧠 体系 · 详情列`）未吸收**：`KnowledgeDetailPanel` 的折叠窄条 `width: 34` **仍在**。理由：`ColumnSpec` 里**没有「折叠窄条宽」这个概念**，取 `.min`(=260) 会把 34 px 变成 260 px（可见回归）；只加一个 `collapsedWidth` 字段则是**扩写规格引用的契约形状去凑数**（A1 明禁）⇒ **登记给批 4**（与「统一列头 / `ColumnBar` 收敛」一起做才是真吸收）。

> **🔻 批 5 收口就地加注 · 本表「本次改动」列最后两条的处置（A5 = C13 / ADR-034 S-4；2026-09-12，**上表与上面七条加注的原文一字未改**）**：
> - **`🗂 会话 · 详情头改粘性` → ✅ 批 5 已做**：`app/src/components/session-detail/SessionDetailHeader.tsx` = **176 行**（预算 ≤180），落地形态 = `position: sticky` + `top: var(--ed-space-4)`（= **4 px**）+ `zIndex("raised")`（= **10**，走 `ui/zIndex.ts` 标尺，**不写裸值**）；**补了 1 条行为级判据**（该文件此前无同名测试）：`SessionDetailHeader.test.tsx` **9 passed**（改前 **5 passed / 4 failed** ⇒ 改后 **9/9**，删改的是它自己新增判据的中间态，**既有断言零改动**）。
> - ⚠️ **真实粘性不可验（诚实登记，不得读成「已验证」）**：jsdom **无布局引擎** ⇒ 只能给**静态结构级**判据（`position: sticky` ∧ `top` 来自 token）与祖先链核验；**真实滚动下的粘性行为未验证**，归属批 8 的真机/像素 pass（C13 逐字要求把这一点写进「未验证」）。
> - **`📝 笔记 · 工具栏三层合并为单行` → 批 5 未做，转批 8**（C13 逐字）。理由（C13）：要动 `NotesPage.tsx`（拆件后 **288/300**）+ `NoteListView.tsx`（241）+ `app/src/components/NoteListToolbar.tsx`（**95**，事实更正：真身不是 `NotesListToolbar.tsx`）**三个无测试面文件**，「投入产出比最差」⇒ 与批 8 的布局/像素 pass 同批。**本行原文保留，去向以本加注为准**。
> - **ADR-034 侧的同一条处置**见该 ADR §登记 下 `:115` 的加注⑦ 与批 5 加注（本收口已就地补记「T18 的处置＝登记为批 5 follow-up」的**最终结果**）。

### 6.3 相变两态

| 态 | 顶栏 | 域导航 | 列结构 | 顺带修掉的审计项 |
|---|---|---|---|---|
| 采集态 | 58px **LIVE 仪表**（波形 + 计时 + 暂停/标记/停止） | 隐藏 | 源列保留（采集配置面） | G3 · G7 |
| 复习态 | **零 chrome** | 隐藏 | 单列，卡片居中 640 | B5 |
| 常态 | A′ 顶栏 | 显示 | 按 6.2 契约 | — |

---

## 7. L3 · 视图层

### 7.1 四部件与依赖方向

| 部件 | 形态 | 解决的问题 |
|---|---|---|
| `ViewSpec` | `{ key, label, icon, appliesTo, Component, lazy }` | 把「这个视图能看什么对象」变成**类型约束** |
| `viewRegistry` | 按对象类型查可用视图的单一注册表 | 现状展示形式硬编码在页面里，故一对象只能一种样子 |
| `ViewSwitcher` | 一个**原语**（分段控件），放正文列头部 | 体系域自建了 tabbar，别的域没有 |
| 依赖方向 | 领域 → **视图** → 容器 → 原语（禁止反向） | 视图**不得直接调 Tauri 命令**，数据由容器注入 |

> **🔻 批 5 收口就地加注 · `ViewSpec` 的字段形态（C1；2026-09-12，**上表原文一字未改**）—— `Component` 静态字段与 `lazy` 布尔已被 `load` 取代，批 5 已按此实施**：
> - **落地形态 = `{ key, label, icon, appliesTo, load? }`**，其中 `load?: () => Promise<{ default: ComponentType<P> }>`；宿主用 `React.lazy` + `Suspense`（复用既有 `ShellFallback`）。⇒ 上表**不是偏离**：C1 的定性是「把 `lazy` 布尔**升级为可执行加载器**」—— 规格自己给了 `lazy` 字段，说明设计意图本就包含「非默认视图不静态加载」；而把 `load` 做成静态 `Component`（方案 a）会**结构性**把 5 个视图 + markdown 栈拉进首屏（`shell/**` 与 primitives barrel 都在首屏静态可达集内）⇒ 直接超 200 kB 预算。**规格原文保留，字段清单以本加注为准。**
> - **默认视图无 `load`**（同步渲染 + 常驻）：实测 `session[0].hasLoad = false` · `note[0].hasLoad = false`，非默认 5 个 spec **全部** `hasLoad = true`；`views/registry.ts` 顶部 4 条 import **逐字全是 `import type`** ⇒ **0 个视图组件静态 import**，且每个 `load` 体内**恰 1 个** `import(`（5/5）。
> - **落点**：注册表 = `app/src/views/registry.ts`（**109 行**，预算 ≤120）；`ViewSwitcher` 落在**原语层** `app/src/ui/primitives/`（见 `ADR-033` §1 的批 5 加注）。
> - **读数出处**：批 5 计划 §收口回写 §一 · `.superpowers/sdd/2026-09-12-frontend-redesign-batch5-view-layer/tmp/t18/measurements.md` §1.1/§1.2（**该目录 gitignored，不入库**）。

### 7.2 对象 × 视图矩阵

| 对象 | 现有唯一形式 | 本批 | 登记不排期 |
|---|---|---|---|
| 🗂 会话 | 列表行 → 详情文档 | **三轨对齐 · 印样 · 原文 · 卡片流** | — |
| 📝 笔记 | markdown 阅读 / 编辑 | **原文 · 卡片流 · 带证据三轨** | 大纲（回归评估） |
| 🧠 体系 | 树/画布/图谱/概念/模型（**已 5 种**） | 作为模板迁进视图层统一管理 | — |
| 🔄 复习 | 卡片 + 四档评分 | — | 印样式回顾 · 时间轴复习 |
| ✅ 行动 | 裁决队列列表 | — | 时间轴（按计划日）· 卡片流 |
| 🎯 目标 | 详情页 | — | 矩阵视图（目标 × 相位） |

   > ↳ **批 5 收口就地加注（C2 的条件项 + C17①；2026-09-12，上表原文一字未改）—— 「📝 笔记」行第三列的「带证据三轨」本批未交付；笔记侧交付 = 2 视图（原文 · 卡片流）**：
   > - **依据 = C2 的条件判据**（「先做只读数据可行性探针；存在 ⇒ 3 视图；**不存在 ⇒ 2 视图 + 就地加注 §7.2 与 §11-6 + 登记批 7**；**不许**做空壳视图」）+ **T1 的只读探针**（`task-1-report.md` · `tmp/t1/c2-evidence-probe.md`）+ **T13 的独立复现**（`task-13-report.md` §②）：**不存在逐段级「笔记 ↔ 证据」关联的读取路径** ⇒ **`NoteEvidenceTrackView` 不做、不建空壳**（实测全仓 `NoteEvidenceTrack*` = **0 命中**）。**本批笔记视图键终态 = `["raw","cardflow"]`**（`app/src/views/registry.ts:108`）。
   > - **三条独立证据（T13 复现读数；命令与原始输出见 `task-13-report.md` §②）**：
   >   ① **`app/src-tauri/src/**/*.rs` 全树 571 文件**，精确串 `note_evidence|evidence_segment|note_segment` = **0 命中**（**双侧自证**：`note_id` → **400** · `segment_id` → **68** · `zzz_no_such_symbol_zzz` → **0** ⇒ 真 0 非假 0）；
   >   ② **数据模型侧**：`db_migrations.rs` 共 **26 张实体表 + 1 张 FTS 虚表**（`kb_fts`，`:305`；合计 27 处建表）与 **26 条 `ALTER TABLE … ADD COLUMN`**（**24 个唯一列名**）里**无**任何「笔记 × 证据」连接表或字段；`notes` 对会话只有**整篇级** `session_id`（`:408`）；
   >   ③ **IPC 侧**：唯一段级引用 `artifact_blocks.refs_json.segment_id`（`artifact.rs:64`）的维度是 **session 而非 note**，且 **0 个 `#[tauri::command]` 返回 `SessionArtifact`/`ArtifactBlock`/`BlockRefs`**（两种独立手法各 0；全仓 `#[tauri::command]` = **321** 个）⇒ 前端**读不到**；前端 **284** 个 invoke 名里「同时含 `note` 与 `segment|evidence|artifact|block`」= **0**。
   > - **准确边界（本批接受 T1 的判定，并已在仓内逐条取证）**：笔记 markdown 的**段首 in-band 锚点** `[⏱ MM:SS]([[ts:ms]])`（发射 `concat.rs:122-127` · 契约 `anchor_strip.rs:3-4` · 金测试 `note_filter_golden_tests.rs:117-124` · 前端渲染器 `utils/html.ts:32`）**不构成**逐段级读取路径，三条理由各自独立成立：
   >   **① 是文本不是关联**（它是 `notes.content` 这段 `TEXT` 里的字符——无外键、无约束、无索引，用户编辑即可删改）；
   >   **② 是 ms 不是 id**（证据本体是 `session_segments.id` / `session_ocr_blocks.id`；而 T13 的 **E2** 逐字要求 `data-evidence-id` 与关联 id **逐字一致**，`ms` 在类型上无法满足）；
   >   **③ 不保证存在**（只在转写/结构/章节草稿的段首发射，且受 `PurifyConfig.anchor_timestamps` 开关控制——`purify_config.rs:66,96` 默认 `true`、金测试 `:125-127` 逐字钉住「关闭后无锚点」；`BodySource::OcrDirect`（图文会话）走 `note_filter_ocr::rebuild_ocr_markdown`（`note_filter_render.rs:85`，全仓 `format_timestamp` 调用点里 `note_filter_ocr.rs` = **0 处**）；`BodySource::Web` 是 `#[allow(dead_code)]` 预留变体、正文直取 `web_session_pages.markdown`（`note_body_source.rs:24-27`）；手动笔记更不会有；**且精修输入会主动剥离段落锚点**（`anchor_strip.rs:8-16`，消费点 `ai_refine_task.rs:155` · `commands_ai_refine/workbench.rs:81` · `commands_ai_refine/session.rs:57`），只回挂章节锚点（`ai_refine_protocol.rs:46`））。
   >   ⇒ **改判为「交付 3 视图」属改规格**（E2 降级为 ms 最近邻 · E1/E3 的「派生段落数」改为「带锚点段落数」 · 并须新开「无锚点段落」的显式标记路径），**不在执行单元权限内**。
   > - **去向 = 批 7**（**必须先写规格**），逐条登记见 `task-13-report.md` §④（含 E2 降级口径、E1/E3 双分母、`OcrDirect`/`Web`/手动笔记/`anchor_timestamps=false` **四类无锚点 fixture**、段落无稳定 id 的根因、以及若要用 `artifact_blocks` 必须新开 command ⇒ 触及规格 §3 红线 6「后端数据模型零改动」需另裁）。
   > - **R8 对拍（防「条件项被当成已交付」）**：本批**不得**出现「笔记 3 视图已交付」的表述；终态 = **2 视图**，且 **§11-6 的验收不因此变红**（2 ≥ 2，见 §11-6 的批 5 加注）。

> **🔻 批 5 收口就地加注 · 会话侧矩阵的终态读数（A2；2026-09-12，**上表原文一字未改**）**：
> - **会话 = 5 个视图**：`FROZEN_VIEW_KEYS.session = ["raw","tritrack","proof","cardflow","preview"]`（`app/src/views/registry.ts`）—— 与上表「**三轨对齐 · 印样 · 原文 · 卡片流**」**逐项对上**，多出的 `preview` 是**既有**的笔记预览视图，按 §7.3② 一并进注册表并**转为惰性**（它原先住在页 chunk 里）。**笔记 = 2 个视图**：`FROZEN_VIEW_KEYS.note = ["raw","cardflow"]`（第三列的条件项见上一段加注）。
> - **两个终态清单分别由守卫对拍**：`FROZEN_VIEW_KEYS` 与 `keysFor()` 双向对拍（`app/src/views/registry.test.ts` **12 用例**）· `registry[0].key === "raw"` 且默认视图**无 `load`**（`app/src/views/architecture.guard.test.ts` **17 用例** + `architecture.slots.test.ts` **2 用例**，共 **19 passed**）。
> - **上表第 4 行「依赖方向」在本批的机器判据**：`views/**` 8 个生产文件对 `@tauri-apps` 的**裸子串 0 / 声明级 0**（阳性对照 `components/session-detail/SessionScreenCards.tsx` **裸 1 / 声明级 1** ⇒ 仪器有牙）；`views/**` 首屏静态可达 = **0**（TS-API 口径 66 文件，工具口径 91 = 源 77 + CSS 14，双口径并列）。
> - **出处**：批 5 计划 §收口回写 §一 · `.superpowers/sdd/2026-09-12-frontend-redesign-batch5-view-layer/tmp/t18/measurements.md` §1.2/§2.2（该目录 gitignored，不入库）。

### 7.3 三条硬约束

1. **原文视图永远保留** —— 未标注内容（核心处理 γ 只为「值得长期调用」的类型建机制）、长文阅读、自由书写都需要文档形态。
2. **惰性挂载** —— 默认视图常驻（保活滚动与编辑态）；非默认视图**惰性挂载 + 卸载**，重挂载恢复 `scrollTop`。否则「9 页常驻 × 每对象 4 视图」会成为内存炸弹。
3. **编辑态切视图先 flushSave** —— `RichEditorView` 卸载会丢编辑器状态；落库失败则**阻止切换并提示**，绝不静默丢弃。

> **🔻 批 5 收口就地加注 · 三条硬约束的机器判据落点与终态读数（A3；2026-09-12，**上面三条原文一字未改**）**。口径：每条判据给「文件 / 用例数 / exit」+ 反向对照的**变异体出处（带任务号）**；**三条合计 9 条判据全绿**（出处：批 5 计划 §收口回写 §一 · `tmp/t18/measurements.md` §1）。
> - **① 原文视图永远保留** —— 判据四条：**结构 1** `registry.ts` 的 `SESSION_VIEWS[0].key === "raw"` ∧ `NOTE_VIEWS[0].key === "raw"`（自写结构探针，exit 0）· **结构 2（G2）** 默认视图**不带 `load`** 且非默认 5 个**全带**（`app/src/views/registry.test.ts` **12 用例**，exit 0）· **行为 H1** 会话「切到**每一个**非默认视图后原文节点仍在 DOM ∧ 挂载计数不减」（`SessionViewHost.test.tsx` **11/11 passed**）· **行为 F5** 笔记「切到 `cardflow` 后正文仍在 DOM，且原文子树节点**同一性**不变」（`NotesReadingColumn.views.test.tsx` **11/11 passed**）。**反向对照（有牙）**：**T10-M1**（`{resident}` → `{isDefault ? resident : null}`）⇒ `6 failed / 9 passed`，红含 **H1**；**T14-M5**（默认视图改回互斥条件渲染 = 旧 `SessionDetailPanel:200-206` 形态）⇒ `1 failed / 10 passed`，**唯一红 = F5**。
> - **② 非默认视图模块级惰性** —— 判据五条：**A1（图级）** `app/src/views/**` 首屏静态可达 = **0**（工具口径与 TS-API 口径**双列**）· **A2** 生产运行时导入者**恰 2**（`pages/NotesPage.tsx` / `pages/SessionsPage.tsx`），`views/** → registry` 的生产侧 **7 条边全是 `import type`**（运行时边 0）· **G7** 每个 `load` 体内**恰 1 个** `import(`（**5/5**）且注册表顶部**0 个视图组件静态 import**（4 条 import 逐字全是 `import type`）· **行为 H2** 切到 ⇒ 挂载 / 切走 ⇒ **不在 DOM**（**11/11**）· **行为 H3** `Suspense` + `ShellFallback` 在位（**11/11**）· **行为 F6** 笔记侧惰性 + 卸载 + 记忆恢复（**11/11**）。**反向对照（有牙）**：**T10-M2c**（惰性视图粘滞常驻 ∧ 去掉默认视图门控）⇒ `failed 1 / passed 14`，**仅 H2 红**；**T10-M3**（删 `<Suspense>` 包裹）⇒ `failed 5 / passed 10`，红含 **H3**；**T14-M6**（非默认视图用 `display:none` 代替卸载）⇒ `failed 1 / passed 10`，**唯一红 = F6**。**产物级**：真实构建后懒 chunk **22 → 31**，逐视图字面量**恰命中 1 个懒 chunk**（逐 chunk 具名台账见 §收口回写 §五/§八）。
> - **③ 编辑态切视图先 `flushSave`、失败则阻断** —— 判据五条：**F1** reject ⇒ 值未变 + 目标未挂载 + `role="alert"` + 记忆未写 · **F2** resolve ⇒ 切换发生 + 目标挂载 + 无错误行 · **F3** 非编辑态直通（`editorRef.current === null`）· **F4** 阻断全过程 **0 个 toast 节点**（并证明选择器有牙）· **F9** 既有断言**原样绿**（语义只在「切视图」这一条路径被修正）—— 四条 `it` 全在 `app/src/components/notes/NotesReadingColumn.views.test.tsx`（**11/11 passed**）。**反向对照（有牙）**：**T14-M1**（把 `catch` 分支改成「保存失败也继续切换」= 本条逐字禁止形态）⇒ `1 failed / 10 passed`，**唯一红 = F1**。**显式登记未做**：`RichEditorView` 内的 Ctrl+E / 完成按钮路径**仍不阻断**（今天就是 fire-and-forget，**不是本批引入的回归**）⇒ 批 8；`flushSave` 的**返回类型未升级**（`NoteEditHandle`）⇒ 批 8 接口卫生。**提示形态**：`catch` ⇒ 不切视图 + 保持编辑态 + **就近一行 `StatusLine kind="error"`**（**不用 toast**）；错误行宿主在**非 `NON_MIGRATED_14`** 的层（`NoteReadingView.tsx` / `NotesReadingColumn.tsx`），两条 B1/B2 守卫**一字未改且绿**。
> - ⚠️ **引用变异体时必须带任务号（ID 撞名）**：**T10 的 `M1`** =「默认视图条件渲染」= 约束①的反向对照（6 条红）；**T14 的 `M1`** =「`catch` 分支继续切换」= 约束③的反向对照（唯一红 F1）。**不是同一个变异体。**
> - ⚠️ **两条「无专属变异体」的判据（只登记、不在收口提交里补测）**：**F9 是文件头 `@ai-context` 注释而不是 `it`**（它断的是**跨文件**的「既有断言未被动过」，单文件变异体无法表达）· **A5①/A5②**（`architecture.guard.test.ts` 的默认视图 display 三元）**没有以自己为目标的变异记录** —— 这两条性质分别由 **G2**（`registry.test.ts`）与行为级 **F5/H1** 守着 ⇒ **不是覆盖漏洞，只是这条判据自己没有专属变异体**。逐条四要素见 `tmp/t18/measurements.md` §9.1，去向 **批 6/7**。

---

## 8. L4 · 动效纲领「活的纸」

> 用户纲领原文：**「我希望我的软件是充满动效的、充满创新设计、充满生命力的，而不是呆板、死板的。」** 本节各项均以此为准绳。

### 8.1 四层纲领（取代「克制清单」）

| 层 | 时间尺度 | 解决什么 | 具体点 |
|---|---|---|---|
| **响应层** | 80–180ms | 应用在听你说话 | 墨渍 hover（从指针位置扩散）· 按下微陷 · 焦点环落纸 · 勾选框落笔 |
| **环境层** | 2–6s 循环 | 应用在呼吸 | 探针摆动 · 采集脉冲 · **未确认段落墨度极缓慢起伏（幅度 2%）** · 到期刻度微光 |
| **编排层** | 400–900ms | 签名时刻 | 对齐 · 显影编排 · 相变凝固 · 时间码回跳 · 记忆浮现 · 图谱浮现 |
| **生长层** | 秒 → 天 | 熵减看得见 | 到期刻度生长 · 笔记树生长 · 知识图谱次第落位 · 一场课结构化过程中的收拢 |

### 8.2 引擎与分界规则

**引擎**：GSAP（core + Flip + ScrollTo + CustomEase）+ `@gsap/react` 的 `useGSAP()` 做清理（React 19 StrictMode 会双调用 effect，裸用 `useEffect` + `gsap.to` 会留下重复 tween）。GSAP **只进自己的 chunk 懒加载**。

| 判据 | 用什么 |
|---|---|
| 单属性 · 无时序 · <200ms | **CSS transition**（hover 底色、焦点环、按下 scale） |
| 多元素 · 有时序 · 需中断/反向/seek | **GSAP timeline** |
| 「从 A 布局滑到 B 布局」 | **GSAP Flip** |
| 循环环境动效（骨架 / 探针 / 脉冲） | **CSS keyframes**（不占 JS 主线程，reduced-motion 一条媒体查询即静态） |

> **Flip 解锁了布局动画**：先改布局 → 测量差异 → 用 `transform` 补回起点 → 动画到 0，全程只动 transform。因此**列折叠、列表排序、视图重排、卡片提拔全部可做连续运动**。

### 8.3 双基调（用户裁决丙）

| 面 | 基调 | 缓动 | 适用 |
|---|---|---|---|
| **有「读数」的界面** | 精密仪器 | `power3.inOut`，匀速段更长，沿轴线、带刻度感 | 采集 · 复习 · 时间轴 · 到期刻度 |
| **有「文字」的界面** | 活的纸 | `power2.out` / 自定义「洇开」曲线，带惯性沉降（**不是回弹**） | 笔记 · 会话 · 体系 |

### 8.4 动效 token 与清单

`--dur-micro 120ms`（响应）· `--dur-card 220ms`（面板/视图/列折叠）· `--dur-reveal 500ms`（显影）· `--dur-skeleton 1200ms` · `--dur-page 150ms` · `--ease cubic-bezier(0.2,0,0,1)` · **位移上限 8px**。

进出场：弹层 200/160（出场比进场快）· Toast 180/140 · **相变 chrome 用绝对定位交叉淡入，不 animate height** · **列折叠内容先淡出 120ms 后宽度瞬跳**（宽度本身不做 transition，除非走 Flip）。

**`usePresence`**（约 40–80 行 + 单测）：只负责**卸载时机**（GSAP 不管这个）；`transitionend` 监听 + **超时兜底**（reduced-motion 下不会有 transitionend，缺兜底会「关不掉的弹层」）；`matchMedia` **必须自带守卫**（vitest 全局 node 环境、`setup.ts` 无 matchMedia 桩）。

### 8.5 强度三档（敢做满的前提）

| 档 | 行为 |
|---|---|
| 节能 | 只留响应层；编排层直接跳终态 |
| 标准（默认） | 四层全开，环境层幅度减小 |
| 丰富 | 环境层幅度与频率提高，编排层加长、错开更明显 |

**系统 `prefers-reduced-motion` 优先于档位**，档位跟随系统初值。

### 8.6 6 个签名动效

| # | 名称 | 内容 | 只有这个产品才有的理由 |
|---|---|---|---|
| 1 | **对齐** | 转写/画面/笔记三轨从错位滑到对齐 | **双通道融合本体的可视化** |
| 2 | **显影编排** | 沿时间轴逐段显影，节奏 = 语速函数 | 「熵减」的字面可视化 |
| 3 | **相变凝固** | 波形收束成直线、琥珀退去、导航淡入；可反向 | 形态变化而非状态切换 |
| 4 | **刻度生长** | 到期刻度按真实间隔生长；答「忘了」则回缩 | 让 FSRS 调度**可以被感觉** |
| 5 | **时间码回跳** | 播放头沿时间轨滑到目标位置，掠过几帧缩略 | 把「每句话可追溯」变成可见动作 |
| 6 | **记忆浮现** | 墨色洇开 + 字距极轻收敛（用 `x` 而非 `letterSpacing`）+ 剪报底纹左刷 + 评分按钮随后浮起 | 揭晓是有节奏的一件事 |

> **🔻 批 5 收口就地加注 · 第 1 行「对齐」的第三轨口径（A4 = C2 的连带硬要求；2026-09-12，**上表原文一字未改**）—— 第三轨 = **OCR 文字**，不是「笔记」**：
> - 上表第 1 行逐字写「转写/画面/**笔记**三轨」，而 **C2 裁决的会话三轨 = 转写 / 画面 / **OCR 文字****（`segments` / `screens` / `ocr_blocks` **全在 `SessionDetail` 里** ⇒ **零新数据面、不碰 Rust**，符合规格 §3 红线 6）。理由：`SessionDetail` **不含笔记**（实测），且**笔记是产物、不是原料** —— 把「笔记轨」并进「会话三轨对齐」会混淆两个对象；「双通道融合」的产品价值在 OCR 口径下依然成立（双通道 = 语音 + 画面，OCR 是**画面的文字面**）。
> - ⇒ **批 6 的动效纲领按本加注后的口径执行**（「对齐」动效的第三轨取 OCR）；**「笔记轨」未交付的原因与去向**（= 笔记侧「带证据三轨」的 C2 条件项判否）见 §7.2 与 §11-6 的批 5 加注。
> - **批 5 只落「响应层接缝」，不装引擎**：`ViewSwitcher` 落 `--ed-dur-micro`（**120 ms**）接缝，实测 `ViewSwitcher.css` **63 行**（预算 ≤80）· `ViewSwitcher.tsx` **135 行**（预算 ≤150）· **零行内 style**；**不装 GSAP、不写 `@keyframes`**（B9 中间态声明：**「只有接缝、没有纲领」—— 三档强度 / 双基调 / GSAP 在批 6**）。

#### 8.6.1 用户答复（2026-09-11）：**「我希望我在对其进行交互时，它是活的」**

> 原文（用户，回答 §12 的留空问题）：**「我希望我在对其进行交互时，它是活的」**。
> **控制方解读（若与你本意有偏差请直接推翻）**：这句把"活"的**重心放在用户动作的那一刻**，而不是"没人操作时它自己在动"。

由它推出的四条硬约束（批 0-D / 3 / 4 / 6 都要照此，**不是新纲领、是 §8.1 四层的配重**）：

1. **配重（2026-09-11 用户二次确认后定稿）**：**两个主场，交互优先** ——
   - **第一优先 = 响应层（80–180ms）与"用户动作触发的编排层"**：交互的那一刻是"活"的主战场（见第 2 条）。
   - **第二优先 = 环境层（2–6s）保持"可感知的生命感"**：用户原话是"交互时最重要，**但闲置时也要有生命感（环境层别退太多）**"⇒ **不得**把环境层降为纯背景、**不得**把它压到看不见；它按 §8.1 已定的项目与量级存在（探针摆动 · 采集脉冲 · 未确认段落墨度极缓慢起伏 2% · 到期刻度微光），并在 §8.5 的「丰富」档**如实变丰富**（幅度与频率提高），而不是只在响应层加料。
   - **两者的分界**：环境层永远不抢注意力（幅度上限不动）、不阻塞交互、`prefers-reduced-motion` 下整体静态；响应层**必须每次都给回执**。
2. **每个用户动作都要有即时回执**：点击 / 拖拽 / 悬停 / 键入 / 勾选 / 展开折叠 / 切换视图 —— 每一类都必须有**有质感的即时反馈**（"做完了"与"收到了"必须可区分）。**这是验收口径，不是形容词**：批 6 收口时逐类动作列出其响应层动效，缺一即不达标。
3. **可中断、可反向是"活"的硬指标**：交互触发的动效必须能被**下一个输入打断**（下一个动作接管当前动效，而不是排队等待）。⇒ 批 0-D 的原语必须预留**动效接缝**：`Button`（hover / active / focus-visible / disabled 四态 + 按下微陷）· `Surface`（hover 升起 / 边框墨度）· `Text`（墨度与字距的可动画钩子）· `Modal`/`ConfirmDialog`（进出场 presence 钩子 + 遮罩淡入，走 §8.4 的 200/160）· `Toast`（进出场 180/140 + 可打断）· **`Loading`/`Skeleton`/`Probe`（骨架微光 / 探针的 CSS `@keyframes` 钩子 —— 只有这两个"循环环境动效"用 keyframes）** · `EmptyState`（一次性入场钩子 `.ed-empty-enter`） · **`StatusLine`（一次性浮现 `transition`，无循环动画）**。**否则批 6 只能回头改每一处调用点**，而批 0 交付的正是"让后面每一批都能一次改对所有地方"的能力（§10）。

   > **分桶裁定（控制方 2026-09-11，回应 T12 评审 I-2）**：本节原先把 `StatusLine` 与 `Loading` 并列为「CSS keyframes 钩子」，与计划给它的实现（transition + 明确「无循环动画」）分叉。**裁定：`StatusLine` 归 transition（无循环），keyframes 桶只留 `Loading`/`Skeleton`/`Probe`。** 依据是本节第 1 条「环境层永远不抢注意力」——状态行是**信息**不是「呼吸物」，循环动效会让它在长列表里变成噪音；「闲置时也有生命感」由 `Probe` 承担。同裁定记入 [ADR-033](../../adr/ADR-033-l1-primitives-and-view-layer-contract.md)。
4. **"活"不得以无障碍为代价**：`prefers-reduced-motion` 优先于强度档位（§8.5）；键盘路径（Tab 顺序 / 焦点可见 / Esc 退出）与"活"冲突时，**无障碍优先**。

### 8.7 明确不做（3 条，材质判断而非设计原则，可随时推翻）

3D 翻转 / 弹性回弹 / 粒子 · 对用户输入的夸张响应 · 页面转场滑动。

---

## 9. L5 · 47 条未接线命令最终处置表

| # | 命令 | 处置 | 说明 |
|---|---|---|---|
| 1 | `ai_clear_key` | **删** | 旧单 provider 密钥链 |
| 2 | `ai_enhance_mock` | **删** | 补缝三连（宿主 ArtifactView 已下线） |
| 3 | `ai_enhance_status` | **删** | 返回常量；自包含零外溢 |
| 4 | `ai_goal_plan_estimate` | 补 UI · **登记不排期** | 目标规划成本预估 |
| 5 | `ai_save_key` | **删** | 旧单 provider |
| 6 | `ai_test_connection` | **删** | 旧单 provider |
| 7 | `artifact_to_note` | **删** | 产物视图 v0.11.5 已删 |
| 8 | `build_draft` | **删** | 旧草稿链 |
| 9 | `build_session_artifact` | **删** | 产物视图 |
| 10 | `export_manual_fill_done` | 补 UI · **登记不排期** | 周回顾手动回填 |
| 11 | `export_write_todotxt_file` | 补 UI · **登记不排期** | 迁出到 `.todo.txt` |
| 12 | `get_note_group` | **删** | 已被 `list_note_groups` 全量 + 前端 map 取代 |
| 13 | `get_session_artifact` | **删** | 产物视图 |
| 14 | `kb_search` | **补 UI（本批）** | **⌘K 的数据源**（ADR-029 RAG 层） |
| 15 | `learning_metrics` | 补 UI · **登记不排期** | 学习指标面板 |
| 16 | `list_group_fragments` | **删** | 被 `list_fragments` 全量 + 收件箱取代；**DB 层保留**（flashcards/settlement 仍在用） |
| 17 | `quiz_group_cards` | 补 UI · **登记不排期** | 组级自测；`selfTestPassedRate` 恒 null 的根因 |
| 18 | `recognize_image` | **删** | 旧直调 |
| 19 | `reset_tag_color` | **补 UI（本批）** | 标签线；与 `set_tag_color` **成对处理，不可只删 reset** |
| 20 | `save_draft_as_note` | **删** | 旧草稿链 |
| 21 | `scan_ai_candidates` | **删** | 补缝三连 |
| 22 | `session_outline` | 补 UI · **登记不排期** | 与笔记大纲回归一起评估 |
| 23 | `structure_models_dir_cmd` | **删** | — |
| 24 | `transcribe_audio` | **删** | 旧直调 |
| 25 | `update_note_tags` | **补 UI（本批）** | **标签可写**；全仓现无任何写 `notes.tags` 的生产路径 |
| 26 | `vad_threshold_diag` | **删** | 开发诊断用；未来若需要，届时按诊断需求重新引入，不留半成品 |
| 27 | `video_profile_by_kind` | **删** | 前端已有等价的 `profiles.find(...)` |
| 28 | `video_profile_for_spec` | **留（本批接线）** | 档位通道的读端 |
| 29 | `video_profile_memory` | **有意保留** | 自述「诊断用」，零成本 |
| 30 | `video_profile_spec_by_kind` | **删** | 前端已有 `KIND_TO_FORM` / `KIND_TO_TIER` 双写 |
| 31 | `action_badge_count` | **有意保留** | 文档明确「保留命令无前端调用方」 |
| 32 | `add_session_ocr_block` | **撤下 IPC，保留内部函数** | 低级写原语，暴露只会造脏数据 |
| 33 | `add_session_segment` | **撤下 IPC，保留内部函数** | 同上；「手动补录」应另立新命令（带来源标记与校验） |
| 34 | `analyze_session_command` | **补 UI（本批）** | 会话详情「重新分析」 |
| 35 | `audit_due_for_system` | 补 UI · **登记不排期** | REQ-212 审计报告视图 |
| 36 | `create_session` | **撤下 IPC，保留内部函数** | 手动建空会话无意义 |
| 37 | `delete_session_images_all` | **补 UI（本批）** | 整场图集批量删（现只能单张） |
| 38 | `detect_video_domain` | **删** | 上游 OCR 标签通道**从未建起来**；平台信号不是瓶颈（`infer_platform` 已从标题/URL 自行补标签） |
| 39 | `finish_session` | **补 UI（本批）** | 恢复动作「结束会话」（崩溃后卡在录制态的收尾通道） |
| 40 | `get_decision` | **补 UI（本批）** | 决策日志单条详情 —— 顺带修审计 H7 |
| 41 | `open_capture_float` | **删** | 2026-09-11 结清：前端 0 调用者；开路径由 `float_toggle`（`useClassroomFloat.ts:38`）与 `FloatAction::Open => float_open_core`（`commands_window.rs:250`）承载，本命令只是又包一层 `float_open_core` ⇒ 批 1 Task 8 删 |
| 42 | `refine_session` | **补 UI（本批）** | 会话详情「手动精修」（UI 现只调 auto 版） |
| 43 | `release_live_prepare` | **有意保留** | 前端注释「保留供未来显式调用」 |
| 44 | `remember_video_profile` | **删** | 功能被 `remember_video_profile_form` **完整覆盖**，双重死亡 |
| 45 | `set_tag_color` | **补 UI（本批）** | 标签线 |
| 46 | `update_fragment_group` | **补 UI（本批）** | REQ-201 **声称已接线但实际无调用方** —— 需同步修正记录 |
| 47 | `update_knowledge_system` | **补 UI（本批）** | 体系改名 / 核心问题 / 状态 —— 最明确的功能缺口 |

**汇总**：删 **22** · 本批补 UI **12** · 登记不排期 **7** · 撤下 IPC **3** · 有意保留 **3** · 待核实 **0** ＝ 47。

> **2026-09-11 改判**：#41 `open_capture_float` 由「待核实」改为「删」（依据见该行说明）⇒ 删除批由 21 条升至 **22** 条。

> **两条更正，可单点回退**：#38 `detect_video_domain` 与 #44 `remember_video_profile` 在早期分桶中被列入「A 桶 · 补 UI」，经专项侦察后**更正为删除** —— 前者的上游 OCR 标签通道从未建起来（平台信号不是瓶颈，`infer_platform` 已从标题/URL 自行补标签），后者的功能被 `remember_video_profile_form` 完整覆盖。这两行**独立于其他决策**，若需回退为「补 UI」，只改这两行即可。

**删除的通用影响面**：仅 `lib.rs` 的 `generate_handler!`；`capabilities/*.json` 无自定义命令 ACL；无 bench/集成测试目录；单测全为 `#[cfg(test)]` 内联且不引用这些命令。**唯一例外**是补缝三连的模块级连带死代码。

---

## 10. 批次划分

| 批 | 内容 | 验收 |
|---|---|---|
| **0 基座** | 4 条 ADR + 修订 ADR-010 · 豁免表纠偏 · 拆 4 个超限文件 · token 层 · z-index 标尺 · 图标集 + 单测 · 原语三层 | 4 个 >600 行 → 0；豁免表 100% 一致 |
| ↳ 批 0 的 ADR 归属（批 0-D 收口时更新） | **ADR-032 ✅（批 0-A/0-D）** · **ADR-033 ✅（批 0-D，L1 原语层与视图层契约）** · **ADR-034/035 顺延**（推定为批 3 壳层 / 批 6 动效，见 ADR-033 的「登记」节）· 修订 ADR-010 属**批 1**　**⚠️ 批 3 收口更正（2026-09-12）：本行「推定为批 3」未兑现 —— ADR-034 在批 3 未写，实盘最高仍是 ADR-033（已列目录复核）⇒ 见 §14 该行的登记与建议归属** | — |
| **1 删除批** | **22** 条命令 + 补缝三连连带模块 + ADR-010 修订 + 清理 `structuredBlocks.ts:63` 死文案　**✅ 已落（2026-09-11 立案 / 2026-09-12 落地）** | 注册表 **334 → 312**（−22）；`cargo test` **2300 / 0 / 6** 全绿；ADR-010 已废弃；`structuredBlocks:63` 死文案已清 |
| **2 包体治理**（可并行） | `manualChunks` + 按页动态 import + 量首屏 gzip　**✅ 已落（2026-09-12 收口，`e46e0e82..9921767c`，11 个提交）** | 从 651KB gzip 降到达标或给出瓶颈清单 ⇒ **✅ 达标：首屏 654.72 → 92.79 kB（−85.83%）**，守卫 exit 0、余量 107.21 kB（原「651KB」为过期快照，实测 654.72） |
| ↳ 批 2 的收口（批 2 完成时更新） | **口径注**：`manualChunks` **本身一个字节都不降首屏**（只把同一批字节切成多文件，入口仍静态依赖全部 chunk）；它的价值是 ① 让批 6 的 GSAP 落进独立懒 chunk ② 给 `import()` 产生的懒 chunk 稳定的共享 vendor 边界。**首屏下降全部来自 `import()`**（Task 6 页级 + Task 7 窗口变体 + Task 8 对话面板，**三条缺一不可**）。**交付形态 = 8 页懒 + 课堂页静态**（懒课堂页会把「首屏即被抓取的 20.04 kB」记作 lazy，**低估首屏读数 20.04 kB**）。**终态 25 chunk = 首屏 3 + 懒 22**；**两窗变体首屏 97.29 / 94.19 kB**（计划原推理「入口 + 零 vendor」**为假**，实测 = 入口 + 4 个 vendor chunk；「变体 < 60 kB」**结构性不可达** —— `vendor-react` 单独即 60,367 B，且三窗共用同一份 `index.html`、静态闭包逐字节相同） | 收口六门禁（2026-09-12 实测）：`line-limits --full` `0 / 123 / 123` · `docs-check` exit 0 · registry **312/312/0** · `tsc` 0 错 · vitest **125 文件 / 1233 用例** · `cargo test` **2300 / 0 / 6** · clippy **19（集合 identical）** · 首屏预算守卫 **exit 0 · 92.79 kB**。**包体瓶颈清单见** [批 2 计划 §收口回写](../plans/2026-09-11-frontend-redesign-batch2-bundle.md) |
| **3 壳层落地** | A′ 顶栏 + ⌘K + 溢出策略 + 窗口尺寸 + 列注册表 + 断点 + `--nav-h`　**✅ 已落（2026-09-12 收口，`85d51d83^..` 至收口提交，**22 个提交**）** | 9 页全走注册表 **✅**；1024 无溢出 **✅（限定词：常态；toast 已按 A3 移出导航行）**；7 处魔数归零 **✅（判据重述：**已吸收 8 · 有目标未吸收 1 · 无目标 2**，见下注 —— **不压回「7」**） |
| ↳ 批 3 的收口（批 3 完成时更新） | **改动面 8 个文件族**：`shell/{navRegistry,columnRegistry,breakpoints,windowSize,TopBar,CommandPalette,ShellFallback,kbCommands,useKbPaletteSearch}` + `App.tsx` + 4 处页面/组件接线（`ChatSidebar` / `GoalsPage` / `SettingsPage` / `ClassroomRightPane` / `NoteReadingView` / `NotesReadingColumn`）；**`--nav-h` 的落点是 token 生成器**（`app/scripts/gen-tokens.mjs` 单一真源 → `ui/tokens.css` 产物，**不是手改产物**）；**列契约的执行器归属（A5 裁决）**：注册表**持有规格**、`useColumnLayout` **仍是执行器**（选项 (b)「注册表自实现」登记为**日后可能的合并方向，且不得声称能力对等**）；**`pinnable` 字段是本计划取的默认**（规格 §6.2 给了字段但**未给逐行值**，批 3 全行 `false`，无消费方）；**本批四个非目标**：① 不重做批 2 包体工作（守住）② 不迁 L1 原语（守住，三条 `primitives=false` 断言）③ 不建视图层（守住）④ 不装 GSAP / 不加动效（守住，CSS 静态属性断言） | 三条验收的机器判据与原始读数：批 3 计划 §收口回写 · `tmp/acceptance.md`（不入库） |

> **🔻 收口评审 M-2 就地加注（2026-09-12，**上格原文保留**）——「8 个文件族 / 4 处接线」两个数字不可追溯，实测口径如下**：
> - **改动面实测 = 31 个生产文件**（命令：`git diff --name-only 85d51d83^..42e88740 -- app/src app/src-tauri app/index.html app/scripts app/package.json`，再剔除 `*.test.*` / `test.mjs`）：`app/src/**` **28**（`shell/*` 11 · `ui/*` 2 · `components/*` 5 · `pages/*` 9 · `App.tsx` 1）+ `app/index.html` + `app/scripts/gen-tokens.mjs` + `app/src-tauri/tauri.conf.json`。⇒ 上格「8 个文件族」**是计划期陈旧估算**（照抄批 3 计划 Task 3 Step 5 的「写清 8 个文件的改动面」），**既非实测、也与它自己列的 `shell/{…}` 清单（9 个名字）不符**。
> - **接线实测 = 6 处页面/组件**（上格写「4 处」却列了 6 个名字 ⇒ **同句内部矛盾**）：`ChatSidebar` / `GoalsPage` / `SettingsPage` / `ClassroomRightPane` / `NoteReadingView` / `NotesReadingColumn`。
> - **另有 18 个新测试文件**（`app/src/shell/*` 14 + `components|pages` 4；`git diff --name-only --diff-filter=A …` 实测），不含在上面的「生产文件」计数里。
> - **判据按实测口径读**（本仓口径：按实测/判据重述，不迁就数字）；上格其余内容（`--nav-h` 落点、A5 裁决、`pinnable` 默认、四条非目标）**不受影响**。
| **4 原语迁移** | 20 弹层 / 44 空态 / 85 加载 / 196 错误行 / 4 toast / 2 confirm / Button/Surface/Text | z-index ≤6；`role="dialog"` 20/20 |
| ↳ 批 4 的收口（批 4 完成时更新 · 2026-09-12） | **✅ 已落**（`4905d4d8^..<收口提交>`，**49 个提交** = 48 个实施/评审/修复 + 本节所在的收口提交；**含左端点**口径见 [v0.22](../../versions/v0.22.md) 批 4 节）**；上格原文一字未改**。**两条验收全部达标**：① **`z-index ≤6`** —— 裸值 **58 处 / 43 文件 / 17 值 → 3 处 / 3 文件 / 3 值**（`10` / `999` / `1000`，全是 B2 例外且逐条带理由；冻结名单 58 → 3；六档 = `raised 10` / `panel 100` / `popover 200` / `modal 300` / `modalNested 400` / `toast 500`）；② **`role="dialog"` 20/20** —— `DIALOG_20` 的 20 个文件全部只经原语持有弹层机制（barrel ∧ 无深导入 ∧ 无自建遮罩 ∧ 无 `keydown` ∧ 无裸 z-index），`role="dialog"` 的源码命中只出现在 `ui/primitives/Modal.tsx`。**R2 的中间态（必读，否则会引用一句已变形的话）**：验收第 3 条「五类重复 → 各自 1 个原语」在批 4 结束时**并不成立** —— 批 4 走的是 **B11「切片 + 棘轮」**：**只有切片内清零**，切片外余量逐类冻结并登记去向（见 §11-3 加注）。**八门禁终态**：`line-limits --full` **0 / 122 / 122** · `docs-check` exit 0 · registry **312/312/0** · `tsc` **0 错** · vitest **166 文件 / 1608 用例 / 0 失败**（对拍批 4 开工基线 **LOST=0 · SHRUNK=0**）· 首屏预算 **100.30 kB gzip**（真实构建，余量 99.70 kB；**CSS 62.63 kB 不计入判据只报告**）· eager **89 文件（源 76 + CSS 13）/ TS-API 真实边 65 / npm 包 4**（Δ 与机理见 v0.22 批 4 节）· **Rust 未复跑**（本批零 Rust 改动 —— `git log 42e88740..HEAD -- app/src-tauri` 为空）。**观测口径**：观感从本批**真的开始变**（叠放值收敛 · 面板宽度档位 · 圆角 6→8 9 处 · 边框/底色冷灰→暖纸 · 20 处阴影换 token），但**只有接缝、没有纲领**（三档强度/双基调/GSAP 属批 6）。 |
| **5 视图层样板** | `viewRegistry` + `ViewSwitcher` + 会话 4 视图 + 笔记 3 视图 + 惰性挂载 + flushSave 守卫 | 各 ≥2 种形式可用；原文不丢 |
| ↳ 批 5 的收口（批 5 完成时更新 · 2026-09-12） | **✅ 已落**（`ad9d80d2^..` 至收口提交，**31 个提交** = 30 个 T0–T17 实施/守卫提交 + 本节所在的收口提交；**含左端点**口径见 [v0.22](../../versions/v0.22.md) 批 5 节）**；上格原文一字未改**。**上格两处数字与实盘不符，按实测读**：① 「会话 **4** 视图」→ **5 个**（`raw`/`tritrack`/`proof`/`cardflow`/`preview` —— 多出的 `preview` 是**既有**笔记预览，按 §7.3② 一并进注册表并**转为惰性**）；② 「笔记 **3** 视图」→ **2 个**（`raw`/`cardflow`）：第三种「带证据三轨」是 **C2 的条件项**，只读探针判**不存在**逐段级「笔记 ↔ 证据」读取路径 ⇒ 按 C2 逐字「**交付 2 视图 + 就地加注 §7.2/§11-6 + 登记批 7**」，**不建空壳视图**（见 §7.2 与 §11-6 的批 5 加注）。**验收「各 ≥2 种形式可用；原文不丢」✅**：会话 **5 ≥ 2** · 笔记 **2 ≥ 2**；「原文不丢」= 默认视图 `raw` **常驻不卸载**且有行为级判据（**H1 11/11** · **F5 11/11**）。**三条硬约束 9/9 判据全绿**（判据落点与变异体出处见 §7.3 加注）。**八门禁终态**（`HEAD = b4edf8e4` · 真实构建产出 `app/dist` mtime **2026-09-12 22:58:51 +08:00**）：`line-limits --full` **0 / 122 / 122**（零新增登记）· `docs-check` exit 0（扫描 **277** / 检查 **177**）· registry **312/312/0** · `tsc --noEmit` **0 错** · vitest **184 文件 / 1770 用例 / 0 失败 / 0 skip**（**逐文件**对拍批 5 开工基线 `2559a3fd` **166 文件 / 1608 用例** ⇒ **LOST=0 · SHRUNK=0**；GROWN 4 · ADDED 18）· `check-bundle-budget.mjs`（**真实构建**，取 `tmp/build.lock`，attempt=1、`finally` 释放）**exit 0 · 首屏 100.49 kB gzip**（原始 318,299 B；**余量 99.52 kB**；**CSS 63.23 kB 原始 / 14.51 kB gzip 不计入判据，只报告**；入口 `index-Bn5oI23G.js` 108,620 B）· `bundle-eager-graph` **91 文件（源 77 + CSS 14）/ npm 包 4**，**TS-API 真实边口径 66**（结论口径；`--keep-type-only` = 77 自证 ⇒ 差额确由 14 CSS + 11 条纯类型边构成）· **Rust 未复跑**（本批零 Rust 改动：`git log 091d1c3d..HEAD -- app/src-tauri` 与 `git log 4905d4d8..HEAD -- app/src-tauri` **两条均为空**）—— 判据仍是批 3 的 **2300 / 0 / 6**，**不得**读成「已跑」。**观测口径（B9 逐字）**：**「只有接缝、没有纲领」—— 三档强度 / 双基调 / GSAP 在批 6**；本批交付的是**内容与结构**（视图层骨架 + 多视图可用），**不是手感**。 |
| **6 动效系统** | GSAP 接入 + token + 四层 + 三档 + 相变两态 + 6 个签名动效 + `usePresence` | 可中断可反向；三档正确；60fps |
| **7 未接线落地** | 12 条补 UI（含 `kb_search` → ⌘K）· 标签线 · 档位通道 · B 桶 3 条撤下 IPC · **`structuredBlocks` 整模块存废**（批 1 控制方裁决：接线（4 个导出全接入、真实置信度渲染「低置信点线」）**或**删除（连同类名与规格/登记表一并移除）二选一，**批 1 未决前不得删**） | **标签能写进去**；**档位选完真生效**；**`structuredBlocks` 已作出接线或删除的明确裁决** |
| **8 治理收口** | 豁免表终态 · 回写 `ui-ux-system.md` / `theme.md` · 新增动效规范章节 · 需求池同步 | 11 条验收全达标 |
| ↳ 批 1 的收口（批 1 完成时更新） | **22 条命令已删**（本表原写 21 ＋ #41 `open_capture_float` 改判；`git diff --name-status --diff-filter=D e96ab63d HEAD` = **10 个文件**）· **补缝三连连带模块已删**（`ai_judge` + `AiMockAdapter::enhance` + `ai_protocol.rs` 的 `AiEnhance*` 半边，**−26 用例** = 9+7+10；另 T3 整族删除 **−25**、T6 **−4**、T7 **−4** ⇒ 全批 **−59**）· **ADR-010 已废弃**（文件保留）· **`structuredBlocks` 死文案已清**（**整模块存废登记给批 7**） | 收口门禁（2026-09-12 实测）：registry **312/312/0** · `cargo test` **2300/0/6** · `cargo build` 0 `dead_code` · clippy **19**（集合与开工基线 identical）· vitest **124 文件 / 1124 用例** · `tsc` 0 错 · `line-limits --full` **0 / 123 / 123** · `docs-check` exit 0 |

> **批 0–1–2 期间界面几乎不变 —— 这是设计意图，不是失败。** 批 0–1 交付的是「让后面每一批都能一次改对所有地方」的能力。观感从批 4 开始变，骨架在批 3，内容在批 5，手感在批 6。

> **实施计划的粒度**：本规格覆盖 9 批，**不建议一次性生成全部 9 批的实施计划**。正确做法是每批各自一份实施计划，且**后一批的计划在前一批验收通过后再写** —— 因为批 3 之后的细节依赖批 0–2 的实测结果（尤其是包体治理量出的瓶颈清单与拆件后的真实文件结构）。

---

## 11. 验收口径

1. 4 个 >600 行文件 → **0**；>300 行 100% 在豁免表内且数值与实测一致。
2. 手写弹层 20 → 全走 `Modal`；z-index 不同值 17 → **≤6 档**；`role="dialog"` + 焦点陷阱 **20/20**。
   > **🔻 收口评审 M-1 就地加注（2026-09-12，**上句原文保留**）—— 档名写错：`zIndex("palette")` 档不存在，实盘是 `zIndex("modal")`**：`app/src/ui/zIndex.ts` 的**六档**是 `raised / panel / popover / modal / modalNested / toast`，**没有 `palette`**（`node -e "…/palette/.test(readFileSync('app/src/ui/zIndex.ts','utf8'))"` ⇒ `false`）。实现用的是 **`zIndex("modal")`**（`app/src/shell/CommandPalette.tsx` 两处调用；被 `CommandPalette.test.tsx` ⑤ 与 `ui/zIndex.guard.test.ts` 钉住）。⇒ **本行应按此读**：`CommandPalette` 用 **`zIndex("modal")`**、AI toast 用 `zIndex("toast")`。**原文保留的理由**：本仓文档回写的一贯口径是「原文 + 加注」，且此处**没有**改判任何验收判据（口径仍是「全走六档标尺」）。**风险已消**：批 4 的层级归并**不得**按 `palette` 这个**类型系统都不接受的档名**做判断。
   >
   > ↳ **批 4 收口后更正（收口评审 M-13，2026-09-12）**：上句里「`CommandPalette.tsx` **两处调用**」是**批 3 时点的读数**；`bde807dc`（T9 的 palette 半程）已把层级交给 `Modal` ⇒ **HEAD（`7d541254`）实测 0 命中**：`git grep -n 'zIndex(' -- app/src/shell/CommandPalette.tsx` **空**（`bde807dc^` 上为 **2 处**）。⇒ 本行的正确读法 = **`CommandPalette` 今日不含 `zIndex("modal")` 调用，层级由 `Modal` 承担**；「`palette` 档不存在」的结论**不变**。
   > 另：读数锚里那句歧义 —— 「手写弹层 **20**」（§2 弹层行）与 §5.2 的「28 个手写弹层迁移后同样不得…」并存（28 = 弹层 + 确认框 + toast 一类手写覆盖层的合计口径）。**批 3 未涉及这组数字中的任何一个**，两者都**只登记**，消歧归批 4/批 8。
   >
   > **🔻 批 4 收口就地加注 · 三口径并列 + 例外表 + 有意值收敛（2026-09-12，**上面两句原文一字未改**；批 4 给出的消歧如下，「消歧归批 8」仍适用于**跨文档**的对账）**：
   > - **验收口径 = 20**（规范文本优先，B3）。**20 的构成（钉死在 `app/src/ui/primitives/dialogMigration.e.test.ts` 的 `DIALOG_20`，不是散文）**：**A 组 14**（T5 的 7 + T6 的 7）+ **B 组 4**（工作台：`KnowledgeSystemWizard` · `ProofreadPanel` · `RefineWorkbench` · `SecondPassPanel`）+ **E 组 2**（`PracticeQuestionsOverlays` · `SopRunOverlay`）= **20**，逐文件 4 条形态判据（barrel 含 `Modal` ∧ 无深导入 ∧ 无自建遮罩 ∧ 无 `keydown` ∧ 无裸 z-index）。
   > - **三个口径并列（不得混用）**：**20** = 本条的验收口径（对话框类）；**28** = ADR-033 的**同行口径**（更宽的手写覆盖层合计）；**34** = **跨行容忍口径**（把「`position:fixed` 与 `inset:0` 分写两行」的形态也算进来）。**等式（机器判据，双向）**：`34 − 20 = 14 = 11 锚定菜单 + 3 覆盖层`；且 `28 ⊆ 34 ∧ |28| = 28 ∧ 28 == 34 − 6`（`CROSS_LINE_ONLY_6` 是跨行口径多出来的 6 条）。逐文件清单与 `size`/`testId` 表见批 4 计划 §收口回写 §一。
   > - **例外表（B1 + B2，逐条带理由，不许静默）**：
   >   | # | 文件 | 类 | 为什么不迁 |
   >   |---|---|---|---|
   >   | 1 | `components/BrowserChrome.tsx` | 锚定菜单（B1） | `data-app-menu` 右键菜单：无对话框语义，只落 `popover(200)` |
   >   | 2 | `components/GroupRowContextMenu.tsx` | 锚定菜单（B1） | 透明点击层 + 锚定面板成对；层内相对序由 DOM 序保持 |
   >   | 3 | `components/GroupSidebarRow.tsx` | 锚定菜单（B1） | `position:absolute; top:100%` 行内下拉 |
   >   | 4 | `components/NoteHeaderActions.tsx` | 锚定菜单（B1） | 笔记头操作菜单 |
   >   | 5 | `components/NoteListBatchMenu.tsx` | 锚定菜单（B1） | 批量操作菜单 |
   >   | 6 | `components/NoteMoveToGroupMenu.tsx` | 锚定菜单（B1） | 「移动到组」菜单 |
   >   | 7 | `components/NoteRowContextMenu.tsx` | 锚定菜单（B1） | 行右键菜单 |
   >   | 8 | `components/RouteInfoPopover.tsx` | 锚定菜单（B1） | 路由理由气泡 |
   >   | 9 | `components/SessionRowContextMenu.tsx` | 锚定菜单（B1） | 会话行右键菜单 |
   >   | 10 | `components/chat/ChatLaunchMenu.tsx` | 锚定菜单（B1） | T13-b 从 `ChatPage` 拆出的发起菜单（透明点击层 + 菜单，落 `popover`） |
   >   | 11 | `components/note-selection/SelectionActionMenu.tsx` | 锚定菜单（B1） | 选区操作菜单（全仓唯一 `window` **捕获相** ESC 监听在此，一并冻结） |
   >   | 12 | `components/CaptureOverlayPanel.tsx` | 覆盖层（B2） | 采集覆盖层的**子操作条**（嵌在全屏采集面内部；迁档会踢出「覆盖层内部层」语义）；**其根遮罩今日仍未声明 `zIndex`** —— 登记在案 |
   >   | 13 | `components/ImagePreviewOverlay.tsx` | 覆盖层（B2） | 图片查看（zoom-out 遮罩 + 92vw 大图）：迁 `modal(300)` 会让大图落到对话框档之下 |
   >   | 14 | `components/ScreenSelectOverlay.tsx` | 覆盖层（B2） | 全屏十字光标屏幕点选：迁档会让采集面被任何弹层盖住（**只登记根**；其子层在根建栈内 ⇒ 已迁 `raised`） |
   >   - **这 14 条的硬守卫**：`dialogMigration.e.test.ts` ② 断言「**登记为「不迁」的文件不得 import 原语层**」+ `buttonMigration.test.ts` ④ 同向复核 ⇒ 本批有 **9 处**（`b1-non-migrated`，2.54:1）因此**回退并冻结**（B21：维持守卫、不放开；批 5/7 若要迁这 14 个文件的排版，**必须先由控制方裁决 B1/B2 的守卫范围**）。
   >   - **🔻 批 4 收口后更正表（收口评审 I-7；**上面这张表与它的原文一字未改**）**：上表第 1–11 行自称是「`34 − 20 = 14` 里的 11 锚定菜单」，但**与机器真源 `NON_MIGRATED_14`（`dialogMigration.e.test.ts:115-122`）的非 `*Overlay` 那 11 条差 3 个成员** —— 文档多 `BrowserChrome` / `GroupSidebarRow` / `NoteHeaderActions`，文档缺 `NoteEditView` / `NoteLinkToSystem` / `RichEditorView`。表格第 12–14 行（3 个 `*Overlay`）**正确**。
   >   **独立复算**（`node .superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/tmp/docfix/d4-membership.mjs`，从 `.e` 的导出数组解析、不手抄）：
   >
   >   | 文档表行 | 文件 | 在 `NON_MIGRATED_14`？ | 在 `ADR033_28`？ | 在 `CROSS_LINE_34`？ | 真源里的类 |
   >   |---|---|---|---|---|---|
   >   | 1 | `components/BrowserChrome.tsx` | ❌ **不在** | ❌ 不在 | ❌ 不在 | —（文档误列；`.e` 里它只作 `TABLE4_ALIAS`，并有机器断言 `CROSS_LINE_34.includes(TABLE4_ALIAS) === false`） |
   >   | 2 | `components/GroupRowContextMenu.tsx` | ✅ | ✅ | ✅ | 锚定菜单（B1） |
   >   | 3 | `components/GroupSidebarRow.tsx` | ❌ **不在** | ❌ 不在 | ❌ 不在 | —（文档误列） |
   >   | 4 | `components/NoteHeaderActions.tsx` | ❌ **不在** | ❌ 不在 | ❌ 不在 | —（文档误列） |
   >   | 5 | `components/NoteListBatchMenu.tsx` | ✅ | ✅ | ✅ | 锚定菜单（B1） |
   >   | 6 | `components/NoteMoveToGroupMenu.tsx` | ✅ | ✅ | ✅ | 锚定菜单（B1） |
   >   | 7 | `components/NoteRowContextMenu.tsx` | ✅ | ✅ | ✅ | 锚定菜单（B1） |
   >   | 8 | `components/RouteInfoPopover.tsx` | ✅ | ✅ | ✅ | 锚定菜单（B1） |
   >   | 9 | `components/SessionRowContextMenu.tsx` | ✅ | ✅ | ✅ | 锚定菜单（B1） |
   >   | 10 | `components/chat/ChatLaunchMenu.tsx` | ✅ | ✅ | ✅ | 锚定菜单（B1，T13-b 拆件新家） |
   >   | 11 | `components/note-selection/SelectionActionMenu.tsx` | ✅ | ✅ | ✅ | 锚定菜单（B1） |
   >   | **补** | `components/NoteEditView.tsx` | ✅（**文档原表缺席**） | ✅ | ✅ | 透明层（非 `*Overlay`，属那 11） |
   >   | **补** | `components/NoteLinkToSystem.tsx` | ✅（**文档原表缺席**） | ✅ | ✅ | 透明层（非 `*Overlay`，属那 11） |
   >   | **补** | `components/RichEditorView.tsx` | ✅（**文档原表缺席**） | ✅ | ✅ | 透明层（非 `*Overlay`，属那 11） |
   >   | 12–14 | `CaptureOverlayPanel` · `ImagePreviewOverlay` · `ScreenSelectOverlay` | ✅ ✅ ✅ | ✅ ✅ ❌（`ImagePreviewOverlay` **不在 28**、属 `CROSS_LINE_ONLY_6`） | ✅ ✅ ✅ | 覆盖层（B2） |
   >
   >   ⇒ **根因**：文档把「recon 的 B1 锚定菜单清单（11 条，多为 `position:absolute` 形态）」与「`34 − 20 = 14` 的非覆盖层那 11 条（含 3 条透明层）」**当成了同一个 11**；而该表上下紧邻的两句正是「`34 − 20 = 14 = 11 锚定菜单 + 3 覆盖层`」与「**这 14 条**的硬守卫」⇒ 表与它自称分解的对象不符。`ADR-033:162` 已同步同一更正。
   >   - **🔻 同一行的 `b1-non-migrated`「9 处」更正（收口评审 M-12）**：上行的 **9 = 回退动作数**（`tmp/t16b/revert-b1.mjs` 的 `SITES` = **9 条 / 7 文件**：`NoteEditView:373` · `NoteLinkToSystem:258` · `NoteLinkToSystem:301` · `NoteListBatchMenu:82` · `NoteMoveToGroupMenu:135` · `NoteRowContextMenu:202` · `RichEditorView:363` · `RouteInfoPopover:310` · `RouteInfoPopover:351`）；该类的**冻结处数**另算 —— `textBaseline.RESIDUAL` 里 `kind="b1-non-migrated"` 的 7 个文件在 `FROZEN_MUTED_GRAY_BY_FILE` 的计数之和 = **14**（收口修复单元 `ed07d491` **之前是 13**；差额 1 = `components/NoteRowContextMenu.tsx` 的 `</x>` 假阴被修掉，该格 1 → 2）。⇒ 引用时必须写明是**哪一个数**（回退动作 **9** / 冻结处数 **14**）。
   > - **🔴 例外只覆盖那 3 条裸值；其余 55 处按 B2 口径登记为「有意值收敛」（durable 登记，出处 `task-4-report.md:208-212`，由 T4 的 `8d84ecfe` 落地）**：`50/51/60/999/1000/1100/1150 → modal(300)` · `30–61 → popover(200)` · `900 → panel(100)`。**这不是「写法变了、观感不变」** —— 叠放值真的变了（如 `1150 → 300`），只是**相对序在设计上保持不变**；规格 §10 逐字「观感从批 4 开始变」在这里的形态就是「叠放值收敛」。与 `docs/versions/v0.22.md` 批 4 节的「诚实代价」同段。
3. 空态 / 加载 / 错误行 / 弱化文本 / 卡片边框 五类重复 → 各自 **1 个原语**。
   > **🔻 批 4 收口就地加注 · 本条的中间态（2026-09-12，**上句原文一字未改**；控制方 **B11** 的附带硬要求：不加这条注，批 8 会引用一句**已变形的话**）**：
   > - **批 4 结束时，上句「五类 → 各自 1 个原语」在字面上并不成立。** 批 4 走的是 **B11 的 (B)「切片 + 棘轮」**中间态：**只有切片内清零**，切片外的余量**逐类冻结**（棘轮只许降）并登记去向（批 5/7）。**终局口径不变** —— 上句仍是目标；变的只是**批 4 的达成度**。
   > - **五类的终态读数（每类的「切片内 → 0 / 切片外余量 / 冻结数」；命令与逐文件表见批 4 计划 §收口回写 §一）**：
   >
   > | 类 | 切片内 | 切片外余量 | 棘轮冻结数（终态） |
   > |---|---|---|---|
   > | 空态 `EmptyState` | **0**（切片 28 文件，非例外命中 0） | **5 文件**（`FROZEN_REST`，只许减）+ 例外 **8** 条 | 全仓命中 **≤44**（域内 33 文件） |
   > | 加载 `Loading`/`Skeleton` | **0**（迁移面 10 文件 0 命中） | **8**（4 backlog 文件 + 3 `button-busy` + 1 例外） | `FROZEN_LOADING_TEXT_TOTAL = 8 == RESIDUAL 8`（冻结表 18 键逐格钉死） |
   > | 错误行 `StatusLine` | **0**（迁移面 49 文件全走原语，含逐文件处数下界） | 三红字面量 **114 处 / 67 文件** | `FROZEN_RED_TOTAL = 114`（**剥注释口径**） |
   > | 弱化文本 `Text` | **0**（切片内 186 处迁完） | **63 处 / 44 文件 / 7 类**（`RESIDUAL` 逐条带理由） | `FROZEN_MUTED_GRAY_TOTAL = 63`；**字号越界 558 处 / 120 文件本批只冻结不迁** |
   > | 卡片边框 `Surface` | **0**（够格 21 处里实迁 14） | 边框 **226 处 / 108 文件** · 越界圆角 **261 / 109** · 阴影 **24 处 / 24 文件** | 三族 `FROZEN_*_TOTAL` = 226 / 261 / 24；`FROZEN_SURFACE_TAG_TOTAL = 14` |
   >
   > - **🔻 批 4 收口后更正（2026-09-12 · 收口评审 I-6 + 修复单元 `ed07d491`；**上表原文一字未改**）**：上表「弱化文本 `Text`」行的 **63 处 / 44 文件 / 7 类** 与 `FROZEN_MUTED_GRAY_TOTAL = 63` 是**旧剥注释仪器**的读数。修掉 `sliceScan.stripComments` 把 `</x>` 的 `/` 当正则起点的假阴后，**终态 = 64 处 / 44 文件 / 7 类**、`FROZEN_MUTED_GRAY_TOTAL = **64**`（逐文件格 `components/NoteRowContextMenu.tsx` **1 → 2**；条目数/文件数仍 44）。**逐类真源（我自测，`tmp/docfix/d2-kind.mjs`）**：条目数 `14 / 8 / 9 / 7 / 4 / 1 / 1`（**Σ44**）· 处数 `19 / 11 / 11 / **14** / 7 / 1 / 1`（**Σ64**）；**不得**再引用旧分解「`interactive*` 35 · `ternary-no-equivalent` 10 · `nontext` 6 · `b1-non-migrated` 9 · `tag` 1 · `colorMap` 2 · C 类 2」（自列之和 = 65，且 `colorMap` 与「C 类 2」是**同一类重复计数**）。物理恒等式 = **250 = 迁移 186 + 例外 64**。
   > - **「切片」的判据（B11，机器可算）**：① 本批其它任务已触碰的文件 ∪ ② `pages/**` 全部 ∪ ③ 该类中**有同名测试文件**的文件。
   > - **若控制方当初选 (A) 全量**：余量清单就在各类的 `*Baseline.ts` 的 `RESIDUAL` / `FROZEN_*_BY_FILE` 表里（**每一条都带非空理由**，且「僵尸豁免」判据会红），**不需要重新普查**。
   > - **⚠️ 判据的限度（诚实登记）**：`emptyStateRatchet` 的判据来源里，「① 本批已触碰」**无法在测试内复算**（需要 git 历史）⇒ 那一半只在 **gitignored 探针在场时**由 ⑥a 覆盖（净克隆里 ⑥a `skipIf` 跳过、⑥b 用「盘上可复算的第二源」顶上）。出处：`task-t13t15-fix-report.md` §六 (a) 5 · §六 (b)。
4. CSS 变量 0 → 覆盖全部语义色 / 字阶 / 间距 / 圆角 / 时长 / 缓动；hex 88 → **≤ token 数**。
5. `prefers-reduced-motion` 覆盖率 **100%**，且系统优先于强度档位。
   **判据（批 0-D 拍定）= 基类名单 + 动画落点名单，不是「全类集合 ⊇」**：每一类原语的**根类**（动效挂在它身上的选择器）必须在
   `motion.css` 的媒体查询名单里；**且每一处 `animation` 声明的选择器原文（含伪元素）也必须在名单里** ——
   `animation-duration` / `animation-iteration-count` **不是可继承属性**，覆盖写在宿主元素上伪元素拿不到
   （T11 评审用 headless Chromium `--force-prefers-reduced-motion` 实测：`.ed-skeleton` 是 `0.001s/1`，而
   `.ed-skeleton::after` 仍是 `1.2s / infinite` ⇒ 当时「让两者都静止」未达成）。名单**双向一致**（漏一个 = 照旧动；多一个 = 死名字）。
   修饰类（`--`）与子元素类（`.ed-modal-head/body/foot` · `.ed-confirm-seal/-impacts/-keep` · `.ed-empty__title`）**不进名单** ——
   它们与基类同在一个元素上、已被同一条规则覆盖，逐字枚举只会假红（T10 评审曾担心这条守卫会假红，实测 26/26 绿 ⇒ 不必另设兜底方案）。
   机器判据在 `app/src/ui/primitives/motion-coverage.test.ts`。
6. 会话与笔记各 **≥2 种**展示形式可用，原文形态不丢。
   > ↳ **批 5 收口就地加注（C2 的条件项 + C17①；2026-09-12，上句原文一字未改）—— 本条终态读数：会话 5 种 · 笔记 2 种，两种都 ≥2 ✅；「笔记 3 种」是条件项、未兑现**：
   > - **会话 = 5 种**：`FROZEN_VIEW_KEYS.session = ["raw","tritrack","proof","cardflow","preview"]`（`app/src/views/registry.ts:107`）。
   > - **笔记 = 2 种**：`FROZEN_VIEW_KEYS.note = ["raw","cardflow"]`（`app/src/views/registry.ts:108`）—— 第三种的「带证据三轨」**不存在**（C2 的探针判否：`task-1-report.md` · `tmp/t1/c2-evidence-probe.md`；T13 独立复现见 `task-13-report.md` §②）⇒ 按 C2 逐字「不存在 ⇒ 交付 2 视图 + 就地加注 + 登记批 7」，**不建空壳视图**（实测全仓 `NoteEvidenceTrack*` = **0 命中**）。
   > - **本条验收不因此变红**：**2 ≥ 2** ✅，且「**原文形态不丢**」成立（默认视图 = `raw`，**常驻不卸载**，§7.3① 的判据另见 §三条硬约束）。
   > - **§7.2 矩阵的同一更正**见 §7.2 的批 5 加注；**产品机会登记批 7**：锚点机制确实存在（`concat.rs:121-127` 发射 · `anchor_strip.rs:3-4` 契约 · `note_filter_golden_tests.rs:117-124` 金测试），批 7 若要做「带证据三轨」**必须先写规格**——**E2 降级为 ms 最近邻**、**E1/E3 改为「带锚点段落数」**，并覆盖 `OcrDirect`/`Web`/手动笔记/`anchor_timestamps=false` 的**无锚点情形**（逐条见 `task-13-report.md` §④）。
7. **47 条未接线命令逐个有结论**，无「不知道」。
   > **进度（批 1 收口，2026-09-12）**：47 条中 **22 条已删**（含 #41 改判）、**25 条处置已定但未执行**（补 UI 12 → 批 7 · 登记不排期 7 → 批 7/无期 · 撤下 IPC 3 → 批 7 · 有意保留 3 → 无期）。**无「不知道」**。批 1 计划 §现状普查第三节给出 47/47 的逐条处置表；删除后复算 = registry 312 / 前端零引用 **25** 条（= 47 − 22，逐条与上列归属一致）。
   > ⚠️ **批 1 的实测更正（供批 2+ 引用本条时注意）**：计划的「不删清单」在本批被**证伪五次**（`artifact_templates` 族 / `AiEnhance*` 半边 / `vad_threshold_slot` 三符号 / `spec_from_kind` / 调用点计数），根因是**用「看起来还有人用」代替「删除后可达性」**作保留判据 ⇒ 后续批次判断连通性请照「收口回写」节的四条约纪律（计划 `docs/superpowers/plans/2026-09-11-frontend-redesign-batch1-deletions.md`）。
8. **标签能写进去**且标签过滤面板有内容；**画面档位选完真的生效**且跨会话记住。
9. JS 包首屏 gzip 达标或给出瓶颈清单；GSAP 只在独立 chunk 懒加载。
   > **进度（批 2 收口，2026-09-12）**：**✅ 前半达标** —— 首屏 JS gzip **92.79 kB < 200 kB**（预算真源 `docs/standards/performance.md:28`），判据工具 `scripts/check-bundle-budget.mjs` **exit 0**、余量 **107.21 kB**、懒加载 22 个 574.84 kB 不计入。
   > **后半 ✅ 已就位但未装 GSAP**（「不装 GSAP」是批 2 的硬非目标）：`app/src/build/manualChunks.ts` 的 `vendor-gsap` **精确包名槽位已预留**并被单测钉住（含反例守卫，实测真实构建 746 次调用中 `vendor-gsap` 返回 **0** 次、`dist` 无该 chunk）；批 6 装 GSAP 时**必须**用 `import()`，判据见批 2 计划 Task 5。
   > ⚠️ **口径警告（勿误读本条的达成原因）**：`manualChunks` **自身不降低首屏字节**；本条达标全部来自 `import()`（页级 + 窗口变体 + 对话面板）。
   > **进度（批 5 收口，2026-09-12）**：**✅ 前半继续达标且几乎持平** —— 首屏 JS gzip **100.49 kB < 200 kB**（**余量 99.52 kB**），`scripts/check-bundle-budget.mjs`（**真实构建**，取 `tmp/build.lock`）**exit 0**；相对批 5 前基线（`091d1c3d` 冻结值 **100.30 kB / 100,297 B**）**Δ = +188 B gzip（+0.19%）**，全部落在**入口 chunk**（108,099 → **108,620 B**，+521 B）；首屏**chunk 个数 3 → 3（Δ=0，构造性成立）**。**CSS 63.23 kB 原始 / 14.51 kB gzip 不计入判据，只报告**（基线 62.63 kB ⇒ **+599 B**）。**懒 chunk 22 → 31 个 · 583.98 kB gzip**（1,805,017 B 原始；不计入预算）。**后半仍 ✅ 未装 GSAP**：`app/src/build/manualChunks.ts` **本批零改动**、**零新增依赖**（npm 包 4 → 4），`@keyframes` 零新增、`vendor-gsap` 槽位仍 0 命中 ⇒ 交接批 6。
   > **诚实代价（本条的批 5 形态，逐条带读数）**：① **`ViewSwitcher` 进 barrel 的首屏 Δ = JS `0 B` + CSS `+604 B`** —— **计划 C14① 的「首屏 Δ 不是 0」被实测否证**：**T5 的时点读数**（dist = 25 个 `.js`）显示 `ed-btn-group`/`ed-btn--segment` **0 命中任何 JS**、只在首屏 CSS 里命中 ⇒ **rollup 把 `ViewSwitcher` 的 JS tree-shake 掉了**（当时无调用点），终态（34 个 `.js`）该字面量命中**懒 chunk** `registry-C-RvXIfE.js` ⇒ 机理 = **barrel 里有导出 ≠ 产物里有模块**。② **「页 chunk 变小、总懒基本持平」**：`SessionsPage` 页 chunk **−10,288 B** · `NotesPage` 页 chunk **−4,815 B**（视图代码搬出页面 chunk ⇒ 懒 chunk 增 9 个真新增块）。
10. 6 个签名动效各自**可中断、可反向**，reduced-motion 下正确降级。
11. `npx tsc --noEmit` 0 错 · `npx vitest run` 全绿 · `cargo test` 全绿（每批）。
    > **进度（批 3 收口，2026-09-12）**：八门禁全绿（`line-limits --full` `0/123/123` · `docs-check` exit 0 · registry **312/312/0** · `tsc` **0 错** · vitest **143 文件 / 1370 用例 / 0 失败** · `cargo test --test app_lib_tests` **2300/0/6 逐字持平** · 首屏预算 **97.16 kB < 200 kB**（exit 0，余量 102.85 kB；**CSS 不计入该判据，只报告** 52.27 kB 原始 / 12.58 kB gzip）· clippy **位置集合 20 = 基线，SET-IDENTICAL**）。⚠️ **「vitest 全绿」本轮含一条既有 flake**（`components/KnowledgeGraphView.test.tsx > 单击节点…`）：本次全量**未复现**，但在**批 3 开工基线树 `a7bd1899`** 上复现过（隔离复跑 11 passed / exit 0）⇒ **既有负载敏感 flake，非本批引入**（判据与两种读数见批 3 计划 §收口回写）。
    > **进度（批 4 收口，2026-09-12）**：八门禁**终态**在**静止干净树**上重跑（`HEAD = 199da54b` · `app/dist` mtime **2026-09-12 19:54:33** · 采集 **19:5x**）：`line-limits --full` **0 / 122 / 122**（`--write` 复跑**零 diff** ⇒ 豁免表**不在**收口提交路径里）· `docs-check` exit 0（扫描 276 / 检查 176，五项全 ✅）· registry **312/312/0** · `tsc --noEmit` **0 错** · vitest **166 文件 / 1608 用例 / 0 失败**（**逐文件**对拍批 4 开工基线 143/1370 ⇒ **LOST=0 · SHRUNK=0**；GROWN 6 条 · 新增 23 个测试文件，逐条见批 4 计划 §收口回写 §二）· `check-bundle-budget.mjs`（**真实构建**，取 `tmp/build.lock`）**exit 0 · 首屏 100.30 kB gzip**（余量 99.70 kB；**CSS 62.63 kB 原始 / 14.42 kB gzip 不计入判据，只报告**）· `bundle-eager-graph` **89 文件（源 76 + CSS 13）· npm 包 4**，TS-API 真实边口径 **65**，**Δ = 0**（机理见批 4 计划 §收口回写 §二）· **`cargo test` 未复跑** —— **本批零 Rust 改动**（`git log 42e88740..HEAD -- app/src-tauri` 实测为空），判据仍是批 3 收口的 **2300 / 0 / 6**；**不得**把「未跑」写成「已跑」。⚠️ **一条已知 flake**（`components/KnowledgeGraphView.test.tsx` 的负载敏感用例）在本批多份报告里各出现过 1 次、**孤立复跑均全绿** ⇒ 既有现象，非本批引入。
    > ↳ **收口后处置（2026-09-12，`cd85e4c3`；控制方已裁）**：该 flake 的状态记为「**已加固、未复现**」—— 收口修复单元做了**最小稳定性修改**（`components/KnowledgeGraphView.test.tsx` 的 **18 处 `waitFor` 超时 `5000 → 15000`**，与 `vitest.config.ts` 的 `testTimeout: 15000` 对齐；**未放宽任何断言**、未加睡眠、未改配置、未加 `retry`），但**本机两种负载各 8 次 + 无负载 6 次均未复现** ⇒ **不声称「已修好」**。**纪律**：① **变异体实验不得与全量测试并发**（负载会把 flake 变成假红）；② 今后若在**顺序执行**下再红 ⇒ 按**新 flake** 重新定位。
     > **进度（批 5 收口，2026-09-12）**：八门禁**终态**在 `HEAD = b4edf8e4` 上采集（采集窗口 **22:57:07 – 22:58:51 +08:00**；真实构建产出 `app/dist` mtime **2026-09-12T14:58:51.595Z** = 22:58:51 +08:00，入口 `index-Bn5oI23G.js`）：`line-limits --full` **0 / 122 / 122**（`--write` 复跑**逐字节零 diff**，sha256 相同 ⇒ 豁免表**不在**收口提交路径里）· `docs-check` exit 0（扫描 **277** / 检查 **177**，五项全 ✅）· registry **312/312/0** · `tsc --noEmit` **0 错** · vitest **184 文件 / 1770 用例 / 0 失败 / 0 skip**（`--frozen` 逐文件对拍批 5 开工基线 `2559a3fd` 的 166 文件 / 1608 用例 ⇒ **LOST=0 · SHRUNK=0**；GROWN **4** · ADDED **18**）· `check-bundle-budget.mjs` **exit 0 · 首屏 100.49 kB gzip**（余量 99.52 kB）· `bundle-eager-graph` **91 文件（源 77 + CSS 14）/ npm 包 4**，TS-API 真实边 **66** · **`cargo test` 未复跑** —— **本批零 Rust 改动**（`git log 091d1c3d..HEAD -- app/src-tauri` 与 `git log 4905d4d8..HEAD -- app/src-tauri` **两条均为空**）；判据仍是批 3 收口的 **2300 / 0 / 6**，**不得**把「未跑」写成「已跑」。
     > ⚠️ **本条的仪器口径（批 5 实测，供后续批次引用）**：**vitest 的「文件数」必须用 `testResults.length`** —— vitest **4.1.11** 的 JSON 顶层**没有** `numTotalTestFiles` 字段（`Object.keys(json)` 实测仅 12 个键；`hasOwnProperty` = false、`typeof` = `undefined`），而 `numTotalTestSuites` = **647** 是 **`describe` 块数**、与文件数差 **463** ⇒ **两个字段都不能当文件数用**。另：`numPendingTests` **1 → 0**（`skipped` 归零，全由批 5 收口的两个守卫提交解释；闭合式 `1750 + 19 + 1 = 1770`）。
     > **批 5 的既有 flake 状态**：`components/KnowledgeGraphView.test.tsx` 的负载敏感用例**本批全量未复现**（批 4 的「已加固、未复现」状态继续有效）；批 5 的 vitest 终态 **0 失败**。

---

## 12. 仍未决与登记不排期

| 项 | 状态 |
|---|---|
| `open_capture_float` 前端现有开法 | ✅ **已结清 2026-09-11**：前端 0 调用者（活路径为 `float_toggle` + `close_capture_float`）⇒ 改判为「删」，落地于**批 1** |
| 软删 / 回收站（审计 D2 丙方案） | 独立技术债 —— 需 schema 迁移 |
| T7 档案记忆增量（命中计数 + 会话后自动修正） | 基础闭环已通，增量登记 |
| `image_stream_store.rs` 图像流接线（L6） | 档位通道做完后才具备前提 |
| 滚动驱动动效 · 图谱浮现 · 笔记树生长 · 熵减收拢 | 登记不排期（已从「不做」改为「待议」） |
| 3 套 markdown 渲染器归一 | 可并入批 4 → **⚖️ 2026-09-12 已裁定：不并入批 4**（批 4 侦察的裁决 B8 `.superpowers/sdd/2026-09-12-frontend-redesign-batch4-primitives/rulings.md`：批 4 已背 510 按钮 + 34 弹层 + 44 空态 + 88 加载 + 190 错误行 + 1271 字号，再并入大模块会让**单批不可验收**）⇒ **登记去向：批 5（视图层）或批 7（未接线落地）**。本行「可并入批 4」是**许可不是命令**，原文保留 |
| 审计文档 D1–D10 编号复用（§4 与 §6 批 3 两套 D 编号） | 需消歧，否则引用会出错 |
| 「某个具体的瞬间希望它是活的」 | ✅ **已答复 2026-09-11**：**「我希望我在对其进行交互时，它是活的」** ⇒ 已并入 **§8.6.1**（四条硬约束：配重翻转 / 每个动作都要有即时回执 / 可中断可反向 / 无障碍优先）。**批 6 的 6 个签名动效照此配重**。 |
| 旧单 provider 凭据槽 `"default"` 在应用内**永久不可撤销**（`ai_save_key`/`ai_clear_key`/`ai_test_connection` 删除后无 IPC 写/清路径） | **登记不排期 · 归属「处理 AI 凭据」的批次做产品裁决**（建议与批 7/批 8 的产品文档 pass 同批）。正解 = **新增**一条 provider 通道的「清理遗留 scope」命令，**不是**恢复旧命令；读兜底与启动迁移仍在，前端本就 0 引用（非回归）。出处：批 1 计划「未做（登记）」表 |
| 批 1 后的 `requirements-pool.md` **功能级陈旧表述**（REQ-050「走 AI 补缝（V1.0）」· REQ-052「五档案模板 + 产物视图 + 落笔记」· REQ-053「低置信/AI 占位样式」） | **登记不排期 · 产品文档 pass**（与批 7 的未接线落地判定同批）：这三条**不点名已删符号**，属产品功能级状态重写，删除批不做。出处：批 1 Task 10 报告 §6/§9 |

> **🔻 批 5 收口就地加注 · 「3 套 markdown 渲染器归一」的去向（A8 = C8 = D8；2026-09-12，**上表原文一字未改**）—— 批 5 **未承接**，转**批 7****：
> - **裁决**：批 5 **不做归一**（理由与批 4 的 B8 逐字同族：批 5 已背 5 个新视图 + 注册表 + 1 个新原语 + 惰性挂载 + `flushSave` 守卫 + 2 个贴边文件拆件，再加渲染层归一**同样不可验收**；且 `NotePreviewView` **无测试面**，替换它没有回归网）。`ChatMessageMarkdown` → `NoteMarkdown` 的归并、`NotePreviewView` 手写解析器的替换**都转批 7**。
> - **批 5 只保证「不新增站点」**（防「3 套变 4 套」的硬要求）：`react-markdown` **运行时站点 = 2**（`NoteMarkdown` / `ChatMessageMarkdown`，**不变**）· `app/src/views/**` 的 `react-markdown` 站点 = **0**（含 `import type`；实测**含 type 也 0**）· `remark-*` + `rehype-*` = **8**（不变）· **零新增依赖**。笔记卡片流的派生器 `views/note/noteCardModel.ts` **不手写 markdown 解析器**（复用既有 `react-markdown` 栈 + 自定义组件映射产出卡片结构），文件头**显式命名「结构派生器，批 7 归一」**（判据：该行存在）。
> - **口径更正（C17②，文档与后续批次一律照此写）**：本行的「3 套」应读作「**4 套活 + 1 套死**」—— `NoteMarkdown.tsx:18` · `ChatMessageMarkdown.tsx:8` · **`utils/refineDiff.ts:78 mdLineHtml`（计划未点名的第 4 套手写解析器）** · `structuredBlocks.ts`（第 5 套、**无生产消费者**）。**T12 的判据不受影响。**
> - **行数代价**：`components/NoteMarkdown.tsx` **244 → 266 行**（**只追加**一个槽 + 一个类型导出，**删除行 = 0**；预算 ≤270 ✅）。
> - **出处**：批 5 计划 §收口回写 §七 · `tmp/t18/measurements.md` §9 A8。

---

## 13. 风险与回归

| 风险 | 触发条件 | 缓解 |
|---|---|---|
| 拆件行为不等价 | 拆 4 个超限文件时夹带功能改动 | 本批**不加任何新功能**；现有测试全绿 + 手工走查 |
| 删命令删到活代码 | `[DEAD]` 判定被测试文件污染 | **每条删除前重新确认调用方**（一次 grep）—— 批 1 实测升级为**三向复核**（前端生产字面量 / 前端测试 / Rust 调用形态）＋**同名三域归属**（命令 vs 同名活函数 vs 注释提及）：22 条全部为空，OCR 引擎与导入转写链路的同名活函数**一处未伤**。⚠️ **裸 `includes()` / 子串 grep 会误判**（本批实测 6 例：`refine_session` ⊂ `"auto_refine_session"` · `finish_session` ⊂ `"finish_photo_session"` · `video_profile_memory` ⊂ `"video_profile_memory.json"` · `recognize_image` ⊂ `recognize_image_timeout` · `remember_video_profile` ⊂ `remember_video_profile_form`/`_domain`）⇒ 必须用**引号定界字面量 / 整词边界**，且**任何「0 命中」结论都要点名仪器并先自检**（计划 §收口三）。**代价**：本批因此额外删除 59 条测试（计划原预测 16 条），每一笔都由控制方逐条裁决 —— 见批 1 计划「收口回写」节 |
| 未确认档 3.22:1 被误用 | 有人把关键信息放进未确认档 | 4.3 三条规则写进规范 + review 检查 |
| 剪报底纹标错来源 | 历史数据缺来源标记时「猜」 | 4.4 防御性规则：无标记即无标记，绝不猜 |
| 视图层内存膨胀 | 每对象多视图全部常驻 | 7.3 惰性挂载契约 + 重挂载恢复 scrollTop |
| 编辑丢稿 | 切视图时 `RichEditorView` 卸载 | flushSave 先行，失败则阻断并提示 |
| 包体继续膨胀 | 引入 GSAP 与新视图 | 批 2 先治理；GSAP 独立 chunk 懒加载。**批 2 已落（2026-09-12）**：`vendor-gsap` 精确包名槽位（`app/src/build/manualChunks.ts`）+ 单测三条（含反例）+ 首屏预算守卫 `scripts/check-bundle-budget.mjs`（首屏 **92.79 kB**，exit 0）。⚠️ 该守卫**未接** `.husky/pre-commit` / CI（**批 2 有意不接**：它要跑一次真实构建并写 `app/dist/`，塞进共享的 pre-commit 会让并行期每次提交都依赖「此刻工作树可构建」）⇒ 接线归属**批 8**，且接线时**必须**一并修它两个已实测缺口（嵌套输出路径静默假绿 · 把「非首屏」说成「仅动态可达」的假文案）。批 6 接入 GSAP **必须**用 `import()`。**另注：本行是「批 2 先治理」的兑现 —— 但治理的是首屏，`dist` 总量只降 4,415 B，安装包体积由批 8 另裁。** |
| 动效过度导致不适 | 「充满动效」纲领被无限放大 | 三档强度 + 系统 reduced-motion 优先 + 环境层幅度上限 2% |
| 红线名存实亡 | E1/E2 两处例外被当成先例 | 例外须各自登记原因/影响面/回滚；新增例外需再次裁决 |
| `[需真机确认]` 项 | 审计标注的运行态未知项（`window.confirm` 行为、录制中删会话、任务勾选是否 bump `updated_at` 等） | 相关批次开工前先真机验证 |

> **🔻 批 5 收口就地加注 · 本表三条风险的实际兑现度（2026-09-12，**上表原文一字未改**）**：
> - **`视图层内存膨胀`（缓解写「7.3 惰性挂载契约 + 重挂载恢复 scrollTop」）** —— **契约已落**：默认视图**常驻**（`resident-probe` 锚点，`SessionViewHost.test.tsx` **5 处**）、非默认视图**模块级惰性 + 切走卸载**（H2/F6 各 11/11，反向对照 T10-M2c/T14-M6 各自唯一红）；**重挂载恢复 `scrollTop`** 的**真实性不可验**（jsdom 的 `scrollingElement` 不滚动 —— T17 已留 `probe-jsdom-scroll*.json` 证明探针本身有效）⇒ **只登记**，批 8。**惰性挂载的「运行时内存效果」亦不可测**（字节面可测：懒 chunk 22 → 31 / 583.98 kB，**内存面不可测**）。
> - **`编辑丢稿`（缓解写「flushSave 先行，失败则阻断并提示」）** —— **已落且有牙**：`F1`（reject ⇒ 值未变 + 目标未挂载 + `role="alert"` + 记忆未写）· `F2`（resolve ⇒ 切换发生）· `F3`（非编辑态直通）· `F4`（阻断全过程 **0 个 toast 节点**），四条 `it` 在 `NotesReadingColumn.views.test.tsx` **11/11 passed**；反向对照 **T14-M1**（把 `catch` 改成继续）⇒ **唯一红 = F1**。**未消除的路径显式登记**：`RichEditorView` 内的 Ctrl+E / 完成按钮**仍不阻断**（今天就是 fire-and-forget，**非本批引入的回归**）⇒ 批 8。
> - **`包体继续膨胀`（缓解写「批 2 先治理；GSAP 独立 chunk 懒加载」）** —— 批 5 实测：**首屏 100.49 kB < 200 kB**（余量 **99.52 kB**；Δ = **+188 B gzip** 相对批 4 收口基线）；**懒 chunk 31 个 · 583.98 kB gzip**（**不计入预算**）；**三处可见/观感代价登记**（拆件顺带迁移：字阶 `11 → 11.5` · `13 → 12` · `#9ca3af → ink-3` · 圆角 `6 → 5` 落 `control` 档）—— 出处见 `docs/versions/v0.22.md` 批 5 节「诚实代价」。**GSAP 本批仍未装**（零新增依赖、`manualChunks` 零改动、`@keyframes` 零新增）⇒ 批 6 接入时**必须**用 `import()`，判据见批 2 计划 Task 5。

---

## 14. 文档与提交

**本设计文档**：`docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`

**同类需同步更新的文档**

| 文档 | 动作 |
|---|---|
| `docs/product/ui-ux-system.md` · `docs/product/theme.md` | **回写为目标态**（C+D、四层动效、三档强度、断点与窗口）—— 属 AGENTS.md §10「额外审查文件」。**批 0-D 已落**：`--ed-shadow-card → --ed-shadow-1/2` 的命名关系与定值 · **「L1 原语层」章节（§十一：10 类原语清单/消费场景/禁止事项 · 交互态契约 · 动效接缝与 reduced-motion 承诺 · token 消费纪律与两条用色禁令）** · 「剪报底纹上只用 `ink-3` 及更深」规则 · `--due` 第二次对比度修正。**四层动效 / 三档强度 / 断点与窗口 / §五§十 的旧参数仍留批 8**（T1 已登记：§十 tokens 代码块整体是旧版，与 ADR-032 不一致，未顺手重写） |
| `docs/adr/ADR-032..035` | 新建 4 条 —— **ADR-032 ✅ · ADR-033 ✅（批 0-D）· ADR-034/035 顺延至批 3 / 批 6**。<br>⚠️ **2026-09-12 批 3 收口登记（未做，需裁决）**：**ADR-034 在批 3 未写**（`docs/adr/` 实盘最高仍是 **ADR-033**，已当场列目录复核）。批 3 的壳层决策**全部落在代码与守卫里**（`shell/` 四个纯数据模块 + `TopBar`/`CommandPalette`/`ShellFallback` + 三组守卫），A1–A7 七处控制方裁决散在批次台账（`.superpowers/**`，**不入库**）⇒ **这些决策今天没有 durable 的 ADR 载体**。⇒ **建议归属：批 4 开工前补写 ADR-034（壳层：导航注册表 / 列契约 / 断点 / 窗口尺寸 / 溢出两级），或并入批 8 的治理收口**；**由控制方裁决**，本行只登记不擅自补。 |
| ↳ 上格的就地加注（批 4 收口，2026-09-12；**原文一字未改**） | **✅ 批 4 已补写 `docs/adr/ADR-034-l2-shell-navigation-and-column-contract.md`** —— 控制方 2026-09-12 **14:20 裁决「批 4 一开工就先补写」**，落在批 4 计划同一个提交 **`4905d4d8`**（`docs(plan): 批 4 原语迁移实施计划（19 任务）`，2 路径 = 计划 + ADR-034）；随后 `783a62ae` 按 T0 对码给它补 **5 条加注 + 1 个新守卫对（`shellReset.test.ts` / `columnKeys.freeze.test.ts`）**（`+27/−0`，**正文一字未改**），`a25ed2c6` 再补「⑥ 钉单源 + 回写 B15 授权」（`+5/−4`）。**ADR-034 已进 `docs/adr/README.md` 索引**（`docs-check` 的「索引覆盖完整 ✅」为此项）。⇒ **剩余**：**ADR-035 = L4 动效**仍顺延（批 6）；批 4 **未新增任何 ADR**。⚠️ 一并登记的后续项：ADR-034 的 §登记 `:115` 两条（会话详情头改粘性 / 笔记工具栏三层合并）**批 4 的 19 个任务无人承接** ⇒ 控制方裁决「由 T18 收口承接或按批次归属登记」⇒ **T18 的处置：登记为批 5（视图层）follow-up（不是批 4 的交付）**，见批 4 计划 §收口回写 §七。 |
| `docs/adr/ADR-010-gap-filling-ai.md` | **修订为退役** —— ✅ **批 1 已落（2026-09-11 裁决 / 2026-09-12 落地）**：状态转**已废弃** + 文内「退役修订」节，索引与交叉引用同步（**保留文件，不删**） |
| `docs/standards/line-limit-exemptions.md` | 纠偏 + 新拆文件登记 —— ✅ **批 1 收口态**：`--full` exit 0，`>600` **0** · 301–600 档 **123** · 登记条目 **123**；`app_commands.rs` 行的人工理由列已按实测更正为「**312 条**」。⚠️ 该表末尾的人工引用块（`app/src/ui/primitives/**` 42 个 ≤300 行文件）**不在生成器视野内**，本批已按 `countLines()` 逐值复核（42/42 一致），**改它不会被门禁发现、也不会被门禁保护**。**批 2 收口（2026-09-12）**：`app/src/App.tsx` **439 → 519 行**（Task 6/7/8 三次改同一文件），登记值已与实测同步 —— 收口时 `node scripts/line-limits.mjs --write` **无 diff**（前序任务已刷新），故批 2 的收口提交**不含**本文件；`app_commands.rs` 行实测 **478** 与登记值**逐字相等**（批 1 的「503 → ~478」预算已在其计划「收口回写」节结清，无矛盾）。 |
| `docs/standards/` | 新增动效规范章节（现对动效**零命中**） |
| `docs/product/requirements-pool.md` | REQ-201 修正（`update_fragment_group` 实际无调用方）· 新增 REQ 登记 |
| `docs/versions/v0.21.md`（或 v0.20.14） | 本系列交付记录 —— **实际落点：`docs/versions/v0.22.md`**（版本归属理由见该文件 §版本归属说明）；**批 0-A / 0-B / 批 1 已落**（批 1 = 「删除批」节，含交付/验收/规格漂移纠正/过程中纠正的计划错误/未做登记）；**批 2 ✅ 已落（2026-09-12）** = 「批 2 · 包体治理」节（同七段结构 + 瓶颈清单指针）· **批 3 ✅ 已落（2026-09-12）** = 「批 3 · 壳层落地」节（同七段结构；含 `tauri.conf.json` 的 **§10 额外审查**记录 —— T4 已执行，之前只留在 gitignored 的报告里，现已 durable） |
| ↳ 上格的就地加注（批 4 收口，2026-09-12；**上格原文一字未改**） | **批 4 ✅ 已落（2026-09-12）** = 「批 4 · 原语迁移」节（**同七段结构**：交付 / 验收（两条 + 八门禁终态）/ 规格漂移纠正 / 过程中纠正的计划错误（①–⑲）/ 未做登记（逐条带归属批次）/ 诚实代价 / 提交清单 `4905d4d8^..<收口提交>` **含左端点 = 49 个提交**）。**该节自带的首屏账、五类中间态与「只有接缝、没有纲领」声明**是本批最需要下游读到的三块。 |
| ↳ 上格的就地加注（批 5 收口，2026-09-12；**上格原文一字未改**） | **批 5 ✅ 已落（2026-09-12）** = 「批 5 · 视图层样板」节（**同七段结构**：交付 / 验收（三条硬约束 + 八门禁终态）/ 规格漂移纠正 / 过程中纠正的计划错误 / 诚实代价 / 未做登记（逐条带归属批次）/ 提交清单 `ad9d80d2^..` 至收口提交 **含左端点 = 31 个提交**）。**该节自带的三块**（三条硬约束的判据与变异体出处 · **首屏 100.49 kB + 懒 chunk 31 个的逐块台账** · B9 的「只有接缝、没有纲领」声明）是本批最需要下游读到的。**ADR 面**：批 5 **未新增任何 ADR**（`docs/adr/` 实盘最高仍是 **ADR-034**）⇒ **`docs/adr/README.md` 索引本批零改动**；**ADR-035 = L4 动效纲领与引擎仍顺延批 6**；批 5 的 ADR 动作只有**就地加注**（`ADR-033` §1/§4/§登记 三段 + `ADR-034` §登记 一段，**只加注、不改结论**）。 |

**提交策略**：批 0 拆成 13 个原子提交（3 条 ADR → 豁免表纠偏 → 拆 NotesPage/NoteListView → 拆 SessionDetailPanel → 拆 ClassroomPage → token 层 + z-index → 图标集 → 原语第一批 → 第二批 → 第三批 → 回写规格文档）；后续每批各自原子提交，遵循 Conventional Commits。

---

## 附：本设计的三个判断（供复审时质疑）

1. **缺的不是「更好的组件」，是缺失的两层** —— 原语层与视图层。131 个现存组件里 0 个死组件，职责基本清晰。
2. **「一个对象只有一种样子」是最大的产品税** —— 9 个域里 8 个如此，而体系域用它自己证明了多视图的价值。
3. **动效不是装饰，是状态的直接可视化** —— 四档墨度显示「机器有多确定」，剪报底纹显示「这句从哪来」，刻度生长显示「记忆有多牢」。**这三样别的笔记软件都没有。**
