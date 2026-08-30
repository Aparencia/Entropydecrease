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
mod note_diff;
mod ai_note_refine;
// v0.8.0 F2-B4（2026-08-21）：精修任务执行（自 commands_ai_refine 拆出——
// 并发切片/单片重试/部分成功；豁免清单拆分计划兑现）
mod ai_refine_task;
mod commands_ai_refine;
// v0.8.0 M3（REQ-142）：知识补充——协议（九子项/B6 无链接约束）/混合落位/
// 适配器/命令层
mod ai_enrich_protocol;
mod enrich_placement;
mod ai_note_enrich;
mod commands_ai_enrich;
// v0.8.0 M4（REQ-144 + REQ-143 完整）：笔记版本管理——快照链数据层/成本
// 记录/纯逻辑/命令层
mod note_version;
mod db_notes_versions;
mod db_ai_usage;
// v0.8.0 F2（2026-08-21）：AI 任务中心持久化——任务记录/结果恢复/保留策略
mod db_ai_tasks;
mod commands_notes_version;
// v0.16.0（REQ-224/225/230）：AI 对话——纯函数层（消息组装/SSE 解析/
// 轨迹序列化）+ 流式发送 + 会话/消息持久化 + 命令层
mod ai_chat;
mod db_ai_chat;
mod ai_chat_stream;
mod commands_ai_chat;
mod asr;
mod asr_clean;
mod asr_dedupe;
mod asr_health;
mod asr_merge;
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
mod chapter_detect;
// v0.7.0 M1（REQ-104/132）：剪贴板信号（文本信号 + 图片直贴；内存态，arboard 轮询）
mod clipboard_signal;
mod commands;
// v0.11.0（REQ-195~198）：笔记组命令层（列表/详情/自建/改判/移动）
mod commands_groups;
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
// v0.11.0（REQ-195）：笔记组数据层（统一产物层唯一容器，v4 §7.4）
mod db_note_groups;
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
mod device_config;
// v0.6.0 M2（REQ-063）：DTW 时序对齐（spike 机制先行，真机校准待 M4 落盘）
mod dtw_align;
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
// v0.7.0 M2（REQ-128）：前台时间线（前台切换事件落库 + 实践段标记）
mod foreground_timeline;
mod fusion;
mod glossary;
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
#[cfg(target_os = "windows")]
mod live_keyframes;
mod load_monitor;
// v0.7.0 M1（REQ-106，TRUST-4）：诊断日志脱敏（OCR 文本/会话标题等敏感内容过滤）
mod log_redact;
mod model_downloader;
// v0.7.0 M3（REQ-131）：模型版本管理与磁盘占用（可查可回退）
mod model_registry;
mod note_filter;
mod note_filter_ai;
mod note_filter_discourse;
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
            crate::app_setup::setup_app_state(app).map_err(Into::into)
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
        .invoke_handler(tauri::generate_handler![
            commands::list_windows,
            commands::transcribe_audio,
            commands::recognize_image,
            commands::build_draft,
            commands::save_draft_as_note,
            commands::process_to_note,
            // v0.11.7（图文会话，ADR-020）：图文采集 5 命令
            commands_photo::start_photo_session,
            commands_photo::capture_screen_snapshot,
            commands_photo::save_photo_capture,
            commands_photo::finish_photo_session,
            commands_photo::discard_photo_session,
            commands::create_note,
            commands::list_notes,
            commands::get_note,
            commands::update_note,
            commands::delete_note,
            commands::search_notes,
            // v0.10.0：标签/固定管理
            commands::update_note_tags,
            commands::update_note_pin,
            // v0.14 B：视觉系统——笔记级颜色（properties.color）
            commands::update_note_color,
            // v0.11.0（REQ-195~198）：笔记组——列表/详情/组内笔记/自建主题组/
            // 重命名/路由改判（修改即记忆）/移动笔记
            commands_groups::list_note_groups,
            commands_groups::get_note_group,
            commands_groups::list_group_notes,
            commands_groups::create_topic_group,
            commands_groups::rename_note_group,
            commands_groups::override_group_route,
            commands_groups::move_note_to_group,
            commands_groups::update_group_color,
            // v0.14.1：组删除（影响面确认后级联——两命令：只读影响面 + 执行删除）
            commands_groups::get_group_delete_impact,
            commands_groups::delete_note_group,
            // v0.11.1：feed 进料口——功能开关读写/碎片捕获/碎片列表
            commands_fragments::get_feature_flags,
            commands_fragments::set_feature_flag,
            commands_fragments::capture_fragment,
            commands_fragments::list_fragments,
            commands_fragments::list_group_fragments,
            // v0.11.4（REQ-201）：feed 消费闭环——删除/移组/图片 resolve
            commands_fragments::delete_fragment,
            commands_fragments::update_fragment_group,
            commands_fragments::resolve_fragment_image,
            // v0.12.2：收件箱动线——碎片升为笔记（事务建笔记+删碎片）
            commands_fragments::promote_fragment_to_note,
            // v0.11.2：学习循环统一——组→闪卡生成/到期队列/计数/复习评分/自测
            commands_flashcards::generate_group_cards,
            commands_flashcards::list_due_cards,
            commands_flashcards::count_due_cards,
            commands_flashcards::review_card,
            commands_flashcards::quiz_group_cards,
            // v0.12.2：收件箱动线——碎片升为闪卡（幂等）
            commands_flashcards::promote_fragment_to_card,
            commands_flashcards::learning_metrics,
            // v0.11.3：组结算机制——计划呈现/执行（用户可见仪式，防沼泽化）
            commands_settlement::settlement_plan,
            commands_settlement::execute_settlement,
            // v0.11.4（REQ-200）：周契约——设定/覆盖本周目标 + 状态读数
            commands_colors::list_tag_colors,
            commands_colors::set_tag_color,
            commands_colors::reset_tag_color,
            commands_contracts::upsert_week_contract,
            commands_contracts::week_contract_status,
            // v0.13.1（REQ-202~205）：知识体系层——体系/问题树/概念/模型/引用/审计探测
            commands_knowledge_systems::list_knowledge_systems,
            commands_knowledge_systems::create_knowledge_system,
            commands_knowledge_systems::update_knowledge_system,
            commands_knowledge_systems::archive_knowledge_system,
            commands_knowledge_systems::add_knowledge_node,
            commands_knowledge_systems::update_knowledge_node,
            commands_knowledge_systems::delete_knowledge_node,
            commands_knowledge_systems::list_knowledge_nodes,
            commands_knowledge_core::add_knowledge_concept,
            commands_knowledge_core::update_knowledge_concept,
            commands_knowledge_core::list_knowledge_concepts,
            commands_knowledge_core::add_knowledge_model,
            commands_knowledge_core::update_knowledge_model,
            commands_knowledge_core::list_knowledge_models,
            commands_knowledge_core::link_knowledge_target,
            commands_knowledge_core::list_knowledge_links,
            commands_knowledge_core::delete_knowledge_link,
            // v0.14 C3：引用反查（内容侧 → 体系侧）
            commands_knowledge_core::list_links_by_target,
            commands_knowledge_core::audit_due_for_system,
            // v0.14 C2：知识图谱快照（三类边单次聚合）
            commands_graph::graph_snapshot,
            // v0.13.2（REQ-206~207）：概念模型卡创建/组列表/升格
            commands_knowledge_cards::create_model_card,
            commands_knowledge_cards::list_group_cards,
            commands_knowledge_cards_promote::promote_card_to_concept,
            // v0.13.3（REQ-208~210）：决策与应用——一表两面/记一次使用
            commands_knowledge_decisions::log_decision,
            commands_knowledge_decisions::log_application,
            commands_knowledge_decisions::list_decisions,
            commands_knowledge_decisions::get_decision,
            commands_knowledge_decisions::delete_decision,
            // v0.13.8（画布）：节点位置读写 + 体系视口读写（读写闭环）
            commands_knowledge_canvas::update_node_canvas_position,
            commands_knowledge_canvas::batch_initialize_canvas_positions,
            commands_knowledge_canvas::save_canvas_viewport,
            commands_knowledge_canvas::get_canvas_viewport,
            // v0.14.1：画布偏好（连线样式/箭头/布局算法——按体系持久化）
            commands_knowledge_canvas::get_canvas_prefs,
            commands_knowledge_canvas::save_canvas_prefs,
            // 会话管理（REQ-010，ADR-004）
            commands_session::create_session,
            commands_session::finish_session,
            commands_session::list_sessions,
            commands_session::get_session_detail,
            commands_session::delete_session,
            commands_session::add_session_segment,
            commands_session::add_session_ocr_block,
            // 会话 → 笔记（v0.7.6 审查硬拆：管线在 commands_session_note.rs，
            // 命令按定义模块注册——tauri 宏生成项不随 pub use 重导出）
            commands_session_note::session_to_note,
            // 批量转笔记（v0.7.1 会话体验：列表勾选批量转化）
            commands_session_note::batch_session_to_note,
            // 笔记预览（REQ-081，v0.6.0 M1：过滤后只读预览——单一管线双出口）
            commands_session_note::preview_session_note,
            // 会话体验（REQ-076/077/078/079，v0.6.0 M6：质量报告/大纲/课程分组/段搜索）
            commands_session::session_quality_report,
            commands_session::session_outline,
            commands_session::list_session_courses,
            commands_session::search_session_segments,
            // 图内文字检索（REQ-133，v0.7.0 M3：OCR 块视图——搜 PPT 上的词命中图）
            commands_session::search_ocr_blocks,
            // 会话详情术语表（v0.11.5 spec 8️⃣：词汇表移出笔记 → 详情页直供）
            commands_session_glossary::session_glossary,
            // 流式 ASR 模型状态（REQ-009，ADR-003）
            commands_streaming::asr_streaming_model_status,
            // 模型自动下载（ADR-003 模型分发）
            commands_streaming::download_streaming_model,
            commands_streaming::model_download_status,
            // 实时会话（M7：REQ-007~012 编排；Windows-only）
            #[cfg(target_os = "windows")]
            commands_live::start_live_session,
            #[cfg(target_os = "windows")]
            commands_live::stop_live_session,
            #[cfg(target_os = "windows")]
            commands_live::live_session_status,
            // v0.7.2（REQ-151）：采集信息面板拉取兜底（live:session-info 事件
            // 可能早于面板挂载——挂载时 invoke 拉取 + 事件增量双通道）
            #[cfg(target_os = "windows")]
            commands_live::live_session_info,
            // 2026-08 A1：会话暂停/继续（硬暂停——完全停采，时间轴冻结）
            #[cfg(target_os = "windows")]
            commands_live::pause_live_session,
            #[cfg(target_os = "windows")]
            commands_live::resume_live_session,
            // v0.9.0 M2（REQ-189）：画面档降档确认（降采样可能丢信息——
            // 升档静默无需确认；确认后 worker retune 采样器）
            #[cfg(target_os = "windows")]
            commands_live::confirm_tier_downgrade,
            // v0.11.5 Task 6：采集态档案三维热切换（form/tier/domain 覆写）
            #[cfg(target_os = "windows")]
            commands_live::update_live_profile,
            // P3：引擎预热（选窗口阶段后台加载，开始即录）/ 释放
            #[cfg(target_os = "windows")]
            commands_live::prepare_live_session,
            #[cfg(target_os = "windows")]
            commands_live::release_live_prepare,
            // 视频文件导入（REQ-015，ADR-008：字幕优先 + ASR fallback + 关键帧 OCR）
            commands_import::import_video,
            // OCR 设备状态（REQ-036，ADR-009：GPU 卸载决策/回退可观测）
            commands_device::ocr_device_status,
            commands_device::ocr_device_set_mode,
            commands_device::ocr_device_recalibrate,
            // 词表管理（REQ-040，M5：热词/替换词闭环 + 课件预热）
            commands_vocab::vocab_get,
            commands_vocab::vocab_add_hotwords,
            commands_vocab::vocab_remove_hotword,
            commands_vocab::vocab_add_replacement,
            commands_vocab::vocab_remove_replacement,
            commands_vocab::vocab_extract_courseware,
            commands_vocab::vocab_suggest_from_ocr,
            // 视频类型档案（REQ-043，v0.5.0 M1：混合检测 + 记忆偏好 + 档案导出）
            commands_video::video_profiles,
            commands_video::detect_video_profile,
            commands_video::remember_video_profile,
            commands_video::video_profile_memory,
            commands_video::video_profile_by_kind,
            // v0.9.0 M1（REQ-188）：四维解耦 command（矩阵查询/旧档案映射/形态记忆）
            commands_video::video_profile_for_spec,
            commands_video::video_profile_spec_by_kind,
            commands_video::remember_video_profile_form,
            // v0.9.0 M3（REQ-190）：领域标签检测 + hotwords 预热
            commands_video::detect_video_domain,
            commands_video::preheat_domain_hotwords,
            // v0.13.6（REQ-220/222）：细目选项表 + 领域记忆（coarse+细目多选）
            commands_video::list_domain_fine,
            commands_video::remember_video_profile_domain,
            // v0.12.0 M6（采集体验债）：采集浮窗打开/关闭
            commands_window::open_capture_float,
            commands_window::close_capture_float,
            // v0.12.3（交互/架构升级）：浮窗点击穿透/置顶/状态查询 + 回主窗
            commands_window::float_set_locked,
            commands_window::float_set_topmost,
            commands_window::float_state,
            commands_window::show_main_window,
            // v0.12.6（ADR-025）：浮窗三态切换（主窗按钮/快捷键共用——全局快捷键
            // 与主窗键通道语义收拢，防双触发双翻转）
            commands_window::float_toggle,
            // v0.12.0 M3（系统级覆盖层截图）：打开/取图/确认裁剪/取消
            commands_overlay::open_capture_overlay,
            commands_overlay::overlay_get_image,
            commands_overlay::overlay_submit_capture,
            commands_overlay::overlay_cancel,
            // 会话结构化分析（REQ-044/045/046，v0.5.0 M2：章节/重点/术语/讲者）
            commands_analysis::analyze_session_command,
            // 说话人分离（REQ-153，v0.7.2：弱化版讲者切换离线分析——幂等懒加载）
            commands_speaker::analyze_session_speakers,
            // TD-2026-08-20-D 清偿（G1）：说话人模型应用内下载 + 状态
            commands_speaker::download_speaker_model,
            commands_speaker::speaker_model_download_status,
            // 健康巡检与诊断（REQ-042，M7：F2/F3/G2）
            commands_diag::health_status,
            commands_diag::diag_snapshot,
            // REQ-115（v0.7.0 M2）：VAD 阈值诊断（口径对照可查）
            commands_diag::vad_threshold_diag,
            // 模型磁盘占用/版本（REQ-131，v0.7.0 M3）
            commands_diag::model_disk_overview,
            // 会话图片配套（REQ-051，v0.5.0 M6：图集/走廊/删除）
            commands_images::list_session_images,
            commands_images::delete_session_image,
            commands_images::delete_session_images_all,
            commands_images::save_user_screenshot,
            commands_images::session_images_base_url,
            // v0.10.1：笔记图片——Markdown 引用解析 / 本地导入 / data_dir 基准
            // v0.15：剪贴板 base64 导入 + 外链 URL 下载导入（图片落盘三入口）
            commands_note_images::resolve_note_image,
            commands_note_images::import_note_image,
            commands_note_images::import_note_image_b64,
            commands_note_images::import_note_image_url,
            commands_note_images::app_data_dir,
            // 结构图（REQ-182/183/184，v0.7.7：非线性结构图像捕获持久化 + 图库）
            commands_structures::capture_session_structures,
            commands_structures::capture_structure_manual,
            commands_structures::list_session_structure_images,
            commands_structures::delete_structure_image,
            // 会话音频落盘（REQ-068，v0.6.0 M4：状态/清理——M6 清理 UI 消费）
            commands_audio::session_audio_status,
            commands_audio::session_audio_cleanup,
            // 音频预处理链（REQ-101，v0.7.0 M1：CER 微基准定默认后的用户开关）
            commands_audio::audio_preproc_status,
            commands_audio::audio_preproc_set,
            // 数据备份/恢复（REQ-107，v0.7.0 M1：TRUST-1——备份/恢复入口）
            commands_backup::backup_create,
            commands_backup::backup_restore,
            // 会话产物（REQ-052/053，v0.5.0 M7：模板构建/读取/落笔记）
            commands_artifacts::build_session_artifact,
            commands_artifacts::get_session_artifact,
            commands_artifacts::artifact_to_note,
            // 补缝式 AI 前置（REQ-055，v0.5.0 M8：判定器/协议/mock/护栏骨架）
            commands_ai::scan_ai_candidates,
            commands_ai::ai_enhance_mock,
            commands_ai::ai_enhance_status,
            // 笔记 AI 复核（REQ-085，v0.6.0 M1：边界段三态判定——授权默认关）
            commands_ai::review_text_filter,
            commands_ai::text_filter_status,
            // v0.8.0 M1 AI 使能层（REQ-138/139/140：密钥管理/余额查询/
            // 授权默认关+审计可见化——共享 ai_client 由 M2/M3 消费）
            commands_ai_settings::ai_get_settings,
            commands_ai_settings::ai_save_key,
            commands_ai_settings::ai_clear_key,
            commands_ai_settings::ai_update_settings,
            commands_ai_settings::ai_set_authorized,
            commands_ai_settings::ai_set_enabled,
            commands_ai_settings::ai_set_vision_refine,
            commands_ai_settings::ai_test_connection,
            commands_ai_settings::ai_get_balance,
            commands_ai_settings::ai_audit_list,
            commands_ai_settings::ai_audit_clear,
            // v0.11.6 M1（BYOK 多端点）：AI Provider 管理——预设/列表/增删改/
            // 密钥/默认/测试连接（Provider 面板数据源）
            commands_ai_providers::ai_provider_presets,
            commands_ai_providers::ai_provider_list,
            commands_ai_providers::ai_provider_add,
            commands_ai_providers::ai_provider_update,
            commands_ai_providers::ai_provider_remove,
            commands_ai_providers::ai_provider_save_key,
            commands_ai_providers::ai_provider_clear_key,
            commands_ai_providers::ai_set_default_provider,
            commands_ai_providers::ai_provider_test,
            // v0.8.0 M2（REQ-141/145 + REQ-143 基础版）：会话→笔记 AI 精修——
            // 成本预估/异步任务/状态/结果/采纳落库
            commands_ai_refine::ai_refine_estimate,
            commands_ai_refine::ai_refine_start,
            commands_ai_refine::ai_refine_status,
            commands_ai_refine::ai_refine_result,
            commands_ai_refine::ai_refine_apply,
            commands_ai_refine::refine_workbench,
            // v0.8.0 F2（2026-08-21）：任务中心——历史列表（面板数据源）
            commands_ai_refine::ai_task_history,
            // v0.16.0（REQ-224/225/226/227/228/230）：内嵌 AI 对话——
            // 纯聊天（会话 CRUD/流式发送/停止/重发）+ 任务对话视图（轨迹详情）
            commands_ai_chat::chat_create_session,
            commands_ai_chat::chat_list_sessions,
            commands_ai_chat::chat_rename_session,
            commands_ai_chat::chat_delete_session,
            commands_ai_chat::chat_list_messages,
            commands_ai_chat::chat_set_model,
            commands_ai_chat::chat_send,
            commands_ai_chat::chat_regenerate,
            commands_ai_chat::chat_cancel,
            commands_ai_chat::ai_task_conversation,
            // v0.8.0 M3（REQ-142）：知识补充——预估/任务/结果/采纳/撤销
            commands_ai_enrich::ai_enrich_estimate,
            commands_ai_enrich::ai_enrich_start,
            commands_ai_enrich::ai_enrich_result,
            commands_ai_enrich::ai_enrich_apply,
            commands_ai_enrich::ai_enrich_revert,
            // v0.8.0 M4（REQ-144 + REQ-143 完整）：笔记版本管理——列表/diff/回滚/成本
            commands_notes_version::note_versions_list,
            commands_notes_version::note_versions_diff,
            commands_notes_version::note_versions_rollback,
            commands_notes_version::note_versions_usage,
            commands_notes_version::note_by_session,
            commands_notes_version::diff_markdown_sections,
            // 结构模型与课后精修（REQ-047/049/050 模型版：下载/状态/精修）
            commands_refine::structure_model_download,
            commands_refine::structure_model_status,
            commands_refine::structure_models_dir_cmd,
            commands_refine::structure_formula_tier,
            commands_refine::refine_session,
            // v0.11.5（spec 5️⃣）：课后精修懒自动化（详情进入原料视图自动触发；
            // 幂等——已精修屏跳过，与停止后自动触发双通道防重）
            commands_refine::auto_refine_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
