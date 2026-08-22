# 单文件行数豁免登记（AGENTS.md §3：单文件 ≤300 行；300-600 行须登记本清单）

> 登记规则：文件超过 300 行时在此登记（文件 + 行数 + 豁免理由 + 拆分计划）。
> 超过 600 行必须硬拆（不允许豁免）。
>
> **2026-08-21 七维审查修复（Task #6）全量刷新**：全部条目以实测行数为准；
> Rust 侧实测于 `app/src-tauri/src/`，前端侧数字来自前端审查报告（Task #9/10
> 并行拆分中，部分文件行数仍在变化，以审查快照为准）。

## Rust 后端（app/src-tauri/src/）

| 文件 | 行数 | 豁免理由 | 拆分计划 |
|------|------|---------|---------|
| app/src-tauri/src/artifact_templates.rs | 572 | v0.5.0 M7（REQ-052）：五档案模板函数（讲义/步骤卡/摘要/对话纪要/会议纪要）内聚于同一模板域，各模板共享原料注入签名；v0.9.0 M5 叙事变体再增 | 若再增长：会议/访谈模板拆至 artifact_templates_meeting.rs |
| app/src-tauri/src/live_session_frame.rs | 544 | 屏幕采样线程编排（自适应采样/空闲降频/前台监控/播放器检测）；A1 暂停冻结 + P2 自动暂停轻量轮询 + 画面价值观测注入 + 升降档裁决多轮叠加；H2 修复（OCR 调用切超时变体）行数微增 | 若再增长：暂停轻量轮询拆至 live_session_pause_poll.rs |
| app/src-tauri/src/capture/audio_loopback.rs | 514 | ADR-007 重连机制（重试循环/退避/恢复回调）内聚于捕获线程实现，拆出需跨函数传递 COM 生命周期参数，内聚性优先；2026-08 A1 硬暂停（端点 Stop/Start + 暂停时长补偿 + 残留缓冲清空）再增 | 若再增长：将 run_capture_inner 拆至 audio_loopback_session.rs |
| app/src-tauri/src/video_profile.rs | 549 | v0.5.0 M1（REQ-043）：档案域（类型/检测投票/记忆偏好/JSON IO）内聚；档案常量数据已拆至 video_profile_data.rs；v0.9.0 M1 记忆库 kind 映射迁移 + v0.11.5 Task 5 四象限记忆后置判定（apply_profile_memory）再增 | 若再增长：检测投票与记忆偏好拆至 video_profile_detect.rs |
| app/src-tauri/src/engine.rs | 441 | 引擎池句柄与同步 API（双 worker 编排 + ADR-009 设备状态 + M7 心跳/失败/缓存计数 + 有界等待变体）；三维复审 #5 超时排空机制（drain_asr/ocr_backlog）与 #3 ASR_FILE_TIMEOUT 文件级超时常量接入后，worker 主循环与请求协议按登记计划拆至 engine_worker.rs（见文末"已拆分"注记）回归本值 | 若再增长：排空机制与同步 API 变体拆至 engine_request.rs |
| app/src-tauri/src/live_frame_process.rs | 489 | v0.6.0 ADR-011 拆分产物：帧处理域（网格差异触发/两级判变/带外事件驱动/UI 面板抑制/字幕落库）内聚；process_frame 上下文参数 20+；H2 修复（OCR 热路径切超时变体）+ L2 修复（score 口径诚实化）行数微增 + v0.11.5 Task 2 新颖度变化区域接线再增 | 若再增长：handle_subtitle_frame 与 persist_voted_subtitle 拆至 live_subtitle_persist.rs |
| app/src-tauri/src/lib.rs | 494 | Tauri 装配层（setup 初始化 + 决策链路 + command 注册 + 模块声明）；全部为声明与装配，拆分会破坏注册可读性；三维复审 #8 移除 opener 插件注册、新增 engine_worker 模块注册后再增 | 若再增长：command 注册清单拆至 app_commands.rs |
| app/src-tauri/src/note_filter.rs | 480 | v0.6.0 M1（REQ-082/085）：笔记过滤域（过滤链 + AI 判定应用 + 画面要点净化）内聚于单一管线（双出口一致性由构造保证）；AI 部分已按登记计划拆至 note_filter_ai.rs | 若再增长：净化链拆至 note_filter_purify.rs |
| app/src-tauri/src/structure_note_tests.rs | 470 | v0.7.6（REQ-177~181）：结构渲染层单测域（章节插入位置/命名窗口/词汇表排序上限锚点/零回归护栏/JSON 往返）单模块 #[path] 挂载 | 若再增长：词汇表组拆至 structure_note_glossary_tests.rs |
| app/src-tauri/src/screen_merge.rs | 454 | v0.7.3（REQ-155/158）：屏级聚合纯函数域（聚类/行合并/角色分类/块去重）+ v0.7.5 净化纯函数（单字符/边缘条带/零跨度合并/图去重/包含率）——纯逻辑内聚便于单测 | 若再增长：零跨度合并与图去重拆至 screen_fix.rs |
| app/src-tauri/src/commands.rs | 466 | 命令装配域（AppState + 通用命令 + 导入管线编排）；三维复审 #4 process_to_note 白名单补齐 + #3 文件级超时接线 + #7 无扩展名文案后再增 | 若再增长：导入管线命令拆至 commands_import.rs |
| app/src-tauri/src/asr_merge.rs | 453 | v0.5.0 ADR-012 F4-1 语义合并域 + v0.7.0 M2 REQ-119 混排空格（spacing_for/merge_segments_with_spacing）；合并决策与切分共用标点常量 | 若再增长：split_sentences/split_timestamps 拆至 asr_merge_split.rs |
| app/src-tauri/src/region_tracker.rs | 426 | v0.4.0 M2（REQ-037）起：ROI 跟踪状态机（播放区域检测/锁定聚簇/重扫/前台切换冻结）+ 纯函数单测内联；与 RoiTracker 状态强耦合 | 若再增长：lock_roi/prior_roi 纯函数拆至 region_lock.rs |
| app/src-tauri/src/commands_ai_refine.rs | 413 | v0.8.0 M2（REQ-141/145）+ F1/F2/F3：AI 精修命令域（成本预估/异步任务编排/状态/结果/采纳落库/任务历史/配额去重门控/成本硬拦截 + 任务注册表容量守卫）；任务执行已拆至 ai_refine_task.rs；L4 修复（落库失败日志）微增 | 若再增长：门控/拦截拆至 commands_ai_refine_gate.rs |
| app/src-tauri/src/types.rs | 503 | 全局共享类型域（会话/段/OCR 块/笔记/设置/闪卡/周契约等 DTO + 序列化）；类型定义集中便于契约一致，拆分易引发跨模块引用涟漪 | 若再增长：笔记与 OCR 块类型拆至 types_note.rs / types_ocr.rs |
| app/src-tauri/src/video_profile_tests.rs | 411 | 档案测试域（12 档案断言矩阵 + 检测投票 + JSON 校准）单模块 #[path] 挂载 | 若再增长：档案矩阵拆至 video_profile_data_tests.rs |
| app/src-tauri/src/live_session_persist.rs | 401 | 定稿落库域（persist_final/digest_merged/handle_final_event）+ P2 flush_tail_and_persist（停止/暂停共用尾句落库）内聚 | 若再增长：flush_tail_and_persist 与 digest_merged 拆至 live_session_persist_tail.rs |
| app/src-tauri/src/layout_analyzer.rs | 400 | v0.5.0 M3（REQ-047）：规则版版面分析（行/列投影 + 表格线检测 + 区域分类启发式）内聚于同一分类管线；审查加固（公式启发 + 低信息纯色方差滤除） | 若再增长：区域分类启发式拆至 layout_classify.rs |
| app/src-tauri/src/fusion_tests.rs | 392 | 融合测试域（ADR-005 四规则 + REQ-062 概率加权 + REQ-103 音量透传 + REQ-111 切分对齐）单模块 #[path] 挂载 | 若再增长：REQ-111 切分对齐组拆至 fusion_split_tests.rs |
| app/src-tauri/src/artifact_templates_tests.rs | 390 | 产物模板测试域（五档案模板 + 代码块/步骤卡扩展 + 叙事变体 golden）单模块 #[path] 挂载 | 若再增长：代码块/步骤卡组拆至 artifact_code_tests.rs |
| app/src-tauri/src/symbol_normalize.rs | 388 | v0.6.0 M1（REQ-060）：口语符号映射域（映射表/上下文守卫/中文数字解析）内聚；数字解析与守卫共享字符判定 | 若再增长：parse_chinese_number/replace_number_runs 拆至 symbol_numbers.rs |
| app/src-tauri/src/note_filter_golden_tests.rs | 379 | v0.7.5（REQ-172）：黄金语料回归域（会话31/29 实证 + 结构渲染 2 例 + 审查补测）单模块 #[path] 挂载 | 若再增长：结构渲染组拆至 note_filter_golden_structure_tests.rs |
| app/src-tauri/src/capture/resample.rs | 381 | 音频重采样域（采样率转换/缓冲对齐/帧切分）内聚于捕获子模块，纯函数与捕获缓冲格式共享上下文 | 若再增长：帧切分拆至 resample_frames.rs |
| app/src-tauri/src/commands_ai_enrich.rs | 377 | v0.8.0 M3（REQ-142）+ F1/F2/F3：知识补充命令域（九子项校验/预估/异步任务/采纳/撤销 + 配额去重门控 + 成本硬拦截 + 任务落库）——与精修共用任务注册表上下文，命令域内聚；L4 修复（落库失败日志）微增 | 若再增长：门控/拦截拆至 commands_ai_enrich_gate.rs |
| app/src-tauri/src/vocab.rs | 373 | 词表域（存储/纠错/候选提取/n-gram 分词）内聚；分词纯逻辑与存储同域便于单测 | 若再增长：collect_tokens/split_runs 拆至 vocab_tokens.rs |
| app/src-tauri/src/live_session_loop.rs | 369 | v0.7.0 M0 拆分产物（音频编排循环）：主循环 + 长静音/音量骤变/VAD 段事件写入 + drain/停止 flush；LiveSessionCtx 聚合上下文；A1 暂停边沿 + P1 停止 drain 重构；H1 修复（drain_deadline 改 Option，draining 置位时才计算） | 若再增长：事件写入块拆至 live_session_events.rs |
| app/src-tauri/src/screens_tests.rs | 366 | 画面要点屏构建测试域（分组/聚类/图匹配/可消费块过滤回归）单模块 #[path] 挂载 | 若再增长：可消费块过滤组拆至 screens_filter_tests.rs |
| app/src-tauri/src/db_sessions.rs | 359 | 会话仓储（会话/段/OCR 块/建议查询）；SQL 与行映射内聚；v0.7.1 列表标记子查询 | 若再增长：recent_ocr_texts 等建议查询拆至 db_sessions_queries.rs |
| app/src-tauri/src/commands_refine_inner.rs | 353 | v0.5.0 模型版：课后精修编排（清单构建/降级决策/引擎懒加载/逐候选识别/产物回填/HTML→MD 转换）内聚于精修执行域 | 若再增长：html_to_markdown 拆至 html_table_md.rs |
| app/src-tauri/src/ui_junk.rs | 347 | UI 噪声过滤域（水印/字幕条/角标检测规则 + 窗口过滤启发式）内聚于同一判定管线，规则共享窗口几何上下文 | 若再增长：窗口过滤拆至 ui_junk_window.rs |
| app/src-tauri/src/analysis.rs | 344 | v0.5.0 M2 起结构化分析编排域（章节/重点/术语/讲者 + 事件消费 + step_boundaries/practice_segments/player_actions 三字段 + 审查修复按类型判定）；各机制输出聚合内聚于单一分析函数 | 若再增长：build_chapter_signals 事件版拆至 analysis_signals.rs |
| app/src-tauri/src/analysis_tests.rs | 341 | 分析编排测试域（档案门控矩阵 + REQ-108 事件消费 + M2 三字段）单模块 #[path] 挂载 | 若再增长：事件消费组拆至 analysis_events_tests.rs |
| app/src-tauri/src/streaming_asr_tests.rs | 340 | 流式 ASR 测试域（端点处理/静音判定/段切分回归）单模块 #[path] 挂载 | 若再增长：端点处理组拆至 streaming_endpoint_tests.rs |
| app/src-tauri/src/commands_ai.rs | 340 | v0.5.0 起 AI 复核命令域（边界批量复核/配额/缓存/审计 + 结构渲染接线）；与 note_filter_ai（纯逻辑）分层 | 若再增长：批量复核循环拆至 commands_ai_review.rs |
| app/src-tauri/src/ai_client.rs | 318 | v0.11.6 M1（AiClient::from_provider / from_settings_with_store / is_fallbackable / fallback_provider_ids）——Provider 解析与错误分类内聚于 AiClient 域，构造入口与降级链纯函数同文件便于单测 | 若再增长：fallback_provider_ids 拆至 ai_fallback.rs |
| app/src-tauri/src/screens.rs | 332 | v0.7.3（REQ-155/156/160）：画面要点屏构建编排（分组/聚类/图匹配 IO）+ 可消费块过滤扩展——编排与纯函数分层（纯函数在 screen_merge.rs） | 若再增长：filter_usable_blocks 拆至 screen_filter.rs |
| app/src-tauri/src/ocr_cache.rs | 329 | OCR 结果缓存域（内容指纹键/容量淘汰/命中率统计）内聚；缓存策略与指纹算法共享上下文 | 若再增长：指纹算法拆至 ocr_fingerprint.rs |
| app/src-tauri/src/ai_refine_task.rs | 322 | v0.8.0 F2-B4 拆分产物：精修任务执行域（任务编排/并发切片 worker 池/单片重试/部分成功/审计/落库）——并发编排与状态流转内聚 | 若再增长：refine_slices_concurrent 拆至 ai_refine_task_workers.rs |
| app/src-tauri/src/commands_session_note.rs | 314 | v0.7.6 审查硬拆产物：会话→笔记转换管线（原料装载/结构渲染/单条转换/批量编排/预览）内聚于笔记转换域 | 若再增长：convert_to_note 拆至 commands_session_note_convert.rs |
| app/src-tauri/src/screen_merge_tests.rs | 314 | 屏级聚合/净化纯函数测试域（聚类/行合并/零跨度/图去重回归）单模块 #[path] 挂载 | 若再增长：净化组拆至 screen_merge_purify_tests.rs |
| app/src-tauri/src/structure_models.rs | 311 | v0.5.0 模型版：模型清单/独立状态机下载器（进度事件/.part 原子写/按需启用三分类）+ 磁盘就绪判定（disk_done）内聚 | 若再增长：download_one 拆至 structure_download.rs |
| app/src-tauri/src/commands_session.rs | 310 | v0.6.0 M6 + v0.7.6 审查硬拆后回归：会话命令域（CRUD/质量报告/课程分组/段搜索）内聚；笔记转换管线已拆至 commands_session_note.rs；M2 修复（search_ocr_blocks 传 data_dir 参数） | 若再增长：course/search 拆至 commands_session_extra.rs |
| app/src-tauri/src/import.rs | 304 | 导入域编排（音视频/图片导入流程 + 帧提取调度）内聚；与 import_frame/import_transcribe 分层 | 若再增长：导入参数校验拆至 import_validate.rs |

