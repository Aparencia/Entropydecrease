# 单文件行数豁免登记（AGENTS.md §3：单文件 ≤300 行；301–600 行须登记本清单）

> ⚠️ **本文件是生成物** —— 行数与条目成员关系由 `node scripts/line-limits.mjs --write` 生成，
> **不要手改数字、手加行或手删行**（会被 `node scripts/line-limits.mjs` 判为违规）。
> 「豁免理由」「拆分计划」两列由**人工**维护，生成器按路径保留；「已拆分 / 登记移除记录」节逐字保留。
>
> **测量口径（唯一有效）**：文件**全部行数**（含空行），等价于 `[System.IO.File]::ReadAllLines(path, UTF8).Count`。
> ⚠️ **禁用** `Get-Content` 数行（本机 PowerShell 5.1 + 码页 `gb2312` 会按 GBK 解码、吞换行、**少算**）与 `Measure-Object -Line`（**只数非空行**）。
>
> 规则：≤300 行无需登记；301–600 行须登记；**>600 行必须硬拆，不允许豁免**。

## 超硬限（>600 行，必须硬拆，不允许豁免）

> 本表受棘轮守卫保护：**只允许减少**。每完成一个拆分，从 `scripts/line-limits.mjs` 的 `FROZEN_OVER_LIMIT` 删掉对应一行。

| 文件 | 行数 | 说明 | 拆分计划 |
|---|---|---|---|
| app/src-tauri/src/commands_ai_refine.rs | 751 | 超硬限（>600 行），不允许豁免 —— v0.8.0 M2（REQ-141/145）+ F1/F2/F3：AI 精修命令域（成本预估/异步任务编排/状态/结果/采纳落库/任务历史/配额去重门控/成本硬拦截 + 任务注册表容量守卫）；任务执行已拆至 ai_refine_task.rs；L4 修复（落库失败日志）微增 | 若再增长：门控/拦截拆至 commands_ai_refine_gate.rs |
| app/src/pages/ClassroomPage.tsx | 724 | 超硬限（>600 行），不允许豁免 —— 装配层页面：左栏配置区（就绪清单/窗口选择/实时捕获/视频导入/OCR 设备/词表/素材）+ 右栏内容区；v0.15 左栏列状态再增；v0.19.2/3（REQ-271/273 + 审查即修：状态机看门狗/预同步/文案收口，+43，实测 745）——**超 600 硬限为预存债务（TD-2026-08-30-A：v0.14 前已越线）持续累增，拆分计划（LiveCaptureCard）顺延待执行** | 若再增长：将实时捕获卡片拆出 LiveCaptureCard（状态与事件监听下沉）——超硬限必须拆 |
| app/src-tauri/src/db_goals.rs | 707 | 超硬限（>600 行），不允许豁免 —— v0.18.0（REQ-248~250）：goals 三表 DDL + 实体 CRUD/绑定/结算钩子内聚；行映射与事务建目标共享 add_milestone 族；v0.18.1（REQ-255/256）毕业报告快照表与报告取数（结算快照/复习统计/成果物清单）再增 | 若再增长：毕业报告取数拆至 db_goals_graduation.rs |
| app/src-tauri/src/commands_goals.rs | 673 | 超硬限（>600 行），不允许豁免 —— v0.18.0（REQ-248~250）：学习目标命令域（15 命令 + inner 纯编排 + 访谈校验/埋点/宣言组装/进度收集）——命令薄壳与 inner 同域（commands_knowledge_core 先例）；列表/详情/进度三视图共用 collect_signals/goal_card_metrics；v0.18.1 生命周期命令已拆至 commands_goals_lifecycle.rs | 若再增长：里程碑命令组拆至 commands_goals_milestones.rs |
| app/src-tauri/src/ai_refine_task.rs | 670 | 超硬限（>600 行），不允许豁免 —— v0.8.0 F2-B4 拆分产物：精修任务执行域（任务编排/并发切片 worker 池/单片重试/部分成功/审计/落库）——并发编排与状态流转内聚 | 若再增长：refine_slices_concurrent 拆至 ai_refine_task_workers.rs |
| app/src-tauri/src/note_filter.rs | 642 | 超硬限（>600 行），不允许豁免 —— v0.6.0 M1（REQ-082/085）：笔记过滤域（过滤链 + AI 判定应用 + 画面要点净化）内聚于单一管线（双出口一致性由构造保证）；AI 部分已按登记计划拆至 note_filter_ai.rs | 若再增长：净化链拆至 note_filter_purify.rs |
| app/src-tauri/src/artifact_templates.rs | 632 | 超硬限（>600 行），不允许豁免 —— v0.5.0 M7（REQ-052）：五档案模板函数（讲义/步骤卡/摘要/对话纪要/会议纪要）内聚于同一模板域，各模板共享原料注入签名；v0.9.0 M5 叙事变体再增 | 若再增长：会议/访谈模板拆至 artifact_templates_meeting.rs |
| app/src-tauri/src/video_profile.rs | 628 | 超硬限（>600 行），不允许豁免 —— v0.5.0 M1（REQ-043）：档案域（类型/检测投票/记忆偏好/JSON IO）内聚；档案常量数据已拆至 video_profile_data.rs；v0.9.0 M1 记忆库 kind 映射迁移 + v0.11.5 Task 5 四象限记忆后置判定（apply_profile_memory）再增；v0.13.6（REQ-222）领域记忆独立通道（DomainMemoryEntry/remember_domain/lookup_domain）+ platform_form 字段再增 | 若再增长：检测投票与记忆偏好拆至 video_profile_detect.rs |
| app/src-tauri/src/live_session_frame.rs | 607 | 超硬限（>600 行），不允许豁免 —— 屏幕采样线程（采样循环/暂停隔离/播放器检测/tier 重评/视频档案重评）单单体函数——TD-24-A 拆分方案已登记（SessionFrameCtx 聚合 + 段落方法提取），本轮评估：与 lib.rs 同批后置 | 若再增长：按 Ctx 聚合方案拆至 live_session_frame_scan.rs |

## 301–600 档（须登记）

