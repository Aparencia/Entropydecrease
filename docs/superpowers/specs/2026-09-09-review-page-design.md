# 2026-09-09 · v0.20.10 复习域页独立（用户 11 项问题 6——复习功能独立为顶层页）

> 状态：**用户逐项授权（2026-09-09）· 已实施（2026-09-09 本线：代码提交 + 交付记录，见 v0.20.md）**
> 定位：意图分层续批（学/做/记/练各归其位）——复习面从笔记域剥离为顶层「🔄 复习」页；[v0.20.5 行动域页 spec §9](./2026-09-06-action-domain-page-design.md) 二期预留方向兑现（ReviewSessionOverlay 全页化 + 全量到期卡 + 组过滤器）。
> 关联：用户 11 项问题 6（v0.20.9 交付记录开放项滚动）· REQ-314 · v0.20.5 行动域页独立先例（b78ddae7：意图域页拆分三件套）· ADR-018（闪卡数据层与笔记域零耦合）· TD-004（保活挂载 + active 门控）
> 原则：不引入路由库（display:none 保活挂载延续）；后端零改动（命令面既有 list_due_cards/count_due_cards/review_card 全复用）；「无被动提醒」裁决沿用行动域（D4）——不新增全局/侧栏徽标。

## 1. 授权口径（2026-09-09 用户裁决）

| # | 决策 | 裁决 |
|---|------|------|
| D1 | 方案 | **独立顶层页（推荐）**：新增第 9 个 Tab「复习」——ReviewSessionOverlay 全页化 + 组过滤 + 到期数；笔记域入口改深链 |
| D2 | 入口 | 仅顶部 Tab「🔄 复习」为到期感知入口（打开即见到期数）；组侧栏「🎴 复习 N」按钮移除（无被动提醒——不放导航/侧栏徽标，同行动域裁决） |
| D3 | 深链 | 笔记域 ⓘ 弹层「复习本组」保留但改**跨页深链**：App 转复习页 + 组预选（focusReviewGroupId，仿 focusGroupId 模式，消费后清空） |
| D4 | 数据/后端 | 零 DB/命令改动：list_due_cards/count_due_cards/review_card 均带 group_id Option（commands_flashcards.rs）——数据层只依赖 flashcards/review_logs + scheduler（ADR-018），与笔记域零耦合 |
| D5 | 刷新 | 闪卡域不在 useDbRefresh 五域事件总线（notify.rs DataDomain 无 Flashcards）→ 复习页走 active 门控切回重载（TD-004，同 ActionPage）；会话退出后再拉一次（评分改变到期分布） |
| D6 | 版本 | v0.20.10（交付记录 + 需求池 REQ-314 备注） |

## 2. 范围与现状

**范围内**：① 新 pages/ReviewPage.tsx（组过滤器 + 每组/全量到期数 + 开始复习 + 空态引导）；② ReviewSessionOverlay → components/review/ReviewSessionPanel.tsx 全页化迁移（git mv 保历史，去 fixed 遮罩，渲染为页面主体区；front→reveal→四档评分流程语义与后端命令不变）；③ App.tsx 第 9 Tab + focusReviewGroupId 深链；④ 笔记域拆件（NotesPage 删 review state/Overlay 宿主；GroupSidebar 删「🎴 复习 N」按钮与 dueTotal 拉取；RouteInfoPopover「复习本组」语义=深链回调）；⑤ 测试同步 + 新页面/纯逻辑测试；⑥ 交付记录登记观察项。

**范围外**：导航分组收纳（顶层 Tab >8 观察项——本批第 9 Tab 只登记不设计）；复习页内生成闪卡入口（无组上下文——组管理「⚙ 生成闪卡」仍为生成唯一入口，开放项登记）；批 6-8 范围（排序置顶/空组清理在笔记域的动作与数据库结构；行动域/会话页/采集域）；🎴 转卡（G7 预留置灰）；feed 地形组卡片范围化。

## 3. 页面结构（ReviewPage ≤300 行）

- **总览态**：头部=标题 + 全量到期数 + 「▶ 开始复习」按钮 + 组过滤器 chips（全部（N）+ 到期>0 的各组（N），到期数即时可见——打开即见到期感知）；主体=范围引导/空态（全局无到期 vs 本组无到期但别组有——引导换范围，不误报）。
- **会话态**：ReviewSessionPanel 全页化渲染为页面主体（「开始」语义=挂载即开一轮；本轮=所选范围到期卡按 due_at 升序，上限 200=后端 DUE_LIST_LIMIT_MAX）。
- **空态文案**：说明卡源（组 ⓘ「⚙ 生成闪卡」/「＋ 概念卡」/碎片升卡）与 FSRS 到期节奏；不做页内生成按钮（无组上下文的全局生成语义不清——开放项）。
- 纯归约抽至 utils/reviewStats.ts（dueGroupRows 到期>0 降序 / scopeDueCount / scopeLabel——vitest AAA）。

## 4. 深链与刷新契约

- 深链：ⓘ「复习本组」→ GroupSidebar → NotesPage(onOpenReview) → App setFocusReviewGroupId + setPage("review") → ReviewPage 消费（预选组）→ onFocusGroupConsumed 清空（同组重复深链可再触发）；深链到达时会话进行中→先退出会话（新意图优先——模态时代不可能并发两场复习）。
- 刷新：active 门控（首挂跳过、false→true 递增 token 全量重载）；会话退出/完成即重载；无事件订阅（DataDomain 无 Flashcards）。

## 5. 测试与验收

- 前端：ReviewPage 8 例（chips/范围开始/空态两分支/active 门控/深链消费/会话打断）、ReviewSessionPanel 4 例（front→back→四档推进→完成收尾/空队列/ESC 与退出）、reviewStats 4 例；GroupSidebar 测试清理 count_due_cards mock + 入口唯一化回归护栏；RouteInfoPopover 深链回调断言；全量 vitest 612→630、tsc 0 错误。
- Rust：零改动；子集回归 `cargo test --test app_lib_tests -- flashcard scheduler` 19/19。
- 真机走查：9 Tab 渲染与宽度；组过滤切换与到期数；全量/单组开始复习流；ⓘ 深链（含同组重复深链）；评分后队列推进与完成空态；切页（离开/返回）到期统计重载；无侧栏/导航徽标回归。

## 6. 文档与提交

- 本设计：docs/superpowers/specs/2026-09-09-review-page-design.md（本文件）
- docs/versions/v0.20.md：v0.20.10 交付记录小节
- 需求池 REQ-314 备注（用户 11 项问题 6）
- docs/standards/line-limit-exemptions.md：App/NotesPage/GroupSidebar 实测行数纠偏
- 提交：① 代码（feat）② 文档（docs）——push origin/dev

## 7. 风险与回归

- 入口遗漏：侧栏/导航任何残留复习入口或徽标=裁决违反（测试回归护栏 + 走查清单覆盖）；count_due_cards 命令保留不删（ActionPage 先例：API 面不缩小）。
- active 门控漏接线：隐藏期生成卡/删组后切回统计陈旧（单测覆盖 false→true 重载）。
- 深链消费遗漏：同组重复深链失效（消费即清空 + 单测覆盖）。
- 行数：ReviewPage 184 / ReviewSessionPanel 180 / NotesPage 540 / GroupSidebar 418 / App 429——均 ≤600，豁免表纠偏登记。
