//! @ai-context Tauri IPC 命令注册清单（批 0-C3 Task 1：整体自 `lib.rs` 搬出）。
//!
//! 业务背景：`lib.rs` 曾同时持有「模块声明清单」与「命令注册清单」两份 O(N) 追加式
//! 清单（合计 953 行 / 93%），v0.7.5 只拆走了装配逻辑 ⇒ 越拆越长。本文件承接后者，
//! 让 crate 根的 `mod` 块（必须留在根：337 行地板，见 docs/standards/line-limit-exemptions.md）
//! 不再被注册条目稀释。
//!
//! 为什么是**单文件清单**而不是按域拆成 4 份再组合：注册宏 `generate_handler` 展开为
//! `move |__tauri_invoke__| { match __tauri_invoke__.message.command() { … } }`
//! （`tauri-macros-2.6.3/src/command/handler.rs:174-183`）—— `Invoke` **按值**送进第一个
//! handler ⇒ `if a(invoke) { true } else { b(invoke) }` 是 use-after-move（E0382）。
//! 要在域之间组合就得再维护一份「命令名 → 域」路由表，那是**新的漂移面**。
//! ⇒ 单文件 + `scripts/check-command-registry.mjs` 机器门禁（把人眼审计换成机器审计）。
//!
//! 边界与副作用：
//! - 本文件**只有注册清单**：零业务逻辑、零 IO、零状态。`.plugin` / `.setup` /
//!   `.on_window_event` / `.run` 一律留在 `lib.rs::run()`——插件重复 init 是运行期故障，
//!   故本文件内**不得**出现 `tauri::Builder` 片段。
//! - 条目的 **IPC 命令名 = 路径末段 ident**（`handler.rs:46-58` 的 `path_to_command`），
//!   与 `crate::` 前缀无关 ⇒ 加前缀不改名，前端 `invoke("…")` 与 `capabilities/` ACL 零影响。
//! - 条目可带外层 `#[cfg(...)]`（`handler.rs:16-23`；`:177` 贴到 match 臂上）⇒
//!   10 条 Windows 门控命令原样随迁。
//!
//! ⚠️ 纪律：新增/删除任何 `#[tauri::command]` 函数都必须同步改本文件，改完跑
//!    `node scripts/check-command-registry.mjs`——漏一条**编译通过、单测全绿**，
//!    只有真机点到该功能才报 `command … not found`（本批唯一会静默失败的改动面）。


/// 类型锚点：`generate_handler` 展开出的是**闭包**，裸 `let` 绑定处没有期望类型 ⇒ E0282
/// （实测：`let handler = …; handler(invoke)` 不足以让 rustc 反推闭包签名）。
/// 用一层显式 `Fn(Invoke<Wry>) -> bool` bound 把签名钉死，零开销、零分配。
fn anchored<F: Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool>(f: F) -> F {
    f
}