| 文件 | 行数 | 豁免理由 | 拆分计划 |
|---|---|---|---|
| app/src/components/SessionListPanel.tsx | 598 | 超硬限（>600 行），不允许豁免 —— v0.20.9 批 4（REQ-313）列表交互重写（选择模式/行右键/行内改名/批量栏）+ 审查修复轮 3（全选可见行基准/pending）净增——2026-09-09 实测纠偏（登记值 491 过期）；**超 600 硬限随 TD-2026-09-09-D 登记** | **批 0-C2 Task 5 八文件边界**（原计划「批量栏 + 选择模式」只减 166 行 ⇒ 仍 ≈468 >300，不足）：`utils/sessionEligibility.ts`（可转化纯函数）· `hooks/useSessionSelection.ts`（选择态机 + visibleOrderRef + 裁剪 effect；**Esc 监听留面板**）· `hooks/useSessionListView.ts`（matchFilters/sorted/filtered/groupedView/visibleOrder）· `hooks/useSessionSearch.ts`（三模式搜索 + 两个 invoke 落点）· `components/SessionSearchBar.tsx`（三模式单输入框）· `components/SessionSearchHits.tsx`（段/画面命中视图）· `components/SessionListBody.tsx`（列表容器含 renderRow）· `components/SessionSelectionToolbar.tsx`（头部选择控件 + 底部批量栏）；列表行已拆 SessionListRow.tsx |
| app/src-tauri/src/commands.rs | 597 | 命令装配域（AppState + 通用命令 + 导入管线编排）；登记值 466 过期快照——2026-09-09 实测纠偏（含批 7 delete_note 结果契约 +12；600 硬限内压线） | 若再增长：导入管线命令拆至 commands_import.rs（既有登记计划） |
| app/src/pages/ChatPage.tsx | 593 | AI 对话页编排；批 1（REQ-306/307）active 门控/终态订阅接线净增——2026-09-09 实测纠偏（登记值 529 过期） | 若再增长：任务工具条与发起流拆至 ChatTasksToolbar.tsx |
| app/src-tauri/src/lib.rs | 577 | crate 根 321 `mod` + 16 `#[cfg]` = **337 行地板**；注册清单已移至 `app_commands.rs`（**数据文件**，同属 300–600 豁免带）—— 结构性下界，非欠账 | 已完成（批 0-C3 Task 1，2026-09-11）；余下 161 行模块理由注释 + 装配逻辑，无进一步拆分标的 |
| app/src-tauri/src/db_migrations.rs | 573 | v0.20.11 批 6（REQ-315）再增：note_groups.pin ensure_column + note_group_orders 建表（+21，实测 573——登记值 492 过期；schema 单点收敛理由同左） | 若再增长：kb_* 与 chat_* 表 DDL 拆至 db_migrations_kb.rs |
| app/src/types/knowledge.ts | 559 | 知识体系类型域（体系/节点/概念/模型/引用/审计/决策 + v0.13.8 画布契约 + v0.14.1 画布偏好枚举与下拉文案常量）——类型与文案常量同域防漂移（前端类型域拆分任务待执行） | 若再增长：画布偏好类型与文案拆至 types/canvas.ts |
| app/src-tauri/src/capture/audio_loopback.rs | 558 | ADR-007 重连机制（重试循环/退避/恢复回调）内聚于捕获线程实现，拆出需跨函数传递 COM 生命周期参数，内聚性优先；2026-08 A1 硬暂停（端点 Stop/Start + 暂停时长补偿 + 残留缓冲清空）再增 | 若再增长：将 run_capture_inner 拆至 audio_loopback_session.rs |
| app/src-tauri/src/screen_merge.rs | 548 | v0.7.3（REQ-155/158）：屏级聚合纯函数域（聚类/行合并/角色分类/块去重）+ v0.7.5 净化纯函数（单字符/边缘条带/零跨度合并/图去重/包含率）——纯逻辑内聚便于单测 | 若再增长：零跨度合并与图去重拆至 screen_fix.rs |
| app/src/components/action-center/ActionCenterPanel.tsx | 537 | v0.20.5 行动中心独立页化：原 ActionCenterOverlay.tsx（509 行登记）更名迁移至 action-center/ 并去遮罩/关闭形态（refreshToken 切回重载）——编排内聚（TD-2026-09-06-G 预留目录兑现）；2026-09-06 实测登记 | 若再增长：队列/历史/SOP 三区拆至 action-center/ 子组件 |
| app/src-tauri/src/commands_knowledge_core.rs | 529 | v0.13.1（REQ-202~205）：知识体系命令域（概念/模型/引用/审计——commands 9-18）内聚；源 commands_knowledge.rs（18 命令 + 校验）超限按规格 §四拆，本文件承接后半；commands 薄壳 + inner 纯函数 + @ai-context 注释内聚于命令域 | 若再增长：引用与审计拆至 commands_knowledge_links.rs |
| app/src-tauri/src/live_frame_process.rs | 529 | v0.6.0 ADR-011 拆分产物：帧处理域（网格差异触发/两级判变/带外事件驱动/UI 面板抑制/字幕落库）内聚；process_frame 上下文参数 20+；H2 修复（OCR 热路径切超时变体）+ L2 修复（score 口径诚实化）行数微增 + v0.11.5 Task 2 新颖度变化区域接线再增 | 若再增长：handle_subtitle_frame 与 persist_voted_subtitle 拆至 live_subtitle_persist.rs |
| app/src-tauri/src/engine.rs | 526 | 引擎池句柄与同步 API（双 worker 编排 + ADR-009 设备状态 + M7 心跳/失败/缓存计数 + 有界等待变体）；三维复审 #5 超时排空机制（drain_asr/ocr_backlog）与 #3 ASR_FILE_TIMEOUT 文件级超时常量接入后，worker 主循环与请求协议按登记计划拆至 engine_worker.rs（见文末"已拆分"注记）回归本值 | 若再增长：排空机制与同步 API 变体拆至 engine_request.rs |
| app/src-tauri/src/asr_merge.rs | 524 | v0.5.0 ADR-012 F4-1 语义合并域 + v0.7.0 M2 REQ-119 混排空格（spacing_for/merge_segments_with_spacing）；合并决策与切分共用标点常量 | 若再增长：split_sentences/split_timestamps 拆至 asr_merge_split.rs |
| app/src/components/GroupSidebar.tsx | 519 | v0.20.12 批 7（REQ-316）拖拽归组/ⓘ 弹层移组清理留痕透传（509→519；登记值过期纠偏） | 若再增长：体系引用拉取与徽标聚合拆至 useGroupSystemLinks.ts hook |
| app/src-tauri/src/video_profile_tests.rs | 518 | 档案测试域（12 档案断言矩阵 + 检测投票 + JSON 校准 + v0.13.6 领域记忆独立通道/旧 JSON 零迁移用例 + 审查回归（烘焙迁移/单字种子守卫））单模块 #[path] 挂载 | 若再增长：档案矩阵拆至 video_profile_data_tests.rs |
| app/src/components/LiveActivityPanel.tsx | 517 | 实时活动面板：会话状态/转录流/OCR 预览/控制区多状态面板内聚（前端审查登记） | 若再增长：转录流与 OCR 预览拆至 LiveTranscriptStream.tsx / LiveOcrPreview.tsx |
| app/src-tauri/src/ai_client.rs | 505 | v0.11.6 M1（AiClient::from_provider / from_settings_with_store / is_fallbackable / fallback_provider_ids）+ 2026-09-11 DeepSeek V4.1 适配（chat_plain 探活路径 / build_plain_payload / json 前置条件兜底接线 / thinking 策略落点 / 4xx 错误体透出——纯策略与提取逻辑已拆至 ai_request_policy.rs）——Provider 解析与错误分类内聚于 AiClient 域，构造入口与降级链纯函数同文件便于单测。**旧登记 322 为过期快照，本次按实测纠偏** | 若再增长：fallback_provider_ids 拆至 ai_fallback.rs；payload 构造族拆至 ai_payload.rs |
| app/src-tauri/src/app_commands.rs | 503 | 宏约束下的**唯一**注册点：334 条 `generate_handler!` 条目是**数据不是逻辑** —— `Invoke` 按值语义使分域组合不可行（见文件头），拆成多份只会在域间新增「命令名 → 域」路由漂移面；一致性由 `scripts/check-command-registry.mjs` 机器门禁守 | 不拆（数据文件）；新增命令时同步条目，由门禁强制 |
| app/src/components/GroupSidebar.test.tsx | 497 | 覆盖串组场景——切换 ⓘ 弹层目标组时表单态必须重置（key=group.id（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/db_sop.rs | 490 | v0.20.3（REQ-296/297）SOP 三表数据域（模板/run/步骤/保鲜/聚合）+ 审查加固（保链更新/幂等守卫/步数计数）内聚 | 若再增长：run 执行族拆至 db_sop_run.rs |
| app/src-tauri/src/live_session_persist.rs | 488 | 定稿落库域（persist_final/digest_merged/handle_final_event）+ P2 flush_tail_and_persist（停止/暂停共用尾句落库）内聚 | 若再增长：flush_tail_and_persist 与 digest_merged 拆至 live_session_persist_tail.rs |
| app/src-tauri/src/db_sessions.rs | 482 | 会话仓储；批 4 delete_sessions_batch + 审查修复轮 3（transaction() 改造）——2026-09-09 实测纠偏（登记值 394 过期） | 若再增长：recent_ocr_texts 等建议查询拆至 db_sessions_queries.rs |
| app/src-tauri/src/commands_ai_enrich.rs | 479 | v0.8.0 M3（REQ-142）+ F1/F2/F3：知识补充命令域（九子项校验/预估/异步任务/采纳/撤销 + 配额去重门控 + 成本硬拦截 + 任务落库）——与精修共用任务注册表上下文，命令域内聚；2026-09 修复（章节目录注入/逐块审查回执）微增 | 若再增长：门控/拦截拆至 commands_ai_enrich_gate.rs |
| app/src-tauri/src/region_tracker.rs | 478 | v0.4.0 M2（REQ-037）起：ROI 跟踪状态机（播放区域检测/锁定聚簇/重扫/前台切换冻结）+ 纯函数单测内联；与 RoiTracker 状态强耦合 | 若再增长：lock_roi/prior_roi 纯函数拆至 region_lock.rs |
| app/src-tauri/src/layout_analyzer.rs | 475 | v0.5.0 M3（REQ-047）：规则版版面分析（行/列投影 + 表格线检测 + 区域分类启发式）内聚于同一分类管线；审查加固（公式启发 + 低信息纯色方差滤除） | 若再增长：区域分类启发式拆至 layout_classify.rs |
| app/src-tauri/src/commands_session_note.rs | 472 | 既有登记 314 为过期快照——2026-09-06 实测纠偏（v0.20 装载合成/web 分支/批量 inner 扩展后 +144） | 若再增长：convert_to_note 拆至 commands_session_note_convert.rs |
| app/src/components/RefineWorkbench.tsx | 471 | 并排双栏（规则版 + 精修版）+ 章节级 diff 高亮 + 同步滚动 +（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/streaming_asr.rs | 466 | sherpa-onnx OnlineRecognizer（Zipformer transducer 中英双语流式），（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src/components/KnowledgeCanvasView.tsx | 466 | v0.13.8 画布主视图（RF 装配/拖拽防抖保存/视口持久化/自动排列）；v0.13.9 根卡 + 接线方向动态化；v0.14.1 布局/连线下拉 + 偏好读写（+72 行）+ 审查修复（布局 effect 原子化拆分建边 effect/prefsLoaded 控件门控/hasCore 统一 +31 行）——RF 状态与持久化编排内聚（元素构建已拆至 canvasElements/layout* 纯函数） | 若再增长：偏好读写与下拉拆至 useCanvasPrefs.ts；位置持久化拆至 useCanvasPositions.ts |
| app/src-tauri/src/streaming_asr_tests.rs | 462 | 流式 ASR 测试域（端点处理/静音判定/段切分回归）单模块 #[path] 挂载 | 若再增长：端点处理组拆至 streaming_endpoint_tests.rs |
| app/src-tauri/src/structure_note_tests.rs | 458 | v0.7.6（REQ-177~181）：结构渲染层单测域（章节插入位置/命名窗口/词汇表排序上限锚点/零回归护栏/JSON 往返）单模块 #[path] 挂载 | 若再增长：词汇表组拆至 structure_note_glossary_tests.rs |
| app/src-tauri/src/db_note_group_clean_tests.rs | 447 | REQ-316（批 7）测试域：判定表（自动/系列/手动/改判/五类残留/影响面外/级联卫生）+ 写路径集成 16 例，单模块 #[path] 挂载 | 若再增长：写路径集成组拆至 db_note_group_clean_flow_tests.rs |
| app/src-tauri/src/commands_session.rs | 443 | v0.6.0 M6 + v0.7.6 审查硬拆后回归：会话命令域（CRUD/质量报告/课程分组/段搜索）内聚；笔记转换管线已拆至 commands_session_note.rs；M2 修复（search_ocr_blocks 传 data_dir 参数） | 若再增长：course/search 拆至 commands_session_extra.rs |
| app/src-tauri/src/symbol_normalize.rs | 443 | v0.6.0 M1（REQ-060）：口语符号映射域（映射表/上下文守卫/中文数字解析）内聚；数字解析与守卫共享字符判定 | 若再增长：parse_chinese_number/replace_number_runs 拆至 symbol_numbers.rs |
| app/src-tauri/src/commands_goals_plan.rs | 442 | 规划＝单次同步调用 + spawn_blocking（10-30s 交互等待可接受，（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src/App.tsx | 439 | 根装配（页面切换/焦点跨页直达状态机/全局事件监听）+ v0.20.5 行动页 + v0.20.10 批 5 复习页 Tab/深链/保活挂载（f702d876）——登记值 363 过期，实测纠偏 | 若再增长：焦点跨页直达 state 族拆至 useFocusRouting.ts |
| app/src-tauri/src/screens.rs | 437 | v0.7.3（REQ-155/156/160）：画面要点屏构建编排（分组/聚类/图匹配 IO）+ 可消费块过滤扩展——编排与纯函数分层（纯函数在 screen_merge.rs） | 若再增长：filter_usable_blocks 拆至 screen_filter.rs |
| app/src/pages/KnowledgePage.tsx | 437 | v0.13.8 画布接线越线（原 296）：中栏「画布」标签 + 树/画布双入口 + v0.15 左列/详情列状态迁移（useColumnLayout + 折叠窄条 + 宽度 prop）——页面编排层内聚（数据获取/选中态/标签态为页面本地状态），子组件已全部下沉（Tree/Canvas/DetailPanel/Wizard/ConceptCardRow/Sample） | 若再增长：中栏视图块（树/画布/概念/模型 + 标签栏）拆至 KnowledgeMiddlePane.tsx，SystemCard 拆至 SystemSidebarCard.tsx |
| app/src-tauri/src/commands_knowledge_tests.rs | 435 | v0.13.1（REQ-202~205）：知识体系命令层单测域（校验纯函数 + inner 编排 + 四类 target/审计信号聚合）单模块 #[path] 挂载 | 若再增长：引用与审计组拆至 commands_knowledge_links_tests.rs |
| app/src-tauri/src/screens_tests.rs | 433 | 画面要点屏构建测试域（分组/聚类/图匹配/可消费块过滤回归）单模块 #[path] 挂载 | 若再增长：可消费块过滤组拆至 screens_filter_tests.rs |
| app/src-tauri/src/note_filter_golden_tests.rs | 431 | v0.7.5（REQ-172）：黄金语料回归域（会话31/29 实证 + 结构渲染 2 例 + 审查补测）单模块 #[path] 挂载 | 若再增长：结构渲染组拆至 note_filter_golden_structure_tests.rs |
| app/src-tauri/src/db_note_groups_tests.rs | 426 | v0.11.0 组数据层测试域 + v0.14.1 删除/影响面用例（级联归零/悬空清理/迁移回归）——单模块 #[path] 挂载（video_profile_tests.rs 同款先例），组删除语义变更集中验证 | 若再增长：删除/影响面组拆至 db_note_groups_delete_tests.rs |
| app/src-tauri/src/analysis.rs | 423 | v0.5.0 M2 起结构化分析编排域（章节/重点/术语/讲者 + 事件消费 + step_boundaries/practice_segments/player_actions 三字段 + 审查修复按类型判定）；各机制输出聚合内聚于单一分析函数 | 若再增长：build_chapter_signals 事件版拆至 analysis_signals.rs |
| app/src-tauri/src/artifact_templates_tests.rs | 423 | 产物模板测试域（五档案模板 + 代码块/步骤卡扩展 + 叙事变体 golden）单模块 #[path] 挂载 | 若再增长：代码块/步骤卡组拆至 artifact_code_tests.rs |
| app/src-tauri/src/app_setup.rs | 420 | 本模块承载 setup 的 AppState 初始化（数据目录/DB/引擎池/可校准（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/bin/asr_eval.rs | 418 | 目的——"无人工语料也能测 ASR"（2026-09-03 用户裁决①）：（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/vocab.rs | 416 | 词表域（存储/纠错/候选提取/n-gram 分词）内聚；分词纯逻辑与存储同域便于单测 | 若再增长：collect_tokens/split_runs 拆至 vocab_tokens.rs |
| app/src-tauri/src/ui_junk.rs | 415 | UI 噪声过滤域（水印/字幕条/角标检测规则 + 窗口过滤启发式）内聚于同一判定管线，规则共享窗口几何上下文 | 若再增长：窗口过滤拆至 ui_junk_window.rs |
| app/src/components/NoteEditView.tsx | 411 | v0.13.6（审查 H1 修复）：forwardRef 命令式 flushSave 出口（ESC 先保存后刷新）+ flushLatest 最终保存；v0.15 剪贴板图片 paste（useClipboardImagePaste+插入）+ 外链图下载导入——编辑视图保存/快捷键/工具栏/图片入口内聚（textarea 降级路径与 CM 版同步） | 若再增长：工具栏与 MarkdownEdit 快捷键拆至 NoteToolbar.tsx |
| app/src-tauri/src/live_session_loop.rs | 410 | v0.7.0 M0 拆分产物（音频编排循环）：主循环 + 长静音/音量骤变/VAD 段事件写入 + drain/停止 flush；LiveSessionCtx 聚合上下文；A1 暂停边沿 + P1 停止 drain 重构；H1 修复（drain_deadline 改 Option，draining 置位时才计算） | 若再增长：事件写入块拆至 live_session_events.rs |
| app/src/components/RichEditorView.tsx | 408 | v0.20.13 批 8（REQ-317）编辑态选区右键菜单接线（CM contextmenu extension + 动作分发，323→399；**前置 323 超 300 为 v0.20.8 偏差登记未登记债务**，本次实测纠偏并登记）——选区纯逻辑已拆 utils/noteSelectionMenu.ts 与 note-selection/SelectionActionMenu.tsx，本文件仅留宿主接线 | 若再增长：工具栏 action 分派拆至 commands/ 域（既有 toolbarCommands/headingCommand 范式） |
| app/src-tauri/src/commands_live.rs | 399 | 实时采集命令域（启动/停止/档案热切换/剪辑监听）；v0.13.6（REQ-220）update_live_profile 细目参数与校验 + 审查轮（clear sentinel 空串语义/fine 计入至少一项）再增 | 若再增长：档案覆写命令拆至 commands_live_profile.rs |
| app/src-tauri/src/commands_video.rs | 399 | v0.5.0 M1（REQ-043）起：视频档案命令域（检测装配/领域检测/预热/记忆）；v0.13.6（REQ-219~222）形态/领域/细目/记忆命令 + 分区映射形态接线再增；审查轮（H1 领域记忆兜底顺序修复/L2 独立 try）微增 | 若再增长：领域命令组拆至 commands_video_domain.rs |
| app/src/components/ProfileDetector.tsx | 397 | 档案检测组件：投票/确认流/记忆偏好 UI + v0.11.5 Task 5 冲突提示内聚 + v0.13.6（REQ-219~222）形态 10 下拉/领域 20 下拉/细目多选 chips/分区映射形态优先 + 审查轮（onProfileChange ref/独立 try/fine_ids 同步，实测 2026-08-24） | 若再增长：确认流与细目 chips 拆至 ProfileConfirmFlow.tsx |
| app/src-tauri/src/live_session_pause_tests.rs | 395 | plan_edge_observation 为纯函数（无 epoch/DB/emit 依赖——会话（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/live_session.rs | 394 | 会话装配/状态（LiveSessionParams 聚合 + run_session_after_engine 骨架 + ProfileOverride 细目字段）；v0.13.6 +2 | 若再增长：ProfileOverride 与参数分拆至 live_session_params.rs |
| app/src-tauri/src/fusion_tests.rs | 392 | 融合测试域（ADR-005 四规则 + REQ-062 概率加权 + REQ-103 音量透传 + REQ-111 切分对齐）单模块 #[path] 挂载 | 若再增长：REQ-111 切分对齐组拆至 fusion_split_tests.rs |
| app/src-tauri/src/db_fragments.rs | 391 | REQ-316（批 7）：delete_fragment/update_fragment_group/promote 同事务空组自动清理接线（登记值 309 过期快照，实测纠偏） | 若再增长：promote_fragment_to_note 事务拆至 db_fragments_promote.rs（既有登记计划兑现） |
| app/src-tauri/src/commands_ai.rs | 388 | v0.5.0 起 AI 复核命令域（边界批量复核/配额/缓存/审计 + 结构渲染接线）；与 note_filter_ai（纯逻辑）分层 | 若再增长：批量复核循环拆至 commands_ai_review.rs |
| app/src-tauri/src/import.rs | 385 | 导入域编排（音视频/图片导入流程 + 帧提取调度）内聚；与 import_frame/import_transcribe 分层 | 若再增长：导入参数校验拆至 import_validate.rs |
| app/src-tauri/src/commands_proofread.rs | 383 | v0.20.2（REQ-270）LLM 校对命令域（预估/门控/分块请求/裁决源列表/失败记账）内聚；2026-09-06 实测登记（TD-2026-09-06-G） | 若再增长：record_proofread_failure 与载荷回写拆至 proofread_apply.rs |
| app/src-tauri/src/capture/resample.rs | 381 | 音频重采样域（采样率转换/缓冲对齐/帧切分）内聚于捕获子模块，纯函数与捕获缓冲格式共享上下文 | 若再增长：帧切分拆至 resample_frames.rs |
| app/src/components/GoalDetail.tsx | 379 | 一致性契约——进度信号每次现算（get_goal_progress），动作后（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/live_session_lifecycle.rs | 376 | 会话启动/预热生命周期 + v0.19.2/3（REQ-273 + 审查即修：锁外等待+枚举化+辅助函数抽取，+78）——start/prepare/release 与等待/回退策略强耦合于 impl 生命周期域 | 若再增长：wait_prepared_ready 与回退策略拆至 live_session_start.rs |
| app/src/components/RouteInfoPopover.tsx | 375 | v0.20.12 批 7（REQ-316）移入/移出选中笔记清理留痕透传（360→375） | 若再增长：简报拉取与渲染拆至 SystemBriefSection.tsx |
| app/src-tauri/src/commands_fragments.rs | 374 | 碎片命令域 + REQ-316（批 7）结果契约与组域条件广播（登记值缺失为漏登——HEAD 基线已 347，本次补） | 若再增长：碎片组操作命令族拆至 commands_fragments_group.rs |
| app/src-tauri/src/analysis_tests.rs | 371 | 分析编排测试域（档案门控矩阵 + REQ-108 事件消费 + M2 三字段）单模块 #[path] 挂载 | 若再增长：事件消费组拆至 analysis_events_tests.rs |
| app/src-tauri/src/commands_web_inbox.rs | 371 | v0.20.4（REQ-304）扩展收件命令域（起停/状态/HTTP 小循环/投递收口/图落盘）内聚；2026-09-06 实测登记（TD-2026-09-06-G） | 若再增长：HTTP 连接处理拆至 web_inbox_http.rs |
| app/src-tauri/src/live_keyframes.rs | 370 | ① handle_full_frame：全帧画面要点落库 + 关键帧样本收集与（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/windows.rs | 370 | 窗口枚举/评分域 + v0.19.2（REQ-271/272）：CaptureWindow.zOrder/systemWindow 字段 + 抖音/快手/B站客户端评分表（+28）——枚举系统副作用与评分纯函数同域便于单测（既有模式） | 若再增长：z 序/系统标记纯函数拆至 windows_meta.rs |
| app/src-tauri/src/commands_window.rs | 369 | 浮窗窗口命令域（v0.12.3 架构升级计划：全部窗口操作集中单文件）+ v0.12.6（ADR-025）显隐链路与全局快捷键三态切换核心（open/close/locked/topmost/toggle 核心 fn + 命令薄包装 + 状态机/序列化单测内联）；拆分需跨 fn 传递 AppHandle/State，内聚性优先 | 若再增长：浮窗核心逻辑拆至 float_core.rs（命令薄包装保留本文件） |
| app/src/components/KnowledgeCanvasView.test.tsx | 368 | @xyflow/react 全 mock（ReactFlow 记录 props 供交互断言；节点组件（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/db_notes.rs | 366 | REQ-316（批 7）：delete_note/update_note_group 改显式事务 + 同事务空组自动清理接线（结果契约扩展 + 旧组读出，净增 ~60 行；此前 305 未登记属漏登，本次补） | 若再增长：移组/删除事务族拆至 db_notes_group_ops.rs |
| app/src-tauri/src/ocr_cache.rs | 358 | OCR 结果缓存域（内容指纹键/容量淘汰/命中率统计）内聚；缓存策略与指纹算法共享上下文 | 若再增长：指纹算法拆至 ocr_fingerprint.rs |
| app/src-tauri/src/db_sessions_tests.rs | 354 | 由 db_sessions.rs 以 #[cfg(test)] #[path] 引入，保持实现文件 ≤300 行（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/live_session_pause.rs | 353 | 批 2 暂停边沿收敛域 + 审查修复轮 1（own_pending 吸收/丢采样恢复沿补发）净增——2026-09-09 纠偏实测 353（交付口径 258 失真），300-600 档登记 | 若再增长：合成事件对构造拆至 live_session_pause_synth.rs |
| app/src-tauri/src/ai_client_tests.rs | 352 | ai_client.rs 单测域（22 例：payload 构造族 build_chat_payload/build_plain_payload、JSON 前置条件提示、chat_completions_url 拼接、响应提取与弱化解析、fallback_provider_ids；env 变量以静态 Mutex 串行化，不触网）——测试模块由 `#[cfg(test)] #[path]` 单点挂载（ai_client.rs:504），纯函数用例与实现同域便于契约对齐。**本条目由生成器补登（该文件无 @ai-context 头注释），理由为 2026-09-11 重建时人工补写** | 若再增长：payload 构造组拆至 ai_client_payload_tests.rs |
| app/src/components/AiProviderSettings.tsx | 352 | v0.11.6 M1 code-review 修复（2026-08-22）：删除/清钥加 window.confirm、window.prompt 改卡片内联 password 输入（+2 state + 内联表单）、模型列表 input 改 textarea、fallbackOrder 透传 initial、run 置"处理中"反馈、预设双源 presetOptions 后端拉取——修复净增约 13 行越线（实测 329，含 4 行豁免头注释） | 若再增长：内联密钥表单拆至 AiProviderKeyInput.tsx |
| app/src/pages/SessionsPage.tsx | 352 | 本层为状态宿主与数据编排：会话列表/详情状态、事件驱动刷新（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src/components/NoteLinkToSystem.tsx | 351 | v0.19.7（REQ-286）重构：挂体系选择器（体系下拉 + 三 tab + LinkEntityPicker 搜索树列表 + 三类内联轻建编排 + 既有反查/撤链/钳制语义保持）——实体选择/创建交互已下沉 LinkEntityPicker.tsx（134 行），本文件保留编排与数据装载内聚 | 若再增长：树行构建（flattenNodeRows）与实体装载拆至 useSystemEntities.ts hook |
| app/src-tauri/src/commands_ai_settings.rs | 349 | AI 设置命令域（视图/密钥/授权/目标 AI） + v0.19.1 ai_set_kb_qa 最小面命令（+28）——read-modify-write 同域先例（ai_set_goal_plan）内聚 | 若再增长：kb/goal 最小面命令拆至 commands_ai_settings_extra.rs |
| app/src-tauri/src/structure_models.rs | 343 | v0.5.0 模型版：模型清单/独立状态机下载器（进度事件/.part 原子写/按需启用三分类）+ 磁盘就绪判定（disk_done）内聚 | 若再增长：download_one 拆至 structure_download.rs |
| app/src-tauri/src/db_ai_tasks.rs | 340 | 任务注册表在 AppState 内存（HashMap）——重启即失、未采纳（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/screen_merge_tests.rs | 339 | 屏级聚合/净化纯函数测试域（聚类/行合并/零跨度/图去重回归）单模块 #[path] 挂载 | 若再增长：净化组拆至 screen_merge_purify_tests.rs |
| app/src-tauri/src/db_notes_tests.rs | 337 | db_notes.rs 单测域（15 例：笔记 CRUD/updated 倒序/搜索通配符转义/会话关联与旧库 ensure_column 迁移；全部走内存库，环境隔离铁律）——测试模块由 `#[cfg(test)] #[path]` 单点挂载（db_notes.rs:365），H3 硬拆时由原 db.rs 的 tests 模块整体迁入（语义不变）。**本条目由生成器补登（该文件无 @ai-context 头注释），理由为 2026-09-11 重建时人工补写** | 若再增长：会话关联与迁移用例拆至 db_notes_link_tests.rs |
| app/src-tauri/src/pause_state.rs | 336 | 批 2（REQ-308）暂停来源状态机域（PauseSource/PauseShared/request 单写点）——2026-09-09 审查纠偏实测 336（交付口径 250 失真），300-600 档登记 | 若再增长：条件真值表与 request API 拆至 pause_machine.rs |
| app/src-tauri/src/commands_asr_pass2.rs | 333 | 实时链路只有端点句 SenseVoice 重打分；本命令把"导入同级的（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/commands_after.rs | 332 | v0.20.3（REQ-294/295/299/300）收尾命令域（批决议/导出/练习/问题）内聚；2026-09-06 实测登记（TD-2026-09-06-G） | 若再增长：批决议核心拆至 weekly_resolve.rs |
| app/src-tauri/src/fusion.rs | 332 | 纯规则融合（无 LLM，本地优先降级路径）。规则按优先级：（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/capture/dxgi_capture.rs | 331 | 主路径用 DXGI 桌面复制（GPU 直取，性能最优）；new 或运行时（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/commands_knowledge_decisions.rs | 331 | 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）；编排 `fn xxx_inner(db, …)`（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/structure_capture_tests.rs | 331 | 纯函数（网格换算/裁剪钳制/过滤上下文组装）+ 端到端集成（合成（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/db_graph_tests.rs | 330 | 覆盖三类边聚合正确性——link（体系实体→内容，node_id 引用跳过）、（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/image_store.rs | 330 | 会话目录本地存图（关键图/参考图集/缩略图走廊三级）：（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/subtitle.rs | 328 | L1 外挂字幕（.srt/.ass/.vtt）纯文本解析，零第三方依赖——（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/commands_ai_chat.rs | 324 | v0.16 对话命令域 + v0.19.1（REQ-260）检索分支薄壳（纯聊链路零改动；kb 编排已拆至 commands_ai_chat_kb.rs 267 行）——检索分流点与 run_stream 共用会话编排上下文 | 若再增长：run_stream 与纯聊发送拆至 commands_ai_chat_plain.rs |
| app/src/components/EnrichPanel.tsx | 324 | 与精修语义分开：精修=处理已有内容，补充=生成新内容（模型（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src/components/NoteReadingView.tsx | 322 | v0.20.13 批 8（REQ-317）正文选区右键菜单接线（正文容器 ref 化 + 选区判定/全选 + 共享菜单渲染，259→316）——选区纯逻辑已拆 utils/noteSelectionMenu.ts 与 note-selection/SelectionActionMenu.tsx，本文件仅留宿主接线 | 若再增长：搜索态/选区态/大纲态拆至 useNoteReadingViewState.ts |
| app/src-tauri/src/ai_note_refine.rs | 321 | v0.8.0 M2 + REQ-290①：精修适配器域（提示词装配/请求响应类型/非流式 refine/流式 NDJSON 逐节/预算接线）+ 2026-09-11 provider 策略落体（流式拍不走 post_completions）；协议与适配器同域便于 schema v2 一致性 | 若再增长：流式 NDJSON 路径拆至 ai_note_refine_stream.rs |
| app/src-tauri/src/bin/asr_forensic.rs | 321 | 定位"结尾识别不全/短句不清晰/断句不准"根因的三连验证：（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/db_ai_chat.rs | 321 | AI 对话双表仓储 + v0.19.1（REQ-260）retrieval/meta_json 补列与行映射（+42）——SQL/行映射内聚（db_* 文件先例） | 若再增长：消息侧读写拆至 db_ai_chat_messages.rs |
| app/src-tauri/src/engine_worker.rs | 321 | 拆分动机（三维复审 #9 + 豁免登记计划）：engine.rs 在接入超时排空（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/commands_ai_providers.rs | 317 | v0.11.6 M1：Provider 管理命令域（8 命令 + 视图映射 + 密钥解析口 resolve_default_provider_key/default_provider_ready）内聚于命令层；2026-09-11 探活改 chat_plain。`resolve_input`/`to_view` 与命令同域便于契约一致 | 若再增长：默认 Provider 解析与就绪门禁拆至 ai_provider_resolve.rs |
| app/src/components/AiConversationDock.tsx | 316 | 全局 AI 对话面板（REQ-274）+ 批 1 终态事件刷新接线——2026-09-09 审查纠偏实测登记（此前漏登），300-600 档 | 若再增长：会话列表段拆至 DockSessionList.tsx |
| app/src/components/SessionListPanel.test.tsx | 316 | 覆盖批 4 选择/批量交互矩阵——选择模式进出（按钮+Esc）、单击勾选、（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src/components/LiveProfileStrip.tsx | 315 | 采集时右栏由 LiveActivityPanel 独占、档案卡（ProfileDetector）（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/ffmpeg.rs | 313 | ffmpeg 是文件导入（音轨/关键帧）与内嵌字幕（L2）的唯一外部依赖。（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/note_filter_ocr.rs | 313 | BodySource::OcrDirect 分支的精简净化链——排序 → 净化链（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src/types/session.ts | 313 | 覆盖会话本体/转写段/OCR 块/画面要点屏、结构图与图内检索、（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/ai_provider.rs | 312 | v0.11.6 M1 + v0.12.0 M4：Provider 配置域（类型/校验/存储 IO/预设模板/legacy 迁移/默认链升级）+ 2026-09-11 DeepSeek V4.1 模型名归一（`current_deepseek_model` / `normalize_retired_deepseek_models`）——预设与迁移共处一文件保证"预设即迁移模板"的单一真源 | 若再增长：预设模板与迁移链拆至 ai_provider_migrate.rs |
| app/src-tauri/src/commands_refine_inner.rs | 312 | v0.5.0 模型版：课后精修编排（清单构建/降级决策/引擎懒加载/逐候选识别/产物回填/HTML→MD 转换）内聚于精修执行域 | 若再增长：html_to_markdown 拆至 html_table_md.rs |
| app/src/components/NotePreviewView.tsx | 312 | 原料/产物/笔记预览三视图之一：过滤后笔记正文（标题+讲述内容+（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/commands_ai_chat_kb.rs | 310 | 读路径 A 发送流——本地 kb_search 命中 → 命中片段列表恒返回（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src/components/KnowledgeTreeView.tsx | 310 | 树＋列表，不做图可视化（§五 UI 原则）——节点以递归列表呈现，（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/kb_fts.rs | 309 | 中文 BM25 切词口径校准（M0 spike 定案，2026-09-03）：（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/kb_search.rs | 309 | kb_search = FTS5 BM25 主链（中文经 kb_fts.rs 规划转 trigram（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/subtitle_ocr.rs | 308 | 本模块只做字幕文本流的多帧投票纠错与滚动字幕检测（纯函数/有状态（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src/components/NoteLinkToSystem.test.tsx | 308 | 覆盖——选体系→点行选中→link 零 id 契约；未选禁用/切体系重置；（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src/types/goals.ts | 308 | 目标是学习循环的意图层对象（规格 §一）——可追踪/可毕业/可复盘（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/commands_knowledge_systems.rs | 306 | 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）；编排逻辑（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/db_session_refine.rs | 306 | 原料 session_segments 不可变（ADR-030 决策 5 可逆契约延续）——（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/note_diff.rs | 304 | 纯函数：按行（块）比较 before/after，三态标记 unchanged/（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src/components/SecondPassPanel.tsx | 303 | 会话结束后把 S4 落盘音频全窗重跑 SenseVoice（后端 second_pass_* 命令），（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/region_ocr.rs | 302 | 原始帧 → LayoutAnalyzer → 区域列表 → 逐区域裁剪（内存 crop + 边距）（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src-tauri/src/series_detect.rs | 301 | 从窗口标题/文件名剥离"系列名 + 集号"（B站分P `P3`/`第3集`/`EP03`/（自动摘取，待细化） | 若再增长：按职责拆分 |
| app/src/utils/canvasElements.ts | 301 | v0.13.8 实体 → RF 元素纯转换域；v0.13.9 根卡/接线方向；v0.14.1 连线样式/箭头入参（+20 行）——单测共用纯函数域（零 React 依赖），拆分破坏转换一致性 | 若再增长：节点构建与边构建拆至 canvasNodes.ts / canvasEdges.ts |

