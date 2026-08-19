# 单文件行数豁免登记（AGENTS.md §3：单文件 ≤300 行；300-600 行须登记本清单）

> 登记规则：文件超过 300 行时在此登记（文件 + 行数 + 豁免理由 + 拆分计划）。
> 超过 600 行必须硬拆（不允许豁免）。

| 文件 | 行数 | 豁免理由 | 拆分计划 |
|------|------|---------|---------|
| app/src-tauri/src/capture/audio_loopback.rs | ~430 | ADR-007 重连机制（重试循环/退避/恢复回调）内聚于捕获线程实现，拆出需跨函数传递 COM 生命周期参数，内聚性优先；2026-08 A1 硬暂停（端点 Stop/Start + 暂停时长补偿 + 残留缓冲清空）再增 | 若再增长：将 run_capture_inner 拆至 audio_loopback_session.rs |
| app/src-tauri/src/live_frame_process.rs | ~445 | v0.6.0 ADR-011 拆分（live_session_frame.rs >600 行硬拆产物）：帧处理域（网格差异触发/两级判变/带外事件驱动/UI 面板抑制/字幕落库）内聚；process_frame 上下文参数 20+，跨函数传递聚合会破坏内聚；六轮审查再增（区域空产出回退整帧 + has_useful_blocks 判定）至 ~491 | 若再增长：handle_subtitle_frame 与 persist_voted_subtitle 拆至 live_subtitle_persist.rs |
| app/src-tauri/src/engine.rs | ~439 | 引擎池装配（双 worker 编排 + ADR-009 设备状态 + M5 词表纠错 + M7 心跳/失败/缓存计数）；上下文参数与共享状态注入点多，拆出需跨模块传 10+ 参数 | 若再增长：worker 循环与请求处理拆至 engine_worker.rs |
| app/src-tauri/src/lib.rs | ~562 | Tauri 装配层（setup 初始化 + 决策链路 + 21+ command 注册）；全部为声明与装配，拆分会破坏注册可读性 | 若再增长：setup 初始化块拆至 app_setup.rs |
| app/src-tauri/src/vocab.rs | ~373 | 词表域（存储/纠错/候选提取/n-gram 分词）内聚；分词纯逻辑与存储同域便于单测 | 若再增长：collect_tokens/split_runs 拆至 vocab_tokens.rs |
| app/src-tauri/src/db_sessions.rs | ~309 | 会话仓储（会话/段/OCR 块/建议查询）；SQL 与行映射内聚 | 若再增长：recent_ocr_texts 等建议查询拆至 db_sessions_queries.rs |
| app/src/pages/ClassroomPage.tsx | ~548 | 装配层页面：左栏配置区（就绪清单/窗口选择/实时捕获/视频导入/OCR 设备/词表/素材）+ 右栏内容区；2026-08 审查硬拆（>600 违规）已拆出 ClassroomRightPane（右栏）与 MaterialInputPanel（素材+提取）回归 548 | 若再增长：将实时捕获卡片拆出 LiveCaptureCard（状态与事件监听下沉） |
| app/src-tauri/src/video_profile.rs | ~394 | v0.5.0 M1（REQ-043）：档案域（类型/检测投票/记忆偏好/JSON IO）内聚；档案常量数据已拆至 video_profile_data.rs | 若再增长：检测投票与记忆偏好拆至 video_profile_detect.rs |
| app/src-tauri/src/layout_analyzer.rs | ~475 | v0.5.0 M3（REQ-047）：规则版版面分析（行/列投影 + 表格线检测 + 区域分类启发式）内聚于同一分类管线；六轮审查再增（公式启发加固 + 低信息纯色方差滤除）至 ~475 | 若再增长：区域分类启发式拆至 layout_classify.rs |
| app/src-tauri/src/artifact_templates.rs | ~501 | v0.5.0 M7（REQ-052）：五档案模板函数（讲义/步骤卡/摘要/对话纪要/会议纪要）内聚于同一模板域，各模板共享原料注入签名 | 若再增长：会议/访谈模板拆至 artifact_templates_meeting.rs |
| app/src-tauri/src/db.rs | ~345 | v0.5.0 M9 增长：notes + sessions 三表 schema + ensure_column 幂等迁移（v0.5.0 M1/M4 两列迁移 + v0.7.0 M1 REQ-103 volume 列）+ 行映射；SQL 与迁移内聚 | 若再增长：ensure_column 迁移拆至 db_migrations.rs |
| app/src-tauri/src/region_tracker.rs | ~422 | v0.4.0 M2（REQ-037）起：ROI 跟踪状态机（播放区域检测/锁定聚簇/重扫/前台切换冻结）+ 纯函数单测内联；与 RoiTracker 状态强耦合 | 若再增长：lock_roi/prior_roi 纯函数拆至 region_lock.rs |
| app/src-tauri/src/commands_refine_inner.rs | ~301 | v0.5.0 模型版：课后精修编排（清单构建/降级决策/引擎懒加载/逐候选识别/产物回填/HTML→MD 转换）内聚于精修执行域 | 若再增长：html_to_markdown 拆至 html_table_md.rs |
| app/src-tauri/src/structure_models.rs | ~320 | v0.5.0 模型版：模型清单/独立状态机下载器（进度事件/.part 原子写/按需启用三分类）+ 2026-08 磁盘就绪判定（disk_done）内聚 | 若再增长：download_one 拆至 structure_download.rs |
| app/src-tauri/src/symbol_normalize.rs | ~370 | v0.6.0 M1（REQ-060）：口语符号映射域（映射表/上下文守卫/中文数字解析）内聚；数字解析与守卫共享字符判定 | 若再增长：parse_chinese_number/replace_number_runs 拆至 symbol_numbers.rs |
| app/src/pages/SessionsPage.tsx | ~390 | v0.6.0 M6 增长：会话列表（课程分组/段搜索）+ 详情（三视图/质量卡片/大纲侧栏/降级横幅）装配层内聚 | 若再增长：列表与详情拆至 SessionListPanel.tsx / SessionDetailPanel.tsx |
| app/src-tauri/src/commands_session.rs | ~350 | v0.6.0 M6 增长：会话命令域（CRUD/笔记预览单一管线/质量报告/课程分组/段搜索）内聚于会话生命周期域 | 若再增长：course/search 拆至 commands_session_extra.rs |
| app/src-tauri/src/note_filter.rs | ~390 | v0.6.0 M1（REQ-082/085）：笔记过滤域（过滤链 + 边界段分类 + AI 判定应用 + 画面要点净化）内聚于单一管线（双出口一致性由构造保证） | 若再增长：boundary_candidates/apply_ai_decisions 拆至 note_filter_ai.rs |
| app/src-tauri/src/fusion_tests.rs | ~392 | 融合测试域（ADR-005 四规则 + REQ-062 概率加权 + REQ-103 音量透传 + REQ-111 切分对齐）单模块 #[path] 挂载；测试文件沿用单模块模式未拆 | 若再增长：REQ-111 切分对齐组拆至 fusion_split_tests.rs |
| app/src-tauri/src/analysis.rs | ~344 | v0.5.0 M2 起结构化分析编排域（章节/重点/术语/讲者 + v0.7.0 M1.5 事件消费 + M2 step_boundaries/practice_segments/player_actions 三字段 + 审查修复按类型判定）；各机制输出聚合内聚于单一分析函数 | 若再增长：build_chapter_signals 事件版拆至 analysis_signals.rs |
| app/src-tauri/src/live_session_loop.rs | ~360 | v0.7.0 M0 拆分产物（音频编排循环）：主循环 + 长静音/音量骤变/VAD 段事件写入（审查补接线）+ drain/停止 flush；LiveLoopCtx 聚合上下文；2026-08 A1 暂停边沿（断句隔离/事件/落库）+ P1 停止 drain 重构再增 | 若再增长：事件写入块拆至 live_session_events.rs |
| app/src-tauri/src/analysis_tests.rs | ~339 | 分析编排测试域（档案门控矩阵 + REQ-108 事件消费 + M2 三字段）单模块 #[path] 挂载 | 若再增长：事件消费组拆至 analysis_events_tests.rs |
| app/src-tauri/src/video_profile_tests.rs | ~338 | 档案测试域（12 档案断言矩阵 + 检测投票 + JSON 校准）单模块 #[path] 挂载 | 若再增长：档案矩阵拆至 video_profile_data_tests.rs |
| app/src-tauri/src/artifact_templates_tests.rs | ~336 | 产物模板测试域（五档案模板 + v0.7.0 M2 代码块/步骤卡扩展）单模块 #[path] 挂载 | 若再增长：代码块/步骤卡组拆至 artifact_code_tests.rs |
| app/src-tauri/src/asr_merge.rs | ~351 | v0.5.0 ADR-012 F4-1 语义合并域 + v0.7.0 M2 REQ-119 混排空格（spacing_for/merge_segments_with_spacing）；合并决策与切分共用标点常量 | 若再增长：split_sentences/split_timestamps 拆至 asr_merge_split.rs |

