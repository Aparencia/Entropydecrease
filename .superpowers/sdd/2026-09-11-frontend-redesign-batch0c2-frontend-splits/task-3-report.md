# Task 3 报告：拆 `app/src/components/SessionDetailPanel.tsx`（656 → 296）

- **Status: DONE**（硬限达成、门禁全绿、计划边界照做；拆分后复核发现的**唯一行为差异已修复**——见 §9.1）
- 仓库根：`D:\Program own\aicode\work space\Entropydecrease` · 分支 `dev`（未切分支、未推送）
- **BASE = 44864295**（开工时 HEAD；`git show 44864295:app/src/components/SessionDetailPanel.tsx` 实测 656 行）
- 需求来源：`docs/superpowers/plans/2026-09-11-frontend-redesign-batch0c2-frontend-splits.md`（Global Constraints + 统一作业模式 8 步 + Task 3 全节）· `.superpowers/sdd/2026-09-11-frontend-redesign-batch0c2-frontend-splits/analysis-session-detail-panel.md`（402 行）
- 行数口径：一律 `[System.IO.File]::ReadAllLines($p,[Text.Encoding]::UTF8).Count`（未用 `Get-Content`/`Measure-Object -Line`/字节计数）；判定与 `node scripts/line-limits.mjs` 交叉核对一致。

---

## 1. 拆前 / 拆后行数对照

| 文件 | 拆前 | 第 4 步后 | **最终（含等价性修正）** | 说明 |
|---|---|---|---|---|
| `app/src/components/SessionDetailPanel.tsx` | **656** | 288 | **296** | 编排层（视图切换 / 质量卡 / 时间轴 / 术语表 / 图集 / 两裁决面板挂载） |
| `app/src/components/session-detail/SessionScreenCards.tsx` | — | 198 | **192** | 第 1 步：画面要点屏卡流（框选/toast 的**状态**在修正后上移，见 §9.1） |
| `app/src/hooks/useSessionDetailData.ts` | — | 191 | **237** | 第 2 步 + 修正：数据面 + 精修链路 + **屏卡瞬时态（框选/单屏 toast）** |
| `app/src/components/session-detail/SessionDetailHeader.tsx` | — | 160 | **160** | 第 3 步：降级横幅 + 详情头（改名/状态行/融合中/操作） |
| `app/src/components/session-detail/SessionRefineSection.tsx` | — | 66 | **66** | 第 4 步：精修工具条三按钮 |
| 上限 | — | — | `max = 237` | 全部 ≤300 ✅；主文件 296 ≤300 ✅（无需登记） |

分步净减实测：**656 →（屏卡流）522 →（数据 hook）410 →（头部）305 →（精修区）288 →（等价性修正）296**。
计划 §3.2 估「前 4 步 ≈250」，实测 288/296（差因见 §8.2：DOM 顺序契约要求两裁决面板挂载与 `refineMsg` 提示行留在原位）。

## 2. 每步提交与门禁

| 提交 | 内容 | 主文件行数 | `tsc --noEmit` | `vitest run` | `line-limits --full` | `docs-check` |
|---|---|---|---|---|---|---|
| 44864295 | 基线 | 656 | exit 0 | 103 文件 / **809 用例** exit 0 | exit 0（>600 = 15 · 301–600 = 123 · 条目 138） | exit 0 |
| **0db7d972** | 第 1 步 屏卡流 | 522 | exit 0 | 809/809 exit 0 | exit 0（>600 = **14**） | exit 0 |
| **26abdc90** | 第 2 步 数据 hook | 410 | exit 0 | 809/809 exit 0 | exit 0 | exit 0 |
| **e2db3a39** | 第 3 步 头部 | 305 | exit 0 | 809/809 exit 0 | exit 0 | exit 0 |
| **fd1b6f55** | 第 4 步 精修区 | 288 | exit 0 | 809/809 exit 0 | exit 0（>600 = 14 · 301–600 = 123 · 条目 **137**） | exit 0 |
| **9c005848** | 等价性回归修正（§9.1） | 296 | exit 0 | 809/809 exit 0 | exit 0 | exit 0 |
| 本提交 | `docs(ui)`：登记表人工列 + 报告 | 296 | exit 0 | 809/809 exit 0 | exit 0 | exit 0 |