/// 构造唯一的 IPC 注册 handler —— 等价于拆分前写在 `run()` 里的 `tauri::generate_handler` 宏调用。
///
/// **运行时必须是具体 `tauri::Wry`，不能像计划书那样泛型化为 `handle<R: Runtime>()`**
/// （实测偏差，非风格选择）：`run()` 的 `tauri::Builder::default()` 就是 `Builder<Wry>`
/// （`tauri-2.11.5/src/app.rs:1571-1578` 的 `#[cfg(feature = "wry")] impl Default for Builder<Wry>`）；
/// 而 334 条里有 **13 条**命令按值收 `AppHandle`（`commands_knowledge_core` 2 +
/// `commands_window` 6 + `commands_overlay` 3 + `commands_asr_pass2` 2）。把 `R` 泛型化后，
/// `AppHandle<R>: CommandArg<'_, R>` 的义务在 `R` 未定型的上下文里会被 rustc 退到
/// `impl<D: Deserialize> CommandArg for D` 兜底 impl ⇒ **13 × E0277**；计划书给的
/// `Box<dyn Fn(Invoke<R>) -> bool + Send + Sync>` 退路同样是泛型、**同样失败**（已实测）。
/// ⇒ 与 `Builder` 的实际单态化保持一致，才是行为等价且能编译的写法。
///
/// 返回 `impl Fn(Invoke<Wry>) -> bool + Send + Sync + 'static` 满足 `Builder::invoke_handler`
/// 的 bound（`tauri-2.11.5/src/app.rs`）；`Send + Sync` 由「闭包零捕获」自动成立。
pub fn handle() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    anchored(tauri::generate_handler![
        crate::commands::list_windows,
        crate::commands::transcribe_audio,
        crate::commands::recognize_image,
        crate::commands::build_draft,
        crate::commands::save_draft_as_note,
        crate::commands::process_to_note,
        // v0.11.7（图文会话，ADR-020）：图文采集 5 命令
        crate::commands_photo::start_photo_session,
        crate::commands_photo::capture_screen_snapshot,
        crate::commands_photo::save_photo_capture,
        crate::commands_photo::finish_photo_session,
        crate::commands_photo::discard_photo_session,
        crate::commands::create_note,
        crate::commands::list_notes,
        crate::commands::get_note,
        crate::commands::update_note,
        crate::commands::delete_note,
        crate::commands::search_notes,
        // v0.10.0：标签/固定管理
        crate::commands::update_note_tags,
        crate::commands::update_note_pin,
        // v0.14 B：视觉系统——笔记级颜色（properties.color）
        crate::commands::update_note_color,
        // v0.11.0（REQ-195~198）：笔记组——列表/详情/组内笔记/自建主题组/
        // 重命名/路由改判（修改即记忆）/移动笔记
        crate::commands_groups::list_note_groups,
        // REQ-287（v0.19.7）：笔记手动排序（scope=g{id}/none）
        crate::commands_note_orders::note_order_list,
        crate::commands_note_orders::note_order_save,
        crate::commands_note_orders::note_order_clear,
        crate::commands_groups::get_note_group,
        crate::commands_groups::list_group_notes,
        crate::commands_groups::create_topic_group,
        crate::commands_groups::rename_note_group,
        crate::commands_groups::override_group_route,
        crate::commands_groups::move_note_to_group,
        crate::commands_groups::update_group_color,
        // REQ-315（v0.20.11 批 6）：组置顶 + 手动排序（kind 分区快照/单组回自动）
        crate::commands_group_orders::update_note_group_pin,
        crate::commands_group_orders::note_group_order_list,
        crate::commands_group_orders::note_group_order_save,
        crate::commands_group_orders::note_group_order_clear,
        // v0.14.1：组删除（影响面确认后级联——两命令：只读影响面 + 执行删除）
        crate::commands_groups::get_group_delete_impact,
        crate::commands_groups::delete_note_group,
        // v0.11.1：feed 进料口——功能开关读写/碎片捕获/碎片列表
        crate::commands_fragments::get_feature_flags,
        crate::commands_fragments::set_feature_flag,
        crate::commands_fragments::capture_fragment,
        crate::commands_fragments::list_fragments,
        crate::commands_fragments::list_group_fragments,
        // v0.11.4（REQ-201）：feed 消费闭环——删除/移组/图片 resolve
        crate::commands_fragments::delete_fragment,
        crate::commands_fragments::update_fragment_group,
        crate::commands_fragments::resolve_fragment_image,
        // v0.12.2：收件箱动线——碎片升为笔记（事务建笔记+删碎片）
        crate::commands_fragments::promote_fragment_to_note,
        // v0.11.2：学习循环统一——组→闪卡生成/到期队列/计数/复习评分/自测
        crate::commands_flashcards::generate_group_cards,
        crate::commands_flashcards::list_due_cards,
        crate::commands_flashcards::count_due_cards,
        crate::commands_flashcards::review_card,
        crate::commands_flashcards::quiz_group_cards,
        // v0.12.2：收件箱动线——碎片升为闪卡（幂等）
        crate::commands_flashcards::promote_fragment_to_card,
        crate::commands_flashcards::learning_metrics,
        // v0.11.3：组结算机制——计划呈现/执行（用户可见仪式，防沼泽化）
        crate::commands_settlement::settlement_plan,
        crate::commands_settlement::execute_settlement,
        // v0.11.4（REQ-200）：周契约——设定/覆盖本周目标 + 状态读数
        crate::commands_colors::list_tag_colors,
        crate::commands_colors::set_tag_color,
        crate::commands_colors::reset_tag_color,
        crate::commands_contracts::upsert_week_contract,
        crate::commands_contracts::week_contract_status,
        // v0.18.0（REQ-248~250）：学习目标层——目标 CRUD/绑定/进度/埋点（无 AI）
        crate::commands_goals::create_goal,
        crate::commands_goals::views::list_goals,
        crate::commands_goals::views::get_goal_detail,
        crate::commands_goals::views::get_goal_progress,
        crate::commands_goals::update_goal,
        crate::commands_goals::update_goal_interview,
        crate::commands_goals::delete_goal,
        crate::commands_goals::update_goal_status,
        crate::commands_goals::milestones::add_goal_milestone,
        crate::commands_goals::milestones::update_goal_milestone,
        crate::commands_goals::milestones::delete_goal_milestone,
        crate::commands_goals::milestones::set_goal_milestone_status,
        crate::commands_goals::milestones::bind_goal_group,
        crate::commands_goals::milestones::unbind_goal_group,
        crate::commands_goals::milestones::suggest_goal_milestones,
        // v0.18.1（REQ-255~257）：毕业仪式/回顾流/放弃/毕业档案
        crate::commands_goals_lifecycle::goal_settle,
        crate::commands_goals_lifecycle::goal_retro,
        crate::commands_goals_lifecycle::goal_abandon,
        crate::commands_goals_lifecycle::list_goal_graduations,
        // v0.18.2（REQ-251~254）：AI 目标规划（默认关+授权）与摘要/弱项注入
        crate::commands_goals_plan::ai_goal_plan_estimate,
        crate::commands_goals_plan::ai_goal_plan,
        crate::commands_goals_plan::goal_chat_context,
        crate::commands_goals_plan::goal_concept_weakness,
        crate::commands_goals_plan::goal_apply_plan,
        // v0.19.0（REQ-258）：检索与发现层——检索/统计/全量重建
        crate::commands_kb::kb_search,
        crate::commands_kb::kb_index_stats,
        crate::commands_kb::kb_reindex_all,
        crate::commands_kb::kb_embedding_status,
        crate::commands_kb::kb_embedding_load,
        crate::commands_kb::kb_embedding_download,
        // v0.19.1（REQ-260）：学习库问答生成开关与预算档位（设置段读写）
        crate::commands_ai_settings::ai_set_kb_qa,
        // v0.20.2（REQ-270）：可选 LLM 文本校对开关（默认关）
        crate::commands_ai_settings::ai_set_proofread,
        // v0.19.3（REQ-261）：检索建议（发现路径——默认关，建议制）
        crate::commands_kb_discovery::kb_discovery_suggest,
        // v0.13.1（REQ-202~205）：知识体系层——体系/问题树/概念/模型/引用/审计探测
        crate::commands_knowledge_systems::list_knowledge_systems,
        crate::commands_knowledge_systems::create_knowledge_system,
        crate::commands_knowledge_systems::update_knowledge_system,
        crate::commands_knowledge_systems::archive_knowledge_system,
        crate::commands_knowledge_systems::add_knowledge_node,
        crate::commands_knowledge_systems::update_knowledge_node,
        crate::commands_knowledge_systems::delete_knowledge_node,
        crate::commands_knowledge_systems::list_knowledge_nodes,
        crate::commands_knowledge_core::add_knowledge_concept,
        crate::commands_knowledge_core::update_knowledge_concept,
        crate::commands_knowledge_core::list_knowledge_concepts,
        crate::commands_knowledge_core::add_knowledge_model,
        crate::commands_knowledge_core::update_knowledge_model,
        crate::commands_knowledge_core::list_knowledge_models,
        crate::commands_knowledge_core::link_knowledge_target,
        crate::commands_knowledge_core::list_knowledge_links,
        crate::commands_knowledge_core::delete_knowledge_link,
        // v0.14 C3：引用反查（内容侧 → 体系侧）
        crate::commands_knowledge_core::list_links_by_target,
        crate::commands_knowledge_core::audit_due_for_system,
        // v0.14 C2：知识图谱快照（三类边单次聚合）
        crate::commands_graph::graph_snapshot,
        // v0.13.2（REQ-206~207）：概念模型卡创建/组列表/升格
        crate::commands_knowledge_cards::create_model_card,
        crate::commands_knowledge_cards::list_group_cards,
        crate::commands_knowledge_cards_promote::promote_card_to_concept,
        // v0.13.3（REQ-208~210）：决策与应用——一表两面/记一次使用
        crate::commands_knowledge_decisions::log_decision,
        crate::commands_knowledge_decisions::log_application,
        crate::commands_knowledge_decisions::list_decisions,
        crate::commands_knowledge_decisions::get_decision,
        crate::commands_knowledge_decisions::delete_decision,
        // v0.13.8（画布）：节点位置读写 + 体系视口读写（读写闭环）
        crate::commands_knowledge_canvas::update_node_canvas_position,
        crate::commands_knowledge_canvas::batch_initialize_canvas_positions,
        crate::commands_knowledge_canvas::save_canvas_viewport,
        crate::commands_knowledge_canvas::get_canvas_viewport,
        // v0.14.1：画布偏好（连线样式/箭头/布局算法——按体系持久化）
        crate::commands_knowledge_canvas::get_canvas_prefs,
        crate::commands_knowledge_canvas::save_canvas_prefs,
        // 会话管理（REQ-010，ADR-004）
        crate::commands_session::create_session,
        crate::commands_session::finish_session,
        crate::commands_session::list_sessions,
        crate::commands_session::get_session_detail,
        crate::commands_session::delete_session,
        // 批 4（会话页交互矩阵）：批量删除（单事务原子，替代前端逐条循环）
        crate::commands_session_delete::batch_delete_sessions,
        // REQ-282（v0.19.6）：会话改名（title_kind=manual 停止自动覆写）
        crate::commands_session::update_session_title,
        crate::commands_session::add_session_segment,
        crate::commands_session::add_session_ocr_block,
        // 会话 → 笔记（v0.7.6 审查硬拆：管线在 commands_session_note.rs，
        // 命令按定义模块注册——tauri 宏生成项不随 pub use 重导出）
        crate::commands_session_note::session_to_note,
        // 批量转笔记（v0.7.1 会话体验：列表勾选批量转化）
        crate::commands_session_note::batch_session_to_note,
        // 笔记预览（REQ-081，v0.6.0 M1：过滤后只读预览——单一管线双出口）
        crate::commands_session_note::preview_session_note,
        // 会话体验（REQ-076/077/078/079，v0.6.0 M6：质量报告/大纲/课程分组/段搜索）
        crate::commands_session::session_quality_report,
        crate::commands_session::session_outline,
        crate::commands_session::list_session_courses,
        crate::commands_session::search_session_segments,
        // 图内文字检索（REQ-133，v0.7.0 M3：OCR 块视图——搜 PPT 上的词命中图）
        crate::commands_session::search_ocr_blocks,
        // 会话详情术语表（v0.11.5 spec 8️⃣：词汇表移出笔记 → 详情页直供）
        crate::commands_session_glossary::session_glossary,
        // 流式 ASR 模型状态（REQ-009，ADR-003）
        crate::commands_streaming::asr_streaming_model_status,
        // 模型自动下载（ADR-003 模型分发）
        crate::commands_streaming::download_streaming_model,
        crate::commands_streaming::model_download_status,
        // 实时会话（M7：REQ-007~012 编排；Windows-only）
        #[cfg(target_os = "windows")]
        crate::commands_live::start_live_session,
        #[cfg(target_os = "windows")]
        crate::commands_live::stop_live_session,
        #[cfg(target_os = "windows")]
        crate::commands_live::live_session_status,
        // v0.7.2（REQ-151）：采集信息面板拉取兜底（live:session-info 事件
        // 可能早于面板挂载——挂载时 invoke 拉取 + 事件增量双通道）
        #[cfg(target_os = "windows")]
        crate::commands_live::live_session_info,
        // 2026-08 A1：会话暂停/继续（硬暂停——完全停采，时间轴冻结）
        #[cfg(target_os = "windows")]
        crate::commands_live::pause_live_session,
        #[cfg(target_os = "windows")]
        crate::commands_live::resume_live_session,
        // v0.9.0 M2（REQ-189）：画面档降档确认（降采样可能丢信息——
        // 升档静默无需确认；确认后 worker retune 采样器）
        #[cfg(target_os = "windows")]
        crate::commands_live::confirm_tier_downgrade,
        // v0.11.5 Task 6：采集态档案三维热切换（form/tier/domain 覆写）
        #[cfg(target_os = "windows")]
        crate::commands_live::update_live_profile,
        // P3：引擎预热（选窗口阶段后台加载，开始即录）/ 释放
        #[cfg(target_os = "windows")]
        crate::commands_live::prepare_live_session,
        #[cfg(target_os = "windows")]
        crate::commands_live::release_live_prepare,
        // 视频文件导入（REQ-015，ADR-008：字幕优先 + ASR fallback + 关键帧 OCR）
        crate::commands_import::import_video,
        // OCR 设备状态（REQ-036，ADR-009：GPU 卸载决策/回退可观测）
        crate::commands_device::ocr_device_status,
        crate::commands_device::ocr_device_set_mode,
        crate::commands_device::ocr_device_recalibrate,
        // 词表管理（REQ-040，M5：热词/替换词闭环 + 课件预热）
        crate::commands_vocab::vocab_get,
        crate::commands_vocab::vocab_add_hotwords,
        crate::commands_vocab::vocab_remove_hotword,
        crate::commands_vocab::vocab_add_replacement,
        crate::commands_vocab::vocab_remove_replacement,
        crate::commands_vocab::vocab_extract_courseware,
        crate::commands_vocab::vocab_suggest_from_ocr,
        // 视频类型档案（REQ-043，v0.5.0 M1：混合检测 + 记忆偏好 + 档案导出）
        crate::commands_video::video_profiles,
        crate::commands_video::detect_video_profile,
        crate::commands_video::remember_video_profile,
        crate::commands_video::video_profile_memory,
        crate::commands_video::video_profile_by_kind,
        // v0.9.0 M1（REQ-188）：四维解耦 command（矩阵查询/旧档案映射/形态记忆）
        crate::commands_video::video_profile_for_spec,
        crate::commands_video::video_profile_spec_by_kind,
        crate::commands_video::remember_video_profile_form,
        // v0.9.0 M3（REQ-190）：领域标签检测 + hotwords 预热
        crate::commands_video::detect_video_domain,
        crate::commands_video::preheat_domain_hotwords,
        // v0.13.6（REQ-220/222）：细目选项表 + 领域记忆（coarse+细目多选）
        crate::commands_video::list_domain_fine,
        crate::commands_video::remember_video_profile_domain,
        // v0.12.0 M6（采集体验债）：采集浮窗打开/关闭
        crate::commands_window::open_capture_float,
        crate::commands_window::close_capture_float,
        // v0.12.3（交互/架构升级）：浮窗点击穿透/置顶/状态查询 + 回主窗
        crate::commands_window::float_set_locked,
        crate::commands_window::float_set_topmost,
        crate::commands_window::float_state,
        crate::commands_window::show_main_window,
        // v0.12.6（ADR-025）：浮窗三态切换（主窗按钮/快捷键共用——全局快捷键
        // 与主窗键通道语义收拢，防双触发双翻转）
        crate::commands_window::float_toggle,
        // v0.12.0 M3（系统级覆盖层截图）：打开/取图/确认裁剪/取消
        crate::commands_overlay::open_capture_overlay,
        crate::commands_overlay::overlay_get_image,
        crate::commands_overlay::overlay_submit_capture,
        crate::commands_overlay::overlay_cancel,
        // 会话结构化分析（REQ-044/045/046，v0.5.0 M2：章节/重点/术语/讲者）
        crate::commands_analysis::analyze_session_command,
        // 说话人分离（REQ-153，v0.7.2：弱化版讲者切换离线分析——幂等懒加载）
        crate::commands_speaker::analyze_session_speakers,
        // TD-2026-08-20-D 清偿（G1）：说话人模型应用内下载 + 状态
        crate::commands_speaker::download_speaker_model,
        crate::commands_speaker::speaker_model_download_status,
        // 健康巡检与诊断（REQ-042，M7：F2/F3/G2）
        crate::commands_diag::health_status,
        crate::commands_diag::diag_snapshot,
        // REQ-115（v0.7.0 M2）：VAD 阈值诊断（口径对照可查）
        crate::commands_diag::vad_threshold_diag,
        // 模型磁盘占用/版本（REQ-131，v0.7.0 M3）
        crate::commands_diag::model_disk_overview,
        // 会话图片配套（REQ-051，v0.5.0 M6：图集/走廊/删除）
        crate::commands_images::list_session_images,
        crate::commands_images::delete_session_image,
        crate::commands_images::delete_session_images_all,
        crate::commands_images::save_user_screenshot,
        crate::commands_images::session_images_base_url,
        // v0.10.1：笔记图片——Markdown 引用解析 / 本地导入 / data_dir 基准
        // v0.15：剪贴板 base64 导入 + 外链 URL 下载导入（图片落盘三入口）
        crate::commands_note_images::resolve_note_image,
        crate::commands_note_images::import_note_image,
        crate::commands_note_images::import_note_image_b64,
        crate::commands_note_images::import_note_image_url,
        crate::commands_note_images::app_data_dir,
        // 结构图（REQ-182/183/184，v0.7.7：非线性结构图像捕获持久化 + 图库）
        crate::commands_structures::capture_session_structures,
        crate::commands_structures::capture_structure_manual,
        crate::commands_structures::list_session_structure_images,
        crate::commands_structures::delete_structure_image,
        // 会话音频落盘（REQ-068，v0.6.0 M4：状态/清理——M6 清理 UI 消费）
        crate::commands_audio::session_audio_status,
        crate::commands_audio::session_audio_cleanup,
        // 音频预处理链（REQ-101，v0.7.0 M1：CER 微基准定默认后的用户开关）
        crate::commands_audio::audio_preproc_status,
        crate::commands_audio::audio_preproc_set,
        // 数据备份/恢复（REQ-107，v0.7.0 M1：TRUST-1——备份/恢复入口）
        crate::commands_backup::backup_create,
        crate::commands_backup::backup_restore,
        // 会话产物（REQ-052/053，v0.5.0 M7：模板构建/读取/落笔记）
        crate::commands_artifacts::build_session_artifact,
        crate::commands_artifacts::get_session_artifact,
        crate::commands_artifacts::artifact_to_note,
        // 补缝式 AI 前置（REQ-055，v0.5.0 M8：判定器/协议/mock/护栏骨架）
        crate::commands_ai::scan_ai_candidates,
        crate::commands_ai::ai_enhance_mock,
        crate::commands_ai::ai_enhance_status,
        // 笔记 AI 复核（REQ-085，v0.6.0 M1：边界段三态判定——授权默认关）
        crate::commands_ai::review_text_filter,
        crate::commands_ai::text_filter_status,
        // v0.8.0 M1 AI 使能层（REQ-138/139/140：密钥管理/余额查询/
        // 授权默认关+审计可见化——共享 ai_client 由 M2/M3 消费）
        crate::commands_ai_settings::ai_get_settings,
        crate::commands_ai_settings::ai_save_key,
        crate::commands_ai_settings::ai_clear_key,
        crate::commands_ai_settings::ai_update_settings,
        crate::commands_ai_settings::ai_set_authorized,
        crate::commands_ai_settings::ai_set_enabled,
        crate::commands_ai_settings::ai_set_vision_refine,
        // v0.18.2（REQ-254）：目标 AI 设置（独立开关+预算档位）
        crate::commands_ai_settings::ai_set_goal_plan,
        crate::commands_ai_settings::ai_set_refine_strategy,
        crate::commands_ai_settings::ai_test_connection,
        crate::commands_ai_settings::ai_get_balance,
        crate::commands_ai_settings::ai_audit_list,
        crate::commands_ai_settings::ai_audit_clear,
        // v0.11.6 M1（BYOK 多端点）：AI Provider 管理——预设/列表/增删改/
        // 密钥/默认/测试连接（Provider 面板数据源）
        crate::commands_ai_providers::ai_provider_presets,
        crate::commands_ai_providers::ai_provider_list,
        crate::commands_ai_providers::ai_provider_add,
        crate::commands_ai_providers::ai_provider_update,
        crate::commands_ai_providers::ai_provider_remove,
        crate::commands_ai_providers::ai_provider_save_key,
        crate::commands_ai_providers::ai_provider_clear_key,
        crate::commands_ai_providers::ai_set_default_provider,
        crate::commands_ai_providers::ai_provider_test,
        // v0.8.0 M2（REQ-141/145 + REQ-143 基础版）：会话→笔记 AI 精修——
        // 成本预估/异步任务/状态/结果/采纳落库
        crate::commands_ai_refine::ai_refine_estimate,
        crate::commands_ai_refine::ai_refine_start,
        crate::commands_ai_refine::ai_refine_status,
        crate::commands_ai_refine::ai_refine_strategy_meta,
        crate::commands_ai_refine::ai_refine_prompt_preview,
        crate::commands_ai_refine::ai_refine_result,
        crate::commands_ai_refine::ai_refine_apply,
        crate::commands_ai_refine::workbench::refine_workbench,
        // v0.17.0（REQ-246）：笔记级 AI 精修——估计/启动/采纳（手写笔记）
        crate::commands_ai_note_refine::ai_note_refine_estimate,
        crate::commands_ai_note_refine::ai_note_refine_start,
        crate::commands_ai_note_refine::ai_note_refine_apply,
        // v0.8.0 F2（2026-08-21）：任务中心——历史列表（面板数据源）
        crate::commands_ai_refine::ai_task_history,
        // v0.16.0（REQ-224/225/226/227/228/230）：内嵌 AI 对话——
        // 纯聊天（会话 CRUD/流式发送/停止/重发）+ 任务对话视图（轨迹详情）
        crate::commands_ai_chat::chat_create_session,
        crate::commands_ai_chat::chat_list_sessions,
        crate::commands_ai_chat::chat_rename_session,
        crate::commands_ai_chat::chat_delete_session,
        crate::commands_ai_chat::chat_list_messages,
        crate::commands_ai_chat::chat_set_model,
        crate::commands_ai_chat::chat_send,
        crate::commands_ai_chat::chat_regenerate,
        crate::commands_ai_chat::chat_cancel,
        crate::commands_ai_chat::ai_task_conversation,
        // v0.8.0 M3（REQ-142）：知识补充——预估/任务/结果/采纳/撤销
        crate::commands_ai_enrich::ai_enrich_estimate,
        crate::commands_ai_enrich::ai_enrich_start,
        crate::commands_ai_enrich::ai_enrich_result,
        crate::commands_ai_enrich::ai_enrich_apply,
        crate::commands_ai_enrich::ai_enrich_revert,
        // v0.8.0 M4（REQ-144 + REQ-143 完整）：笔记版本管理——列表/diff/回滚/成本
        crate::commands_notes_version::note_versions_list,
        crate::commands_notes_version::note_versions_diff,
        crate::commands_notes_version::note_versions_rollback,
        crate::commands_notes_version::note_versions_usage,
        crate::commands_notes_version::note_by_session,
        crate::commands_notes_version::diff_markdown_sections,
        // 批 3（问题11）：整篇有序行级 diff（精修工作台三入口统一取数——
        // 章节分组 diff 丢失行间顺序，note_versions_diff 需 DB 版本 id）
        crate::commands_notes_version::diff_markdown_ops,
        // 结构模型与课后精修（REQ-047/049/050 模型版：下载/状态/精修）
        crate::commands_refine::structure_model_download,
        crate::commands_refine::structure_model_status,
        crate::commands_refine::structure_models_dir_cmd,
        crate::commands_refine::structure_formula_tier,
        crate::commands_refine::refine_session,
        // v0.11.5（spec 5️⃣）：课后精修懒自动化（详情进入原料视图自动触发；
        // 幂等——已精修屏跳过，与停止后自动触发双通道防重）
        crate::commands_refine::auto_refine_session,
        // v0.20.2（REQ-268）：会话全量离线精修（第二遍）——启动/取消/预览/裁决
        crate::commands_asr_pass2::second_pass_start,
        crate::commands_asr_pass2::second_pass_cancel,
        crate::commands_asr_pass2::second_pass_list,
        crate::commands_asr_pass2::second_pass_decide,
        // v0.20.2（REQ-270）：可选 LLM 文本校对——预估/运行（建议制）/草稿列表
        crate::commands_proofread::proofread_estimate,
        crate::commands_proofread::proofread_run,
        crate::commands_proofread::proofread_list,
        // v0.20.3（REQ-293/294/298）：行动裁决命令族——队列分区/完成/放弃/
        // 提炼/改期/完成史
        crate::commands_tasks::list_action_queue,
        crate::commands_tasks::action_badge_count,
        crate::commands_tasks::task_complete,
        crate::commands_tasks::task_abandon,
        crate::commands_tasks::task_refine_unrefined,
        crate::commands_tasks::task_set_plan_date,
        crate::commands_tasks::completion_history_list,
        // v0.20.3（REQ-296/297）：SOP——模板 CRUD/run 生命周期/步骤/建议
        crate::commands_sop::sop_template_create,
        crate::commands_sop::sop_template_list,
        crate::commands_sop::sop_template_delete,
        crate::commands_sop::sop_run_start,
        crate::commands_sop::sop_run_detail,
        crate::commands_sop::sop_step_update,
        crate::commands_sop::sop_run_finish,
        crate::commands_sop::sop_run_list,
        crate::commands_sop::sop_revision_suggestions,
        // v0.20.3（REQ-294/295/299/300）：收尾命令族——批决议/迁出/练习/问题
        crate::commands_after::batch_weekly_resolve,
        crate::commands_after::export_write_todotxt_file,
        crate::commands_after::export_manual_fill_done,
        crate::commands_after::practice_create,
        crate::commands_after::practice_list,
        crate::commands_after::practice_tick,
        crate::commands_after::question_create,
        crate::commands_after::question_list,
        crate::commands_after::question_answer,
        crate::commands_after::question_set_status,
        // v0.20.3（REQ-302）：笔记段 → 模型卡草稿（复用既有 inner 防双轨）
        crate::commands_knowledge_cards::model_card_from_note,
        // v0.20.4（REQ-303）：web 采集阶段 1——URL 采集/页面读取
        crate::commands_web::web_capture_url,
        crate::commands_web::web_page_get,
        // v0.20.4（REQ-305）：整页快照（静态内联档→用户文件）
        crate::commands_web::web_snapshot_export,
        // v0.20.4（REQ-304）：扩展收件服务——起停/状态
        crate::commands_web_inbox::web_inbox_start,
        crate::commands_web_inbox::web_inbox_status,
        crate::commands_web_inbox::web_inbox_stop,
        // v0.20.2（REQ-269）：ASR 混淆画像闭环——候选/确认/忽略/规则管理
        crate::commands_asr_confusion::asr_confusion_get,
        crate::commands_asr_confusion::asr_confusion_confirm,
        crate::commands_asr_confusion::asr_confusion_dismiss,
        crate::commands_asr_confusion::asr_confusion_remove_rule,
    ])
}
