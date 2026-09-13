# 批 7 未接线落地实施计划（L5：标签线 + 档位通道 + 撤下 IPC + `structuredBlocks` 逐导出裁决 + markdown 归一 + 拆件腾行数）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **本文件是「单文件双段」（7a + 7b）**：`## 波次总表` 之后是 **段 7a · 拆件与前置（T1–T12）**、**段 7b · 功能落地（T13–T22）**、`## 陷阱`、`## 待控制方裁决（已全部裁决）`、`## 诚实边界`、`## 收口回写八节`。**两段各自跑完整八闸**；**7a 不得以「全批收口」结束**（C7.1 逐字）。

**Goal:** 把规格 §1 L5 行 `:79/:82/:83` 的三件未落地义务与 §10 行 `:722` 的三条验收真正落地：**① B 桶 3 条从 IPC 撤下（保留内部函数，registry 313 → 310）· ② 档位通道「A 做完整」（`start_live_session` 加 tier + 记忆加 tier 字段 + 新增 `remember_video_profile_tier`，registry +1）· ③ 标签线「A 补完」（标签可写 + 标签色成对 + `tag_colors` 补种子/迁移）**；一并结清批 6 遗留的 **`structuredBlocks` 逐导出裁决**（C4）、**markdown 归一 4 套活 → 2 套活**（C10.1/C10.2）、**懒侧字节零门禁**（C9.6/C10.4）、**`[[ts:ms]]` 三缺二**（C9.2/C10.2/C10.3）与 **10 条补 UI 全做**（C10.5）。规格 §10 批 7 行的验收列逐字为：**「标签能写进去；档位选完真生效；`structuredBlocks` 已作出接线或删除的明确裁决」**。

**Architecture:** 双段。**段 7a = 拆件 + 前置 + 零产品风险落地**（`App.tsx` 599 → ≤550 · `structuredBlocks` 逐导出裁决 · 撤下 IPC 3 条 · 采集期拆件 `LiveActivityPanel` · 簇 A（`Surface` 两条）· `check-bundle-budget.mjs` 拆件 + 懒侧门禁 · 散文漂移 doc/comment-only 微单元 · 段门禁自证）；**段 7b = 功能落地**（`NoteMarkdown` 拆件 → `ChatMessageMarkdown` 并入 → `utils/markdownLine.ts` 合成 → `NotePreviewView` 表征测试 + 迁移 → `[[ts:ms]]` 三缺二 + 自动切三轨 → 标签线 → 档位通道 → 低置信第 2 点 → 规格章两篇 → 10 条补 UI → 全批收口）。**段内可并行、跨段串行**；**一切门禁与变异体实验一律串行**（C6.1：并行跑会让 vitest 与 cargo 两边各假红一条）。

**Tech Stack:** Tauri 2.11.5 · React 19.1 · TypeScript 5.8（`strict`，禁 `any`）· Vite 7.3.6 · Vitest 4.1.11（全局 `environment: "node"`；组件测试首行必须 `// @vitest-environment jsdom`）· Node 24（`scripts/*.mjs` 门禁）· **零新增依赖**（本批不装任何包）

**Spec:** [2026-09-11-frontend-redesign-design.md](../specs/2026-09-11-frontend-redesign-design.md)（**§1 L5 `:74-84`** · **§4.1 `:168`** · **§4.3 `:214-230`** · **§7.2/§7.3** · **§9 `:636-694`** · **§10 `:722`** · **§11-5 `:805-816` / §11-6 `:817-822` / §11-7 `:823-825` / §11-8 `:826` / §11-9 `:827-837` / §11-11 `:843-851`** · **§12 `:855-879`** · **§14 `:905-930`**）

**控制方裁决指针（硬输入，不许重新论证、不许削弱、不许绕过）:** **本地路径 `.superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/rulings.md`（C0–C10，共 416 行；本计划的最高行动依据）**。该目录整体 gitignored、**永不入库**，故此处**不给相对链接**（先例：批 4 计划曾因一条指进 `.superpowers/` 的相对链接让导出树 `docs-check` 必红，修复提交 `0228a013`）—— 需要读裁决的读者请在本地工作树按上述路径打开。同目录另有三份侦察（**已采信；凡与 `rulings.md` 或规格原文冲突 ⇒ 以 `rulings.md` + 规格原文为准，冲突逐条见 `### 表 6`**）：`recon-a-spec9-and-wiring.md`（601 行）· `recon-b-registered-followups.md`（661）· `recon-c-hard-constraints.md`（263）。

**🔴 本版最重要的一条：`§C10` 是控制方的自我更正，它取代 `§C9.15` 的形态选择**（`rulings.md:338-414` 逐字）。本计划**按 §C10 执行**：markdown 归一 = **两支手写 HTML 串生成器合成一支（`utils/markdownLine.ts`）+ `ChatMessageMarkdown` 并入 `NoteMarkdown` 后删除**，**终态 2 套活**；🔴 **禁止**把 `NotePreviewView` 的手写链换成 `react-markdown`（§C10.1 逐字：换 = 改 DOM 形态/样式/安全面，而它**无回归网**）。**`NoteMarkdown` 的 DOM 形态一个字不改**。

**输入材料（开工前五份，优先级即此序）**

1. **控制方裁决 `C0–C10`**（本计划的**行动依据**；每条的执行形态见 `## Global Constraints` 的 C 系列压缩表，**不许削弱、不许绕过**）
2. **本计划的 `## 实测基线`**（计划者在 `dev@681e73c6` 实跑四闸 + 逐文件 `countLines()` 亲测 + **控制方串行实测的八闸**；**下游任何任务都不得引用侦察里"批 6 收口"时点的读数**）
3. 规格对应节（上列 `Spec` 的全部节）
4. **格式母本**：[批 6 动效计划](./2026-09-12-frontend-redesign-batch6-motion.md)（2592 行；本计划的章节骨架、Global Constraints 写法、任务节格式、`### 每个拆分任务的统一作业模式`、`## 实测基线`、`## 待控制方裁决（已全部裁决）`、`## 诚实边界`、`## 收口回写八节` 全部照它）· 姊妹计划 [批 5 视图层](./2026-09-12-frontend-redesign-batch5-view-layer.md) · [批 4 原语](./2026-09-12-frontend-redesign-batch4-primitives.md) · [批 1 删除批](./2026-09-11-frontend-redesign-batch1-deletions.md)（`:206` 的「撤 IPC 时只删注册行」**已被证伪**，见 `### 表 6` 的 X1）
5. **`docs/versions/v0.22.md` 的批 3–批 6 四节**（交接项与「诚实代价」的写法；批 7 收口同七段结构）· **`.superpowers/sdd/DISPATCH-TEMPLATE.md`**（实施者纪律，最高优先）

---

## Global Constraints

- **本批范围（规格 §10 批 7 行逐字）**：`| **7 未接线落地** | 12 条补 UI（含 \`kb_search\` → ⌘K）· 标签线 · 档位通道 · B 桶 3 条撤下 IPC · **\`structuredBlocks\` 整模块存废**（批 1 控制方裁决：接线（4 个导出全接入、真实置信度渲染「低置信点线」）**或**删除（连同类名与规格/登记表一并移除）二选一，**批 1 未决前不得删**） | **标签能写进去**；**档位选完真生效**；**\`structuredBlocks\` 已作出接线或删除的明确裁决** |`（规格 `:722`，**本计划者逐字复核**）。
- **★ 本批的 registry 净值（由 C0.1 + C0.2 推出，**不靠转述**）**：开工 **313**（控制方串行实测 + 本计划者实跑，两条独立读数一致）**− 3**（C0.2 行 31 撤下 `create_session` / `add_session_segment` / `add_session_ocr_block`）**+ 1**（C0.2 行 34 新增 `remember_video_profile_tier`）＝ **311**。
  - 🔴 **中间值取决于任务顺序** ⇒ **每个任务报告必须同时写「本任务期望值」与「为何」**，不得只抄一个数（C0.3 逐字）。
  - 🔴 **批 7 收口判据 = `311 / 311 / 0`**；**7a 段的期望中间值 = 310 / 310 / 0**（撤下落地后、档位通道未做时）；**7b 收口 = 311 / 311 / 0**。
- **★★ 本批的四件规格义务（C0.2，**不得缩水，缩水须回报控制方**）**
  1. **撤下 IPC 3 条**（行 31 逐字「撤下但**保留内部函数**」）⇒ **摘属性 + 删注册行 + 保留函数体**；registry 313 → 310 ⇒ 全批 311。
  2. **档位通道 A 做完整**（行 34 逐字四段）⇒ `start_live_session` 加 tier + 记忆加 tier + **新 `remember_video_profile_tier`** + 读端接线。
  3. **标签线 A 补完**（行 35 逐字三件）⇒ 标签可写 + 标签色成对 + **`tag_colors` 补种子/迁移**。
  4. **`structuredBlocks` 明确裁决**（§10 `:722` 验收列）⇒ 按 §C4 的**逐导出裁决**执行，并**在规格 §10 行内写明这是控制方的明文授权**（否则批 8 治理收口会按规格字面判为未决）。
- **★ 本批的非目标清单（违反即任务失败）**
  1. **不做 `docs/tech-debt/` 的任何动作**（C7.3 / C9.11）：它是**用户所有**的决定 ⇒ **批 7 不处置它，也不因此不开工**；全批 `git status --porcelain` **必须始终只有 `?? docs/tech-debt/` 一个条目**；`docs-check` 基线 = **280/180（工作树）**；任何**提交树/导出树**复核读到 **279/179** 时，差额**必须**逐字归因到 C7.3，**不得**当成本批的缺陷；**不得**声称该文档由本批创建。
  2. **不做音频两条**（C7.3 / Q15）：`AudioStoragePanel` 死 UI · 删会话不删音频 ⇒ `v0.22:689` 逐字「**产品裁决**」⇒ **只在规格回写里登记为「待产品裁决」**，不许留成无主事项。
  3. **不开 B1/B2 例外**（C2.1 / Q9）：`NON_MIGRATED_14` 的 14 个文件本批**一律不动**，包括**不得**以「子组件间接引用」的形式把 `ui/primitives` 引进去。
  4. **不得引入新的 `position:"fixed"` ∧ `inset:0` 文件**（C2.1）—— 那会改 `CROSS_LINE_34`，而**唯一的判据文件恰 300 行、余 0、改不动**。浮动层一律用 `absolute` 锚定（先例 `NoteHeaderActions.tsx:62-65`）。
  5. **不打开 `...rest` DOM 透传**（C9.4）：簇 A 的 ② 走**受控槽**；若某处证明受控槽表达不了，**逐处登记 `no-passthrough-*`**，**不得**顺手打开透传。
  6. **不做「审校模式」/ `ink-4` 的实现**、**不做「带证据三轨」的实现**（C9.17 / C9.18 / Q14）：**批 7 只交规格**，实现转批 8。
  7. 🔴 **禁止**把 `#3`/`#4` 两支手写 HTML 串生成器换成 `react-markdown`；**`NoteMarkdown` 的 DOM 形态一个字不改**（C10.1 逐字）。
  8. 🔴 **不得新增 `NoteViewSlot` 的可选槽**（C10.3 逐字：批 6 已裁，控制方**不覆盖**）。
  9. **不动 `docs/product/ui-ux-system.md` / `theme.md`**（§14 `:913` 仍留批 8）；**不动 `docs/adr/`**（本批零 ADR 动作；`ADR-019` 缺号**不补、不复用、只登记**）。
  10. 🔴 **不得写「预算值」式的乐观懒侧基线**（C10.4 逐字）：只许写**今天的实测冻结值**（**36 chunk / 698.86 kB**，`≤` 只许降）。
- **★★ C0–C10 压缩表（每条一行：编号 + 裁决要点 + 本批执行形态；结论一字不改）**

  | # | 裁决要点（压缩，不改结论） | 本批执行形态（任务 / 判据 / 登记） |
  |---|---|---|
  | **C0.1** | 判定口径：定义侧 = `#[tauri::command]` 属性（`ATTR` 正则 + 其后首个 `fn`），注册侧 = **非空** `generate_handler![…]` 条目 ⇒ 🔴 **撤下 IPC 必须两处同改**（只删一半必红） | **T4**：三条各「摘属性 + 删注册行」同一次改动内 |
  | **C0.2** | 规格 §1 L5 三行**逐字**：行 31「保留内部函数」· 行 34「A 做完整（含新命令）」· 行 35「补种子/迁移」 | **T4**（保留函数体）· **T19**（档位四段）· **T18**（标签三件） |
  | **C0.3** | registry 批 7 净值 = **311**；中间值随顺序 ⇒ 每任务报告写「本任务期望值 + 为何」 | **每任务报告的固定字段** |
  | **C0.4** | `tag_colors(tag PK, color NOT NULL)` · 数据层 4 方法齐备 · **零种子零回填** ⇒ 「补种子/迁移」的**唯一可实现形态 = 幂等回填**（去重标签 → 确定性色板，等价 `INSERT OR IGNORE`，不吃用户已设色） | **T18** 的 `tag_colors` 幂等回填 + 4 点内存库单测 |
  | **C0.5** | 标签编辑的**零守卫冲突落点** = `components/NoteHeaderActions.tsx`（122 行 · 不在 `NON_MIGRATED_14` · **不在** 35 文件普查 · 已有锚定浮层与颜色入口先例） | **T18**：落点 = `NoteHeaderActions.tsx` + 新兄弟组件 |
  | **C0.6** | 新文件门槛：**按钮一律 `Button` 原语（大写 B）· 禁止 `const *Btn*` 常量 · 禁止内联 `<svg>`**；`buttonMigration` 的 `MIGRATED` 是**固定 35 文件名单** ⇒ **新文件不进普查** | **T1/T6/T13/T18/T19/T20/T22** 的全部新文件 |
  | **C0.7** | `313 → 311` 之后**散文位点**：`line-limit-exemptions.md:45` **必改**；规格 `:824` / `ADR-010:107` / `ADR-035:106` / `v0.22:123` **不改**（历史记录） | **T11** + **T21** |
  | **C1.1** | 撤下形态 = **摘属性 + 删注册行，函数体保留**；**保留原名 + 去属性**（**不得**改 `*_inner`）；doc comment 加 `@ai-context` 一行；`dead_code` **先测量再写结论**（`cargo build` 实测）；clippy 基线对拍（批 6 = lib warnings **15**）；**零引用须自己重跑** | **T4** |
  | **C2.1** | 标签线落点 = `NoteHeaderActions.tsx` + **一个新兄弟组件**；**不开 B1/B2 例外**；**不得**引入新的 `position:"fixed"` ∧ `inset:0`；浮动层用 `absolute` 锚定 | **T18** |
  | **C2.2** | 写端三条命令**各须 ≥1 个生产调用点**（今日各 0）；「标签色成对」⇒ UI **同时**提供**设色**与**清色**；验收必须是**可复现的端到端**（加标签 → 重读库 → 标签仍在） | **T18** |
  | **C2.3** | `tag_colors` 补种子/迁移 = **幂等回填**；硬约束 ① 幂等 ② 不覆盖用户已设色 ③ 不改 schema 主键语义 ④ 内存库单测覆盖四点；**证明不可行须回报控制方，不得静默降级** | **T18** |
  | **C2.4** | 过滤面板必须真的能用：`NoteListToolbar.tsx:82` 的 `{allTags.length > 0 && (` ⇒ 写进标签后面板出现且**色与 `tag_colors` 一致**（读端已在） | **T18** |
  | **C3.1** | 档位通道**四段全做**；🔴 **与「采集态热切换 `update_live_profile`」严格区分**（那条已通）；新命令走 `#[tauri::command]` + `generate_handler!` **成对**；`app_commands.rs` 属 AGENTS.md §10 **额外审查**文件 ⇒ 报告点名；验收 = **选完档位 → 关闭并重开会话 → 档位仍在**（真机不可测则写机器判据代替 + 登记诚实边界） | **T19** |
  | **C4.1/C4.2/C4.3** | `structuredBlocks` **逐导出裁决**：`escapeHtml` **只摘 `:11` import + `:13` 再导出**（真源 `utils/html.ts:11` 一个字不动；🔴 **行号已按 `### 表 6b` 的 E-1/E-2/E-6 勘误**，原写 `:4`/`:6`/`utils/html.ts:4`）· `renderLatex` **删** · `renderMarkdownTable` **删** · `lowConfidenceClass` **留 + 加宽到 ≥2 生产调用点**；🔴 **规格 §10 行内必须写明这是控制方明文授权**；`katex` 副本去向**必须用真实构建证明**；`SessionRawView.test.tsx` 的既有断言改动**已追认授权**；规格加注**补上漏登的第 4 套活渲染器** | **T2/T3**（删三件 + 析出）· **T17**（低置信第 2 点）· **T21**（规格授权逐字） |
  | **C5.1** | ✅ **允许**同步更新六棘轮域的冻结值/逐文件表（前提：由本任务真实改动导致 + 报告给逐条 diff）· 🔴 **禁止抬高**任何棘轮（`FROZEN_*` 只许降或持平）· **禁止只改常量不动逐文件表** · **禁止把守卫改窄** | 全部任务；**每任务卡的「冻结值预算表」** |
  | **C5.2** | `dialogMigration.e.test.ts` 恰 **300 行、余 0** ⇒ 本批**默认不动**；确需改 ⇒ **必须先拆件**（三张名单表抽成数据模块），**先拆后改**，拆件单独成微单元 + 独立评审 | **全批零改动**（🔴 **本批无此需要**；若确被迫 ⇒ 按 C5.2 **先拆后改**并**回报控制方** —— 原指向「`## 待控制方裁决` #7」是**错指针**，#7 是 `get_decision` 的 H7 项） |
  | **C5.3** | `textBaseline.ts:19/:25` 与 `surfaceBaseline.ts:47-49` 的散文数字**已过期，批 7 不得引用**；真值以 **常数 == Σ表 == 独立复算** 三者一致为准：弱化灰 **63/43** · 边框 **223/107** · 越界圆角 **260/108** · 字号 **551/120** · 阴影 **24/24** · 三红 **113/66**；✅ 允许并鼓励**独立 comment-only 微单元**修正 | **T10** |
  | **C6.1** | 🔴 **门禁必须串行跑**（并行 ⇒ 两边各假红一条）；**任何「并行跑出来的红」不得当缺陷登记** | 全部任务；**7a / 7b 各自的收口**（T12 / T22） |
  | **C6.2** | 开工基线逐条对账（**控制方串行实测**）；**批 7 期望终态 = registry 311/311/0**，其余八闸**只许更好或持平**，任何回升逐条解释 | **`### 表 1`** + **T12 / T22** |
  | **C6.3** | 规格回写**必须做且不改历史原文**：§10 批 7 行（含 C4.1 逐导出授权逐字）· §11-7 批 7 收口注 · §12 markdown 归一去向 · §9 表内 #14/#46 状态更正 · 补上第 4 套活渲染器 · 更正 §9 `:694` 的「仅 `lib.rs` 的 `generate_handler!`」 | **T21** 六件逐条 |
  | **C6.4** | 诚实边界：真机/WebView2 冒烟由用户裁决**跳过** · 像素/观感类一律未测（归批 8）· 「档位跨会话记住」无真机则**以机器判据代替并登记代替品** · 懒侧 katex 消失**必须**以真实构建证明，否则写「未判定」 | **`## 诚实边界`** |
  | **C7.1** | **7a** = 拆件 + §C1/§C4 落地 + 一切已裁决的零产品风险项；**7b** = 标签线 + 档位通道 + markdown 归一 + `[[ts:ms]]` + 卡片流芯片 + 其余补 UI；**7a 不得在 7b 之前收口全批**；两段门禁读数**各自完整** | **波次总表** |
  | **C7.2** | ① **逐项映射必须完备** ② 🔴 **markdown 归一钉死在 7b 之内**，**禁止第三次外推给批 8** ③ **拆件范围必须来自「逐项文件触达普查」** | **逐项映射表** + **文件触达普查 → 拆件清单** |
  | **C7.3** | 音频两条 = 产品裁决（非目标 2）· `docs/tech-debt/` = 用户裁决（非目标 1） | **T21** 登记 |
  | **C9.0** | 🔴 「批 7」**重载消歧**：全仓 93 处含「批 7」，**~80 处属另一条已落地批次** `REQ-316 / v0.20.12 批 7`；**~13 处是本批预留点**。引用 grep 结论**必须**附「来源批次判定」 | **`## 陷阱` #B10-①** |
  | **C9.1** | 「12 条补 UI」实做面 = **10 条**，且**必须逐条列名**；规格 §10 的「12」**不改**；在 §9 表内对 `kb_search`/`update_fragment_group` 加**状态更正注** | **T20** 十条逐条 + **T21** 状态更正注 |
  | **C9.2** | `App.tsx` 拆件在 **7a 内一次做完**，范围**必须覆盖** `{value,key}` 与 `[[ts:ms]]` 两项全部已知需求，**目标 ≤ 550 行**；「一次定够」判据 = 拆后 ≤550 **且**本批剩余条目**没有任何一条**需再往 `App.tsx` 加行 | **T1** |
  | **C9.3** | 归一对象是**渲染器**，**不是** HTML 串生成器；🔴 **必须纳入** `NotePreviewView.tsx` 的第 4 套活渲染器 ⇒ **先补测试面再改**；🔴 **1.2 钉死在 7b 之内** | **T16 → T17**（= C10.1 的顺序） |
  | **C9.4** | 簇 A **两条都做、7a 内做完**；Surface ① 真·可解锁 **4 处**（`:295` 的边框是语义色 ⇒ **实际入账 3 处**）；`...rest` vs 受控槽 ⇒ **本轮按「受控槽」做**；**只信常数**（边框 223 · 圆角 260 · 阴影 24 · 弱化灰 63/43 · 三红 113/66） | **T7** + **C10.8**（21 只作量级） |
  | **C9.5** | 🔴 `<Surface>` 的**新增登记制 = 合法机制，不是放宽**：加一条**不带 `legacy`** 的行（`count` **恰等于实测**、`reason` ≥12 字、键按字典序）+ **同一提交**抬高 `FROZEN_SURFACE_TAG_TOTAL` 到 Σ 登记值 **且**同步 `SURFACE_TAG_ANCHOR.entries`；🔴 **禁止**抬高 9 行 `legacy` 中任何一行的 `count`、禁止抬高 `SURFACE_TAG_FROZEN_LEGACY_COUNT`、**禁止不登记而抬总数**、禁止抬高任何 `FROZEN_*_BY_FILE` 逐文件上限 | **T7** |
  | **C9.6** | 懒侧字节门禁：① **不改**首屏语义 / **不改** `BUDGET_KB` / **不把懒侧并进首屏预算** ② 形态 = **清单等式 + 逐族上限**（键用**族前缀**）+ **懒侧总 gzip 上限**（只许降）③ 🔴 **门禁必须自证有牙**（变异体**真的**改字节 ⇒ 必须红在**具名断言**上）④ ⚠️ `check-bundle-budget.mjs` **299 行（余 1）** ⇒ **先拆件再加门禁** ⑤ 拆件必须**逐字保持**首屏读数 | **T8**（拆件）→ **T9**（门禁） |
  | **C9.7** | 「等号断言」的适用范围：**普查** ⇒ `toBe` 等式；**棘轮** ⇒ 保留 `<=`；🔴 **`nativeButton` 的总量断言是刻意设计的棘轮，不得改成等式**；⇒ 对 **surface / loading / nativeButton 三处逐处声明**该指标是普查还是棘轮 | **T9** 的逐处声明表 |
  | **C9.8** | `buttonMigration.test.ts` 的 35 文件表：往那 35 个文件里加任何 `<Button>` ⇒ **必须同提交同步 `BUTTON_SHAPES[rel]` 与 `MIGRATED_SITES` 总数**（报告给逐条 diff）；🔴 **禁止**把文件从 `MIGRATED` 挪进 `EXCLUDED`；🔴 **禁止**改 `:237` 的常量白名单 | **T18/T20**；本批预计 **0 处触碰**（逐任务核算） |
  | **C9.9** | `CommandPalette.kb.test.tsx:173-181` **授权「只增不减」的改写**；报告须给**前后逐字对照**；「5 vs 10」**必须按 10 记**并注明「5」是子集 | **T1**（新增 `focusSeekMs`） |
  | **C9.10** | 「规格前置」**算批 7 交付**；但**必须可机器核对**（同一提交带「改了哪几行、原文是什么」的逐字对照 + `docs-check`/`line-limits` 读数同批给出）；**只写意图不给对照 = 不算交付** | **T20 / T21** |
  | **C9.11** | 起点脏树见 C7.3（**不处置、不阻塞**） | 非目标 1 |
  | **C9.12** | 🔴 **新落点的冻结值预算法**：每个任务卡**必须先**给出「本任务触碰的冻结键 + 现值 + 上限 + 是否变红」；**算不出这张表 = 计划不合格** | **每个任务卡的「冻结值预算」表** |
  | **C9.13** | `nativeButton.ratchet.test.ts:25` 与 `:182` 的散文「394」**已过期**（真值 **393**）⇒ 并入 comment-only 微单元，**只改散文、不动常数与逐文件表** | **T10** |
  | **C9.14** | `SPLIT_MOVES` 今日**只剩 1 条**；新增拆件搬运按同形态追加；终止搬运**删条目 + 留理由** | **T1 / T6 / T8 / T13** |
  | **C9.16** | 采集期「逐段显影」**做**：**7a** = 纯搬迁拆件（`LiveTranscriptStream.tsx` / `LiveOcrPreview.tsx`，主件 ~250–300）；**7b** = 挂 `useRevealChoreography` + 每行 `ref`；会同动**三处台账**；⚠️ 主件**无同名测试文件** ⇒ 回归证据只能是「门禁读数逐字持平 + 渲染结构逐字对照」，**不得**声称「有测试覆盖」 | **T6**（拆）→ **T20**（挂动效） |
  | **C9.17** | 「带证据三轨」⇒ **批 7 只交规格章，实现转批 8**；🔴 规格里必须逐字写「**本批只交规格，实现未做**」，**不得**出现「笔记 3 视图已交付」；`NoteEvidenceTrack*` 全仓 **0 命中** | **T20** |
  | **C9.18** | 「审校模式」/ `ink-4` ⇒ **批 7 只在规格 §4.3 里定义这个模式，实现转批 8**；🔴 **不得**用「做了 `lowConfidenceClass` 就等于做了环境层第 ③ 件」合并结案 | **T20** |
  | **C9.19** | **拆件搬运的台账守恒律（通用）**：① 拆件提交**只搬不改** ② `FROZEN_*_BY_FILE` 键**随代码走**（总量不变，给**逐键 diff**）③ `SPLIT_MOVES` 守恒 ④ 守恒无法成立 ⇒ **不是纯搬运** ⇒ 另起提交或回报控制方 ⑤ **拆件提交的门禁读数必须与拆前逐字持平** | **T1 / T6 / T8 / T13** 四条拆件任务 |
  | **C10.1** | 🔴 **归一形态 = 只做「两支手写链合成一支」+「#2 并入 #1」**：新建 **`utils/markdownLine.ts`**（#3 `refineDiff.ts:78 mdLineHtml` 107 行 + #4 `NotePreviewView.tsx:40 renderMarkdown` 346 行 → **合成一支**）；**#2 `ChatMessageMarkdown`（52）并入 #1 后删除**；**#5** 按 §C4.2。**终态 = 2 套活**。<br>🔴 **禁止**换成 react-markdown · **`NoteMarkdown` DOM 形态一个字不改** · 🔴 **`NoteMarkdown.tsx` 295/300（余 5）⇒ #2 并入前必须先拆 `NoteMarkdown.tsx`** · 🔴 **预授权的既有断言改写**：`NoteMarkdown.test.tsx` · `noteViews.test.tsx:281-282`/`:285` · `utils/html.test.ts` 的 5 条 `renderTimestampAnchors`；**必须改成等强或更强，不许放宽** | **T13**（拆 `NoteMarkdown`）→ **T14**（#2 并入）→ **T15**（`markdownLine`）→ **T16**（表征测试）→ **T17**（#4 迁移） |
  | **C10.2** | B1.8 修在**共享行渲染器里一处**（ms 捕获 + 事件委托 `closest('[data-ts-ms]')`），使 **#3 与 #4 同时**可点；🔴 `NotesPage.test.tsx:165` 的选择器要改成**带 `data-*` 的定名选择器**（一并授权）；✅ **`RefineWorkbench` 侧不再算残余**；**本批不得**再出现「`[[ts:ms]]` 只通一半」的新残余 | **T15**（行渲染器改一处）→ **T17**（容器侧事件委托 ×3） |
  | **C10.3** | **深链到达后自动切三轨视图 ⇒ 做**（不切则「定位到 ms」不可感知）；🔴 **只许走既有 `views/registry.ts` / `shell/columnRegistry.ts`**，**不得**新增 `NoteViewSlot` 可选槽；**`NoteCardFlowView` 第三缺口** ⇒ **先查既有 context/registry 能否不经 `NoteViewSlot` 传到**；**能 ⇒ 本批做**；**不能 ⇒ 登记残余 + 写明理由** | **T17** |
  | **C10.4** | 懒侧门禁基线**冻结为今天实测的 36 chunk / 698.86 kB**（`≤`、只许降）；🔴 **禁止**写一个比今天更小的乐观「预算值」（会立刻红） | **T9** |
  | **C10.5** | 10 条补 UI ⇒ **全做（10/10）**，无落点者**必须由计划先给出「展示面设计 + 验收判据」**；容量不足时牺牲**新造展示面**的条数并回报控制方，**不许**牺牲标签线 / 档位通道 / markdown 归一；⚠️ `app_commands.rs` 与**任何** IPC 改动都属 §10 ⇒ 任务卡必须点名 | **T20** 十条逐条 |
  | **C10.6** | 散文漂移 ⇒ **独立 doc/comment-only 微单元**（单独提交、不含任何代码改动），清单 **6 项**；🔴 `line-limit-exemptions.md:45` 的「313 条」→ **311** 必须**与 registry 改动的提交同批**；🔴 **历史记录一律不改** | **T10**（1–5 项 + `:45` 的代码侧半）+ **T11 合并进 T4/T19 的提交**（见 T11 的形态说明） |
  | **C10.7** | **Q1–Q20 全部有裁决，无遗留未决项**；计划里若再出现「待控制方裁决」条目，**必须是底稿未覆盖的新问题**，并附「为何底稿未覆盖」 | **`## 待控制方裁决（已全部裁决）`** 的第 3 列 |
  | **C10.8** | 🔴 **Surface ② 的「21」只作量级预期，不得当立账依据**：① 任务卡**必须先自测出一份「逐处名单」**（文件 + 行 + 原写法 + 目标形态），仪器须带**正控/负控**，并**修正批 4 仪器的两个缺陷**（`tmp/t17b/scan.mjs:68` 遇 `;` 提前返回 · `:86` 的 bg 谓词不认 `backgroundImage`）② `FROZEN_SURFACE_TAG_TOTAL` 与 `SURFACE_TAG_ANCHOR.entries` **只许按「实测登记条目数」同步**——**禁止**预先把总数抬到某个预测值 ③ **21 只用于排期量级**，不得写成验收数字，也不得写进任何冻结常数 ④ 若实测残值 ≠ 21，**按实测走**，并逐条给出与 21 的差额归因 | **T7** |
- **★ 行数纪律（唯一有效口径）**：单文件 **≤300 行**（**全部行数、含空行**），口径 = `[System.IO.File]::ReadAllLines($p,[Text.Encoding]::UTF8).Count` == `scripts/line-limits.mjs` 的 `countLines()`。⚠️ **绝不使用** `Get-Content`（本机 PS 5.1 按 GBK 解码，**少算可达 56 行**）· `Measure-Object -Line`（只数非空行）· 字节 `0x0A` 计数（末尾不带换行的文件少算 1，本仓有 8 个这样的源文件，含 `NotesPage.tsx`）。
  - ⚠️ **门禁视野**：`scripts/line-limits.mjs:23` 的 `SOURCE_EXT = /\.(ts|tsx|rs)$/` ⇒ **`.css` 与 `.mjs` 都不在行数门禁视野内**。⇒ 本计划凡写「新文件 ≤300」处，一律读作「**`.ts`/`.tsx`/`.rs` 新文件 ≤300**」；`.css`/`.mjs` 只给**预算**，超预算时**如实登记为「门禁视野外」**。
  - **新 `.ts`/`.tsx`/`.rs` 文件 ≤300 且不许 `--write` 登记**（301–600 档要登记；>600 必须硬拆）。`FROZEN_OVER_LIMIT` 当前为空（`>600` 零容忍，实测 0）。
  - 🔴 **计划里每个任务给的「预算行数」是估算，不是绑定约束**；**绑定约束是 ≤300 且不新增豁免登记**。⇒ 实施者**不得为落进预算而删判据**。

  **★ 贴边文件表（本计划者 2026-09-13 在 `dev@681e73c6` 逐文件实测，口径 = `countLines()`）**

  | 文件 | 实测 | 余量 | 本批纪律 |
  |---|---:|---:|---|
  | `app/src/App.tsx` | **599** | 对 600 **余 1** | 🔴 **T1 唯一写者**：拆到 **≤550**（C9.2） |
  | `app/src/ui/primitives/dialogMigration.e.test.ts` | **300** | **0** | 🔴 **禁止再碰**（C5.2）；本批**零改动** |
  | `app/src/components/RefineLaunchDialog.tsx` | **299** | 1 | ⚠️ **T20 可能动它**（`refine_session` #42 的宿主）⇒ **净增必须 = 0**（就地改写） |
  | `app/src/ui/primitives/style-seams.test.ts` | **299** | 1 | 🔴 **T7 唯一写者**且**净增必须 = 0** |
  | `app/src/views/session/useTriTrackAlign.test.tsx` | **299** | 1 | 本批零改动 |
  | `app/src/components/KnowledgeDetailPanel.tsx` | **298** | 2 | ⚠️ **T20 可能动它**（`update_knowledge_system` #47 的宿主）⇒ **净增 ≤ +2** |
  | `app/src/components/session-detail/useRevealChoreography.test.tsx` | **298** | 2 | ⚠️ **T20 要动它**（采集期落点）⇒ **净增 ≤ +2，设计为 0** |
  | `app/src/components/SessionListPanel.tsx` | **298** | 2 | ⚠️ **T20 可能动它**（`delete_session_images_all` / `finish_session`）⇒ **净增 ≤ +2** |
  | `app/src/hooks/useLiveCaptureControl.tsx` | **298** | 2 | ⚠️ **T19 要动它** ⇒ **净增 ≤ +2，设计为 +1** |
  | `app/src/shell/TopBar.test.tsx` | **298** | 2 | 🔴 **本批零改动**（批 6 已余 2） |
  | `app/src/components/ClassroomCapturePanel.tsx` | **297** | 3 | 本批零改动 |
  | `app/src/components/FeedFragmentList.tsx` | **297** | 3 | ⚠️ **T20 可能动它**（`update_fragment_group` #46）⇒ **净增 ≤ +3** |
  | `app/src/components/review/useRevealMemory.test.tsx` | **297** | 3 | 本批零改动 |
  | `app/src/types/ai.ts` | **297** | 3 | 本批零改动 |
  | `app/src/ui/primitives/ConfirmDialog.test.tsx` | **297** | 3 | 本批零改动 |
  | `app/src/ui/primitives/textBaseline.ts` | **297** | 3 | ⚠️ **T10 只改散文行** ⇒ **净增必须 = 0**，改后必须仍 **297** |
  | `app/src/views/session/SessionTriTrackView.tsx` | **297** | 3 | ⚠️ **T17/T20 可能动它** ⇒ **净增 ≤ +3** |
  | `app/src/components/confirmMigration.test.tsx` | **296** | 4 | 本批零改动 |
  | `app/src/ui/primitives/emptyStateRatchet.test.ts` | **296** | 4 | 本批零改动 |
  | `app/src/ui/primitives/Modal.test.tsx` | **296** | 4 | 本批零改动 |
  | `app/src/ui/primitives/style-contract.test.ts` | **296** | 4 | ⚠️ **T7 可能动它**（若改联合枚举）⇒ **净增 ≤ +4** |
  | `app/src/components/NoteMarkdown.tsx` | **295** | 5 | 🔴 **T13 必须先拆它**（C10.1 逐字）⇒ 拆后须留 ≥ **+25** 头寸（#2 并入的落点） |
  | `app/src/pages/NotesPage.tsx` | **295** | 5 | ⚠️ **T17 要动它**（`onOpenSessionAt` 已在 `:273`）⇒ **净增 ≤ +5，设计为 0** |
  | `app/src/views/note/noteViews.test.tsx` | **295** | 5 | 🔴 **T14 要动它**（markdown 站点断言）⇒ **净增 ≤ +5** |
  | `app/src/components/notes/NotesReadingColumn.tsx` | **294** | 6 | ⚠️ **T17 要动它**（槽对象 / 包装件）⇒ **净增 ≤ +6** |
  | `app/src/components/session-detail/SessionViewHost.test.tsx` | **293** | 7 | 本批零改动 |
  | `app/src/build/manualChunks.test.ts` | **292** | 8 | 本批零改动 |
  | `app/src/motion/engine.guard.test.ts` | **287** | 13 | 本批零改动 |
  | `app/src/components/review/ReviewSessionPanel.tsx` | **284** | 16 | 本批零改动 |
  | `app/src/views/architecture.guard.test.ts` | **260** | 40 | ⚠️ **T17 可能动它**（若触 A2④ 的 typeEdges）⇒ **逐字复核后若无需改则零改动** |
  | `app/src/ui/primitives/nativeButton.ratchet.test.ts` | **265** | 35 | ⚠️ **T10 只改两处散文** |
  | `app/src/ui/primitives/surfaceBaseline.ts` | **261** | 39 | ⚠️ **T6 → T7 → T10** 三任务串行 |
  | `app/src/ui/primitives/surfaceResidual.ts` | **184** | 116 | **T7 唯一** |
  | `app/src/ui/primitives/statusLineRatchet.test.ts` | **191** | 109 | 本批零改动 |
  | `app/src/ui/primitives/motion-coverage.test.ts` | **186** | 114 | ⚠️ **T17** 若新增 `.ed-*` 名 ⇒ 逐条核对（**本计划设计为新增 0 个基类**） |
  | `app/src/components/LiveActivityPanel.tsx` | **513** | 已登记 301–600 档 | 🔴 **T6 要拆它**（C9.16）⇒ 拆后主件 ~250–300 |
  | `app/src/components/NotePreviewView.tsx` | **346** | 已登记 | 🔴 **T16 补表征测试 → T17 迁移渲染链**（净减） |
  | `app/src/components/session-detail/SessionRawView.tsx` | **199** | 101 | ⚠️ **T2 要动它**（import 换源）+ **T17 可能加第 2 个调用点** |
  | `app/src/utils/refineDiff.ts` | **107** | 193 | ⚠️ **T15 要动它**（`mdLineHtml` 迁出 + 保留 re-export 或改调用点） |
  | `scripts/check-bundle-budget.mjs` | **299** | 1（`.mjs` **不在门禁视野**） | 🔴 **T8 先拆件再加门禁** |
  | `app/src-tauri/src/app_commands.rs` | **479** | 已登记 | ⚠️ **T4 唯一写者**（−3 行）+ **T19 同文件 +1 行** ⇒ 两任务串行；`:45` 的散文数字**手工同步**（T10/T11） |
  | `app/src-tauri/src/db_migrations.rs` | **573** | 已登记（距 600 余 27） | ⚠️ **T18 可能动它** ⇒ **优先放 `db_colors.rs`** |
- **★ 门禁基线表（`dev@681e73c6`；标注「控制方串行实测」的八条**逐字取自 `rulings.md` **§C6.2 的「开工基线」**（懒侧那一条另见 **§C10.4** 的冻结值），标注「计划者实跑」的两条由本计划者本轮实跑）**

  | 门禁 | 基线 | 出处 |
  |---|---|---|
  | `node scripts/line-limits.mjs --full` | exit 0 · **`>600` 0 · 301–600 档 122 · 登记条目 122** | **控制方串行实测** + **计划者实跑**（两条独立读数**逐字一致**） |
  | `node scripts/docs-check.mjs` | exit 0 · **扫描 280 / 检查 180** | **控制方串行实测** |
  | `node scripts/check-command-registry.mjs` | exit 0 · **定义 313 / 注册 313 / 重复 0** | **控制方串行实测** + **计划者实跑**（一致） |
  | `cd app; npx tsc --noEmit` | **0 错** | **控制方串行实测** |
  | `cd app; npx vitest run` | **221 文件 / 2132 用例 / 0 失败 / 0 skip** | **控制方串行实测** |
  | `node scripts/check-bundle-budget.mjs --no-build` | exit 0 · **首屏 103.60 kB gzip（余 96.40）** · **懒 chunk 36 个 / 698.86 kB** | **控制方串行实测**（= C10.4 的冻结值） |
  | `node scripts/bundle-eager-graph.mjs` | exit 0 · **103 文件（源 89 + CSS 14）/ 7 包**（**结论口径 = TS-API 真实边 75 源文件 / 4 包**） | **控制方串行实测** |
  | `cd app/src-tauri; cargo test --test app_lib_tests` | exit 0 · `running 2335 tests` → **`2329 passed / 0 failed / 6 ignored`** | **控制方串行实测** |
  | `cd app/src-tauri; cargo clippy --all-targets` | error **0** · lib warnings **15 = 基线** | 批 6 收口读数（本批须对拍**集合差异**） |
  | `git status --porcelain` | **仅 `?? docs/tech-debt/` 一行** | **计划者实跑** |
  | `git rev-parse --short HEAD` | **`681e73c6`**（分支 `dev`） | **计划者实跑** |

  > 🔴 **控制方已自己串行跑完八闸**（`tmp/ctl-probe/gates-serial.mjs`，全部 exit 0）⇒ 上表就是**开工基线**；**7a / 7b 的收口（T12 / T22）必须在无并发的独占窗口逐条真跑**并与本表逐条对账。
- **★ 每条读数必须带出处与时刻**：任何「前后对比」的首屏读数都必须写明 `app/dist` 的 **mtime + 对应提交 sha**；`check-bundle-budget.mjs` **不打印 mtime** ⇒ **mtime 由执行单元自采**：`(Get-Item app/dist/index.html).LastWriteTime`（recon-c 实测当前值 = `2026-09-13T05:10:24.836+08:00`，**未重建**）。
- **★ 真实构建的取锁协议（本仓**没有**工具级锁 —— 这是单元约定）**
  - 事实（**实测**）：`scripts/check-bundle-budget.mjs` **无任何锁机制**；全仓 `**/build.lock` **0 命中**。批 4/5/6 报告里的「取锁」是**并行单元之间的人工约定**。
  - 约定（照批 4/5/6 沿用）：
    ```powershell
    $lock = ".superpowers\sdd\2026-09-12-frontend-redesign-batch7-unwired\tmp\build.lock"
    New-Item -ItemType File -Path $lock -ErrorAction Stop   # 已存在即抛 ⇒ 占用则退避重试 30s × ≤6
    try { <真实构建 + 判据> } finally { Remove-Item $lock -Force }
    ```
    取不到锁**不许硬跑**。⚠️ 锁文件住 `.superpowers/**`（gitignored）⇒ 不污染工作树。
- **★ 首屏/可达性的判据形态（一律三件套，永不使用裸绝对数）**：① 工具原始读数 ② **Δ（相对 `681e73c6` 冻结值）** ③ **机理核查**（`pages/**` 新增几个 · npm 包新增几个 · **新进首屏集合 = []?**）。
  - ⚠️ **`Δ` 恰为 0 时先当仪器故障**；**< ~2 kB 的 Δ 必须用同源真构建对比**（rollup 的 CSS 拼接顺序非确定性，批 4 实测同源两树差 9 B）。
  - ⚠️ **chunk 名不是稳定标识**（v0.22 `:549` 陷阱 #110）⇒ 判 chunk 增删**必须用模块级字面量归属**或**逐块字节闭合核算**。
  - 🔴 **懒侧判据必须用族前缀**（C9.6 第 2 条）：`vendor-katex-*` · `vendor-gsap-*` · `vendor-md-*` …（chunk 名带内容 hash，不稳定）。
- **★ 提交纪律（🔴 §C18.2 已改写机制：**共享文件走 blob 构造，不走暂存区**）**：
  - **根因（§C18 逐字）**：`git commit --only -m "<msg>" -- <paths>` **只按路径取工作树内容、不看暂存区** ⇒ 首波 `fa45caf1` 实际**带走了 T4 的 2 行**（「暂存区自证」这条路**不可靠**）。
  - 🔴 **共享文件**（`docs/standards/line-limit-exemptions.md`，以及**任何可能被多单元同时编辑**的文件）**一律不走 `git add` 整份、不走 `--only`**，改用 **blob 构造 + `update-index --cacheinfo`**：
    ```
    git show HEAD:<path>            # ① 取 LF 规范版本（不看工作树）
    （在临时文件里只改自己那几行）
    git hash-object -w <tmp>        # ② 造 blob
    git update-index --cacheinfo 100644,<blob>,<path>   # ③ 只把该 blob 放进索引
    git diff --cached --stat        # ④ 自证：只有自己的 hunk
    git commit                      # ⑤ 不带 --only
    ```
  - ✅ **廉价前置检查（先做）**：`git diff HEAD -- <shared path>` —— **只有自己的 hunk** ⇒ 两种方式都行；**出现别人的 hunk** ⇒ 🔴 **必须**用上面的 blob 构造（或 **STOP 报控制方**）。
  - ✅ **新建文件**：`git add -- <path>` 后 `git commit`（🔴 **不要** `--only`）。
  - ✅ **普通改动**：`git add -- <自己的路径…>`（**不要** `git add -A` / `git add .`）后 `git commit`。
  - ⚠️ **`git commit --only -m "<msg>" -- <显式路径…>` 只许用于「确无他人共享的文件」**（它只按路径取工作树内容 ⇒ 对共享文件正是 `fa45caf1` 事故的机理）。
  - 🔴 **禁止**：`git add -A` · `git add .` · `git stash` · `git checkout -- <path>` · `git restore <path>`（**任何改工作树的写模式**）· `git clean` · `git reset --hard` · `--no-verify`（**除 §C14.3 的四条条件式授权外**）· `git add -f` · `amend` · `rebase` · force push。
  - ✅ **`git restore --staged <path>` 允许**（**只动索引、不动工作树**）。Conventional Commits：`<type>(<scope>): <subject>`，**subject ≤50 字**、动词开头、无结尾句号。
  - 🔴 **`.superpowers/**` 永不 `git add -f`**。
  - ⚠️ **新建任何目录前先 `git check-ignore <path>`（不带斜杠）验证**：根 `tmp/` **未被 gitignore**（批 6 实测 `git check-ignore tmp` = **exit 1**）—— 本批已发生过一次事故（recon-b/recon-c 把探针写到仓库根 `tmp/`）。**临时文件只许写 `.superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/<unit>/`**。
  - ⚠️ **`--write` 只在「无并行在飞改动」的独占窗口跑**（recon-c C6-8 的代码级机理）：`writeTable()` **不读旧表数字** ⇒ 会把并行单元的在飞中间态行数冻结进表；指向**当前树不存在的路径**的行会被**静默删除**。⇒ 本批**首选不跑 `--write`**（改完行数后手工核对 `--full`）；确需跑 ⇒ 跑完必须 `git diff docs/standards/line-limit-exemptions.md` 逐行确认。
  - 🔴 **§C14 · `--no-verify` 的条件式授权（2026-09-13 控制方裁决；由 T2/T8 双双撞钩子的实测触发）**：**默认禁用** `--no-verify`。**仅当**下列四条**全部成立**时才允许在**单个**提交上使用，且**必须在该任务报告里逐字登记**：
    1. 该提交是**纯搬迁 / 纯散文 / 中间态**提交，**不含**任何判据或行为改动；
    2. 钩子的失败**只**来自「已登记文件的行数 ≠ 登记值」这一类**中间态**（`--full` 的 (e) 判据），**不是**真正的违规（如 >600、注册不一致、docs 断链）；
    3. 该文件的行数列**已由本单元在同一提交里更新**（§C14）或**下一个同单元的提交**立即更新（并在报告里写明哪个提交收口）；
    4. 报告里给出**钩子原始输出**（逐字）+ 「为什么这是中间态」的机理说明。
    ❌ **其余任何钩子失败 ⇒ STOP 报控制方**（**不得**用 `--no-verify` 绕过）。🔴 **权威证据永远是 T12 / T22 在最终树上的串行八闸**（`## Global Constraints` 的门禁基线表）—— **本地钩子只是中间态的守门人**。
- **★ 仪器纪律（承批 1–6 的 32+ 类陷阱，本批逐条适用；下面只列本批最常踩的）**
  1. **本机没有 `pwsh` 二进制**，shell 是 **Windows PowerShell 5.1**（码页 `gb2312`）⇒ **中文串一律不经 PowerShell 字符串层**，读文本/JSON 一律 `node -e` / `node <script.mjs>`。
  2. 🔴 **绝不用 `2>&1 |`**（PS 5.1 把原生 stderr 包成 `NativeCommandError`，让成功的命令报 exit 1）。判 exit 用 `$LASTEXITCODE` 或 `2>file`。
  3. 🔴 **`>` / `2>` 写 UTF-16LE** ⇒ 落文本用 node `writeFileSync`；读回 PS 重定向产物必须 `readFileSync(p,"utf16le")`。
  4. **PowerShell 单行 + 嵌套引号会 `SyntaxError`**（批 6 实测 1 次；**本计划者本轮又踩到 1 次**）⇒ **判据一律给可粘贴的脚本文件路径**，不写长 `node -e "…"` 单行。
  5. **任何「0 命中」/「不存在」结论必须点名仪器 + 可复现命令 + 双侧自证**；**文本扫描先剥注释**（先例 `ui/primitives/sliceScan.ts` 的 `stripComments`）。
  6. 🔴 **`.superpowers/**` 在 `grep` 工具 / `git grep` / `git check-ignore` 三个仪器里都不可靠** ⇒ **一切台账读写只经 node `fs` 直读**（P-26）。
  7. **`git archive` 取不到未跟踪文件**，解包树里没有 `.git`（`git grep` 静默 0 命中）；**导出树必须用 `git -c core.autocrlf=false archive -o t.tar <commit>`**；**junction 借 `node_modules`，删树前先 `[System.IO.Directory]::Delete($junction,$false)` 摘点并 `Test-Path` 确认**。
  8. **`--no-build` 在导出树必失败**（`dist` 不入库）⇒ 导出树内要跑预算守卫必须先在树内 build。
  9. **`--outputFile` 按仓库根解析**；含空格/中文的路径不能经 `shell:true`。
  10. **Node 24 拒绝 spawn `npx.cmd`**（`EINVAL`；`npx` 无扩展名 ⇒ `ENOENT`）⇒ `.mjs` 里要跑 npx 必须换路。
  11. **jsdom 无 `Element.prototype.scrollTo`**（`window.scrollTo` 是 function 但**静默不动**）⇒ 断言一律用 `vi.spyOn` 数调用。
  12. 🔴 **`motion/engine.guard.test.ts` 的图遍历读原始文本、不剥注释** ⇒ **注释里的 `import … from "./x"` 会造幻影静态边**。⇒ 本批在 `App.tsx` / `main.tsx` / 拆件新家里写注释时，**不得**出现 `import ... from "..."` 形态的示例代码。
  13. ⚠️ **`NoteMarkdown` 的 remark 站点判据按模块说明符逐行匹配**（`NoteMarkdown.tsx:30-39` 逐字自陈）⇒ 在它里面**多写一行** `import type … from "react-markdown"` 会把站点读数从 2 变成 3、污染 C8 的锚 ⇒ **T13/T14 严禁在 `NoteMarkdown.tsx` 里新增任何 `react-markdown` 说明符的 import 行**。
- **★ 变异体与守卫纪律（承批 4/5/6，逐条适用）**
  1. **变异体实验一律在导出副本里做**；**绝不许在 `app/src/**` 上「改→跑→还原」**（正解 = **每个变异新解一棵树**）。
  2. **CONTROL 必须在冻结提交树上取**。
  3. **harness 必须把「跑到了断言（用例数 >0）」与「跑红了」分开判**。**没有 `ran` 闸的变异体实验，「全绿」与「全红」都不可信。**
  4. 🔴 **禁 `--reporter=basic`**（Vitest 4 已移除 ⇒ 「伪装的红」= 假证明）。用 `--reporter=json --outputFile=…`（⚠️ **`numTotalTestFiles` 不存在**，文件数读 `testResults.length`）。
  5. **变异体实验不得与全量测试并发**。
  6. **不许 `eval` / `new Function` / `Function(...)`**；类型噪音用显式类型收口，**不许** `@ts-expect-error` / `any`。
  7. **每条新判据自带变异体**；**反例守卫（必须绿的反向变异）与必红的变异体分开列**。
  8. **新造的每个守卫/棘轮必须给「防真空阳性对照」**；**基线常量不可手工改宽**。
  9. ⚠️ **「全文件文本扫描」型守卫会被注释/测试名里的字面量误伤** ⇒ 提到会触发守卫的串时用**拼接写法**或改述；**不要**为绕开守卫去改守卫本身。
  10. 🔴 **本批的变异体必须「真的改变行为」**：**不得**用等价变异体；**期望比对要红在具名断言上**，`ran > 0` 只是旁证（C9.6 第 3 条 + 派发书 §2.4）。
- **★ 计划级冲突的处理**：实施中发现**两条已批准要求互相排斥**时 —— **STOP，点名冲突，并把「绿色方案」也一并实测出来（读数 + 命令 + 代价）**，一次报控制方裁决；**不要自行取舍，也不要两条都硬做**。本计划已预判七处（`### 表 6` 的 X1–X7），遇到新的照此办理。
- **★ 报告与临时文件**：报告写 `.superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/task-<N>-report.md`，评审写同目录 `task-<N>-review.md`（**该目录整体 gitignored ⇒ 永不 `git add -f`**）。探针/日志/基线/解包树一律写同目录 `tmp/<unit>/`。报告必含：① 八门禁逐条（命令 + exit + 读数）；② **本任务触碰的冻结键表**（C9.12）；③ **本任务期望 registry 值 + 为何**（C0.3）；④ 诚实边界（区分「仪器不可达」与「本批未做」）；⑤ 权威读数带 **提交号 + `app/dist` mtime**；⑥ 「只能登记」清单（**不许编造弱判据**）；⑦ **§10 额外审查点名**（若改了 `app_commands.rs` 或任何 IPC 面）。

### 每个拆分任务的统一作业模式（本批全部任务共用，逐条照做；照批 6 母本）

1. **先立影响面**：开工前跑一次该任务会碰到的**全部**测试文件与八条门禁，把读数写进报告的「开工读数组」；**先看 `git status --porcelain`，不是自己的路径一律不碰**。
2. **文件占用检查**：本轮是**多单元共用一棵工作树**；开工前把自己要改的路径与 `tmp/` 里的在飞声明比对，冲突 ⇒ 只读轮询 90s × ≤5，窗口不关 ⇒ 报控制方。
3. **依赖必须「已提交」而不是「工作树已改」**（DISPATCH-TEMPLATE §三）。
4. **一次只切一处**：改一处 → 跑门禁 → 绿则继续，红则**回退这一处**并记录，**不得**为了变绿去改测试、改 mock、加 `await`。
5. **验收判据 = 「既有测试逐条原样通过」+「新增用例只增不减」**；本批**授权改动**的既有断言**仅限** `### 表 5` 逐条点名的那些 ⇒ **表外任何改动 ⇒ STOP 并报控制方**。
6. **每条新判据自带变异体**（导出副本、带 CONTROL、禁 `--reporter=basic`、harness 带 `ran` 闸）。
7. **报告必含**：见 `## Global Constraints` 的报告七项。
8. **提交**：`git diff --stat` 复核只含自己的文件 → 🔴 **共享文件**（如 `line-limit-exemptions.md`）按 `## Global Constraints` 的「提交纪律」走 **blob 构造 + `update-index --cacheinfo` + `git diff --cached --stat` 自证 + `git commit`（不带 `--only`）**；**新建 / 普通改动**走 `git add -- <自己的路径…>` 后 `git commit`（🔴 **不带 `--only`**）；**`--only` 只许用于确无他人共享的文件**。subject 人工数到 ≤50。
9. **冲突即 STOP**：发现两条已批准要求互相排斥，或本计划与实测冲突时 —— **STOP，点名冲突，并把「绿色方案」也一并实测出来**。

---

## 实测基线（计划者 2026-09-13 在 `dev@681e73c6` 实跑 + 逐文件亲测；下游一切目标与排序都从此派生）

> **出处**：`HEAD = 681e73c6`（node `child_process` 实调 `git rev-parse --short HEAD`）· 分支 `dev` · **工作树 `git status --porcelain` = 仅 `?? docs/tech-debt/` 一条** · `app/dist` **未重建**（mtime 沿用 recon-c 实测 `2026-09-13T05:10:24.836+08:00`）· 全部读数采集于 **2026-09-13**（本轮会话）。
> **探针**（全部只读，落 `.superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/plan-writer/`）：`lines.mjs`（`countLines()` 口径全树扫描 + 点名文件）· `frozen.mjs`（六棘轮常数 / 键数 / Σ / 逐文件值）· `sites.mjs`（生产面双侧引用普查，带正控与负对照）· `app-consumers.mjs`（`App.tsx` / `AiToast` 消费者普查）。

### 表 1 · 本计划者实跑的门禁（逐条命令 + exit + 读数）

| # | 命令 | exit | 读数（逐字） |
|---|---|---|---|
| 1 | `node scripts/line-limits.mjs --full` | **0** | `✅ line-limits（--full · 数值一致）：>600 硬限 0（棘轮内）· 301–600 档 122 · 登记条目 122` |
| 2 | `node scripts/check-command-registry.mjs` | **0** | `✅ 命令注册一致：定义 313 / 注册 313 / 重复 0` |
| 3 | `git status --porcelain`（node `child_process`） | **0** | 仅 `?? docs/tech-debt/` 一行 |
| 4 | `git rev-parse --short HEAD` / `--abbrev-ref HEAD` | **0** | `681e73c6` / `dev` |
| 5 | `node tmp/plan-writer/lines.mjs` | **0** | 扫描 **1131** 文件 · `>=280` 行 **184** 个 · 280–300 区间 **62** 个 · **>300 = 122** 个 · **>600 = 0** 个（与门禁 1 的 `122 / 0` **逐字一致** ⇒ 行数口径自证通过） |
| 6 | `node tmp/plan-writer/frozen.mjs` | **0** | 常数与 Σ 全部一致（见 `### 表 2`） |
| 7 | `node tmp/plan-writer/sites.mjs …` | **0** | 正控 = 生产码里含 `import` 的行 **1381**（>0 证明扫描器真的读到了文件）· 域 = **生产 336 文件 / 测试 220 文件（总 556）** · 负对照 = 无意义串 `zzz_no_such_symbol_zzz` ⇒ **0 命中** |

**🔴 本计划者未跑的门禁**（派发书 §0 明令禁跑全量 `vitest` / `cargo` / `npm run build`；`tsc` / `docs-check` / 预算门禁亦不在允许清单内）：`docs-check` · `tsc --noEmit` · `vitest run` · `check-bundle-budget --no-build` · `bundle-eager-graph` · `cargo test` · `cargo clippy`。它们的基线**逐字取 `rulings.md` §C6.2 的开工基线**（`docs-check` / `tsc` / `vitest` / `cargo test` 四条，另加 `bundle-eager-graph`；**懒侧 698.86 kB 一条见 §C10.4**）—— 🔴 **归属必须指到具体节**（§C12 第 5 条；本行原写「取 C10 的控制方串行实测」**已按节精确化**）（`## Global Constraints` 的门禁基线表逐条标注出处）。**7a / 7b 的收口单元（T12 / T22）必须在无并发的独占窗口逐条真跑。**

### 表 2 · 六类棘轮 + 只读硬守卫的**实测真值**（本计划者亲测；C5.3「只信常数」的落地）

| 棘轮 / 守卫 | 常数（实测） | 键数 | Σ（实测） | 判据口径 | 本批是否触碰 |
|---|---|---|---|---|---|
| `textRatchet` 弱化灰 | `FROZEN_MUTED_GRAY_TOTAL=63` · `_FILES=43` | 43 | **63** | **双向钉死**（`toBe` + `<=`） | ⚠️ **T17/T20** 若新增 `#9ca3af` 则红 ⇒ **本批零新增** |
| `textRatchet` 字号越界 | `FROZEN_FONT_OOB_TOTAL=551` · `_FILES=120` | 120 | **551** | **双向钉死** | ⚠️ **T18/T20** 新 UI 的 `fontSize` 必须走 `Text size` 档或 ≥12px |
| `surfaceRatchet` 边框 | `FROZEN_BORDER_TOTAL=223` | 107 | **223** | 上界（`<=`）· 今天贴住，**余量 0** | 🔴 **T7 主战场**；**T18** 碰 `NoteHeaderActions.tsx`（现值 1 = 上限 1） |
| `surfaceRatchet` 越界圆角 | `FROZEN_RADIUS_OUTLIER_TOTAL=260` | 108 | **260** | 上界 ⇒ **余量 0** | 🔴 **T7**；**T18**（`NoteHeaderActions` 现值 2 / 上限 2） |
| `surfaceRatchet` 阴影 | `FROZEN_SHADOW_TOTAL=24` | 24 | **24** | 上界 ⇒ **余量 0** | ⚠️ **T7/T18**：浮层一律用 `boxShadow: "var(--ed-shadow-1)"`（**token 引用不计字面量**） |
| `<Surface>` 调用点 | `FROZEN_SURFACE_TAG_TOTAL=14` · `SURFACE_TAG_FROZEN_LEGACY_COUNT=14` | 9 条 legacy | **14** | 三连通严格相等 + legacy 和锁 | 🔴 **T7**（新增登记制，C9.5 + C10.8）；**T18**（标签浮层若用 `<Surface>` 则同批登记） |
| `statusLine` 三红 | `FROZEN_RED_TOTAL=113` | 66 | **113** | **双向钉死** | 本批零新增 |
| `nativeButton` | `FROZEN_NATIVE_BUTTON_TOTAL=393` · `_BTN_STYLE_CONST_LINES=56` · `_FILES=44` | 114 | **393** | **只判上界**（刻意设计的棘轮，**不得改等号** —— C9.7）· 实测今天 **392** ⇒ 留 1 处「可静默回潮」窗口 | 🔴 **T18 主战场**（`NoteHeaderActions.tsx` 现值 2 = 上限 2 已满）；**T1/T6/T13** 的拆件要 `SPLIT_MOVES` 守恒 |
| `emptyStateRatchet` | `FROZEN_REST` 5 键 `[1,1]` · `FROZEN_REST_TOTAL=5` | — | 恰等于实测 | 区间恰等于实测 + 总数恰 5 | 本批零改动 |
| `zIndex` | `FROZEN_NUMERIC_ZINDEX` 3 条 | 3 | **3** | 集合差 + 无过期项 | 本批新浮层走 `zIndex("popover")` |
| `dialogMigration.e` | `NON_MIGRATED_14` = 34 − 20 | 14 | — | 盘上对拍 + `:252-253` 文本级禁 `ui/primitives` | 🔴 **零改动**（C5.2 + 非目标 3） |
| `buttonMigration` | `MIGRATED_SITES=99` · `MIGRATED` 35 文件 · `BUTTON_SHAPES` 键数 == 35 | 35 | **99** | 逐文件 JSON 相等 + 总数相等 + `STILL_REFERENCED` 逐字相等 | ⚠️ **本批预计 0 处触碰**（每个会加 `<Button>` 的文件逐任务核算；**新文件不进普查**） |

**复现命令**：`node .superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/plan-writer/frozen.mjs` + `node …/lines.mjs`。

**🔴 过期散文清单（C5.3 + C9.13 + C10.6，共 **6 项**，归 T10 / T11；**只改散文、不动常数与逐文件表**）**

| # | file:line | 今天逐字 | 真值 | 处置 |
|---|---|---|---|---|
| 1 | `docs/versions/v0.22.md:425` | 「收口后更正」块自称 `FROZEN_MUTED_GRAY_TOTAL = 64` | **63** | T10 改（**只在块内加一行更正，不改历史原文**） |
| 2 | `docs/versions/v0.22.md:423` | `63/44` + `226+261+24` | **63/43 · 223/260/24** | T10 改（加注） |
| 3 | `docs/versions/v0.22.md:434/:435` 贴边表 **5 处** | `textBaseline.ts` 299 · `surfaceRatchet.test.ts` 287 · `textRatchet.test.ts` 266 · `NotesPage.tsx` 300/300 · `CommandPalette.tsx` 203/220 | **297 · 261 · 270 · 295 · 207** | T10 改（**逐值给出实测**） |
| 4 | `app/src/ui/primitives/textBaseline.ts:19/:25` + `surfaceBaseline.ts:47/:48` | 见下「逐字」 | 弱化灰 **63/43** · 字号 **551/120** · 边框 **223/107** · 圆角 **260/108** | T10 改（**净增 0**） |
| 5 | `app/src/ui/primitives/nativeButton.ratchet.test.ts:25/:182` | `T12 后 394/114` · `describe(… T12 后 394 处 / 114 文件)` | **393** / 114 | T10 改 |
| 6 | `docs/standards/line-limit-exemptions.md:45` | 「**313 条** `generate_handler!` 条目…此数由本行人工维护」 | **311**（批 7 收口值） | 🔴 **必须与 registry 改动的提交同批**（C10.6 逐字）⇒ **T11 的形态见下** |

**第 4 项的逐字 before（本计划者实测）**
```
textBaseline.ts:19  →  *   → **T16-B 迁移后 63/44**（2026-09-12 T16-B 收紧）。字号越界处/文件：**604/124 → 576/122 → 558/120**
textBaseline.ts:25  →  *   **+1**：总量 **63 → 64** / 该文件 **1 → 2**（条目数、锚、字号侧未动；机理详见 `textRatchet` ⑥）。
surfaceBaseline.ts:47 →  *   ⇒ 三族收紧读数：边框 **240 → 226 处 / 111 → 108 文件** ·
surfaceBaseline.ts:48 →  *     越界圆角 **270 → 261 处 / 112 → 109 文件** ·
surfaceBaseline.ts:49 →  *     阴影 **24 → 24 处 / 24 文件（…）**。   ← 🔴 本行**未过期，不改**
```

**🔴 T11 的形态（C10.6 第 6 项的落地，**不是独立提交**）**：C10.6 逐字要求「`:45` 的『313 条』→ **311** 必须**与 registry 改动的提交同批**，否则中间态自相矛盾」。⇒ 🔴 **本计划把「`:45` 的散文同步」拆成两半**：
- **T4 的提交内**：`313` → **310**（撤下 3 条之后、档位通道之前 ⇒ 中间态自洽）
- **T19 的提交内**：`310` → **311**（新增 `remember_video_profile_tier` 之后 ⇒ 中间态自洽）
- **T11 只负责**：`App.tsx` 行数（`:23`）与 `LiveActivityPanel.tsx` 整行（`:38`）—— 这两项**与 registry 无关**，可以是独立提交。

### 表 3 · 本批落点实测（本计划者逐文件 `countLines()` / 逐处读码亲测）

| 对象 | 文件 | 实测 | 今天的事实（要点，均为本轮亲测） |
|---|---|---|---|
| **`App.tsx` 的结构** | `app/src/App.tsx` | **599** | ① 文件头 import + lazy 声明 `:1-96` ② `function App()` `:102-144`（两个早返回 `?overlay=1` / `?float=1`）③ `function PageSlot` `:160-169` + `@ai-context` `:146-159` ④ `export function AiToast` `:186-204` + `@ai-context` `:171-185` ⑤ `function MainShell()` `:208-597`。**`MainShell` 内**：`focus*` 状态族 `:219-223/:265-276/:288`；`go*` 入口族 `:228-263`；listeners `:303-350`；两个键盘 effect `:354-380`；JSX `:382-596` |
| `[[ts:ms]]` 链**三缺二** | `App.tsx:240` | — | `const goSessions = (sessionId: number) => {` —— **单参，ms 被静默丢掉**（TS 允许少参函数赋给多参类型） |
| 同上 · 缺口② | `app/src/views/note/NoteCardFlowView.tsx` | **38** | `:28-35` 调 `<NoteMarkdown>` **未传 `onOpenSessionAt`**（只传 `onOpenSession`） |
| 同上 · 缺口③ | `app/src/utils/html.ts:32 renderTimestampAnchors`（**E1 实测**；原写 `:14` —— 见 `### 表 6b` 的 **E-7**） | **40** | 产出**裸 `<span>`**（无 `onClick` / 无 `data-*` / 无 `href`），`title` 逐字「⏱ MM:SS **跳转到**会话对应片段」；**正则 `\[\[ts:\d+\]\]` 的捕获组里根本没有 ms**；**生产消费者 = 2 文件 / 10 个调用点**（`NotePreviewView.tsx:64/65/68/70/72` · `utils/refineDiff.ts:81/82/83/84/86`；import 分别在 `:16` / `:17`）—— 🔴 原写「13 处（`NotePreviewView.tsx:5/37/38/40/42/44` · `utils/refineDiff.ts:3/61/62/63/64/66`）」**是错的**，见 `### 表 6b` 的 **E-20** |
| 会话侧落点**已在** | `app/src/components/SessionDetailPanel.tsx` | **200** | `:101 const [playheadMs, setPlayheadMs] = useState<number \| null>(null);` · `:145 onSeekMs: setPlayheadMs,` ⇒ **槽已就位**；`:87 const [viewKey, setViewKey] = useViewMemory("session", defaultKey, views.map((spec) => spec.key));` ⇒ **视图切换的既有机制就在本件**（C10.3 的"只许走既有机制"落点） |
| `NotesPage` 侧**已在** | `app/src/pages/NotesPage.tsx` | **295** | `:273 onOpenSessionAt={onOpenSessions}` **已接线**；`:56 onOpenSessions?: (sessionId: number, ms?: number) => void` **类型已带 ms** |
| `NoteReadingView` 侧**已在** | `app/src/components/NoteReadingView.tsx` | **343** | `:321 onOpenSessionAt={onOpenSessionAt}` 已传给 `NoteMarkdown` |
| `NotesReadingColumn` 的槽 | `app/src/components/notes/NotesReadingColumn.tsx` | **294** | `:173` 注释逐字「⚠️ T26：`onOpenSessionAt` **不进** `NoteViewSlot`（该槽类型属批 6 T24 的规范面，本任务不改）⇒ 卡片流视图的时间码回链仍无 ms，已登记为残余」· `:174-176` 的 `slot` **只给 4 个字段** |
| `NoteViewSlot` 类型 | `app/src/views/registry.ts:80-85` | **137**（全文件） | 4 个字段。🔴 **C10.3：不得新增可选槽** |
| **归一 5 条链** | 见 `### 表 4` | — | 逐条实测行数与生产调用点 |
| **`structuredBlocks` 4 导出** | `app/src/components/structuredBlocks.ts` | **69** | 🔴 **行号以 `### 表 6b` 为准（E1 只读重测）**：`:8 import katex from "katex";` · `:9 import "katex/dist/katex.min.css";` · **`:11 import { escapeHtml } from "../utils/html";`** · **`:13 export { escapeHtml };`** · **`:16 renderLatex`（定义；注释 `:15`）** · **`:29 renderMarkdownTable`（定义；注释 `:28`）** · **`:67 lowConfidenceClass`（定义；注释 `:56-66`）**（原写 `:4/:6/:9/:21/:48` —— **除 `:8`/`:9` 外全错**；recon-a/recon-c 的 `:16/:29/:67` **本来是对的** —— 见 `### 表 6` 的 X2 与 `### 表 6b` 的 **E-1–E-5**） |
| 唯一活导出 | `app/src/components/session-detail/SessionRawView.tsx` | **199** | **`:50 import { lowConfidenceClass } from "../structuredBlocks";`** · **`:138 className={lowConfidenceClass(seg.confidence)}`** ⇒ **生产 1 文件 / 1 调用点**（🔴 行号已按 `### 表 6b` 的 **E-15/E-16** 勘误：原写 `:5` / `:91`；另 `:29` / `:35` 是注释行）。⚠️ **在飞状态**：**T2 已落地（提交 `2ed5c836`）** ⇒ **工作树里 `:50` 的 import 源已变成 `"../../utils/lowConfidence"`**（上面写的是**基线 `681e73c6` 的真值**；T3 按工作树继续） |
| 测试-only 消费者 | `app/src/components/structuredBlocks.test.ts` | **92** | **共 8 个 `it`**（E1 实测：`:14/:21/:31` = `renderLatex` **3** · `:38/:49/:59/:68` = `renderMarkdownTable` **4** · **`:82` = `lowConfidenceClass` **1****）；标识符出现行数 = `renderLatex` 5 / `renderMarkdownTable` 6 / `lowConfidenceClass` 6（🔴 原写「`lowConfidenceClass` 4 处（`:57-62`）」**是错的** —— 真值 = **1 个 `it`（`:81` 的 describe 下），内含 4 条 `expect`（`:86-89`）**；见 `### 表 6b` 的 **E-19**） |
| 镜像消费者 | `app/src/motion/env.test.ts` | **243** | **`:34 import { lowConfidenceClass } from "../components/structuredBlocks";`** · **`:229-234` 的 V6 对拍**（`it(` = `:229`；**`:230` 对 `LOW_CONFIDENCE_CLASS`**；`:231` 同类名形状；`:234` 三条空串）— 🔴 行号已按 `### 表 6b` 的 **E-17/E-18** 勘误：原写 `:5` / `:126-131` / `:127` |
| 环境层真源 | `app/src/motion/env.ts` | **61** | `:44 export const LOW_CONFIDENCE_CLASS = "ed-text--low-confidence";`（**双语字面量**，批 6 评审 M-2 已登记为已知代价） |
| 标签写入的三条命令 | `app/src-tauri/src/commands_colors.rs` | **46** | `:14 list_tag_colors`（读端**已接线**）· `:20 set_tag_color` · `:41 reset_tag_color`；**前端生产调用点各 0** |
| 标签数据层 | `app/src-tauri/src/db_colors.rs` | **79** | 4 方法齐备（`list` `:22` / `get` `:43`（`#[allow(dead_code)]` + 理由 `:39-42`）/ `set`（upsert `:56-65`）/ `reset` `:68-73`）；**全仓唯一的 `INSERT INTO tag_colors` 就是 `:59` 的 upsert** ⇒ **零种子、零回填** |
| `tag_colors` DDL | `app/src-tauri/src/db_migrations.rs:279-282` | **573**（全文件） | `CREATE TABLE IF NOT EXISTS tag_colors ( tag TEXT PRIMARY KEY, color TEXT NOT NULL );` ⇒ 🔴 **`color` NOT NULL ⇒「插入占位空色」这条路不存在**（C0.4） |
| 标签 UI 宿主 | `app/src/components/NoteHeaderActions.tsx` | **122** | ① 不在 `NON_MIGRATED_14` ② 不在 35 文件普查 ③ 已持有**锚定浮层先例** `:62-65`（`position:"absolute"`）④ 已持有颜色入口先例（`:55-60` 色点 → `:61-79` `NoteColorPicker` 浮层）；**原生 `<button>` ×2**（`:97` `note-ai-entry` · `:109` `note-model-card-entry`）；**`1px solid #e5e7eb` ×1**（`:64`） |
| 色板复用件 | `app/src/components/NoteColorPicker.tsx` | **99** | 头注 `:2` 逐字「**笔记级/组级/标签级三处复用**」⇒ 标签色用它**是原设计**；`:74-96` 已有**清除**按钮（`data-testid="color-clear"`）⇒ 「成对」的两个动作**本件已具备** |
| 过滤面板 | `app/src/components/NoteListToolbar.tsx` | **96** | `:82 {allTags.length > 0 && (` ⇒ **`allTags` 空时整段不渲染**；`:87-88` 的芯片**颜色与 `tag_colors` 无关**（只据 `tagFilter === t` 二选一上色）⇒ 🔴 **C2.4 的「色与 `tag_colors` 一致」今天不成立**（见 `### 表 6` 的 X5） |
| 档位通道 · 四段 | `app/src-tauri/src/commands_live.rs` | **399** | `:46-52 pub async fn start_live_session(state, title: String, source_window: Option<String>, window_id: Option<i64>, profile: Option<String>) -> Result<i64, String>` ⇒ **无 `tier` 参数** |
| 同 · 前端调用点 | `app/src/hooks/useLiveCaptureControl.tsx` | **298** | `:182-187 invoke<number>("start_live_session", { title, sourceWindow, windowId, profile })` ⇒ **不传 tier**；`:42` 的 `CaptureStartArgs` 只有 4 字段 |
| 同 · 记忆体 | `app/src-tauri/src/video_profile_memory.rs` | **228** | 只有 `remember_form`（`:110`）/ `remember_domain`（`:153`）与 `lookup_form` / `lookup_domain` ⇒ **无 tier 字段、无 `remember_tier`** |
| 同 · 读端与模板 | `app/src-tauri/src/commands_video.rs` | **311** | `:260 pub fn video_profile_for_spec(form: Option<String>, tier: Option<String>) -> VideoProfile`（**纯函数，无 State**）· `:281 remember_video_profile_form(state, title, form)`（**新命令照它写**）· `:245 video_profile_memory(state)` |
| 同 · 新命令零命中 | （全 `app/src-tauri/src`） | — | `remember_video_profile_tier` **0 命中**；前端**只有 1 处且是 TODO 注释**：`ProfileDetector.tsx:194` 逐字「`* TODO(后端): 需新增如 remember_video_profile_tier 命令后才能跨会话记忆画面档。`」 |
| 同 · 前端档位修改 | `app/src/components/ProfileDetector.tsx` | **398** | `:196-200 changeTier` **只 `setTier` + 轻提示「画面档修改仅本次会话生效」**，**不调后端** |
| 同 · **已通**的另一条线 | `app/src/components/LiveProfileStrip.tsx` | **316** | `:178-181 invoke("update_live_profile", {…tier…})` ↔ `commands_live.rs:328-331` ⇒ **采集态热切换已通**（与 C3.1 要做的「开始前选档 → 跨会话记住」**不是同一条线**） |
| 采集期落点 | `app/src/components/LiveActivityPanel.tsx` | **513** | 已登记 301–600 档；**无同名测试文件**；豁免表 `:38` 逐字给了拆法；逐文件冻结值：**边框 2 · 越界圆角 1 · 阴影 0 · nativeButton 1 · 字号越界 8 · 弱化灰 2** |

### 表 4 · markdown 归一：5 条链的**实测**现状（C10.1 的账）

| # | 链 | 文件 | 实测行数 | 类型 | 生产调用点（`sites.mjs` 实测） | 测试面 | 本批裁决 |
|---|---|---|---|---|---|---|---|
| 1 | react-markdown 站点 #1 | `app/src/components/NoteMarkdown.tsx` | **295**（余 5） | **真渲染器** | `components/NoteReadingView.tsx:321` · `views/note/NoteCardFlowView.tsx:32` | `components/NoteMarkdown.test.tsx` **163** | **保留为唯一 react-markdown 站点**；🔴 **必须先拆件**（余 5 行） |
| 2 | react-markdown 站点 #2 | `app/src/components/ChatMessageMarkdown.tsx` | **52** | **真渲染器** | `components/ChatMessageList.tsx:117` · `:146` · `components/TaskConversationView.tsx:189`（3 处） | **无同名测试**；`chatHelpers.test.ts` 测 `truncatePreview` | **并入 #1 后删除**（C10.1） |
| 3 | 手写 HTML 串生成器 | `app/src/utils/refineDiff.ts:78 mdLineHtml` | **107**（全文件） | **串生成器**（给 `dangerouslySetInnerHTML`） | 经 `renderSideHtml` / `renderDiffColumnHtml` → `components/RefineWorkbench.tsx:324/:325/:326`；`mdLineHtml` 直接外部调用点 = **0** | `utils/refineDiff.test.ts` **177** | **迁入 `utils/markdownLine.ts`** |
| 4 | 手写 HTML 串生成器 | `app/src/components/NotePreviewView.tsx:40 renderMarkdown`（**E1 实测**；原写 `:23` —— 见 `### 表 6b` 的 **E-11**） | **346**（全文件） | **串生成器** | 2 处，全在同文件（**`:295` · `:301`**，**均 `dangerouslySetInnerHTML`**；🔴 原写 `:250` · `:256` —— 见 **E-12**） | 🔴 **无同名测试文件**（`sites.mjs renderMarkdown`：PROD 3 / **TEST 0**） | 🔴 **先补表征测试 → 再迁入 `utils/markdownLine.ts`**（**禁止换 react-markdown**） |
| 5 | 死件 | `app/src/components/structuredBlocks.ts` | **69** | 死 | `lowConfidenceClass` 1 处（**`SessionRawView.tsx:138`** 的用法；import 在 `:50` —— 🔴 原写 `:91`，`### 表 6b` 的 **E-16**） | `structuredBlocks.test.ts` **92** | 按 §C4.2（删 3 个死导出 + 摘 `escapeHtml` 再导出）⇒ **T2/T3** |

**⇒ 终态 = 2 套活**（`NoteMarkdown` + `markdownLine`）。**收益**：`#2` 的 4 条 `remark-*`/`rehype-*` 站点消失（`noteViews.test.tsx:285` 的 `=== 8` 会变）+ 手写链从 2 支收成 1 支（`[[ts:ms]]` 芯片的修复只需做一次）。

### 表 5 · 本批必改的既有断言（**全部为已授权项**；逐条给旧原文 / 新原文 / 专属变异体）

> **口径**：`### 每个拆分任务的统一作业模式` 第 5 条 —— 本批**授权改动**的既有断言**仅限**此表。**表外任何改动 ⇒ STOP。**

| # | 文件:行 | 旧断言原文（逐字 / 要点） | 为什么必红 | 新断言 / 形态 | 授权出处 | 归属任务 |
|---|---|---|---|---|---|---|
| **Y1** | `app/src/components/toastMigration.test.tsx:34` | `import { AiToast } from "../App";` | T1 把 `AiToast` 的定义搬到 `shell/aiToast.tsx` | `import { AiToast } from "../shell/aiToast";`（**语义不变、只换来源**） | **搬迁的必需后果**（DISPATCH-TEMPLATE §三「通则」） | **T1** |
| **Y2** | `app/src/components/toastMigration.test.tsx:117 / :146 / :147` | 【**勘误 · 保留原记录**】原行逐字：「`expect(CODE["App.tsx"]).toContain("<AiToast");` · `toContain("durationMs={3500}")` · `not.toContain("durationMs={3000}")`」，处理列写「🔴 **不改**（T1 保留调用点与其文本）⇒ 本行是"零改动"的反向声明」 | 🔴 **原行错在 `:146`**：`durationMs={3500}` 在 **`AiToast` 的定义体内**（`App.tsx:198`，E1 实测），`AiToast` 搬去 `shell/aiToast.tsx` ⇒ **`:146` 必红**；**`:117`（`App.tsx` 含 `<AiToast`）确实不改**（调用点留在 `App.tsx:549`，E1 实测）；`:147`（不含 `durationMs={3000}`）搬后仍绿 | 🔴 **`:146` 授权改写**：`CODE["App.tsx"]` → `CODE["shell/aiToast.tsx"]`（**等强**：断言的值 `durationMs={3500}` 一字不改，**只换被读的文件**）；**控制方 2026-09-13 裁决授权**（T1 实测回报触发）⇒ 逐条给 **before/after** + 自带**变异体** + **独立 `test(...)` 提交** | **控制方 2026-09-13 授权**（勘误：原行把 `:146` 误判为"不改"） | **T1** |
| **Y2-A** | `app/src/components/toastMigration.test.tsx:126` | `expect(barrelNames(CODE[f]), …).toContain("Toast");`（`f` 含 `"App.tsx"`） | T1 把 `import { Toast }` 一起搬走 ⇒ `App.tsx` 的 barrel 名字表**不再含 `Toast`** ⇒ **必红** | **等强改写**：把 `"App.tsx"` 换成 `"shell/aiToast.tsx"`（**或**让 `App.tsx` 继续从 barrel 直取 —— 🔴 **由实施者按"等强"判**：**不得**删 `Toast` 这个名字，也**不得**放宽为 `toContain` 之外的弱判据）；逐条 before/after + 变异体 | **控制方 2026-09-13 裁决授权** | **T1** |
| **Y2-B** | `app/src/shell/TopBar.test.tsx:276`（**298 行**） | `expect(APP_CODE, "App.tsx 没有把 AI toast 交给 belowNav 档").toContain('placement="belowNav"');`（`APP_CODE` = 剥注释后的 `App.tsx` 源码） | `placement="belowNav"` 在 `App.tsx:199`（**`AiToast` 定义体内**）⇒ 搬走 ⇒ **必红**（调用点 `:549` 上的 `<AiToast …/>` **本身不带** `placement`） | **等强改写**：把该断言**改为读 `shell/aiToast.tsx`** 的源码（**或**用渲染级断言证明 belowNav 档仍在）⇒ 🔴 **不得**删这条断言（它守的是「AI toast 交给 belowNav 档」这一用户可见行为）；逐条 before/after + 变异体 | **控制方 2026-09-13 裁决授权** | **T1** |
| **Y2-C** | `app/src/shell/ShellFallback.test.tsx:174-175`（**208 行**） | `const ps = at("function PageSlot(");` + `const def = APP.slice(ps, APP.indexOf("\n}\n", ps));`（`APP` = `App.tsx` 源码） | T1 把 `function PageSlot(` **整段搬去 `shell/PageSlot.tsx`** ⇒ `indexOf` 返回 **−1**、切出的定义体为空/错位 ⇒ **该用例必红**（**红色形态可能是"空真"而不是断言失败** ⇒ 🔴 必须按"先证伪 −1"处理） | **等强改写**：把切定义体的**源文件**改为 `shell/PageSlot.tsx`（**或**改成读新家整文件）⇒ 判据强度不变（**仍是"定义体里必须有 SlotErrorBoundary / Suspense"**）；🔴 **必须**加一条「`indexOf` 的返回值 ≥ 0」的**反空真**断言（否则改完仍是空真）；逐条 before/after + 变异体 | **控制方 2026-09-13 裁决授权** | **T1** |
| **Y2-D** | 上三处 + `:146` 的**共同纪律** | — | 「搬迁的必需后果」类改动**最容易变成顺手放宽** | 🔴 **四条硬条件**：① **等强或更强**（**禁止**把 `toContain` 降级、**禁止**删除断言）；② 报告逐条给 **before/after 逐字对照** + 论证「是搬迁的必需改动」；③ **每条自带变异体**（搬回旧行为 ⇒ 必须红在**具名断言**上）；④ **独立 `test(...)` 提交**（**不与 `refactor(app):` 的搬迁提交混在一起** —— C9.19 第 1 条「只搬不改」的落地） | **控制方 2026-09-13 裁决授权 + C9.19** | **T1** |
| **Y3** | `app/src/shell/CommandPalette.kb.test.tsx:174-175` | `const fields = […10 个…];` | T1 新增 `focusSeekMs` ⇒ 不加进名单则**无人守** | **只增**：把 `"focusSeekMs"` 追加进数组末尾（**11 个**）；`:176` 的正则与 `:177` 的期望**一字不改**；报告给**前后逐字对照**（C9.9） | **C9.9** | **T1** |
| **Y4** | `app/src/views/note/noteViews.test.tsx:281-282` | `.toEqual(["components/ChatMessageMarkdown.tsx", "components/NoteMarkdown.tsx"])` | T14 删 `ChatMessageMarkdown` ⇒ 站点 **2 → 1** | `.toEqual(["components/NoteMarkdown.tsx"])` + **显式说明少的是哪一个**（C10.1 逐字「删除的断言必须换成等强或更强的」） | **C10.1 预授权** | **T14** |
| **Y5** | `app/src/views/note/noteViews.test.tsx:285` | `expect(pluginSites.length, "remark-*/rehype-* 站点数变了…").toBe(8);` | 同上 ⇒ `#2` 的 4 条插件站点消失 ⇒ **8 → 4** | `.toBe(4)` + 逐条列出**剩下的 4 条**（`NoteMarkdown` 的 `remark-gfm` / `remark-math` / `remark-mark-highlight` / `remark-breaks`） | **C10.1 预授权** | **T14** |
| **Y6** | `app/src/views/note/noteViews.test.tsx:286` | `expect([...new Set(pluginSites.map((s) => s.file))].sort()).toEqual(["components/ChatMessageMarkdown.tsx", "components/NoteMarkdown.tsx"]);` | 同上 | `.toEqual(["components/NoteMarkdown.tsx"])` | **C10.1 预授权** | **T14** |
| **Y7** | `app/src/components/NoteMarkdown.test.tsx`（**163 行**，6 条核心断言） | 逐条见文件；**特点是「缺省时与今天逐字相同」**（`NoteMarkdown.tsx:60` 逐字：「缺省时 `?? []` ⇒ **不传即与今天逐字相同**（`NoteMarkdown.test.tsx` 的 6 条原样绿）」） | 🔴 **T14 并入 `#2` 后**：若 `#2` 的语义（`remark-breaks`/`remark-gfm`/`remark-math` 的**组合** + 自定义 `code` 组件 + 截断预览）改变了 `#1` 的默认行为 ⇒ 这 6 条会红 | 🔴 **默认不动**：T14 的并入**必须**保持 `NoteMarkdown` 的既有默认行为**逐字不变**（`#2` 的差异走**新增可选 props**，如 `previewMaxChars?` / `codeRenderer?`）⇒ **若实施者发现必须改这 6 条 ⇒ STOP 报控制方**（C10.1 授权它改，但**本计划的形态设计为不需要改**） | **C10.1 预授权（备用）** | **T14** |
| **Y8** | `app/src/utils/html.test.ts:56-103`（`renderTimestampAnchors` **5 条**） | `:63 toContain("⏱ 00:00")` · `:64 not.toContain("[⏱ 00:00]([[ts:233]])")` · `:73 toContain("⏱ 00:09")` · `:74/:75 not.toContain(...)` · `:80 toBe("普通文本没有锚点 123")` · `:90-93 toContain("⏱ 00:00")` / `not.toContain("<script>")` / `toContain("&lt;script&gt;")` / `toContain("&quot;x&quot;")` · `:101 toBe(input)` | 🔴 **C10.2 要给芯片加 `data-ts-ms` 及 ms 捕获** ⇒ `:80` 与 `:101` 两条 `toBe(...)` 是**全等断言**，芯片形态一变就红 | **改成等强或更强**：`toContain` 系全部保留（**它们对新增属性天然免疫**）⇒ **只需改 `:80` / `:101` 两条 `toBe`**，改成「无锚点文本**不产生任何 `data-ts-ms`**」（`expect(out).not.toContain("data-ts-ms")` + `expect(out).toBe(input)` 保留）；🔴 **并新增 1 条「芯片带 `data-ts-ms` 且值 = ms」**（**比原来更强**） | **C10.1 + C10.2 预授权** | **T15** |
| **Y9** | `app/src/pages/NotesPage.test.tsx:165` | `const el = container.querySelector<HTMLElement>('span[title*="跳转到会话"]');` | 🔴 **C10.2 的副作用**：`html.ts` 的芯片若也带同款 `title`，该选择器的**唯一性会被稀释** | 改成**带 `data-*` 的定名选择器**：`container.querySelector<HTMLElement>('[data-ts-chip]')`（或 `'[data-ts-ms="5000"]'`）⇒ **比原来更强**（不再依赖 title 文案） | **C10.2 预授权** | **T17** |
| **Y10** | `app/src/components/session-detail/SessionRawView.test.tsx:10/:38/:112` | `const LOW = "ed-text--low-confidence";` + 「低置信段**恰 1 个**带 …」+ `:10` 的「② **与 R11.3 共存**」 | 🔴 **T2 换 import 源不影响它**（它走**类名字面量**，不 import helper）⇒ **本行预计零改动**；**但** T17 给 `SessionTriTrackView` 加第 2 个调用点后，**若该文件也被这个测试覆盖**则会变 | 🔴 **默认不改**；若必须改 ⇒ 属 **C4.3 的已追认授权**，须给逐条 before/after 并论证「是"低置信加宽"的必需改动」 | **C4.3 预授权** | **T2 / T17** |
| **Y11** | `app/src/shell/CommandPalette.kb.test.tsx:163-166` | `pick.kind === "dock"` / `"hit"` / `"create-system"` / `isPageKey(pick.key)` 四条静态判据 | T1 的拆件**不动** `onPick` | 🔴 **不改**（反向声明） | — | **T1** |
| **Y12** | `app/src/ui/primitives/nativeButton.ratchet.test.ts:25 / :182` | 见 `### 表 2` 的散文清单 | **不红**（散文，不是判据） | **只改散文**：`394` → `393`（两处） | **C9.13** | **T10** |
| **Y13** | 六棘轮的 `FROZEN_*` / `*_BY_FILE` / ANCHOR 的**同步收紧/迁移** | 见各任务卡的「冻结值预算」表 | **T2/T6/T7/T13/T14/T15/T17/T18 的搬迁、迁移与删除会真实改变某些逐键值** ⇒ **必须同步**，否则守恒/数值一致性判据会红 | **逐任务**：源键减少、新键增加（T6/T7/T13 的搬迁）、总量同步下调；**报告给逐键 diff**（C9.19 第 2 条） | **C5.1 + C9.19** | **T2 / T6 / T7 / T13 / T14 / T15 / T17 / T18** |

### 表 6 · 规格/裁决与实测的冲突台账（计划期实测；逐条给出处置）

| # | 裁决/规格原文 | 实测（本计划者的读数与命令） | 处置 |
|---|---|---|---|
| **X1** | 批 1 计划 `:206` 逐字「撤 IPC 时**只删注册行**，函数原样留」 | 🔴 **与门禁语义冲突**：只删注册行 ⇒ `定义 313 / 注册 310` + 3 条「漏注册」+ exit 1（recon-a A2④ 的夹具实测；机理 = `check-command-registry.mjs:95` 的 `ATTR` 正则 + `:169-171` 的 `missing` 分支） | **按 C0.1/C1.1 执行**（摘属性 + 删注册行）；批 1 计划 `:206` 是**历史文本，不改**，在 **T21** 的规格回写里登记「批 1 指引已失效」 |
| **X2** | 【**勘误 · 保留原记录**】原行逐字：recon-a A3-1 与 recon-c C5 都写 `structuredBlocks.ts:16 renderLatex` / `:29 renderMarkdownTable` / `:67 lowConfidenceClass`；🔴 **原行还写了「本计划者实测是 `:9` / `:21` / `:48`（`escapeHtml` 的 import `:4`、再导出 `:6` —— 与控制方 2026-09-13 的实测一致）」** | 🔴 **原行的两处都错**：① **「与控制方实测一致」是不实归属** —— 控制方 §C12 直读真值与它**不符**（**控制方第 13 例引述/事实错误，出自计划编制单元**，§C12 逐字）；② 原行的 `:4/:6/:8/:9/:21/:48` 里**只有 `:8`/`:9` 恰好对**。**E1 本轮只读重测（口径 = `countLines()`，仪器 = `tmp/e1/probe.mjs`）**：`app/src/components/structuredBlocks.ts` = **69 行**；真锚 = **`:8 import katex`** · **`:9 import "katex/dist/katex.min.css"`** · **`:11 import { escapeHtml } from "../utils/html"`** · **`:13 export { escapeHtml };`** · **`:16 export function renderLatex`** · **`:29 export function renderMarkdownTable`** · **`:67 export function lowConfidenceClass`** ⇒ **recon-a / recon-c 的 `:16/:29/:67` 是对的**（「recon 的行号过期」这个说法**本身过期**） | 🔴 **以 `### 表 6b` + 控制方 §C12 真值表为准**；**本计划全文的 `:4/:6/:9(renderLatex)/:21/:48` 已逐处改正**（改动位点见 `### 表 6b` 的「受影响位点」列）；实施者动手前**必须自己重测**并把行号写进报告 |
| **X3** | recon-a 早期口径「`escapeHtml` 生产 0 消费」（**原行附**：本计划者实测「真源 `utils/html.ts:4` 有 3 个生产消费者（`NotePreviewView.tsx:5` · `RefineWorkbench.tsx:6` · `utils/refineDiff.ts:3`）」） | 🔴 **口径对、行号错（E1 本轮重测）**：真源 = **`utils/html.ts:11`（不是 `:4`）**；3 个生产消费者在 **`NotePreviewView.tsx:16`** · **`RefineWorkbench.tsx:25`** · **`utils/refineDiff.ts:17`**（**不是 `:5` / `:6` / `:3`**）—— 三处都是**从 `../utils/html` 直 import 的 import 行**；**经 `structuredBlocks` 的消费 = 0**（该文件内 `escapeHtml` 只出现在 `:10`(注释) / `:11`(import) / `:13`(再导出) / `:24` / `:34` / `:37` / `:45`，**全部是本模块内部使用 + 再导出定义**，无外部消费者） | **按 C4.2 的控制方更正执行（口径不变）**：**只摘 `:11` import + `:13` 再导出**，`utils/html.ts` **一个字不动**；原行的 `:4` / `:5` / `:6` / `:3` 四个锚**已逐处改正**（见 `### 表 6b`） |
| **X4** | recon-b B1.9 / T26 写「`SessionDetailPanel.tsx:143-145` 槽已就位」 | 本计划者实测：槽**确实已就位**，真身是 `app/src/components/SessionDetailPanel.tsx`（**200 行**，**不在 `session-detail/` 子目录**）：`:101 playheadMs` · `:145 onSeekMs: setPlayheadMs` | **以本计划者路径为准**（T17 的 Files 表逐字给出） |
| **X5** | §C2.4 逐字「写进标签后过滤面板出现，且**色与 `tag_colors` 一致**（读端已在：`useNotesListData.ts:54` → `NoteListRow.tsx:125`）」 | 🔴 **实测：「色与 `tag_colors` 一致」只在 `NoteListRow` 成立**；`NoteListToolbar.tsx:87-88` 的过滤芯片**完全不用 `tagColors`**（`allTags` 是 `string[]` 而非带色对象） | 🔴 计划**默认执行形态**：给 `NoteListToolbar` 加可选 `tagColors?: Record<string,string>` 并给芯片上色（T18 的 Step 5）⇒ **列进 `## 待控制方裁决` #2**（C10.7 要求未决项必须是"底稿未覆盖的新问题"—— **本条是 §C2.4 的实测口径缺口，底稿未列**） |
| **X6** | §C10.1 逐字「把 #3 与 #4 **合成一支**行级 HTML 串渲染器」 | 🔴 **实测两支链的产物样式不同**：`NotePreviewView.tsx:64-72`（h2 `:64` / h3 `:65` / 提示块 `:68` / li `:70` / p `:72`；原写 `:37-44` —— 见 `### 表 6b` 的 **E-13**）用 `font-size:15px/13px/12px` + `margin:10px 0 4px`；`refineDiff.ts:81-86`（h2 `:81` / h3 `:82` / h4 `:83` / li `:84` / p `:86`；原写 `:61-66` —— **E-14**）用 `font-size:14px/13px/12px` + `margin:8px 0 3px` + **`extra` 样式参数**且 `mdLineHtml` 带 `extra` | 🔴 **计划默认执行形态**：`markdownLine.ts` 导出**一支**渲染器 + **两个模式常量**（`PREVIEW` / `COMPACT`，**各自逐字保留原样式**）⇒ **两条链的可见输出零变化**（**这是"合成一支"与"零观感变化"并存的唯一形态**）⇒ **原列进 `## 待控制方裁决` #1**；🔴 **已裁：§C11.1 批准「两模式」**（见该节第 6 列） |
| **X7** | §C10.3 逐字「**先查既有 context / registry 机制能否不经 `NoteViewSlot` 传到**；**能 ⇒ 本批做**；**不能 ⇒ 登记为残余**」 | 本计划者查得：`views/architecture.slots.test.ts:81-99` 用 **tsc 探针**强制「视图组件的 props ⊆ slot」⇒ 🔴 **给 `NoteCardFlowView` 加独立 prop 会 `TS2769`**；而 `NotesReadingColumn` 本来就有 `onOpenSessionAt` 可传 ⇒ **可行形态 = 在 `NotesReadingColumn` 里创建一个**不属视图注册表的**包装组件**（`views/note/NoteCardFlowWithSeek.tsx`），它吃 `NoteViewSlot & { onOpenSessionAt }`、内部把槽**整体**转给 `NoteCardFlowView` ⇒ **`NoteCardFlowView` 的 props 面一字不改、`NoteViewSlot` 一字不改、A6 探针仍绿** | 🔴 **采用包装件形态**（C10.3 的"能 ⇒ 做"）；**报告须逐字说明这是"不经 `NoteViewSlot`"的实现**，并给 A6 探针的复跑读数 |

### 表 6b · 勘误记录（原锚 → 真锚 → 依据）

> 🔴 **头部说明（2026-09-13，E1 勘误单元；根因由 T2 实施单元实测、控制方复核采信）**：
> **本计划的行号锚，凡来自编制期仪器 `tmp/plan-writer/sites.mjs` 的，都是「剥注释后的行号」而不是真文件行号** —— 该仪器用 `s.replace(/\/\*[\s\S]*?\*\//g, "")` **把块注释整段删除**（而不是抹成等长空白）⇒ **行号系统性前移**。⇒ **本表是逐条重推结果**；🔴 **实施者动手前一律自己重测**（派发书 §6 第 2 条），**与本表不符 ⇒ 按实测走**并在报告里逐字给出旧锚 / 新锚。
> **重推口径（本节全部读数）**：**基线 = `681e73c6` 的冻结提交树**（`git show 681e73c6:<path>` 直读）—— ⚠️ 工作树里有 T1/T2/T4/T8 的**在飞改动**（`git status --porcelain` 实测 ` M app/src/App.tsx` 等 5 项 + 2 个未跟踪新文件），**锚必须以基线为准才可复现**；**行号 = 真文件行号**（注释**抹成等长空白**，行数不变）；**行数 = `countLines()`**（`scripts/line-limits.mjs:48-52` 的唯一实现）。
> **探针（只读，落 `.superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/e1/`）**：
> `probe.mjs`（C12 五个文件的官方行数 + 真值锚，逐条自证）· `probe2.mjs`（`useViewMemory` 落点 + 三道门禁的自动捡拾面）· `probe3.mjs` / `probe4.mjs`（其余锚与消费者普查）· `probe5.mjs`（`App.tsx` / toast 三测试 / `tsconfig` 的 `noUnusedLocals`）· `probe6.mjs`（定向复核 T7/T18/T19 的落点行）· **`anchors-baseline.mjs`（文件类锚 165 条 × 基线逐条核对，带正控/负控）** · **`windows.mjs --compact`（同上的可读铺开版）** · **`bare.mjs`（裸 `:NN` 锚 386 条 × 上下文文件解析）** · `scan-plan.mjs`（计划全文错锚与归属句扫描）。
> **复现命令**：`node .superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/e1/anchors-baseline.mjs`（+ `bare.mjs`；两者都可用 `--dump <file>` 落盘）。
> **仪器自证**：**正控 = PASS**（`line-limits.mjs` 含 `countLines`）· **负控 = PASS**（`zzz_no_such_symbol_zzz` **0 命中**）。
> 🔴 **锚点裁定纪律（§C17.3，本表 E-25 的教训）**：**「某变异体的期望红点」这类锚必须由实跑裁定** —— 在**导出树**里注入变异体（**自证注入恰 1 次**）、跑具名测试、把**实际变红的 `文件:行:断言名`** 抄下来。**不许**由阅读推断。**先例**：`FROZEN_NATIVE_BUTTON_TOTAL 393 → 394` ⇒ CONTROL **15/15 绿** · MUTANT **14/15**，唯一红点 **`buttonMigration.test.ts:272:93`**（证据 `tmp/e1/e25-control.json` / `e25-mutant.json`）。
> **本节的定位**：`### 表 6` 的 X2/X3 是**勘误的来源记录**；**本节是逐条的真值表**。🔴 **本计划全文已按本节逐处改正**（受影响位点列给出落点）。

**（a）官方行数（E1 实测，`countLines()`）与控制方 §C12 表逐条对拍**

| 文件 | 官方行数（E1 实测） | §C12 表 | 一致？ |
|---|---:|---:|---|
| `app/src/components/structuredBlocks.ts` | **69** | 69 | ✅ |
| `app/src/utils/html.ts` | **40** | 40 | ✅ |
| `app/src/components/NotePreviewView.tsx` | **346** | 346 | ✅ |
| `app/src/components/RefineWorkbench.tsx` | **482** | 482 | ✅ |
| `app/src/utils/refineDiff.ts` | **107** | 107 | ✅ |
| `app/src/components/session-detail/SessionRawView.tsx` | **199** | （未列） | — |
| `app/src/motion/env.test.ts` | **243** | （未列） | — |
| `app/src/components/structuredBlocks.test.ts` | **92**（8 个 `it`：`:14/:21/:31/:38/:49/:59/:68/:82`） | （未列） | — |
| `app/src/views/useViewMemory.ts` | **70** | （未列） | — |
| `app/src/views/useViewMemory.test.ts` | **206** | （未列） | — |

**（b）逐条勘误（原锚 → 真锚）**

| # | 原锚（计划原文） | 真锚（E1 实测） | 依据（文件 + 官方行数 + 实测命令） | 受影响位点（已改正） |
|---|---|---|---|---|
| **E-1** | `structuredBlocks.ts:4 import { escapeHtml }` | **`:11`** | `structuredBlocks.ts`（**69**）· `probe.mjs`（正则 `^import \{ escapeHtml \} from "\.\.\/utils\/html"` ⇒ 恰 `:11`） | `Global Constraints` 的 C4.1/C4.2 压缩行 · `### 表 3` 的 `structuredBlocks` 4 导出行 · `### 表 6` X2/X3 · **T3** 卡的 Step 1 / V2 |
| **E-2** | `structuredBlocks.ts:6 export { escapeHtml };` | **`:13`** | 同上（正则 `^export \{ escapeHtml \};` ⇒ 恰 `:13`） | 同上 |
| **E-3** | `structuredBlocks.ts:9 renderLatex` | **`:16`**（`export function renderLatex`；注释在 `:15`） | 同上（正则 `renderLatex` ⇒ `:16` 定义行） | **T3** 卡的 Step 2（删整段的起行） |
| **E-4** | `structuredBlocks.ts:21 renderMarkdownTable` | **`:29`**（`export function renderMarkdownTable`；注释在 `:28`） | 同上 | **T3** 卡的 Step 2 |
| **E-5** | `structuredBlocks.ts:48 lowConfidenceClass` | **`:67`** | 同上（正则 `lowConfidenceClass` ⇒ `:67` 定义行） | **T2** 卡的 Step 2（僵尸导出那句） |
| **E-6** | `utils/html.ts:4 export function escapeHtml` | **`:11`** | `utils/html.ts`（**40**）· `probe.mjs`（正则 `export function escapeHtml` ⇒ 恰 `:11`） | C4 压缩行 · `### 表 6` X3 · **T3** 的 Step 1 / V2 · **T21** 的 Step 1 加注 |
| **E-7** | `utils/html.ts:14 renderTimestampAnchors` | **`:32`** | 同上（正则 `export function renderTimestampAnchors` ⇒ 恰 `:32`；文件末行 = `:40`） | `### 表 3` 的「缺口③」行 · **T15** 的 Step 1（现状摘录） |
| **E-8** | `NotePreviewView.tsx:5`（`escapeHtml` 消费者） | **`:16`**（`import { escapeHtml, renderTimestampAnchors } from "../utils/html"`） | `NotePreviewView.tsx`（**346**）· `probe.mjs`（正则 `from "\.\.\/utils\/html"` ⇒ 恰 `:16`） | C4 压缩行 · X3 · **T3** 的 Step 1 / V2 / 诚实边界 |
| **E-9** | `RefineWorkbench.tsx:6`（`escapeHtml` 消费者） | **`:25`**（`import { escapeHtml } from "../utils/html"`） | `RefineWorkbench.tsx`（**482**）· `probe.mjs`（同正则 ⇒ 恰 `:25`） | 同上 |
| **E-10** | `utils/refineDiff.ts:3`（`escapeHtml` 消费者） | **`:17`**（`import { escapeHtml, renderTimestampAnchors } from "./html"`） | `refineDiff.ts`（**107**）· `probe.mjs`（正则 `from "\.\/html"` ⇒ 恰 `:17`） | 同上 |
| **E-11** | `NotePreviewView.tsx:23 renderMarkdown` | **`:40`**（`function renderMarkdown(md: string, imageBaseUrl: string, dataDir: string): string`） | `NotePreviewView.tsx`（**346**）· `probe.mjs`（正则 `function renderMarkdown` ⇒ 恰 `:40`） | `### 表 4` 第 4 行 · `### 表 8` 的 **R2.3** · **T16** 的目标句 |
| **E-12** | `NotePreviewView.tsx:250 / :256`（两处 `dangerouslySetInnerHTML`） | **`:295` / `:301`** | 同上（正则 `dangerouslySetInnerHTML` ⇒ 恰 `:295` 与 `:301`，**全文件仅此两处**） | `### 表 4` 第 4 行的「生产调用点」列 |
| **E-13** | `NotePreviewView.tsx:37-44`（h2/h3/引用/li/p 的行级规则） | **`:64-72`**（h2 `:64` · h3 `:65` · 提示块 `:68` · li `:70` · p `:72`）；**图片分支在 `:61`**（`convertFileSrc` 在 `:56` / `:57`） | 同上（`probe3.mjs` 逐行打印 `:36-72`） | `### 表 6` X6 · **T15** 的 Step 2 · **T16** 的 Step 2（8 类样本的锚）· **T16** 的 V1 |
| **E-14** | `refineDiff.ts:61-66`（h2/h3/h4/li/p 的行级规则） | **`:81-86`**（h2 `:81` · h3 `:82` · h4 `:83` · li `:84` · p `:86`）；`mdLineHtml` 定义 **`:78`**（**这个锚是对的**）· `mdFallbackRows` `:73` · `renderSideHtml` `:90` · `renderDiffColumnHtml` `:95` | `refineDiff.ts`（**107**）· `probe.mjs` / `probe3.mjs` | `### 表 6` X6 · **T15** 的 Step 2 |
| **E-15** | `SessionRawView.tsx:5`（`lowConfidenceClass` 的 import） | **`:50`** | `SessionRawView.tsx`（**199**）· `probe3.mjs`（正则 `structuredBlocks` ⇒ `:29`(注释) / `:35`(注释) / **`:50`(import)**） | `### 表 3` 的「唯一活导出」行 · **T2** 的 Step 2 / V3 |
| **E-16** | `SessionRawView.tsx:91`（`className={lowConfidenceClass(...)}`） | **`:138`** | 同上（正则 `lowConfidenceClass` ⇒ `:50`(import) / **`:138`(用法)**） | `### 表 3` · **T21** 的 Step 1 加注（「唯一生产消费者 `:91`」） |
| **E-17** | `motion/env.test.ts:5`（import 源） | **`:34`**（`import { lowConfidenceClass } from "../components/structuredBlocks"`） | `env.test.ts`（**243**）· `probe3.mjs`（正则 `structuredBlocks` ⇒ 恰 `:34`） | `### 表 3` 的「镜像消费者」行 · **T2** 的 Files / Step 2 |
| **E-18** | `env.test.ts:126-131` 的 V6 对拍（`:127` 对 `LOW_CONFIDENCE_CLASS`） | **`:229-234`**（`it(` = `:229`；`toBe(LOW_CONFIDENCE_CLASS)` = **`:230`**；`:231` 是同一 `it` 内的类名形状断言） | 同上（`probe3.mjs` 逐行打印 ⇒ 该文件 `lowConfidence` 相关行 = `:16/:21/:34/:35/:184/:189/:192/:229/:230/:231/:234/:238/:239/:241`） | `### 表 3` · **T2** 的冻结值预算表 / V1 |
| **E-19** | `structuredBlocks.test.ts` 的 `lowConfidenceClass`「**4 条用例**（`:57-62`）」 | **1 个 `it`**（`:81` 的 `describe("lowConfidenceClass")` 下**唯一一个** `it` 在 **`:82`**），内部有 **4 条 `expect`**（`:86` / `:87` / `:88` / `:89`）⇒ **该文件共 8 个 `it`**（renderLatex **3** · renderMarkdownTable **4** · lowConfidenceClass **1**） | `structuredBlocks.test.ts`（**92**）· `probe4.mjs`（`it(` 行 = `:14,:21,:31,:38,:49,:59,:68,:82`，共 **8**；标识符出现行数 = renderLatex 5 / renderMarkdownTable 6 / lowConfidenceClass 6） | `### 表 3` 的「测试-only 消费者」行 · **T3** 的 Step 3（「4 条用例必须已搬」）· **T3** 的冻结值预算表（「1 条随 T2 搬」）· **T3** 的 V4 / **M4** 的期望读数 |
| **E-20** | `renderTimestampAnchors` 的「生产消费者 **13 处**」（`NotePreviewView.tsx:5/37/38/40/42/44` · `utils/refineDiff.ts:3/61/62/63/64/66`） | **2 个生产文件 / 10 个调用点**：`NotePreviewView.tsx` **`:64/:65/:68/:70/:72`**（5 处；另有 `:16` import、`:38` 是注释）· `utils/refineDiff.ts` **`:81/:82/:83/:84/:86`**（5 处；另有 `:17` import） | `probe4.mjs`（全 `app/src` `*.ts/*.tsx` 文本扫描，**按文件列出命中行**） | `### 表 3` 的「缺口③」行 |
| **E-21** | `NotePreviewView.tsx:37`（T16 的 `font-size:15px` 变异体注入点） | **`:64`** | 同 E-13 | **T16** 的 V1 的 **M1** |
| **E-22** | `structuredBlocks.ts:4/:6/:8/:9/:21/:48` 的**整体口径**（T3 卡的「摘 `:4` import + `:6` 再导出」与 Step 2 的「`:9` 的 `renderLatex` 整段 + `:21` 的 `renderMarkdownTable` 整段」） | **摘 `:11` import + `:13` 再导出**；**删 `:15-26`（renderLatex，含 `:16` 定义）与 `:28-54`（renderMarkdownTable，含 `:29` 定义）**；`katex` 的两条 import 在 **`:8` / `:9`**（**这两个锚原本就对，保留**） | `structuredBlocks.ts`（**69**）· `probe.mjs` | **T3** 卡的 Step 1 / Step 2 / 诚实边界 · `Global Constraints` 的 C4 压缩行 |

> 🔴 **纪律（§C12 第 5 条重申，本批常设）**：计划/报告里凡写「**与某方实测一致**」，**必须能指出是哪一条**；**指不出就不许写**。批 6 已登记 10 例，本批已有 **1 例（`### 表 6` 的 X2，即本表的来源）**，本表已**删除该不实归属**并把原记录**保留为勘误**。
> 🔴 **实施者纪律（派发书 §6 第 2 条）**：**任务卡里的任何行号锚，动手前一律自己重测**；与本表不符 ⇒ **按实测走**并在报告里逐字给出旧锚 / 新锚。

**（c）追加记录 · 非行号类与「控制方侧引述」类错误（控制方 2026-09-13 追加，体例同 §C12「保留错误记录、勿抹掉」）**

| # | 错误 | 性质 | 真值 / 处置 | 依据（E1 只读重测） | 受影响位点（已改正） |
|---|---|---|---|---|---|
| **E-23** | **控制方第 14 例**：控制方派发语逐字「**不要碰 `App/src/pages/SessionsPage.tsx` 的 prop（那是 T17 的活）**」 | 🔴 **与计划 `T1` 的 Step 6 冲突**（该步明确要求 T1 给 `SessionsPage` 加两个可选 props 并在 `App.tsx` 透传） | **派发语该句作废**，**以计划 T1 卡为准**：**T1 = 加类型 + `App.tsx` 两行透传 + `SessionsPage` 解构转交；消费逻辑留 T17**。理由（机器可判）：`app/tsconfig.json` 的 **`noUnusedLocals: true`** + **`noUnusedParameters: true`** ⇒ **不加那两行透传（或不接收/不使用）`tsc` 必红**（TS6133；控制方实测探针 **exit 2**） | `app/tsconfig.json`（`probe5.mjs` ⇒ `"noUnusedLocals": true`）· `App.tsx`（**599**）· `pages/SessionsPage.tsx` | **T1** 的 Step 6（已写入「以本卡为准」的作废声明）· 本节 |
| **E-24** | **计划方第 2 例错误**：`### 表 5` 的 **Y2** 行把 `toastMigration.test.tsx:146`（`toContain("durationMs={3500}")`）判为「**不改**」 | 🔴 **判错**：`durationMs={3500}` 在 **`AiToast` 的定义体内**（`App.tsx:198`）⇒ T1 把 `AiToast` 搬去 `shell/aiToast.tsx` ⇒ **该断言必红**（原行的"零改动反向声明"对本条不成立） | **Y2 行已改写为勘误并保留原文**；🔴 **新增四处授权改写**：`toastMigration.test.tsx:146`（**必改**，换被读文件）· `:126`（`barrelNames(App.tsx)` 含 `Toast` ≠ 搬走后）· `shell/TopBar.test.tsx:276`（`APP_CODE` 含 `placement="belowNav"`）· `shell/ShellFallback.test.tsx:174-175`（在 `App.tsx` 里 `indexOf("function PageSlot(")` 再切定义体）；`:117`（`App.tsx` 含 `<AiToast`）**确实不改**（调用点在 `App.tsx:549`） | `App.tsx`（**599**）`:50` / `:160` / `:186` / `:198` / `:199` / `:549` · `toastMigration.test.tsx`（**235**）`:117` / `:126` / `:146` · `TopBar.test.tsx`（**298**）`:276` · `ShellFallback.test.tsx`（**208**）`:174-175`（全部由 `probe5.mjs` 逐行打印复核） | **`### 表 5` 的 Y2 行（勘误）+ Y2-A/Y2-B/Y2-C/Y2-D 四行（新增授权）** · **T1** 的 Files / Step 2b / 诚实边界 |
| **E-25** | **🔴 跨文件改锚（控制方 §C17 复核更正了 E1 的第一版修法）**：原引 `nativeButton.ratchet.test.ts:268-273`（出现于 `## Global Constraints` 的 §C5.1 行 / **T10 的 V1** / **`## 陷阱` B4**） | 🔴 **原锚越界**（该文件**只有 265 行**）；🔴 **且 E1 的第一版真锚 `:199-200` 也是错的** —— 那是 **① 总量只减不增**（`:196-201`，语义 = **`总量 ≤ 常量`**），**不是** `常量 == Σ entries`。🔴 **这是「引错文件」而不是「引错行」** | ✅ **真锚 = `app/src/ui/primitives/buttonMigration.test.ts:268-273`**（该文件 **280** 行）：`:268` = `it("基线常量 == 逐文件 entries 之和（只改常量腾预算必红）", …)` · `:271` = 键数 `toBe(114)` · **`:272` = `expect(FROZEN_NATIVE_BUTTON_TOTAL, …).toBe(sum)`**。🔴 **变异体裁定（§C17.3，E1 在导出树实跑）**：`FROZEN_NATIVE_BUTTON_TOTAL 393 → 394` ⇒ **CONTROL 15/15 绿**、**MUTANT 14/15**，**唯一红点 = `buttonMigration.test.ts:272:93`**（「基线常量 394 ≠ 逐文件之和 393」），`nativeButton.ratchet.test.ts` **保持绿**（总量 392 ≤ 394）⇒ **旧写法会让变异体不红**并导致「判据没牙」的**错误结论** | `buttonMigration.test.ts`（**280**）· `nativeButton.ratchet.test.ts`（**265**）· `nativeButtonBaseline.ts:47`（常量）· 证据 = `tmp/e1/e25-control.json` / `tmp/e1/e25-mutant.json`（vitest `--reporter=json`）+ `tmp/e1/mutate-e25.mjs`（注入点自证恰 1 次）· 出处 = **控制方 §C17**（控制方第 16 例 = 原引越界；E1 第 1 版修法 = 引错文件） | `## Global Constraints` 的 C5.1 行 · **T9 的 Step 3 表** · **T10 的 V1（M1）** · `## 陷阱` B4 |
| **E-26** | `SessionScreenCards.tsx:96`（出现于 §C9.4 的「真·可解锁 4 处」引述 + 计划 T7 的两处） | 🔴 **偏 2 行** | `:96` 是 `id={\`ocr-…\`}` 行；**整圈边框在 `:98`**（`border: "1px solid #e5e7eb"`，style 块 `:97-103`，`background: "#fafafa"` 在 `:102`） | `session-detail/SessionScreenCards.tsx`（**193**）· `probe6.mjs`（逐行打印 `:88-104`）· 出处 = **控制方 §C9.4 的三处行号引述**（控制方侧同一错锚） | **T7** 的 `FROZEN_BORDER_TOTAL` 行 · **T7** 的迁移逐处表 |
| **E-27** | **计划方第 3 例错误**：T3 卡 Step 3 要求「`lowConfidenceClass` 的用例**已由 T2 搬到** `utils/lowConfidence.test.ts`」 | 🔴 **T2 卡没有这个文件、T2 也（正确地）没建它** ⇒ 原措辞会让 T3 依赖一个不存在的产物 | 🔴 **控制方 2026-09-13 裁决：授权 T3 自建** `app/src/utils/lowConfidence.test.ts`（内容 = `structuredBlocks.test.ts:82` 的**那 1 个 `it`**，内含 4 条 `expect` = `:86-89`）；理由 = **删除与迁移必须在同一单元内完成**（否则中间态丢用例） | `structuredBlocks.test.ts`（**92**，`it(` = `:14/:21/:31/:38/:49/:59/:68/:82`）· `probe4.mjs` · 出处 = **控制方追加裁决 2026-09-13** | **T3** 的 Files（新增该文件）· **T3** 的 Step 3 · **T3** 的冻结值预算表（用例数行） · **T3** 的 V4/M4 |
| **E-28** | **计划方第 4 例错误**：原计划把「改文件」（T1/T6/T7）与「补豁免表行数」（T11 集中做）**拆给不同单元** | 🔴 **设计缺陷**：`line-limits.mjs --full` 的 **(e) 判据 = 工作树实测 == 登记值**，而 husky pre-commit 扫**工作树** ⇒ **每一个中间提交都必然撞钩子** ⇒ 等于**强制全员 `--no-verify`**（把门禁变成形式）。**T2 与 T8 各自独立撞上，读数一致** | 🔴 **控制方 §C14 裁决**：**豁免表的行数列改由「改文件的那个单元」在同一提交里更新**；**T11 缩为只做非行数类维护**（拆法说明列 / 记录文案）；另给 **`--no-verify` 的条件式授权**（四条 + 「❌ 其余钩子失败 ⇒ STOP」，见 `## Global Constraints` 的「提交纪律」节），**权威证据 = T12/T22 在最终树上的串行八闸** | `.husky/pre-commit`（**20** 行，三条具名脚本，实测）· `scripts/line-limits.mjs`（**300**）的 (e) 判据 · 出处 = **控制方 §C14**（T2/T8 实测触发） | **T11** 的标题/目标/预算表/Files/Step 1–2/V1/V3/V6′/诚实边界 · **`### 段 7a 任务一览`** 的 T1/T6/T7/T10/T11 行 · **`> 🔴 热点文件的单写者约束`** 的豁免表行 · **`## Global Constraints` 的「提交纪律」节**（新增条件式授权） |
| **E-29** | **计划方第 5 例错误**：T4 卡 Step 4 写「**分支 A**：**三条**各加 `#[allow(dead_code)]`」 | 🔴 **实测是 4 条**：第 4 条是**传递受害的私有 helper `normalize_source`**（其**唯一调用方**就是已撤下的 `add_session_segment`）⇒ **只加 3 处会留 1 条新告警** ⇒ clippy **集合差异非空** ⇒ 违反「只许持平」（C5.1） | 🔴 **T4 卡已改为**：「**按 `cargo build` 实测逐条添加** —— 实测 4 条（三条撤下命令 + 传递受害的 helper；**4 条是实测值、不是上限**）」 | `commands_session.rs`（**443**）· T4 报告 §3.5 / §5.2（控制方已采信）：`cargo build` 实测 **4 条** `dead_code`、加 allow 后 **0 条**；`cargo clippy --all-targets` **19 条唯一诊断（lib 15）SET-IDENTICAL** | **T4** 的 Step 4 · **T4** 的冻结值预算表（clippy 行） |
| **E-30** | **计划方第 6 例错误**：计划的「提交纪律」与 `rulings.md` **§C18.2** 矛盾 —— 原 `:188` 强制的正是**首波事故的机理**（`git commit --only -- <paths>` **只按路径取工作树内容、不看暂存区** ⇒ 共享文件的工作树永远含别人的在飞改动），且它把 `--no-verify` 列进「禁止」清单、而同一段的 §C14 条又**条件式授权**它 ⇒ **同段自相矛盾** | 🔴 **机理实证**：首波 **`fa45caf1` 带走了 T4 的 2 行**（该树 `line-limits --full` exit 1，由 `39f74e4f` 闭合） | ✅ **已对齐 §C18.2**：共享文件改走 **blob 构造**（`git show HEAD:<path>` → 只改自己那几行 → `git hash-object -w` → `git update-index --cacheinfo 100644,<blob>,<path>` → `git diff --cached --stat` 自证 → `git commit` **不带 `--only`**）；**新建 / 普通改动** = `git add -- <自己的路径…>` 后 `git commit`（**不带 `--only`**）；**`--only` 只许用于确无他人共享的文件**；保留廉价前置检查 `git diff HEAD -- <path>`（出现别人的 hunk ⇒ **必须** blob 构造或 STOP）；**`--no-verify` 从禁止清单移出**、改指 §C14 的四条条件式授权；**`git restore --staged <path>` 允许**，`git restore <path>` / `git checkout -- <path>` **仍禁止** | `rulings.md` §C18.1/§C18.2（权威文本）· 事故 `fa45caf1` / 闭合 `39f74e4f` | `## Global Constraints` 的「提交纪律」节（`:188` 起）· 「每个拆分任务的统一作业模式」第 8 条 · **T3** 的 Step 3（删除文件的带走方式） |

**（d）全量重推的范围与结果（§C12「每一条都要有」的落实）**
| 项 | 读数（2026-09-13，基线 `681e73c6`，只读） |
|---|---|
| 计划里的**文件类锚**（`path:NN` 形式） | **281 条**（含同一锚的重复出现）；去重后**源码类 165 条** |
| **裸锚**（仅写 `` `:NN` ``、靠上下文文件解析） | 去重后 **386 条** |
| 仪器 | `anchors-baseline.mjs`（文件类，带正控/负控）· `bare.mjs`（裸锚，按「本行最近的文件名 → 否则向上 25 行内最近的文件名」解析）· `windows.mjs --compact`（铺开判读） |
| **判为错锚**（已逐条改正） | **E-1 – E-22（行号类，22 条）+ E-25 / E-26（控制方侧引述的错锚，2 条）** = **24 条** |
| **重推为正确、无需改** | 其余全部（含 `structuredBlocks.ts:8/:9`、`refineDiff.ts:73/:78/:90/:95`、`SessionDetailPanel.tsx:101/:145/:87`、`NoteHeaderActions.tsx:55-60/:61-79/:62-65/:64/:97/:109`、`NoteColorPicker.tsx:2/:74-96`、`NoteListToolbar.tsx:82/:87-88`、`db_colors.rs:22/:39-42/:43/:56-65/:59/:68-73`、`commands_colors.rs:14/:20/:41`、`useLiveCaptureControl.tsx:42/:182-187`、`LiveProfileStrip.tsx:178-181`、`Text.css:63-66`、`motion.css:272/:299/:325`、`App.tsx:50/:160/:186/:198/:199/:240/:549/:223`、`nativeButton.ratchet.test.ts:25/:182/:203-214/:255-263`、`CommandPalette.kb.test.tsx:32/:161-185/:163-166/:174-175/:180`、`useNotesDeepLink.test.ts:145/:148/:158-170/:159`、`topBar/shellFallback/…` 五条源码文本判据、`NoteMarkdown.tsx:30-39/:51/:54-63/:60`、`noteViews.test.tsx:281-282/:285/:286`、`ChatMessageList.tsx:117/:146`、`TaskConversationView.tsx:189`、`SessionRawView.test.tsx:10/:38/:112`、`html.test.ts:56-103`、`NotesPage.test.tsx:165`、`NotesPage.tsx:234/:273`、`motion-coverage.test.ts:72/:103`、`env.test.ts:34/:229-234/:230`、`env.ts:44`、`db_migrations.rs:279-282`、`registry.ts:80-85`、`architecture.slots.test.ts:42-48/:81-99`、`architecture.guard.test.ts:100-103`、`check-bundle-budget.mjs:32/:205`、`check-command-registry.mjs:22/:95`、`line-limits.mjs:23/:48-52`、`dialogMigration.e.test.ts:115-122/:252-253`、`surfaceBaseline.ts:134`、`textRatchet.test.ts:11`、`style-seams.test.ts:44`、`RefineWorkbench.tsx:324/:442/:457/:470`、`NotePreviewView.tsx:16/:40/:64-72/:295/:301`、`html.ts:11/:32`、`RefineLaunchDialog.tsx:237`、`SessionScreenCards.tsx:98`、`ClassroomPage.tsx:96`、`commands_video.rs:243`、`ProfileDetector.tsx:194/:196-200`、`video_profile_memory.rs:28`、`live_*.rs` 的三条正控、`kbCommands.ts:116` / `useKbPaletteSearch.ts:61` / `CommandPalette.tsx:127`、`structuredBlocks.test.ts:82` …） |
| ⚠️ **残余不确定** | **裸锚的「上下文文件解析」是启发式的**（`bare.mjs` 的解析规则写在头注里）⇒ 其 386 条中**解析到错误文件**的条目会产生假阳性（如 `v0.22:123` / 规格 `:824` / `§9 :694` 这类**跨文件**引用被算到相邻源码文件上）。⇒ 🔴 **实施者仍须对自己任务卡里的每个锚自测**；本节只保证「**已判为错锚的 24 条**」是逐条复核过的 |
| **归档** | `tmp/e1/anchors-base.txt`（文件类全量判读）· `tmp/e1/windows-compact.txt`（165 条锚 × 基线原文）· `tmp/e1/bare.txt`（386 条裸锚）· `tmp/e1/probe*.txt`（定向复核） |

---

## 逐项映射表（C7.2 第 1 条 + C10.7：**Q1–Q20 全部有裁决，无遗留未决项**）

> **口径**：三路侦察汇总的登记项 = **recon-B §B1.1–§B1.12（12 组）+ recon-A 的 §A5 偏差 10 条 + recon-c 的必裁点 8 条 + C10.7 的 Q1–Q20**。下表**每一条**都落到 **7a / 7b / 不做（+理由）** 之一。

### 表 7 · Q1–Q20 的落位（C10.7 逐条对应；**这是控制方的映射表，本计划逐条落地**）

| Q | 主题 | 裁决 | 本计划落位 | Q | 主题 | 裁决 | 本计划落位 |
|---|---|---|---|---|---|---|---|
| **Q1** | 12 条计数 | §C9.1 | **T20**（10 条逐条）+ **T21**（状态更正注） | **Q11** | `CommandPalette.kb` 授权 | §C9.9 | **T1** |
| **Q2** | 撤 IPC 口径 | §C0.1 + §C0.3 + §C1.1 | **T4** | **Q12** | `App.tsx` 拆件 / 交付边界 / 自动切视图 | §C9.2 + §C10.3 | **T1** + **T17** |
| **Q3** | 命名与死代码 | §C1.1 | **T4** | **Q13** | 懒侧预算 + 等号断言 | §C9.6 + §C9.7 + §C10.4 | **T8 + T9** |
| **Q4** | `structuredBlocks` | §C4.1/§C4.2 | **T2 + T3** + **T21**（授权逐字） | **Q14** | 规格前置算不算交付 | §C9.10 + §C9.17 + §C9.18 | **T20** |
| **Q5** | 环境层第③件 | §C4.2（留 + 加宽到 ≥2） | **T2**（析出）+ **T17**（加宽） | **Q15** | 音频两条 | §C7.3 | **不做**（**T21** 登记「待产品裁决」） |
| **Q6** | 档位通道新命令 | §C3.1（做完整；registry 净 **+1**） | **T19** | **Q16** | `docs/tech-debt/` | §C7.3 | **不做**（非目标 1） |
| **Q7** | `tag_colors` 口径 | §C2.3（幂等回填 + 确定性取色） | **T18** | **Q17** | 「批 7」重载 | §C9.0 | **`## 陷阱` #B10-①** |
| **Q8** | markdown 归一定位 | §C10.1 + §C10.2 | **T13 → T17** | **Q18** | 35 文件表同步 | §C9.8 | **T18/T20**（预计 0 处） |
| **Q9** | 标签 UI 落点死结 | §C2.1 | **T18** | **Q19** | 补 UI 逐条真做 | §C10.5（全做 10/10） | **T20** |
| **Q10** | Surface 两条 | §C9.4 + §C9.5 + §C10.8 | **T7** | **Q20** | 散文漂移 | §C10.6 | **T10 + T11** |

### 表 8 · 侦察登记项的逐条落位（recon-B §B1.1–§B1.12 + recon-A §A5 + recon-c 必裁点）

| # | 侦察条目（出处） | 落位 | 承载任务 | 依据 |
|---|---|---|---|---|
| **R1** | **`Surface` 两条**（recon-B §B1.1 = D12） | **7a** | **T7** | **C9.4 + C10.8**（两条都做、7a 内做完；**先自测逐处名单**；21 只作量级） |
| **R1.1** | ① DOM 属性透传（`dangerouslySetInnerHTML` ×2 + `id` ×1） | **7a** | **T7** | C9.4（受控槽 `html?` / `domId?`，**不开 `...rest`**） |
| **R1.2** | ② 透明容器（≈21 处） | **7a** | **T7** | C9.4 + **C10.8**（逐处名单 + 正控/负控 + 修仪器两缺陷 + 按实测登记） |
| **R2** | **markdown 归一**（recon-B §B1.2 = C8 / Q8） | **7b** | **T13 → T17** | **C10.1 + C10.2**（终态 2 套活） |
| R2.1 | #2 `ChatMessageMarkdown` → #1 `NoteMarkdown` 后删除 | **7b** | **T13**（拆 `#1`）→ **T14**（并入删除） | **C10.1**（**必须先拆 `NoteMarkdown.tsx`**） |
| R2.2 | #3 `refineDiff.ts:78 mdLineHtml` | **7b** | **T15**（迁入 `markdownLine.ts`） | **C10.1**（"迁入新模块"） |
| R2.3 | #4 `NotePreviewView.tsx:40 renderMarkdown`（**E1 实测**；原写 `:23` —— `### 表 6b` 的 **E-11**） | **7b** | **T16**（表征测试）→ **T17**（迁入） | **C10.1**（🔴 **不换成 react-markdown**） |
| R2.4 | #5 `structuredBlocks.ts` | **7a** | **T2 + T3** | **C4.1/C4.2** |
| **R3** | **笔记「带证据三轨」**（recon-B §B1.3 = C17① / Q14） | **7b（只交规格章）** | **T20** | **C9.17**（规格须逐字写「本批只交规格，实现未做」） |
| **R4** | **`{value,key}` 全量统一**（recon-B §B1.4 = C6） | **7a（最小形态）** | **T1** | **C9.2 + C9.9**（只补「同值重复跳转」这**一个**缺口；其余 5 个字段的形态改造**不做** —— 会让 `:176` 正则失配，且 C9.9 只授权"只增"） |
| R4.1 | 5 个粘滞字段的 `{value,key}` 声明形态改造 | **不做（本批）** | — | 同上；**登记进 `## 诚实边界` 的「本批未做」**，去向批 8 |
| R4.2 | `CommandPalette.kb.test.tsx:173-181` 的改写 | **7a** | **T1** | **C9.9**（授权「只增不减」；**Y3**） |
| **R5** | **`b1-non-migrated` 与 B1/B2 守卫范围**（recon-B §B1.5） | **不做（本批）** | — | **C2.1 / Q9**：**不开 B1/B2 例外**；侦察 B 的 Q1–Q4 四问**全部按「维持」执行**（批 4 B21 + 批 5 C7 已两次判「维持」） |
| **R6** | **五类棘轮余量**（recon-B §B1.6） | **7a（清扫）+ 7b（真实迁移）** | **T10** + **T7/T17/T18/T20** | **C5.3 + C5.1 + C9.7** |
| **R7** | **采集期「逐段显影」**（recon-B §B1.7 = R5.2 连带） | **7a（拆）→ 7b（挂动效）** | **T6** → **T20** | **C9.16** |
| **R8** | **芯片无点击**（recon-B §B1.8）+ **#3/#4 可点** | **7b** | **T15**（行渲染器改一处）+ **T17**（容器侧事件委托） | **C10.2**（✅ **`RefineWorkbench` 侧不再算残余**；**本批不得**再出现「只通一半」） |
| **R9** | **`[[ts:ms]]` 会话页那一跳**（recon-B §B1.9 = C9.2 的"三缺二"） | **7b** | **T17** | **C9.2 + C10.2 + C10.3** |
| R9.1 | 缺口① `App.goSessions` 丢 ms | **7b** | **T17** | T1 已备 `focusSeekMs` 字段与 `goSessions` 的第二参（见 T1 的最终形态说明） |
| R9.2 | 缺口② `NoteCardFlowView` 未传 `onOpenSessionAt` | **7b** | **T17** | **C10.3** ⇒ **包装件形态**（见 `### 表 6` X7） |
| R9.3 | 缺口③ 两条手写链的芯片不可点 | **7b** | **T15 + T17** | **C10.2** |
| R9.4 | 「深链到达后是否自动切三轨视图」 | **7b** | **T17** | **C10.3 逐字「做」**；**只许走既有 `views/registry.ts` / `useViewMemory`** |
| **R10** | **`lowConfidenceClass` 析出 + 懒侧门禁**（recon-B §B1.10 = T34 §13 / Q13） | **7a** | **T2 + T3 + T8 + T9** | **C4.2/C4.3 + C9.6 + C10.4** |
| **R11** | **音频两条**（recon-B §B1.11 = PB1 / Q15） | **不做（本批）** | — | **C7.3 / Q15**：**产品裁决** |
| **R12** | **「审校模式」/ `ink-4`**（recon-B §B1.12 = R6.2 / Q14） | **7b（只交规格定义）** | **T20** | **C9.18** |
| **A-1** | §9 #14 `kb_search` 已在批 3 交付（recon-A §A5①） | **不做**（已交付） | — | **C9.1** + **T21** 的状态更正注 |
| **A-2** | §9 #46 `update_fragment_group` 记录已在批 1 修正（recon-A §A5②） | **不做记录**；**命令本身接线** | **T20** | **C9.1**（10 条之一）+ **T21** |
| **A-3** | §14 `:919` REQ-201 修正已做一半 | **不做** | — | 「新增 REQ 登记」是每批开工轮的常设动作 |
| **A-4** | 批 1 计划 `:206`「只删注册行」与门禁冲突 | **7a** | **T4** + **T21**（登记） | **C0.1 / C1.1**（X1） |
| **A-5** | `create_session` 的「25 处调用」是子串假活 | **7a** | **T4**（报告须自己重跑双侧零引用普查） | **C1.1 逐字** |
| **A-6** | `#29/#31/#43` 三条「有意保留」的理由仍成立 | **不做**（核对通过） | **T5** | 状态未变，**只登记** |
| **A-7** | `#34 analyze_session_command` 的落点存在但出参零对应 | **7b** | **T20**（**必须给「展示面设计 + 验收判据」**） | **C10.5 逐字** |
| **A-8** | §12 `:864` / `:868` 的口径已变 | **7b** | **T14**（归一落地）+ **T21**（§12 去向加注） | **C6.3** |
| **A-9** | §11-7 进度注的数字已漂移 | **7b** | **T21** | **C6.3** |
| **A-10** | §9 `:694`「仅 `lib.rs` 的 `generate_handler!`」位置已搬 | **7b** | **T21** | **C6.3** |
| **C-1** | 「批 7」重载 93 处 | **常设纪律** | 全部任务的报告字段 | **C9.0** |
| **C-2** | 3 个守卫路径 + 2 个贴边文件路径在简报里写错 | **7a** | **本计划已逐条更正**（`### 表 3` + 贴边表） | 以本计划者的实测路径为准 |
| **C-3** | 「带斜杠的 `git check-ignore` 假阳性」**未能复现** | **不做**（不作为既定事实） | — | 改用 `.superpowers/**` 三仪器不可靠这条**已双侧自证**的纪律 |
| **C-4** | `cargo test` 唯一入口 = `--test app_lib_tests` | **7a/7b** | **T12 / T22** | 与 C6.2 的基线口径一致 |
| **C-5** | `bundle-eager-graph` 的 `--keep-type-only` 口径**无法用已入库仪器复现** | **登记** | **T22** 的诚实边界 | 本批只给默认口径读数 |
| **C-6** | `motion.css` **335 行、`.css` 结构性在门禁视野外** | **登记** | `## Global Constraints` 行数纪律 | 不是缺陷，是口径事实；本批**不往 CSS 里推新 token** |

> **✅ 覆盖率自检**：**Q1–Q20（20 条）+ R1–R12（12 组，含 8 个子项）+ A-1–A-10（10 条）+ C-1–C-6（6 条）= 56 条**，**逐条有落位**。**未分配项 = 0**。**「不做」共 6 条**（R4.1 · R5 · R11 · A-1 · A-3 · Q15/Q16），**理由逐条给出**。

---

## 文件触达普查 → 拆件清单（C7.2 第 3 条：**每个待拆文件必须列出是哪些条目要求动它**）

### 表 9 · 逐条目 × 文件触达矩阵（只列**会被改动**的文件）

| 文件（实测行数） | 要求动它的条目 | 动因 | 是否需要先拆 |
|---|---|---|---|
| **`app/src/App.tsx`（599）** | **R4**（`focusSeekMs`）· **R9.1**（`goSessions` 加 ms） | 两项都要往这 599 行里加/改行 | 🔴 **是** ⇒ **T1**（目标 ≤550） |
| **`app/src/components/NoteMarkdown.tsx`（295）** | **R2.1**（#2 并入 #1） | 并入的净增不许挤进那 5 行（C10.1 逐字） | 🔴 **是** ⇒ **T13** |
| **`app/src/components/LiveActivityPanel.tsx`（513）** | **R7**（采集期逐段显影） | 7b 要挂 `useRevealChoreography` + 每行 `ref` | 🔴 **是** ⇒ **T6** |
| **`scripts/check-bundle-budget.mjs`（299）** | **R10**（懒侧门禁） | 加门禁判据 | 🔴 **是** ⇒ **T8** |
| `app/src/ui/primitives/style-seams.test.ts`（299） | **R1.2** | `SURFACE_CLASSES` 枚举 +1 | ⚠️ **不拆**，**净增必须 = 0** ⇒ **T7** 就地改写 |
| `app/src/ui/primitives/surfaceBaseline.ts`（261） | R1.1 / R1.2 / R6 | 三族常数 + 逐文件表 + 锚 | **不拆**（余 39） |
| `app/src/ui/primitives/surfaceResidual.ts`（184） | R1.1 / R1.2 | 登记 + 收紧 | **不拆**（余 116） |
| `app/src/components/NoteHeaderActions.tsx`（122） | **标签线**（§C2） | 加标签编辑入口 | **不拆**（余 178）；🔴 **冻结值已满两格**（见 T18 预算表） |
| `app/src/hooks/useLiveCaptureControl.tsx`（298） | **档位通道** | `CaptureStartArgs` + `invoke` 载荷 | **不拆**，**净增 ≤ +2** |
| `app/src/utils/refineDiff.ts`（107） | R2.2 | `mdLineHtml` 迁出 | **不拆** |
| `app/src/components/NotePreviewView.tsx`（346） | R2.3 / R8 | 迁出渲染链 + 可点芯片 | **不拆**（已登记；**净减**） |
| `app/src/views/note/noteViews.test.tsx`（295） | R2.1 | 站点断言改写（**Y4/Y5/Y6**） | **不拆**，净增 ≤ +5 |
| `app/src/utils/html.test.ts`（103） | R8 / C10.2 | 5 条 `renderTimestampAnchors`（**Y8**） | **不拆** |
| `app/src/pages/NotesPage.test.tsx`（174） | R8 / C10.2 | 选择器改写（**Y9**） | **不拆** |
| `app/src/components/notes/NotesReadingColumn.tsx`（294） | R9.2 | 包装件接线 | **不拆** |
| `app/src/components/SessionDetailPanel.tsx`（200） | R9.4 | 自动切三轨（`setViewKey("tritrack")`） | **不拆** |
| `app/src/views/session/SessionTriTrackView.tsx`（297） | R10（低置信第 2 点） | +1 import +1 `className` | **不拆**，净增 ≤ +3 |
| `app/src-tauri/src/app_commands.rs`（479） | §C1 / §C3 | −3 行注册 + 1 行注册 | **不拆**（数据文件，豁免表 `:45` 明写「不拆」） |
| `app/src-tauri/src/commands_live.rs`（399）· `commands_video.rs`（311）· `video_profile_memory.rs`（228）· `db_colors.rs`（79）· `db_migrations.rs`（573） | §C1 / §C3 / §C2.3 | Rust 侧改动 | **不拆**（`db_migrations.rs` 距 600 余 27 ⇒ **T18 优先把回填放 `db_colors.rs`**） |
| **六棘轮判据件 + `dialogMigration.e.test.ts`（300）+ `buttonMigration.test.ts`（280）+ `zIndex.guard.test.ts`（262）+ `emptyStateRatchet.test.ts`（296）** | **本批零改动的条目** | — | 🔴 **不拆、不动** |

### 表 10 · 本批的拆件清单（**4 条来自上表的 🔴**）

| 拆件对象 | 要求动它的条目 | 目标结构 | 台账同步（C9.19） | 任务 |
|---|---|---|---|---|
| **`App.tsx` 599 → ≤550** | R4 · R9.1 | 抽出 ① `shell/PageSlot.tsx` ② `shell/aiToast.tsx` ③ `shell/focusRouting.ts`（**只放类型 + 纯函数**） | 🔴 **不涉原生 `<button>`** ⇒ **`SPLIT_MOVES` 零新增**；`FROZEN_BORDER_BY_FILE["App.tsx"]` 若随搬迁变化 ⇒ **必须改键 + 逐键 diff**（C9.19 第 2 条） | **T1** |
| **`NoteMarkdown.tsx` 295 → 拆出组件映射** | R2.1 | 把自定义 markdown 组件映射（标题/段落/链接/图片/代码/表格/任务项）抽到 `components/noteMarkdownComponents.tsx`（**工厂函数**，吃 `note` / `searchQuery` / 回调） | 🔴 **必核**：`noteViews.test.tsx:281-286` 的**站点计数按文件**（拆分后 `NoteMarkdown.tsx` **不得**再新增 `react-markdown` 说明符行）；`FROZEN_*_BY_FILE` 若该文件有键 ⇒ 逐键迁移 | **T13** |
| **`LiveActivityPanel.tsx` 513 → ~250–300** | R7 | 拆 `components/LiveTranscriptStream.tsx` + `components/LiveOcrPreview.tsx` | 🔴 **必动三处**（C9.16）：① `nativeButtonBaseline.ts` 的 `SPLIT_MOVES` **+逐键迁移** ② `surfaceBaseline.ts` 的逐文件格（边框 2 / 圆角 1 / 字号 8 / 弱化灰 2）③ `line-limit-exemptions.md:38` 的登记行 | **T6** |
| **`check-bundle-budget.mjs` 299 → 加门禁前先拆** | R10 | 拆 `scripts/lib/bundleMeasure.mjs`（`measure` / `firstScreenChunks` / `staticDeps` / `listAssets` / `gzip` 口径） | ⚠️ **`.mjs` 不在六棘轮域内** ⇒ **零台账**；但 `--self-test` 必须逐字通过、`--no-build` 读数**逐字不变** | **T8** |
| `dialogMigration.e.test.ts` 300 / 300 | **无**（本批零改动） | — | — | **不拆**（C5.2；本批无此需要 —— 原指向「`## 待控制方裁决` #7」是**错指针**） |

---

## 波次总表

> **双段、同一收口**。**段内可并行，跨段串行**（7b 依赖 7a 腾出的行数与拆出的新家；且 7b 的 markdown 归一有**严格先后链**）。
> **依赖列 = 必须「已提交」而不是「工作树已改」**。**`NON_MIGRATED_14` 全批只读。**

### 段 → 任务号

| 段 | 主题 | 任务号 | 状态 |
|---|---|---|---|
| **段 7a · 拆件与前置** | `App.tsx` 拆件 · 渲染器析出 · `structuredBlocks` 逐导出裁决 · 撤下 IPC 3 条 · 零产品风险核对 · 采集期拆件 · 簇 A（Surface 两条）· `check-bundle-budget` 拆件 + 懒侧门禁 · 散文漂移微单元 · 豁免表同步 · 段门禁自证 | **T1 – T12**（12 个） | ✅ **本文件已写完** |
| **段 7b · 功能落地** | `NoteMarkdown` 拆件 → #2 并入 → `markdownLine` → `NotePreviewView` 表征测试 + 迁移 → `[[ts:ms]]` 三缺二 + 自动切三轨 → 标签线 → 档位通道 → 低置信第 2 点 + 采集期显影 → 规格章两篇 + 补 UI 全做 → 规格回写 → 全批收口 | **T13 – T22**（10 个） | ✅ **本文件已写完** |

> **🔴 编号纪律**：**7a 固定占用 T1–T12，不得重排或复号**；**7b 从 T13 起连续编号**。
> **🔴 段边界不可破**：`App.tsx` 拆件（T1）**必须在 7a 内完成**（C9.2）；**7a 不得以「全批收口」结束**（C7.1）。

### 段 7a 任务一览（T1–T12）

| Task | 内容 | 依赖 | 可否并行 | 改的文件（热点加粗） | 预估提交 |
|---|---|---|---|---|---|
| **T1** | **`App.tsx` 拆件到 ≤550**（C9.2）+ `focusSeekMs`：抽 `shell/PageSlot.tsx` + `shell/aiToast.tsx` + `shell/focusRouting.ts`；`CommandPalette.kb.test.tsx` 的 10 字段名单**只增**；`toastMigration.test.tsx:34` 的 import 源 | — | ❌ **独占 `App.tsx`** | **`app/src/App.tsx`（599）** · 新建 `app/src/shell/PageSlot.tsx` · 新建 `app/src/shell/aiToast.tsx` · 新建 `app/src/shell/focusRouting.ts` · `app/src/components/toastMigration.test.tsx` · `app/src/shell/TopBar.test.tsx` · `app/src/shell/ShellFallback.test.tsx` · `app/src/shell/CommandPalette.kb.test.tsx` · `app/src/pages/SessionsPage.tsx` · 🔴 **`docs/standards/line-limit-exemptions.md`（只改 `App.tsx` 那一行，§C14）** | 3 |
| **T2** | **渲染器析出**：新建 `app/src/utils/lowConfidence.ts`；改 2 个 import | — | ✅ 与 T3–T5 | 新建 `app/src/utils/lowConfidence.ts` · `app/src/components/session-detail/SessionRawView.tsx`（199）· `app/src/motion/env.test.ts`（243） | 1 |
| **T3** | **`structuredBlocks` 逐导出裁决落地**（C4.2）：摘 **`:11`** import + **`:13`** 再导出；删 `renderLatex`/`renderMarkdownTable`（`:15-26` / `:28-54`）+ 两个 `katex` import（`:8`/`:9`）；删模块与其测试 | T2 | ❌ 与 T2 串行 | **删** `app/src/components/structuredBlocks.ts`（69）· **删** `app/src/components/structuredBlocks.test.ts`（92） | 1 |
| **T4** | **撤下 IPC 3 条**（C1.1）+ **`:45` 散文 313 → 310**（同批，C10.6） | — | ✅ 与 T2/T3/T5 | `app/src-tauri/src/commands_session.rs`（443）· **`app/src-tauri/src/app_commands.rs`（479）** · `docs/standards/line-limit-exemptions.md`（234） | 1 |
| **T5** | **零产品风险登记核对**（证据型，零生产代码） | — | ✅ 与 T2–T4 | 0（产出 `tmp/t5/**` + 报告） | 0–1 |
| **T6** | **采集期拆件**（C9.16 的 7a 半）：拆 `LiveTranscriptStream.tsx` + `LiveOcrPreview.tsx`；**纯搬迁不改行为**；三处台账 | — | ✅ 与 T2–T5 | **`app/src/components/LiveActivityPanel.tsx`（513）** · 新建 2 件 · `nativeButtonBaseline.ts`（182）· `surfaceBaseline.ts`（261）· 🔴 **`docs/standards/line-limit-exemptions.md`（只改 `LiveActivityPanel.tsx` 那一行：行数 + 拆法说明；§C14）** | 2 |
| **T7** | **簇 A：`Surface` 两条**（C9.4 + C10.8）：受控槽 + 「只出边框」档；**先自测逐处名单**；迁移 + 走 `C9.5` 登记制 | T6（同 `surfaceBaseline.ts` 写者队列） | ❌ 与 T6/T10 串行 | **`Surface.tsx`（98）** · `Surface.css`（85）· `Surface.test.tsx`（175）· **`surfaceBaseline.ts`（261）** · **`surfaceResidual.ts`（184）** · **`style-seams.test.ts`（299，净增 0）** · `style-contract.test.ts`（296）· 逐处名单里的调用点 · 🔴 **`docs/standards/line-limit-exemptions.md`（仅当本任务改动的已登记文件的行数变化 ⇒ 只改它那一行；§C14；无变化则不动）** | 3 |
| **T8** | **`check-bundle-budget.mjs` 拆件**（C9.6 第 4 条）：`measure` 族搬 `scripts/lib/bundleMeasure.mjs`；**读数逐字不变** | — | ✅ 与 T2–T7 | **`scripts/check-bundle-budget.mjs`（299）** · 新建 `scripts/lib/bundleMeasure.mjs` | 1 |
| **T9** | **懒侧字节门禁**（C9.6 + C10.4）：族前缀清单等式 + 逐族上限 + 懒侧总上限；**基线 = 今天实测 36 chunk / 698.86 kB**；**自证有牙** | T8 | ✅ 与 T6/T7/T10（只碰 `scripts/**`） | `scripts/check-bundle-budget.mjs` · 新建 `scripts/lazyBudget.json` · `docs/standards/performance.md`（167，+≤8 行） | 2 |
| **T10** | **散文漂移 doc/comment-only 微单元**（C10.6 的第 1–5 项）：**清单 5 项逐字修正**，**不含任何代码改动** | T3/T6/T7（被点名文件已定型） | ❌ 与 T7 串行（`surfaceBaseline.ts`） | `docs/versions/v0.22.md` · `app/src/ui/primitives/nativeButton.ratchet.test.ts`（265）· `textBaseline.ts`（297，**净增 0**）· `surfaceBaseline.ts`（261）· `textRatchet.test.ts`（270）· 🔴 **`docs/standards/line-limit-exemptions.md`（仅当上述文件是"已登记文件"且行数变化 ⇒ 只改它那一行；§C14；本任务设计净增 0 ⇒ 预计不动）** | 1 |
| **T11** | **豁免表的非行数类同步**（§C14：行数列**不**在本任务）—— 拆法说明列 / 记录文案 + `scripts/check-exemption-prose.mjs` 对拍探针<br>🔴 **`:45` 的「313 条」也不在本任务**（它在 T4 改 310、T19 改 311） | T1 · T6 | ✅ 与 T10 | `docs/standards/line-limit-exemptions.md`（**只改非行数列**）· 新建 `scripts/check-exemption-prose.mjs` | 1 |
| **T12** | **7a 段门禁自证**：八闸**串行**真跑 + 逐条读数 + 「7a 段终态」声明（**不得**写成批 7 已交付） | T1–T11 | ❌ 最后 | 0 生产代码（产出 `tmp/t12/**` + `task-12-report.md`） | 0–1 |

**预估 7a 提交数 = 16–18**。

### 段 7b 任务一览（T13–T22）

| Task | 内容 | 依赖 | 可否并行 | 改的文件（热点加粗） | 预估提交 |
|---|---|---|---|---|---|
| **T13** | **拆 `NoteMarkdown.tsx`**（C10.1 逐字「#2 并入前必须先拆」）：把自定义组件映射抽到 `components/noteMarkdownComponents.tsx`（工厂） | — | ✅ 与 T18/T19 | **`app/src/components/NoteMarkdown.tsx`（295）** · 新建 `app/src/components/noteMarkdownComponents.tsx` | 1–2 |
| **T14** | **#2 并入 #1 + 删 `ChatMessageMarkdown`**（C10.1）：3 个消费点改 `NoteMarkdown`；`noteViews.test.tsx` 的三条站点断言机械改写（**Y4/Y5/Y6**） | T13 | ❌ 与 T15 串行（同 `NoteMarkdown`） | **删** `app/src/components/ChatMessageMarkdown.tsx`（52）· `app/src/components/ChatMessageList.tsx` · `app/src/components/TaskConversationView.tsx` · **`app/src/views/note/noteViews.test.tsx`（295）** · `app/src/components/NoteMarkdown.tsx` | 2 |
| **T15** | **新建 `utils/markdownLine.ts`：两支手写链合成一支 + 芯片可点（C10.1 + C10.2 的一次性修复）** | T14 | ❌ 与 T14 串行（同 `NoteMarkdown` 无关，但**与 T17 有共享的 `html.test.ts`**） | 新建 `app/src/utils/markdownLine.ts`（预算 ≤240 行）· `app/src/utils/html.ts`（40）· `app/src/utils/html.test.ts`（103，**Y8**）· `app/src/utils/refineDiff.ts`（107） | 2 |
| **T16** | **`NotePreviewView.renderMarkdown` 表征测试（C9.3 + C10.1 的顺序不可倒）** | T15 | ✅ 与 T18/T19 | 新建 `app/src/components/NotePreviewView.render.test.ts`（预算 ≤220 行） | 1 |
| **T17** | **#4 迁入 `markdownLine` + `[[ts:ms]]` 三缺二补完 + 自动切三轨 + 容器侧事件委托 ×3** | T16 · T1 | ❌ 独占（跨 7 文件） | `app/src/components/NotePreviewView.tsx`（346）· `app/src/components/RefineWorkbench.tsx`（482）· `app/src/components/SessionDetailPanel.tsx`（200）· `app/src/pages/SessionsPage.tsx` · `app/src/components/notes/NotesReadingColumn.tsx`（294）· 新建 `app/src/views/note/NoteCardFlowWithSeek.tsx` · `app/src/pages/NotesPage.test.tsx`（174，**Y9**）· `app/src/App.tsx` | 3 |
| **T18** | **标签线**（§C2 三件）：`NoteHeaderActions.tsx` + 新 `NoteTagsEditor.tsx`；三条写端命令各 ≥1 调用点；设色+清色成对；`tag_colors` 幂等回填 + 4 点单测；过滤面板着色 | T1 | ✅ 与 T13/T19 | **`NoteHeaderActions.tsx`（122）** · 新建 `NoteTagsEditor.tsx` · `app/src-tauri/src/db_colors.rs`（79）· `db_colors_tests.rs` · `NoteListToolbar.tsx`（96）· `NoteListRow.tsx` | 3 |
| **T19** | **档位通道 A 做完整**（C3.1 四段）+ **`:45` 散文 310 → 311**（同批，C10.6） | T4 | ✅ 与 T13/T18 | **`commands_live.rs`（399）** · `video_profile_memory.rs`（228）· `commands_video.rs`（311）· **`app_commands.rs`（479）** · **`useLiveCaptureControl.tsx`（298）** · `ProfileDetector.tsx`（398）· `ClassroomPage`（281）· `LiveProfileStrip.tsx`（316）· `line-limit-exemptions.md` | 3 |
| **T20** | **低置信第 2 点 + 采集期显影 + 规格章两篇 + 补 UI 全做**（C9.1 的逐字名单共 **11 个命令名**，见该节的「口径核账」） | T6 · T17 · T7 | ❌ 独占（跨 10+ 文件） | 见 T20 节的逐条 Files 表 | 5–7 |
| **T21** | **规格回写**（C6.3 六件 + C9.10 逐字对照 + §12/§11-7/§9 的更正 + §4.3 审校模式 + §7.2/§11-6 的三轨登记）+ `v0.22.md` 批 7 节 | T20 | ✅ 与 T22 | **`docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（940）** · **`docs/versions/v0.22.md`** | 3 |
| **T22** | **全批收口**：八闸**串行**真跑 + 三条验收兑现度表 + 二分清单 + 全批收口评审 | T13–T21 | ❌ 最后 | 0 生产代码（产出 `tmp/t22/**` + `task-22-report.md` + `closing-review.md`） | 0–1 |

**预估 7b 提交数 = 23–27**；**全批预估 39–45 提交**。

> **🔴 热点文件的单写者约束**
> | 文件 | 唯一写者队列 | 说明 |
> |---|---|---|
> | **`app/src/App.tsx`（599 → ≤550）** | **T1 → T17** | 严格串行；T17 **只许改 `goSessions` 的调用点与 `SessionsPage` 的 prop**（字段已在 T1 备好） |
> | **`app/src/components/NoteMarkdown.tsx`（295）** | **T13 → T14 → T15** | 严格串行；T15 只碰 `utils/markdownLine.ts`（不动 `NoteMarkdown`） |
> | **`app/src/utils/html.ts`（40）** | **T15 唯一** | 芯片形态改一次，两条链同时受益（C10.2） |
> | **`app/src/utils/html.test.ts`（103）** | **T15 唯一** | **Y8** |
> | **`app/src/ui/primitives/surfaceBaseline.ts`（261）** | **T6 → T7 → T10** | 三者串行 |
> | **`app/src/ui/primitives/surfaceResidual.ts`（184）** | **T7 唯一** | 一次做完 ① + ② 的全部登记 |
> | **`app/src/ui/primitives/style-seams.test.ts`（299）** | **T7 唯一**（**净增 0**） | 每次提交后必须复测行数 |
> | **`app/src/components/LiveActivityPanel.tsx`（513）** | **T6 唯一**（7a 拆件）；**T20 唯一**（7b 挂动效，落在新件里） | 拆件后主件与两个新件各有写者 |
> | **`app/src-tauri/src/app_commands.rs`（479）** | **T4 → T19** | 严格串行；T4 −3 行、T19 +1 行 |
> | **`app/src/components/NoteHeaderActions.tsx`（122）** | **T18 唯一** | 🔴 冻结值两格已满（见 T18 预算表） |
> | **`app/src/hooks/useLiveCaptureControl.tsx`（298）** | **T19 唯一** | **净增 ≤ +2** |
> | **`app/src/views/note/noteViews.test.tsx`（295）** | **T14 唯一** | 净增 ≤ +5 |
> | **`app/src/pages/NotesPage.test.tsx`（174）** | **T17 唯一** | **Y9** |
> | **`docs/standards/line-limit-exemptions.md`（234）** | 🔴 **§C14 已裁：改成「行级队列」—— 行数列由「改文件的那个单元」在同一提交里更新** | `app_commands.rs` 那一行 = **T4 → T19** · `App.tsx` 那一行 = **T1 → T17** · `LiveActivityPanel.tsx` 那一行 = **T6 → T20** · `commands_session.rs` 那一行 = **T4**（本批唯一）· `:45` 的「N 条」= **T4 → T19** · **其余行 = 各自文件的写者**；**T11 只碰非行数列**（拆法说明 / 记录文案）· **禁止跑 `--write`**（首选） |
> | **六棘轮判据件 + `dialogMigration.e.test.ts`（300）+ `buttonMigration.test.ts`（280）+ `emptyStateRatchet.test.ts`（296）+ `style-contract.test.ts`（296）+ `zIndex.guard.test.ts`（262）** | **无人**（全批只读） | 任何任务若发现「必须改它们才能绿」⇒ **STOP**。⚠️ **`style-contract.test.ts` 的例外**：T7 若要改 `SurfaceTag`/`SurfaceRadius` 联合 ⇒ **净增 ≤ +4**，且必须逐条给 before/after |
>
> **可安全并行（7a）**：T1 ∥ T2 ∥ T4 ∥ T5 ∥ T8 → T3 ∥ T6 ∥ T9 → T7 → T10 ∥ T11 → T12。
> **可安全并行（7b）**：T13 ∥ T18 ∥ T19 → T14 → T15 → T16 → T17 → T20 → T21 ∥ T22。
> **必须串行（7b 的 markdown 链）**：**T13 → T14 → T15 → T16 → T17**（C9.3 + C10.1 的顺序不可倒）。

---

## 段 7a · 拆件与前置（T1–T12）

> 以下每个任务节都含：**目标** · **🔴 冻结值预算表（C9.12：触碰的冻结键 + 现值 + 上限 + 是否变红）** · **Files（逐个给实测行数 + 是否贴边 + 是否在 `NON_MIGRATED_14`）** · **Interfaces** · **Steps** · **Verification 表（判据 ↔ 变异体 ↔ 期望）** · **提交信息** · **诚实边界**。
> 🔴 `NON_MIGRATED_14` 逐字清单（`app/src/ui/primitives/dialogMigration.e.test.ts:115-122`，**recon-c 逐字复核**）：`components/CaptureOverlayPanel.tsx` · `GroupRowContextMenu.tsx` · `ImagePreviewOverlay.tsx` · **`NoteEditView.tsx`** · **`NoteLinkToSystem.tsx`** · **`NoteListBatchMenu.tsx`** · **`NoteMoveToGroupMenu.tsx`** · **`NoteRowContextMenu.tsx`** · `RichEditorView.tsx` · `RouteInfoPopover.tsx` · `ScreenSelectOverlay.tsx` · `SessionRowContextMenu.tsx` · `chat/ChatLaunchMenu.tsx` · `note-selection/SelectionActionMenu.tsx`。**7a 的 12 个任务一个都不落在其中**（逐条核对见各任务的「Files」表）。
> ⚠️ **`NON_MIGRATED_14` 里有 5 个是 `Note*` 前缀**（`NoteEditView` / `NoteLinkToSystem` / `NoteListBatchMenu` / `NoteMoveToGroupMenu` / `NoteRowContextMenu`）—— **T18 的标签线落点必须避开它们全部**（C2.1）。

---

### Task 1: `App.tsx` 拆件到 ≤550 + `focusSeekMs`（C9.2 / C9.9）

> **为什么第一个做**：它是**全仓唯一贴 600 硬限的文件**（599/600，余 1），且被**两项**争用（R4 的 `{value,key}` 与 R9.1 的 ms 载体）⇒ 不先拆，7b 一步也动不了。C9.2 逐字：「拆件在 **7a 内**一次做完，**范围必须覆盖这两项的全部已知需求**，且**目标 ≤ 550 行**」。

**目标**：把 `App.tsx` 从 **599** 降到 **≤550**，并把 R4/R9.1 所需的**全部**结构一次备齐：① 抽 `PageSlot`（24 行 + 14 行注释）② 抽 `AiToast`（19 行 + 15 行注释）③ 抽 `focusRouting.ts`（类型 + 纯函数）④ 新增 `focusSeekMs: FocusSeek | null` 字段 ⑤ `goSessions(sessionId, ms?)` 写它。**搬迁只搬不改**（C9.19 第 1 条）。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `FROZEN_NATIVE_BUTTON_BY_FILE["App.tsx"]` | **无键**（计 0，实测 `frozen.mjs`） | 无（无键 ⇒ 出现原生 `<button>` 即**新文件式红**） | 🔴 **一个都不加**；被搬迁的两段代码里**本就没有** `<button>` | **否**（有正控） |
| `FROZEN_BORDER_BY_FILE["App.tsx"]` | **1**（`surfaceBaseline.ts:134` 逐字 `"App.tsx": 1`） | 1（**只许降或持平**） | 🔴 **搬迁不得把这条边框带进新家后仍留在 `App.tsx`**；若该边框随搬迁移走 ⇒ **必须**把 `App.tsx` 的键改成 **0** 并在**新家**加键 = 1（**总量守恒**，C9.19 第 2 条）⇒ 报告给**逐键 diff** | ⚠️ **是**（若不同步） |
| `FROZEN_RADIUS_OUTLIER_BY_FILE["App.tsx"]` | **1** | 1 | 同上（逐键迁移） | ⚠️ **是**（若不同步） |
| `FROZEN_SHADOW_BY_FILE` | `App.tsx` **无键** | — | 不得新增字面量 `boxShadow:`（`AiToast` 用 `Toast` 原语的 `placement="belowNav"`） | **否** |
| `zIndex` 裸数字 | `App.tsx` 今天走 `zIndex("toast")`（在 `AiToast` 内） | 冻结名单 3 条 | 搬迁后**同一处**搬到 `shell/aiToast.tsx`；**不得**新增裸数字 | **否** |
| `SPLIT_MOVES` | **1 条**（`ChatLaunchMenu\|ChatPage`） | 只增（按守恒） | 🔴 **本任务不涉原生 `<button>` ⇒ 零新增** | **否** |
| `FROZEN_MUTED_GRAY_BY_FILE` / `FROZEN_FONT_OOB_BY_FILE` | `App.tsx` **无键**（实测） | — | 搬迁不得引入 `#9ca3af` 或越界 `fontSize` | **否** |
| `check-command-registry` | **313/313/0** | 本任务**不动 registry** | — | **否** |

**Files:**
- 改 **`app/src/App.tsx`（599 → ≤550）** 🔴 贴边（对 600 余 1）
- 新建 `app/src/shell/PageSlot.tsx`（预算 **≤45 行**；搬 `:146-169`）
- 新建 `app/src/shell/aiToast.tsx`（预算 **≤55 行**；搬 `:171-204`）
- 新建 `app/src/shell/focusRouting.ts`（预算 **≤60 行**；**只放类型 + 纯函数**）
- 改 `app/src/components/toastMigration.test.tsx`（**235**）—— `:34` 的 import 源（**Y1**）+ **Y2（`:146` 换源）** 与 **Y2-A（`:126`）**
- 改 `app/src/shell/TopBar.test.tsx`（**298**）—— **Y2-B（`:276`）**
- 改 `app/src/shell/ShellFallback.test.tsx`（**208**）—— **Y2-C（`:174-175`）**
- 改 `app/src/shell/CommandPalette.kb.test.tsx`（`:174-175` 的 `fields` **只增** `"focusSeekMs"`，**Y3**）
- 改 `app/src/pages/SessionsPage.tsx`（**只加两个可选 props + 解构 + 透传**，见 Step 6）
- **`NON_MIGRATED_14`**：**本任务的 9 个文件都不在其中**（逐字核对：`App.tsx` / `shell/*` / `pages/SessionsPage.tsx` / 三个测试，与 14 条 `components/**` 路径**零交集**）

**Interfaces:**
- Consumes：`ui/primitives` 的 `Toast` · `shell/ShellFallback` 的 `SlotErrorBoundary` / `ShellFallback`
- Produces：`PageSlot`（签名**逐字不变**）· `AiToast`（签名**逐字不变**）· `FocusSeek = { ms: number; key: number }`（**T17** 消费）

- [ ] **Step 0: 先量基线**
  ```powershell
  cd "D:\Program own\aicode\work space\Entropydecrease"
  node .superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/plan-writer/lines.mjs app/src/App.tsx
  node scripts/line-limits.mjs --full     # 期望 exit 0 · 0 / 122 / 122
  node scripts/check-command-registry.mjs # 期望 exit 0 · 313/313/0
  ```
  **`App.tsx` 必须读到 599**（读到别的值 ⇒ 先停下查因）。

- [ ] **Step 1: 抽 `shell/PageSlot.tsx`（纯搬迁）**
  搬 `:146-169`（含 `:146-159` 的 `@ai-context`）逐字；新文件头加一行 `@ai-context: 自 App.tsx 抽出（批 7 T1，C9.2 腾行数）；签名与语义逐字不变。`；`App.tsx` 改为 `import { PageSlot } from "./shell/PageSlot";`。
  🔴 **不改** `PageSlot` 的任何一个字符（`mounted` 为假返回 `null`、每页独立 `Suspense` + 叶级 `SlotErrorBoundary`、`display` 三元全部逐字保留）。

- [ ] **Step 2: 抽 `shell/aiToast.tsx`（纯搬迁）**
  搬 `:171-204` 逐字；`App.tsx` 改为 `import { AiToast } from "./shell/aiToast";`。
  🔴 **必须同时改** `toastMigration.test.tsx:34` 的 `import { AiToast } from "../App";` → `from "../shell/aiToast";`（**Y1**，属搬迁的必需后果，**同提交**）。
  🔴 **`App.tsx` 里 `<AiToast toast={aiToast} onDismiss={() => setAiToast(null)} />` 这一行必须留下**（`toastMigration.test.tsx:117` 断言 `CODE["App.tsx"]` 含 `"<AiToast"`；**E1 实测该调用点在 `App.tsx:549`**）；定义体内的 `durationMs={3500}` 与 `placement="belowNav"` **逐字不动**（E1 实测：`App.tsx:198` / `:199`；`TopBar.test.tsx:276`）—— 🔴 **但它们随定义一起搬去 `shell/aiToast.tsx`** ⇒ 三条既有断言必红，见 Step 2b。

- [ ] **Step 2b: 🔴 修四处「搬迁的必需后果」（**独立 `test(...)` 提交**，`### 表 5` 的 **Y2 / Y2-A / Y2-B / Y2-C**）**
  🔴 **控制方 2026-09-13 裁决授权**（T1 实测回报触发；依据读数 E1 已逐条重测复核：`App.tsx` **599** 行 · `:50 import { Toast } from "./ui/primitives"` · `:160 function PageSlot(` · `:186 export function AiToast(` · `:198 durationMs={3500}` · `:199 placement="belowNav"` · `:549 <AiToast …/>`）：
  | # | 位点 | 为什么红 | 改写形态（**等强**） |
  |---|---|---|---|
  | **Y2** | `components/toastMigration.test.tsx:146` | `durationMs={3500}` 在 **`AiToast` 定义体内**（`App.tsx:198`）⇒ 搬走即红 | `CODE["App.tsx"]` → `CODE["shell/aiToast.tsx"]`（**断言值一字不改，只换被读文件**） |
  | **Y2-A** | `components/toastMigration.test.tsx:126` | `barrelNames(CODE["App.tsx"])` **不再含 `Toast`**（`import { Toast }` 是 `App.tsx:50`，随搬迁移走） | 名单里的 `"App.tsx"` → `"shell/aiToast.tsx"`（🔴 **不得**删 `Toast` 这个名字、**不得**降级 `toContain`） |
  | **Y2-B** | `shell/TopBar.test.tsx:276`（**298**） | `APP_CODE`（剥注释的 `App.tsx`）**不再含 `placement="belowNav"`** | 改读 `shell/aiToast.tsx`（**或**用渲染级断言证明 belowNav 档仍在）；🔴 **不得删这条断言** |
  | **Y2-C** | `shell/ShellFallback.test.tsx:174-175`（**208**） | `APP.indexOf("function PageSlot(")` ⇒ **−1** ⇒ 切出的定义体错位（**可能是"空真"而非断言失败**） | 把切定义体的源改为 `shell/PageSlot.tsx`；🔴 **必须加一条「`indexOf` 返回值 ≥ 0」的反空真断言** |
  🔴 **四条硬条件（Y2-D）**：① **等强或更强**（**禁止**降级/删除断言）；② 报告给**逐字 before/after** + 论证「是搬迁的必需改动」；③ **每条自带变异体**（搬回旧行为 ⇒ 必须红在**具名断言**上）；④ **独立 `test(...)` 提交**（🔴 **不与 `refactor(app):` 的搬迁提交混在一起** —— C9.19 第 1 条）。

- [ ] **Step 3: 抽 `shell/focusRouting.ts`（**只抽纯装配**，不抽状态）**
  ⚠️ 🔴 **`useNotesDeepLink.test.ts` 与 `CommandPalette.kb.test.tsx` 都把 `App.tsx` 当源码文本读**（**本计划者的 `app-consumers.mjs` 实测**：`CommandPalette.kb.test.tsx:32` 与 `useNotesDeepLink.test.ts:145` 各自 `readFileSync(…/App.tsx)`）⇒ **`focus*` 的 `const [x, setX] = useState(...)` 声明与 `const goX = ` 的声明文本必须留在 `App.tsx`**。
  ⇒ 本步**只**抽可以纯函数化的部分：
  ```ts
  // shell/focusRouting.ts（预算 ≤60 行；🔴 不 import views/** 或 pages/**）
  /** @ai-context 批 7 T1：focus* 家族的**目标规格**（纯数据）+ 同值重复跳转的判别键。
   *  状态与 setter 仍住 App.tsx（CommandPalette.kb.test.tsx / useNotesDeepLink.test.ts 读它的源码文本）。 */
  export interface FocusSeek { readonly ms: number; readonly key: number; }
  /** 会话深链目标：ms 可选（缺省 = 只定位会话，不 seek） */
  export interface SessionJump { readonly sessionId: number; readonly ms: number | null; }
  export function sessionJumpOf(sessionId: number, ms?: number): SessionJump;
  /** 跳转请求的单调判别键（同值重复跳转必须能重新触发 ⇒ 裸 number 不够） */
  export function seekKeyOf(now: number, prev: number): number;
  ```
  🔴 **不得**在本文件里 import `views/**` / `pages/**`（`architecture.guard.test.ts:100-103` 的 `FIRST_SCREEN` 含 `shell/**`）。
  🔴 **不得**在本文件的注释里出现 `import ... from "..."` 形态的示例（`engine.guard` 的图遍历**不剥注释** ⇒ 会造幻影静态边，见仪器纪律 12）。
  🔴 **与本任务相邻的 `views/**` 改动归 T17（不在 T1）**：§C11.2 的「非持久切换路径」加在 **`app/src/views/useViewMemory.ts`（70 行）** 上（hook 在 `views/**`，E1 实测），它由 **T17** 落地（**加法式、既有调用点一字不改**）⇒ **T1 一个字符都不碰 `views/**`**，`shell/focusRouting.ts` 也**不得 import `views/**`**（`architecture.guard.test.ts:100-103` 的 `FIRST_SCREEN` 含 `shell/**`）。

- [ ] **Step 4: 加 `focusSeekMs` 字段（R4 的最小形态）**
  在 `App.tsx:223`（`focusNoteSearch` 之后）加：
  ```tsx
  // 批 7 T1（R4 的最小形态 · C9.2）：`[[ts:ms]]` 深链的 **ms 载体**。
  // @ai-context 为什么是 `{ms,key}` 而不是裸 number：会话页已打开时再次点同一个时间码
  //   必须能重新触发（裸值 setState 同值不触发）—— 这是 C6 里 `{value,key}` 唯一未兑现的缺口；
  //   其余 5 个粘滞字段的形态改造会让 CommandPalette.kb.test.tsx 的正则失配 ⇒ 越权，登记批 8。
  const [focusSeekMs, setFocusSeekMs] = useState<FocusSeek | null>(null);
  ```
  并把 `"focusSeekMs"` **追加**进 `CommandPalette.kb.test.tsx:174-175` 的 `fields`（**只增**，**Y3**）。

- [ ] **Step 5: `goSessions` 接 ms（R9.1 的 App 侧）**
  ```tsx
  const goSessions = (sessionId: number, ms?: number) => {
    setFocusSeekMs(ms === undefined ? null : { ms, key: seekKeyOf(Date.now(), focusSeekKeyRef.current) });
    setFocusSessionId(sessionId);
    setPage("sessions");
  };
  ```
  🔴 **`:240` 的 `const goSessions = (sessionId: number) => {` 这个声明形态必须保留**（`CommandPalette.kb.test.tsx:180` 的正则 `const ${e} = ` 判它）。
  🔴 `useNotesDeepLink.test.ts:159` 的正则 `onFocusSessionConsumed=\{\(\) => setFocusSessionId\(null\)\}` **一字不改**。
  ⚠️ `focusSeekKeyRef` 由 `useRef(0)` 提供（**预算 +1 行**）；`focusSeekMs` 本身在 T1 结束时**尚未被渲染读取** ⇒ 🔴 **本计划采用**：**T1 的 Step 6 必须同批落地**（否则 `tsc` 的 `noUnusedLocals` 会报 `'focusSeekMs' is declared but its value is never read`）。

- [ ] **Step 6: `SessionsPage` 的接口（**只加类型与透传，不写消费逻辑**）**
  - `app/src/pages/SessionsPage.tsx`：`Props` 加 **两个可选字段**（`focusSeekMs?: FocusSeek | null;` · `onFocusSeekConsumed?: () => void;`），解构里接收，并**只把它透传给 `<SessionDetailPanel>`**（消费逻辑归 **T17**）。
  - `App.tsx` 的 `<SessionsPage>` 加两行：
    ```tsx
    focusSeekMs={focusSeekMs}
    onFocusSeekConsumed={() => setFocusSeekMs(null)}
    ```
  🔴 **这是「一次定够」的正确读法**（C9.2）：**接口在 7a 备好，行为在 7b 落地**。**报告必须逐字写清这条分界**，且 T17 **不得**再往 `App.tsx` 加行（只用已备好的两行）。
  🔴 **本步的形态以本卡为准（控制方第 14 例的作废声明）**：派发语里「**不要碰 `app/src/pages/SessionsPage.tsx` 的 prop（那是 T17 的活）**」与**本步冲突** ⇒ **该句已作废**（`### 表 6b` 的 **E-24**）。判据是机器可判的：`app/tsconfig.json` 的 **`noUnusedLocals: true`**（E1 实测）⇒ **`SessionsPage` 收了 props 而不透传 / 不接收却在 `App.tsx` 传** ⇒ `tsc` 报 **TS6133 / TS2322**。⇒ **T1 的交付形态 = ① 加类型 ② `App.tsx` 的两行透传 ③ `SessionsPage` 的解构 + 转交**；**消费逻辑（读它、seek、切视图）留 T17**。

- [ ] **Step 7: 量行数并提交**
  ```powershell
  node .superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/plan-writer/lines.mjs app/src/App.tsx
  node scripts/line-limits.mjs --full
  node scripts/check-command-registry.mjs
  ```
  期望：`App.tsx` **≤550**（估算 599 − 24 − 34 = 541，加 `focusSeekMs` 族 ≈ +8 行 ⇒ **≈549**）· `line-limits` **exit 0 · 0/122/122** · registry **313/313/0**。

**Verification**

| # | 判据 | 变异体（专属，翻回旧行为 ⇒ 必须红） | 期望 |
|---|---|---|---|
| **V1** | `App.tsx` 实测行数 **≤550** 且 **>300**（`>300` 是 `useNotesDeepLink.test.ts:148` 的**反空真**闸） | **M1**：把 `PageSlot` 的定义体粘回 `App.tsx` | **M1 后期望**：行数 **≥599** ⇒ **>550 ⇒ 红** |
| **V2** | **搬迁的机械等价**：两段正文各自与 `git show HEAD:app/src/App.tsx` 的对应行区间做**逐字节比较**（换行归一后；允许的差异只有 `import` / `export` 行） | **M2**：把 `PageSlot` 新家里的 `if (!mounted) return null;` 改成 `if (!mounted) return <></>;` | **M2 后期望**：逐字节比较报差异；且 `shell/ShellFallback.test.tsx` 的「按槽位逐个判」用例红 |
| **V3** | **`App.tsx` 的静态判据逐条仍绿**：`CommandPalette.kb.test.tsx:161-185`（四个 `onPick` 分支 + **11 个** `focus*` 字段 + 9 个入口具名函数 + 零内联 `onOpenSessions={(id) =>`）；`useNotesDeepLink.test.ts:158-170` | **M3**：把 `const goSessions = (sessionId: number) => {` 改成 `const goSessions = function (sessionId: number) {` | **M3 后期望**：`:180` 的正则失配 ⇒ 该用例红 |
| **V4** | **`toastMigration.test.tsx` 全绿**（`:117` / `:146` / `:154`） | **M4**：把 `<AiToast …>` 的调用点整行删掉（只留 import） | **M4 后期望**：`:117` 红；且渲染级用例因 `ai-toast` 未渲染而红 |
| **V5** | **`shellPhase.guard.test.ts:186-187` 全绿** | **M5**：把 `useShellPhaseState(` 改成 `useShellPhase(` | **M5 后期望**：`:186`/`:187` 红 |
| **V6** | **冻结键守恒（C9.19 第 2 条）**：`frozen.mjs` 的 `FROZEN_BORDER_BY_FILE` / `RADIUS_OUTLIER_BY_FILE` 的 **Σ 与拆前逐字相同**；报告给**逐键 diff** | **M6**：搬迁后把 `App.tsx` 的边框键删掉而**新家不加键** | **M6 后期望**：Σ 变小 ⇒ `surfaceRatchet.test.ts` 的「常量 == Σ表」红 |
| **V7** | `line-limits --full` **exit 0** · registry **313/313/0** | — | 逐字读数 |

**提交信息**：`refactor(app): 抽出 PageSlot 与 AiToast 并新增 focusSeekMs`（**subject 34 字**）

**诚实边界**：① 本任务**不产生任何可运行的新行为**（`focusSeekMs` 在 T17 之前**无消费逻辑**，只被透传）⇒ 「拆件零行为变化」由 V2 + V3–V5 的既有断言保证，**不由任何新判据保证**；② `App.tsx` **没有 `App.test.tsx`**（批 2 实测）⇒ 拆件的**渲染级证据**只能靠 `ShellFallback.test.tsx` / `TopBar.persistent.test.tsx` / `toastMigration.test.tsx` 三条**间接**判据；③ 「≤550 且本批剩余条目**没有任何一条**需要再往 `App.tsx` 加行」由 **T17 只在 `App.tsx` 改 0 行**这一事实在 7b 收口时回溯确认；本任务报告**只能声明"已按 C9.2 的范围清单备齐接口"**；④ 🔴 **本任务额外改了 4 处既有断言**（`### 表 5` 的 **Y2 / Y2-A / Y2-B / Y2-C**，**控制方 2026-09-13 授权**）⇒ 它们**不是"搬迁顺手改测试"**，而是**搬迁的必需后果**（`AiToast` 定义体与 `PageSlot` 定义体搬走 ⇒ 四处判据的**被读文件**变了）⇒ **必须独立 `test(...)` 提交 + 逐条 before/after + 每条自带变异体**（**Y2-D**），且**不得**降级/删除任何一条断言；⑤ 🔴 **`SessionsPage` 的两个 props 是本任务加的**（**控制方第 14 例的派发语作废** —— `### 表 6b` 的 **E-23**）：`noUnusedLocals: true` 之下不加透传 `tsc` 必红，故 **T1 必须做完"加类型 + 两行透传 + 解构转交"**，**消费逻辑才是 T17 的活**。

---

### Task 2: 渲染器析出（`utils/lowConfidence.ts`）

> **依据**：C4.2 的 `lowConfidenceClass` 行「**留 + 加宽到 ≥2 生产调用点**」+ C4.3 的「模块去向与门禁」逐字要求给出**新家或改名**方案，并**同提交**更新 `motion/env.ts` 的镜像 · `motion-coverage.test.ts:72` 的名单 · `env.test.ts:34/:229-234`（🔴 **行号按 `### 表 6b` 的 E-17/E-18 勘误**：原写 `:5/:126-131`）。
> 🔴 **本卡的行号锚全部由 E1 按「真行号口径」重推**（根因：编制期仪器 `sites.mjs` **删除块注释** ⇒ 打印的是剥注释后的行号，见 `### 表 6b` 头部说明）；**动手前仍须自己重测**。

**目标**：新建 `app/src/utils/lowConfidence.ts`（**≤40 行**），把 `lowConfidenceClass` 与 `LOW_CONFIDENCE_CLASS` 的**镜像字面量**收在一处；改 **1 个生产 import** + **1 个测试 import**；**不改类名字面量**。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `FROZEN_MUTED_GRAY_BY_FILE` | 新文件 **无键** | 无（无键 ⇒ 出现 `#9ca3af` 即红） | 🔴 新文件**零颜色字面量** | **否** |
| `FROZEN_FONT_OOB_BY_FILE` | 同上**无键** | 无 | 🔴 新文件**零 `fontSize`** | **否** |
| `FROZEN_BORDER` / `RADIUS` / `SHADOW` | 同上**无键** | 无 | 🔴 新文件**零面字面量** | **否** |
| `FROZEN_NATIVE_BUTTON_BY_FILE` | 同上**无键** | 无 | 🔴 新文件**零 `<button>`** | **否** |
| `motion-coverage.test.ts:72` 的 `NON_PRIMITIVE_ED_NAMES` | 含 `"ed-low-confidence"`（**已退役名**） | — | 🔴 **不改**（与 `ed-text--low-confidence` 无关；C4.3 说的"随删除失效的部分"经本计划者逐条核对**不含此行**） | **否** |
| `motion-coverage.test.ts:103` `BASE_CLASSES` `toHaveLength(12)` | **12** | 12（**不许缩水**） | 🔴 **不动** | **否** |
| `env.test.ts:229-234` 的 V6 两条 | 绿 | — | 只改 **`:34`** 的 import 源；断言**一字不改** | **否**（语义不变） |

**Files:**
- 新建 `app/src/utils/lowConfidence.ts`（预算 **≤40 行**）
- 改 `app/src/components/session-detail/SessionRawView.tsx`（**199**，余 101）—— 只改 **`:50`** 的 import 源（`:29` / `:35-37` 的过时注释归 **T3**）
- 改 `app/src/motion/env.test.ts`（**243**，余 57）—— 只改 **`:34`** 的 import 源
- **`NON_MIGRATED_14`**：**两个被改的文件都不在其中**

**Interfaces:**
- Produces：`export const LOW_CONFIDENCE_CLASS = "ed-text--low-confidence"` · `export function lowConfidenceClass(confidence: number | null | undefined): string`（**签名逐字不变**）
- ⚠️ 🔴 **`motion/**` 不得 import `components/**`、也不宜 import `utils/**`**（批 6 评审 M-2 已登记「双写字面量是合理代价」）⇒ **本任务不改 `motion/env.ts` 的双写字面量**，只把 `env.test.ts` 的 import 指向新家。

- [ ] **Step 1: 建新家**
  ```ts
  /**
   * @ai-context 低置信墨度类名的**唯一出口**（批 7 T2）。
   *
   * Why 从 `components/structuredBlocks.ts` 析出：那个模块顶层 `import katex from "katex"`
   *   + `import "katex/dist/katex.min.css"` ⇒ 一条 `import { lowConfidenceClass }` 会把整个
   *   KaTeX 拉进**会话详情的惰性 chunk**（批 6 T34 实测第二份副本 **+227,858 B 原始 /
   *   +64,497 B gzip**）。析出后本模块**零依赖**，那条边消失。
   * @ai-context 类名**逐字不改**（`ed-text--low-confidence`）：`ui/primitives/Text.css:63-66`
   *   的规则、`motion.css:272/299/325` 的三档名单、`motion/env.ts:44` 的镜像全以它为准。
   * 副作用：无（纯函数，不读 store、不发请求、不写盘）。
   */
  /** 低置信墨度类名（与 `motion/env.ts` 的 `LOW_CONFIDENCE_CLASS` 镜像**逐字相同**） */
  export const LOW_CONFIDENCE_CLASS = "ed-text--low-confidence";
  /**
   * 置信度 → 低置信类名（`< 0.5` 判定，阈值不变；`null`/`undefined` ⇒ 空串）。
   * @ai-context 为什么返回空串而不是 `undefined`：调用点直接写 `className={lowConfidenceClass(x)}`，
   *   空串让 React 不产出 `class` 属性的空值（既有行为，逐字保留）。
   */
  export function lowConfidenceClass(confidence: number | null | undefined): string {
    return confidence != null && confidence < 0.5 ? LOW_CONFIDENCE_CLASS : "";
  }
  ```
  🔴 字符串必须**逐字等于** `motion/env.ts:44` 的值（由 `env.test.ts:230` 的 `toBe(LOW_CONFIDENCE_CLASS)` 对拍保证）。

- [ ] **Step 2: 改两个 import**
  - `SessionRawView.tsx:50`：`from "../structuredBlocks"` → `from "../../utils/lowConfidence"`
  - `env.test.ts:34`：`from "../components/structuredBlocks"` → `from "../utils/lowConfidence"`
  - ⚠️ 本步之后**两个定义并存**（**`structuredBlocks.ts:67`** 的 `lowConfidenceClass` 此刻无消费者 = 僵尸导出；🔴 原写 `:48` —— `### 表 6b` 的 **E-5**）⇒ **T2 与 T3 必须相邻提交**；**允许并更好**：把 T2+T3 **合并为一个提交**（则不存在僵尸态）。

- [ ] **Step 3: 跑门禁并提交**
  ```powershell
  cd app; npx tsc --noEmit          # 期望 0 错
  cd ..; node scripts/line-limits.mjs --full
  ```

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | `env.test.ts` 的 V6 两条（**`:229-234`**）**全绿** | **M1**：把新家的 `LOW_CONFIDENCE_CLASS` 加一个尾随空格 | **M1 后期望**：**`:230`** 红 |
| **V2** | **阈值不变**：`0.3 → 类名` · `0.5 → ""` · `null → ""` · `undefined → ""` 四条全绿 | **M2**：把 `< 0.5` 改成 `<= 0.5` | **M2 后期望**：`0.5 → ""` 那条红 |
| **V3** | **导入边真的断了**（边级探针）：`sites.mjs lowConfidenceClass` 的 PROD 命中里**没有任何文件从 `../structuredBlocks` import 它** | **M3**：`SessionRawView.tsx:50` 保留旧 import 源 | **M3 后期望**：探针报「仍有 1 条边」⇒ 红 |
| **V4** | `line-limits --full` **exit 0** | — | `0 / 122 / 122` |

**提交信息**：`refactor(utils): 析出 lowConfidenceClass 到独立模块`（**subject 30 字**）

**诚实边界**：① 本任务**不证明** `katex` 从懒侧产物消失（那是 **T17 + 真实构建**的判据，C4.3 逐字「不得以『import 没了』推断产物没了」）；② 若 T2/T3 **分两次提交**，T2 的提交点存在一个**僵尸导出**（有意的原子切分：C9.19 第 1 条要求「只搬不改」，而"改"= 删导出属 T3）；③ `motion/env.ts:44` 的**双写字面量在本任务后仍存在**（批 6 的既有决策，本任务不动）。

---

### Task 3: `structuredBlocks` 逐导出裁决落地（C4.2）

> **依据**：C4.1「活的那个接线并加宽，死的三个删除」+ C4.2 逐条硬条件 + C4.3 的模块去向 + **§C4.2 的实测更正**（`escapeHtml` 是 **`:13`** 的**再导出**，真源在 **`utils/html.ts:11`**，有 3 个生产消费者**直 import 真源**；🔴 行号按 `### 表 6b` 的 E-1/E-2/E-6 勘误 —— 原写 `:6` / `utils/html.ts:4`）。
> 🔴 **本卡的行号锚全部由 E1 按「真行号口径」重推**（根因同 T2：`sites.mjs` 删块注释 ⇒ 系统性偏移；**`:15-26` / `:28-54` / `:11` / `:13` 为真值**），**动手前仍须自己重测**。T3 另有一条控制方追加授权：**自建 `app/src/utils/lowConfidence.test.ts`**（见 `### 表 6b` 的 **E-27**）。

**目标**：把三个死导出按 C4.2 处置，并**删除整个模块与其测试**（`lowConfidenceClass` 已于 T2 迁走）；同步 `SessionRawView.tsx:35-37` 的过时注释。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `FROZEN_NATIVE_BUTTON` / `BORDER` / `RADIUS` / `SHADOW` / `MUTED_GRAY` / `FONT_OOB` 的 `structuredBlocks.ts` 键 | **全部无键**（实测 `frozen.mjs`） | — | 删文件 ⇒ **无影响** | **否** |
| `line-limits --full` 的「301–600 档 122 / 登记条目 122」 | **122 / 122** | 只许更好或持平 | 🔴 两个被删文件（69 / 92）**都不在登记表内**（出处 = **recon-a A3-1 的实测**；🔴 **E1 本轮独立复核成立**：`docs/standards/line-limit-exemptions.md`（**234** 行）全文 **`structuredBlocks` 0 命中** ⇒ 删后**登记条目不变**） | **否** |
| **用例数** | 全量 **2132** | 🔴 **只增不减**（各批「LOST / SHRUNK = 0」的对拍纪律） | 删 `structuredBlocks.test.ts`（**8 个 `it`**）= **−8 用例**（`renderLatex` 3 + `renderMarkdownTable` 4 + `lowConfidenceClass` **1**；🔴 E1 实测口径，原写"`lowConfidenceClass` 4"是错的 —— `### 表 6b` 的 **E-19**）⇒ 🔴 **逐条登记去向**：① `lowConfidenceClass` 的 **1** 个 `it`（含 4 条 `expect`）**由本任务自建 `utils/lowConfidence.test.ts` 并迁入**（**不减**；控制方授权，`### 表 6b` 的 **E-27**）② `renderLatex` 3 + `renderMarkdownTable` 4 **随实现删除**（**净 −7**，须逐条点名 + 在 `v0.22` 批 7 节的「未做登记」说明「功能已按 C4.2 裁决删除，对应用例随之移除，**非 LOST**」） | ⚠️ **是** ⇒ 按上条**逐条登记**，**不是**放任 |

**Files:**
- **删** `app/src/components/structuredBlocks.ts`（**69**）
- **删** `app/src/components/structuredBlocks.test.ts`（**92** / 8 `it`）
- 🔴 **新建** `app/src/utils/lowConfidence.test.ts`（预算 **≤40 行**）—— **由本任务自建**：把 `structuredBlocks.test.ts:82` 的**那 1 个 `it`**（内含 4 条 `expect` = `:86`/`:87`/`:88`/`:89`）**逐字迁入**（🔴 **不是**"已由 T2 搬到" —— T2 卡**没有**这个文件、T2 也**正确地没有**建它；见 `### 表 6b` 的 **E-27**）。控制方 2026-09-13 裁决：**授权 T3 自建**，理由 = **删除与迁移必须在同一单元内完成**（否则中间态丢用例）
- 改 `app/src/components/session-detail/SessionRawView.tsx`（**199**）—— `:35-37` 的注释（「⚠️ 因此本件新增一条 import 边：`components/structuredBlocks.ts`（它顶层 `import katex` + `katex.min.css`）⇒ **KaTeX 会成为会话详情惰性 chunk 的依赖**」）**必须改写**（T2 已换 import 源、本任务已删 katex）—— **改述而非删除**
- **`NON_MIGRATED_14`**：不适用（`components/session-detail/**` 不在 14 条内）

**Interfaces:**
- Produces：**模块消失** ⇒ 任何 `from "../structuredBlocks"` 残留 import 会让 `tsc` 报 `TS2307`（**本任务最强的判据**）

- [ ] **Step 1: 摘 `escapeHtml` 的 import 与再导出（C4.2 第 1 行逐字）**
  删 **`:11`** `import { escapeHtml } from "../utils/html";` 与 **`:13`** `export { escapeHtml };`（🔴 E1 实测；原写 `:4` / `:6` —— `### 表 6b` 的 **E-1/E-2**）。
  🔴 **`utils/html.ts` 一个字不动**（它 **`:11`** 的 `export function escapeHtml` **不是本删除面**；原写 `:4` —— `### 表 6b` 的 **E-6**）；3 个生产消费者（**`NotePreviewView.tsx:16`** · **`RefineWorkbench.tsx:25`** · **`utils/refineDiff.ts:17`**；原写 `:5` / `:6` / `:3` —— **E-8/E-9/E-10**）**继续从真源直 import，零改动**。

- [ ] **Step 2: 删 `renderLatex` + 两个 `katex` import**
  🔴 **先自证零生产消费者**（C4.2 第 2 行的硬条件「生产 0 消费须**重测自证**（双侧仪器）」）：
  ```powershell
  node .superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/plan-writer/sites.mjs renderLatex renderMarkdownTable
  ```
  **期望**（本计划者实测）：`renderLatex` **PROD 1**（只有定义行）/ **TEST 5**；`renderMarkdownTable` **PROD 1**（定义行）/ **TEST 6**。
  然后删 **`:15-26`** 的 `renderLatex` 整段（定义在 **`:16`**；原写 `:9` —— `### 表 6b` 的 **E-3**）+ **`:28-54`** 的 `renderMarkdownTable` 整段（定义在 **`:29`**；原写 `:21` —— **E-4**）+ **`:8`/`:9`** 的两条 katex import（**这两个锚原本就对，保留**）。
  🔴 **`katex` 顶层包的全仓唯一生产引用就是这两行**（控制方实测）：`ChatMessageMarkdown.tsx:12` 与 `NoteMarkdown.tsx:25` 的命中是 **`rehype-katex`（另一个包、另一条管道）**，**不在删除面内** ⇒ 实施者须用 `sites.mjs` 分别扫 `rehype-katex` 与 `from "katex"` 并**逐条列出**。

- [ ] **Step 3: 删文件与其测试**
  - `git rm app/src/components/structuredBlocks.ts app/src/components/structuredBlocks.test.ts`（**或** `Remove-Item` 后 `git add -- <两个路径>` 再 `git commit` 带走 D 条目；🔴 **不得** `git add -A`；🔴 这两个文件**非共享** ⇒ 若确要用 `--only` 也仅限本任务路径）
  - ⚠️ **`lowConfidenceClass` 的那 **1 个 `it`**（`structuredBlocks.test.ts:82`，内含 4 条 `expect`；🔴 原写"4 条用例"是错的 —— `### 表 6b` 的 **E-19**）必须**由本任务自建并迁入** `app/src/utils/lowConfidence.test.ts`**（🔴 **本步内完成**，否则本步会**真丢用例**；**控制方已授权 T3 自建** —— `### 表 6b` 的 **E-27**）

- [ ] **Step 4: 改写 `SessionRawView.tsx:35-37` 的过时注释**（逐字给出 before/after）

- [ ] **Step 5: 跑门禁并提交**
  ```powershell
  cd app; npx tsc --noEmit
  cd ..; node scripts/line-limits.mjs --full
  node scripts/check-command-registry.mjs
  ```

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **零残留 import**：`tsc --noEmit` **0 错**；探针（读全 `app/src` 的 `.ts/.tsx`，剥注释后找 `structuredBlocks`）⇒ **命中 0**（**正控**：同一探针在 `HEAD` 树上 ⇒ **≥8 命中**） | **M1**：把 `SessionRawView.tsx:5` 的 import 改回 `from "../structuredBlocks"` | **M1 后期望**：`tsc` 报 `TS2307 Cannot find module '../structuredBlocks'`（**最强具名断言**） |
| **V2** | **`escapeHtml` 真源与 3 个消费者零改动**：`utils/html.ts` 的 `git diff` 为**空**；`sites.mjs escapeHtml` 里 **`utils/html.ts:11`** 仍是定义行、3 个消费者仍在（**`NotePreviewView.tsx:16`** / **`RefineWorkbench.tsx:25`** / **`utils/refineDiff.ts:17`**） | **M2**：把 **`utils/html.ts:11`** 的 `export function escapeHtml` 删掉 | **M2 后期望**：三处 `TS2305`（导出不存在）⇒ **证明那 3 条边真的在真源上** |
| **V3** | **katex 顶层包零引用**：扫 `from "katex"` / `import "katex/dist/katex.min.css"` ⇒ PROD **0**；**正控**：扫 `rehype-katex` ⇒ PROD **≥2**（`ChatMessageMarkdown` / `NoteMarkdown`）⇒ **证明删除面只覆盖顶层包** | **M3**：在 `NoteMarkdown.tsx` 里加 `import katex from "katex";` | **M3 后期望**：探针报「`from "katex"` PROD 命中 = 1」⇒ 红 |
| **V4** | **用例数闭合**：全量 vitest 的 `numTotalTests` = **2132 − 7 = 2125**（**要求**：报告给出**逐条**「哪 7 条被移除、为什么、`lowConfidenceClass` 那 **1 个 `it`** 搬到了哪里」）；`numFailedTests = 0` | **M4**：把 `utils/lowConfidence.test.ts` 的**那 1 个 `it`** 也删掉 | **M4 后期望**：用例数变成 **2124** ⇒ 差额 **8** ⇒ 报告里「净 −7」的账目**当场对不上** ⇒ 评审据此红（🔴 原写「2121 / 差额 11」是按错误的"4 条用例"算的 —— `### 表 6b` 的 **E-19**） |
| **V5** | `line-limits --full` **exit 0**（**逐字** `>600 硬限 0 · 301–600 档 122 · 登记条目 122` —— 删两个不在登记表的文件 ⇒ **122 不变**） | **M5**：把 `structuredBlocks.ts` 从删除改回"保留但清空"（留 1 行注释） | **M5 后期望**：`--full` 仍绿，**但 V1 的探针报「命中 = 1」⇒ 红**（判据是"零残留"，不是"门禁绿"） |

**提交信息**：`refactor(components): 按裁决删除 structuredBlocks 死导出`（**subject 33 字**）

**诚实边界**：① **`katex` 从懒侧产物消失本任务不证明** —— C4.3 逐字「必须用**真实构建**证明」⇒ 归 **T17**（`NotePreviewView` 迁移的同一次真实构建核账）；② **用例净 −7 是"实现被裁决删除"的必然结果**，不是 LOST —— 但**必须**在 `v0.22` 批 7 节的「未做登记」里逐字说明（T21）；③ 「`renderLatex` / `renderMarkdownTable` 的功能用户是否需要」**本计划不做产品判断**（C4.2 已裁「删」）；④ 本任务**不动** `motion-coverage.test.ts:72` 的 `"ed-low-confidence"` 条目（**Y3 式的零改动反向声明**）。

---

### Task 4: 撤下 IPC 3 条（C1.1）+ `:45` 散文 313 → 310（C10.6）

> **依据**：C0.2 行 31 逐字「3 条从 IPC 撤下但**保留内部函数**」+ C0.1（两处必须同改）+ C1.1（形态、命名、`dead_code` 先测量、clippy 对拍、零引用自己重跑）+ **C10.6 第 6 项**（`:45` 的「313 条」必须**与 registry 改动的提交同批**）。

**目标**：把三条命令从 IPC 面撤下（**摘属性 + 删注册行**），**保留函数体与原函数名**；registry **313 → 310**；**同批**把豁免表 `:45` 的散文改成 **310**。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `check-command-registry.mjs` 三向计数 | **313 / 313 / 0** | 🔴 **本任务的期望 = 310 / 310 / 0**（C0.3 的中间值） | 三处各摘属性 + 各删注册行 | ⚠️ **中间值合法**；报告须同时写「本任务期望值 **310/310/0**」与**为何**（313 − 3） |
| `line-limit-exemptions.md:45` 的散文「**313 条**」 | **313** | 🔴 **无门禁兜底**（`--write` 与 `--full` 都不覆盖） | **改成 310**（C10.6 逐字要求与 registry 改动**同批** ⇒ 中间态自洽） | **否**（无门禁）⇒ 由 T11 的**对拍探针**兜（见 T11 V2） |
| `app_commands.rs` 行数 | **479**（登记值 479 = 实测） | 已登记 301–600 档 | −3 行 ⇒ **476**；⚠️ 登记值会漂（`--full` 的「数值一致」会红）⇒ 🔴 **必须同批把登记行的 479 改成 476**（**只改数字列**） | 🔴 **是**（若不同步） |
| 六棘轮 | — | — | Rust 文件不在棘轮域（域 = `app/src/**`） | **否** |
| clippy lib warnings | **15**（批 6 收口基线） | 🔴 **不许增** | 摘属性后三条函数变 `pub fn` / `pub async fn`，模块 `mod commands_session;` **是私有模块** ⇒ **可能**触发 `dead_code` | ⚠️ **先测量再写结论**（C1.1 逐字）：`cargo build` 实测 ⇒ **实测 4 条**（三条命令 + **传递受害的 helper `normalize_source`**，见 `### 表 6b` 的 **E-29**）⇒ 逐条加 `#[allow(dead_code)]` + 一行理由（先例 `db_colors.rs:39-42`）；**无告警不得预防性添加** |

**Files:**
- 改 `app/src-tauri/src/commands_session.rs`（**443**）—— 三处：`:38 create_session`（doc `:36`）· `:184 add_session_segment`（doc `:182`）· `:214 add_session_ocr_block`（doc `:212`）；**摘 `#[tauri::command]`**（在 `:37` / `:183` / `:213`）+ **doc comment 加一行 `@ai-context`**
- 改 `app/src-tauri/src/app_commands.rs`（**479**）—— 删 `:203` / `:212` / `:213` 三行注册条目
- 改 `docs/standards/line-limit-exemptions.md`（**234**）—— `:45` 的 `313` → `310`，同时 `app_commands.rs` 那行的 `479` → `476`
- **`NON_MIGRATED_14`**：不适用
- 🔴 **AGENTS.md §10 额外审查**：`app_commands.rs` 是**今天的 IPC 安全边界文件**（注册清单已从 `lib.rs` 搬来 —— 豁免表 `:26` 自证）⇒ **报告必须点名**

**Interfaces:**
- Produces：`commands_session::create_session` / `add_session_segment` / `add_session_ocr_block` **仍是 `pub` 项**（模块内可见），**去掉了 IPC 入口**

- [ ] **Step 0: 先自证零引用（C1.1 逐字：**不得引裁决行当证据**）**
  ```powershell
  node .superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/plan-writer/sites.mjs create_session add_session_segment add_session_ocr_block
  ```
  **期望**：三条**各 PROD 0 / TEST 0**（本计划者实测）。
  ⚠️ ⚠️ **本计划者的探针只覆盖 `app/src`（前端）** ⇒ **Rust 侧必须另跑**：写一个只读 node 探针扫 `app/src-tauri/src/**/*.rs`，对每条命令名做**词边界**匹配并**逐条人工判读**（`create_session` 会有 ~75 行命中，**全部**是 `db.create_session`（DB 层同名不同物）/ `chat_create_session`（不同名）/ 注释提及 —— C1.1 逐字）。**报告必须给出命令与输出**。

- [ ] **Step 1: 摘属性（三条）**
  删 `#[tauri::command]` 三行；**保留 `pub fn` / `pub async fn`**；**保留原名**（🔴 **不得**改 `*_inner`）。每条 doc comment 加：
  ```
  /// @ai-context 已依规格 §1 L5 行 31 从 IPC 撤下（批 7）；实现保留供内部/未来接线，勿再注册。
  ```

- [ ] **Step 2: 删注册行（三条）** —— **必须与 Step 1 同一次改动内**（C0.1）

- [ ] **Step 3: 量 registry（三次读数）**
  ```powershell
  # 3a：只摘属性、未删注册行 ⇒ 期望「多注册」3 条（证明门禁有牙）
  # 3b：只删注册行、未摘属性 ⇒ 期望「漏注册」3 条
  # 3c：两处同改 ⇒ 期望 310/310/0 exit 0
  node scripts/check-command-registry.mjs
  ```
  🔴 **3a/3b 是"门禁有牙"的自证**，**必须在导出副本或临时夹具里做**（不得在工作树上「改→跑→还原」）。

- [ ] **Step 4: `cargo build` 实测 `dead_code`**
  ```powershell
  cd app/src-tauri; cargo build 2>$null | Select-String -Pattern "dead_code|never used"
  ```
  **分支 A（有告警）**：🔴 **按 `cargo build` 实测逐条添加** —— **实测是 4 条**，不是 3 条：
  - 三条**撤下的命令**（`create_session` / `add_session_segment` / `add_session_ocr_block`）；
  - **第 4 条 = 传递受害的私有 helper `normalize_source`**（其**唯一调用方**就是已撤下的 `add_session_segment`）⇒ 🔴 **只加 3 处会留 1 条新告警** ⇒ **clippy 集合差异非空** ⇒ 违反「只许持平」（C5.1）。
  ⇒ 实施者**必须先跑 `cargo build` 拿到告警清单再逐条加**（4 条是 T4 实测值，**不是**上限）；每条加一行理由（先例 `db_colors.rs:39-42`）。
  **分支 B（无告警）**：🔴 **不得预防性添加**。**报告必须逐字给出 `cargo build` 输出与分支判定**（含 `dead_code` 的**完整集合**：T4 报告 §3.5/§5.2 的实测 = 改前 4 条 / 加 allow 后 **0 条**）。

- [ ] **Step 5: `cargo clippy` 对拍（集合差异，不是条数）**
  **判据**：error **0** · lib warnings **集合差异为空**（批 6 基线 = **15**）⇒ 报告给 `Compare-Object` 式的**集合差异**（C1.1 逐字「不许只给条数」）。

- [ ] **Step 6: 同批同步豁免表（C10.6 第 6 项）**
  `:45` 的 `313 条` → **310 条**，并在括号里补一句可追溯性说明：「批 7 T4 撤下 3 条 ⇒ 313 → 310；T19 新增 1 条后为 311」。
  同时把 `app_commands.rs` 那行的行数 `479` → **476**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | `check-command-registry.mjs` **exit 0 · `定义 310 / 注册 310 / 重复 0`** | **M1**：把 `create_session` 的 `#[tauri::command]` 加回去（注册行不还） | **M1 后期望**：`❌ 命令注册不一致：定义 311 / 注册 310 / 重复 0` + `漏注册` 1 条 + **exit 1** |
| **V2** | **三向门禁的牙齿**（在夹具上）：只删注册行 ⇒ `定义 313 / 注册 310` + `漏注册 3 条` + exit 1（**逐字复现 recon-a A2④ 的读数**） | —（牙齿自证） | 夹具 exit **1** · 真清单 exit **0**（**正对照**：同仪器、同 `--src-dir`，只换 `--registry`） |
| **V3** | **函数体逐字保留**：探针 = 取三个函数的**完整体**与 `git show HEAD:app/src-tauri/src/commands_session.rs` 的同名函数做**逐字节比较**（仅允许 `#[tauri::command]` 行缺失 + doc 多一行） | **M3**：把 `create_session` 的函数体删成 `unimplemented!()` | **M3 后期望**：逐字节比较报差异 ⇒ 红（这就是「保留内部函数」的具名断言） |
| **V4** | **零引用双侧自证**：前端 PROD/TEST 各 **0** · Rust 侧逐条命中**全部**被归类为「DB 层同名不同物 / 不同名 / 注释」；**正控**：同一 Rust 探针扫 `db.add_segment` ⇒ **≥4 命中**（`live_session_persist.rs:100` · `live_frame_process.rs:506/:489` · `live_keyframes.rs:116`） | **M4**：在 `live_session_persist.rs` 里加一行对命令本体的调用 | **M4 后期望**：探针报「命令本体调用者 = 1」⇒ 报告里的「零引用」结论当场被推翻 |
| **V5** | **clippy 集合差异为空**；error **0** | **M5**：给 `create_session` 加一个未使用的局部变量 | **M5 后期望**：clippy 报 `unused_variables` ⇒ 集合差异非空 ⇒ 红 |
| **V6** | **散文与门禁对拍（C10.6 的机械判据）**：探针读 `:45` 的 `(\d+) 条` 与 `check-command-registry.mjs` 输出的 `定义 (\d+)` ⇒ **必须相等**；**正控** = 手工构造一个错值 ⇒ 探针必须报不等 | **M6**：把 `:45` 留成 313 而门禁已 310 | **M6 后期望**：探针报「散文 313 ≠ 门禁 310」⇒ 红 |
| **V7** | `line-limits --full` **exit 0**（`0 / 122 / 122`；`app_commands.rs` 的登记值已同批改 476） | — | 逐字读数 |

**提交信息**：`refactor(ipc): 撤下三条低级写原语命令并保留实现`（**subject 33 字**）

**诚实边界**：① **真机 IPC 冒烟未做**（本批真机/WebView2 由用户裁决**跳过**，C6.4）⇒ 「这三条命令在真机上确实不可调用」**只有源码级 + 门禁级证据**；② `dead_code` 的判定**依赖当次 `cargo build` 的输出** ⇒ 必须在干净的 `cargo build` 上取读数并把命令写进报告；③ 🔴 **从本任务到 T19 之间，`:45` 的散文是 `310` 而 T19 之后 registry 是 `311`** ⇒ **T19 必须同批把它改成 311**（C10.6 逐字要求"同批"，故这是**两次**同批，**不是**一次）；④ 本任务**不改**批 1 计划 `:206` 的历史文本（`### 表 6` X1）。

---

### Task 5: 零产品风险登记核对（证据型任务，零生产代码）

> **依据**：C7.1 逐字「7a：… + 一切**已由控制方裁决完**的零产品风险项」；recon-A §A5⑥ 的三条「有意保留」需在批 7 被**核对通过**而不是被默默继承。

**目标**：对 §9 的三条「有意保留」与七条「登记不排期」做一次**只读核对**并产出可复核的证据件；**零代码改动**。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| 全部六棘轮 + registry + 行数 | 见 `### 表 1/表 2` | — | **零改动** | **否** |

**Files:**
- **0 个生产/测试文件**；产出 `task-5-report.md` + `tmp/t5/**`（探针）
- **`NON_MIGRATED_14`**：不适用

- [ ] **Step 1: 核对三条「有意保留」的理由是否仍成立**
  | §9 # | 命令 | 规格给的理由（逐字） | 核对探针（读原文） |
  |---|---|---|---|
  | 29 | `video_profile_memory` | 「自述『诊断用』，零成本」 | `commands_video.rs:243` 的 doc 是否仍是「读取当前档案记忆（诊断/展示用）。」 |
  | 31 | `action_badge_count` | 「文档明确『保留命令无前端调用方』」 | `docs/superpowers/specs/2026-09-06-action-domain-page-design.md:39/:64` |
  | 43 | `release_live_prepare` | 「前端注释『保留供未来显式调用』」 | `ClassroomPage.tsx:96` 的注释 |

- [ ] **Step 2: 核对七条「登记不排期」仍在 registry 且前端零引用**
  `ai_goal_plan_estimate` · `export_manual_fill_done` · `export_write_todotxt_file` · `learning_metrics` · `quiz_group_cards` · `session_outline` · `audit_due_for_system`
  ⇒ `sites.mjs` 逐条扫（**期望各 0/0**）+ registry 输出核对七条仍在注册清单里。

- [ ] **Step 3: 核对 22 条「删」确实都不在 registry**
  ⇒ registry 输出 + node 探针逐条确认（recon-A §A5-补充 已逐条点名过，本任务**独立复现**）。

- [ ] **Step 4: 出报告（默认零提交）**
  🔴 **若步骤 1 有任何一条"理由已失效"** ⇒ 需要 durable 登记 ⇒ 但那归 **T21** ⇒ **本任务默认零提交**，产出只在 `task-5-report.md`（gitignored）。

**Verification**

| # | 判据 | 变异体 | 期望 |
|---|---|---|---|
| **V1** | 三条「有意保留」的理由**逐字**在盘上（探针给出 file:line + 原文） | **M1**：改名 `video_profile_memory` 的 doc | **M1 后期望**：探针报「理由不成立」⇒ 报告结论从「核对通过」变成「理由已失效」 |
| **V2** | 七条「登记不排期」**仍在 registry** 且**前端零引用** | **M2**：把 `learning_metrics` 从 `generate_handler!` 删掉 | **M2 后期望**：registry 报「漏注册 1 条」⇒ 红（证明"仍在 registry"这条真的被判了） |
| **V3** | 22 条「删」**都不在 registry**（逐条点名） | — | 探针输出 22 行 `NOT IN REGISTRY` |
| **V4** | **零文件改动**：`git status --porcelain` 与 Step 0 逐字相同（仅 `?? docs/tech-debt/`） | **M4**：顺手改一个源码文件 | **M4 后期望**：`git status` 多一行 ⇒ 红 |

**提交信息**：**默认无提交**（证据型）

**诚实边界**：① 本任务**不产生任何代码或判据** ⇒ 结论只有人工核对价值，`docs-check` 不校验它；② 「理由仍成立」是**文本级**核对，**不证明**运行时行为符合理由描述；③ 产出**不被任何门禁保护**（gitignored 报告的固有代价）。

---

### Task 6: 采集期拆件（C9.16 的 7a 半）

> **依据**：C9.16 逐字「**7a** = 纯搬迁拆件（`LiveTranscriptStream.tsx` + `LiveOcrPreview.tsx`，主件降到 ~250–300 行），**不改行为**」+ 豁免表 `:38` 逐字给出的拆法 + C9.19 的台账守恒律。

**目标**：把 `LiveActivityPanel.tsx`（**513**）按豁免表给的拆法拆成 3 件，**纯搬迁不改行为**；同步三处台账。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `FROZEN_NATIVE_BUTTON_BY_FILE["components/LiveActivityPanel.tsx"]` | **1**（实测） | **1** | 若该 `<button>` 的渲染块随搬迁进新件 ⇒ 必须：① 主件 **1 → 0**（**降，允许**）② 新件加键 **= 1** ③ **`SPLIT_MOVES` 追加** `"<新件>\|components/LiveActivityPanel.tsx"`（守恒 `新 + 源 == 基线源键 1`） | ⚠️ **是**（若不做 ①②③ ⇒ `:203-214` + `:228-253` 红） |
| `FROZEN_BORDER_BY_FILE["…LiveActivityPanel.tsx"]` | **2** | **2** | 按搬运结果**逐键迁移**（源减、新加、**总量不变**） | ⚠️ 同上 |
| `FROZEN_RADIUS_OUTLIER_BY_FILE["…LiveActivityPanel.tsx"]` | **1** | **1** | 同上 | ⚠️ 同上 |
| `FROZEN_FONT_OOB_BY_FILE["…LiveActivityPanel.tsx"]` | **8** | **8** | 同上 | ⚠️ 同上 |
| `FROZEN_MUTED_GRAY_BY_FILE["…LiveActivityPanel.tsx"]` | **2** | **2** | 同上 | ⚠️ 同上 |
| `FROZEN_SHADOW_BY_FILE` | `LiveActivityPanel.tsx` **无键** | — | 新件不得新增字面量 `boxShadow:` | **否** |
| `line-limit-exemptions.md:38` 的 `LiveActivityPanel.tsx \| 513` 行 | **513**（实测 = 登记值） | — | 拆后主件 ≤300 ⇒ **整行移除**（登记条目 **122 → 121**） | ⚠️ **是**（`--full` 的「登记条目 122」会变 121 —— **预期变化，须解释**） |
| `FROZEN_SURFACE_TAG_TOTAL` | 14（9 条 legacy） | 14 | 🔴 **本任务不新增 `<Surface>` 调用点**；若搬迁涉及 `<Surface>` ⇒ **逐键迁移**（C9.5 的 legacy 行「只许降」，不得抬） | ⚠️ 若涉及则需**手工收紧** |

**Files:**
- 改 **`app/src/components/LiveActivityPanel.tsx`（513 → ~250–300）** 🔴 已登记 301–600 档
- 新建 `app/src/components/LiveTranscriptStream.tsx`（预算 ~120–180 行）
- 新建 `app/src/components/LiveOcrPreview.tsx`（预算 ~120–180 行）
- 改 `app/src/ui/primitives/nativeButtonBaseline.ts`（**182**）—— 逐键迁移 + `SPLIT_MOVES` 追加
- 改 `app/src/ui/primitives/surfaceBaseline.ts`（**261**）—— 边框/圆角/字号/弱化灰的逐键迁移
- 改 `docs/standards/line-limit-exemptions.md`（**234**）—— `:38` 整行移除
- **`NON_MIGRATED_14`**：**三个文件都不在其中**（14 条不含任何 `Live*` 路径）

**Interfaces:**
- Produces：两个新件的 props（**由主件注入**，与主件内部的既有局部状态同名同形）⇒ **T20 的 `ref` 钩子挂在新件里**

- [ ] **Step 0: 先取「渲染结构逐字对照」的基线**
  `LiveActivityPanel.tsx` **无同名测试文件**（C9.16 逐字）⇒ 回归证据只能是「门禁读数逐字持平 + 渲染结构逐字对照」。
  ⇒ 写只读探针把主件的**渲染树结构**导出（`data-testid` / `className` / 元素层级 / 文案），落 `tmp/t6/structure-before.json`。

- [ ] **Step 1: 拆 `LiveOcrPreview.tsx`（小件先拆）**
  搬 `:50` 的 `OcrLine` + `SHOW_OCR_LINES = 4`（`:60`）+ OCR 相关状态 + `:491-508` 的渲染块。🔴 **只搬不改**（文案 / `data-testid` / 类名 / 层级**逐字**）。

- [ ] **Step 2: 拆 `LiveTranscriptStream.tsx`**
  搬 `:28` `TranscriptLine` / `:41` `PendingLine` + `SHOW_TRANSCRIPT_LINES = 6`（`:59`）+ `MAX_PENDING_LINES = 8`（`:64`）+ `:116-298` 里转录相关的状态与副作用 + `:393-490` 的渲染块（含 `LiveImageStrip` 在 `:396`）。

- [ ] **Step 3: 主件收口** —— 保留模块文档 + `:303-322` 状态机与统计行 + `:324-` 采集信息条 + 两个新件的装配。

- [ ] **Step 4: 三处台账同步（C9.16 逐字，一处不许漏）** —— ① `SPLIT_MOVES` + 逐键迁移 ② `surfaceBaseline.ts` 逐文件格 ③ `:38` 登记行整行移除。

- [ ] **Step 5: 跑门禁并提交（**门禁读数必须与拆前逐字持平** —— C9.19 第 5 条）**
  ```powershell
  node scripts/line-limits.mjs --full    # 期望：0 / 121 / 121（登记条目 −1）
  cd app; npx tsc --noEmit
  cd ..; node scripts/check-command-registry.mjs
  ```

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **结构等价**：`structure-after.json` 与 `structure-before.json` **逐字相等** | **M1**：把 `LiveOcrPreview` 的一个 `data-testid` 改名 | **M1 后期望**：两个 JSON 差异非空 ⇒ 红（**本任务唯一的"行为零变化"具名断言**） |
| **V2** | **代码行级等价**：两个新件的正文按「主件原行号顺序」拼回，与 `git show HEAD:…LiveActivityPanel.tsx` 的对应行区间做**逐字节比较**（允许差异只有 `import` / `export` / props 接线） | **M2**：把 `SHOW_TRANSCRIPT_LINES = 6` 改成 `7` | **M2 后期望**：逐字节比较报差异 ⇒ 红 |
| **V3** | **台账守恒（C9.19 第 2/3 条）**：`frozen.mjs` 的四个 `FROZEN_*_BY_FILE` 的 **Σ 与拆前逐字相同**；`SPLIT_MOVES` 每条形如 `新\|源` 且 `新 + 源 == 基线源键`；报告给**逐键 diff** | **M3**：主件边框改成 2 而新件也写 2（总量变大） | **M3 后期望**：`FROZEN_BORDER_TOTAL` 的 Σ 变大 ⇒ `surfaceRatchet.test.ts` 的总量判据红 |
| **V4** | `line-limits --full` **exit 0**（`0 / 121 / 121`）；主件与两个新件**各 ≤300** | — | 逐字读数 |
| **V5** | **门禁读数与拆前逐字持平**（C9.19 第 5 条）：除 `--full` 的登记条目 122 → 121（**预期变化，须解释**）外全部逐字相同 | — | 报告给对照表 |
| **V6** | **`nativeButton` 的新文件判据**：两个新件若含原生 `<button>` ⇒ **必须在 `SPLIT_MOVES` 里** | **M6**：把 `SPLIT_MOVES` 的新条目删掉 | **M6 后期望**：`:203-214` 报「新增文件带 N 处，基线里没有（拆件请登记 SPLIT_MOVES）」⇒ 红 |

**提交信息**：`refactor(classroom): 拆出转录流与 OCR 预览子组件`（**subject 30 字**）

**诚实边界**：① 🔴 **`LiveActivityPanel.tsx` 无同名测试文件** ⇒ 回归证据**只有** V1 + V2 + V5 三条 ⇒ **不得声称「有测试覆盖」**（C9.16 逐字）；② V1 的结构探针**是执行者自写的**，其覆盖度取决于探针写得多细 ⇒ 报告必须**逐字列出探针抽了哪些字段**；③ 拆件**不产生任何新功能**（逐段显影在 T20）⇒ 「采集期逐段显影已交付」**在本任务结束时为假**。

---

### Task 7: 簇 A —— `Surface` 两条（C9.4 + C9.5 + C10.8）

> **依据**：C9.4（两条都做、7a 内做完、① 实际入账 3 处、走**受控槽**）+ C9.5（新增登记制 = 合法机制）+ **C10.8（🔴 「21」只作量级预期，任务卡必须先自测逐处名单 + 正控/负控 + 修批 4 仪器两缺陷 + 按实测登记）**。

**目标**：给 `SurfaceProps` 加**两个受控槽**（`html?: string` · `domId?: string`）与**一个「只出边框、不出底色」档**；**先自测逐处名单**，再迁移；同批走 `C9.5` 的登记制。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `FROZEN_BORDER_TOTAL` | **223**（107 键，Σ = 223） | 🔴 **只许降或持平** | ① 迁移收紧边框（`NotePreviewView.tsx:301` · `RefineWorkbench.tsx:442` · **`SessionScreenCards.tsx:98`** ⇒ **入账 3 处**；`:295` 是语义色不入账；🔴 **`:96` 是 `id` 行、边框在 `:98`** —— §C9.4 原引的 `:96` 见 `### 表 6b` 的 **E-26**）· ② 透明容器迁移 ⇒ 字面量被 `<Surface>` 基类取代 | **否**（下降）⇒ 🔴 **必须同批更新 `FROZEN_BORDER_TOTAL` + `FROZEN_BORDER_BY_FILE` 逐格 + `BORDER_ANCHOR.entries`**（C5.1）+ **报告给逐键 diff** |
| `FROZEN_RADIUS_OUTLIER_TOTAL` | **260**（108 键） | 只许降或持平 | 迁移把 `borderRadius: 6\|12\|14\|999\|2` 等改为 `radius` 档 ⇒ 收紧；**8 合法不入棘轮** | **否** ⇒ 同上三条同步 |
| `FROZEN_SHADOW_TOTAL` | **24**（24 键） | 只许降或持平 | ② 的透明容器**无阴影** ⇒ **预计零变动** | **否** |
| `FROZEN_SURFACE_TAG_TOTAL` | **14**（9 条 legacy，Σ = 14） | 🔴 **允许抬高，但只按 C9.5 的三步 + C10.8 第 2 条按实测** | 新增 `<Surface>` 调用点 ⇒ `SURFACE_TAG_REGISTRY` 加**不带 `legacy`** 的行（`count` **恰等于实测**、`reason` ≥12 字、键按字典序）+ **同提交**抬高 `FROZEN_SURFACE_TAG_TOTAL` 到 Σ 登记值 + 同步 `SURFACE_TAG_ANCHOR.entries` | ⚠️ **是**（若不按三步）；🔴 **禁止**：抬 legacy 行的 `count`、抬 `SURFACE_TAG_FROZEN_LEGACY_COUNT`、**不登记而抬总数**、**预先抬到预测值**（C10.8 第 2 条）、抬任何 `FROZEN_*_BY_FILE` |
| `surfaceResidual.ts` 的三条 `no-passthrough-*` | `NotePreviewView` **4** · `RefineWorkbench` **1** · `SessionScreenCards` **2**（= 7 处） | 只许降 | 迁移后按**实测**降 `count` 或整条删除（**防僵尸判据 ⑩**） | ⚠️ **是**（若不降） |
| `FROZEN_MUTED_GRAY_TOTAL` / `FONT_OOB_TOTAL` | 63/43 · 551/120 | 只许降或持平 | ② 的落点若含 `#9ca3af` 或越界字号 ⇒ 迁移后收紧；**新写的调用点不得引入** | ⚠️ 同上 |
| `style-seams.test.ts` 的 `SURFACE_CLASSES` + `toHaveLength(12)` | **12** | 12（**两处必须同源改**） | 加「只出边框」档 ⇒ **枚举 +1**（`Surface.tsx` 的 `SurfaceLevel` 联合 + `style-seams.test.ts:44`） | ⚠️ **是**（若不同步）；🔴 **该文件净增必须 = 0**（299/300） |
| `style-contract.test.ts`（296） | 绿 | 净增 ≤ +4 | 若改 `SurfaceLevel` / `SurfaceRadius` 联合 ⇒ 契约表逐条同步 | ⚠️ 可能 |
| `FROZEN_NATIVE_BUTTON_TOTAL` | 393 | 只许降或持平 | 🔴 **逐处名单里若有控件（`<input>`/`<select>`）⇒ 不许迁**（C10.8 逐字：那 7 处是**仪器误分**） | **否** |
| `dialogMigration.e.test.ts:252-253` | 绿（14 文件 `ui/primitives` 命中 = **0**） | — | 🔴 **逐处名单里必须排除 `NON_MIGRATED_14` 的全部成员**（尤其 `CaptureOverlayPanel.tsx`、`BoxSelectOverlay.tsx` 的归属要逐个核） | ⚠️🔴 **若迁了 14 内成员 ⇒ 直接红** |

**Files:**
- 改 `app/src/ui/primitives/Surface.tsx`（**98**，余 202）—— 两个受控槽 + 一个档
- 改 `app/src/ui/primitives/Surface.css`（**85**）—— 「只出边框」档的规则 🔴 **`.css` 不在门禁视野**，只给预算
- 改 `app/src/ui/primitives/Surface.test.tsx`（**175**，余 125）—— 正反两向用例（**新判据必须配变异体**）
- 改 `app/src/ui/primitives/style-seams.test.ts`（**299**）—— `SURFACE_CLASSES` 枚举 +1，🔴 **净增 0**
- 改 `app/src/ui/primitives/style-contract.test.ts`（**296**）—— 契约表若含 `SurfaceLevel` 枚举
- 改 `app/src/ui/primitives/surfaceBaseline.ts`（**261**）—— 三族常数 + 逐文件表 + 锚（**只降**）
- 改 `app/src/ui/primitives/surfaceResidual.ts`（**184**）—— 三条 `no-passthrough-*` 收紧 + `SURFACE_TAG_REGISTRY` 新登记行
- **① 的 3 处**：`NotePreviewView.tsx`（**346**，`:301`/`:300`）· `RefineWorkbench.tsx`（**482**，`:442`/`:441`）· `session-detail/SessionScreenCards.tsx`（**193**，**`:98`**/`:97-103`；🔴 E1 实测 —— 原写 `:96`/`:97-102`，见 `### 表 6b` 的 **E-26**）
- **② 的逐处名单**（**本任务 Step 1 产出**）
- 新建 `scripts/lib/surfaceTransparentScan.mjs`（**本任务自测逐处名单的仪器**，预算 ≤180 行；`.mjs` 不在门禁视野）
- **`NON_MIGRATED_14`**：🔴 **逐处名单必须逐条排除 14 个成员**

**Interfaces:**
- Produces：
  ```ts
  export type SurfaceLevel = "sunken" | "canvas" | "surface" | "raised" | "none";
  export interface SurfaceProps {
    // …既有 11 个字段逐字不动…
    /** 受控槽：把已渲染的 HTML 串交给 `dangerouslySetInnerHTML`（**不开 `...rest`** —— C9.4） */
    readonly html?: string;
    /** 受控槽：把 `id` 落到宿主元素（供锚点跳转；**不开 `...rest`** —— C9.4） */
    readonly domId?: string;
  }
  ```

- [ ] **Step 1: 🔴 先自测「逐处名单」（C10.8 第 1 条）**
  **仪器要求（逐字照做）**：
  1. **修正批 4 仪器的两个缺陷**：`tmp/t17b/scan.mjs:68` 的 `tagBefore()` 遇 `;` 提前返回 ⇒ 改成**括号/引号平衡扫描**；`:86` 的 bg 谓词不认 `backgroundImage` ⇒ 补上。
  2. **正控**：喂一个**已知的透明容器**（如 `RefineLaunchDialog.tsx:237`）⇒ **必须命中**。
  3. **负控**：喂一个**已迁走的写法**（如 `Surface` 的调用点）⇒ **必须报 0**。
  4. 产出表：**文件 + 行 + 原写法 + 目标形态**，并把该表**逐字写进报告**。
  🔴 **「21」只作量级预期**（C10.8 第 3 条）：**实测残值 ≠ 21 很可能会** ⇒ **按实测走**并**逐条给出与 21 的差额归因**（C10.8 第 4 条）。

- [ ] **Step 2: 加两个受控槽（① 的承载面）**
  `Surface.tsx` 的 `SurfaceProps` 加 `html?` / `domId?`；渲染：
  ```tsx
  <Tag className={cls} style={style} data-testid={testId} id={domId}
       {...(html !== undefined ? { dangerouslySetInnerHTML: { __html: html } } : { children })}>
  ```
  ⚠️ **`children` 与 `html` 互斥** ⇒ 用**联合类型**表达（`{ html: string; children?: never } | { html?: never; children: ReactNode }`），**不许** `any` / `@ts-expect-error`。🔴 **不开 `...rest`**。

- [ ] **Step 3: ① 迁 3 处（入账）**
  | 落点 | 今天的形态 | 迁移后 |
  |---|---|---|
  | `NotePreviewView.tsx:301`（style `:300`） | `background:"#fff"` + 整圈 `1px solid #e5e7eb` + `radius 8` + `dangerouslySetInnerHTML` | `<Surface level="surface" radius="panel" html={…} />` ⇒ **边框棘轮 −1** |
  | `RefineWorkbench.tsx:442`（style `:441`） | 同上 | 同上 ⇒ **−1** |
  | `SessionScreenCards.tsx:98`（style `:97-103`；🔴 **E1 实测**：`:96` 是 `id` 行、`:98` 才是 `border: "1px solid #e5e7eb"` —— `### 表 6b` 的 **E-26**） | `background:"#fafafa"` + 整圈 + `radius 8` + **`id`** | `<Surface level="canvas" radius="panel" domId={…} />` ⇒ **−1** |
  🔴 **四层都迁、三处入账**：`NotePreviewView.tsx:295`（style `:294`）的边框是 **`1px solid #d1fae5`（语义绿）** ⇒ **不入棘轮账**（C9.4 逐字），但**仍要迁**（去掉一层手写 style）。
  🔴 **不迁的两处**：`RefineWorkbench.tsx:457` / `:470`（并排双栏的**单向** `borderRight` / `borderBottom` —— `Surface.bordered` 只出整圈，**结构上表达不了**）⇒ **逐处登记 `no-passthrough-*`**。

- [ ] **Step 4: ② 迁逐处名单（受控槽 + 「只出边框」档）**
  🔴 **顺序**：先给 `Surface` 加档 → 再逐处迁 → **最后**按**实测**登记（C9.5 + C10.8 第 2 条）。
  ⚠️ **逐个人工确认父层底色**（批 4 报告 §代价的原话 ≈150 行读码）+ **逐处可见观感变化登记**（观感类一律**未测**，C6.4）。

- [ ] **Step 5: 同步三族台账（C5.1 + C9.5 + C9.19）**
  ① `surfaceBaseline.ts`：三族常数 + 三张 `*_BY_FILE` + 三个 ANCHOR（**逐键 diff**）
  ② `surfaceResidual.ts`：三条 `no-passthrough-*` 收紧/删除 + `SURFACE_TAG_REGISTRY` 新登记行
  ③ `style-seams.test.ts` 的 `SURFACE_CLASSES`（**净增 0**）+ `style-contract.test.ts` 的契约表（若改联合）

- [ ] **Step 6: 跑门禁并提交**
  ```powershell
  cd app; npx tsc --noEmit
  cd ..; node scripts/line-limits.mjs --full
  node .superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/plan-writer/frozen.mjs
  ```
  期望：`tsc` 0 错 · `--full` **exit 0 · 0/122/122**（**本轮无新增登记**）· 三族 Σ **≤ 拆前**、`SURFACE_TAG_TOTAL` = Σ 登记值。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **两个受控槽真的工作**（行为级）：① `html` 给定 ⇒ 宿主 `innerHTML` 含该串（且 `children` 未渲染）② `domId` 给定 ⇒ `document.getElementById` 找得到 | **M1**：把 `id={domId}` 改成 `id={testId}` | **M1 后期望**：② 的具名断言红（`getElementById("anchor-x")` 为 `null`） |
| **V2** | **`...rest` 真的没开**（负向判据）：`tsc` 探针给 `<Surface data-foo="1" />` **必须报错** | **M2**：给 `SurfaceProps` 加 `[key: string]: unknown` | **M2 后期望**：探针 **0 诊断** ⇒ 红（**「不开 `...rest`」的具名断言**） |
| **V3** | **「只出边框」档真的不出底色**：探针读 `Surface.css` 的该档规则 ⇒ **不含** `background` / `background-color`（剥注释后） | **M3**：在该档规则里加 `background: var(--ed-bg-surface);` | **M3 后期望**：探针报「该档含 background」⇒ 红 |
| **V4** | **三族棘轮守恒**：`FROZEN_BORDER_TOTAL == Σ(FROZEN_BORDER_BY_FILE)` · 同理圆角/阴影/`SURFACE_TAG_TOTAL == Σ(SURFACE_TAG_REGISTRY)`；且**每个值 ≤ 拆前** | **M4**：把 `FROZEN_BORDER_TOTAL` 单独改小而不动逐文件表 | **M4 后期望**：守恒判据红 |
| **V5** | **`<Surface>` 新增登记制的三步同步**：`surfaceTagRegistry.test.ts` 全绿（legacy 行 `≤`、新登记行 `==` 实测）；`SURFACE_TAG_ANCHOR.entries` **逐字等于**实测 | **M5**：只抬 `FROZEN_SURFACE_TAG_TOTAL` 而**不登记**新行 | **M5 后期望**：⑪ 红（「凭空抬高总数而不登记」） |
| **V6** | **迁移零棘轮新增**：迁移后 **没有任何新键**出现在三张 `*_BY_FILE` 里 | **M6**：在迁移后**保留**行内 `border: "1px solid #e5e7eb"` | **M6 后期望**：该文件的边框键**不减**（甚至涨）⇒ 与 V4 的「≤ 拆前」同向红 |
| **V7** | 🔴 **`NON_MIGRATED_14` 零触碰**：`dialogMigration.e.test.ts:252-253` 全绿（命中 = **0**）；**正控** = `:255` 的阳性对照仍绿 | **M7**：在 `CaptureOverlayPanel.tsx` 里加 `import { Surface } from "../ui/primitives";` | **M7 后期望**：`:252-253` 报「登记为「不迁」的文件开始用原语了」⇒ 红 |
| **V8** | **`style-seams.test.ts` 净增 = 0**（改前后都 299）；且 `SURFACE_CLASSES` 与 `Surface.tsx` 的联合**逐条对拍** | **M8**：只改 `Surface.tsx` 的联合而忘了 `style-seams.test.ts` | **M8 后期望**：`:44` 与契约表的对拍红 |
| **V9** | **仪器自证（C10.8 第 1 条）**：逐处名单探针的**正控**（已知透明容器必须命中）+ **负控**（已迁走的写法必须报 0）+ **两处缺陷已修**（遇 `;` 不早退 · `backgroundImage` 被识别） | **M9**：把探针的 `tagBefore()` 回退到「遇 `;` 提前返回」 | **M9 后期望**：正控**仍命中**但负控**误报 ≥5 处控件** ⇒ 与批 4 的 28 处误分**逐字复现** ⇒ 证明缺陷真的被修了 |
| **V10** | `line-limits --full` **exit 0 · 0/122/122** | — | 逐字读数 |

**提交信息**：`feat(ui): Surface 加受控槽与只出边框档并迁移调用点`（**subject 33 字**）

**诚实边界**：① 🔴 **逐处名单里的可见观感变化一律未测**（像素/观感归批 8，C6.4）—— 报告只登记「迁了哪几处」与「每处的父层底色核对结论」；② 「21」**不是验收数字**（C10.8 第 3 条）⇒ **不得**写进任何冻结常数；③ **`Surface` 的「只出边框」档打开了一个 0-D 设计冻结面**（批 4 B6 的 ≥3 阈值判据在这里被「一个档位」绕过）⇒ 本计划**只登记这个事实**，**不自行裁定**（🔴 **更正指针**：§C11 的 8 条裁决**未覆盖它** ⇒ 原指向「`## 待控制方裁决` #3」是**错指针**；**本批不裁定**，已登记进 `## 诚实边界` 的「本批未做」第 16 条 → **批 8**）；④ 「② 的落点会不会平白多一层底」由 V3 的 **CSS 级**判据保证，**不证明运行时的层叠结果**（jsdom 不做样式级联）。

---

### Task 8: `check-bundle-budget.mjs` 拆件（C9.6 第 4/5 条）

> **依据**：C9.6 第 4 条逐字「`check-bundle-budget.mjs` **299 行（余 1）** ⇒ **先拆件再加门禁**」+ 第 5 条「该脚本是**唯一**判首屏的门禁 ⇒ 拆件必须**逐字保持**首屏读数」。

**目标**：把 `measure()` 族搬进 `scripts/lib/bundleMeasure.mjs`；主件只留 CLI / 报表 / 退出码 / `selfTest`；**读数逐字不变**。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `line-limits` 视野 | `.mjs` **不在** `SOURCE_EXT` 内 | — | 🔴 **本任务无门禁压力**；拆件是为**可读性与余量**（C9.6 第 4 条仍要求「先拆后改」） | **否** |
| 首屏读数（`--no-build`） | **首屏 3 chunk · 103.60 kB gzip · 余量 96.40 kB** | 🔴 **逐字不变** | 纯搬迁 ⇒ 读数**必须逐字相同** | ⚠️ **是**（若读数变化 ⇒ 说明动了语义） |
| 六棘轮 | — | — | `scripts/**` 不在棘轮域 | **否** |

**Files:**
- 改 `scripts/check-bundle-budget.mjs`（**299**）
- 新建 `scripts/lib/bundleMeasure.mjs`（预算 **≤150 行**）
- **`NON_MIGRATED_14`**：不适用

**Interfaces:**
- Produces：`export { measure, staticDeps, entryChunkName, firstScreenChunks, listAssets, gzBytes, kB, fmtB }`（**T9 的门禁要复用 `measure()`**）

- [ ] **Step 0: 取拆前读数（**必须逐字存盘**）**
  ```powershell
  node -e "const{execFileSync}=require('child_process');const fs=require('fs');fs.writeFileSync('.superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/t8/before.json',execFileSync(process.execPath,['scripts/check-bundle-budget.mjs','--no-build','--json'],{encoding:'utf8'}));"
  node scripts/check-bundle-budget.mjs --self-test
  ```
  🔴 **不要用 `>`**（PS 5.1 写 UTF-16LE）。若沙箱受限导致 `child_process` 捕获输出 `EPERM` ⇒ 改用重定向 + `readFileSync(p,"utf16le")`。

- [ ] **Step 1: 建 `scripts/lib/bundleMeasure.mjs`（纯搬迁）**
  搬 `measure()`（`:126-142`）与其全部依赖（`staticDeps` `:69-78` · `entryChunkName` `:81-94` · `firstScreenChunks` `:97-113` · `listAssets` `:116-123` · `gzBytes` `:62` · `kB` `:61` · `fmtB` `:60` · `rel` `:54`），**保留全部 `@ai-context` 注释**（口径是脚本的一部分）。
  🔴 **`fail()`（`:56-59`）留在主件**（它调 `process.exit(2)`）⇒ 新件改为**抛 `Error`** 并由主件捕获转 `fail()`。⚠️ **这是一处语义改写**，必须逐字论证等价（输出与退出码逐字相同）。

- [ ] **Step 2: 主件收口** —— 文件头 + `argv` 解析 + `BUDGET_KB`/`BUDGET_SOURCE` + `printHuman` + `jsonOf` + `finish` + `selfTest` + 三个前置校验（`:289-292`）+ 主流程（`:294-299`）。

- [ ] **Step 3: 逐字对拍（C9.6 第 5 条）**
  ```powershell
  node scripts/check-bundle-budget.mjs --no-build --json   # 与 before.json 逐字节比较
  node scripts/check-bundle-budget.mjs --self-test         # 期望「✅ self-test 通过（…退出码契约 0·1·2）」
  ```
  比较探针（node）⇒ **`JSON.stringify(a) === JSON.stringify(b)`**。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **`--no-build --json` 读数逐字相同**（每个字段相等） | **M1**：把 `measure()` 的 `lazy` 过滤从 `!eager.has(a.name)` 改成 `true` | **M1 后期望**：`lazy.count` / `lazy.chunks` 变化 ⇒ JSON 比较报差异 ⇒ 红 |
| **V2** | **`--self-test` 逐字通过**（7 个退出码契约用例 + 夹具断言） | **M2**：把 `RE_STATIC` 的 `([^"'/\\]+\.js)` 收窄成 `(\w+\.js)` | **M2 后期望**：`self-test` 报「静态闭包 = …」不符 + `❌ self-test 失败 N 项` + **exit 2** |
| **V3** | **退出码契约不变**：`--budget 0.001` ⇒ **1** · `--budget 100000` ⇒ **0** · 空 dist ⇒ **2** | — | 三个读数逐字 |
| **V4** | **`fail()` 的等价改写**：不存在的 dist ⇒ 输出 `❌ 首屏预算守卫：找不到 app/dist/index.html —— 产物缺失。…` **逐字**、exit **2** | **M4**：把新件抛的 `Error` 在主件改成 `console.error` 后**不 exit** | **M4 后期望**：空 dist 的 exit 变成 **0** ⇒ V3 红 |
| **V5** | **主件行数下降**：299 → ~200；新件 ≤300 | — | `lines.mjs` 读数（🔴 **`.mjs` 不在门禁视野** ⇒ 自设预算，超了如实登记） |

**提交信息**：`refactor(scripts): 拆出 bundleMeasure 度量模块`（**subject 30 字**）

**诚实边界**：① 🔴 **`.mjs` 不在行数门禁视野** ⇒ 「拆到 ≤150 行」是**自设预算**，不是绑定约束；② 「读数逐字相同」只覆盖 **`--no-build`**；**真实构建的读数不在本任务的证明面内**；③ `fail()` → `throw Error` 的改写**是一处真实的语义重构**（虽然行为等价）⇒ 若控制方要求「拆件零改写」⇒ 把 `fail` 一起搬进新件（副作用外泄）；**本计划选前者并在报告里逐字论证**。

---

### Task 9: 懒侧字节门禁（C9.6 + C9.7 + C10.4）

> **依据**：C9.6 五条硬约束 + C10.4「基线冻结为**今天实测的 36 chunk / 698.86 kB**（`≤`、只许降）；🔴 **禁止**写一个比今天更小的乐观「预算值」（会立刻红）」。

**目标**：新增**族前缀清单等式 + 逐族 gzip 上限 + 懒侧总 gzip 上限**三条判据；**不改**首屏语义 / `BUDGET_KB`；**门禁自证有牙**。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| 首屏读数 | 103.60 kB gzip | 🔴 **不变** | 只加**懒侧**判据；**不把懒侧并进首屏预算** | ⚠️ **是**（若并进去） |
| `BUDGET_KB` | **200**（`--budget` 默认；来源 `docs/standards/performance.md:28`） | 🔴 **不改** | 不动 | ⚠️ **是**（若改） |
| 懒侧总 gzip | 🔴 **698.86 kB**（**36 chunk**，控制方串行实测 = C10.4 的冻结值） | 🔴 **只许降**（C9.6 第 2 条 + C10.4） | 建冻结基线 `scripts/lazyBudget.json`（**写今天的实测值，不许写更小的乐观值**） | ⚠️ 首次建基线**必须写实测**；之后只许降 |
| 六棘轮 | — | — | `scripts/**` 不在棘轮域 | **否** |
| `docs/standards/performance.md`（**167**） | 绿 | `.md` 不受行数门禁 | **+≤8 行** | **否** |

**Files:**
- 改 `scripts/check-bundle-budget.mjs`（T8 拆后 ~200 行）
- 新建 `scripts/lazyBudget.json`（冻结基线：`{ generatedFrom, families: [{prefix, gzipBytesMax}], lazyTotalGzipBytesMax }`）
- 改 `docs/standards/performance.md`（**167**，+≤8 行）

**Interfaces:**
- Consumes：T8 的 `measure()`（**同一个度量实现**保证两个读数的口径一致）
- Produces：`finish()` 里的**第二个 pass**（`firstScreenPass` 与 `lazyPass` 两个独立布尔）—— ⚠️ **退出码语义扩张**：今天 `0 = 达标 · 1 = 超预算 · 2 = 构建失败`；新增懒侧判据后 **`1` = 任一门禁超标**（首屏或懒侧），并在输出里**分别打印两个 pass**；`--json` 增加 `lazyBudget: { pass, families: [...], total }`。
  🔴 **本条的形态已裁（§C11.5，2026-09-13；原「请控制方追认」作废）**：**不新增退出码** —— `exit 1` 的含义**扩张为「任一预算超标（首屏 / 懒侧）」**，**但必须同时做到三条**：① 🔴 **同步改写 `scripts/check-bundle-budget.mjs:32` 的契约注释**（现逐字「退出码：0 = 达标 · 1 = 超预算 · 2 = 构建失败 / 产物缺失 / 自检失败。」会被读成只指首屏 ⇒ 必须写成「**1 = 首屏或懒侧任一预算超标**」，并把两个独立读数写进注释）；② 人类可读输出**分别打印两个 pass**；③ `--json` **分别给首屏与懒侧的 `pass` 字段与读数**（`firstScreen.pass` 与 `lazyBudget.pass` **平级**）。🔴 **不得**让懒侧判定影响首屏字段（C9.6 第 1 条）。理由（§C11.5 逐字）：新增退出码会**破既有 CI/husky 契约**（破坏面大于收益）⇒「单一失败码 + 输出点名」是最小破坏面。

- [ ] **Step 1: 建冻结基线（C10.4）**
  ```powershell
  node scripts/check-bundle-budget.mjs --no-build --json
  ```
  ⇒ 从 `lazy.chunks` 按**族前缀**归组（`vendor-katex-*` · `vendor-gsap-*` · `vendor-md-*` · `vendor-react-*` · 页面名族 …）⇒ **逐族 gzip 上限 = 当次实测值**（**只许降**）；`lazyTotalGzipBytesMax` = 当次实测的懒侧总 gzip = **698.86 kB**。
  🔴 **族前缀必须用实测 chunk 名**（`vendor-katex-CLrGOHeO.js` ⇒ 前缀 `vendor-katex-`），**不得**用内容 hash 当键。

- [ ] **Step 2: 加三条判据**
  ① **清单等式**：产物里**每一个**懒侧 chunk 都必须归属某个已登记族（或显式 `others` 白名单）⇒ **未归族 ⇒ 红**
  ② **逐族 gzip 上限**
  ③ **懒侧总 gzip 上限**
  ⇒ 三条**各自有独立的具名断言**（C9.6 第 3 条）。

- [ ] **Step 3: 🔴 九个棘轮的「普查 vs 棘轮」逐处声明（C9.7）**
  | 指标 | 性质 | 判据形态 | 本批处置 |
  |---|---|---|---|
  | `surface` 的边框/圆角/阴影总量 | **棘轮**（只许降的上限） | 保留 `<=` | **不转换**；C9.7 逐字「**禁止**无差别把 `<=` 改成 `===`」 |
  | `surface` 的 `<Surface>` 调用点 | **普查**（标签数/条目数） | **已经是三连通严格相等**（`FROZEN == Σ登记 == Σ实测`） | **已经是等式** ⇒ 无需转换 |
  | `loading` 的 `FROZEN_LOADING_TEXT_TOTAL` | **棘轮** | 保留 `<=` | **不转换** |
  | `loading` 的 `MIGRATED_FILES`（迁移面**下界**） | **普查** | 已有下界判据 + 残留面上界 | **不转换**（改等式会砸掉"下界"语义） |
  | `nativeButton` 的总量 | 🔴 **刻意设计的棘轮**（`:9-11` 逐字解释：拆件会让逐行 key 假红，故用计数 + `SPLIT_MOVES` 守恒） | 保留 `<=` | 🔴 **不得改成等式**；它的**等式牙齿在另一个文件**：**`buttonMigration.test.ts:268-273`**（`:272` = `常量 == 逐文件 entries 之和`）—— 🔴 **§C9.7 原引的 `:268-273` 是「引错文件」**（`nativeButton.ratchet.test.ts` 只有 265 行、且它自己的 `:196-201` 是 `总量 ≤ 常量`）；**变异体裁定见 `### 表 6b` 的 E-25**。🔴 **`nativeButton.ratchet.test.ts` 自己的牙 = ① `总量 ≤ 常量` `:196-201` · ② 逐文件 `:203-214` · ④ `SPLIT_MOVES` 守恒 `:228-253` · ⑤ `const *Btn*` 族 `:255-263`**（**四件都不是等号判据**） |
  | 新增的懒侧三判据 | **棘轮**（族上限 + 总上限） | `<=` | — |
  ⇒ 上表**逐字进报告**（C9.7 的「逐处声明」要求）。

- [ ] **Step 4: 门禁自证有牙（变异体，C9.6 第 3 条逐字；**必须真的改变行为**）**
  - **M-A**：把 `lazyTotalGzipBytesMax` 改成**比实测小 1** ⇒ **必须红在「懒侧总 gzip」这条具名断言上**
  - **M-B**：把某族的 `gzipBytesMax` 改成**比实测小 1** ⇒ **必须红在该族那条具名断言上**
  - **M-C**：**让 katex 重新成为懒侧依赖** ⇒ 在 `SessionRawView.tsx` 里加 `import katex from "katex";`（它住懒侧）⇒ 真实构建后 `vendor-katex-*` 的 gzip **涨** ⇒ **必须红在该族断言上**（⚠️ **需真实构建**（取锁）⇒ 若无法在 T9 内做 ⇒ **登记为「未跑的变异体」并归 T17**）
  - **M-D（反向守卫，必须绿）**：把某族基线**抬到实测值**（合法重冻）⇒ **必须绿**（防判据写成"永远红"）

- [ ] **Step 5: 文档 + 提交**
  `docs/standards/performance.md` 加一节：懒侧门禁的口径（族前缀 + 逐族上限 + 总上限）· 基线来源 · 「首屏与懒侧是两个独立读数」的硬约束。

- [ ] **Step 5′: 🔴 改写退出码契约注释（§C11.5 第 ① 条，**与本任务的判据改动同批**）**
  `scripts/check-bundle-budget.mjs:32` 现逐字：`* 退出码：0 = 达标 · 1 = 超预算 · 2 = 构建失败 / 产物缺失 / 自检失败。`
  ⇒ **必须改写成**（逐字建议，实施者可按同义改写但**不得少于这些信息**）：
  ```
   * 退出码：0 = **首屏与懒侧两个预算都达标** · 1 = **任一预算超标（首屏 / 懒侧）** ·
   *        2 = 构建失败 / 产物缺失 / 自检失败。
   *        两个读数**互相独立**：懒侧判定**不得**影响首屏字段（批 7 §C9.6 第 1 条 / §C11.5）。
  ```
  🔴 **判据**：改写后 `check-bundle-budget.mjs --self-test`、`--no-build`、`--json` 三条读数**逐字不变**（除本行注释）；`node scripts/docs-check.mjs` 不受影响（`.mjs` 不在其扫描面）。
  🔴 **报告须逐字登记这是一处口径扩张**（§C11.5 已裁，**不再需要追认**）。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **首屏读数逐字不变**（与 T8 的 `before.json` 比） | **M1**：把懒侧并进首屏预算（`eagerBytes += lazyBytes`） | **M1 后期望**：首屏 gzip 读数从 103.60 → 约 802 kB ⇒ V1 红 **且** exit 1 |
| **V2** | **懒侧总 gzip 判据有牙**：基线比实测小 1 ⇒ **exit 1** + 输出**逐字**含该具名断言的失败信息 | **M-A** | **红在具名断言上**；`ran > 0` 只是旁证 |
| **V3** | **逐族 gzip 判据有牙** | **M-B** | 同上 |
| **V4** | **清单等式有牙**：出现一个**未归族**的 chunk ⇒ **exit 1** | **M-C**（更硬：katex 重新成懒侧依赖） | **红**；⚠️ 需真实构建 ⇒ 无法做则登记归 T17 |
| **V5** | **反向守卫必须绿**：某族基线抬到实测值 ⇒ exit 0 | **M-D** | **绿**（防"永远红"） |
| **V6** | **两个读数独立**：`--json` 里 `firstScreen` 与 `lazyBudget` 是**两个对象**，**各自有 `pass` 字段与读数**（§C11.5 第 ③ 条），且 `firstScreen` 的字段**逐字未变** | **M6**：把 `lazyBudget` 塞进 `firstScreen`（**或**让懒侧超标去改 `firstScreen.pass`） | **M6 后期望**：结构比较报差异 ⇒ 红（**"懒侧不得影响首屏字段"的具名判据**） |
| **V7** | **C9.7 的逐处声明表逐字进报告**（字段级判据） | — | 手工核对（**无机器判据** ⇒ 诚实边界） |
| **V8** | 🔴 **退出码契约注释已同步改写**（§C11.5 第 ① 条）：`check-bundle-budget.mjs:32` 的注释**逐字含**「1 = 任一预算超标（首屏 / 懒侧）」与「两个读数互相独立」；**且不新增退出码**（`grep` 该脚本的 `process.exit(` 集合**恰为 `{0,1,2}`**，探针输出进报告） | **M8**：把注释改回「1 = 超预算」（只指首屏）而判据仍是双预算 | **M8 后期望**：V8 的文本探针报「注释未点名懒侧」⇒ 红 |

**提交信息**：`feat(scripts): 新增懒侧字节门禁与逐族上限`（**subject 29 字**）

**诚实边界**：① 🔴 **退出码 1 的含义被扩张**（**§C11.5 已裁：不新增码 + 必须同批改写 `:32` 的契约注释**）⇒ 报告须逐字登记**注释的 before/after**（不再是"请控制方追认"）；② **M-C 需要真实构建**，若本任务不跑 ⇒ **登记为未跑**（归 T17）；③ 懒侧基线**首次写入值 = 当次实测**（698.86 kB）⇒ **这是"冻结现状"不是"设定目标"** ⇒ 报告不得写成「已把懒侧降到 X」；④ 「族前缀」的覆盖面取决于当次产物的 chunk 名，`others` 白名单会随产物演进腐化 ⇒ **清单等式**正是为了让它**红**而不是静默通过；⑤ 🔴 **懒侧门禁对"首屏语义"零影响**这一点**只能证明到"字段与读数不变"**（V1/V6）—— 「懒侧超标不会误报为首屏超」的**人读侧**由 `:32` 的注释与两个 `pass` 的分别打印承担（**无机器判据兜注释文本**，V8 的探针是文本级）。

---

### Task 10: 散文漂移 doc/comment-only 微单元（C10.6 的第 1–5 项）

> **依据**：C10.6 逐字「批 7 内派**独立**的 doc/comment-only 微单元（**单独提交、不含任何代码改动**）」+ C5.3 + C9.13。

**目标**：逐字修正 `### 表 2` 的**第 1–5 项**（共 6 个位点）；**零逻辑改动**。
🔴 **第 6 项（`:45` 的「313 条」）不在本任务** —— C10.6 逐字要求它与 registry 改动**同批** ⇒ 它在 **T4（→310）与 T19（→311）**。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `textBaseline.ts` 行数 | **297** | 🔴 **净增必须 = 0**（余 3） | 只改两行散文的**内容**，不加行 | ⚠️ **是**（若加行） |
| `nativeButton.ratchet.test.ts` 行数 | **265** | 余 35 | 只改两行散文 | **否** |
| `surfaceBaseline.ts` 行数 | **261** | 余 39 | 只改两行散文（`:49` **不改**） | **否** |
| `textRatchet.test.ts:11` | 散文「弱化灰 249/100 → 63/44」 | — | **先核实**；若 `44` 确为过期 ⇒ 改 **43** | **否** |
| `v0.22.md` 的三处 | 见 `### 表 2` 第 1–3 项 | — | **加注式更正**（不改历史段落原文） | **否** |
| 六棘轮的常数与逐文件表 | 见 `### 表 2` | 🔴 **一个字不动** | 🔴 **只改散文** | ⚠️ **是**（若动了常数） |

**Files:**
- 改 `docs/versions/v0.22.md` —— `:423` / `:425` / `:434` / `:435`（**加注式**）
- 改 `app/src/ui/primitives/nativeButton.ratchet.test.ts`（**265**）—— `:25` / `:182`
- 改 `app/src/ui/primitives/textBaseline.ts`（**297**）—— `:19` / `:25`
- 改 `app/src/ui/primitives/surfaceBaseline.ts`（**261**）—— `:47` / `:48`（**`:49` 不动**）
- 改 `app/src/ui/primitives/textRatchet.test.ts`（**270**）—— `:11`（**先核实**）
- **`NON_MIGRATED_14`**：不适用

- [ ] **Step 1: 逐处改（**逐字给出 before/after**）**
  | file:line | before（逐字） | after（逐字） |
  |---|---|---|
  | `nativeButton.ratchet.test.ts:25` | ` * （T1 冻结 510/121 → T5–T10 后 493/121 → T12 后 394/114）。` | ` * （T1 冻结 510/121 → T5–T10 后 493/121 → T12 后 **393**/114；批 7 T10 修正散文，真值以常数与逐文件表之和为准）。` |
  | `nativeButton.ratchet.test.ts:182` | `describe("原生按钮棘轮（B4）：基线随迁移只降不升（T12 后 394 处 / 114 文件）", () => {` | `describe("原生按钮棘轮（B4）：基线随迁移只降不升（T12 后 393 处 / 114 文件）", () => {` |
  | `textBaseline.ts:19` | ` *   → **T16-B 迁移后 63/44**（2026-09-12 T16-B 收紧）。字号越界处/文件：**604/124 → 576/122 → 558/120**` | ` *   → **T16-B 迁移后 63/43**（2026-09-12 T16-B 收紧）。字号越界处/文件：**604/124 → 576/122 → 551/120**` |
  | `textBaseline.ts:25` | ` *   **+1**：总量 **63 → 64** / 该文件 **1 → 2**（条目数、锚、字号侧未动；机理详见 \`textRatchet\` ⑥）。` | ` *   （批 7 T10 修正散文：**63** 是朴素剥注释后的真值，**64 从未写入常数**；该文件 1 → 2 的描述仍成立）` |
  | `surfaceBaseline.ts:47` | ` *   ⇒ 三族收紧读数：边框 **240 → 226 处 / 111 → 108 文件** ·` | ` *   ⇒ 三族收紧读数：边框 **240 → 223 处 / 111 → 107 文件** ·` |
  | `surfaceBaseline.ts:48` | ` *     越界圆角 **270 → 261 处 / 112 → 109 文件** ·` | ` *     越界圆角 **270 → 260 处 / 112 → 108 文件** ·` |
  | `surfaceBaseline.ts:49` | 阴影 **24 → 24 处 / 24 文件** | 🔴 **逐字保留**（真值未变）—— **不改** |
  | `v0.22.md:425` | 「收口后更正」块自称 `FROZEN_MUTED_GRAY_TOTAL = 64` | **加注**：`> 🔻 批 7 T10 更正：该值实为 **63**（常数与 Σ表 一致）；本块原文保留。` |
  | `v0.22.md:423` | `63/44` + `226+261+24` | **加注**：`> 🔻 批 7 T10 更正：应为 **63/43 · 223/260/24**（实测）。` |
  | `v0.22.md:434/:435` 的 5 处 | `textBaseline.ts` 299 · `surfaceRatchet.test.ts` 287 · `textRatchet.test.ts` 266 · `NotesPage.tsx` 300/300 · `CommandPalette.tsx` 203/220 | **加注**：`> 🔻 批 7 T10 实测更正：**297 · 261 · 270 · 295 · 207**。` |
  | `textRatchet.test.ts:11` | `「弱化灰 **249/100 → 63/44**」` | **先核实**；若确过期 ⇒ `44` → **43** |

- [ ] **Step 2: 自证「只改散文」**
  探针：`git diff -U0` 的新增行**逐行断言** `^\+ \*` 或 `^\+describe\(` 或 `^\+> `（Markdown 引用块）。
  🔴 **`describe(` 的标题串算不算"散文"？** ⇒ 🔴 **已裁（§C11.6）：算散文，可改**（Vitest **不按标题匹配**，它只影响报告可读性）。**但附加四条硬条件（§C11.6 逐字，防「改散文改出事」）**：
  1. 🔴 **该提交只改字符串** —— **任何断言、计数、常数一律不动**（`nativeButton.ratchet.test.ts` 的 `FROZEN_*` / `*_BY_FILE` / `SPLIT_MOVES` 全在冻结面内；🔴 **「常量 == 逐文件 entries 之和」的牙在 `buttonMigration.test.ts:272`**，同样一个字不许动 —— 见 `### 表 6b` 的 **E-25**）；
  2. 🔴 **改前必须在全仓 grep 该标题原文**（`基线随迁移只降不升（T12 后 394 处 / 114 文件）` 这一整串），确认**没有**任何测试 / 脚本 / 文档按它匹配或引用 —— **有 ⇒ STOP 报控制方**（判据要把命令与输出写进报告）；
  3. 🔴 **评审须以 diff 逐字核对「只有标题串变了」**（`git diff -U0` 的新增行**只有** `describe(` 那一行）；
  4. 🔴 **该文件的门禁读数与该文件自身的用例数前后逐字相同**（`nativeButton.ratchet.test.ts` 的 `--reporter=json` 用例数 before == after；`--full` 读数同）。

- [ ] **Step 3: 跑门禁并提交**
  ```powershell
  cd app; npx vitest run src/ui/primitives/nativeButton.ratchet.test.ts src/ui/primitives/textRatchet.test.ts src/ui/primitives/surfaceRatchet.test.ts --reporter=json --outputFile=../tmp/t10/ratchets.json
  cd ..; node scripts/line-limits.mjs --full
  node scripts/docs-check.mjs
  ```

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **三支棘轮判据全绿** · `--full` **exit 0** · `docs-check` **exit 0** | **M1**：把 `FROZEN_NATIVE_BUTTON_TOTAL` 从 393 改成 394（**动常数**） | 🔴 **M1 后期望（变异体裁定，§C17.3；E1 在导出树实跑）**：红在 **`buttonMigration.test.ts:272:93`**（`expect(FROZEN_NATIVE_BUTTON_TOTAL, …).toBe(sum)` ⇒ 「基线常量 394 ≠ 逐文件之和 393」）；**`nativeButton.ratchet.test.ts` 的「总量 ≤ 常量」保持绿**（392 ≤ 394）⇒ 🔴 **不得**把期望红点写成 `nativeButton.ratchet.test.ts`（那是**引错文件**；见 `### 表 6b` 的 **E-25**，证据 `tmp/e1/e25-mutant.json`）。**证明"只改散文"这条边界真的被判** |
| **V2** | **行数逐字不变**：`textBaseline.ts` = **297**（改前后）；`nativeButton.ratchet.test.ts` = **265**；`surfaceBaseline.ts` = **261** | **M2**：把 `textBaseline.ts:25` 的那一行拆成两行 | **M2 后期望**：`lines.mjs` 报 **298** ⇒ 红 |
| **V3** | **逐行 diff 全在注释/引用块内** | **M3**：顺手把 `FROZEN_MUTED_GRAY_TOTAL` 从 63 改成 64 | **M3 后期望**：diff 里出现非注释行 ⇒ 红 |
| **V4** | **`docs-check` 的扫描/检查数与基线逐字相同**（280/180）+ 五项全 ✅ | — | 逐字读数 |

**提交信息**：`docs: 修正棘轮头注与版本记录的过期数字`（**subject 22 字**）

**诚实边界**：① 本任务**只改散文** ⇒ 若某处"真值"在 7b 又变（如 T7/T17 又迁移了几处）⇒ 该处**会在收口时再次过期** ⇒ 报告须登记「批 7 收口时须复核这 6 个位点」；② 「`describe` 标题算散文」**已由 §C11.6 裁定（算，可改）** ⇒ 不再是本计划的解释，**但四条硬条件（只改字符串 / 改前全仓 grep 标题原文 / 评审逐字核 diff / 用例数与门禁读数前后逐字相同）一条不许省**；③ 本任务**不修** `line-limit-exemptions.md:45`（它在 T4/T19）；④ 🔴 **散文对拍探针（T11 的 `scripts/check-exemption-prose.mjs`）不入八闸**（§C11.8）⇒ 本任务的"改完没人拦"是**已知边界**，不是缺陷（探针的手工跑读数进报告即可）。

---

### Task 11: 豁免表的**非行数**类同步（🔴 **§C14 已裁：行数列改由「改文件的那个单元」同批更新**）

> **依据**：C1.1 的「另有一处无门禁兜底的手工同步」+ C0.7（`:45` 必改）+ **C10.6 第 6 项**（`:45` 必须与 registry 改动同批 ⇒ **不在本任务**）+ 🔴 **`rulings.md` §C14（2026-09-13，由 T2/T8 双双撞钩子的实测触发）**。

**目标**：① 🔴 **非行数类维护** —— `LiveActivityPanel.tsx` 那一行的**拆法说明列**（`:38` 的「若再增长：转录流与 OCR 预览拆至 `LiveTranscriptStream.tsx` / `LiveOcrPreview.tsx`」在 T6 拆完后**改为已拆记录**）、以及 T6/T7 新文件的**登记行文案**（若需要）；② **为 `:45` 的散文新造一条可机器核对的对拍探针**（C10.6 的"无门禁兜底"是它必须被机器守住的理由）。
🔴 **本任务不再集中补任何行数**（§C14 逐字：**豁免表的行数列改由「改文件的那个单元」在同一提交里更新**）—— 即 `app/src/App.tsx` 行数由 **T1** 改、`LiveActivityPanel.tsx` 行数由 **T6** 改（其整行随之删除）、`app_commands.rs` 行数由 **T4/T19** 改、其余行由各自文件的写者改。**理由（§C14 机理）**：`line-limits.mjs --full` 的 **(e) 逐文件行数一致性**判据要求「已登记文件的行数 == 登记值」，而 husky pre-commit 扫的是**工作树** ⇒ 原计划把「改文件」与「补登记行数」拆给不同单元 ⇒ **每一个中间提交都必然撞钩子** ⇒ 等于**强制全员 `--no-verify`**（把门禁变成形式）。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `line-limits --full` 的「0 / 122 / 122」 | **0 / 122 / 122** | 只许更好或持平 | T6 拆件后登记条目 **122 → 121**；若 T7 引入 >300 的新文件 ⇒ 会涨 | ⚠️ **是**（若数值不一致） |
| `line-limit-exemptions.md` 的**散文数字** | `:23` 的 `App.tsx \| 599`（**T1 改**）· `:38` 的 `513`（**T6 改**）· `:45` 的「313 条」（**T4/T19 改**） | 🔴 **无门禁兜底** | 🔴 **本任务一个行数都不改**（§C14）；本任务只改**非行数**列（拆法说明 / 记录文案） | **否**（无门禁） |
| 🔴 **行数一致性的归属（§C14）** | 每个已登记文件的行数 | `--full` 的 **(e)** 判据 = **工作树实测 == 登记值** | 🔴 **改文件的那个单元在同一提交里更新自己那一行**（T1/T4/T6/T7/T10/T19 各自） | ⚠️ **是**（若拆给别的单元 ⇒ **每个中间提交必撞钩子**） |
| 六棘轮 | — | — | `docs/**` 不在棘轮域 | **否** |

**Files:**
- 改 `docs/standards/line-limit-exemptions.md`（**234**）—— 🔴 **只改非行数类**：`:38` 的**拆法说明列**（T6 拆完 ⇒ 改成已拆记录）/ 必要的记录文案
- 新建 `scripts/check-exemption-prose.mjs`（**本任务新造的散文对拍探针**，预算 ≤120 行；`.mjs` 不在门禁视野）
- 🔴 **本任务不改任何行数列**（§C14：行数由各文件的写者在自己提交里改）

- [ ] **Step 1: 收集真值（**只读，作为对拍基准，不改表**）**
  ```powershell
  node .superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/plan-writer/lines.mjs app/src/App.tsx app/src/components/LiveActivityPanel.tsx app/src/components/LiveTranscriptStream.tsx app/src/components/LiveOcrPreview.tsx
  node scripts/line-limits.mjs --full
  ```

- [ ] **Step 2: 改**非行数**类（§C14）**
  ① `:38` 的 `LiveActivityPanel.tsx` 行的**拆法说明列** ⇒ 改成「**已拆**：转录流 → `LiveTranscriptStream.tsx`、OCR 预览 → `LiveOcrPreview.tsx`（批 7 T6）」；🔴 **行数列由 T6 在同批改**（若 T6 后主件 ≤300 ⇒ **整行移除**，由 **T6** 做，**不是本任务**）
  ② 新增文件的登记行（若 T6/T7 的新文件需要登记）⇒ 🔴 **由创建它的任务登记**（T6/T7），本任务只在报告里核对

- [ ] **Step 3: 🔴 新造散文对拍探针（C10.6 的机器兜底）**
  `scripts/check-exemption-prose.mjs` 的判据：
  - **①** 读 `:45` 的 `(\d+) 条` 与 `check-command-registry.mjs` 输出的 `定义 (\d+)` ⇒ **必须相等**
  - **②** 读 `:23` 的 `app/src/App.tsx | (\d+)` ⇒ 与 `countLines('app/src/App.tsx')` **必须相等**（**这一半本来就有 `--full` 兜底** ⇒ 作为对照）
  - **③ 防真空**：`--self-test` 喂一个**手工构造的错值** ⇒ 必须报不等
  - 退出码：`0` = 全一致 · `1` = 有不一致 · `2` = 解析失败
  🔴 **该探针不是本批的门禁**（不在八闸内）⇒ **报告须逐字说明它"只能登记、不能拦住提交"**（🔴 **已裁：§C11.8 = 入库但不入八闸** —— 原文"除非控制方把它纳入门禁"作废）。

- [ ] **Step 3′: 🔴 按 §C11.8 固化「入库但不入八闸」的四件事**
  1. 🔴 **脚本必须入库**（不是只活在 gitignored 的 `tmp/`）—— §C11.8 逐字理由：否则**批 8 无法复用**；
  2. 🔴 **脚本自述「非门禁，手工跑」**：**`--help` 与文件头注两处都写**（建议逐字：`* ⚠️ 本脚本**不是门禁**：不入八闸 / 不入 CI / 不入 husky，只能**手工跑**（批 7 §C11.8）。批 8 的候选闸。`）；
  3. 🔴 **先查自动捡拾面**（§C11.8 第 ② 条）—— **E1 已于 2026-09-13 只读复核，结论：三者都不会自动捡它**：
     | 自动面 | 实测形态 | 会不会捡 `scripts/check-exemption-prose.mjs`？ |
     |---|---|---|
     | `scripts/validate-all.mjs` | `steps` 是**显式命令清单**（只直接跑 `scripts/docs-check.mjs`；**无 `scripts/*.mjs` glob**） | ❌ **不会** |
     | `.husky/pre-commit` | 只跑**三条具名脚本**（`line-limits --full` && `docs-check` && `check-command-registry`） | ❌ **不会** |
     | `.github/workflows/pr-check.yml` | `docs` 过滤器的路径只含 `docs/**` 与 `scripts/docs-check.mjs`；各 job 的 `run:` 是具名脚本 | ❌ **不会** |
     ⇒ **无需换名、无需显式排除**；🔴 **但实施者必须自己复跑这三条只读核对**并把命令与输出写进报告（**不得**引本行当证据）；
  4. 🔴 **规格回写登记它为「批 8 的候选闸」**（→ **T21** 的 §12/§11 面或 `v0.22` 批 7 节的登记段）。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | `--full` **exit 0** 且逐字 `>600 硬限 0 · 301–600 档 N · 登记条目 N`（N 与实测一致） | **M1**：把 **T1 改过的** `App.tsx` 那一行的登记值写错 1 行 | **M1 后期望**：`--full` 的「数值一致」**红**（**这一半有门禁兜底**；🔴 **该行归属 T1**（§C14）⇒ 本任务只做**只读核对**） |
| **V2** | **散文对拍探针有牙**：`check-exemption-prose.mjs` 在 `:45` 与 registry 不一致时 exit **1**；`--self-test` 的错值夹具必须报不等 | **M2**：把 `:45` 留成 313 而 registry 已是 310 | **M2 后期望**：探针 exit **1** + 报「散文 313 ≠ 门禁 310」 |
| **V3** | `git diff` **只含本任务的路径**（`docs/standards/line-limit-exemptions.md` 的**非行数列** + 新建的探针脚本） | — | `git diff --stat` 逐字；🔴 **若 diff 里出现任何行数列的改动 ⇒ 越权**（§C14：行数归各文件的写者） |
| **V4** | **探针的自陈边界**：探针**不在**八闸内（报告逐字说明） | — | 手工核对 |
| **V6′** | 🔴 **§C14 的职责归位**：全批的 `line-limit-exemptions.md` 改动**逐行可归属**（`git log -p -- docs/standards/line-limit-exemptions.md` ⇒ 每个行数列的改动都在**它自己那个文件的写者的提交**里；本任务的提交**只含非行数列**） | **M6′**：把 `App.tsx` 行数的更新留给 T11 集中做 | **M6′ 后期望**：T1 的提交点上 `--full` 的 (e) 判据**红**（工作树 ≠ 登记值）⇒ 撞 husky ⇒ **这就是 §C14 要消除的形态** |
| **V5′** | 🔴 **§C11.8 的四件**：① 脚本**已入库**（`git ls-files scripts/check-exemption-prose.mjs` 有输出）② `--help` 与头注**两处都含「非门禁，手工跑」**③ 三条自动面核对**自己复跑过**（命令 + 输出进报告）④ **T21 已登记「批 8 候选闸」** | **M5′**：把探针塞进 `.husky/pre-commit` 或 `validate-all.mjs` 的 `steps`（= 静默扩闸） | **M5′ 后期望**：V5′ 的 ④/② 判据与 `git diff` 的「只含本任务路径」同时红（**"不得静默扩闸"的具名判据**） |

**提交信息**：`docs(standards): 同步豁免表的拆分记录与对拍探针`（**subject 22 字**）

**诚实边界**：① 🔴 **`:45` 的散文没有门禁兜底**（`--write` 与 `--full` 都不覆盖它）⇒ V2 的**对拍探针是本批新造的**，**它只能登记、拦不住提交**（**§C11.8 已裁：入库但不入八闸 —— 这是有意为之，不是缺陷**）；② **`:45` 的正确值在批 7 内变了两次**（T4→310 · T19→311）⇒ 本任务**只造探针**，两次改值各在自己的同批提交里（C10.6 逐字）；③ 本任务**不改**任何 `FROZEN_*`；④ 🔴 **探针的覆盖面是「`:45` 的条数」与「`App.tsx` 行的行数」两点**，**不是**全部散文位点（`### 表 2` 的第 1–5 项无机器兜底）⇒ 报告**不得**声称「散文漂移已被永久防住」（§C11.8 理由 ③ 逐字：C10.6 的目标是「更正**当前态**散文」，不是「永久防漂」）；⑤ 🔴 **自动捡拾面的核对结论会随 CI/husky 演进腐化** ⇒ 批 8 若改这三处配置，须重跑本任务的 Step 3′ 第 ③ 条；⑥ 🔴 **§C14 之后本任务不再是「行数的集中补写者」** ⇒ 「7a 段终态的行数一致性」由**各文件的写者在各自提交里**保证、由 **T12 只读复核**（本任务**不承担**中间态的钩子通过责任）。

---

### Task 12: 7a 段门禁自证（**7a 不得以「全批收口」结束**）

> **依据**：C7.1 逐字「**7a 不得在 7b 之前收口全批**；两段的**门禁读数各自完整**（八闸逐条）」+ C6.1（门禁必须串行）+ C6.2（期望终态 + 回升逐条解释）。

**目标**：在**无并发的独占窗口**串行跑完八闸，产出「**7a 段终态**」读数表；**明确声明这不是批 7 的交付**。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| 八闸 | 见 `## Global Constraints` 的门禁基线表 | 只许更好或持平 | **只读** | — |
| registry | 313（开工） | 🔴 **7a 期望 = 310 / 310 / 0** | **只读核对**（T4 已落地、T19 未做） | ⚠️ **是**（若 ≠ 310） |

**Files:** **0 生产代码**；产出 `tmp/t12/**` + `task-12-report.md`

- [ ] **Step 0: 确认独占窗口** —— `git status --porcelain` **必须只有 `?? docs/tech-debt/` 一条**；确认本批 `tmp/` 下无其他 unit 的在飞声明。

- [ ] **Step 1: 串行跑八闸（**逐条，不许并行**）**
  | # | 命令 | 7a 期望 |
  |---|---|---|
  | 1 | `node scripts/line-limits.mjs --full` | **exit 0 · `>600` 0 · 301–600 档 121 · 登记条目 121**（T6 拆件 −1；T7 若引入 >300 新文件则相应变） |
  | 2 | `node scripts/docs-check.mjs` | **exit 0**（T10 的 v0.22 加注会改变扫描/检查数 ⇒ 与基线对账） |
  | 3 | `node scripts/check-command-registry.mjs` | **exit 0 · `定义 310 / 注册 310 / 重复 0`** |
  | 4 | `cd app; npx tsc --noEmit` | **0 错** |
  | 5 | `cd app; npx vitest run --reporter=json --outputFile=…` | **0 失败**；`numTotalTests` ≈ **2132 − 7 = 2125**（T3 的净 −7）**± T7/T9 的新增**（每一条差额**必须逐条解释**；文件数读 `testResults.length`） |
  | 6 | `node scripts/check-bundle-budget.mjs --no-build` | **exit 0 · 首屏逐字不变（103.60 kB gzip）** + **新的懒侧读数**（T9 的门禁） |
  | 7 | `node scripts/bundle-eager-graph.mjs` | **exit 0 · 103 文件 / 7 包**（**Δ 必须为 0** —— 7a 不动首屏面） |
  | 8 | `cd app/src-tauri; cargo test --test app_lib_tests` | **exit 0** · `running 2335 tests` → **`2329 passed / 0 failed / 6 ignored`**（**本批有 Rust 改动 ⇒ 必跑**；T4 不动用例数 ⇒ Δ = 0） |
  | 附 | `cd app/src-tauri; cargo clippy --all-targets -- -D warnings` | error **0** · lib warnings **集合差异为空**（基线 15） |
  🔴 **串行**：**每一条跑完再起下一条**（C6.1）。🔴 **任何"并行跑出来的红"不得当缺陷登记**。

- [ ] **Step 2: 逐条解释回升**（C6.2）⇒ 任何回升**必须逐条解释**。

- [ ] **Step 3: 出报告 + 段终态声明**
  🔴 **必须逐字写**：「本节是 **7a 段终态**；**批 7 尚未交付** —— T13–T22（markdown 归一 / `[[ts:ms]]` / 标签线 / 档位通道 / 低置信 / 补 UI / 规格回写 / 全批收口）**未开始**。三条验收里**只有第三条已交付**（T3 的 `structuredBlocks` 裁决），前两条**未交付**。」

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | 八闸**逐条**有「命令 + exit + 逐字读数」三件套 | — | 手工核对（**无机器判据** ⇒ 诚实边界） |
| **V2** | **registry = 310/310/0**（7a 的期望中间值，C0.3） | **M2**：把 T19 提前到 7a 做（越段） | **M2 后期望**：registry = 311 ⇒ **与 7a 的期望值不符** ⇒ 说明段边界被破 ⇒ 报告红 |
| **V3** | **首屏 Δ = 0**（7a 不动首屏面） | **M3**：在 `App.tsx` 里静态 import 一个重模块 | **M3 后期望**：首屏 gzip 涨、eager 文件数涨 ⇒ 红 |
| **V4** | **cargo 读数 Δ = 0**（T4 只摘属性不删函数、不动用例） | **M4**：把一条既有 Rust 用例删掉 | **M4 后期望**：`running` 与 `passed` 都降 ⇒ 红 |
| **V5** | **段终态声明逐字含"批 7 尚未交付"** | — | 手工核对 |

**提交信息**：`docs(plan): 批 7 段 7a 门禁终态登记`（**subject 20 字**）—— ⚠️ **默认零提交**（产出在 gitignored 报告里）

**诚实边界**：① 本节**不是批 7 的验收**（C7.1 逐字）⇒ **不得**出现「批 7 已交付」「标签线已完成」类表述；② 八闸里的 `vitest` 与 `cargo` 的**开工基线是控制方串行实测的**（**§C6.2 已给**），7a 是本批**第一次**由实施者复跑 ⇒ 若出现红，**第一步是排除并发**（C6.1）；③ 「逐条解释回升」是**人工判据**，无机器兜底。

---

## 段 7b · 功能落地（T13–T22）

> 同样的任务卡结构。🔴 **markdown 链（T13 → T14 → T15 → T16 → T17）是严格串行链**（C9.3 + C10.1 的顺序不可倒）。

---

### Task 13: 拆 `NoteMarkdown.tsx`（C10.1 逐字「#2 并入前必须先拆」）

> **依据**：C10.1 逐字「🔴 **`NoteMarkdown.tsx` 余 5 行** ⇒ #2 并入前**必须先拆 `NoteMarkdown.tsx`**（先拆后改，§C5.2 同律）；并入的净增不许挤进那 5 行」。

**目标**：把 `NoteMarkdown.tsx`（**295**）里的**自定义 markdown 组件映射**（标题 / 段落 / 链接 / 图片 / 代码 / 表格 / 任务项）抽到 `components/noteMarkdownComponents.tsx`（**工厂函数**），给它腾出 ≥ **+25 行**头寸；**纯搬迁不改行为**。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `noteViews.test.tsx:281-286` 的 **react-markdown / remark 站点计数** | 站点 **2** 文件 · 插件站点 **8** | 🔴 **不许增**（C8 的锚） | 🔴 **新文件不得出现任何 `react-markdown.` / `remark-*` / `rehype-*` 说明符**（否则站点读数变 3 ⇒ `architecture.guard` 式的锚被污染） | ⚠️ **是**（若新文件带说明符） |
| `NoteMarkdown.tsx` 的 `import` 行数 | 现状 10 条 | — | 🔴 **不得新增任何 `react-markdown` 说明符的 import 行**（仪器纪律 13：站点判据**按行**匹配模块说明符） | ⚠️ **是** |
| `FROZEN_MUTED_GRAY_BY_FILE` / `FONT_OOB_BY_FILE` 的 `NoteMarkdown.tsx` 键 | 实测：**灰无键** · 字号无键（`frozen.mjs` 只列了边框 1 / 圆角 2） | 只许降或持平 | 搬迁若把这 3 个字面量带进新家 ⇒ **逐键迁移**（源减、新加、总量不变） | ⚠️ **是**（若不同步） |
| `FROZEN_BORDER_BY_FILE["components/NoteMarkdown.tsx"]` | **1** | 1 | 同上 | ⚠️ **是**（若不同步） |
| `FROZEN_RADIUS_OUTLIER_BY_FILE["…NoteMarkdown.tsx"]` | **2** | 2 | 同上 | ⚠️ **是**（若不同步） |
| `SPLIT_MOVES` | **1 条** | 只增（按守恒） | 若不涉原生 `<button>` ⇒ 零新增（本任务的映射里**无 `<button>`**） | **否** |

**Files:**
- 改 **`app/src/components/NoteMarkdown.tsx`（295 → 目标 ≤250）** 🔴 贴边（余 5）
- 新建 `app/src/components/noteMarkdownComponents.tsx`（预算 **≤170 行**）
- **`NON_MIGRATED_14`**：两个文件都不在其中

**Interfaces:**
- Produces：
  ```ts
  /** 自定义 markdown 组件映射的**工厂**（吃渲染上下文，返回 components 对象） */
  export function noteMarkdownComponents(ctx: {
    readonly note: Note;
    readonly searchQuery: string;
    readonly onTaskToggle: (newContent: string) => void;
    readonly onOpenSession?: (sessionId: number) => void;
    readonly onOpenSessionAt?: (sessionId: number, ms: number) => void;
    readonly onImageOpen: (src: string, title?: string) => void;
  }): Components;
  ```
  🔴 **`Components` 类型不许从 `react-markdown` import**（会增站点）⇒ 用 `Parameters<typeof ReactMarkdown>[0]["components"]`（**先例**：`NoteMarkdown.tsx:30-39` 的 `RemarkPlugin` 用的就是这个手法，且**逐字自陈了为什么不写 import type**）。

- [ ] **Step 0: 取「结构逐字对照」的基线**（同 T6 的范式）：把 `NoteMarkdown` 的渲染树结构导出到 `tmp/t13/structure-before.json`。

- [ ] **Step 1: 抽组件映射（纯搬迁）**
  把 `NoteMarkdown.tsx` 里 `components={{ … }}` 的**全部内容**逐字搬到 `noteMarkdownComponents.tsx` 的工厂里；`NoteMarkdown` 改为 `components={noteMarkdownComponents({ note, searchQuery, onTaskToggle, onOpenSession, onOpenSessionAt, onImageOpen })}`。
  ⚠️ 🔴 **工厂必须在每次渲染时重建或按依赖 memo**：若原实现是**内联对象**（每次渲染新建），保持**同一语义**（不改 memo 行为）；若是 `useMemo`，把依赖数组一并搬。
  🔴 **`remarkPluginsExtra` 的语义一字不改**（C8 的槽，`NoteMarkdown.tsx:54-63` 逐字说明「只许追加、不许替换」）。

- [ ] **Step 2: 量行数并提交**
  ```powershell
  node .superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/plan-writer/lines.mjs app/src/components/NoteMarkdown.tsx app/src/components/noteMarkdownComponents.tsx
  cd app; npx vitest run src/components/NoteMarkdown.test.tsx src/views/note/noteViews.test.tsx --reporter=json --outputFile=../tmp/t13/nm.json
  ```
  期望：`NoteMarkdown.tsx` **≤250**（留 ≥ **+45** 头寸）；`NoteMarkdown.test.tsx` 的 **6 条原样绿**；`noteViews.test.tsx` 的站点断言**仍绿**（搬件不改站点）。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **`noteViews.test.tsx` 的站点断言逐字仍绿**（站点 = 2 文件：`ChatMessageMarkdown` + `NoteMarkdown`；插件站点 = **8**） | **M1**：在 `noteMarkdownComponents.tsx` 里加 `import remarkGfm from "remark-gfm";` | **M1 后期望**：插件站点 **8 → 9** ⇒ `:285` 红（**这就是"新文件不得带说明符"的具名断言**） |
| **V2** | **`NoteMarkdown.test.tsx` 的 6 条核心断言原样绿** | **M2**：把任务项的 `onTaskToggle` 改成直传（去掉按出现顺序计数） | **M2 后期望**：H1 的「勾选第 n 个只改第 n 行」用例红 |
| **V3** | **结构等价**：`structure-after.json == structure-before.json` | **M3**：把某标题的 `data-*` 或类名改掉 | **M3 后期望**：JSON 差异非空 ⇒ 红 |
| **V4** | **行数**：`NoteMarkdown.tsx` **≤250 且 ≤295**（**净减**）；新文件 ≤300 | — | `lines.mjs` 读数 |
| **V5** | **冻结键守恒**（C9.19 第 2 条）：`frozen.mjs` 的边框/圆角 Σ 与拆前逐字相同；报告给逐键 diff | **M5**：搬迁后主件边框键删掉而新家不加 | **M5 后期望**：Σ 变小 ⇒ `surfaceRatchet.test.ts` 红 |

**提交信息**：`refactor(notes): 拆出 markdown 自定义组件映射`（**subject 26 字**）

**诚实边界**：① 本任务**不改任何行为** ⇒ 「拆件零行为变化」由 V2 + V3 保证；② `NoteMarkdown` **没有 4 条以上针对组件映射的独立用例**（`NoteMarkdown.test.tsx` 的 6 条是**集成级**）⇒ 「映射内部每一个自定义 renderer 都被覆盖」**不成立**，报告须如实说明；③ 本任务**不碰** `remarkPluginsExtra` 的语义（那归 T14）。

---

### Task 14: #2 并入 #1 + 删 `ChatMessageMarkdown`（C10.1）

> **依据**：C10.1 逐字「#2 `ChatMessageMarkdown`（52 行）并入 #1 `NoteMarkdown` 后**删除**」；`noteViews.test.tsx:281-286` 的三条站点断言是**预授权的既有断言改写**（每条须给逐字 before/after + 论证必需性；**必须改成等强或更强**）。

**目标**：把 `ChatMessageMarkdown`（**52**，3 个消费点）并入 `NoteMarkdown` ⇒ **站点 2 → 1**、**插件站点 8 → 4**；删文件；**`NoteMarkdown` 的 DOM 形态一个字不改**。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `noteViews.test.tsx:281-282` 的站点表 | `["components/ChatMessageMarkdown.tsx", "components/NoteMarkdown.tsx"]` | 🔴 **不许增**；**本任务合法减到 1** | 改成 `["components/NoteMarkdown.tsx"]`（**Y4**） | ⚠️ **是**（不改则红） |
| `noteViews.test.tsx:285` 的插件站点数 | **8** | 同上 | 改成 **4**（**Y5**）+ 逐条列出剩下的 4 条 | ⚠️ **是** |
| `noteViews.test.tsx:286` 的站点文件集合 | 2 个文件 | 同上 | 改成 1 个（**Y6**） | ⚠️ **是** |
| `NoteMarkdown.test.tsx` 的 6 条核心断言 | 绿（**「缺省时与今天逐字相同」**） | 🔴 **本任务设计为不改** | 🔴 **并入必须保持 `NoteMarkdown` 的既有默认行为逐字不变** ⇒ `#2` 的差异走**新增可选 props**（`previewMaxChars?` / `codeRenderer?`）；**若发现必须改这 6 条 ⇒ STOP**（**Y7**） | ⚠️ **是**（若改了默认行为） |
| `NoteMarkdown.tsx` 行数 | T13 后 ≤250 | ≤300（余 ≥50） | 并入的净增（约 +20~25 行）**必须落在那 50 行头寸里** | ⚠️ **是**（若 >300） |
| `FROZEN_*_BY_FILE` 的 `ChatMessageMarkdown.tsx` 键 | 实测：`frozen.mjs` **未列该文件**（无键） | — | 删文件 ⇒ 无影响 | **否** |
| `FROZEN_NATIVE_BUTTON_TOTAL` | 393 | 只许降或持平 | 删文件若带走 `<button>` ⇒ **总降**（允许） | **否** |

**Files:**
- **删** `app/src/components/ChatMessageMarkdown.tsx`（**52**）
- 改 `app/src/components/ChatMessageList.tsx`（`:117` / `:146`）· `app/src/components/TaskConversationView.tsx`（`:189`）
- 改 **`app/src/components/NoteMarkdown.tsx`**（T13 拆后 ≤250）
- 改 **`app/src/views/note/noteViews.test.tsx`（295）** —— `:281-282` / `:285` / `:286`（**Y4/Y5/Y6**）
- 改 `app/src/components/chatHelpers.test.ts`（若它 import `truncatePreview`）
- **`NON_MIGRATED_14`**：`components/chat/ChatLaunchMenu.tsx` 在 14 内 ⇒ 🔴 **本任务不碰它**（`ChatMessageMarkdown` 不在 14 内）

**Interfaces:**
- Produces：`NoteMarkdown` 的**两个新增可选 props**（供聊天侧复用）：
  ```ts
  /** 预览截断字数（缺省 = 不截断 ⇒ 与今天逐字相同） */
  readonly previewMaxChars?: number;
  /** 代码块渲染器覆盖（缺省 = 既有实现 ⇒ 与今天逐字相同） */
  readonly codeRenderer?: (props: { className?: string; children?: ReactNode }) => ReactElement;
  ```

- [ ] **Step 1: 读 `ChatMessageMarkdown.tsx` 的**全部**差异点（逐条列名）**
  已知：`PREVIEW_MAX_CHARS`（`:20`）· `truncatePreview`（`:22`）· 自定义 `code` 组件 · 4 条 `remark-*`/`rehype-*`（与 `NoteMarkdown` 的**4 条完全同集合**？**必须逐条核对**）。
  🔴 **逐条给出「#1 已有 / #1 没有 ⇒ 必须新增可选 prop」的判定**，并把该表写进报告。

- [ ] **Step 2: 给 `NoteMarkdown` 加可选 props（**缺省 = 与今天逐字相同**）**

- [ ] **Step 3: 改 3 个消费点**
  `ChatMessageList.tsx:117` / `:146` · `TaskConversationView.tsx:189` ⇒ 改成 `<NoteMarkdown … previewMaxChars={PREVIEW_MAX_CHARS} … />`。
  🔴 **`PREVIEW_MAX_CHARS` / `truncatePreview` 的搬迁**：`truncatePreview` 已被 `chatHelpers.test.ts` 覆盖 ⇒ 把它搬到 `NoteMarkdown` 的模块或新家 `utils/chatPreview.ts` **由实施者按最小改动定**，但**必须保持 `chatHelpers.test.ts` 全绿**（若它从 `ChatMessageMarkdown` import，则改 import 源属**搬迁的必需后果**，须逐条 before/after）。

- [ ] **Step 4: 删 `ChatMessageMarkdown.tsx` + 机械改写三条站点断言（Y4/Y5/Y6）**

- [ ] **Step 5: 跑门禁并提交**
  ```powershell
  cd app; npx tsc --noEmit
  cd app; npx vitest run src/views/note/noteViews.test.tsx src/components/NoteMarkdown.test.tsx src/components/chatHelpers.test.ts --reporter=json --outputFile=../tmp/t14/nm.json
  cd ..; node scripts/line-limits.mjs --full
  ```

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **站点数如实减到 1 / 4**（`noteViews.test.tsx` 三条断言全绿） | **M1**：把 `:285` 改成 `toBe(9)`（写一个**假的**数） | **M1 后期望**：红（**证明判据真的在数**） |
| **V2** | **`ChatMessageMarkdown` 零残留**：`tsc` **0 错**；探针扫全 `app/src` ⇒ `ChatMessageMarkdown` **命中 0**（**正控**：在 `HEAD` 树上 ⇒ **≥5 命中**） | **M2**：把 3 个消费点之一改回旧 import | **M2 后期望**：`tsc` 报 `TS2307` |
| **V3** | **`NoteMarkdown` 的默认行为逐字不变**：`NoteMarkdown.test.tsx` 的 **6 条原样绿**（**不改任何一条**） | **M3**：把 `previewMaxChars` 的缺省从「不截断」改成 200 | **M3 后期望**：`NoteMarkdown.test.tsx` 的既有断言红（**这是「缺省 = 与今天逐字相同」的具名断言**） |
| **V4** | **聊天侧的截断行为不变**：`ChatMessageList` / `TaskConversationView` 的既有测试全绿 | **M4**：把 `previewMaxChars` 传成 `undefined`（丢截断） | **M4 后期望**：聊天侧渲染的既有断言红（若它覆盖截断行为） |
| **V5** | **行数**：`NoteMarkdown.tsx` **≤300**；`noteViews.test.tsx` **≤300**（净增 ≤ +5） | — | `lines.mjs` 读数 |
| **V6** | **用例数不减**：全量 `numTotalTests` ≥ **2125**（T3 之后的值）；`numFailedTests = 0` | **M6**：删掉 `ChatMessageMarkdown` 的既有用例而不搬迁 | **M6 后期望**：用例数**下降** ⇒ 与「LOST = 0」纪律冲突 ⇒ 报告须逐条解释 |

**提交信息**：`refactor(chat): 聊天 markdown 并入 NoteMarkdown 并删旧件`（**subject 30 字**）

**诚实边界**：① **`ChatMessageMarkdown` 无同名测试**（`### 表 4` 的 `sites.mjs` 实测：TEST 命中 **0**）⇒ 它的**截断预览与自定义 code 渲染**的回归网只有 `chatHelpers.test.ts`（`truncatePreview`）+ 消费点的集成测试 ⇒ **报告须如实说明"哪部分差异没有独立判据"**；② 「#2 并入 #1」的**语义等价**由 V3 + V4 保证，但 **`#2` 的 4 条插件与 `#1` 的 4 条是否逐字同集合**必须**逐条核对**（若不同集合 ⇒ 并入会改变语义 ⇒ **STOP**）；③ 本任务**不改** `remarkPluginsExtra` 的语义。

---

### Task 15: 新建 `utils/markdownLine.ts` —— 两支手写链合成一支 + 芯片可点（C10.1 + C10.2 的一次性修复）

> **依据**：C10.1 逐字「新建 **`utils/markdownLine.ts`**，把 #3 与 #4 **合成一支**行级 HTML 串渲染器」+ C10.2 逐字「把 ms 捕获 + 可点击落在**唯一一处**（`renderTimestampAnchors` 或其替代者），使 **#3 与 #4 同时修好**；容器侧用**事件委托**（`closest('[data-ts-ms]')`）」。

**目标**：① 新建 `utils/markdownLine.ts`（**≤240 行**）作为**行级 HTML 串渲染器的唯一实现**；② `utils/refineDiff.ts` 的 `mdLineHtml` **改为从新模块导入**（或迁出后保留薄转发）；③ `utils/html.ts` 的 `renderTimestampAnchors` **补 ms 捕获 + `data-ts-ms`**（**一处修复，两条链同时受益**）。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `utils/html.test.ts:56-103` 的 **5 条** `renderTimestampAnchors` | 见 **Y8** | 🔴 **改成等强或更强，不许放宽** | 芯片形态加 `data-ts-ms` ⇒ `:80`/`:101` 两条 `toBe` 需改（**Y8**）；`:63/:64/:73/:74/:75/:90-93` 的 `toContain` 系**对新增属性天然免疫** ⇒ **保留**；**新增 1 条更强的**「芯片带 `data-ts-ms` 且值 = ms」 | ⚠️ **是**（若不改 `:80`/`:101`） |
| `FROZEN_MUTED_GRAY_BY_FILE` / `FONT_OOB_BY_FILE` 的 `utils/refineDiff.ts` 键 | 实测：**无键**（`frozen.mjs` 未列）；`html.ts` 也**无键** | — | 🔴 新文件 `markdownLine.ts` **不得引入新键**：它的**样式常量逐字沿用**两支链的原值（`font-size:15px/14px/13px/12px` 等）—— 🔴 **注意**：`fontSize` 的**越界档是 `9/9.5/10/10.5/11/11.5`**（`textRatchet` 的口径）⇒ **12px 及以上不入棘轮**，故**沿用原值 = 零新增** | **否**（若沿用原值） |
| `FROZEN_BORDER_BY_FILE` / `RADIUS` / `SHADOW` | `refineDiff.ts` / `html.ts` / `NotePreviewView.tsx` **都有键**（实测：`NotePreviewView` 边框 4 / 圆角 5） | 只许降或持平 | 🔴 **新文件不得新增面字面量**；迁移后 `NotePreviewView.tsx` 的键**随代码减少** ⇒ **必须同步收紧**（C5.1）+ **逐键 diff** | ⚠️ **是**（若不同步） |
| `FROZEN_NATIVE_BUTTON_BY_FILE` | `utils/**` **无键** | 无（出现 `<button>` 即红） | 新文件**零 `<button>`** | **否** |
| `zIndex` | — | 冻结名单 3 条 | 新文件**零裸数字 `z-index`** | **否** |

**Files:**
- 新建 `app/src/utils/markdownLine.ts`（预算 **≤240 行**）
- 改 `app/src/utils/html.ts`（**40**）—— `renderTimestampAnchors` 补 ms 捕获 + `data-ts-ms`
- 改 `app/src/utils/html.test.ts`（**103**）—— **Y8**
- 改 `app/src/utils/refineDiff.ts`（**107**）—— `mdLineHtml` 改为从新模块导入（或迁出 + 薄转发）
- **`NON_MIGRATED_14`**：三个文件都不在其中

**Interfaces:**
- Produces：
  ```ts
  /** 行级 HTML 串渲染的**两种模式**（各自逐字保留原样式 ⇒ 零观感变化） */
  export interface LineRenderMode {
    /** 标题/段落的字号与边距族（`PREVIEW` = NotePreviewView 原值；`COMPACT` = refineDiff 原值） */
    readonly scale: { h2: string; h3: string; h4?: string; p: string; li: string; quote: string };
    /** 附加在同一元素上的额外 style（refineDiff 的 diff 染色用） */
    readonly extra?: string;
  }
  export const PREVIEW_MODE: LineRenderMode;
  export const COMPACT_MODE: LineRenderMode;
  /** 单行 markdown → HTML 串（**唯一实现**：escapeHtml → renderTimestampAnchors → 行级规则） */
  export function mdLineHtml(line: string, mode: LineRenderMode): string;
  ```
  🔴 **`PREVIEW_MODE` / `COMPACT_MODE` 的每个值必须逐字取自原实现**（见 `### 表 6` 的 **X6**：两支链的样式**不同**）⇒ **两条链的可见输出零变化**。
  🔴 **本形态已裁（§C11.1，2026-09-13）：批准「两模式」** —— 理由逐字：①「合成一支」的实质是**逻辑单一实现**，**不是观感统一**；② 观感变化属**像素面**，C6.4 已裁「归批 8」⇒ 本批引入**不可验证**的观感变化 = 制造不可测回归；③ 批 6 纪律「不可测的东西不许声称已达成」。**三条硬条件（§C11.1 逐字，缺一不可）**：
  1. **模式常量具名导出**（`export const PREVIEW_MODE` / `export const COMPACT_MODE`，**不许**内联字面量、**不许**只导出 `mdLineHtml`）；
  2. **表征测试对同一语料断言两模式的输出与迁移前逐字节相同**（→ 本卡的 **V3 / V4** 必须覆盖**同一份语料**的两模式，且对拍源是 `git show HEAD:` 的原实现字符串）；
  3. 🔴 **报告与规格回写里逐字写「归一 = 逻辑归一；观感统一未做，归批 8」**（→ **T21** 的 §12 加注必须含这一句）。

- [ ] **Step 1: 🔴 先修 `renderTimestampAnchors`（C10.2 的唯一落点）**
  现状（**`utils/html.ts:32-40`** 的实际实现；🔴 **E1 实测函数从 `:32` 起**（`export function renderTimestampAnchors`），`chip` 闭包在 `:33-34`，两条 `.replace` 在 `:37`/`:39` —— 原写「`:14` 起的函数」**是错的**，见 `### 表 6b` 的 **E-7**）：
  ```ts
  const chip = (_m, mm, ss) =>
    `<span style="…" title="⏱ ${mm}:${ss} 跳转到会话对应片段">⏱ ${mm}:${ss}</span>`;
  return escaped
    .replace(/\[\[⏱ (\d+):(\d{2})\]\(\[\[ts:\d+\]\]\)\]/g, chip)   // 章节形态
    .replace(/\[⏱ (\d+):(\d{2})\]\(\[\[ts:\d+\]\]\)/g, chip);        // 段落形态
  ```
  ⇒ **改法（C10.2）**：
  ```ts
  /** 时间码芯片（**唯一实现**：NotePreviewView 与 refineDiff 两条手写链共用）。
   *  @ai-context 批 7 T15（C10.2）：① 正则的**捕获组补上 ms**（原实现把它丢了 ⇒ 芯片没有跳转目标）；
   *    ② 芯片带 `data-ts-ms`（容器侧用事件委托 `closest('[data-ts-ms]')` ⇒ **不需要 React 上下文**，
   *    串渲染不变）；③ 保留既有 `title` 与视觉（逐字不改）。
   *  边界：定位精度受音频对齐的块粒度 **±200 ms** 限制（不得声称毫秒级定位）。 */
  const chip = (_m, mm, ss, ms) =>
    `<span data-ts-ms="${ms}" data-ts-chip style="…既有一字不改…" title="⏱ ${mm}:${ss} 跳转到会话对应片段">⏱ ${mm}:${ss}</span>`;
  return escaped
    .replace(/\[\[⏱ (\d+):(\d{2})\]\(\[\[ts:(\d+)\]\]\)\]/g, chip)   // 章节形态
    .replace(/\[⏱ (\d+):(\d{2})\]\(\[\[ts:(\d+)\]\]\)/g, chip);        // 段落形态
  ```
  🔴 **不得改**视觉样式与 `title` 文案（`### 表 6` X6 之外的零变化要求）；🔴 **`data-ts-ms` 的值 = 毫秒整数**（与 `NoteMarkdown` 的 `onOpenSessionAt(sessionId, ms)` 同口径）。
  🔴 **`utils/html.ts` 会多 ~4 行**（**`.ts` 在门禁视野内**）⇒ 40 → ~44，**余量充足**。

- [ ] **Step 2: 建 `markdownLine.ts`（两支链合成一支 + 两模式）**
  把 **`NotePreviewView.tsx:64-72`**（h2 `:64` / h3 `:65` / quote `:68` / li `:70` / p `:72`；🔴 原写 `:37-44` —— `### 表 6b` 的 **E-13**）与 **`refineDiff.ts:81-86`**（h2 `:81` / h3 `:82` / h4 `:83` / li `:84` / p `:86`；原写 `:61-66` —— **E-14**）的**行级规则**合成**一条按 `mode.scale` 取值的实现**；`refineDiff` 的 `extra` 通过 `mode.extra` 传入。
  🔴 **逐行对照表**（**必须进报告**）：原两支链的每一条分支 ↔ 新实现的对应分支，并标注**样式值是否逐字相同**。

- [ ] **Step 3: 改 `refineDiff.ts` 的调用点**
  `renderSideHtml` / `renderDiffColumnHtml` 里的 `mdLineHtml(...)` 改为新模块的实现（**可以**在 `refineDiff.ts` 保留 `mdLineHtml` 的薄转发以保住既有 import 面 —— **优先保 import 面**，因为 `utils/refineDiff.test.ts`（**177**）覆盖它）。
  🔴 **`refineDiff.test.ts` 必须全绿**（它是 #3 的唯一回归网）。

- [ ] **Step 4: 跑门禁并提交**
  ```powershell
  cd app; npx tsc --noEmit
  cd app; npx vitest run src/utils/html.test.ts src/utils/refineDiff.test.ts --reporter=json --outputFile=../tmp/t15/u.json
  cd ..; node scripts/line-limits.mjs --full
  ```

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **芯片带 ms（C10.2 的核心判据）**：新用例 `expect(renderTimestampAnchors(escapeHtml("[⏱ 00:05]([[ts:5000]]) 内容"))).toContain('data-ts-ms="5000"')` | **M1**：把捕获组的 ms 改回不捕获（还原旧正则） | **M1 后期望**：该用例红（`data-ts-ms` 缺失或为空） |
| **V2** | **`html.test.ts` 的既有 5 条改成等强或更强**（**Y8**）：`:63/:64/:73/:74/:75/:90-93` **保留**；`:80`/`:101` 改成「无锚点文本不产生任何 `data-ts-ms`」+ 保留 `toBe(input)` | **M2**：让 `:101` 的「仿锚点形态」也命中芯片 | **M2 后期望**：`:101` 红（**这是"冒号注入不误判"的具名断言**） |
| **V3** | **`refineDiff.test.ts` 全绿**（#3 的唯一回归网）+ **`refineDiff` 的可见输出零变化**（`mdLineHtml` 的逐字产物对拍：把旧实现的输出与新实现的输出逐字节比较 4 类行） | **M3**：把 `COMPACT_MODE` 的 `h2` 从 `font-size:14px` 改成 `15px`（= 变成 PREVIEW 的值） | **M3 后期望**：逐字节对拍报差异 ⇒ 红（**这是"两支链样式各自保留"的具名断言**） |
| **V4** | **`PREVIEW_MODE` 的每个值与 `NotePreviewView` 原实现逐字相同**（探针：从 `git show HEAD:…NotePreviewView.tsx` 抽原样式串，与 `PREVIEW_MODE` 比对） | **M4**：把 `PREVIEW_MODE` 的 `p` 从 `font-size:13px` 改成 `12px` | **M4 后期望**：探针报差异 ⇒ 红 |
| **V5** | **新文件棘轮干净**：`frozen.mjs` 里 `utils/markdownLine.ts` **无任何键**（没有新字面量） | **M5**：在新文件里写一个 `border: "1px solid #e5e7eb"` | **M5 后期望**：`surfaceRatchet.test.ts` 报「未登记文件命中」⇒ 红 |
| **V6** | `line-limits --full` **exit 0**；`markdownLine.ts` ≤300 | — | 逐字读数 |
| **V7** | 🔴 **§C11.1 的三条硬条件**：① 两模式常量**具名导出**（探针读 `markdownLine.ts` 的导出名单 ⇒ 含 `PREVIEW_MODE` / `COMPACT_MODE`）② **同一语料**上两模式输出与**迁移前逐字节相同**（V3/V4 的探针**用同一份 fixture**跑两遍）③ 报告与规格回写含逐字句「**归一 = 逻辑归一；观感统一未做，归批 8**」 | **M7**：把 `COMPACT_MODE` 从导出名单里删掉（改成模块内私有常量） | **M7 后期望**：① 的导出名单探针报缺 `COMPACT_MODE` ⇒ 红 |

**提交信息**：`feat(utils): 新增行级 markdown 串渲染器并补时间码芯片毫秒`（**subject 32 字**）

**诚实边界**：① 🔴 **已裁（§C11.1）：批准「两模式」** —— `#3`/`#4` 的样式差异**本批不统一**；**归一 = 逻辑归一；观感统一未做，归批 8**（这一句**必须逐字进报告与规格回写**，见 T21 的 §12 加注）；② **`[[ts:ms]]` 的"可点"在本任务结束时仍是假的** —— 芯片只多了 `data-ts-ms`，**点击处理在容器侧**（`NotePreviewView` / `RefineWorkbench` / 未来的 `markdownLine` 消费点）⇒ **归 T17**；③ 「两条链的产物逐字相同」由 V3/V4 的探针保证，**但探针只覆盖 4 类行**（h2/h3/h4/li/p 的样本各 1），**不覆盖全部分支**（如 `extra` 的组合）⇒ 报告须逐条列出**未覆盖的分支**；④ `utils/html.ts` 的改动会**同时影响** `NotePreviewView` 与 `refineDiff` 两条链 ⇒ **任何意外差异都会同时出现在两处**，这是 C10.2 的有意设计（一处修复、两处受益）。

---

### Task 16: `NotePreviewView.renderMarkdown` 表征测试（C9.3 + C10.1 的顺序不可倒）

> **依据**：C9.3 逐字「**先补测试面再改**：它是 `1.2 / 1.3 / 1.8 / 1.9` 四项的枢纽且**无回归网**，直接改 = 裸奔」+ C10.1 逐字「**先**为 `NotePreviewView.renderMarkdown`（346 行、**无同名测试文件**）补一份**表征测试（表征现行行为）**作为回归网，**再**替换」。
> 🔴 **注意**：C10.1 把 C9.15 的"替换"改成了"**迁入新模块**"（不换 react-markdown），但**顺序不变**：**先补测试，后迁移**。

**目标**：为 **`NotePreviewView.tsx:40 renderMarkdown(md, imageBaseUrl, dataDir)`**（🔴 E1 实测：定义在 **`:40`**；原写 `:23` —— `### 表 6b` 的 **E-11**）补一份**表征现行行为**的测试（**纯函数级**，不渲染组件），把它的**现行输出逐字钉住**。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| 全部六棘轮 | — | — | 🔴 **新测试文件是 `*.test.ts`** ⇒ **在棘轮域外**（域 = `app/src/**` 的 `.ts/.tsx` **减 `*.test.ts(x)`**） | **否** |
| `NotePreviewView.tsx` | **346** | 已登记 | 🔴 **本任务零改动**（只新增测试文件） | **否** |
| 用例数 | ≥2125（T14 后） | **只增不减** | 本任务**只增**（约 +25~35 条） | **否**（增） |

**Files:**
- 新建 `app/src/components/NotePreviewView.render.test.ts`（预算 **≤240 行**）—— **纯函数级**：`renderMarkdown` 是**非导出**函数 ⇒ 🔴 **必须先解决可达性**（见 Step 1）
- **`NON_MIGRATED_14`**：不适用

**Interfaces:**
- Consumes：`renderMarkdown`（**非导出**）· `escapeHtml` / `renderTimestampAnchors`（`utils/html.ts`）
- Produces：一份**可复算的现行行为快照**

- [ ] **Step 1: 🔴 先解决可达性（三种形态，**优先选不改生产的**）**
  | 形态 | 做法 | 代价 | 本计划建议 |
  |---|---|---|---|
  | **(a) 导出它** | 把 `function renderMarkdown` 改成 `export function renderMarkdown` | 生产文件的**导出面**扩大（无害但改变了模块契约） | ⚠️ 备选 |
  | **(b) 通过组件渲染 + `dangerouslySetInnerHTML` 的产物断言** | 渲染 `<NotePreviewView sessionId=… />` 并读容器 `innerHTML` | 需要 **Tauri mock**（`NotePreviewView` 自带取数）+ jsdom | ⚠️ 重 |
  | **(c) 用 `vi.mock` + 模块内探针** | **不可行**（函数非导出，`vi.mock` 拦不到） | — | ❌ |
  ⇒ 🔴 **本计划选 (a)**：`export function renderMarkdown`（**+0 行**，只改一个词），并在报告里逐字论证「导出是为可测性，不改变运行时行为」。**T17 迁移时**该导出随迁（或改由 `markdownLine.ts` 的 `PREVIEW_MODE` 覆盖）。

- [ ] **Step 2: 写表征测试（**表征现行行为，不表征"应该的行为"**）**
  覆盖（**逐类给样本**）：
  1. **标题**：`# ` / `## ` 两种（**`:64`**（h2，`font-size:15px`）/ **`:65`**（h3）；🔴 原写 `:37`/`:38` —— `### 表 6b` 的 **E-13**）
  2. **引用/提示行**（**`:68`** 的 `#fffbeb` 提示块；原写 `:40` —— **E-13**）
  3. **列表**：`- `（**`:70`**；原写 `:42` —— **E-13**）
  4. **普通段落**（**`:72`**；原写 `:44` —— **E-13**）
  5. **图片**：`![alt](src)` 本地路径 ⇒ **`convertFileSrc` 的行为**（**`:56`/`:57` 的取源 + `:61` 的 `<img>` 拼装**；原写 `:35` 一带 —— **E-13**）—— ⚠️ **它是 Tauri API** ⇒ **必须 `vi.mock("@tauri-apps/api/core")`**，且断言"mock 被调用 + 产物串"
  6. **时间码芯片**：经 `renderTimestampAnchors` ⇒ **与 T15 的新形态对拍**（`data-ts-ms` 存在）
  7. **转义**：`<script>` / `&` / 引号 ⇒ **注入面为零**
  8. **空输入 / 只有空行 / 只有空白**
  🔴 **每一条断言必须是「现行输出」的逐字值**（先跑一次拿到真值，再写进断言）—— **不得**凭"应该是什么"写。

- [ ] **Step 3: 跑测试并提交**
  ```powershell
  cd app; npx vitest run src/components/NotePreviewView.render.test.ts --reporter=json --outputFile=../tmp/t16/np.json
  cd ..; node scripts/line-limits.mjs --full
  ```
  ⚠️ **本任务必须排 T15 之后**（否则第 6 类样本的芯片形态会与 T15 的改动冲突）—— 由 `format 7b` 的串行链保证。

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **表征测试全绿**（约 +25~35 条） | **M1**：把 **`:64`** 的 `font-size:15px` 改成 `14px`（🔴 E1 实测注入点 = `:64`；原写 `:37` —— `### 表 6b` 的 **E-21**） | **M1 后期望**：标题类样本红（**证明快照真的钉住了现行输出**） |
| **V2** | **注入面为零**：`<script>` / `onerror` 载荷经渲染后**不含可解析标签** | **M2**：把 `escapeHtml` 从某条分支去掉 | **M2 后期望**：注入类样本红 |
| **V3** | **`convertFileSrc` 的调用被断言**（mock 被调用恰 1 次 / 每图一次） | **M3**：把本地路径分支改成直接拼 `src` | **M3 后期望**：mock 调用数变 0 ⇒ 红 |
| **V4** | **反空真**：测试文件里 `expect(` 计数 **≥ 30** 且**每条样本至少 1 个 `toContain`/`toBe` 级的断言** | **M4**：把某类的断言改成 `expect(true).toBe(true)` | **M4 后期望**：V4 的探针（数断言的探针）报「某类无实质断言」⇒ 红 |
| **V5** | `line-limits --full` **exit 0**；测试文件 ≤300（`.test.ts` **在棘轮域外但仍受 300 行软限**） | — | 逐字读数 |

**提交信息**：`test(notes): 补 NotePreviewView 行渲染的表征测试`（**subject 27 字**）

**诚实边界**：① 🔴 **表征测试只钉住"今天的行为"，不判断它是否正确** —— 若现行行为有 bug，测试**会把 bug 一起钉住** ⇒ 报告须逐字声明这一点；② 选 (a) 形态**扩大了模块的导出面**（`export function renderMarkdown`）⇒ 报告须逐字论证「这是为可测性的最小改动，`+0` 行」；③ **`NotePreviewView` 的组件级行为（取数 / 状态 / 渲染树）仍无测试** ⇒ 本任务**只覆盖行渲染器**，**不得**声称「NotePreviewView 已有测试覆盖」；④ 快照式断言**会随 T17 的迁移而失效** ⇒ T17 必须**同批**把这份测试的**落点**（从 `NotePreviewView` 到 `markdownLine`）改过来，**且断言值保持不变**（这正是"回归网"的用法）。

---

### Task 17: #4 迁入 `markdownLine` + `[[ts:ms]]` 三缺二补完 + 自动切三轨 + 容器侧事件委托 ×3

> **依据**：C10.1（#4 **迁入新模块**，**不换成 react-markdown**）+ C10.2（容器侧事件委托 `closest('[data-ts-ms]')`，**使 #3 与 #4 同时可点**；`NotesPage.test.tsx:165` 的选择器改写已授权 = **Y9**）+ C10.3（**自动切三轨视图 = 做**，**只许走既有机制**；`NoteCardFlowView` 第三缺口 ⇒ **能则做**）。

**目标**：四条一次做完：① `NotePreviewView` 的行渲染改用 `markdownLine`；② 容器侧**事件委托**（`NotePreviewView` / `RefineWorkbench` / 卡片流）；③ `App.goSessions` 接 ms 到 `SessionDetailPanel` 并在到达时**自动切 `tritrack`**；④ `NoteCardFlowView` 的第三缺口（**包装件形态**，见 `### 表 6` X7）。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `FROZEN_BORDER_BY_FILE["components/NotePreviewView.tsx"]` | **4** | **4** | 迁出 2 处 `dangerouslySetInnerHTML` 的容器渲染 ⇒ **边框/圆角字面量随代码减少** ⇒ **必须同步收紧**（C5.1）+ 逐键 diff | ⚠️ **是**（若不同步） |
| `FROZEN_RADIUS_OUTLIER_BY_FILE["…NotePreviewView.tsx"]` | **5** | **5** | 同上 | ⚠️ **是** |
| `FROZEN_BORDER_BY_FILE["components/RefineWorkbench.tsx"]` | **1** | **1** | 加事件委托**不新增边框**；迁移 `:442` 已在 T7 做 | ⚠️ 若 T7 已收紧则**保持** |
| `FROZEN_NATIVE_BUTTON_BY_FILE["components/NotePreviewView.tsx"]` | **4** | **4** | 🔴 **事件委托不得新增 `<button>`**（用容器 `onClick` + `closest`） | ⚠️ **是**（若新增） |
| `FROZEN_NATIVE_BUTTON_BY_FILE["components/RefineWorkbench.tsx"]` | 实测：**无键** | 无 | 同上（**出现 `<button>` 即红**） | ⚠️ **是** |
| `FROZEN_NATIVE_BUTTON_BY_FILE["components/notes/NotesReadingColumn.tsx"]` | 实测：**无键** | 无 | 同上 | ⚠️ **是** |
| `SPLIT_MOVES` | **1 条** | 只增按守恒 | 🔴 **包装件形态不搬 `<button>`** ⇒ **零新增** | **否** |
| `App.tsx` 行数 | T1 后 ≤550 | 🔴 **本任务零新增行**（C9.2 的"一次定够"判据） | 只用 T1 已备好的 `focusSeekMs` / `onFocusSeekConsumed` 两行 | ⚠️ **是**（若加行） |
| `NotesPage.tsx` 行数 | **295** | 净增 ≤ +5，**设计为 0** | `:273` 已接线 ⇒ **零改动** | **否** |
| `architecture.slots.test.ts`（A6 探针） | 绿（5 个视图 × `createElement(View, slot)` 0 诊断） | 🔴 **不许红** | 包装件**不在 `VIEWS` 名单里**（它不是注册表视图）⇒ 探针不受影响；🔴 **`NoteCardFlowView` 的 props 面一字不改** | ⚠️ **是**（若给 `NoteCardFlowView` 加独立 prop） |
| `views/registry.ts` | **137** | 🔴 **不得新增 `NoteViewSlot` 可选槽**（C10.3 逐字） | **零改动** | ⚠️ **是**（若加了） |
| `views/useViewMemory.ts`（**70**） | 既有签名 + **2 处调用点**（`SessionDetailPanel.tsx:87` / `NotesReadingColumn.tsx:136`） | 🔴 **加法式**（§C11.2）：既有调用点**一字不改** | 加**非持久**切换路径（可选参数 / 独立的临时覆盖） | ⚠️ **是**（若破既有调用点 ⇒ **STOP**） |
| `localStorage` 的视图记忆键（`view:default:session`） | 深链跳转**前后必须逐字相同** | 🔴 **不许被写入 / 不许被改变**（§C11.2） | 到达处理走**非持久**路径 | ⚠️ **是**（若走持久化 ⇒ V5′ 红） |

**Files:**
- 改 `app/src/components/NotePreviewView.tsx`（**346**）—— 行渲染改用 `markdownLine` + 容器 `onClick` 委托
- 改 `app/src/components/RefineWorkbench.tsx`（**482**）—— 容器 `onClick` 委托
- 改 `app/src/components/session-detail/SessionDetailPanel.tsx`（**200**）—— 收 `focusSeekMs` + 到达时**非持久**切到 `tritrack`（§C11.2）
- 改 `app/src/views/useViewMemory.ts`（**70**）—— **加非持久切换路径（加法式；既有调用点一字不改）**（§C11.2）
- 改 `app/src/views/useViewMemory.test.ts`（**206**）—— **新增「`localStorage` 未被写入/未被改变」的断言 + 其变异体**（既有用例只增不减）
- 改 `app/src/pages/SessionsPage.tsx`—— 透传（T1 已加类型）
- 改 `app/src/components/notes/NotesReadingColumn.tsx`（**294**）—— 用包装件替换 `NoteCardFlowView` 的渲染
- 新建 `app/src/views/note/NoteCardFlowWithSeek.tsx`（预算 **≤40 行**）—— **包装件**
- 改 `app/src/pages/NotesPage.test.tsx`（**174**）—— **Y9**（选择器改写）
- **`NON_MIGRATED_14`**：🔴 **七个文件都不在其中**（逐个核对）

**Interfaces:**
- Produces：
  ```tsx
  /** 卡片流视图的**带 seek 包装**（C10.3：不经 `NoteViewSlot` 把 `onOpenSessionAt` 传下去）。
   *  @ai-context 为什么需要包装件：`views/architecture.slots.test.ts` 用 tsc 探针强制
   *  「视图组件的 props ⊆ slot」⇒ 直接给 `NoteCardFlowView` 加 prop 会 `TS2769`；而 C10.3
   *  禁止新增 `NoteViewSlot` 可选槽 ⇒ 唯一可行形态 = 容器侧包一层，**槽整体转交**。
   *  边界：本件**不是注册表视图**（不进 `viewsFor`）⇒ 不影响站点/探针/惰性判据。 */
  export default function NoteCardFlowWithSeek(
    slot: NoteViewSlot & { readonly onOpenSessionAt?: (sessionId: number, ms: number) => void },
  ): ReactElement;
  ```

- [ ] **Step 0: 🔴 先复核 `### 表 6` X7（C10.3 逐字要求「先查」）**
  逐条核对：① `views/architecture.slots.test.ts:42-48` 的 `VIEWS` 名单**不含**包装件 ⇒ 探针不受影响；② `NoteViewSlot` **零改动**；③ `NoteCardFlowView` 的 props 面**一字不改**。⇒ **三条全部成立 ⇒ 本计划做**（C10.3 的"能 ⇒ 做"）。

- [ ] **Step 1: `NotePreviewView` 的行渲染改用 `markdownLine`（C10.1 的"迁入"）**
  - 删本文件的 `renderMarkdown` 实现（**346 行的文件会净减**），改为：
    ```tsx
    import { mdLineHtml, PREVIEW_MODE } from "../utils/markdownLine";
    // 逐行渲染时：mdLineHtml(line, PREVIEW_MODE)
    ```
  - 🔴 **T16 的表征测试必须同批改落点**（从 `NotePreviewView.renderMarkdown` 改为 `markdownLine.mdLineHtml(..., PREVIEW_MODE)`），**且断言值保持不变**（这正是回归网的用法）。
  - ⚠️ **`export function renderMarkdown`（T16 加的导出）随迁移删除** ⇒ 若 T16 的测试 import 它 ⇒ **同批改测试的 import**。

- [ ] **Step 2: 容器侧事件委托 ×3（C10.2）**
  - `NotePreviewView.tsx`：容器 `onClick={(e) => { const el = (e.target as HTMLElement).closest("[data-ts-ms]"); if (!el) return; const ms = Number(el.getAttribute("data-ts-ms")); onOpenSessionAt?.(sessionId, ms); }}`
  - `RefineWorkbench.tsx`：**同款**（它今天**没有** `onOpenSessionAt` ⇒ 🔴 **必须新增一个可选 prop**；⚠️ 它**不在 35 文件普查**、**不在 `NON_MIGRATED_14`** ⇒ 安全）
  - `NoteCardFlowWithSeek.tsx`：把 `onOpenSessionAt` 注入一个**包裹 div 的委托**（或由 `NoteMarkdown` 自己处理 ⇒ **更优**：卡片流经 `NoteMarkdown` ⇒ **它已有 `onOpenSessionAt` 链路**，只需把回调传进去）
  🔴 **`closest('[data-ts-ms]')` 是 C10.2 逐字给出的形态**。
  🔴 **不得**给芯片加 `onClick`（它是字符串产物，没有 React 上下文）。

- [ ] **Step 3: `[[ts:ms]]` 三缺二补完（C9.2 的 R9.1/R9.2/R9.3）**
  1. **R9.1**：`SessionsPage` 把 `focusSeekMs` 透传给 `SessionDetailPanel`（T1 已加类型）
  2. **R9.4/C10.3**：`SessionDetailPanel` 在 `focusSeekMs` 到达时：`setPlayheadMs(seek.ms)` **且**把视图切到 `tritrack`（**走既有 `useViewMemory` 机制** ⇒ `viewKey` 由它管）
     - 🔴 **本条的形态已裁（§C11.2，2026-09-13）：必须临时切，禁止写记忆** —— **不得**用 `setViewKey` 写入 `useViewMemory`（持久化）。理由逐字：「一次深链永久改变默认视图」是用户可感知的**副作用式行为变更**，且**本批测不了**（真机跳过）。
     - 🔴 **实现形态（§C11.2 逐字「给 `useViewMemory` 加**非持久**切换路径（可选参数 / 独立的临时覆盖），**加法式改动**（既有调用点一字不改）」）**：
       1. `app/src/views/useViewMemory.ts`（**70 行**，E1 实测）—— 加一条**非持久**路径，**加法式**：可选参数**或**独立的临时覆盖（如 hook 多返回一项 `setViewKeyEphemeral`，或 `useViewMemory(..., { ephemeral })` 的可选选项；**具体命名由实施者定并给论证**）；
       2. 🔴 **既有调用点一字不改**：`components/SessionDetailPanel.tsx:87` 与 `components/notes/NotesReadingColumn.tsx:136`（E1 实测，**恰两处**）**签名与行为都不变**；`views/useViewMemory.test.ts`（**206 行**）的**既有用例只增不减**；
       3. `SessionDetailPanel` 的到达处理改用**非持久**路径 ⇒ **`localStorage` 的视图记忆键（`view:default:session`）不被写入、也不被改变**。
     - 🔴 **必备判据 + 变异体（§C11.2 第 ①/② 条）**：**一条测试断言「深链自动切视图后，`localStorage` 的视图记忆未被写入/未被改变」**（建议形态：跳转**前**快照 `localStorage` 的相关键值 ⇒ 跳转 ⇒ 断言**逐字相同**，**同时**断言非持久路径确实把 `viewKey` 切到了 `tritrack`）；**变异体 = 把非持久路径改回 `setViewKey`（持久化）⇒ 该断言必须红**（见 **V5′**）。
     - 🔴 **若实现上必须破既有调用点（改 `useViewMemory` 的既有签名 / 改上面两处调用点）⇒ STOP 报控制方**（§C11.2 逐字）。
     ⇒ 🔴 **原「采用 (i)（接受持久化）」作废** —— **§C11.2 已裁「必须临时切、禁止写记忆」**（见上一条）。**报告须逐字登记**：① 非持久路径的形态与命名；② `localStorage` 的 keys/values **跳转前后逐字快照**（`before`/`after` 必须相同）；③ 两处既有调用点**零改动**的 `git diff` 证据。
  3. **R9.2**：`NotesReadingColumn` 用 `NoteCardFlowWithSeek` 替换 `<LazyView slot={slot} />` 的卡片流分支（**保持 `lazy()` 的 memo 语义**）

- [ ] **Step 4: 改 `NotesPage.test.tsx:165` 的选择器（Y9）**
  ```ts
  // before
  const el = container.querySelector<HTMLElement>('span[title*="跳转到会话"]');
  // after（带 data-* 的定名选择器 ⇒ 比原来更强，不再依赖 title 文案）
  const el = container.querySelector<HTMLElement>('[data-ts-ms="5000"]');
  ```

- [ ] **Step 5: 跑门禁并提交**
  ```powershell
  cd app; npx tsc --noEmit
  cd app; npx vitest run src/pages/NotesPage.test.tsx src/components/NotePreviewView.render.test.ts src/utils/refineDiff.test.ts src/views/architecture.slots.test.ts src/views/architecture.guard.test.ts --reporter=json --outputFile=../tmp/t17/u.json
  cd ..; node scripts/line-limits.mjs --full
  node .superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/plan-writer/frozen.mjs
  ```

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **迁移的机械等价**：T16 的表征测试**断言值逐字不变**（只改落点） | **M1**：把 `PREVIEW_MODE` 的 `h2` 从 `15px` 改成 `14px` | **M1 后期望**：T16 的标题类样本红（**回归网真的生效**） |
| **V2** | **`NotePreviewView` 侧芯片可点**（行为级）：点 `[data-ts-ms]` ⇒ `onOpenSessionAt` 收到 `(sessionId, ms)` | **M2**：把 `closest("[data-ts-ms]")` 改成 `closest(".ed-ts-chip")` | **M2 后期望**：点击类断言红 |
| **V3** | **`RefineWorkbench` 侧芯片可点**（C10.2 逐字「✅ `RefineWorkbench` 侧**不再算残余**」） | **M3**：不给 `RefineWorkbench` 加 `onOpenSessionAt` prop | **M3 后期望**：该侧的可点断言红（**且报告的"不再算残余"结论被推翻**） |
| **V4** | **`[[ts:ms]]` 端到端**（`NotesPage.test.tsx` 的用例）：点芯片 ⇒ `onOpenSessions` 收到 `(42, 5000)` **且** 选择器为 `[data-ts-ms="5000"]`（**Y9**） | **M4**：把 ms 在 `goSessions` 里丢掉（还原旧行为） | **M4 后期望**：`toHaveBeenCalledWith(42, 5000)` 红（**这是"三缺二补完"的端到端具名断言**） |
| **V5** | **自动切三轨**：`focusSeekMs` 到达后 `viewKey === "tritrack"` 且 `playheadMs === seek.ms` | **M5**：只 `setPlayheadMs` 不切视图 | **M5 后期望**：viewKey 断言红（**"定位不可感知"的判据**） |
| **V5′** | 🔴 **§C11.2 的持久化禁令**：深链自动切视图**之后** `localStorage` 的视图记忆**未被写入 / 未被改变**（跳转前后逐字快照相同）；且**既有调用点零改动**（`SessionDetailPanel.tsx:87` / `NotesReadingColumn.tsx:136` 的 `useViewMemory(` 调用行**逐字未变**），`views/useViewMemory.test.ts` 的既有用例**只增不减** | **M5′**：把非持久路径改回 `setViewKey`（= 持久化） | **M5′ 后期望**：`localStorage` 快照断言**必红**（**"一次深链不得永久改变默认视图"的具名断言**）；`ran > 0` 只是旁证 |
| **V6** | 🔴 **`NoteViewSlot` 零改动**：`git diff app/src/views/registry.ts` 为**空**；`architecture.guard.test.ts` A2④ 的 `typeEdges` 仍逐字 3 条 | **M6**：给 `NoteViewSlot` 加 `onOpenSessionAt?` | **M6 后期望**：`architecture.guard.test.ts` A2④ 的 typeEdges 集合变化 ⇒ 红（**且违反 C10.3**） |
| **V7** | 🔴 **A6 探针仍绿**（`architecture.slots.test.ts` 的 tsc 探针 0 诊断 + 牙齿自证 > 0） | **M7**：给 `NoteCardFlowView` 加一个必填 prop | **M7 后期望**：探针报 `TS2769 no overload matches` ⇒ 红 |
| **V8** | **卡片流芯片可点**（R9.2） | **M8**：`NotesReadingColumn` 仍直接渲染 `NoteCardFlowView` | **M8 后期望**：卡片流侧的可点断言红 |
| **V9** | **`App.tsx` 零新增行**（C9.2 的"一次定够"） | **M9**：在 `App.tsx` 里再加一个 state | **M9 后期望**：`lines.mjs` 报行数 > T1 的值 ⇒ 与 C9.2 的判据冲突 ⇒ 报告红 |
| **V10** | **冻结键随代码收紧**：`NotePreviewView.tsx` 的边框/圆角键**按实测评测**；`frozen.mjs` 的 Σ **≤ 迁前**；报告给逐键 diff | **M10**：迁移后保留行内 `border: "1px solid #e5e7eb"` | **M10 后期望**：该键**不减** ⇒ 与「≤ 迁前」同向红 |
| **V11** | `line-limits --full` **exit 0** | — | 逐字读数 |

**提交信息**：`feat(notes): 笔记预览迁入行渲染器并接通时间码深链`（**subject 33 字**）

**诚实边界**：① 🔴 **§C11.2 禁止持久化** ⇒ 自动切三轨走**非持久路径**：**"这次跳转切了视图、但没有留下持久副作用"必须由 V5′ 的 `localStorage` 快照断言证明**；⚠️ **它证明的是"该键未被写入/未被改变"，不是"用户感知不到视图切换"**（后者属观感面）；② 「三缺二补完」的**端到端证据只是 jsdom 级**（`NotesPage.test.tsx`）⇒ **真机不可达**（C6.4）；③ **`NotePreviewView` 的组件级行为仍无测试**（T16 只覆盖行渲染器）⇒ 「笔记预览已全面可测」为假；④ **`utils/html.ts` 的芯片改动同时影响两条链** ⇒ 若 `RefineWorkbench` 侧出现意外差异，**根因可能在 T15 而不是本任务**（报告须按此顺序排查）；⑤ 🔴 **`useViewMemory` 的非持久路径"加法式"这一条只能证到"既有调用点文本未变 + 既有用例未减"** ⇒ **不证明**该 hook 的其它调用面（如测试里的直接构造）不受影响（报告须如实说明核对到了哪一层）。

---

### Task 18: 标签线（C2.1 / C2.2 / C2.3 / C2.4 + C0.4 / C0.5）

> **依据**：C0.2 行 35 逐字「**A 补完**：标签可写 + 标签色成对 + `tag_colors` 补种子/迁移」+ C2.1（落点 = `NoteHeaderActions.tsx` + 新兄弟组件；**不开 B1/B2 例外**）+ C2.2（三条写端命令各须 ≥1 生产调用点；**设色+清色成对**；端到端可复现）+ C2.3（`tag_colors` **幂等回填** + 4 点内存库单测）+ C2.4（过滤面板真的能用）。

**目标**：① 新建 `components/NoteTagsEditor.tsx`（标签编辑浮层：输入 + 芯片 + 设色 + 清色）；② 在 `NoteHeaderActions.tsx` 挂入口；③ 三条写端命令各 ≥1 生产调用点；④ `tag_colors` 幂等回填（Rust）+ 4 点内存库单测；⑤ 过滤面板出现且芯片着色。

**🔴 冻结值预算表（C9.12）** —— **C9.12 的"现成表格"直接用（控制方实测）**

| 文件 | `nativeButton` 现值 | 上限 | 边框 现值 | 上限 | 越界圆角 现值 | 上限 | 阴影 现值 | 上限 | 在 35 文件普查？ |
|---|---|---|---|---|---|---|---|---|---|
| **`components/NoteHeaderActions.tsx`**（标签线落点） | **2** | **2** 🔴 **满** | **1** | **1** 🔴 **满** | 2 | 2 | 1 | 1 🔴 **满** | ✅ **否** |
| `components/NoteColorPicker.tsx` | **2** | **2** 🔴 **满** | — | — | — | — | — | — | ✅ 否 |
| `components/NoteListToolbar.tsx` | 4 | 4 | 3 | 3 | 2 | 2 | — | — | 否 |
| `components/NoteEditView.tsx` | 18 | 18 | 4 | 4 | 1 | 1 | 1 | 1 | 否（但**在 `NON_MIGRATED_14`**） |
| `components/NoteListRow.tsx` | 实测 `frozen.mjs`：**无键** | — | 实测：**无键** | — | 实测：**无键** | — | — | — | 否 |

**⇒ 硬结论（C9.12 逐字）**
1. 🔴 **在 `NoteHeaderActions.tsx` 里加原生 `<button>` 会红**（2 = 2 已满）⇒ **标签入口必须用 `Button` 原语**。
2. 🔴 **在 `NoteHeaderActions.tsx` 里加 `1px solid #e5e7eb` 会红**（1 = 1 已满）⇒ **标签浮层必须用 token / `<Surface>`**（并走 C9.5 的登记制），**不得**复制 `:64` 那行内联边框写法。
3. 🔴 **新文件 `NoteTagsEditor.tsx` 的冻结键**：**全部无键** ⇒ `nativeButton` 出现即红、边框/圆角/阴影/灰/字号越界出现即红 ⇒ **一律走原语与 token**。
4. ⚠️ **`NoteColorPicker.tsx` 的 `nativeButton` 也已满（2 = 2）** ⇒ 🔴 **不得给它加按钮**（标签色的设/清动作**必须直接用它的既有 12 色按钮 + `color-clear`**）。

**Files:**
- 改 **`app/src/components/NoteHeaderActions.tsx`（122）** —— 加一个标签入口（**必须用 `Button` 原语**，或复用色点式的 `<span onClick>` 形态）
- 新建 `app/src/components/NoteTagsEditor.tsx`（预算 **≤200 行**）
- 改 `app/src-tauri/src/db_colors.rs`（**79**）—— 加幂等回填方法
- 改 `app/src-tauri/src/db_colors_tests.rs`（内存库单测，**+4 点**）
- 改 `app/src/components/NoteListToolbar.tsx`（**96**）—— 过滤芯片着色（**C2.4 的口径缺口，见 `### 表 6` X5**）
- （可能）改 `app/src/components/NoteListRow.tsx`（已用 `tagColors`）
- **`NON_MIGRATED_14`**：🔴 **本任务的四个文件都不在其中**（逐字核对：`NoteHeaderActions` ✅ 不在 · `NoteTagsEditor` 新建 ✅ 不在 · `NoteListToolbar` ✅ 不在 · `NoteListRow` ✅ 不在）

**Interfaces:**
- Consumes：`invoke("update_note_tags", { id, tags })` · `invoke("set_tag_color", { tag, color })` · `invoke("reset_tag_color", { tag })` · `NoteColorPicker`（**12 色 + `color-clear` 已在**）
- Produces：
  - `NoteTagsEditor` 的 props（`{ note, onChanged, onError }`）
  - Rust：`Db::backfill_tag_colors(&self) -> Result<usize>`（**幂等**，返回新增行数）

- [ ] **Step 1: Rust 侧幂等回填（C2.3 / C0.4）**
  **形态（C0.4 逐字：唯一可实现形态）**：把 `notes.tags` 里已出现的**去重标签**变成 `tag_colors` 行，颜色取**确定性**色板分配，且**不得覆盖用户已设的色**（等价 `INSERT OR IGNORE`）。
  ```rust
  /// 把 `notes.tags` 里已出现的去重标签回填成 `tag_colors` 行（**幂等**）。
  ///
  /// @ai-context 批 7 T18（规格 §1 L5 行 35「`tag_colors` 补种子/迁移」）：本表此前**零种子、
  ///   零回填**（全仓唯一的 INSERT 是 set_tag_color 的 upsert）⇒ 标签过滤面板恒空。
  ///   形态选择：**不放 migration**（`db_migrations.rs` 573 行、距 600 仅 27；且迁移机制只支持纯 SQL，
  ///   SQL 内做不到确定性取色）而放数据层的**幂等方法**，由既有启动装配点调用一次。
  /// @ai-context 三条硬约束（C2.3）：① 幂等（重跑无变化）② 不覆盖用户已设色（`INSERT OR IGNORE`）
  ///   ③ 不改 schema 主键语义（`tag TEXT PRIMARY KEY` 一字不动）。
  /// 副作用：写 `tag_colors` 表（**只增不覆盖**）；返回本次新增行数（幂等重跑 ⇒ 0）。
  pub fn backfill_tag_colors(&self) -> Result<usize> { … }
  ```
  **确定性取色规则**：`color = COLOR_IDS[stable_hash(tag) % COLOR_IDS.len()]` —— ⚠️ **`COLOR_IDS` 在前端**（`utils/colorPalette.ts`）⇒ 🔴 **Rust 侧必须有自己的 12 色 id 常量表**，且**必须与前端的 id 集合逐字相同**（否则前端 `paletteHex` 回退默认灰）。
  ⇒ 🔴 **实施者必须先读出 `utils/colorPalette.ts` 的 `COLOR_IDS` 12 个 id 并逐字抄进 Rust**，并**加一条跨语言对拍测试**（Rust 侧常量 ↔ 前端常量 ⇒ **用一条 node 探针读两边并断言集合相等**）。
  **调用点**：`app_setup.rs` 的 AppState 初始化之后（**受控点**）⇒ 🔴 **报告须点名这是"启动期一次性写"**，并说明它的失败语义（**降级：失败不阻断启动**，`eprintln!` 后继续 —— 与既有启动期兜底同范式）。
  **4 点内存库单测**（C2.3 逐字）：① **空库**（`notes.tags` 全空 ⇒ 回填 0 行、表仍空）② **已有标签**（2 条笔记共 3 个去重标签 ⇒ 回填 3 行、颜色确定性）③ **用户已设色不被覆盖**（先 `set_tag_color("x","red")` 再回填 ⇒ `x` 仍是 `red`）④ **重跑幂等**（连续两次 ⇒ 第二次返回 0、表逐字不变）。

- [ ] **Step 2: 新建 `components/NoteTagsEditor.tsx`**
  形态（**C2.1 + C2.2 + C0.6**）：**锚定浮层**（`position:"absolute"` + `zIndex("popover")`），内容 = ① 当前标签芯片（每个带删除 `×`）② 输入框（回车/按钮加标签）③ **点芯片 ⇒ 展开 `NoteColorPicker`**（设色）④ **`NoteColorPicker` 的 `color-clear` ⇒ `reset_tag_color`**（**成对**，C2.2 逐字）。
  🔴 **`NoteColorPicker` 原样复用，零改动**（它 `:2` 逐字自陈「笔记级/组级/**标签级**三处复用」⇒ 这是原设计）；⚠️ 它的 `nativeButton` 已满 ⇒ **不得给它加按钮**。
  🔴 **零 `position:"fixed"`**（C2.1 逐字）；**零 `...rest`**；**零 `const *Btn*` 常量**；**零内联 `<svg>`**；**零裸数字 `z-index`**；**零 `#9ca3af`**；**零越界 `fontSize`**；**零字面量 `boxShadow:`**；边框/底色/圆角一律走 **token 或 `<Surface>`**。

- [ ] **Step 3: 在 `NoteHeaderActions.tsx` 挂入口**
  🔴 **必须用 `Button` 原语**（C9.12 硬结论 1：原生 `<button>` 会红）；入口形态与既有色点一致（`<span onClick>` 也行，**但 `Button` 原语更合规**）。
  ⚠️ 该文件的**原生 `<button>` 现值 2 = 上限 2** ⇒ **本步如果用 `Button` 原语 ⇒ 现值不变（2）**；若**顺手把 `:97` / `:109` 的两个原生按钮也换成 `Button`** ⇒ **现值降到 0**（**降是允许的**，且是**正面收益**）⇒ 🔴 **本计划建议顺手换掉这两处**（它是 C0.6「新代码用原语」的同一方向，且**降低**棘轮）⇒ **必须同步 `FROZEN_NATIVE_BUTTON_BY_FILE` 的该键**（2 → 0）+ `FROZEN_NATIVE_BUTTON_TOTAL`（393 → 391）+ 报告给逐键 diff。

- [ ] **Step 4: 过滤面板着色（C2.4 的口径缺口，`### 表 6` X5）—— 🔴 已裁：做（§C11.3）**
  给 `NoteListToolbar` 加**可选** `tagColors?: Record<string, string>`，芯片背景色按 `tagColors[t]`（**与 `NoteListRow` 同口径**）；`NotesPage.tsx:234` 已在传 `tagColors={list.tagColors}` 给列表列 ⇒ **核对它是否到达 toolbar**，未到达则透传（**净增 ≤ +3 行**，`NoteListToolbar` 96/300 余量充足；`allTags` **仍是 `string[]`**，只多一张查色表）。
  🔴 **裁决逐字（§C11.3）**：**做** —— 理由：§C2.4 的字面要求是「**色与 `tag_colors` 一致**」；过滤面板的芯片与列表行的色块**不一致**正是用户纲领要防的「呆板 / 不一致」。
  🔴 **冻结值预算（C9.12，不许新增）**：`NoteListToolbar.tsx` 现 `nativeButton 4 · 边框 3 · 越界圆角 2`（**三项都是"现值 == 上限"**，见本卡预算表）⇒ **不得**新增原生 `<button>`、**不得**新增 `#e5e7eb` 边框字面量、**不得**新增越界圆角 —— 一律 **`Button` 原语 + token**（上色走 `background`/`color` 的**既有查色表值**，不引入面字面量）。
  🔴 **登记「控制方第 12 例引述不精确」（§C11.3 逐字）**：C2.4 的括号里写「读端已在」指的是 `NoteListRow`，**不含 toolbar** —— **实际只有 `NoteListRow` 着色**；⇒ **批 7 不得再把「读端已在」当成「所有读端都已在」**（报告须逐字登记这条引述更正）。

- [ ] **Step 5: 跑门禁并提交**（**3 个提交**：Rust 回填 + 单测 / 前端写端 / 过滤面板）
  ```powershell
  cd app; npx tsc --noEmit
  cd app/src-tauri; cargo test --test app_lib_tests
  cd ..; node scripts/line-limits.mjs --full
  node scripts/check-command-registry.mjs   # 期望 310/310/0（本任务不加命令）
  node .superpowers/sdd/2026-09-12-frontend-redesign-batch7-unwired/tmp/plan-writer/frozen.mjs
  ```

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **C2.3 的四点内存库单测**（空库 / 已有标签 / 用户已设色不被覆盖 / 重跑幂等） | **M1**：把 `INSERT OR IGNORE` 改成 `INSERT OR REPLACE` | **M1 后期望**：③「用户已设色不被覆盖」红 |
| **V2** | **端到端可复现**（C2.2 逐字）：加标签 → **重新读库** → 标签仍在（jsdom 级：`invoke` mock 断言 `update_note_tags` 被调用且载荷正确 + 重载后 `parseTags(note)` 含新标签） | **M2**：只改本地 state 不调 `invoke` | **M2 后期望**：`invoke` 断言红（**"标签能写进去"的具名断言**） |
| **V3** | **三条命令各 ≥1 生产调用点**（C2.2）：`sites.mjs` 实测 `update_note_tags` / `set_tag_color` / `reset_tag_color` 的 PROD 命中 **各 ≥1** | **M3**：把 `reset_tag_color` 的调用删掉（只留设色） | **M3 后期望**：探针报 `reset_tag_color` PROD = 0 ⇒ 红（**"成对"的具名断言**） |
| **V4** | 🔴 **在 `NoteHeaderActions.tsx` 里没有新增原生 `<button>`**：`frozen.mjs` 的该键 **≤ 2** | **M4**：在 `NoteHeaderActions.tsx` 里加一个原生 `<button>` | **M4 后期望**：`nativeButton.ratchet.test.ts:203-214` 报「`components/NoteHeaderActions.tsx`: 2 → 3（+1）」⇒ 红 |
| **V5** | 🔴 **在 `NoteHeaderActions.tsx` 里没有新增 `1px solid #e5e7eb`**：该键 **≤ 1** | **M5**：复制 `:64` 那行内联边框到新浮层 | **M5 后期望**：`surfaceRatchet.test.ts` 报「2 > 上限 1」⇒ 红 |
| **V6** | **新文件棘轮干净**：`frozen.mjs` 里 `components/NoteTagsEditor.tsx` **无任何键** | **M6**：在新文件里写 `boxShadow: "0 1px 2px rgba(0,0,0,.1)"` | **M6 后期望**：`surfaceRatchet.test.ts` 报「未登记文件命中 `boxShadow:`」⇒ 红 |
| **V7** | 🔴 **`NON_MIGRATED_14` 零触碰**：`dialogMigration.e.test.ts:252-253` 全绿 | **M7**：把标签入口做进 `NoteEditView.tsx` | **M7 后期望**：`:252-253` 红（**"落点在 14 外"的具名断言**） |
| **V8** | 🔴 **没有新的 `fixed` ∧ `inset:0` 文件**：`:248` 的盘上对拍仍 == `NON_MIGRATED_14` | **M8**：浮层用 `position:"fixed"` + `inset:0` | **M8 后期望**：`:248` 红（**C2.1 的具名断言**） |
| **V9** | **过滤面板真的出现**（C2.4）：写标签后 `allTags.length > 0` ⇒ `NoteListToolbar:82` 的 `&&` 分支渲染；**芯片色 == `tagColors[t]`**（🔴 **§C11.3 已裁"做" ⇒ 这条断言是必做的，不再是"若控制方裁"**） | **M9**：把 `tagColors` 透传删掉 | **M9 后期望**：芯片色断言红（**"色与 `tag_colors` 一致"的具名断言**） |
| **V9′** | 🔴 **上色不新增冻结值**：`NoteListToolbar.tsx` 的 `nativeButton ≤ 4` · 边框 `≤ 3` · 越界圆角 `≤ 2`（三项**现值 == 上限** ⇒ 只许持平或下降） | **M9′**：在 toolbar 的芯片上写一个 `border: "1px solid #e5e7eb"`（或加一个原生 `<button>`） | **M9′ 后期望**：`surfaceRatchet.test.ts` / `nativeButton.ratchet.test.ts:203-214` 报该文件超上限 ⇒ 红 |
| **V10** | **跨语言色板一致**：Rust 的 12 色 id 集合 == 前端 `COLOR_IDS`（node 探针双向读 + 断言集合相等） | **M10**：把 Rust 的某个 id 改一个字母 | **M10 后期望**：探针报集合不等 ⇒ 红 |
| **V11** | **回填是幂等的且失败不阻断启动**：注入一个失败（如把表 drop）⇒ 启动仍成功 + 有 `eprintln!` | **M11**：把回填的 `?` 直接向上传播到 `setup` | **M11 后期望**：启动失败 ⇒ 与 V11 的判据冲突 ⇒ 红 |
| **V12** | `line-limits --full` **exit 0** · registry **310/310/0** · `cargo test` 全绿 | — | 逐字读数 |

**提交信息**（3 个）：`feat(db): 标签色表按 notes.tags 幂等回填`（**subject 21 字**）· `feat(notes): 新增标签编辑器并接通写端三条命令`（**subject 24 字**）· `feat(notes): 过滤面板按 tag_colors 着色`（**subject 18 字**）

**诚实边界**：① 🔴 **真机不可达**（C6.4）⇒ 「标签能写进去」的端到端证据是 **jsdom + `invoke` mock 级**，**不是**真机往返；② **`NoteTagsEditor` 无同名测试的"输入法/焦点"行为覆盖**（jsdom 无 IME）⇒ 中文输入法的回车提交**未测**；③ **回填的确定性取色规则是本计划自定的**（C0.4 只说"确定性"，没给映射函数）⇒ 它是**发明**，须在报告里逐字声明并可被控制方否决；④ **启动期一次性写**的**时序副作用未测**（并发启动 / 崩溃中断）⇒ 幂等设计是其唯一保障；⑤ 🔴 **C2.4 的"色与 `tag_colors` 一致"在 toolbar 上今天不成立**（`### 表 6` X5）⇒ **§C11.3 已裁「做」**（Step 4 落地 + V9/V9′ 判据）；**同时登记控制方第 12 例引述不精确**（§C11.3：C2.4 括号里的"读端已在"**只有 `NoteListRow`**）；⑥ **`NoteListToolbar` 的行数会变**（96 → ~99），**不在贴边表内**，但报告须给新读数。

---

### Task 19: 档位通道 A 做完整（C3.1 四段）+ `:45` 散文 310 → 311（C10.6）

> **依据**：C0.2 行 34 逐字「**A 做完整**：`start_live_session` 加 tier + 记忆加 tier 字段 + **新 `remember_video_profile_tier` 命令**」+ C3.1（四段 + 与 `update_live_profile` 严格区分 + `app_commands.rs` 属 §10 + 验收形态）+ **C10.6 第 6 项**（`:45` 的散文必须与 registry 改动**同批** ⇒ 本任务把它改成 **311**）。

**目标**：① `start_live_session` 加 `tier` 参数（前端同步）；② `ProfileMemory` 加 tier 字段（`remember_tier` / `lookup_tier`）；③ **新增 `remember_video_profile_tier` 命令**（`#[tauri::command]` + `generate_handler!` **成对**）⇒ registry **310 → 311**；④ 读端 `video_profile_for_spec` 接线；⑤ `ProfileDetector.changeTier` 真写后端 + `tierNotice` 的诚实文案更正；⑥ **同批**把豁免表 `:45` 的散文改成 **311**。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `check-command-registry` | **310 / 310 / 0**（T4 后） | 🔴 **本任务期望 = 311 / 311 / 0** | 新命令**成对**落地 | ⚠️ **中间值合法**；报告写「本任务期望 **311/311/0**」与**为何**（310 + 1） |
| `line-limit-exemptions.md:45` 的散文 | **310**（T4 后） | 🔴 **无门禁兜底** | 改成 **311**（C10.6 同批） | **否**（无门禁）⇒ T11 的探针兜底 |
| `app_commands.rs` 行数 | **476**（T4 后） | 已登记 301–600 档 | +1 行 ⇒ **477** ⇒ 🔴 **同批把登记值改成 477** | 🔴 **是**（若不同步） |
| `useLiveCaptureControl.tsx`（**298**） | 余 2 | **净增 ≤ +2，设计为 +1** | `CaptureStartArgs` +1 字段 + `invoke` 载荷 +1 行 | ⚠️ **是**（若 >300） |
| `commands_live.rs`（**399**）· `video_profile_memory.rs`（**228**）· `commands_video.rs`（**311**） | 余量充足 | — | 加参数 / 加字段 / 加命令 | **否** |
| `ProfileDetector.tsx`（**398**） | 已登记 | — | `changeTier` 改成真写后端 + 文案更正 | ⚠️ 报告给新读数 |
| 六棘轮 | — | — | `ProfileDetector.tsx` 实测**边框 1 / 字号越界 12 / nativeButton 1** ⇒ 🔴 **不得新增** | ⚠️ **是**（若新增） |

**Files:**
- 改 **`app/src-tauri/src/commands_live.rs`（399）** —— `start_live_session` 加 `tier: Option<String>`（第 5 参）
- 改 `app/src-tauri/src/video_profile_memory.rs`（**228**）—— `MemoryEntry` 加 `tier: Option<VisualTier>`（或独立通道，见 Step 2）+ `remember_tier` / `lookup_tier`
- 改 `app/src-tauri/src/commands_video.rs`（**311**）—— **新增 `remember_video_profile_tier`**（模板 = `:281` 的 `remember_video_profile_form`）+ `video_profile_for_spec` 的接线说明
- 改 **`app/src-tauri/src/app_commands.rs`（476 → 477）** —— +1 行注册条目 🔴 **AGENTS.md §10 额外审查文件 ⇒ 报告点名**
- 改 **`app/src/hooks/useLiveCaptureControl.tsx`（298）** —— `CaptureStartArgs` + tier + `invoke` 载荷
- 改 `app/src/components/ProfileDetector.tsx`（**398**）—— `changeTier` 调新命令 + 文案更正（去掉 `TODO(后端)` 与「仅本次会话生效」）
- 改 `app/src/components/ClassroomPage.tsx`（**281**）—— 透传 tier（若 `useLiveCaptureControl` 的上游组装在两处）
- 改 `docs/standards/line-limit-exemptions.md`（**234**）—— `:45` 的 310 → 311 + `app_commands.rs` 的 476 → 477
- **`NON_MIGRATED_14`**：不适用（Rust + `hooks` + `ProfileDetector` + `ClassroomPage` 都不在 14 内）

**Interfaces:**
- Produces：
  ```rust
  /// 记录用户确认的画面档（跨会话记忆；批 7 T19 · 规格 §1 L5 行 34）。
  /// @ai-context 与 `update_live_profile`（**采集态热切换**）严格区分：那条改的是**正在跑的会话**，
  ///   本条改的是**记忆偏好**（下次同标题/同系列会话的起点）⇒ 两条命令不可互相替代（C3.1 逐字）。
  #[tauri::command]
  pub fn remember_video_profile_tier(state: State<'_, AppState>, title: String, tier: String) -> Result<(), String>
  ```

- [ ] **Step 1: ① `start_live_session` 加 tier**
  加第 5 参 `tier: Option<String>`；**归一化与校验**：非法值回退默认档（**不阻断**，与既有 `profile` 参数同口径）；🔴 **`start_live_session` 不得因为 tier 而改变既有四参的语义**（既有调用点 / 事件载荷一字不改）。
  ⚠️ `commands_live.rs` 的 `LiveSessionParams` 是否需要新字段**由实施者读码定**；若需要 ⇒ **同批**加。

- [ ] **Step 2: ② 记忆加 tier 字段**
  🔴 **形态选择（实施者按最小撞击定，但必须给论证）**：`ProfileMemory` 已有 `entries`（kind/form）与 `domain_entries`（**独立通道**，`:35-37` 逐字说明"分离"的理由）。
  ⇒ **建议**：照 `domain_entries` 的**先例**加**独立通道** `tier_entries: Vec<TierMemoryEntry>`（`tier` + 复用同一个 `memory_key`）—— 理由是**避免 tier 的加入把 form 的 `lookup_form` 语义染脏**（与 `domain` 的分离理由逐字同族）。
  ⚠️ **`serde` 兼容**：新字段**必须** `#[serde(default)]`（否则旧 JSON 反序列化失败 —— 先例 `MemoryEntry.form` 的 `Option` + serde 缺省）。
  ⇒ **报告须逐字论证形态选择**，并给「旧 JSON 零迁移」的证据（照 `video_profile_memory.rs:28` 的既有自陈写）。

- [ ] **Step 3: ③ 新增 `remember_video_profile_tier` 命令**
  照 `remember_video_profile_form`（`:281-306`）**逐条同形**：`title.trim()` ⇒ 空则 `Err` ⇒ `chars().take(200)` ⇒ 解析/校验 `tier`（**`VisualTier::parse` 存在** ⇒ 用它，非法值 `Err`）⇒ **锁内 read-modify-write**（`state.profile_memory.lock()` + `save`）。
  🔴 **`app_commands.rs` 的注册条目 +1 行**（**与定义同批**，C0.1）。

- [ ] **Step 4: ④ 读端接线**
  `video_profile_for_spec`（`:260`）**已在**且**是纯函数**。🔴 「接线」的**可执行形态** = **前端真的调它**：在 `ProfileDetector` 的检测流程里用它把「形态 × 档位」映射成展示参数（**而不是只用本地的 `KIND_TO_FORM` / `KIND_TO_TIER` 双写**）。
  ⚠️ 🔴 **这里有内部张力**（recon-a §A2③ 已登记）：§9 #30 删 `video_profile_spec_by_kind` 的理由逐字是「前端已有 `KIND_TO_FORM` / `KIND_TO_TIER` 双写」，而 #28 留 `video_profile_for_spec` 的理由是「档位通道的读端」。
  ⇒ 🔴 **本任务的形态已裁（§C11.4，2026-09-13；原"报告里逐字登记 #30 的删除理由在事后不再成立"作废）**：读端接线的形态 = 「**后端 `video_profile_for_spec` 为读端真源** + 前端 `KIND_TO_FORM` / `KIND_TO_TIER` 映射**降级为兜底**」。
  - **理由（§C11.4 逐字）**：① 这**不**使 §9 #30 的删除理由失效 —— 前端**仍然保有**那张映射，只是**角色从「并行真源」变成「离线降级路径」**；②「所有云端/系统能力必须有本地兜底路径」是 **AGENTS.md §3.4 的硬性要求** ⇒ 兜底**必须留**；③「档位选完真生效 / 跨会话记住」的验收要求**后端**为真源。
  - 🔴 **不得删除前端映射**（§C11.4 逐字）；落地形态 = 用后端返回值**覆核/修正**本地映射的产物（本地映射只在该调用失败/离线时生效）。
  - 🔴 **必须**：在**规格回写**（→ **T21**）与**报告**里**逐字登记这次角色变更**（「并行真源 → 离线降级路径」），**否则事后读 #30 的删除理由会与代码矛盾**。
  - 🔴 **若实施者认为本地双写不可动（保留并行真源）⇒ 接线流于形式，STOP 报控制方**（§C11.4 逐字；计划的默认执行形态即此，采纳）。

- [ ] **Step 5: ⑤ 前端 `changeTier` 真写后端 + 文案更正**
  `ProfileDetector.tsx:196-200` 的 `changeTier` 改为：`setTier(t)` ⇒ `await invoke("remember_video_profile_tier", { title: windowTitle, tier: t })` ⇒ **成功 ⇒ 清 notice**；**失败 ⇒ `setError`（不吞异常）**。
  🔴 **`tierNotice` 的文案必须更正**（今天的「画面档修改仅本次会话生效」在写后端之后**变成谎话**）；🔴 **`:194` 的 `TODO(后端)` 注释必须删除**（它说的命令已经存在）。

- [ ] **Step 6: ⑥ 同批同步豁免表（C10.6）**
  `:45` 的 `310 条` → **311 条**；`app_commands.rs` 的 `476` → **477**。

- [ ] **Step 7: 跑门禁并提交**（**3 个提交**：Rust 四段 / 前端接线 / 读端 + 验收）
  ```powershell
  cd app; npx tsc --noEmit
  cd app/src-tauri; cargo test --test app_lib_tests
  cd ..; node scripts/check-command-registry.mjs   # 期望 311/311/0
  node scripts/line-limits.mjs --full
  ```

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **registry = 311/311/0**（C0.3 的批 7 终值） | **M1**：只加 `#[tauri::command]` 不加注册行 | **M1 后期望**：`定义 311 / 注册 310` + `漏注册 1 条` + exit 1 |
| **V2** | **验收「选完档位 → 关闭并重开会话 → 档位仍在」的机器判据**（C3.1 逐字要求"若真机不可测，须写明用哪条机器判据代替"）：<br>🔴 **代替品** = ① Rust 侧「`remember_video_profile_tier` 写入 ⇒ `save` ⇒ **重新 `load` 同一文件** ⇒ `lookup_tier(同标题)` **返回同一档**」的**内存库/临时文件单测**（**这是"跨会话"的机器等价形态**：新进程 = 新 `load`）② 前端侧 `changeTier` 的 `invoke` 载荷断言 | **M2**：把 `remember_tier` 的 `save` 去掉（只改内存） | **M2 后期望**：① 的「重新 `load` 后仍是同一档」红（**这就是"跨会话记住"的具名断言**） |
| **V3** | **`start_live_session` 的五参兼容**：既有四参调用点**零改动**；新参数缺省 ⇒ **行为与今天逐字相同** | **M3**：把 tier 变成**必填** | **M3 后期望**：既有调用点 `tsc` 报错 / Rust 侧签名不匹配 ⇒ 红 |
| **V4** | **与 `update_live_profile` 严格区分**（C3.1 逐字）：探针证明两条命令的**语义面不重叠**（`update_live_profile` 改运行中会话参数、`remember_video_profile_tier` 只写记忆文件、**不碰运行中会话**） | **M4**：让 `remember_video_profile_tier` 顺手调 `update_live_profile` | **M4 后期望**：探针/评审报「两条命令语义重叠」⇒ 红 |
| **V5** | **旧 JSON 零迁移**：喂一份**不含 tier 字段**的旧 `profile_memory` JSON ⇒ `load` **不失败** + `lookup_tier` 返回 `None` | **M5**：给新字段去掉 `#[serde(default)]` | **M5 后期望**：`load` 失败 / 单测红 |
| **V6** | **读端接线是真的**：`video_profile_for_spec` 在前端有 **≥1 生产调用点**（`sites.mjs` 实测 PROD ≥1） | **M6**：只在注释里提它 | **M6 后期望**：探针 PROD = 0 ⇒ 红 |
| **V6′** | 🔴 **§C11.4 的角色变更落地**：① 前端映射**仍存在**（`KIND_TO_FORM` / `KIND_TO_TIER` 的**定义与生产调用点都还在** —— 探针给命中数与行号）；② 后端返回值**优先**（离线/失败才回落本地映射：探针或单测证明"后端可用 ⇒ 用后端值"）；③ **T21 的规格回写含逐字句「并行真源 → 离线降级路径」** | **M6′**：把前端映射整段删掉（= 去掉兜底） | **M6′ 后期望**：① 的探针报「映射没了」⇒ 红（**"兜底必须留"的具名断言**，AGENTS.md §3.4） |
| **V7** | **文案不再说谎**：`ProfileDetector.tsx` 的 `tierNotice` 文案与 `TODO(后端)` 都已更正（探针：该文件不含 `TODO(后端)`、不含「仅本次会话生效」） | **M7**：保留旧文案 | **M7 后期望**：探针命中 ⇒ 红 |
| **V8** | **`:45` 的散文 = registry 读数**（同批） | **M8**：留成 310 | **M8 后期望**：T11 的探针报不等 ⇒ 红（**T11 的探针正是为这条造的**） |
| **V9** | `line-limits --full` **exit 0** · `useLiveCaptureControl.tsx` ≤300 | — | 逐字读数 |
| **V10** | 🔴 **§10 额外审查点名**：报告逐字含「本任务改动 `app/src-tauri/src/app_commands.rs`（AGENTS.md §10 的 Tauri command 注册/IPC 安全边界）」 | — | 手工核对 |

**提交信息**（3 个）：`feat(live): 档位通道四段落地并新增记忆命令`（**subject 24 字**）· `feat(classroom): 前端接线档位记忆并更正提示文案`（**subject 26 字**）· `feat(video): 读端采用后端档位规格作为单一真源`（**subject 26 字**）

**诚实边界**：① 🔴 **「档位跨会话记住」的机器判据是本计划设计的代替品**（C3.1 授权"若真机不可测，须写明用哪条机器判据代替"）—— 它的**等价性论证**：新进程 = 新的 `ProfileMemory::load(同一路径)` ⇒ 单测里的"重新 load"是**同一语义**；**但**它**不覆盖**「真实关闭窗口 + 重启应用」的路径（真机不可达，C6.4）；② **tier 记忆的键规则**（是否复用 `memory_key` 的 series 剥离）**由实施者读码定**并**必须**给论证（recon-a 未给这条的裁决）；③ 🔴 **读端接线的形态已裁（§C11.4）**：**后端 `video_profile_for_spec` 为读端真源 + 前端映射降级为兜底**（**不得删前端映射**）；**角色变更必须逐字登记**（报告 + T21 的规格回写）；**若实施者认为本地双写不可动 ⇒ STOP**；④ **`ProfileMemory` 的形态选择（独立通道 vs 折进 `entries`）是本计划给的建议**，实施者可换但**必须论证**；⑤ 「档位真的生效」的**采样策略层面**（`profile_for_spec` 返回的采样/OCR/存储参数是否真的被采集链路消费）**本任务不验证** —— 那要看 `start_live_session` 的 params 装配，**报告须如实说明验证到了哪一层**。

---

### Task 20: 低置信第 2 点 + 采集期显影 + 规格章两篇 + 补 UI 全做（C9.1 的名单逐条）

> **依据**：C4.2 的 `lowConfidenceClass` 行「留 + **加宽到 ≥2 生产调用点**」+ C9.16 的 7b 半（挂 `useRevealChoreography`）+ C9.17（带证据三轨**只交规格**）+ C9.18（审校模式**只交规格定义**）+ **C10.5（补 UI ⇒ 全做；无落点者必须由计划先给出「展示面设计 + 验收判据」）**。

**目标**：五件事：① 低置信第 2 个生产调用点（含「低置信点线」视觉形态）；② 采集期逐段显影；③ 规格 §4.3 的**审校模式定义**章；④ 规格的**带证据三轨**章；⑤ **10 条补 UI 逐条落地**（每条带展示面设计 + 验收判据）。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `motion-coverage.test.ts:103` 的 `BASE_CLASSES` `toHaveLength(12)` | **12** | 🔴 **不许缩水** | 🔴 **本任务不新增基类**；「低置信点线」的视觉形态**必须复用** `.ed-text--low-confidence`（**已有规则**在 `Text.css:63-66`）或 `<已有基类>--<修饰>` 形状 | ⚠️ **是**（若加基类） |
| `motion-coverage.test.ts` 的「每处 `animation` 声明必进名单」 | 绿 | — | 若新增 `animation` 声明 ⇒ **必须同批**进 `motion.css` 的 reduced-motion 名单 | ⚠️ **是** |
| `FROZEN_MUTED_GRAY_BY_FILE` / `FONT_OOB_BY_FILE` 的 10 条落点文件 | 见下方逐条表 | 只许降或持平 | 新 UI 一律走 `Text` 的 tone/size 档；**零 `#9ca3af`**；**零越界 `fontSize`** | ⚠️ **是**（若新增） |
| `FROZEN_NATIVE_BUTTON_BY_FILE` 的各落点文件 | 见下方逐条表 | 只许降或持平 | 新按钮一律 `Button` 原语 | ⚠️ **是**（若新增原生 `<button>`） |
| `buttonMigration` 的 `MIGRATED_SITES=99` | **99**（35 文件） | 🔴 **往那 35 个文件里加 `<Button>` ⇒ 必须同提交同步形状表 + 总数**（C9.8） | 逐条核算 10 个落点**是否在 35 文件名单内** | ⚠️ **是**（若在且加了 `<Button>`） |
| `FROZEN_SURFACE_TAG_TOTAL` | 14（9 legacy） | 按 C9.5 三步 | 若新 UI 用 `<Surface>` ⇒ 同批登记 | ⚠️ **是** |
| `FROZEN_RED_TOTAL` | 113（66 键） | 双向钉死 | 新 UI 的错误行走 `StatusLine` | ⚠️ **是** |
| `emptyStateRatchet` 的 `FROZEN_REST_TOTAL=5` | **5** | 恰等于实测 | 新 UI 的空态走 `EmptyState`；**不得**写 8 词表里的词 | ⚠️ **是** |
| `loadingRatchet` 的 `FROZEN_LOADING_TEXT_TOTAL=8` | **8** | 上界 | 新 UI 的加载态走 `Loading` / `Skeleton` | ⚠️ **是** |

**Files（逐条给落点 + 展示面设计 + 验收判据 —— C10.5 逐字要求）**

**（A）低置信第 2 点 + 采集期显影**

| # | 事项 | 落点 | 展示面设计 | 验收判据 | 该文件的冻结键（现值/上限） |
|---|---|---|---|---|---|
| A1 | **低置信第 2 个生产调用点**（C4.2 的"≥2"） | `app/src/views/session/SessionTriTrackView.tsx`（**297**，余 3） | 三轨对齐视图的**转写轨行文本**上加 `lowConfidenceClass(seg.confidence)`（R12.4 的原定落点） | `sites.mjs lowConfidenceClass` 的 PROD 命中 **≥2 个文件**（正控：今天 = 1） | nativeButton 实测 **无键** · 边框 **无键** · 圆角 **无键** ⇒ 🔴 **新代码零字面量** |
| A2 | **「低置信点线」视觉形态** | `app/src/ui/primitives/Text.css`（**66**） | **复用既有** `.ed-text--low-confidence` 的 `animation: ed-unconfirmed-breathe`（`:63-66`）；如需"点线"再加一个**修饰类**（`--` 形状） | `motion-coverage.test.ts` 全绿（基类 12 不变 + 每处 `animation` 选择器进名单） | 🔴 **`.css` 不在行数门禁视野** |
| A3 | **采集期逐段显影**（C9.16 的 7b 半） | T6 拆出的 `app/src/components/LiveTranscriptStream.tsx` | 每行挂 `ref` + `useRevealChoreography`（**落新件，不落主件**） | 新件的逐行 `ref` 与 `data-seg-id` 结构锚点存在；`useRevealChoreography.test.tsx`（**298**，净增 ≤ +2）覆盖 | 新件**无键** ⇒ 🔴 零字面量 |

**（B）规格章两篇（**只交规格，实现转批 8** —— C9.17 / C9.18 / C9.10）**

| # | 事项 | 落点 | 内容（逐条） | 验收判据 |
|---|---|---|---|---|
| B1 | **带证据三轨规格章**（C9.17） | `docs/superpowers/specs/2026-09-11-frontend-redesign-design.md` 的 §7.2 / §11-6 附近**新增一节** | ① E1/E2/E3 三条验收口径改写（**E2 降级为 ms 最近邻**：容差 / tie-break / 失配显式标记）② **两个分母**（派生段落总数 / 带锚点段落数）③ **无锚点四类各一份 fixture**（`OcrDirect` / `Web` / 手动笔记 / `anchor_timestamps=false`，**关闭开关的用例必须有**）④ 精修前后两态写成**契约**（含 `anchor_strip.rs` 只回挂章节锚点）⑤ 段落无稳定 id 的根因与**"段级身份"路径触及红线 6**的登记 | 🔴 **逐字写「本批只交规格，实现未做」**；**不得**出现「笔记 3 视图已交付」；`NoteEvidenceTrack*` 全仓 **0 命中**的实测读数进章 |
| B2 | **审校模式规格定义**（C9.18） | 规格 §4.3（`:214-230`）**就地加注** | **入口**（哪个面、怎么进）· **作用域**（全站 / 当前阅读面）· **退出** · **`data-*` 形态**（照 `data-motion` / `data-tone` 范式）· 「全部升到 ≥4.5:1」的实现层（CSS 层一次性覆盖 `--ed-ink-4` → `--ed-ink-3`） | 🔴 **逐字写「未实现」**并登记为批 8 输入；`ink-4` 生产调用点 **0**（正控 `ink-3` = **201**）的实测读数进章 |

**（C）10 条补 UI（C9.1 的逐字名单 + C10.5 的"全做 + 展示面设计 + 验收判据"）**

| # | §9 # | 命令 | 规格说的落点（逐字） | **展示面设计**（本计划给的） | **验收判据** | 落点文件（行数 / 冻结键现值） |
|---|---|---|---|---|---|---|
| C1 | 25 | `update_note_tags` | 「**标签可写**；全仓现无任何写 `notes.tags` 的生产路径」 | **T18 已做**（标签编辑器） | `sites.mjs` PROD ≥1 | `NoteTagsEditor.tsx` / `NoteHeaderActions.tsx` |
| C2 | 45 | `set_tag_color` | 「标签线」 | **T18 已做**（设色） | 同上 | 同上 |
| C3 | 19 | `reset_tag_color` | 「标签线；与 `set_tag_color` **成对处理**」 | **T18 已做**（清色） | 同上（**成对**） | 同上 |
| C4 | 28 | `video_profile_for_spec` | 「档位通道的读端」 | **T19 已做**（读端成为单一真源） | `sites.mjs` PROD ≥1 | `ProfileDetector.tsx` |
| C5 | 34 | `analyze_session_command` | 「会话详情「重新分析」」 | 🔴 **无既有展示面**（recon-a §A5⑦：前端 `SessionAnalysis` **0 命中**）⇒ **最小可交付** = 会话详情头加一个 **「重新分析」按钮** + **分析结果面板**（`SessionAnalysis` 出参的前端类型 + 一个只读展示块：章节/重点/术语三段），复用 `session-detail/**` 的既有卡片容器 | ① 按钮存在且 `invoke("analyze_session_command")` 载荷正确 ② 结果面板渲染出**后端返回的三段**（mock 一个 `SessionAnalysis`） ③ 失败走 `StatusLine kind="error"` | `components/session-detail/SessionDetailHeader.tsx`（实测 nativeButton **2** / 上限 2 ⇒ 🔴 **必须用 `Button` 原语且不得新增原生按钮**；若必须新增 ⇒ **先换掉既有 2 个原生按钮**再腾位）· 新建 `components/session-detail/SessionAnalysisPanel.tsx` |
| C6 | 37 | `delete_session_images_all` | 「整场图集批量删（现只能单张）」 | 会话详情的**图集区**加「删除本场全部图片」按钮 + `ConfirmDialog` 二次确认（**既有原语**） | ① 按钮存在 ② 点它**先弹 `ConfirmDialog`** ③ 确认后 `invoke` 载荷正确、取消则不调 | `components/session-detail/SessionScreenCards.tsx`（**193**，nativeButton **1** / 边框 **2**）或 `ImageGallery.tsx`（**T7 已给它做 Surface 迁移 ⇒ 顺序：T7 → T20**） |
| C7 | 39 | `finish_session` | 「恢复动作「结束会话」（崩溃后卡在录制态的收尾通道）」 | **采集态**的恢复提示条（`components/ClassroomCapturePanel.tsx` 或 `session-detail` 的 stale 提示）上加「结束会话」按钮 —— 🔴 **触发条件必须是机器可判的**：`live_session_status` 返回 **active 但无心跳**（或前端已知 stale）时才显示 | ① 按钮**仅在 stale 条件为真时渲染**（两个方向各一条断言：真 ⇒ 有、假 ⇒ 无） ② `invoke("finish_session")` 载荷正确 | `components/ClassroomCapturePanel.tsx`（**297**，余 3 ⇒ 净增 ≤ +3）或新建 `components/StaleSessionRecoveryBar.tsx`（**推荐新建**，零行数压力） |
| C8 | 40 | `get_decision` | 「决策日志单条详情 —— 顺带修审计 H7」 | 决策日志的**单条展开详情**（知识体系页的决策列表里点条目 ⇒ 展示 `get_decision` 的完整字段） | ① 点条目 ⇒ `invoke("get_decision", { id })` ② 详情面板渲染字段 ③ 🔴 **H7（§C11.7 已裁）**：**授权只读** `docs/tech-debt/review-2026-09-11.md` **取 H7 的原始描述**（**「读」不是「处置」**，C7.3 的"不处置"不变）；**边界**：(a) 读到的内容**不得外泄进任何入库文档** —— 引用**只写「H7」与该条原文的必要片段**，**不得整段搬运**；(b) 若 H7 的范围**超出 `get_decision` 的详情面** ⇒ **只做 `get_decision` 那部分**，其余**逐字登记为批 8 输入**（**不是**整条审计的清理许可）；(c) 若那份文件里**也**找不到 H7 ⇒ **STOP 报控制方** | `components/KnowledgeDetailPanel.tsx`（**298**，余 2 ⇒ 🔴 **推荐新建** `components/DecisionDetailPanel.tsx` 或落到知识页的既有决策区） |
| C9 | 42 | `refine_session` | 「会话详情「手动精修」（UI 现只调 auto 版）」 | 会话详情的精修区加**「手动精修」**入口（与既有 auto 版**并列**，不替换） | ① 入口存在 ② `invoke("refine_session")` 的载荷与 auto 版**可区分**（断言两者的 `invoke` 命令名不同） | `components/RefineLaunchDialog.tsx`（**299**，余 1 ⇒ 🔴 **净增必须 = 0**：就地改写）或 `components/session-detail/SessionRefineSection.tsx`（实测 nativeButton 3 / 上限 3 ⇒ 🔴 **必须用 `Button` 原语且不得新增原生按钮**） |
| C10 | 47 | `update_knowledge_system` | 「体系改名 / 核心问题 / 状态 —— 最明确的功能缺口」 | 知识体系详情页的**体系标题区加「编辑」入口** ⇒ 一个编辑浮层/面板（名称 + 核心问题 + 状态三字段） | ① 入口存在 ② 提交后 `invoke("update_knowledge_system", { id, name, coreQuestion, status })` 载荷正确 ③ 成功后详情刷新 | `components/KnowledgeDetailPanel.tsx`（**298**，余 2 ⇒ **净增 ≤ +2** 或新建浮层件） |
| C11 | 46 | `update_fragment_group` | 「REQ-201 声称已接线但实际无调用方 —— 需同步修正记录」 | 片段（fragment）的**归组入口**：`FeedFragmentList` 的片段行加「移动到组」菜单 | ① 菜单存在 ② `invoke("update_fragment_group", { id, groupId })` 载荷正确 | `components/FeedFragmentList.tsx`（**297**，余 3 ⇒ 净增 ≤ +3） |
| C12 | 14 | `kb_search` | 「**⌘K 的数据源**」 | **已交付**（批 3 T12） | `sites.mjs` PROD **2**（实测） | — |

> **⇒ C1–C12 = 12 条，其中 C1/C2/C3/C4/C12 已在 T18/T19/批 3 交付 ⇒ 本任务实做 = C5–C11 共 7 条**（**对齐 C9.1 的"10 条"**：10 = C1/C2/C3 + C4 + C5/C6/C7/C8/C9/C10/C11 里的 6 条…… ⚠️ **口径说明**：C9.1 的 10 条 = `reset_tag_color` / `update_note_tags` / `video_profile_for_spec` / `analyze_session_command` / `delete_session_images_all` / `finish_session` / `get_decision` / `refine_session` / `set_tag_color` / `update_fragment_group` / `update_knowledge_system` **去重后恰 10 条**（`update_note_tags` 与 `set_tag_color` 同属标签线但**各算一条**）⇒ **本任务的实做 = 其余 7 条**（C5–C11）+ T18 的 3 条 + T19 的 1 条 = **11 条**…… 🔴 **见下方口径核账**）

**🔴 口径核账（本计划者实测，必须进报告）**：C9.1 逐字列的 10 条 = `reset_tag_color`(#19) · `update_note_tags`(#25) · `video_profile_for_spec`(#28) · `analyze_session_command`(#34) · `delete_session_images_all`(#37) · `finish_session`(#39) · `get_decision`(#40) · `refine_session`(#42) · `set_tag_color`(#45) · `update_fragment_group`(#46) · `update_knowledge_system`(#47) —— **数一数是 11 个名字**。
⇒ 🔴 **本计划按「名字」列全 11 个**（不删任何一个），并在报告里**逐字登记**这个计数口径（C9.1 说"10 条"，逐个列名出来是 **11 个命令名**）⇒ **不自行删减**（C9.1 的"不许把规格的 12 直接改写成 10 而不留痕"同理适用）。

- [ ] **Step 1: A 组（低置信第 2 点 + 采集期显影）** —— 逐条按上表做，每条**先跑门禁再进下一条**。
- [ ] **Step 2: B 组（规格章两篇）** —— 🔴 **只写规格**；每篇**必须**逐字含「本批只交规格，实现未做」+ 实测读数（`NoteEvidenceTrack*` 0 命中 / `ink-4` 0 命中 + `ink-3` 201 正控）。
- [ ] **Step 3: C 组（C5–C11 共 7 条）** —— 🔴 **逐条单独提交**（7 个提交），每条**先给该落点文件的冻结键预算表**（C9.12）。
- [ ] **Step 4: 跑门禁**（每条提交前跑 `tsc` + 相关测试 + `sites.mjs` 的该命令探针）

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **低置信 ≥2 生产调用点**（C4.2 逐字）：`sites.mjs lowConfidenceClass` 的 PROD 命中 **≥2 个文件** | **M1**：把 `SessionTriTrackView` 的那行 `className` 删掉 | **M1 后期望**：PROD 文件数回落到 1 ⇒ 红（**"加宽到 ≥2"的具名断言**） |
| **V2** | **`motion-coverage.test.ts` 全绿**（基类 12 不变；每处 `animation` 选择器进名单） | **M2**：给「低置信点线」起一个**新基类** `.ed-lowconf-line` | **M2 后期望**：`:103`/`:117` 红（**"不许新增基类"的具名断言**） |
| **V3** | **采集期显影的结构锚点**：新件里逐行 `ref` + `data-seg-id` 存在 | **M3**：把 `ref` 挂到主件而不是新件 | **M3 后期望**：结构探针报「新件无 ref」⇒ 红 |
| **V4** | **规格章 B1/B2 的逐字要求**：B1 含「本批只交规格，实现未做」+ 四类 fixture 名 + 两个分母；B2 含「入口/作用域/退出/`data-*` 形态」+ 「未实现」 | **M4**：把 B1 的「无锚点四类」少写一类 | **M4 后期望**：探针（按 4 个类名 grep）报缺 1 类 ⇒ 红 |
| **V5** | **7 条补 UI 各 ≥1 生产调用点**（`sites.mjs` 逐条 PROD ≥1） | **M5**：只写按钮不调 `invoke` | **M5 后期望**：该条的探针 PROD = 0 ⇒ 红 |
| **V6** | **每条补 UI 的落点冻结键不涨**（逐条给预算表 + `frozen.mjs` 实测） | **M6**：在某落点加一个原生 `<button>`（该文件已满） | **M6 后期望**：`nativeButton.ratchet.test.ts:203-214` 红 |
| **V7** | **`buttonMigration` 的形状表同步**（C9.8）：10 个落点里**凡在 35 文件名单内且加了 `<Button>`** ⇒ `BUTTON_SHAPES` 与 `MIGRATED_SITES` 同批同步；报告给逐条 diff | **M7**：在 35 名单内的文件加 `<Button>` 而不同步形状表 | **M7 后期望**：`:249-252` 报 diff ⇒ 红 |
| **V8** | **`C7`（`finish_session`）的触发条件是机器可判的**：stale 真 ⇒ 有按钮；假 ⇒ 无（两个方向各一条断言） | **M8**：把按钮改成恒渲染 | **M8 后期望**：反方向断言红 |
| **V9** | **`C8` 的审计 H7**（§C11.7）：报告逐字含 **H7 的原始描述的必要片段**（**只写「H7」+ 片段，不整段搬运**）+ 修法 + 「**超出 `get_decision` 详情面的部分**」的批 8 输入登记（若有） | **M9**：写「H7 已修」但不说是什么（**或**把整段审计原文搬进入库文档） | **M9 后期望**：评审按「无原始描述」或「越界搬运」判不合格 |
| **V10** | `line-limits --full` **exit 0** · `tsc` **0 错** · registry **311/311/0**（本任务不加命令） | — | 逐字读数 |

**提交信息**（约 9–10 个）：A 组 2 个 + B 组 2 个（规格章）+ C 组 7 个

**诚实边界**：① 🔴 **C10.5 逐字要求"无落点者必须由计划先给出展示面设计 + 验收判据"** ⇒ 上表 C5–C11 的"展示面设计"**全部是本计划新造的**（规格只给了"重新分析""批量删""结束会话"这类**意图**）⇒ **它们是设计决定，不是裁决** ⇒ 报告须逐字声明并请控制方把关；② 🔴 **`get_decision` 的"顺带修审计 H7"已裁（§C11.7）**：**授权只读** `docs/tech-debt/review-2026-09-11.md` 取 H7 原文（**只读，不是处置** —— C7.3 的"不处置"不变）；**引用只写「H7」+ 必要片段、不得整段搬运进任何入库文档**；**超出 `get_decision` 详情面的部分逐字登记为批 8 输入**；🔴 **在那份文件里也找不到 H7 ⇒ STOP 报控制方**；③ **7 条新展示面的观感一律未测**（像素类归批 8，C6.4）；④ **`analyze_session_command` 的最小可交付是本计划定的**（"重新分析按钮 + 三段结果面板"）⇒ 它的**充分性由控制方判**；⑤ 🔴 **计数口径**：C9.1 说"10 条"，逐个列名是 **11 个命令名** ⇒ 本计划**全列不删**并在报告里登记（见上「口径核账」）；⑥ **容量**：本任务 7 条新展示面 + 2 篇规格章 + A 组 3 项 = **本批最大的一节**；若容量不足 ⇒ 按 C10.5 逐字**优先牺牲"新造展示面"的条数并回报控制方**，**不许**牺牲标签线 / 档位通道 / markdown 归一。

---

### Task 21: 规格回写（C6.3 六件 + C9.10 的逐字对照 + C10.6 的历史留痕）

> **依据**：C6.3 逐字六件 + C9.10（**必须可机器核对**：同一提交带「改了哪几行、原文是什么」的逐字对照 + `docs-check`/`line-limits` 读数同批给出；**只写意图不给对照 = 不算交付**）+ C6.3 的「**不改历史原文**」。

**目标**：把批 7 的全部规格面回写做完，**全部用「原文 + 就地加注」形态**。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| `docs-check` 的 280/180 | **280 / 180** | 只许更好或持平 | 新增/修改的 `.md` 会改变扫描数 ⇒ **必须解释差额** | ⚠️ **是**（若对不上） |
| `line-limits --full` | **0 / 121 / 121**（T6 后） | 只许更好或持平 | `docs/**` 不在行数门禁域 | **否** |
| 规格文件行数（**940**） | 940 | `.md` 不受门禁 | 加注会增行 ⇒ **报告给新读数** | **否** |

**Files:**
- 改 **`docs/superpowers/specs/2026-09-11-frontend-redesign-design.md`（940）**
- 改 **`docs/versions/v0.22.md`**（新增「批 7」节，**同七段结构**）
- 改 `docs/standards/`（若 T9/T10 未落）

- [ ] **Step 1: §10 批 7 行（`:722`）—— 含 C4.1 的逐导出授权逐字**
  在 `:722` 的验收列后就地加注：
  > **🔻 批 7 收口就地加注（2026-09-13，上格原文一字未改）**：`structuredBlocks` 的"二选一"**由控制方按**「**逐导出裁决**」（第三条路）执行 —— **这不是绕过二选一，而是二选一在两个粒度上各自取正解**：① `escapeHtml`（**`:13`** 的**再导出**，真源在 **`utils/html.ts:11`**）⇒ **只摘 import 与再导出，真源一个字不动**；② `renderLatex` / `renderMarkdownTable`（唯一消费者是它们自己的测试）⇒ **删**；③ `lowConfidenceClass`（唯一生产消费者 **`session-detail/SessionRawView.tsx:138`**，import 在 `:50`）⇒ **留 + 加宽到 ≥2 生产调用点**（顺带兑现批 6 R12.4 环境层第 ③ 件的「≥2」）。**本加注即控制方的明文授权**（依据 `rulings.md` §C4.1/§C4.2）。
  **【逐字对照】**：改前行 = `…二选一，**批 1 未决前不得删**）`；改后 = 同一行 + 上述引用块（**原文零改动**）。

- [ ] **Step 2: §11-7 的批 7 收口注（`:824`）—— registry 313 → 311、零引用 24 → ?**
  > **进度（批 7 收口，2026-09-13）**：registry **313 → 311**（−3 撤下 IPC + 1 新增 `remember_video_profile_tier`）· 前端零引用 **24 → ?**（**实测值见收口报告**；`kb_search` 已交付的 1 条不计入）· **本次加注不改上格原文**。

- [ ] **Step 3: §12 的 markdown 归一去向（`:864` + `:870-875` 的批 5 加注后）**
  > **🔻 批 7 收口就地加注 · 「3 套 markdown 渲染器归一」的去向终态（2026-09-13，上表与批 5 加注原文一字未改）**：**批 7 已完成归一**，形态 = **C10.1 的「两支手写链合成一支 + #2 并入 #1」**：新建 `utils/markdownLine.ts`（#3 `refineDiff.ts` 的 `mdLineHtml` + #4 `NotePreviewView.tsx` 的 `renderMarkdown` **合成一支**，两模式逐字保留原样式 ⇒ 零观感变化）· `ChatMessageMarkdown` **并入** `NoteMarkdown` 后删除（**站点 2 → 1、插件站点 8 → 4**）· `structuredBlocks` 按 §C4。**终态 = 2 套活**（`NoteMarkdown` + `markdownLine`）。🔴 **未做**：把两支手写链换成 react-markdown（**禁止** —— 它们是给 `dangerouslySetInnerHTML` 的串生成器，换 = 改 DOM 形态/样式/安全面，而 #4 无回归网）。
  🔴 **本加注必须逐字含这一句（§C11.1 第 ③ 条）**：「**归一 = 逻辑归一；观感统一未做，归批 8**」（§C11.1 逐字要求「报告与规格回写里逐字写」）。
  **🔴 并且必须补上规格加注漏点（C4.3）**：上格与批 5 加注把「第 4 套」记作 `refineDiff.ts:78 mdLineHtml`、把 `structuredBlocks.ts` 记作「第 5 套」，**漏点了 `NotePreviewView.tsx:40 renderMarkdown`（346 行、无测试面）** —— 它才是 `NotePreviewView` 那条独立渲染链的真身。**本加注补上这个漏点**。

- [ ] **Step 4: §9 表内 #14 与 #46 的**状态更正注**（C9.1）**
  - `#14 kb_search` 行后就地加注：`> **🔻 状态更正（2026-09-13）**：本行的「补 UI（本批）」**已在批 3 Task 12 交付**（`kbCommands.ts:116` → `useKbPaletteSearch.ts:61` → `CommandPalette.tsx:127`，提交 `b567f0e6`，带 9 条用例）。**原文保留**（本行是规格原文，批 8 对账须能看见「规格写 12、实做 10」的差额来源）。`
  - `#46 update_fragment_group` 行后就地加注：`> **🔻 状态更正（2026-09-13）**：本行的「需同步修正记录」**已在批 1 完成**（`docs/product/requirements-pool.md:337` 含 2026-09-12 批 1 更正）。**批 7 只做"接线"那一半**（命令本身的生产调用点）。`
  - 🔴 `#30 video_profile_spec_by_kind` 行后就地加注（**§C11.4 的「角色变更逐字登记」**，**必需**，否则事后读 #30 的删除理由会与代码矛盾）：`> **🔻 角色变更登记（2026-09-13，批 7 T19）**：本行当年删除 `video_profile_spec_by_kind` 的理由是「前端已有 KIND_TO_FORM / KIND_TO_TIER **双写**」。批 7 把读端接到后端 `video_profile_for_spec`（#28）之后，那张前端映射的**角色从「并行真源」变成「离线降级路径」（兜底）** —— **它仍然存在、也仍有生产调用点**（AGENTS.md §3.4 要求本地兜底路径必须留），**不是被删除**。⇒ 本行的删除理由**在"真源"这一层不再成立，在"兜底"这一层仍成立**；原文保留，本注为准。`

- [ ] **Step 5: §9 `:694` 的「仅 `lib.rs` 的 `generate_handler!`」更正**
  > **🔻 就地更正（2026-09-13）**：注册清单**已搬到 `app/src-tauri/src/app_commands.rs`**（批 0-C3；`check-command-registry.mjs:22` 的 `DEFAULT_REGISTRY`），`lib.rs` 里已无 `generate_handler!`（`line-limit-exemptions.md:26` 自证）。**本行的"仅 `lib.rs`"按 `app_commands.rs` 读**；原文保留。

- [ ] **Step 6: `v0.22.md` 新增「批 7 · 未接线落地」节（**同七段结构**）**
  七段 = 交付 / 验收（三条 + 八门禁终态）/ 规格漂移纠正 / 过程中纠正的计划错误 / 诚实代价 / 未做登记（逐条带归属批次）/ 提交清单。
  🔴 **必须含**：① `structuredBlocks` 的逐导出裁决与**用例净 −7 的说明**（**非 LOST**）② **`[[ts:ms]]` 的残余**（**若 `RefineWorkbench` 侧仍不可点 ⇒ 逐字登记**；C10.2 期望它不再算残余 ⇒ **以实测为准**）③ **`docs/tech-debt/`** 的归因（C7.3 逐字：它是**用户所有**的）④ **音频两条 = 待产品裁决** ⑤ **本批未做清单**（R4.1 的 5 个粘滞字段形态 / 带证据三轨的实现 / 审校模式的实现 / §13 的其余登记）⑥ 🔴 **「归一 = 逻辑归一；观感统一未做，归批 8」**（§C11.1）⑦ 🔴 **读端角色变更**（§C11.4：「并行真源 → 离线降级路径」）⑧ 🔴 **散文对拍探针登记为「批 8 的候选闸」**（§C11.8 第 ③ 条：`scripts/check-exemption-prose.mjs` 已入库但**不入八闸/CI/husky**）⑨ 🔴 **`get_decision` 的 H7 结果**（§C11.7）：做了哪一部分 · 超出详情面的部分**逐字登记为批 8 输入**（**只写「H7」+ 必要片段**）。
  🔴 **`line-limits --full` 与 `docs-check` 的读数必须同批给出**（C9.10 逐字）。

- [ ] **Step 7: 逐字对照表 + 门禁读数同批提交（C9.10 的硬要求）**
  🔴 **每个回写点必须先给「改了哪几行、原文是什么」的逐字对照**（写进报告；报告是 gitignored ⇒ **durable 的形态 = 在规格里用「原文 + 加注」**，即**原文本身就在文件里**）⇒ **这就是 C9.10 的"可机器核对"的落地**。
  ```powershell
  node scripts/docs-check.mjs
  node scripts/line-limits.mjs --full
  ```

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | **C6.3 六件逐条到位**（探针按标题/关键词 grep 规格）：§10 授权逐字 · §11-7 收口注 · §12 归一去向 · §9 #14/#46 更正 · 第 4 套渲染器补登 · §9 `:694` 更正 | **M1**：删掉「第 4 套渲染器」那一句 | **M1 后期望**：探针报缺 1 件 ⇒ 红 |
| **V2** | **不改历史原文**（C6.3 逐字）：`git diff` 的规格改动**只有新增行**（`+`），**没有任何 `-` 行** | **M2**：顺手把 `:722` 的「12 条补 UI」改成「10 条」（**C9.1 明令禁止不留痕的改写**） | **M2 后期望**：diff 出现 `-` 行 ⇒ 红 |
| **V3** | **`docs-check` exit 0** + 五项全 ✅；扫描/检查数与基线逐字对账（差额须解释） | — | 逐字读数 |
| **V4** | **`line-limits --full` exit 0** 且与 T12/T19 后的读数一致 | — | 逐字读数 |
| **V5** | **`v0.22.md` 的批 7 节七段齐全**（探针按段名 grep） | **M5**：少写「诚实代价」段 | **M5 后期望**：探针报缺段 ⇒ 红 |
| **V6** | **不得出现「笔记 3 视图已交付」**（C9.17 的 R8 防线） | **M6**：写一句「笔记三视图已交付」 | **M6 后期望**：探针命中 ⇒ 红 |

**提交信息**（3 个）：`docs(specs): 回写批 7 的规格面（六件）`（**subject 22 字**）· `docs(versions): 新增批 7 交付记录节`（**subject 18 字**）· `docs(standards): 同步性能规范的懒侧门禁口径`（**subject 20 字**）

**诚实边界**：① **规格回写的"可机器核对"（C9.10）在 gitignored 报告之外的部分，靠的是「原文 + 加注」这一形态本身**（原文留在文件里 ⇒ 对照可复算）⇒ 报告里另给一份更细的逐字对照表；② **`docs-check` 的扫描数变化必须逐条解释**（新增 `.md` 或 `.md` 改名都会改它）；③ **`v0.22.md` 的七段结构的"过程中纠正的计划错误"段必须诚实**（本批已有多处：C9.15 被 C10.1 取代 / C11 的 `NotePreviewView` 形态 / `App.tsx` 的 Step 6 分界 / C9.1 的 10 vs 11 计数）。

---

### Task 22: 全批收口（三条验收兑现度 + 二分清单 + 收口评审）

> **依据**：C6.2（期望终态 = registry **311/311/0**；其余八闸只许更好或持平）+ C6.4（诚实边界）+ C6.1（门禁串行）+ C7.1（**本任务才是全批收口**）。

**目标**：全批八闸终态 + 三条验收的**逐条兑现度** + 「已交付 / 未交付」二分清单 + 收口评审件。

**🔴 冻结值预算表（C9.12）**

| 冻结键 | 现值 | 上限 | 本任务动作 | 是否变红 |
|---|---|---|---|---|
| 全部八闸 | 见门禁基线表 | 🔴 **只许更好或持平** | **只读** | ⚠️ **是**（任何回升须逐条解释） |
| registry | 311（T19 后） | 🔴 **311 / 311 / 0** | **只读核对** | ⚠️ **是**（若 ≠ 311） |
| 用例数 | ≥2125（T3 后 + T7/T20 的新增） | **只增不减** | 逐条对账（LOST / SHRUNK = 0） | ⚠️ **是** |
| 懒侧 gzip | T9 的基线（698.86 kB，`≤`） | 只许降 | **只读** | ⚠️ **是**（若涨） |

**Files:** **0 生产代码**；产出 `tmp/t22/**` + `task-22-report.md` + `closing-review.md`

- [ ] **Step 1: 八闸串行真跑**（同 T12 的表，但**终态**：registry **311/311/0**）
- [ ] **Step 2: 三条验收的逐条兑现度**
  | 验收（`:722`） | 判据 | 兑现度 | 证据 |
  |---|---|---|---|
  | **标签能写进去** | `update_note_tags` / `set_tag_color` / `reset_tag_color` 各 ≥1 生产调用点 + 端到端（jsdom 级） | 见实测 | T18 的 V2/V3 |
  | **档位选完真生效** | `remember_video_profile_tier` 写入 ⇒ **重新 load** 仍是同档（**机器代替品**）+ `start_live_session` 五参兼容 | 见实测 | T19 的 V2/V3 |
  | **`structuredBlocks` 已作出明确裁决** | 逐导出裁决落地 + 规格 §10 行内授权逐字 | 见实测 | T3 + T21 的 Step 1 |
- [ ] **Step 3: 「已交付 / 未交付」二分清单**（**取代中间态声明**）
- [ ] **Step 4: 收口评审件**（`closing-review.md`）
- [ ] **Step 5: 出报告（默认零提交）**

**Verification**

| # | 判据 | 变异体（专属） | 期望 |
|---|---|---|---|
| **V1** | 八闸逐条有「命令 + exit + 逐字读数」 | — | 手工核对（诚实边界） |
| **V2** | **registry = 311/311/0** | **M2**：把新增命令的注册行删掉 | **M2 后期望**：`定义 311 / 注册 310` ⇒ 红 |
| **V3** | **用例数对账**：逐文件对拍开工基线（221 文件 / 2132 用例）⇒ **LOST = 0 · SHRUNK = 0**；`numTotalTests` 的净变化**逐条解释**（T3 的 −7 是**唯一的合法减少**） | **M3**：删掉某个既有测试文件的用例 | **M3 后期望**：LOST > 0 ⇒ 红 |
| **V4** | **三条验收的兑现度逐条给出**（不得笼统声称"已交付"） | **M4**：把「档位选完真生效」写成"已达成"而不给机器判据 | **M4 后期望**：评审按 C6.4 判不合格 |
| **V5** | **懒侧 gzip ≤ 基线**（698.86 kB） | — | 逐字读数 |

**提交信息**：`docs(plan): 批 7 全批收口登记`（**subject 18 字**）—— ⚠️ **默认零提交**

**诚实边界**：① 🔴 **真机/WebView2 冒烟由用户裁决跳过**（C6.4）⇒ 三条验收里**「标签能写进去」与「档位跨会话记住」的真机面未测**；② **像素/观感类一律未测**（归批 8）；③ **懒侧 katex 消失必须以真实构建证明**（C4.3 / C9.15 末条）⇒ 若 T17 的真实构建未跑 ⇒ 写「**未判定**」（C6.4 逐字）；④ 「判据绿 ≠ 体验已验证」。

---

## 陷阱（承批 1–6 的陷阱 + 本批专属，逐条入账）

### B1 · 撤下 IPC 与 registry
- **① 只改一半必红**（C0.1）：只摘属性 ⇒ 「多注册」；只删注册行 ⇒ 「漏注册」。**两处必须同一次改动内**。
- **② `*_inner` 方言的语义陷阱**（C1.1）：本仓的 `<命令名>_inner` 意思是「**命令包装器仍在、内部实现另名**」；撤下场景的语义是「**入口已撤、实现留下**」⇒ **保留原名 + 去属性**，**不得**改名。
- **③ `dead_code` 不许预防性添加**（C1.1）：`cargo build` 实测为准；无告警就不加 `#[allow(dead_code)]`。
- **④ clippy 必须给集合差异**（C1.1 逐字）：`-D warnings` 下 `unused_imports` 会变 error ⇒ 「条数相同」不等于「集合相同」。

### B2 · markdown 归一（本批最深的一条）
- **① 🔴 C10.1 取代 C9.15**：**禁止**把 #3/#4 换成 react-markdown；**`NoteMarkdown` 的 DOM 形态一个字不改**。
- **② 站点判据按行匹配说明符**（`NoteMarkdown.tsx:30-39` 逐字自陈）⇒ **新文件与 `NoteMarkdown` 里都不得新增 `react-markdown` / `remark-*` / `rehype-*` 说明符的 import 行**（否则站点读数虚增、污染 C8 的锚）。
- **③ 先拆后改**：`NoteMarkdown.tsx` 余 5 行 ⇒ **T13 必须先拆**（C10.1 逐字）。
- **④ 顺序不可倒**（C9.3 + C10.1）：**先补表征测试（T16），再迁移（T17）**。**没有回归网不许改 346 行的渲染器**。
- **⑤ 两支链的样式不同**（`### 表 6` X6）⇒ 「合成一支」必须用**两模式**保零观感变化。
- **⑥ `[[ts:ms]]` 的芯片修复只做一次**（C10.2）⇒ 改 `utils/html.ts` 会**同时影响两条链**（这是有意设计，也是排查顺序：意外差异先怀疑 T15）。

### B3 · 包体与懒侧
- **① 懒侧基线只许写实测**（C10.4 逐字）：写一个比今天更小的"预算值" ⇒ **立刻红**。
- **② 族前缀而不是 chunk 名**（C9.6 第 2 条）：chunk 名带内容 hash。
- **③ `manualChunks` 只切文件、一字节不降**（`check-bundle-budget.mjs:205` 逐字）。
- **④ `Δ` 恰为 0 时先当仪器故障**。

### B4 · 棘轮与冻结值
- **① C9.12 的预算法是**硬要求**：算不出「触碰的冻结键 + 现值 + 上限 + 是否变红」⇒ **计划不合格**。
- **② 只许降或持平**（C5.1）：抬任何 `FROZEN_*` 都违规（`<Surface>` 登记制是**唯一**例外，且只许按 C9.5 三步 + C9.8 的实测登记）。
- **③ 禁止只改常量不动逐文件表**（`nativeButton.ratchet.test.ts:203-214` 的逐文件表 + **`buttonMigration.test.ts:272`** 的「常量 == 逐文件 entries 之和」是守卫已有的牙；🔴 **§C5.1 原引的 `nativeButton.ratchet.test.ts:268-273` 是「引错文件 + 越界」** —— 该文件只有 **265** 行、且它自己的 `:196-201` 只是 `总量 ≤ 常量`；**变异体裁定见 `### 表 6b` 的 E-25**）。
- **④ `<Surface>` 的 9 行 legacy「只许降」**（C9.5 逐字）。
- **⑤ `nativeButton` 的总量断言不得改成等号**（C9.7 逐字：会砸掉 `SPLIT_MOVES` 语义）。

### B5 · `App.tsx` 与静态判据
- **① 五条判据把 `App.tsx` 当源码文本读**（`CommandPalette.kb.test.tsx:32` · `CommandPalette.test.tsx:41` · `ShellFallback.test.tsx:30` · `TopBar.test.tsx:47` · `TopBar.persistent.test.tsx:38` · `useNotesDeepLink.test.ts:145` · `navRegistry.test.ts:28` · `shellPhase.guard.test.ts` —— **本计划者的 `app-consumers.mjs` 实测**）⇒ `focus*` 的声明文本与 `go*` 的 `const x = ` 形态**必须留在 `App.tsx`**。
- **② `>300` 的反空真闸**（`useNotesDeepLink.test.ts:148`）⇒ 拆件**不得把 `App.tsx` 压到 ≤300**。
- **③ 首屏面零 `views/**` 边**（`architecture.guard.test.ts:100-103`）⇒ `shell/**` 的新家**不得** import `views/**` / `pages/**`。
- **④ 注释里的 `import … from "…"` 会造幻影静态边**（`engine.guard` 的图遍历不剥注释）⇒ 新家与 `App.tsx` 的注释里**不得**出现该形态。

### B6 · 标签线与档位通道
- **① `NoteHeaderActions.tsx` 的两格已满**（`nativeButton` 2/2 · 边框 1/1）⇒ 入口必须用 `Button` 原语、浮层必须用 token / `<Surface>`。
- **② `NON_MIGRATED_14` 里 5 个 `Note*`** ⇒ 标签线落点必须避开它们全部；`NoteEditView.tsx` 是最自然的落点 ⇒ **恰恰在 14 内**（这就是 C2.1 的落点裁决的由来）。
- **③ `tag_colors` 的 `color NOT NULL`** ⇒ 「插入占位空色」这条路不存在（C0.4）。
- **④ 跨语言色板必须对拍**：Rust 的 12 色 id ↔ 前端 `COLOR_IDS`（否则前端 `paletteHex` 回退默认灰）。
- **⑤ `start_live_session` 的五参兼容**：新参数**必须可选**，既有调用点零改动。
- **⑥ `tierNotice` 的文案会变谎话**：写后端之后「仅本次会话生效」就是假的 ⇒ **必须同批更正**。

### B7 · 域与仪器
- **① 六棘轮的域 = `app/src/**` 的 `.ts/.tsx` 减 `*.test.ts(x)` 减 `ui/primitives/**`**（`emptyState` / `loading` / `nativeButton` 额外减 `ui/icons/**`）⇒ **测试文件在域外**（T16 的新测试不进棘轮）。
- **② `.css` 与 `.mjs` 不在行数门禁视野** ⇒ 别自造门禁。
- **③ `--write` 会连带落库别人的在飞行** ⇒ 本批首选不跑。

### B8 · 承前陷阱（P-1 – P-18 摘要并入）
- **① 全量门禁必须串行**（C6.1）。
- **② 变异体不得与全量测试并发**（负载敏感 flake：6 个已登记 + 3 个瞬时红）。
- **③ 绝不在 `app/src/**` 上「改→跑→还原」**（正解 = 每个变异新解一棵树）。
- **④ `--reporter=basic` 已在 Vitest 4 移除** ⇒ 用它产出的"红"是假证明。
- **⑤ `numTotalTestFiles` 字段不存在** ⇒ 文件数读 `testResults.length`。
- **⑥ `git archive` 必须带 `-c core.autocrlf=false`**。
- **⑦ 导出树里 `--no-build` 必失败**（`dist` 不入库）。
- **⑧ 含空格/中文的路径不能经 `shell:true`**。

### B9 · 本批新增陷阱（本计划者实测/推导）

- **B9-①（🔴 本批最贵的一条 · 行号锚的系统性偏移）**：编制期仪器 `tmp/plan-writer/sites.mjs` 的 `stripComments` **把块注释整段删除**（`s.replace(/\/\*[\s\S]*?\*\//g, "")`）而不是抹成等长空白 ⇒ **它打印的 `:N` 是「剥注释后的行号」** ⇒ **凡引用它的锚一律偏移**（本批已知 24 条，见 `### 表 6b`）。**正确做法**：① 自测行号时**抹注释为等长空白保行号**（先例 `tmp/t2/census.mjs`、`tmp/e1/anchors-baseline.mjs`）；② 一切锚以**冻结提交树**（`git show <BASE>:<path>`）为基准（工作树有在飞改动）；③ 读数口径 `countLines()`；④ 仪器必带**正控 + 负控**。
- **B9-②（🔴 豁免表行数的职责）**：`--full` 的 (e) 判据读**工作树**、husky 也读**工作树** ⇒ **行数列必须由改文件的那个单元在自己提交里更新**（§C14），否则**每个中间提交都撞钩子** ⇒ 会逼出全员 `--no-verify`。`--no-verify` 只在 §C14.3 的四条全成立时可用，**其余钩子失败 ⇒ STOP**。
- **B9-③（🔴 锚点由变异体裁定，不由推理裁定 —— §C17.3）**：**凡写「某变异体的期望红点」这类锚，必须在导出树里真跑那个变异体**，把**实际变红的 `文件:行`** 抄进计划/报告；🔴 **不许**由「哪条断言看起来像」推断。**本批已因此修错两次**（控制方 §C5.1/§C9.7 把 `nativeButton.ratchet.test.ts:268-273` 当等号牙 = 引错文件；E1 第 1 版把它改成同文件 `:199-200` = 也错，那是 `总量 ≤ 常量`）⇒ 真身在 **`buttonMigration.test.ts:272`**（实跑证据：CONTROL 15/15 绿 · MUTANT 14/15，唯一红点 `buttonMigration.test.ts:272:93`）。**做法**：导出树 → 注入（**自证恰 1 次**）→ 跑 → 抄 `文件:行:断言名`；**`ran > 0` 只是旁证**。
- **① 🔴 C9.15 与 C10.1 的形态不同** ⇒ **本计划按 C10.1**；任何实施者若按 C9.15 的"换成 react-markdown"做 ⇒ **违反 C10.1 的"禁止"**。
- **② `NotePreviewView.renderMarkdown` 是**非导出**函数** ⇒ 补表征测试**必须先解决可达性**（T16 选 `export function renderMarkdown`，+0 行）。
- **③ `setViewKey` 会写视图记忆**（`useViewMemory` 写 localStorage）⇒ 自动切三轨**有持久副作用**（见 `## 待控制方裁决` #2）。
- **④ `NoteCardFlowView` 加 prop 会 `TS2769`**（A6 的 tsc 探针）⇒ 第三缺口的**唯一可行形态 = 包装件**（`### 表 6` X7）。
- **⑤ `RefineWorkbench` 没有 `onOpenSessionAt`** ⇒ C10.2 的"两条链同时可点"要求**给它新增一个可选 prop**。
- **⑥ `document`（本计划）与 `rulings.md` 的行号在多处不同** ⇒ **一切行号以实施者动手前的实测为准**（见 `### 表 6` 的 X2）。

### B10 · 常设消歧与纪律
- **① 🔴 「批 7」重载消歧**（C9.0）：全仓 93 处含「批 7」，**~80 处属另一条已落地批次** `REQ-316 / v0.20.12 批 7`（`db_note_group_clean.rs` 151 行 + 447 行测试，**全绿**）；**只有 ~13 处是本批预留点**。⇒ **每次「按字面 grep」结论引用前必须先判定它属哪条批次**；报告引用 grep 结论时**必须**附「来源批次判定」。
- **② `.superpowers/**` 三仪器不可靠**（`grep` 工具 / `git grep` / `git check-ignore`）⇒ **只用 node `fs` 直读**（P-26）。
- **③ `docs/tech-debt/` 是用户所有的东西**（C7.3）：**不处置、不阻塞**；`git status` 恒为一行 `?? docs/tech-debt/`；`docs-check` 的 279/179 vs 280/180 差额**必须归因到它**。
- **④ 一切"0 命中"必须点名仪器 + 双侧自证 + 先剥注释**（R8.7）。

---

## 待控制方裁决（**已全部裁决** · 原 8 条未决项的裁决回收）

> 🔴 **C10.7 逐字**：「**Q1–Q20 全部有裁决，无遗留未决项。**计划里若再出现「待控制方裁决」条目，该条**必须是底稿未覆盖的新问题**，并附「为何底稿未覆盖」。」
> ⇒ 本节**只列底稿（规格 §1/§4.1/§4.3/§7/§9/§10/§11/§12/§14 + `rulings.md` C0–C10）未覆盖的新问题**，并**逐条给出「为何底稿未覆盖」**。**其余全部已裁事项不在本节**（它们的落位见 `### 表 7` 的 Q1–Q20 与 `### 表 8` 的 R/A/C 系列）。
> 🔴 **头注（2026-09-13，E1 勘误单元落库）**：**原 8 条未决项已由控制方在 `rulings.md` §C11.1–§C11.8 逐条裁完**（§C11 逐字：「计划 `## 待控制方裁决` 的 8 条**均属底稿未覆盖的真实缺口**（自陈逐条附「为何底稿未覆盖」，成立）⇒ 逐条裁如下。**裁完之后批 7 无任何未决项。**」）。⇒ 下表的**前五列（#/未决点/为何底稿未覆盖/本计划的默认执行形态/不裁的后果）一字未改，是有效记录**；**第 6 列是控制方裁决**。🔴 **实施者按第 6 列执行**；**任何与第 6 列冲突的"默认执行形态"作废**。**本节新出现的条目必须仍是底稿未覆盖的新问题，并附「为何底稿未覆盖」。**

| # | 未决点 | 为何底稿未覆盖 | 本计划的默认执行形态 | 不裁的后果 | 🔴 **控制方裁决（`rulings.md` §C11，2026-09-13）** |
|---|---|---|---|---|---|
| **1** | 🔴 **`#3` 与 `#4` 合成一支后，两支链的**样式口径**怎么办？** 实测两支链的产物样式**不同**：`NotePreviewView` 用 `font-size:15px/13px/12px` + `margin:10px 0 4px`；`refineDiff` 用 `font-size:14px/13px/12px` + `margin:8px 0 3px` + 一个 `extra` 样式参数 | C10.1 只说「**合成一支**行级 HTML 串渲染器」，**未给样式统一口径**；C9.3 只说「归一对象是渲染器」，也没给样式裁决 | **两模式**（`PREVIEW_MODE` / `COMPACT_MODE`，**各自逐字保留原样式**）⇒ **两条链的可见输出零变化**（`### 表 6` X6） | 若控制方要求"真统一"（一套样式）⇒ **两条链里必有一条的观感变化**（属像素面，批 8 才能验收）⇒ 若不裁，则本批**按两模式交**，统一留给批 8 | **§C11.1 · 批准「两模式」**：`markdownLine.ts` 导出**一支实现 + 两个显式模式常量**（`PREVIEW` / `COMPACT`），**各自逐字保留原样式** ⇒ **两条链的可见输出零变化**。理由：①「合成一支」的实质是**逻辑单一实现**，**不是观感统一**；② 观感变化属**像素面**，C6.4 已裁「归批 8」⇒ 本批引入**不可验证**的观感变化 = 制造不可测回归。🔴 **必须**：① 模式常量**具名导出**；② **表征测试对同一语料断言两模式的输出与迁移前逐字节相同**；③ 报告与规格回写里逐字写「**归一 = 逻辑归一；观感统一未做，归批 8**」（→ **T15 的 V3/V4 + T21 的 §12 加注**） |
| **2** | 🔴 **深链到达后的"自动切三轨"要不要**写进视图记忆**？** `SessionDetailPanel` 的 `viewKey` 由 `useViewMemory("session", …)` 持有（**写 localStorage**）⇒ `setViewKey("tritrack")` 会让**下次打开任意会话详情**都默认落在三轨视图 | C10.3 逐字只说「**做**」（"不切视图则定位到 ms 不可感知"），**未区分"本次临时切"与"持久改默认"** | **接受持久化**（(i) 形态）⇒ **报告逐字登记这个副作用** | 若不裁 ⇒ 用户会发现"我的会话详情默认视图被改了"（**一次深链永久改变默认视图**）；若要 (ii) 临时切 ⇒ 需给 `useViewMemory` 加 `ephemeral` 参数（**改 `views/**` 的既有 hook**，属额外改动） | 🔴 **§C11.2 · 必须临时切，禁止写记忆**：**不得**用 `setViewKey` 写入 `useViewMemory`（持久化）——「一次深链永久改变默认视图」是用户可感知的**副作用式行为变更**，且**本批测不了**（真机跳过）。**形态** = 给 `useViewMemory` 加**非持久**切换路径（可选参数 / 独立的临时覆盖），**加法式改动**（**既有调用点一字不改**）。🔴 **必须**：① 一条测试断言「深链自动切视图后，`localStorage` 的视图记忆**未被写入/未被改变**」；② 报告给出该断言的**变异体**（改成持久化 ⇒ 必红）。🔴 **若实现上必须破既有调用点 ⇒ STOP 报控制方**（→ **T17 的 Step 3 / V5′ + T1 的 hook 归属说明**）。<br>📍**E1 实测补充（2026-09-13）**：hook 真身 = `app/src/views/useViewMemory.ts`（**70 行**，`countLines()`）；既有调用点 **2 处**（`components/SessionDetailPanel.tsx:87` · `components/notes/NotesReadingColumn.tsx:136`）+ 测试面 `views/useViewMemory.test.ts`（**206 行**） ⇒ 「加法式」= 新参数**可缺省**、两处调用点**零改动** |
| **3** | 🔴 **§C2.4 的「色与 `tag_colors` 一致」在 `NoteListToolbar` 上今天不成立** —— 实测：`NoteListToolbar.tsx:87-88` 的过滤芯片**完全不用 `tagColors`**（`allTags` 是 `string[]`）；C2.4 括号里写的"读端已在"指的是 `NoteListRow.tsx` | §C2.4 的**括号里的路径清单**是控制方转述的，**未逐字核对 `NoteListToolbar` 的芯片是否着色**（`### 表 6` X5 是本计划者的实测） | **给 `NoteListToolbar` 加可选 `tagColors?` 并给芯片着色**（净增 ≤ +3 行，余量充足） | 若不裁 ⇒ 「标签过滤面板有内容」成立（`allTags` 非空），但**芯片是无色的** ⇒ §C2.4 的字面要求（"色与 `tag_colors` 一致"）在 toolbar 上**未被满足**；若控制方认为不必给 toolbar 着色 ⇒ 本计划删掉 T18 的 Step 4（省 1 个提交） | **§C11.3 · 做**：**给过滤芯片上色**（净增 ≤ +3 行；`allTags` 仍是 `string[]`，只多一张查色表）。理由：§C2.4 的字面要求是「**色与 `tag_colors` 一致**」；过滤面板的芯片与列表行的色块**不一致**正是用户纲领要防的「呆板 / 不一致」。🔴 **遵守该文件的冻结值预算（`### 表 6b` 同批实测口径，C9.12）**：`NoteListToolbar.tsx` 现 `nativeButton 4 · 边框 3 · 越界圆角 2` ⇒ **不许新增**原生 `<button>` / `#e5e7eb` 边框 / 越界圆角，**一律 `Button` 原语 + token**。🔴 **登记「控制方第 12 例引述不精确」**（§C11.3 逐字）：§C2.4 括号里的路径清单**实际只有 `NoteListRow` 着色** ⇒ **批 7 不得再把「读端已在」当成「所有读端都已在」**（→ **T18 的 Step 4 / V9**） |
| **4** | 🔴 **读端 `video_profile_for_spec` 的"接线"会不会抽掉 §9 #30 的删除理由？** §9 #30 删 `video_profile_spec_by_kind` 的理由逐字是「前端已有 `KIND_TO_FORM` / `KIND_TO_TIER` 双写」，而 #28 留 `video_profile_for_spec` 的理由是「档位通道的读端」⇒ 若 T19 **真的让前端改用后端作为单一真源**，则 #30 当年的删除理由**在事后不再成立** | recon-a §A2③ 已把这条**张力**登记为「供控制方注意」，但**C0–C10 未对它出裁决** | **做**（读端成为单一真源，并在报告里逐字登记"#30 的删除理由在事后不再成立"）；🔴 **若实施者认为本地双写不可动 ⇒ STOP** | 若不裁 ⇒ 实施者可能走两条相反的路（保留双写 ⇒ 读端"接线"流于形式；改用后端 ⇒ 削弱 #30 的理由）⇒ **两条路的报告结论会互相矛盾** | **§C11.4 · 做，且 §9 #30 的删除理由不被抽掉**：读端接线的形态 = 「**后端 `video_profile_for_spec` 为读端真源** + 前端 `KIND_TO_FORM` / `KIND_TO_TIER` 映射**降级为兜底**」。理由：① 这不使 #30 的删除理由失效 —— 前端**仍然保有**那张映射，只是**角色从「并行真源」变成「离线降级路径」**；②「所有云端/系统能力必须有本地兜底路径」是 **AGENTS.md §3.4 的硬性要求** ⇒ 兜底**必须留**；③「档位选完真生效 / 跨会话记住」的验收要求**后端**为真源。🔴 **必须**：在规格回写与报告里**逐字登记这次角色变更**（否则事后读 #30 的删除理由会与代码矛盾）；🔴 **不得删除前端映射**。🔴 **若实施者认为本地双写不可动（保留并行真源）⇒ 接线流于形式，STOP 报控制方**（计划的默认执行形态即此，采纳）⇒ **原第 4 列的形态与"报告里逐字登记 #30 的删除理由在事后不再成立"这句作废**（→ **T19 的 Step 4 + T21 的角色变更登记**） |
| **5** | 🔴 **懒侧门禁把 `exit 1` 的含义扩张了**（从"首屏超"到"任一门禁超"） | C9.6 只要求"懒侧超标必须让门禁有牙"，**未给退出码契约**；`check-bundle-budget.mjs:32` 的既有契约是 `0 = 达标 · 1 = 超预算 · 2 = 构建失败/产物缺失/自检失败` | **`1` = 任一门禁超标**（首屏或懒侧），输出里**分别打印两个 pass** | 若不裁 ⇒ 现有消费方（CI / 脚本）会把"懒侧超"读成"首屏超"；若要区分 ⇒ 需新增退出码（破既有契约）或加 `--json` 字段（本计划已加） | **§C11.5 · 不新增码，改契约文档 + 输出点名**：`exit 1` 的含义**扩张为「任一预算超标（首屏 / 懒侧）」**，**但**：① 🔴 `scripts/check-bundle-budget.mjs:32` 的**契约注释必须同步改写**（现在的「1 = 超预算」会被读成只指首屏）；② 人类可读输出**分别打印两个 pass**；③ `--json` **必须分别给首屏与懒侧的 `pass` 字段与读数**。理由：新增退出码会**破既有 CI/husky 契约**（破坏面大于收益）⇒「单一失败码 + 输出点名」是最小破坏面。🔴 **不得**让懒侧判定影响首屏字段（两者必须仍是两个独立读数，C9.6 第 1 条）（→ **T9 的 Step 5′ + Interfaces + V6**） |
| **6** | **`describe(` 的标题串算不算"散文"？**（T10 要改 `nativeButton.ratchet.test.ts:182` 的 `describe` 标题） | C10.6 只说"doc/comment-only 微单元"，**未给"散文"的判据边界**；C9.13 逐字说「`:182` 的 **describe 标题**写…」⇒ 它**把它当散文列了**，但没说改它算不算"动判据" | **算散文**（Vitest 不按标题匹配，标题只影响报告可读性）⇒ T10 改它 | 若不裁 ⇒ 实施者可能拒改 `:182`（保守）⇒ 6 项清单只完成 5 项；或改了被评审判为"动判据" | **§C11.6 · 算散文（可改）** ⇒ T10 改 `nativeButton.ratchet.test.ts:182` 的 `describe` 标题。🔴 **附加硬条件（防「改散文改出事」）**：① 该提交**只改字符串**，**任何断言、计数、常数一律不动**；② 改前**必须在全仓 grep 该标题原文**，确认**没有**任何测试/脚本/文档按它匹配（**有 ⇒ STOP**）；③ 评审须以 **diff 逐字核对「只有标题串变了」**；④ 该文件的门禁读数与该文件**自身的用例数前后逐字相同**（→ **T10 的 Step 2′ + V5′**） |
| **7** | 🔴 **`get_decision` 的"顺带修审计 H7"** —— H7 是什么？ | recon-a §A5⑦ 与 §9 #40 的说明逐字只有「决策日志单条详情 —— **顺带修审计 H7**」；**H7 的原始描述不在本计划的任何输入里**（`docs/tech-debt/review-2026-09-11.md` 是未跟踪文件，本计划者**未读它**） | **T20 的 C8 条**：先做 `get_decision` 的详情面；🔴 **若在仓内找不到 H7 的原始描述 ⇒ STOP 报控制方** | 若不裁 ⇒ 实施者可能**跳过 H7**（则 #40 的"顺带修"未兑现）或**自行猜测 H7**（则可能修错东西） | **§C11.7 · 授权只读那份未跟踪文件取 H7 原文**：🔴 **授权 T20 只读** `docs/tech-debt/review-2026-09-11.md` **以取得 H7 的原始描述**。说明：C7.3 裁的是「**不处置**该文件」（归档/删除/改状态是用户的决定）—— **「读」不是「处置」**；且它是 H7 的**唯一**来源。🔴 **边界**：① 读到的内容**不得**外泄进任何入库文档（引用时**只写「H7」与该条原文的必要片段**，**不得整段搬运**）；② 若 H7 的范围**超出 `get_decision` 的详情面** ⇒ **只做 `get_decision` 那部分**，其余**逐字登记为批 8 输入**，**不得**当成整条审计的清理许可；③ 若在那份文件里**也**找不到 H7 ⇒ **STOP 报控制方**（计划的默认形态，采纳）（→ **T20 的 C8 条 + V9**） |
| **8** | **T11 的散文对拍探针要不要纳入门禁？** | C10.6 只说"作为独立 doc/comment-only 微单元"，**未说要不要给它一个机器门禁**；而 C0.7/recon-c 已实测「`:45` 的散文**无门禁兜底**」 | **只造探针、不纳入八闸**（报告逐字说明"它拦不住提交"） | 若不裁 ⇒ 散文漂移仍可能发生（探针只是事后可查）；若要纳入 ⇒ 需扩八闸为九闸（**改变批 8 的基线口径**） | **§C11.8 · 入库但不入八闸**：探针**必须入库**（不能只活在 gitignored 的 `tmp/`，否则批 8 无法复用），但**不纳入八闸/CI/husky**。理由：① 八闸的**集合**是批 8 治理收口的对账基线，本批扩闸会让批 8 的逐字对账漂移；② 散文数字天然易漂 ⇒ 做成硬门禁会**频繁假红**；③ C10.6 的目标是「更正**当前态**散文」，不是「永久防漂」。🔴 **必须**：① 脚本自述「**非门禁，手工跑**」（`--help` 与头注都写）；② **先查** `scripts/validate-all.mjs` / husky / CI 配置**会不会自动把它捡进门禁** —— 会 ⇒ 换名或显式排除，**不得**静默扩闸；③ 在规格回写里登记它为**批 8 的候选闸**。<br>📍**E1 实测补充（2026-09-13，只读）**：`scripts/validate-all.mjs` 的 `steps` 是**显式命令清单**（只直接跑 `scripts/docs-check.mjs`，**无 `scripts/*.mjs` glob**）· `.husky/pre-commit` 只跑**三条具名脚本**（`line-limits --full` / `docs-check` / `check-command-registry`）· `.github/workflows/pr-check.yml` 的 `docs` 过滤器只含 `docs/**` 与 `scripts/docs-check.mjs` ⇒ **三者都不会自动捡 `scripts/check-exemption-prose.mjs`** ⇒ **无需换名、也无需显式排除**（→ **T11 的 Step 0′/Step 3′ + V5′**） |

> **✅ 自陈**：以上 **8 条**全部附「为何底稿未覆盖」。**其中 #1/#2/#3 是本计划在编制期**实测出来的**底稿缺口**（不是执行中的新发现）；#4 是 recon-a 已登记但 C 系列未裁的张力；#5/#6/#8 是**本计划的实现形态**带来的口径扩张；#7 是**输入材料本身缺一块**。**除此之外，批 7 的规格义务与 C0–C10 的裁决全部有唯一落位**（见 `### 表 7` / `### 表 8`）。
>
> 🔴 **裁决回收（2026-09-13，E1）**：上面这段**自陈原文保留**（它是「为何底稿未覆盖」的**有效记录**，不改）；**8 条已全部按 `rulings.md` §C11.1–§C11.8 裁完** ⇒ **批 7 无任何未决项**（§C11 逐字：「裁完之后批 7 无任何未决项」）。⇒ 本节的**性质从「未决项清单」变为「已裁项回收台账」**；若实施中发现**新的**底稿未覆盖问题，**追加到本表末尾并同样附「为何底稿未覆盖」**，**不得**改动已裁 8 行的任何一列。

---

## 诚实边界

> **口径**（C6.4 + C6.2）：🔴 **严格区分两类** —— **「仪器不可达」**（本环境物理上测不了 ⇒ **只能登记**，**不许**编造弱判据）与 **「本批未做」**（做得了但本批不做 ⇒ **逐条带去向批次**）。

### 一、仪器不可达（**本批未测、且本环境测不了**；每条的「可能的将来仪器」也一并给出）

| # | 项 | 为什么测不了 | 本批的替代判据（**代理，不是等价**） |
|---|---|---|---|
| 1 | **真机 / WebView2 冒烟** | 用户裁决**跳过**（C6.4 逐字；批 0-C2 的同款裁决） | 无代理；**只登记**。⇒ 「标签能写进去」「档位跨会话记住」的**真机面未测** |
| 2 | **像素 / 观感** | jsdom 无排版；无合成器；真机跳过 | 无代理；**归批 8**（C6.4 逐字）。⇒ ① `Surface` 逐处迁移的可见变化 · ② 两条手写链的样式差异 · ③ 7 条新展示面的观感 **全部未测** |
| 3 | **真实帧率 / 布局抖动** | jsdom 无 paint | 无代理（批 6 的属性集合代理**不适用于本批**：本批不加动效，只挂既有 hook） |
| 4 | **`[[ts:ms]]` 的真机跳转精度** | 同上；且 `playheadMs` 只在三轨视图可见（真机不可达） | **jsdom 级的端到端**（`NotesPage.test.tsx`：点芯片 ⇒ `onOpenSessions(42, 5000)`）+ 自动切视图的结构断言 |
| 5 | **音频对齐的 ±200ms 块粒度** | 真机/音频面不可达（批 6 的登记项） | **逐字保留批 6 的边界声明**（`NoteMarkdown.tsx:51` 与 `utils/html.ts` 的注释）⇒ **不得声称毫秒级定位** |
| 6 | **`Surface` 迁移的层叠结果** | jsdom 不做样式级联（`getComputedStyle` 拿不到生效值） | 判**源码文本 + 类名 + DOM 属性**（V3 的 CSS 级判据 + V2 的 tsc 探针） |
| 7 | **`tag_colors` 回填的并发/中断行为** | 无真机、无并发启动测试面 | **幂等设计 + 四点内存库单测**（V1）；**启动期时序未测** |
| 8 | **中文输入法的回车提交** | jsdom 无 IME | 无代理；**只登记**（T18 的诚实边界③） |
| 9 | **`v0.22` / 规格的渲染观感** | 无渲染器 | `docs-check` 只判链接/文件名/索引 ⇒ **内容正确性靠人工评审** |
| 10 | **真实构建的懒侧 katex 去向** | 🔴 **需真实构建**（取锁 + `npm run build`）⇒ 若 T17 未跑 ⇒ **写「未判定」**（C6.4 逐字） | 若跑了 ⇒ **族前缀 + 逐块字节闭合核算**（C9.6 第 2 条） |

### 二、本批未做（**做得了，本批不做**；逐条带去向）

| # | 项 | 为什么本批不做 | 去向 |
|---|---|---|---|
| 1 | **5 个粘滞字段的 `{value,key}` 声明形态改造**（R4.1） | 会让 `CommandPalette.kb.test.tsx:176` 的正则 `const \[${f}, set` 失配（**C9.9 只授权"只增"**）；且收益边际（批 5 C6 已修掉"陈旧值复触发"） | **批 8**（或用户另裁） |
| 2 | **「带证据三轨」的实现**（Q14 / C9.17） | 前置是"必须先写规格"（本批交了规格）；"段级身份"路径**触及规格 §3 红线 6**且需新开 command | **批 8**（规格已就绪） |
| 3 | **「审校模式」/ `ink-4` 的实现**（Q14 / C9.18） | 批 7 只交**定义**；`ink-4` 保持 0 调用点**没有任何东西会红** ⇒ **可选项不是阻塞项** | **批 8** |
| 4 | **音频两条**（`AudioStoragePanel` 死 UI · 删会话不删音频） | C7.3 / Q15：`v0.22:689` 逐字「**产品裁决**」 | **产品裁决**（**T21 的 `v0.22` 节必须逐字登记**） |
| 5 | **`docs/tech-debt/`** | C7.3 / Q16：**用户所有** | **用户裁决** |
| 6 | **B1/B2 守卫范围**（R5） | C2.1 / Q9：**不开例外**；批 4 B21 + 批 5 C7 已两次判「维持」 | **不排期**（本批零动作） |
| 7 | **`Surface` ② 的「真统一」样式口径** | 见 `## 待控制方裁决` #1 | **控制方 + 批 8（像素面）** |
| 8 | **`Text` 字号越界 551/120** | 批 6 R6.3 已登记 | **批 8 治理收口**（本批只保证新代码不新增） |
| 9 | **`docs/product/ui-ux-system.md` / `theme.md` 的回写** | §14 `:913` 逐字仍留批 8 | **批 8** |
| 10 | **`ADR-034` 的 §登记两条**（会话详情头改粘性 / 笔记工具栏三层合并） | 批 4 已登记为批 5 follow-up，批 5 未承接 | **批 8**（本批零 ADR 动作） |
| 11 | **`bundle-eager-graph` 的 `--keep-type-only` 口径**（C-5） | 产生它的探针在 gitignored 的 `tmp/` 下，**无法用已入库仪器复现** | **登记**（T22 的诚实边界） |
| 12 | **`usePlayheadJump` 等 hook 无 unmount 清理**（批 6 §12⑩） | 批 6 已评估、登记批 7/8 | **批 8**（本批未承接） |
| 13 | **`aligned` 的残余偏差 D3–D6** | 批 6 §12① → 批 7/8；**需后端补测或真机** | **批 8** |
| 14 | **跨窗口档位 / 相位同步** | 批 6 §12③ → 批 7/8 | **批 8** |
| 15 | **`Flip` 的 `width`/`height` 与 §11-10 属性集合判据的冲突** | 批 6 §12⑤ → 批 7/8 与**判据纪律** | **批 8** |

### 三、措辞纪律（收口前逐条复查）

1. 🔴 **「标签能写进去」的端到端证据是 jsdom + `invoke` mock 级** ⇒ **不得**写成「真机验证通过」。
2. 🔴 **「档位跨会话记住」的判据是机器代替品**（重新 `load` 同一文件）⇒ **不得**写成「已真机确认」；报告须逐字给出代替品与其**不等价之处**。
3. 🔴 **「markdown 归一完成」= 2 套活**（`NoteMarkdown` + `markdownLine`）⇒ **不得**写成「渲染器统一为一个」。
4. 🔴 **`[[ts:ms]]` 的"全链已通"** 只有在 ① `utils/html.ts` 的芯片有 ms ② **每个**手写链容器都接上事件委托 ③ `App → SessionsPage → SessionDetailPanel` 的 ms 通透 ④ **自动切三轨** —— **四条全部为真**时才可说；**若 `RefineWorkbench` 侧未接 ⇒ 逐字登记残余**（C10.2 期望它不残余 ⇒ 以实测为准）。
5. 🔴 **`structuredBlocks` 的裁决 = 逐导出裁决**（不是"接线或删除"的任一边）⇒ 报告须逐字引用 C4.1 的授权语。
6. 🔴 **「懒侧 katex 消失」必须用真实构建证明**；否则写「**未判定**」（C6.4）。
7. 🔴 **「21」不得作为验收数字**（C10.8 第 3 条）⇒ T7 的报告**只能**给**实测的逐处名单**。
8. 🔴 **「落了 seam」≠「已交付」**（批 6 的纪律）；本批同理：**「补 UI 落了按钮」≠「功能可用」** ⇒ 7 条新展示面**必须逐条给"能做什么"的判据**。
9. 🔴 **不得出现「笔记 3 视图已交付」**（C9.17 的 R8 防线）。
10. 🔴 **`docs/tech-debt/` 不是本批的产物** ⇒ **不得**声称「本文档由本批创建」（C7.3 逐字）。

---

## 收口回写八节（T22 的交付形态；照批 6 母本）

> **落地位置**：`docs/versions/v0.22.md` 的**批 7 节**（**七段结构**，T21 的 Step 6）+ 批次报告 `task-22-report.md` / `closing-review.md`（**gitignored ⇒ 永不 `git add -f`**）。**下面八节是收口评审件的骨架**。

1. **三条验收的判据与读数**（`标签能写进去` / `档位选完真生效` / `structuredBlocks` 已作出明确裁决）—— 逐条给**命令 + 读数 + 提交 sha**。
2. **八门禁终态表**（T22 的 8 行，逐行给命令 / exit / 逐字读数）+ **首屏 + 懒侧两个独立读数**（三件套：原始 / Δ / 机理）+ `app/dist` mtime + 冻结提交 sha。
3. **逐任务提交轨迹**（T1–T22：任务号 / 提交 sha / subject / 该提交的门禁读数 / 备注「哪一行是在哪次提交落库的」）—— ⚠️ **共享文件**（`line-limit-exemptions.md` / `app_commands.rs` / `App.tsx`）的改动归属必须用 `git log -p -- <file>` **核对后**再写。
4. **C 系列的实际结果**（C0–C10 **逐条**：照做 / 追认后偏离 / 未触发的条件授权 / 新增偏离）—— **不得**只写"全部照做"。🔴 **必须单列**：**C9.15 被 C10.1 取代**（控制方的第 11 例自我更正）· **C9.1 的 10 vs 11 计数口径** · **C10.8 的"21 只作量级"** 的实际残值。
5. **诚实代价**（本批**真实付出**的代价：`App.tsx` 的三处搬迁 · `NoteMarkdown` 的拆件 · 两条手写链合成一支的两模式妥协 · 用例净 −7 · 懒侧基线的 698.86 kB · 7 条新展示面的设计决定 · `docs/tech-debt/` 全程占着 `git status`）。
6. **未验证（诚实单列）** —— **逐条**复制 `## 诚实边界` 的第一类（10 条），**不得**合并同类项、**不得**删减。
7. **follow-ups（逐条具名归属）** —— 每条给「事项 / 归属批次 / 触发条件 / 接手所需的读数」；**至少**覆盖：R4.1 的 5 个粘滞字段 · 带证据三轨的实现 · 审校模式的实现 · 音频两条（产品裁决）· `docs/tech-debt/`（用户裁决）· **视图记忆被深链改写**（#2）· **样式统一口径**（#1）· **懒侧门禁的退出码契约**（#5）· **散文对拍探针是否入门禁**（#8）· `Text` 字号越界 551 · `Flip` 的 `width/height` 冲突 · D3–D6 残余 · 跨窗口同步 · `ADR-019` 缺号 · `bundle-eager-graph` 的 `--keep-type-only` 口径。
8. **与计划的偏差（本节自陈）** —— 逐条给「计划原文 / 实际做法 / 为什么 / 谁批的（裁决号或 STOP 记录）/ 是否已回写文档」。🔴 **编制期已产生的偏差必须留痕**：**C10.1 取代 C9.15 的形态** · `App.tsx` 的 Step 6 分界（接口在 7a、行为在 7b）· `Surface` ② 的「21」按实测走 · T16 选 `export function renderMarkdown` 的可达性形态 · T11 的三次同批同步（T4/T6/T19）· **`update_note_tags` 与 `set_tag_color` 同属标签线但各算一条**的计数口径。