- 提交信息：`refactor(ui): 拆 SessionDetailPanel 第 N 步 — <单元>` · `fix(ui): 屏卡 toast/框选态上提至数据 hook（等价性回归）` · `docs(ui): 回写 SessionDetailPanel 拆分登记与报告`（Conventional Commits，subject ≤50 字）。
- 每步均**显式 add 自己的文件**（从未用 `git add -A`/`.`/`--no-verify`）；未触碰 `docs/tech-debt/`；未用 `git stash`；未跑 `git gc`。
- **门禁时机（与计划 Step 3 的差异，见 §8.1）**：因 `.husky/pre-commit` 每次都跑 `--full`，而 `(e)` 守「登记表声明值 == 实测值」，故 **4 步全部各带了一次刷新后的登记表**，`FROZEN_OVER_LIMIT` 的删行落在**第 1 步**（该步主文件已 522 ≤600，否则 `(b)` 会拒绝提交）。
- vitest 用例数全程 **809/103 文件，与基线一致、无减少**（该文件本身 0 专属测试，全量仅作回归底线）。

## 3. Step 5 六条人工等价核对（逐条结论）

> 本文件 0 专属测试 ⇒ 这一节是**主要**证据。除人工走查外，我把「搬迁等价」做成了**脚本化逐行比对**（把 BASE 版本的对应块与抽出后的文件按代码行去空行/去注释后**逐位比较**），结论如下。

1. **DOM 锚点未变 ✅**
   - 段锚点：BASE `id={\`seg-${sessionId}-${seg.id}\`}` 与现状 `app/src/components/SessionDetailPanel.tsx` 中**逐字相同**（该块根本未动）。
   - 屏锚点：BASE `id={\`ocr-${sessionId}-${s.first_seen_ms}\`}` 与现状 `SessionScreenCards.tsx` 中**逐字相同**（整块 115 行归一化后**逐位一致**，仅 prop 改名）。
   - 唯一消费者 `app/src/pages/SessionsPage.tsx:133` `document.getElementById(\`seg-${id}-${targetSegId}\`)` **未改动**；`ocr-*` 锚点仍无消费者（G5 已登记），本次未新增消费者、未改格式。
2. **陈旧闭包防护仍在 ✅**：`useSessionDetailData.ts:81-82`（修正行号见文件）保留 `const onRefreshDetailRef = useRef(onRefreshDetail); onRefreshDetailRef.current = onRefreshDetail;`（渲染期赋值，与拆分前 L89–90 同形），`session:refined` 回调仍走 `onRefreshDetailRef.current(sessionId)`；listen effect 仍是 `[sessionId]` 且带 `// eslint-disable-next-line react-hooks/exhaustive-deps`。**未**改用 `useCallback`/直接闭包。脚本比对：listen effect 22 行代码**逐位一致**。
3. **性能不回归 ✅**：`ocrBlocksByScreen` 的 `useMemo`（排序 + 双指针，deps `[detail]`）**留在 hook 层**，由面板以 prop 传 **`Map`** 给 `SessionScreenCards`；子组件内无任何分组/排序。脚本比对：memo 14 行代码**逐位一致**。
4. **两处 `auto_refine_session` 失败文案未合并 ✅**：懒触发仍为静默 `.catch(() => undefined)`；手动入口 `startRefine()` 仍为 `setRefineMsg(\`精修失败: ${e}\`)`。两条分支物理分离。脚本比对：`startRefine` 主体 16 行代码**逐位一致**。
5. **未加粘性头 ✅**：`SessionDetailHeader.tsx` 与主文件全文 grep `sticky` 仅命中 1 处注释「本组件不含 position:sticky（粘性头未实现，勿顺手加）」，**无任何 sticky 实现**；头部 JSX 77 行代码**逐位一致**。
6. **零 `.ed-*` 类名 ✅**：4 个新文件 + hook 全文 grep `.ed-` / `className=` —— 实际**零命中**（仅注释文字提到「无 .ed-* 类名」）。旧色值扩散清单见 §5。