> 已拆分：dxgi_capture.rs（原 ~333 行）于 v0.4.0 M0（TD-033，提交 2a88b25）将 DxgiState 拆至 dxgi_state.rs——现 dxgi_capture.rs ~176 行、dxgi_state.rs ~219 行，均回归 ≤300 行，无需登记。
> 已拆分：live_session_frame.rs（原 ~500 行登记）于 v0.6.0 ADR-011（REQ-086/087）按拆分计划将 process_frame 帧处理拆至 live_frame_process.rs——现 live_session_frame.rs ~175 行回归 ≤300 行，登记移除。
> 已拆分：live_session.rs（原 ~798 行，v0.7.0 M0 X-O5 强制落地）按登记计划拆至 live_session_fusion.rs（融合线程）/live_session_loop.rs（音频编排循环），并补充 live_session_persist.rs（定稿落库/Final 事件处理）——现 live_session.rs ~284 行、live_session_loop.rs ~228 行、live_session_persist.rs ~224 行、live_session_fusion.rs ~95 行，均回归 ≤300 行，登记移除。
> 已拆分：streaming_asr.rs（原 ~378 行，v0.7.0 M0 X-O5 强制落地）按登记计划将端点处理块拆至 streaming_endpoint.rs（子模块）——现 streaming_asr.rs ~248 行、streaming_endpoint.rs ~95 行，均回归 ≤300 行，登记移除。
> 重新登记：live_session.rs（2026-08 A1 硬暂停 manager 方法 + P3 引擎预热交接后 ~354 行）与 live_session_frame.rs（A1 暂停冻结 + P2 自动暂停后 ~335 行）重新超 300 行——live_session.rs 若再增长将 start 交接块拆至 live_session_handoff.rs；live_session_frame.rs 若再增长将暂停轮询块拆至 live_auto_pause.rs。
