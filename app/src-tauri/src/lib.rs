//! 熵减桌面应用入口（Tauri 装配层）。
//!
//! @ai-context: 本文件只做模块声明与应用装配（插件注册 / 状态初始化 / command 注册），
//!              不含业务逻辑；业务自底向上分布：types → concat/db → asr/ocr → engine → commands。
//! @ai-context: AppState 在 setup 时初始化：SQLite 数据库 + 常驻引擎池（后台加载 ASR/OCR 模型）。

mod ai_guardrails;
mod ai_judge;
mod ai_mock;
mod ai_protocol;
mod ai_text_filter;
// v0.16.1：WebView2 浏览器痕迹去除（原生右键菜单全局禁用——Windows host 侧设置）
mod browser_chrome;
// v0.8.0 M1（REQ-138/139/140）：AI 使能层——全局设置（授权红线默认关）/
// 密钥凭据存储（DPAPI）/余额查询/共享 AI client（ai_text_filter 与 M2/M3
// ai_note_refine/ai_enrich 共用）
mod ai_balance;
mod ai_client;
mod ai_credentials;
mod ai_settings;
// v0.11.6 M1：AI Provider 配置模型——BYOK 多端点（SiliconFlow/DeepSeek/
// OpenRouter/Ollama），预设模板 + 旧版迁移 + 降级链数据层
mod ai_provider;
// v0.11.5 spec 7️⃣（2026-08-22）：AI 精修输入锚点剥离（段落锚点剥除省 token；
// 章节锚点记录映射、精修输出回挂）——纯函数，只依赖 std
mod anchor_strip;
// v0.8.0 M2（REQ-141/145 + REQ-143 基础版）：AI 精修——协议/任务状态机/
// 成本估算/段级 diff/适配器/命令层
mod ai_refine_protocol;
mod ai_task;
mod ai_cost;
// 2026-09-11（DeepSeek V4.1 适配批）：请求级 provider 策略纯函数
// （json_object 前置条件 / 错误体提取 / 思考模式开关）
mod ai_request_policy;
mod note_diff;
mod ai_note_refine;
mod ai_proofread;
mod commands_proofread;
// v0.8.0 F2-B4（2026-08-21）：精修任务执行（自 commands_ai_refine 拆出——
// 并发切片/单片重试/部分成功；豁免清单拆分计划兑现）
mod ai_refine_task;
// v0.17.0（REQ-246）：笔记级精修任务（输入=笔记内容传参；基线=当前笔记版；
// profile=handwritten——手写笔记刚需，复用并发/收尾骨架）
mod ai_note_refine_task;
// v0.17.0（REQ-245）：精修策略层——维度/档位/意图声明（JSON v3）解析、
// 指令拼装、任务覆盖/全局默认回退链（纯函数；策略只改提示词）
mod ai_strategy;
mod commands_ai_refine;
// v0.17.0（REQ-246）：笔记级精修 commands（估计/启动/采纳——版本链复用）
mod commands_ai_note_refine;
// v0.8.0 M3（REQ-142）：知识补充——协议（九子项/B6 无链接约束）/混合落位/
// 适配器/命令层
mod ai_enrich_protocol;
mod enrich_placement;
// v0.8.0 M3 修复（2026-09）：知识补充逐块审查/章节提取纯函数层
// （丢坏块保好块——原全有或全无校验让单个缺锚点块连坐整批）
mod enrich_salvage;
mod ai_note_enrich;
mod commands_ai_enrich;
// v0.8.0 M4（REQ-144 + REQ-143 完整）：笔记版本管理——快照链数据层/成本
// 记录/纯逻辑/命令层
mod note_version;
mod db_notes_versions;
// REQ-287（v0.19.7）：笔记手动排序数据层（scope 独立表）
mod db_note_orders;
mod commands_note_orders;
mod db_ai_usage;
// v0.8.0 F2（2026-08-21）：AI 任务中心持久化——任务记录/结果恢复/保留策略
mod db_ai_tasks;
mod commands_notes_version;
// v0.16.0（REQ-224/225/230）：AI 对话——纯函数层（消息组装/SSE 解析/
// 轨迹序列化）+ 流式发送 + 会话/消息持久化 + 命令层 + 客户端解析（审查拆分）
mod ai_chat;
mod db_ai_chat;
mod ai_chat_stream;
mod ai_chat_client;
mod commands_ai_chat;
mod asr;
mod tasks_core;
mod db_task_index;
mod db_completion;
mod commands_tasks;
mod db_sop;
mod commands_sop;
mod db_practice;
mod db_questions;
mod commands_after;
mod web_capture;
mod db_web;
mod commands_web;
mod web_inbox;
mod commands_web_inbox;
mod web_snapshot;
mod asr_clean;
mod asr_confusion;
mod asr_dedupe;
mod asr_health;
mod asr_merge;
mod asr_pass2;
mod asr_rescore;
mod analysis;
mod artifact;
mod artifact_templates;
mod audio_event_filter;
// pub：bin/cer_bench.rs（REQ-101 CER 微基准工具）引用 AudioPreprocessor
// （审查 H1 修复：私有模块使 bin 无法编译，完整 cargo test 失败）
pub mod audio_preprocess;
// v0.7.0 M1（REQ-101）：音频预处理链持久化配置（CER 微基准定默认后的用户开关）
mod audio_preproc_config;
// v0.7.0 M2（REQ-126）：分应用音频路由探针（WASAPI 会话级 API 面 spike）
mod audio_route_probe;
mod audio_store;
// v0.7.0 M1（REQ-107，TRUST-1）：数据备份/恢复（SQLite+图+音频 zip 打包/解压）
mod backup;
mod capture;
// v0.11.2：组→闪卡生成纯函数（词汇表块/碎片多句两类卡源）
mod card_generate;
// v0.7.0 M1（REQ-101）：CER 计算（预处理链默认值定标的微基准依据）
// pub：bin/cer_bench.rs 引用（审查 H1 修复，同 audio_preprocess）
pub mod cer;
// v0.20.0（REQ-263）：asr_eval 自验证 harness 纯函数层——混淆画像/样本侧/报告回归门
// pub：bin/asr_eval.rs 引用（同 cer.rs 先例；dead_code 豁免见各模块头注）
pub mod eval_confusion;
pub mod eval_report;
pub mod eval_samples;
// v0.20.0 M2b：会话信道（字幕/弱参考分档 + dtw 漂移适配层，见模块头注）
pub mod eval_session;
mod chapter_detect;
// v0.7.0 M1（REQ-104/132）：剪贴板信号（文本信号 + 图片直贴；内存态，arboard 轮询）
mod clipboard_signal;
mod commands;
// v0.11.0（REQ-195~198）：笔记组命令层（列表/详情/自建/改判/移动）
mod commands_groups;
// REQ-315（v0.20.11 批 6）：组排序/置顶命令层（pin + note_group_orders 分区快照）
mod commands_group_orders;
// v0.11.1：feed 进料口命令层（功能开关/碎片捕获/列表）
mod commands_fragments;
// v0.11.2：闪卡与复习命令层（生成/复习队列/评分/自测）
mod commands_flashcards;
// v0.11.3：组结算命令层（计划/执行/核心提炼——防沼泽仪式）
mod commands_settlement;
// v0.13.1（REQ-202~205）：知识体系命令层——共享校验 + 体系/问题树（commands_knowledge_systems）
// + 概念/模型/引用/审计（commands_knowledge_core）；源单文件按规格 §四拆（>300 行豁免拆）
mod commands_knowledge;
mod commands_knowledge_systems;
mod commands_knowledge_core;
// v0.14 C2：知识图谱命令层（graph_snapshot 单次聚合）
mod commands_graph;
// v0.18.0（REQ-248~250）：学习目标命令层（目标 CRUD/绑定/进度/埋点）
mod commands_goals;
// v0.18.1（REQ-255~257）：目标生命周期命令（毕业仪式/回顾流/放弃/毕业档案）
mod commands_goals_lifecycle;
// v0.18.2（REQ-251~254）：AI 目标规划——estimate/plan/摘要注入/概念弱信号
mod commands_goals_plan;
// v0.13.2（REQ-206~207）：概念模型卡命令层（创建/组列表）——卡→概念升格拆至 promote 子模块
mod commands_knowledge_cards;
mod commands_knowledge_cards_promote;
// v0.13.3（REQ-208~210）：决策与应用命令层（decision/application 一表两面；log_application 事务）
mod commands_knowledge_decisions;
// v0.13.8：知识体系画布命令层（节点位置 + 体系视口读写）
mod commands_knowledge_canvas;
// v0.11.4：周契约命令层（弹性承诺呈现层——upsert/状态读数）
mod commands_colors;
mod db_colors;
mod commands_contracts;
// 实时会话链路依赖 Windows 捕获 API（WASAPI/DXGI/COM），非 Windows 平台不编译（TD-027 修复）
#[cfg(target_os = "windows")]
mod commands_live;
// v0.11.7（图文会话，ADR-020）：图文采集命令层（截屏导入第三动线；与实时捕获互斥）
mod commands_photo;
mod commands_ai;
// v0.8.0 M1（REQ-138/139/140）：AI 使能层命令——密钥管理/余额/授权/审计
mod commands_ai_settings;
// v0.11.6 M1（BYOK 多端点）：AI Provider 管理命令——预设/列表/增删改/密钥/默认/测试
mod commands_ai_providers;
mod commands_analysis;
mod commands_artifacts;
mod commands_audio;
mod commands_asr_confusion;
mod commands_asr_pass2;
// v0.7.0 M1（REQ-107，TRUST-1）：备份/恢复 command（数据目录 zip 打包/解压）
mod commands_backup;
mod commands_device;
mod commands_diag;
mod commands_images;
// v0.10.1：笔记图片命令——显示解析/本地导入/data_dir 基准
mod commands_note_images;
mod commands_import;
mod commands_refine;
mod commands_refine_inner;
mod commands_session;
// v0.7.6 审查硬拆：会话 → 笔记转换管线（原料装载/结构渲染/单条转换/批量编排/预览）
mod commands_session_note;
// 批 4（会话页交互矩阵）：批量删除会话（单事务原子；语义/广播与单条一致）
mod commands_session_delete;
// v0.11.5（spec 8️⃣）：会话详情术语表——词汇表移出笔记后直供前端展示
mod commands_session_glossary;
// v0.7.7（REQ-182/183/184）：结构图命令层——批量捕获/手动框选/列表/删除
mod commands_structures;
mod commands_streaming;
mod commands_vocab;
mod commands_video;
// v0.12.0 M6（采集体验债）：采集浮窗窗口命令（open/close_capture_float）
mod commands_window;
// v0.12.0 M3（交互债）：系统级覆盖层截图命令（open/close/submit/cancel）
mod commands_overlay;
mod concat;
mod db;
// H3 拆分（db.rs 原 678 行硬拆）：schema 建表/列迁移 + notes 读写独立成块
mod db_migrations;
mod db_notes;
// REQ-277（v0.19.4）：笔记/会话对外不可变 uid（生成/回填/幂等确保）
mod db_uid;
// REQ-278（v0.19.4）：data:* 通用变更事件总线（写命令落库后广播）
mod notify;
// v0.11.0（REQ-195）：笔记组数据层（统一产物层唯一容器，v4 §7.4）
mod db_note_groups;
// REQ-316（v0.20.12 批 7）：组删除行语义 + 空组自动清理（写事务内判定，无清扫任务）
mod db_note_group_clean;
// REQ-315（v0.20.11 批 6）：组手动排序表 + 置顶更新（kind 分区快照）
mod db_note_group_orders;
// v0.11.1：碎片原料层数据读写（fragments 表；碎片不是笔记，独立身份）
mod db_fragments;
// v0.11.2：闪卡/复习日志/指标事件数据层（学习循环统一）
mod db_flashcards;
// v0.11.3：结算记录数据层（settlements 表 + 归档候选判据）
mod db_settlements;
// v0.11.4：周契约数据层（contracts 表 + 按周取数）与周聚合纯函数
mod db_contracts;
mod week_contract;
// v0.13.1（REQ-202~205）：知识体系基建——原子层纯函数 + 六张数据表
mod knowledge_pure;
// v0.13.2（REQ-206）：概念卡卡面契约纯函数
mod knowledge_card;
mod db_knowledge_systems;
mod db_knowledge_nodes;
mod db_knowledge_concepts;
mod db_knowledge_models;
mod db_knowledge_links;
mod db_knowledge_audits;
// v0.13.3（REQ-208）：决策与应用数据层（knowledge_decisions 一表两面；used_refs 结构契约在 knowledge_pure）
mod db_knowledge_decisions;
// v0.13.8：画布数据层（knowledge_nodes 位置列读写 + knowledge_canvas_states 视口读写）
mod db_knowledge_canvas;
// v0.14 C2：知识图谱快照数据层（graph_snapshot 三类边单次聚合）
mod db_graph;
// v0.18.0（REQ-248~250）：学习目标——意图层（goals 三表 + 进度现算聚合）
mod db_goals;
mod db_goals_progress;
// v0.14 D：采集质量纯函数层——章节形态决策/OCR 质量分/版面重建/行合并评分/跨帧增量
mod chapter_morph;
mod ocr_quality;
mod layout_reorder;
mod line_merge;
mod incremental_merge;
// v0.14 D：行级重识别引擎（adapter 编排）与平台版面模板（三层降级）
mod line_rec_engine;
mod platform_layout;
// v0.14 D：章节级混合形态组装（图文章节/口语章节混编 + 质量门控）
mod chapter_note;
mod db_artifacts;
// v0.7.7（REQ-183）：结构图记录存储——session_structure_images 表 CRUD
mod db_structures;
// v0.7.0 M1.5（REQ-108）：会话信号事件数据层（统一信号事件表读写）
mod db_session_events;
mod db_sessions;
// v0.11.5：会话显示序号纯函数（列表展示编号与内部 id 分离，删除后归位）
mod session_display;
// v0.7.0 M3（REQ-133）：图内文字检索（OCR 块视图）
mod db_ocr_search;
mod db_sessions_rows;
mod db_session_refine;
mod device_config;
// v0.6.0 M2（REQ-063）：DTW 时序对齐（spike 机制先行，真机校准待 M4 落盘）
// v0.20.0（REQ-263）：mod → pub——asr_eval harness 复用（漂移估计分布；bin 为 crate 外消费者）
pub mod dtw_align;
// GPU 适配器探测依赖 DXGI（Windows）；决策纯逻辑在 device_config（全平台）
#[cfg(target_os = "windows")]
mod device_probe;
mod engine;
mod engine_worker;
mod error;
// v0.11.1：功能开关（feed_capture 默认关；v4 §11.3 交付层纪律）
mod feature_flags;
mod ffmpeg;
// v0.7.0 M2（REQ-123）：跟练档案步骤边界检测（口令/练习段/示范跟练交替三信号）
mod follow_along_detect;
mod formula_reconstruct;
mod frame_cluster;
mod frame_features;
// REQ-281（v0.19.6）：画面停更监测（WGC watchdog 纯状态机）
mod frame_liveness;
// v0.7.0 M2（REQ-128）：前台时间线（前台切换事件落库 + 实践段标记）
mod foreground_timeline;
mod fusion;
mod glossary;
mod budget_allocator;
// v0.19.0（REQ-258，ADR-029）：检索与发现层——派生索引（kb_chunks/kb_fts/
// kb_meta：节级切块/影子表双写/混合检索/全量重建/stats）+ 命令层
mod kb_chunk;
mod kb_fts;
mod kb_index;
mod kb_reindex;
mod kb_search;
// REQ-259（v0.19.5）：kb 检索语义合流（RRF 融合独立模块——行数拆分）
mod kb_search_semantic;
mod commands_kb;
// v0.19.1（REQ-260）：学习库问答编排（检索分支分流——纯聊链路零改动）
mod kb_prompt;
mod commands_ai_chat_kb;
// v0.19.3（REQ-261）：检索建议（发现路径）——证据候选/跨体系相似提示
mod kb_discovery;
// REQ-259（v0.19.5）：kb 语义索引 embedding 契约与纯函数（编解码/cosine top-K）
mod kb_embed;
// REQ-259（v0.19.5）：bge-small-zh BERT WordPiece 分词（vocab.txt 加载/编码）
mod kb_embed_tokenizer;
// REQ-259（v0.19.5）：bge-small-zh ONNX 推理引擎（ort 封装 + CLS/L2）
mod kb_embed_onnx;
// REQ-259（v0.19.5）：kb 向量回填存储（全量重建后置嵌入 + kb_meta 元数据）
mod kb_embed_store;
mod commands_kb_discovery;
mod concept_weakness;
mod goal_interview;
mod goal_plan_prompt;
mod goal_plan_protocol;
mod goal_progress;
mod goal_retro;
mod goal_rules;
mod goal_schema;
mod goal_summary;
// v0.11.0（REQ-196）：结构密度路由纯函数（组路由三态，golden 用例先行）
mod group_route;
mod health_check;
mod highlight_detect;
mod idle_governor;
// v0.7.0 M3（REQ-088）：关键图图注生成（本地规则，影子层）
mod image_caption;
// v0.7.0 M3（REQ-134）：图片内容裁剪/去白边（纯函数）
mod image_crop;
mod image_store;
// v0.7.0 M1.5（REQ-110）：图像流存储层（时间轴帧序列——图像优先档）
mod image_stream_store;
mod import;
// v0.7.0 M2（REQ-127）：抢话/打断检测（代理信号版——不依赖讲者识别）
mod interruption_detect;
mod import_frame;
// v0.7.0 M2（REQ-113）：导入音轨转写（import.rs 拆出——重叠窗合并转写）
// v0.5.0 M3（REQ-047）：规则版版面分析（行/列投影 + 表格线检测 + 区域分类启发式）
mod layout_analyzer;
// v0.5.0 M3：版面缓存（事件帧触发复用）——v0.12.0 M5 补完成后视频会话不再做
// 全帧 OCR（ADR-023），实时链路无生产调用方；纯函数与单测保留（供未来图文/
// 结构场景复用），登记 dead_code 豁免（机制先行模式，image_caption 先例）。
#[allow(dead_code)]
mod layout_cache;
// v0.7.0 M2（REQ-113）：导入音轨转写（import.rs 拆出——重叠窗合并转写）
mod import_transcribe;
#[cfg(target_os = "windows")]
mod live_session;
// v0.7.0 M0 X-O5：live_session.rs 798 行超限硬拆——音频主循环/定稿落库/融合线程
#[cfg(target_os = "windows")]
mod live_session_loop;
#[cfg(target_os = "windows")]
mod live_session_persist;
#[cfg(target_os = "windows")]
mod live_session_fusion;
// ADR-011 拆分：帧处理（网格差异触发/字幕 OCR/面板抑制）独立模块
#[cfg(target_os = "windows")]
mod live_frame_process;
#[cfg(target_os = "windows")]
mod live_session_frame;
// P3：引擎预热（预备线程——选窗口阶段后台加载，start 交接）
#[cfg(target_os = "windows")]
mod live_session_prepare;
// Task #14 硬限拆分：管理器查询/控制方法簇 + 启动/预热生命周期
#[cfg(target_os = "windows")]
mod live_session_manager;
#[cfg(target_os = "windows")]
mod live_session_lifecycle;
// 批 2a（暂停来源单状态机）：pause_state=机器层+request API+seq/edge 槽
// （audio_loopback 别名换装 SessionPause）；live_session_pause=主循环暂停
// 边沿收敛域（flush_no_rescore/漏边沿代数补偿/边界切断）；foreground_pause=
// 前台自动暂停门控（ForegroundGate 滞回状态机）
#[cfg(target_os = "windows")]
mod pause_state;
#[cfg(target_os = "windows")]
mod live_session_pause;
#[cfg(target_os = "windows")]
mod foreground_pause;
#[cfg(target_os = "windows")]
mod live_keyframes;
mod load_monitor;
// v0.7.0 M1（REQ-106，TRUST-4）：诊断日志脱敏（OCR 文本/会话标题等敏感内容过滤）
mod log_redact;
mod model_downloader;
// v0.7.0 M3（REQ-131）：模型版本管理与磁盘占用（可查可回退）
mod model_registry;
// REQ-291（v0.19.7）：视频随播随停——声画双通道检测纯状态机
mod media_state;
mod note_filter;
mod note_filter_ai;
mod note_filter_discourse;
// 观察 2026-09-05-2：NDJSON 流式喂入缓冲纯函数（审查收口）
mod ndjson_feed;
// v0.12.0 M1（ADR-021）：正文源多态——BodySource 判定 + OCR 精简过滤链
mod note_body_source;
mod note_filter_ocr;
// v0.11.0（REQ-197）：容器侧组化业务层（系列课程组 + 结构密度路由）
mod note_group_assign;
// v0.8.0 F1（REQ-141 丢图修复）：精修版配图本地合并降级（协议 v2 image 块兜底）
mod note_image_merge;
mod novelty;
mod ocr;
mod ocr_correction;
// v0.7.0 M2（REQ-120）：OCR 错误模式校准表（混淆画像 → 替换词候选）
mod ocr_confusion;
mod ocr_cache;
mod outline;
mod playback_region;
// v0.7.0 M2（REQ-125）：播放器行为信号（暂停检测 + M17 倍速缩放采样）
mod player_behavior;
// v0.11.7（图文会话，ADR-020）：图文截图保存 + OCR 编排（业务模块，命令层在 commands_photo）
mod photo_capture;
mod practice_detect;
mod quality_report;
mod purify_config;
mod refine;
// REQ-290 ②（v0.19.7）：精修输出预算化（档位缩放纯函数）
mod refine_budget;
// v0.11.2：间隔重复调度器（FSRS-6；弹性承诺无 streak，ADR-018）
mod scheduler;
// v0.11.3：组结算纯函数（阈值/周期双触发 + 重复合并判据）
mod settlement;
mod region_ocr;
mod region_tracker;
mod streaming_asr;
mod structure_engine;
mod structure_models;
// v0.7.6（REQ-177/178）：笔记结构渲染层——章节标题 + 词汇表块（纯函数）
mod structure_note;
// v0.7.7（REQ-182；v0.10.2 重构）：结构图检测纯函数——diagram_likeness + decide_keep 四层过滤
mod structure_detect;
// v0.7.7（REQ-182；v0.10.2 重构）：结构图批量捕获管线——直扫参考图集→版面→四层过滤→裁剪→入库
mod structure_capture;
// v0.7.7（REQ-183）：结构图存储——struct/ 命名空间 + 独立预算 + 去重
mod structure_store;
mod structure_tier;
mod stutter_fold;
mod subtitle;
mod subtitle_detect;
mod subtitle_ocr;
mod speaker_change;
// v0.7.2（REQ-152）：视频系列（合集）检测——标题序列号提取/平台后缀剥离（纯逻辑）
mod series_detect;
// v0.7.2（REQ-151）：会话信息聚合——采集信息面板数据源（平台/时长/合集/字幕）
mod screen_merge;
mod screens;
mod screen_tracker;
mod session_info;
// v0.7.2（REQ-153）：说话人 embedding 引擎（弱化版讲者分离离线分析）
mod speaker_engine;
// TD-2026-08-20-D 清偿（G1）：说话人模型下载器（wespeaker 应用内一键下载）
mod speaker_download;
mod commands_speaker;
// v0.7.0 M1.5（REQ-108）：统一信号事件域（类型/分级/容量守卫；数据层在 db_session_events）
mod session_events;
mod symbol_normalize;
mod table_reconstruct;
mod title_rules;
mod types;
mod ui_junk;
mod vad_adaptive;
// v0.7.0 M2（REQ-115）：VAD 阈值共享槽（会话线程发布、诊断面板读取）
mod vad_threshold_slot;
mod verbal_normalize;
mod video_profile;
mod video_profile_data;
// v0.9.0 M1（REQ-188）：视频档案框架 v2 四维解耦数据模型（形态×画面档×领域×语言）
mod video_profile_spec;
mod video_profile_spec_data;
// v0.9.0 M2（REQ-189）：画面价值档位检测（三信号投票 + 重评窗口 + 升降档裁决）
mod video_tier_detect;
// v0.9.0 M3（REQ-190）：内容领域标签体系（粗 20 领域 + 细标签 + 四来源检测；
// v0.13.6：粗 15→20 + curated 细目两层——REQ-220）
mod video_profile_domain;
mod video_profile_domain_data;
mod video_profile_domain_fine;
mod video_profile_domain_fine_data;
// v0.13.6（REQ-221）：平台分区映射表（B站 分区 → 形态/粗领域/细目）
mod video_profile_platform_map;
mod video_profile_platform_map_data;
// v0.9.0 M4（REQ-191）：平台信号适配（bilibili/local 轻量适配 + OCR 标签通用化）
mod platform_adapter;
// v0.9.0 M5（REQ-193）：叙事结构检测（故事线/结构化条目/直接教学 模板变体）
mod narrative_detect;
mod vocab;
mod watermark_filter;
// v0.7.0 窗口过滤增强：站点首页判定/可捕获性纯逻辑（2026-08 用户需求）
mod window_filter;
mod windows;

