# 技术债清单（权威：2026-08-21 归档滚动——v0.8.0 M1~M4 代码建设 + 新增代码审查批次后）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-20 清单滚动 + 本次会话 v0.8.0 M1~M4 代码建设
> （提交 7818e90/12c5a13/fcd09c4/b4e7e79/4c44297，1264 单测全绿）
> + 新增代码七维审查即修批次（提交 354dd3d，1265 单测全绿）。

## 未偿债务（逐笔核验；carried 仅留 ID + 一行摘要）

| ID | 摘要 |
|----|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡，开发期脚本+PATH 覆盖）；本次未涉及，保持 |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088）；本次未涉及，保持 |
| TD-2026-08-19-F | detect_pause_icon 暗底+中央亮内容可能误报暂停；本次未涉及，保持 |
| TD-2026-08-19-G | db_ocr_search 500 会话静默截断 + 图路径不校验存在性；本次未涉及，保持 |

## 今日已偿（v0.8.0 M1~M4 新增代码审查即修，可经代码/提交验证）

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| （审查 C1） | ai_client/ai_balance URL 拼接 `trim_end_matches("/v1")` 把默认端点 `https://api.siliconflow.cn/v1` 的 /v1 一并删掉 → 请求打到缺 /v1 的路径 404——测试连接/余额/复核/精修/补充全部网络调用失败，且波及既有 REQ-085 复核（重构后走共享 client） | 只修剪尾斜杠（与 ai_text_filter 原实现一致）+ 提取 chat_completions_url 纯函数 + 防回归单测（chat_url_preserves_v1_segment）；提交 354dd3d |
| （审查 C2） | AiRefineCard/EnrichPanel 任务轮询 setInterval 无组件卸载 cleanup——切会话/关面板后 interval 持续 invoke 并对已卸载组件 setState（泄漏） | 两组件加卸载 cleanup（clearInterval + 置空）；提交 354dd3d |
| （审查 C3） | run_refine_task 双跑全量 analyze_session_opt（build_rule_draft 结构渲染一次 + 任务取章节/术语又一次）——千段长会话重复 CPU | build_rule_draft_with_analysis 提取（装载+分析一次完成并返回 analysis），apply_note_structure_with_analysis 复用外部分析；提交 354dd3d |
| （审查 C4） | 过期 `#[allow(dead_code)]` 标注：chat_json/parse_json_object（已被 M2/M3 适配器使用）、content_gate（已被命令使用）——豁免过期误导审查 | 移除过期豁免 + 注释更新；enabled_gate 真预留保留；提交 354dd3d |
| （审查 C5） | trim_tasks 容量守卫：终态任务数 < excess 时删不完（并行 Running 占满时 len 持续 > CAP） | 改 while 循环逐删最旧终态，无终态可删即停；提交 354dd3d |
| （审查 C6） | EnrichPanel 动态 import @tauri-apps/api/event（与 AiRefineCard 静态 import 不一致 + 异步竞态窗口） | 改顶部静态 import（与 AiRefineCard 一致）；提交 354dd3d |

## 今日新登记 open

| ID | 摘要 | 类型 |
|----|------|------|
| TD-2026-08-21-A | 存量 clippy 告警 9 个（live_session_persist ×8 needless_borrow `&ctx.last_speech_rate` + series_detect ×1 nonminimal_bool）——本次未改动的历史文件，clippy 版本漂移所致；新代码已清零 | 环境变化 |

## 观察项（登记不立债，保持跟踪）

| ID | 摘要 | 处置 |
|----|------|------|
| （观察 A1） | ai_enrich_protocol B6 无链接校验用宽松 contains_url（http(s):// 或 www. 前缀）——含 "www" 的普通文本（如"www 是万维网缩写"）会被误拒 | B6 语义=仅标题不输出链接，宽松匹配已够；误伤概率极低，保持跟踪 |
| （观察 A2） | AiRefineCard/EnrichPanel 事件监听 useEffect 依赖数组未含 handleState（eslint exhaustive-deps 会提示）——运行时无碍（taskId 变化时监听与回调同步重建） | 保持跟踪；如需零告警可将 handleState 依赖补全 |
| （观察 A3） | ai_refine_apply 落库采用"建规则基线笔记 + versioned_save 精修版"两步——若中途失败（如 usage 落库失败）会留下只有基线快照的笔记 | 单机应用可接受（用户可重跑精修）；M5 端到端验收时实测 |
| （观察 1~8 继承） | 2026-08-20 清单观察 8 条（clone 拷贝/结构渲染白算/前端统计卡/AGENTS.md Silero 表述/说话人卡片入口/首启下载/双版面/词级时间戳） | 保持跟踪（观察 1 处置：拷贝已在 spawn_blocking 线程内，消除收益微小） |

## 关联

- 版本与需求：[v0.8.0 版本文档](../../versions/v0.8.0.md)（M1~M4 已交付，M0/M5 待推进）· [需求池 REQ-138~147](../../product/requirements-pool.md)
- 决策：[ADR-016（AI 密钥 DPAPI 存储）](../../adr/ADR-016-ai-credentials-dpapi.md)（当前生效）
- 提交链：M1 `7818e90`/`12c5a13` · M2 `fcd09c4` · M3 `b4e7e79` · M4 `4c44297` · 审查修复 `354dd3d`