## 已拆分 / 登记移除记录

> 已拆分：lib.rs（**1025 → 577 行**，批 0-C3 Task 1，2026-09-11）——`tauri::generate_handler![…]` 注册清单 450 行（334 条目 + 106 注释 + 10 条 `#[cfg(target_os="windows")]`）整体搬至 **app_commands.rs（503 行）**，条目只加 `crate::` 前缀（IPC 名 = 路径末段 ident，**零改名**）；`.plugin`/`.setup`/`.on_window_event`/`.run` 与 `punctuation_model` 一律留在 `run()`/`lib.rs`。**为什么不是 ≤300**：321 `mod` + 16 `#[cfg]` = **337 行地板**，`mod` 声明必须在 crate 根（挪进子模块会把全仓 `crate::x::y` 路径整体重写 = 违反行为等价）；`include!` 外移方案经评估**否决**（只是把 337 行挪个地方，且 crate 根的模块树不再可见）。⇒ lib.rs 停在 300–600 豁免带并如实登记本表；app_commands.rs 是**数据文件**（注册条目，非逻辑），同带登记。**机械等价证据**：`probe-registry-parity.mjs verify` = 334 条逐条相同（含 10 条 cfg 门控、顺序不变）；**行为等价**：`cargo test --test app_lib_tests` = 2357 passed / 0 failed / 6 ignored（与拆前一致）。**签名偏差（实测）**：`app_commands::handle()` 必须是具体 `tauri::Wry`，不能写成计划书的 `handle<R: Runtime>()` —— 334 条里有 13 条按值收 `AppHandle`（`commands_knowledge_core` 2 / `commands_window` 6 / `commands_overlay` 3 / `commands_asr_pass2` 2），泛型 `R` 下 `AppHandle<R>: CommandArg<'_, R>` 会被 rustc 退到 `Deserialize` 兜底 impl（13 × E0277），计划书给的 `Box<dyn Fn>` 退路同样是泛型、同样失败；`Builder::default()` 本就是 `Builder<Wry>`，故行为等价。**新增门禁**：`scripts/check-command-registry.mjs`（定义 ↔ 注册三向检查：漏 / 多 / 重名，含 `--self-test`）。
> 已拆分：engine.rs（三维复审 #5 超时排空机制接入后逼近 600 行硬拆线）按登记计划将 worker 主循环与请求协议（AsrRequest/OcrRequest/双 worker 循环/词表纠错纯函数）拆至 engine_worker.rs（253 行）——engine.rs 回归 440 行（仍登记，300-600 区间），engine_worker.rs ≤300 行无需登记。
> 已拆分：db.rs（2026-08-21 H3 硬拆，原 678 行超 600 硬限违规）：schema 建表 + ensure_column 列迁移拆至 db_migrations.rs（204 行），notes CRUD 拆至 db_notes.rs（216 行，测试迁至 db_notes_tests.rs 265 行）——db.rs 回归 72 行（Db 结构体/连接锁/with_conn/通用工具），三新文件均 ≤300 行，登记移除。M3 锁中毒恢复（with_conn + into_inner）随拆分一并落地。
> 已拆分：live_session.rs（2026-08-21 Task #14 硬拆，实测 727 行超 600 硬限违规）：状态查询/控制方法簇（快照/暂停/停止/会话 id 查询）拆至 live_session_manager.rs（150 行），启动与预热生命周期（start/prepare/run_session/wait_prepared_ready）拆至 live_session_lifecycle.rs（288 行）——live_session.rs 回归 284 行（参数/结构体定义 + 构造 + run_session_after_engine 装配骨架），impl LiveSessionManager 跨文件分布，公共 API 签名零变化；三文件均 ≤300 行，登记移除。
> 已拆分/删除：NoteGroupPanel.tsx（v0.12.2 笔记页三栏重构，原 545 行登记）——三合一职责拆分：GroupSidebar.tsx（267 行组筛选侧栏）+ RouteInfoPopover.tsx（278 行 ⓘ 弹层四区）；FeedFragmentList.tsx 改为收件箱碎片卡（263 行）；noteTree.ts/v0.11.5 树形合并下线；四文件均 ≤300 行，登记移除。
> 登记移除：NoteEditView.tsx（登记值 315 过期——实测 299；v0.12.2 新增 autoFocus 一行后仍 ≤300，无需登记）。**v0.13.6 审查修复（forwardRef flushSave）后实测 306 行，重新登记于上表。**
> 已删除：live_pipeline_diag.rs（2026-08-21 L5 清理）——"诊断后删除"的临时诊断模块，确认 lib.rs 注册仅 test cfg 且无其他引用后整体移除。
> 已拆分：dxgi_capture.rs（原 ~333 行）于 v0.4.0 M0（TD-033，提交 2a88b25）将 DxgiState 拆至 dxgi_state.rs——现均 ≤300 行，无需登记。
> 已拆分：live_session_frame.rs（原 ~500 行登记）于 v0.6.0 ADR-011（REQ-086/087）按拆分计划将 process_frame 帧处理拆至 live_frame_process.rs。
> 已拆分：live_session.rs（原 ~798 行，v0.7.0 M0 X-O5 强制落地）按登记计划拆至 live_session_fusion.rs/live_session_loop.rs，并补充 live_session_persist.rs。
> 已拆分：streaming_asr.rs（原 ~378 行，v0.7.0 M0 X-O5 强制落地）按登记计划将端点处理块拆至 streaming_endpoint.rs。
> 已拆分：lib.rs（v0.7.5 超 600 行强制落地）按登记计划将 setup 初始化块拆至 app_setup.rs；后因命令注册与模块声明增长重新越线（实测 486），重新登记于上表。
> 已拆分：note_filter.rs（v0.7.5 净化接线后超 600 行风险）按登记计划将 boundary_candidates/apply_ai_decisions 拆至 note_filter_ai.rs（≤300）。
> 重新登记：live_session_frame.rs 于 2026-08 暂停/画面档多轮增长后重新越线（见上表）；live_session.rs 同轮越线并于 Task #14 完成硬拆（见上条已拆分记录），登记移除。
> 登记移除：ai_refine_protocol.rs（2026-09-05 审查 M3）——实测 295 ≤300 无需登记（流式渲染/解析新增后仍合规），原登记 340 不实已撤
> 登记移除→重新登记：EnrichPanel.tsx（v0.20.x 复核登记值 ~330 过期，实测 299 ≤300 移除）。**2026-09-11 重建复核实测 324 行（>300），原移除结论不再成立，已恢复登记于上表 301–600 档。**
> 复核解除：app/src/types.ts（前端类型域拆分期间「暂不登记行数」注记）。**2026-09-11 重建复核实测 20 行**——2026-08 审查 H4 已按领域硬拆至 `types/` 子目录，本文件仅作 re-export barrel（既有 import 路径不变），无需登记。
> 已拆分：app/src/components/SessionDetailPanel.tsx（2026-09-11 批 0-C2 Task 3，分 4 个原子提交 0db7d972 / 26abdc90 / e2db3a39 / fd1b6f55，登记值 656 超 600 硬限）：按实测结构分析拆出 4 个单元——`components/session-detail/SessionScreenCards.tsx`（192 行，画面要点屏卡流；单屏 toast 与框选态**不在此文件**，见下条等价性修正）· `hooks/useSessionDetailData.ts`（237 行，质量报告/术语表/baseUrl + 4 条精修 listen + 懒触发 auto_refine_session + 深链快照 + startRefine + **屏卡瞬时态（框选/单屏 toast）**）· `components/session-detail/SessionDetailHeader.tsx`（160 行，降级横幅 + 改名/状态行/融合中徽标/操作）· `components/session-detail/SessionRefineSection.tsx`（66 行，精修工具条三按钮——**原登记名 SessionPass2Section.tsx 名不副实（内容还含 ProofreadPanel 入口），按裁决 D2 更名**）。主文件回归 **296 行**（纯编排层），四新文件均 ≤300 行无需登记；公共 props 契约（9 个）零变化，唯一消费者 pages/SessionsPage.tsx 未改。分步净减实测：656 →（屏卡流）522 →（数据 hook）410 →（头部）305 →（精修区）288 →（等价性回归修正）296。M7 的屏→OCR 分组 memo 仍留在 hook 层并以 prop 传 Map。**拆分计划**：web 早返回（SessionWebView）/ 质量卡（SessionQualityCard）/ 转写时间轴（SessionTranscriptPane）/ 术语表（SessionGlossarySection）为可选的 5–8 步精化，本轮按「最小可行 + 合规即停」未做（本文件无专属测试，人工核对成本优先）。
> 等价性回归修正：SessionDetailPanel 拆分后复核发现，单屏 toast 与框选态随 `SessionScreenCards` 下沉会**随原料视图卸载而丢失**——「保存 toast 的 4s 内」或「框选进行中」切到笔记预览再切回时状态提前消失，属用户可见行为差异（本批红线是纯重构、行为等价）。已按 `fix(ui): 屏卡 toast/框选态上提至数据 hook（等价性回归）` 把两者上提至 `hooks/useSessionDetailData.ts`（该 hook 由面板在早返回之前调用、面板跨视图切换不卸载 ⇒ 状态寿命与拆分前一致；toast 定时器卸载清理随之上移，注册/清理时机同为面板挂载/卸载），屏卡组件改为接收值 + setter 共 5 个 prop：`selectingScreen` / `onSelectScreen` / `panelToast` / `onShowToast` / `onClearToast`。行数影响：面板 288 → 296（≤300）、hook 191 → 237、屏卡 198 → 192；DOM 结构、文案、`seg-`/`ocr-` 锚点、`invoke` 参数与时机均未变。
> 已拆分：app/src/pages/NotesPage.tsx（2026-09-11 批 0-C2 Task 1，分 9 个原子提交 88b45e8c / c1840067 / 6ef2060a / b3adbe66 / 2f11a140 / 9c3cabef / 8ff7d73f / 114e4d41 / 61a4022b，登记值 602 超 600 硬限；`FROZEN_OVER_LIMIT` 行已在第 1 步删除、表同步刷新）：按实测结构分析拆出 **9 个单元**——`hooks/useNotesSealedFilter.ts`（50 行，SE 封存 #树洞 显隐开关 + 精确匹配过滤纯函数，refreshToken 由页面注入）· `hooks/useNotesPageEditing.ts`（81 行，编辑态 + Ctrl+E/ESC 单一 window 监听 + 编辑器命令式出口，selectedRef 由页面持有并注入）· `hooks/useNotesBatchActions.ts`（94 行，单删/批量删 + 空组清理留痕 toast 独占实例）· `hooks/useNotesListData.ts`（144 行，列表/过滤态/组与标签色/refreshToken/seqRef/handleNoteChanged 单一真源 + useDbRefresh 常驻订阅）· `hooks/useNotesDeepLink.ts`（106 行，focusNoteId ∪ focusNoteSearch 合并单 effect + focusGroupId 仅过滤不展开）· `components/notes/NotesOverlays.tsx`（69 行，AI 对话框/模型卡槽/图片预览/清理 toast 的条件门控与 key 语义）· `components/notes/NotesReadingColumn.tsx`（150 行，右栏 flex:1 宿主 + editor/auxPanels/headerExtra 三插槽）· `components/notes/NotesListColumn.tsx`（130 行，中栏三形态原位切换 + 折叠态也渲染的 ColumnResizer，顶层 fragment）· `components/notes/NotesGroupsColumn.tsx`（81 行，左栏组侧栏 + 手柄；**第 9 步 = S8 后实测 305 > 300 的兜底**，取自结构分析 §3.2 的 S9 备选，非计划书首列的 8 文件）。主文件回归 **295 行**（纯编排层：页面态 + 三栏/覆盖层装配 + 页面级动作），9 个新文件均 ≤300 行无需登记，本表条目整条移除。`NotesPage` 的 7 个 props 契约零变化，唯一生产消费者 `App.tsx` 未改，`NotesPage.test.tsx`（2 例：编辑完成刷新 / ESC flush 顺序）**零修改通过**。分步实测：602 →（封存）588 →（编辑态）556 →（删除）506 →（列表数据）416 →（深链）371 →（覆盖层）367 →（右栏）318 →（中栏）305 →（左栏）295。**等价证据**：全量 `npx vitest run` 104 文件 / 811 用例全绿（拆前基线 103/809；文件数增量来自并行批次的他人新增，本任务未改任何测试）；`npx tsc --noEmit` exit 0；机械不变式探针 `probe-verbatim-strings.mjs`（13 段用户可见文案 + 10 个 IPC 命令名，全树计数）在每步与收尾均一致。**明确保留的既有缺陷**（本批只搬不改）：J1-3 大纲折叠死局 / J1-6 大纲宽度假可调 / J1-8 三处硬编码 56px。**未做**：`docs/tech-debt/review-2026-09-11.md` 的 TD-2026-09-09-D 状态回写（该目录未入库，留待 0-C2 收口统一处理）。