## 前端（app/src/，数字来自前端审查快照；Task #9/10 拆分进行中）

| 文件 | 行数 | 豁免理由 | 拆分计划 |
|------|------|---------|---------|
| app/src/pages/ClassroomPage.tsx | 547 | 装配层页面：左栏配置区（就绪清单/窗口选择/实时捕获/视频导入/OCR 设备/词表/素材）+ 右栏内容区；审查硬拆已拆出 ClassroomRightPane 与 MaterialInputPanel 回归 547 | 若再增长：将实时捕获卡片拆出 LiveCaptureCard（状态与事件监听下沉） |
| app/src/components/LiveActivityPanel.tsx | 510 | 实时活动面板：会话状态/转录流/OCR 预览/控制区多状态面板内聚（前端审查登记） | 若再增长：转录流与 OCR 预览拆至 LiveTranscriptStream.tsx / LiveOcrPreview.tsx |
| app/src/components/SessionListPanel.tsx | 501 | v0.7.1 拆分产物：列表域 UI（双模式搜索/筛选排序/课程分组折叠/批量操作栏/内联转化）内聚——筛选/排序/选择为面板本地状态 | 若再增长：批量操作栏与列表项拆至 SessionListRow.tsx |
| app/src/components/AiServicePanel.tsx | 390 | v0.8.0 M1（REQ-138/139/140）AI 服务设置面板：全局开关/密钥管理（掩码+DPAPI 保存）/端点模型/测试连接/余额卡片/授权确认卡/审计列表——配置面板 UI 内聚 | 若再增长：余额卡片与审计列表拆至 AiBalanceCard.tsx / AiAuditList.tsx |
| app/src/components/SessionDetailPanel.tsx | 371 | 会话详情面板：质量报告/段列表/OCR 概览/操作区单一面板完整交互流内聚（前端审查登记） | 若再增长：质量报告区拆至 SessionQualityReport.tsx |
| app/src/components/ProfileDetector.tsx | 330 | 档案检测组件：投票/确认流/记忆偏好 UI + v0.11.5 Task 5 冲突提示内聚（实测 2026-08-22） | 若再增长：确认流拆至 ProfileConfirmFlow.tsx |
| app/src/components/NoteEditView.tsx | 315 | 笔记编辑视图：编辑态/标签/结构面板内聚（前端审查登记） | 若再增长：结构面板拆至 NoteStructurePane.tsx |
| app/src/components/NoteGroupPanel.tsx | 545 | v0.11.0~4 笔记组侧栏：组列表/路由可见可改/碎片捕获/闪卡生成与复习入口/结算仪式/周契约卡/feed 碎片列表（周契约与碎片列表已拆独立组件 WeekContractCard/FeedFragmentList）——组域交互单一面板内聚；v0.11.5 树形合并（buildTree 消费/搜索新建工具条/受控展开组） | 若再增长：结算仪式区拆至 GroupSettlementPane.tsx |
| app/src/components/AiProviderSettings.tsx | 316 | v0.11.6 M1 code-review 修复（2026-08-22）：删除/清钥加 window.confirm、window.prompt 改卡片内联 password 输入（+2 state + 内联表单）、模型列表 input 改 textarea、fallbackOrder 透传 initial、run 置"处理中"反馈——修复净增约 41 行越线（实测 316，含 4 行豁免头注释） | 若再增长：内联密钥表单拆至 AiProviderKeyInput.tsx |