补充（一并核过）：
- **文案守恒（修正后重跑）**：BASE 主文件含中文字面量 **36** 条，拆分后 5 个文件的并集 **36** 条；唯一差异是模板串 `` （原始 ${detail.ocr_blocks.length} 块） `` → `` （原始 ${ocrBlockCount} 块） ``（**插值表达式随 prop 改名，渲染文本不变**）。主文件与新增的 toast/框选 props **均未引入任何新的含中文字面量**。
- **`invoke` 参数与时机**（6 处，逐字未变）：`session_quality_report {id: sessionId}`（会话切换，失败保留 null）· `session_glossary {id: sessionId}`（失败回 `[]`）· `session_images_base_url {sessionId}`（失败回 `""`）· `auto_refine_session {sessionId}`（原料视图首次进入，`autoRefinedRef` 幂等）· `auto_refine_session {sessionId}`（🔬 点击）· `update_session_title {id, title}`（改名提交；空标题/同标题不发 IPC）。
- **块级逐位比对汇总**：memo 14/14 · 数据 effect 12/12（减去 D1 迁出的 `setViewMode("raw")` 一行）· 懒触发 9/9 · `setDeepTaskId(null)` 1/1 · listen 22/22 · `startRefine` 16/16 · 头部 JSX 77/77 · 改名两函数 23/23 · `STATUS_LABEL` 5/5 · 工具条三按钮 25/25 · **框选/toast 三块（状态声明 3/3、卸载清理 effect 6/6、`showPanelToast` 5/5、toast+配图渲染块 9/9）全部与 BASE 逐位一致**——除句柄改名外**全部 IDENTICAL**。

## 4. D1–D4 落实

| 裁决 | 落实 |
|---|---|
| **D1 `viewMode` 不进 hook** | ✅ hook 只**按值**接收 `viewMode` 用于懒触发判定；`viewMode` 状态与两处读写留在面板。**面板保留 deep-link 切换 effect**（`setDeepTaskId`/`setViewMode("preview")`/`onAutoTaskConsumed?.()`，deps 含稳定 setter）。**注意**：拆分前的数据 effect 内有 `setViewMode("raw")`（会话切换回原料视图），按 D1 不能在 hook 里调面板 setter ⇒ 拆成面板内 1 行独立 effect `useEffect(() => { setViewMode("raw"); }, [sessionId])`（同 deps、同一 commit 批处理，渲染结果不变）。 |
| **D2 命名 `SessionRefineSection.tsx`** | ✅ 文件名与导出名均为 `SessionRefineSection`；登记表人工列与「已拆分」历史条目均已写明「原登记名 `SessionPass2Section.tsx` 名不副实，按裁决 D2 更名」。 |
| **D3 `SecondPassPanel.onChanged` 仍不传** | ✅ 主文件挂载处仍是 `{showPass2 && <SecondPassPanel sessionId={sessionId} onClose={() => setShowPass2(false)} />}`，**未补** `onChanged`。 |
| **D4 规格重复命名按单一文件实现** | ✅ 本轮按控制方裁决**未做** 5–8 步，`SessionTranscriptPane` 未抽；时间轴仍整体留在主文件，不存在两个可分离单元。**规格疑似重复命名**：`specs/2026-09-11-frontend-redesign-design.md:227` 同时列 `SessionTranscriptPane` 与 `SessionSegmentsTimeline`，而本文件「转写时间轴」只有**一块**（`<h3>转写时间轴</h3>` + `segments.map`）⇒ **判定为同物二名**，后续若做该步按单一 `SessionTranscriptPane.tsx` 落地。 |

