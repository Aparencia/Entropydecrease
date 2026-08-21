# 技术债清单（权威：2026-08-21 二轮归档滚动——AI 精修全链路建设 F0~F3 + 新增代码审查批次后）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-21 首轮清单滚动 + 本次会话 AI 精修全链路代码建设
> （F0 契约修复 `1845462` · F1-A2 丢图 `897ee96` · F1-A3 成本 `ba9e618` · F1-A4/A5 审计配额 `b6ad051`
> · F2-B1/B2 任务中心 `f06fd7f` · F2-B3 面板 `6e72c5d` · F2-B4 并发 `afca35f`
> · F3-C 协议 v2 `7f575cd` · F3-D 硬拦截 `790f964` · F3-E golden `b75db82`，1294 单测全绿）
> + 新增代码七维审查即修批次（提交 `564dfc5`，1294 单测全绿 + 前端 tsc/build 通过）。

## 未偿债务（逐笔核验；carried 仅留 ID + 一行摘要）

| ID | 摘要 |
|----|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡，开发期脚本+PATH 覆盖）；本次未涉及，保持 |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088）；本次未涉及，保持 |
| TD-2026-08-19-F | detect_pause_icon 暗底+中央亮内容可能误报暂停；本次未涉及，保持 |
| TD-2026-08-19-G | db_ocr_search 500 会话静默截断 + 图路径不校验存在性；本次未涉及，保持 |
| TD-2026-08-21-A | 存量 clippy 告警 9 个（live_session_persist ×8 + series_detect ×1）——本次未改动文件，环境版本漂移所致；本次新增代码 clippy 已清零（审查确认），保持 |

## 今日已偿（本次新增代码七维审查即修，可经代码/提交验证；提交 `564dfc5`）

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| （审查 P0-1） | 任务去重粒度过粗：`tasks.values().any(进行中)` 全表检查——会话 A 精修中时会话 B 精修/任意笔记补充被误拒 | `AiTaskEntry` 增 `target_id`，去重按目标粒度（精修=session、补充=note）；refine/enrich 同步 + 恢复路径补字段 |
| （审查 P0-2） | 成本拦截与配额消耗顺序错误：先扣配额后拦余额——余额不足被拒时配额已扣（浪费每日额度） | 顺序调整：先 `ensure_balance_for`（失败不扣配额），后消耗配额；enrich 同步 |
| （审查 P1-1） | 采纳无幂等：adopted 标记只在落库后写，异常/重复调用可绕过前端反复建笔记 | 服务端 `is_ai_task_adopted` 前置校验（refine/enrich apply）+ 前端 adopted 任务禁用查看/采纳 + DB 单测 |
| （审查 P1-2） | 落库成本失真残留：`usage_cost` 用旧默认单价（¥0），付费模型预估 ¥X 但落库记 ¥0 | 新增 `usage_cost_for_model`（模型感知单价与预估同口径），refine/enrich apply 改用 + 单测 |
| （审查 P1-3） | 补充任务无单片重试（精修有 SLICE_RETRY）——网络瞬态失败整任务失败浪费已成功片 | run_enrich_task 单片重试 1 次（与精修对齐） |
| （审查 P1-4） | 任务表运行期不裁剪：`trim_ai_tasks` 仅启动时跑，终态任务运行期无限累积 | 精修/补充任务终态落库后调用 `trim_ai_tasks`（保留策略生效） |
| （审查 P1-5） | AiTaskPanel 用 `any` 类型（违反强类型契约）；AiRefineResult 前端类型缺 `failedSlices` | 改类型收窄（AiRefineResult/AiEnrichResult 分支）；types.ts 补 failedSlices |
| （审查 P2-1） | App.tsx toast 计时器未清理（每事件新起 timer，卸载后残留空转） | toastTimer ref 持有 + 卸载/新事件清理 |
| （审查 P2-2） | 前端未展示部分成功（failedSlices > 0 无提示） | AiRefineCard done 状态显示「部分成功 x/y 片」 |

## 今日新登记 open

| ID | 摘要 | 类型 |
|----|------|------|
| （无） | 本次新增代码七维审查：接入性/逻辑性/牵连性/性能/冗余/规范/安全全部通过或即修；无遗留 open | — |

## 观察项（登记不立债，保持跟踪）

| ID | 摘要 | 处置 |
|----|------|------|
| （观察 A1） | ai_enrich_protocol B6 无链接校验用宽松 contains_url——含 "www" 的普通文本会被误拒 | B6 语义=仅标题不输出链接，宽松匹配已够；保持跟踪 |
| （观察 A2） | AiRefineCard/EnrichPanel 事件监听 useEffect 依赖数组未含 handleState（eslint exhaustive-deps 会提示） | 运行时无碍（taskId 变化时监听与回调同步重建）；保持跟踪 |
| （观察 A3） | ai_refine_apply 两步落库（建基线笔记 + versioned_save 精修版）——中途失败留下只有基线快照的笔记 | 单机应用可接受；M5 端到端验收时实测 |
| （观察 1~8 继承） | 2026-08-20 清单观察 8 条（clone 拷贝/结构渲染白算/前端统计卡/AGENTS.md Silero 表述/说话人卡片入口/首启下载/双版面/词级时间戳） | 保持跟踪 |

## 本批滚动（2026-08-21 第三轮：设置页重构 + 任务 4 基建 + 框架 v2 定稿）

- **未偿 5 笔保持 carried**（TD-040 / TD-2026-08-19-D/F/G / TD-2026-08-21-A）：本批为前端 UI 迁移（设置页，提交 `6720bec`）+ 仓库基建适配（任务 4），未涉及 Rust 逻辑，逐笔核验无变化
- **已偿 0 笔新增** / **新登记 open 0 笔**：无 Rust 改动，无新债务

## 关联

- 版本与需求：[v0.8.0 版本文档](../../versions/v0.8.0.md)（M1~M4 已交付 + AI 精修非功能扩展 F0~F3 已交付，M0/M5 待推进）· [需求池 REQ-138~147](../../product/requirements-pool.md)
- 设计文档：[AI 精修非功能扩展设计（[ ] 已归档，本日归档）](brainstorming-ai-refine-nonfunctional-rebuild.md)
- 决策：[ADR-016（AI 密钥 DPAPI 存储）](../../adr/ADR-016-ai-credentials-dpapi.md)（当前生效）
- 提交链：F0 `1845462` · F1 `897ee96`/`ba9e618`/`b6ad051` · F2 `f06fd7f`/`6e72c5d`/`afca35f` · F3 `7f575cd`/`790f964`/`b75db82` · 审查修复 `564dfc5` · 设置页 `6720bec` · 任务 4 `158b3ff`~`d6af0af`
