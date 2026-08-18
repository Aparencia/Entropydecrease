# 单文件行数豁免登记（AGENTS.md §3：单文件 ≤300 行；300-600 行须登记本清单）

> 登记规则：文件超过 300 行时在此登记（文件 + 行数 + 豁免理由 + 拆分计划）。
> 超过 600 行必须硬拆（不允许豁免）。

| 文件 | 行数 | 豁免理由 | 拆分计划 |
|------|------|---------|---------|
| app/src-tauri/src/live_session.rs | ~351 | v0.3.0 后：FusionTracker + 会话编排循环 + 后台融合线程 + 句起/句尾跟踪四职责内聚于会话生命周期模块；拆出需跨函数传递 stop/epoch/speech_active/db/app 上下文 | 若再增长：融合线程任务拆至 live_session_fusion.rs，编排循环拆至 live_session_loop.rs |
| app/src-tauri/src/capture/audio_loopback.rs | ~320 | ADR-007 重连机制（重试循环/退避/恢复回调）内聚于捕获线程实现，拆出需跨函数传递 COM 生命周期参数，内聚性优先 | 若再增长：将 run_capture_inner 拆至 audio_loopback_session.rs |
| app/src-tauri/src/live_session_frame.rs | ~464 | 屏幕 worker 编排（采样调度/强制 OCR 兜底/投票器/字幕落库）+ 融合重写内聚 + M2 动态 ROI 接入；上下文参数多（stop/epoch/speech_active/DB/引擎/事件/缓存/ROI 跟踪器） | 若再增长：帧处理与融合重写拆至 live_frame_process.rs |
| app/src-tauri/src/engine.rs | ~382 | 引擎池装配（双 worker 编排 + ADR-009 设备状态 + M5 词表纠错 + M7 心跳/失败/缓存计数）；上下文参数与共享状态注入点多，拆出需跨模块传 10+ 参数 | 若再增长：worker 循环与请求处理拆至 engine_worker.rs |
| app/src-tauri/src/lib.rs | ~350 | Tauri 装配层（setup 初始化 + 决策链路 + 21+ command 注册）；全部为声明与装配，拆分会破坏注册可读性 | 若再增长：setup 初始化块拆至 app_setup.rs |
| app/src-tauri/src/vocab.rs | ~373 | 词表域（存储/纠错/候选提取/n-gram 分词）内聚；分词纯逻辑与存储同域便于单测 | 若再增长：collect_tokens/split_runs 拆至 vocab_tokens.rs |
| app/src-tauri/src/db_sessions.rs | ~303 | 会话仓储（会话/段/OCR 块/建议查询）；SQL 与行映射内聚 | 若再增长：recent_ocr_texts 等建议查询拆至 db_sessions_queries.rs |
| app/src/pages/ClassroomPage.tsx | ~467 | 装配层页面：左栏配置区（窗口选择/实时捕获/文件素材/视频导入/OCR 设备/词表）+ 右栏内容切换（活动面板/笔记预览/说明书） | v0.4.x 将左栏实时捕获面板拆出 LiveCaptureCard（状态与事件监听下沉） |
| app/src-tauri/src/video_profile.rs | ~325 | v0.5.0 M1（REQ-043）：档案域（类型/检测投票/记忆偏好/JSON IO）内聚；档案常量数据已拆至 video_profile_data.rs | 若再增长：检测投票与记忆偏好拆至 video_profile_detect.rs |
| app/src-tauri/src/layout_analyzer.rs | ~339 | v0.5.0 M3（REQ-047）：规则版版面分析（行/列投影 + 表格线检测 + 区域分类启发式）内聚于同一分类管线 | 若再增长：区域分类启发式拆至 layout_classify.rs |
| app/src-tauri/src/artifact_templates.rs | ~329 | v0.5.0 M7（REQ-052）：五档案模板函数（讲义/步骤卡/摘要/对话纪要/会议纪要）内聚于同一模板域，各模板共享原料注入签名 | 若再增长：会议/访谈模板拆至 artifact_templates_meeting.rs |
| app/src-tauri/src/db.rs | ~306 | v0.5.0 M9 增长：notes + sessions 三表 schema + ensure_column 幂等迁移（v0.5.0 M1/M4 两列迁移）+ 行映射；SQL 与迁移内聚 | 若再增长：ensure_column 迁移拆至 db_migrations.rs |
| app/src-tauri/src/live_session_frame.rs | ~500 | v0.5.0 M9 硬拆后：屏幕 worker 编排（采样调度/ROI/版面缓存/分区域 OCR 接入）内聚；关键帧与融合重写已拆至 live_keyframes.rs，分区域 OCR 在 region_ocr.rs | 若再增长：process_frame 帧处理拆至 live_frame_process.rs |
| app/src-tauri/src/commands_refine_inner.rs | ~301 | v0.5.0 模型版：课后精修编排（清单构建/降级决策/引擎懒加载/逐候选识别/产物回填/HTML→MD 转换）内聚于精修执行域 | 若再增长：html_to_markdown 拆至 html_table_md.rs |
| app/src-tauri/src/structure_models.rs | ~303 | v0.5.0 模型版：模型清单/独立状态机下载器（进度事件/.part 原子写/按需启用三分类）内聚 | 若再增长：download_one 拆至 structure_download.rs |

> 已拆分：dxgi_capture.rs（原 ~333 行）于 v0.4.0 M0（TD-033，提交 2a88b25）将 DxgiState 拆至 dxgi_state.rs——现 dxgi_capture.rs ~176 行、dxgi_state.rs ~219 行，均回归 ≤300 行，无需登记。