## 5. 旧 inline 色值清单（拆分后扩散面，供后续 token 化）

主文件仍是**全 inline style、零 `.ed-*`**；拆分后同一批色值分布在 4 个文件（hook 无样式）：

| 文件 | 出现次数 | 去重色值 |
|---|---|---|
| `SessionDetailPanel.tsx` | 30 | `#0d9488 #0f766e #111827 #2563eb #374151 #6b7280 #7c3aed #99f6e4 #9ca3af #b45309 #ccfbf1 #dc2626 #e5e7eb #f0fdfa #f9fafb #fafafa` |
| `SessionScreenCards.tsx` | 18 | `#047857 #0d9488 #0f766e #111827 #374151 #6b7280 #6ee7b7 #7c3aed #9ca3af #e5e7eb #ecfdf5 #f0fdfa #fafafa` |
| `SessionDetailHeader.tsx` | 11 | `#0d9488 #6b7280 #b45309 #dc2626 #f59e0b #fffbeb` |
| `SessionRefineSection.tsx` | 9 | `#0d9488 #0f766e #1d4ed8 #2563eb #6d28d9 #7c3aed #eff6ff #f0fdfa #f5f3ff` |
| `useSessionDetailData.ts` | 0 | — |

BASE 单文件色值全集（25 个）：`#0d9488(8) #9ca3af(7) #6b7280(6) #e5e7eb(5) #0f766e(5) #b45309(5) #7c3aed(4) #374151(3) #f0fdfa(3) #111827(2) #fafafa(2) #fffbeb(2) #f59e0b(2) #2563eb(2) #dc2626(2) #6ee7b7 #047857 #ecfdf5 #1d4ed8 #ccfbf1 #f9fafb #99f6e4 #eff6ff #6d28d9 #f5f3ff`。
→ **R1 已发生（预期内）**：token 化漏改面从 1 文件变 4 文件（不是分析预估的 9 个——只做了前 4 步）。

## 6. 登记表与棘轮名单的改动

1. **`scripts/line-limits.mjs`**：第 1 步从 `FROZEN_OVER_LIMIT` 删掉 `'app/src/components/SessionDetailPanel.tsx'`（522 ≤600 ⇒ `(b)` 要求删；>600 计数 15 → 14，仅剩 0-C3 的 Rust 文件）。
2. **`docs/standards/line-limit-exemptions.md`**（生成物，`--write` 刷新；每步随提交）：
   - 主文件行随实测在表内移动：656（超硬限表）→ 522/410/305（301–600 档）→ **≤300 后整行由生成器删除**（条目 138 → 137）。**因此该文件的「拆分计划」人工列已随行消失**——人工维护的两列只能存在于此路径的行上，行被删除后无处保留 ⇒ 该列文字（含真实行数、4 文件边界、D2 更名）已完整写入「已拆分 / 登记移除记录」节的历史条目（生成器逐字保留），这是唯一能承载它的位置。
   - 「已拆分」节新增 2 条（均含**真实行数**）：
     - `已拆分：app/src/components/SessionDetailPanel.tsx（… 分 4 个原子提交 0db7d972 / 26abdc90 / e2db3a39 / fd1b6f55，登记值 656 超 600 硬限）：… SessionScreenCards.tsx（192 行…）· useSessionDetailData.ts（237 行…）· SessionDetailHeader.tsx（160 行…）· SessionRefineSection.tsx（66 行…D2 更名）… 主文件回归 296 行 … 分步净减实测 656 → 522 → 410 → 305 → 288 → 296 … **拆分计划**：web 早返回（SessionWebView）/ 质量卡（SessionQualityCard）/ 转写时间轴（SessionTranscriptPane）/ 术语表（SessionGlossarySection）为可选 5–8 步精化，本轮按「最小可行 + 合规即停」未做`
     - `等价性回归修正：… （toast/框选态上提至 useSessionDetailData，屏卡改收 5 个 prop，行数影响 面板 288→296 / hook 191→237 / 屏卡 198→192，DOM/文案/锚点/invoke 均未变）`
   - 新文件均 ≤300 ⇒ **不产生登记行**（故「新文件行数回写」落在上述历史条目里）。