// L5 清理：live_pipeline_diag 为"诊断后删除"的临时模块（仅 test cfg 注册，
// 无其他引用）——实时链路无 OCR 根因已定位，模块文件与注册一并移除。

// v0.7.5（line-limit-exemptions 登记计划）：setup 装配块拆至 app_setup.rs——
// lib.rs 只保留声明与 command 注册（>600 行硬拆落地）
mod app_setup;
// 批 0-C3 Task 1（2026-09-11）：334 条 command 注册清单整体移至 app_commands.rs——
// 单文件形态的理由（generate_handler 宏的 Invoke 按值语义使分域组合不可行）见该文件头。
mod app_commands;

use tauri::{Emitter, Manager, WindowEvent};

use commands::AppState;

/// 构造标点恢复模型路径（ADR-012 F4-2：models/punctuation/；缺失 → None 降级）。
///
/// @ai-context: 与 download-punctuation.mjs 的目录约定一致；模型缺失时引擎
///              零开销降级（无标点，现状行为），不阻断 ASR。
/// @ai-context: crate 根级共享（commands_live.rs 实时会话装配引用——非 setup
///              专用，故留在 lib.rs 而非 app_setup.rs）。
fn punctuation_model(model_dir: &std::path::Path) -> Option<String> {
    let p = model_dir.join("punctuation/model.int8.onnx");
    p.exists().then(|| p.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 三维复审 #8：opener 插件已移除——应用内无外链打开需求，
        // 保留只会扩大 IPC 攻击面（前端 @tauri-apps/plugin-opener 同步移除）
        .plugin(tauri_plugin_dialog::init())
        // ADR-025（v0.12.6）：浮窗全局快捷键 Ctrl+Shift+F——锁定态浮窗不可点
        // 且主窗已隐藏，全局键是唯一解锁/切换入口；注册窗口期=浮窗打开期
        // （open/close 在 commands_window.rs 内 register/unregister）
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        if let Err(e) = crate::commands_window::float_toggle_core(app) {
                            eprintln!("[capture-float] 全局快捷键切换失败: {}", e);
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            // AppState 装配（数据目录/DB/引擎池/可校准配置——拆至 app_setup.rs，
            // line-limit-exemptions 登记计划：lib.rs >600 硬拆落地）
            crate::app_setup::setup_app_state(app).map_err(Box::<dyn std::error::Error>::from)?;
            // v0.16.1：浏览器原生右键菜单全局禁用——失败仅日志（降级=原生菜单，
            // 前端 contextmenu preventDefault 兜底；文本输入右键粘贴由前端自绘小菜单补齐）
            if let Some(main) = app.get_webview_window(crate::commands_window::MAIN_WINDOW_LABEL) {
                if let Err(e) = crate::browser_chrome::disable_default_context_menu(&main) {
                    eprintln!("[browser-chrome] 主窗禁用默认右键菜单失败: {e}");
                }
            }
            Ok(())
        })
        // ADR-007：采集进行时拦截窗口关闭——prevent_close + 通知前端弹确认框；
        // 用户确认后前端先 stop_live_session 再 close（届时无活动会话，放行）
        .on_window_event(|window, event| {
            // 非 Windows 平台不编译实时链路，消除未使用变量警告
            #[cfg(not(target_os = "windows"))]
            let _ = (window, event);
            #[cfg(target_os = "windows")]
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if state.live_session.active_session_id().is_some() {
                    api.prevent_close();
                    let _ = window.emit("app:close-requested", ());
                }
            }
        })
        .invoke_handler(app_commands::handle())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