> 前端 **拆分中**（Task #9 笔记域修复进行中，暂不登记行数）：`app/src/types.ts`、`app/src/pages/NotesPage.tsx`——待前端拆分完成后以实测行数重新评估。
> 前端 SessionsPage.tsx 审查快照 304 行（登记值），v0.7.1 硬拆后长期 ≤300，本轮审查期间轻微越线；随 NotesPage/types.ts 拆分任务一并复核，若仍越线按上表模式登记。
> 前端 EnrichPanel.tsx 实测已回归 299 行（登记值 ~330 移除）。

## 已拆分 / 登记移除记录

> 已拆分：engine.rs（三维复审 #5 超时排空机制接入后逼近 600 行硬拆线）按登记计划将 worker 主循环与请求协议（AsrRequest/OcrRequest/双 worker 循环/词表纠错纯函数）拆至 engine_worker.rs（253 行）——engine.rs 回归 440 行（仍登记，300-600 区间），engine_worker.rs ≤300 行无需登记。
> 已拆分：db.rs（2026-08-21 H3 硬拆，原 678 行超 600 硬限违规）：schema 建表 + ensure_column 列迁移拆至 db_migrations.rs（204 行），notes CRUD 拆至 db_notes.rs（216 行，测试迁至 db_notes_tests.rs 265 行）——db.rs 回归 72 行（Db 结构体/连接锁/with_conn/通用工具），三新文件均 ≤300 行，登记移除。M3 锁中毒恢复（with_conn + into_inner）随拆分一并落地。
> 已拆分：live_session.rs（2026-08-21 Task #14 硬拆，实测 727 行超 600 硬限违规）：状态查询/控制方法簇（快照/暂停/停止/会话 id 查询）拆至 live_session_manager.rs（150 行），启动与预热生命周期（start/prepare/run_session/wait_prepared_ready）拆至 live_session_lifecycle.rs（288 行）——live_session.rs 回归 284 行（参数/结构体定义 + 构造 + run_session_after_engine 装配骨架），impl LiveSessionManager 跨文件分布，公共 API 签名零变化；三文件均 ≤300 行，登记移除。
> 已删除：live_pipeline_diag.rs（2026-08-21 L5 清理）——"诊断后删除"的临时诊断模块，确认 lib.rs 注册仅 test cfg 且无其他引用后整体移除。
> 已拆分：dxgi_capture.rs（原 ~333 行）于 v0.4.0 M0（TD-033，提交 2a88b25）将 DxgiState 拆至 dxgi_state.rs——现均 ≤300 行，无需登记。
> 已拆分：live_session_frame.rs（原 ~500 行登记）于 v0.6.0 ADR-011（REQ-086/087）按拆分计划将 process_frame 帧处理拆至 live_frame_process.rs。
> 已拆分：live_session.rs（原 ~798 行，v0.7.0 M0 X-O5 强制落地）按登记计划拆至 live_session_fusion.rs/live_session_loop.rs，并补充 live_session_persist.rs。
> 已拆分：streaming_asr.rs（原 ~378 行，v0.7.0 M0 X-O5 强制落地）按登记计划将端点处理块拆至 streaming_endpoint.rs。
> 已拆分：lib.rs（v0.7.5 超 600 行强制落地）按登记计划将 setup 初始化块拆至 app_setup.rs；后因命令注册与模块声明增长重新越线（实测 486），重新登记于上表。
> 已拆分：note_filter.rs（v0.7.5 净化接线后超 600 行风险）按登记计划将 boundary_candidates/apply_ai_decisions 拆至 note_filter_ai.rs（≤300）。
> 重新登记：live_session_frame.rs 于 2026-08 暂停/画面档多轮增长后重新越线（见上表）；live_session.rs 同轮越线并于 Task #14 完成硬拆（见上条已拆分记录），登记移除。