3. `--write` 幂等：修正后重跑 `--write` 对登记表**零改动**（我的文件都无行）；`node scripts/line-limits.mjs`、`--full`、`docs-check.mjs` 均 exit 0。

## 7. 行为等价的人工走查（jsdom/测试无法覆盖的部分，仅静态结论）

- web 会话早返回：整块未动（仍在主文件），标题 +「web 采集」徽标 + `WebArticleView` 传参逐字未变。
- 改名交互：`autoFocus`、Enter/Esc、`onBlur` 保存、`renameBusy` 去重（`if (renameBusy) return;` 在 await 之前）逐字保留；失败文案 `改名失败: ${e}` 未变。
- 精修全链路：4 条 `listen` 的事件名/载荷类型/文案/解绑方式逐字保留。
- 深链竞态：`deepTaskId` 快照 + 会话切换清除 + `onAutoTaskConsumed?.()` 同步调用时机未变（状态位置由面板移到 hook、切换 effect 留面板）。
- 空态/条件渲染分支：段空态、屏空态（photo 与否）、`canSecondPass`（原两处同式条件合并为 1 个 prop，值恒等）、`quality &&`、`glossary === null` vs `[]` 三态、单屏 toast 的 `screenKey` 匹配与框选层的 `selectingScreen` 匹配 —— 分支可达性未变。

## 8. 与计划/分析的偏差（2 处，均已在正文标注）

1. **门禁时机**：计划把「刷新登记表 + 删棘轮行」放在 Step 3（全部抽完后）。实际因 `--full` 的 `(e)` 每次提交都校验声明行数，**必须每步刷表**；且主文件第 1 步即 522 ≤600 ⇒ 棘轮删行提前到第 1 步（否则 `(b)` 拦截）。已按控制方裁决的「做法②」执行，未用 `--no-verify`。
2. **S2 内容边界偏差（第 4 步）**：计划的第 4 步含「工具条 3 按钮 + `SecondPassPanel`/`ProofreadPanel` 挂载」。**实际只抽了 3 个按钮**，`refineMsg` 提示行、`showPass2`/`showProofread` 状态与两个面板挂载**留在主文件原位**。原因：这三处在拆分前分属 3 个不同 DOM 位置（按钮在工具条 flex 行内、提示行在行外、两面板在子树末尾），任一组件封装都必然改变至少一处的父节点/兄弟顺序 —— 与「不改 DOM 结构」冲突。选择**逐字保留 DOM**（代价：主文件 296 而非计划估的 ~250）。控制方已裁决「第 4 步后收手」，5–8 步不做。
3. **分析 §4.6 的 hook 签名缺 `detail`**：分析写 `useSessionDetailData({ sessionId, viewMode, onRefreshDetail })` 却要求返回 `ocrBlocksByScreen` —— 两者不可能同时成立（分组 memo 依赖 `detail.screens`/`detail.ocr_blocks`，且 deps 必须保持 `[detail]`）。**以代码为准**：实际签名为 `{ detail, viewMode, onRefreshDetail }`，`sessionId` 由 `detail.session.id` 在 hook 内派生（effect deps 仍是 `[sessionId]`）。

## 9. 自审发现

### 9.1 ★ 已修复：屏卡 toast / 框选态的生命周期（等价性回归）

**问题（第 1 步引入）**：`panelToast`/`panelToastTimerRef`/`selectingScreen` 按分析与计划的 S1 边界随 `SessionScreenCards` 下沉后，其生命周期绑定到**原料视图子树**，而该子树在 `viewMode === "preview"` 时**整块卸载** ⇒ 两个用户可见差异：
- a) 框选保存成功 → toast 4s 内切「笔记预览」再切回：拆分前 toast 仍在（状态在面板），下沉后消失；
- b) 点「✂ 框选截取」后（`BoxSelectOverlay` 是图片容器内 `position:absolute; inset:0`，**不覆盖**工具条）切到预览再切回：拆分前该屏框选层仍在，下沉后消失。

**修复（提交 9c005848）**：把两者上提到 `hooks/useSessionDetailData.ts`，屏卡组件改收值 + setter 共 5 个 prop（`selectingScreen` / `onSelectScreen` / `panelToast` / `onShowToast` / `onClearToast`）。**未塞回 `SessionDetailPanel.tsx`**（它只剩个位数余量；放进 hook 的效果相同且不挤占主文件）。

**依据的代码事实（为什么生命周期与拆分前一致）**：
1. `useSessionDetailData({ detail, viewMode, onRefreshDetail })` 在 `SessionDetailPanel.tsx:69` 调用 —— 在 **web 早返回（:92）之前、无条件调用**，且**不在任何视图分支内**；
2. `SessionScreenCards` 只在 `viewMode === "preview" ? … : (…原料分支…)` 的原料分支里渲染（`SessionDetailPanel.tsx:199` 起，组件在 `:231`）⇒ **切视图卸载的是屏卡子树，不是面板**；
3. 面板本身由 `pages/SessionsPage.tsx` 的 `detail ? <SessionDetailPanel/> : <p/>` 渲染，`viewMode` 变化不改变其位置/类型 ⇒ **面板实例不重挂**，hook 状态随之存活；
4. toast 定时器的卸载清理 effect 与 `showPanelToast` 逐字随迁（脚本比对：状态声明 3/3、清理 effect 6/6、`showPanelToast` 5/5 与 BASE **逐位一致**），注册/清理时机同为「面板挂载/卸载」；
5. 调用点只换句柄名：`setSelectingScreen(null)`→`onSelectScreen(null)`、`showPanelToast(...)`→`onShowToast(...)`、`setSelectingScreen(ms)`→`onSelectScreen(ms)`、`setPanelToast(null)`→`onClearToast()`；`selectingScreen === s.first_seen_ms` 与 `panelToast.screenKey === s.first_seen_ms` 两个渲染条件**逐字未变**。

**复检**：切到预览再切回后，`panelToast`/`selectingScreen` 仍在 hook 内 ⇒ toast 在 4s 窗口内仍显示、框选层仍恢复 = 拆分前行为。Δ行数：面板 288→296（≤300）、hook 191→237、屏卡 198→192。

### 9.2 其他

1. **`btn` 样式常量重复**：`{ padding:"5px 10px", cursor:"pointer", fontSize:12 }` 现同时存在于主文件与 3 个新文件（每个 1 行）。未新建共享样式模块（计划 Create 清单没有该文件，也不愿为 1 行新增文件/依赖）；后续 token 化时应一并收敛。
2. **登记表 band 行的前缀泄漏（既有生成器瑕疵，非本次引入）**：主文件从超硬限表落到 301–600 档时，`why` 列会带出生成器前缀「超硬限（>600 行），不允许豁免 —— 」（`writeTable` 只在超硬限分支调 `stripOverPrefix`）。我手工把该单元格改成如实措辞（`--write` 幂等保留）；该行最终被生成器删除。建议在计划 Task 6 一并修。
3. **注释搬运**：被抽走块的原注释（`M2 修复`/`M7 修复`/`v0.11.5 spec 5️⃣` 等 Why 注释）随代码整块搬入新文件；新文件另加 `@ai-context`（业务背景 / 副作用边界 / 边界条件 / 决策来源），并把 §9.1 的生命周期契约写进 hook 与屏卡的文件头（防后人再把它下沉）。主文件对已抽走部分只留 1–3 行指针注释。
4. 全量门禁在**修正后**重跑过一次（tsc exit 0 / vitest 103 文件 809 用例 exit 0 / `line-limits --full` exit 0 / docs-check exit 0），与提交内容一致。

## 10. 顾虑（尤其**我未能验证**的）

1. **本文件 0 专属测试 ⇒ 等价性无自动化保障**。我的证据是「静态逐位比对 + 全量测试不回归 + §3 六条人工核对 + §9.1 的代码事实链」，**没有**新增任何测试（计划未要求；新增测试会改变测试面，属批外）。任何我未识别的运行时差异都**不会被现有 809 个用例发现**。
2. **未做任何真机/Tauri 运行时验证**：没有启动 `npm run dev` 或打包，因此 `asset://` 图片加载、框选保存落库、`session:refined` → 屏卡 rendered 回填、深链竞态、锚点 `scrollIntoView` 的实际滚动定位、降级横幅的真实触发/消失 —— **全部未经运行时确认**（与分析 §6.4 所列 8 项相同）。§9.1 的修复同理：结论来自代码事实（调用位置与卸载边界），未在真实 UI 上复现「切视图再切回」。
3. **视觉/layout 未验证**：DOM 结构与 inline style 逐字保留（可脚本比对的部分都一致），但「新组件边界不产生 DOM 节点、5 个新 prop 不改变渲染树」这一点是基于 React 语义的**推断**，未用浏览器 DevTools 实测比对渲染树。
4. **门槛余量很小**：主文件 **296/300（余 4 行）**。后续任何对该面板的功能改动都会立即越线，建议排期时优先做可选的 5–8 步（`SessionWebView` / `SessionQualityCard` / `SessionTranscriptPane` / `SessionGlossarySection`，预计再降至 ~200 行）。
5. **未更新规格**：分析 §6.6 建议同步 `specs/2026-09-11-frontend-redesign-design.md:227` 的实现状态与 D2/D4 命名更正 —— 计划 Task 3 的 Step 6 未列入、控制方也未要求，故**未改**（避免与批内其他任务/控制方的规格编辑冲突）。
6. 未触碰控制方正在编辑的 `docs/superpowers/plans/...-splits.md`（Task 3 的 `- [ ]` 复选框仍是未勾选状态，由控制方自行勾选）。
7. **报告文件位于 `.gitignore` 覆盖的 `.superpowers/` 下**：`docs(ui)` 收尾提交按控制方要求以 `git add -f` 入库该报告（其后可用 `git rm --cached .superpowers/sdd/2026-09-11-frontend-redesign-batch0c2-frontend-splits/task-3-report.md` 撤出，不影响工作区文件）。

---

### 附：可复现的核对命令

```powershell
# 行数（唯一口径）
[System.IO.File]::ReadAllLines((Get-Item 'app/src/components/SessionDetailPanel.tsx').FullName,[Text.Encoding]::UTF8).Count   # 296
# 门禁
node scripts/line-limits.mjs --full      # exit 0（>600 = 14 · 301–600 = 123 · 条目 137）
node scripts/docs-check.mjs              # exit 0
cd app; npx tsc --noEmit; npx vitest run # exit 0 / 809 passed (103 files)
# 锚点 · 生命周期 · 失败文案
git show 44864295:app/src/components/SessionDetailPanel.tsx | Select-String 'seg-\$|ocr-\$'
Select-String -Path app/src/components/session-detail/SessionScreenCards.tsx -Pattern 'ocr-\$'
Select-String -Path app/src/hooks/useSessionDetailData.ts -Pattern 'onRefreshDetailRef|精修失败|catch\(\(\) => undefined\)|selectingScreen|panelToast'
Select-String -Path app/src/components/SessionDetailPanel.tsx -Pattern 'useSessionDetailData\(|<SessionScreenCards|viewMode === "preview"'
```
