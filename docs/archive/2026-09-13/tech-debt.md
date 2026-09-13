# 技术债清单（权威：2026-09-13）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-09-13（执行日归档）——自 **2026-09-09** 权威清单滚动核验（**26 行**逐条核对：**已偿 5 笔**转 `closed`（各注偿还提交与实测行数）· **部分兑现 1 笔** · 其余继承 carried/open 原状）+ **新增 `open` 32 笔（TD-2026-09-11-A~AG，`H` 已部分兑现）**，来源 = 2026-09-11 新增代码独立审查报告（[review-2026-09-11.md](./review-2026-09-11.md) §5 的建议登记清单）。
> 🔴 **09-10 / 09-11 / 09-12 为空白日不建夹**（[../README.md:53](../README.md)），其间的债务一律并入本夹（归档机制：「最新归档必有权威清单」）。

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） | 有意 | P2 | 2026-08-18 | carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088）——lib.rs 仅 mod 声明，接线条件未发生 | 有意 | P2 | 2026-08-19 | carried |
| TD-2026-08-24-A | lib.rs 超 600 硬限——实测 872（v0.19.3 模块/命令再 +5）；generate_handler 单点展开不可拆，拆分计划维持顺延。**2026-09-13 closed（c409a956 拆注册清单至 app_commands.rs：`countLines(lib.rs)`=572 ≤600 / `app_commands.rs`=478）** | 有意 | P1 | 2026-08-24 | closed（c409a956） |
| TD-2026-08-30-A | ClassroomPage 超 600 硬限——实测 745；拆分计划（LiveCaptureCard）未启动。**2026-09-13 closed（拆件链 b8ff1efa/e4923341/0d20ad71/211a1cad 六步：`countLines(ClassroomPage.tsx)`=287）** | 有意 | P1 | 2026-08-30 | closed（b8ff1efa~211a1cad） |
| TD-2026-08-30-B | note_filter 预存失败 2 笔——已 closed（3f6413e），哈希不变 | 预存 | P2 | 2026-08-30 | closed（3f6413e） |
| TD-2026-08-31-A | BrowserChrome 对 contenteditable 右键无应用内文本菜单——**2026-09-09 批 8 状态更新：closed（部分兑现）**——CM（contenteditable）编辑态选区右键菜单与正文阅读态选区右键菜单随 REQ-317（v0.20.13）落地；残留面=「非 CM 的 contenteditable + 无选区时右键」仍静默（应用内唯一 contenteditable 即 CM，已覆盖；阅读态无选区右键=有意维持基线），若未来出现其他 contenteditable 编辑面需另立债 | 有意 | P3 | 2026-08-31 | closed（部分兑现，REQ-317 v0.20.13） |
| TD-2026-08-31-B | window.prompt/confirm/alert 替换为应用内对话框——原记「余 13 处未决」。**2026-09-13 实测收窄：`window.confirm(` 在 `app/src/**` 归零（批 4 `1a7762bd` 换 ConfirmDialog）；余 2 处= `ChatPage.tsx:264` `window.prompt` ×1 + `StructureModelSetting.tsx:108` `alert` ×1** | 有意 | P2 | 2026-08-31 | carried（实测余 2 处） |
| TD-2026-08-31-C | App.css 从未被引入（死样式）——引入改全局暗色观感，需单独裁决。**2026-09-13 closed（76d2066a 删死文件 App.css；实测 `app/src/App.css` 不存在）** | 环境变化 | P3 | 2026-08-31 | closed（76d2066a） |
| TD-2026-09-05-A | 挂体系空体系「去建体系」引导按钮未交付——已 closed（6b8f365），哈希不变 | 有意 | P3 | 2026-09-05 | closed（6b8f365） |
| TD-2026-09-05-B | 模型 disciplines 入参三形态契约漂移——已 closed（14e3988），哈希不变。⚠️ **2026-09-13 加注：TD-2026-09-11-AA 判定本条「过早关闭」——出参侧（`types.rs` ↔ `knowledge.ts`）当时仍反着；本行状态不改写（只认最新归档的权威行 = 09-11-AA），仅留交叉引用** | 无意 | P3 | 2026-09-05 | closed（14e3988） |
| TD-2026-09-06-A | 有效轴窗边裁剪：跨采纳窗段覆盖 ≥60% 整段让位致窗外 ≤40% 文本在产物缺位（asr_pass2 二值取舍，clip 未实现） | 无意 | P2 | 2026-09-06 | open |
| TD-2026-09-06-B | proofread_run async 内同步分块请求阻塞 worker（长会话）；重复 run 未清上次 pending | 无意 | P2 | 2026-09-06 | open |
| TD-2026-09-06-C | SOP 保鲜 diff 仅比首步（2..N 步改动不提示）；start 时段漂移 stale 提示未实现 | 无意 | P3 | 2026-09-06 | open |
| TD-2026-09-06-D | SOP 执行器 READ-DO/CONFIRM 渲染无实质差异；证据图片三入口上传流未接（现为相对路径文本输入） | 有意 | P3 | 2026-09-06 | open |
| TD-2026-09-06-E | SE 封存过滤仅 NotesPage 默认列表（复习面/检索/组视图未覆盖；tag 子串匹配含“树洞XX”） | 无意 | P3 | 2026-09-06 | open |
| TD-2026-09-06-F | kind=web 预览后端未统一路由（preview_session_note 走转写链）；渲染型整页快照与截图兜底未实现；扩展商店发布未做 | 有意 | P3 | 2026-09-06 | open |
| TD-2026-09-06-G | web_inbox token 非 CSPRNG 且 ACL 注释漂移；行数豁免登记批量过期（commands_proofread/commands_web_inbox/commands_session_note 及前端 ActionCenterOverlay/SessionDetailPanel）。**2026-09-13 部分兑现**：后半句已由批 0-C1（f7869fd2 重建行数豁免登记为快照表 + 7bd8300e 钉死测量口径）兑现——`line-limits --full` 实测 **>600 硬限 0 · 301–600 档 121 · 登记条目 121（数值一致）**；前半句未偿（`commands_web_inbox.rs:63 load_or_make_token` 仍以 `now_nanos ^ pid` 为种子） | 有意 | P3 | 2026-09-06 | open（部分兑现） |
| TD-2026-09-06-H | 完成史 reverted 事件无来源；GoalsPage 回顾流未接 completion_history；set_task_disposition/练习暂停归档 UI/工具栏「生成 SOP」选区入口未接线 | 有意 | P3 | 2026-09-06 | open |
| TD-2026-09-09-A | NoteListView 超 600 硬限——实测 646（v0.20.12 批 7 接线后；HEAD 基线 633 即越线，批 7 登记值 591 过期）。**2026-09-13 closed（拆件链 d548522a/e5684e88/3fee45e7/8420d3b0/64fd477c/8eb98060/e918a96c/ed6153ae 九步：`countLines(NoteListView.tsx)`=242）** | 有意 | P1 | 2026-09-09 | closed（d548522a~ed6153ae） |
| TD-2026-09-09-B | 「以对话处理」选区动作未接线（批 8 REQ-317 授权退路）：AiConversationDock 会话视图 v1 只读、无面板内发送通道（REQ-274 同源承诺：对话在 ChatPage 继续，防双实例流控冲突）；向 ChatPage composer 注入种子草稿需 App→ChatPage→NotesPage 三层 >3 组件深改——批 8 判为超面改动，菜单不显此项不伪实现；候选最小面=ChatPage 增 draft 种子 prop（App 持有种子态经跨页回调注入，不自动发送仅预填） | 有意 | P3 | 2026-09-09 | open |
| TD-2026-09-09-C | 「加入行动」阅读态未接线（批 8 REQ-317 V1 仅编辑态）：阅读态渲染 DOM ↔ 源码行映射缺失——选中文本定位到 Markdown 源码行并插入任务行需建立映射层（阅读容器内 Range → 行号 → 源正文偏移），V1 隐藏菜单项并注释；候选=复刻 NoteMarkdown 既有任务行索引（taskLineIndices 渲染序）思路的选区行映射 | 有意 | P3 | 2026-09-09 | open |
| TD-2026-09-09-D | SessionListPanel 604 / NotesPage 602 越 600 硬限（审查修复轮 3/4 净增；TD-2026-09-09-A 同族）——拆分计划已登豁免表（SessionSelectionToolbar / useNotesPageEditing）。**2026-09-13 closed（拆件链 SessionListPanel 2d0cddad/8773a665/f012968f/96dc41cf/2e339a0c/dd4dabf6 + NotesPage 88b45e8c/c1840067/6ef2060a/b3adbe66/2f11a140/9c3cabef/8ff7d73f/114e4d41/61a4022b：实测 `SessionListPanel.tsx`=298 / `NotesPage.tsx`=300）** | 无意 | P1 | 2026-09-09 | closed（拆件链） |
| TD-2026-09-09-E | routeReason「已改判」行标签对"用户接管组"语义不贴切（改名/着色/置顶/手排即豁免清理；置位粘性已实现）——标签文案待用户裁决 | 有意 | P3 | 2026-09-09 | open |
| TD-2026-09-09-F | SessionListRow titleEcho 桥接疑失效：setEcho 后 effect 在服务端 prop 刷新前清除回声（平铺短暂闪回/分组快照可能长期旧标题）——待复现走查后修 | 无意 | P2 | 2026-09-09 | open |
| TD-2026-09-09-G | 审查批外同族遗留：db_sessions add_segments_batch/replace_segments 手写事务未统一 transaction()；diff_markdown_sections/note_versions_diff 仍同步主线程且无字符护栏（与已修 diff_markdown_ops 同族） | 无意 | P3 | 2026-09-09 | open |
| TD-2026-09-09-H | HTML5 ⛶ 全屏视频新建独立顶层 HWND 被判 Foreign → 误自动暂停（审查 P2-5 待真机）：候选降级=前台与目标 pid 相等按 Target/中性——真机标定前勿实现 | 无意 | P2 | 2026-09-09 | open |
| TD-2026-09-11-A | 音频块时间戳取「块尾」而屏幕帧取「捕获瞬间」——同一 epoch 下两种定义，音频侧系统性偏移 200ms+，进入融合边界判定与 DTW 漂移校正阈值量级 | 无意 | P2 | 2026-09-11 | open |
| TD-2026-09-11-B | 检索路径性能：单连接全局锁下 `search_ocr_blocks`/`search_notes`/`list_sessions` 走 LIKE '%kw%' 全表扫；`search_session_segments` 为 O(会话数×段数) 内存全扫且不 LIMIT；`session_segments`/`session_ocr_blocks` 无文本索引（kb_fts 先例已在库内未复用） | 无意 | P1 | 2026-09-11 | open |
| TD-2026-09-11-C | `db_sessions.rs:86-97` 搜索 SQL 条件未加括号（OR 与后续 AND 会短路）——当前单条件未爆，属结构性陷阱 | 无意 | P3 | 2026-09-11 | open |
| TD-2026-09-11-D | `fusion.rs` 融合为 O(ASR 段×字幕段) 且每重叠对做 Levenshtein；`subs` 已排序但内层每次从下标 0 线性扫，未用 partition_point | 无意 | P2 | 2026-09-11 | open |
| TD-2026-09-11-E | `review_card` 调度推进/复习日志/埋点三次独立写无事务，且埋点用 `let _ =` 吞错——周契约与目标进度读数同时少算且用户无感 | 无意 | P2 | 2026-09-11 | open |
| TD-2026-09-11-F | 锁中毒恢复策略未落地：非 db.rs 范围 59 处 `.lock().expect`（13 文件），其中实时链路+暂停状态机 29 处；与 `db.rs:52-77` 已确立政策冲突（TD-2026-08-21-C 登记范围本身过期） | 腐化 | P2 | 2026-09-11 | open |
| TD-2026-09-11-G | 47 条注册命令零调用点（本次独立复现，与前端重设计规格 §9 逐条一致）——其中 12 条对应已声称交付的功能（`update_note_tags`/`set_tag_color`/`reset_tag_color`/`update_knowledge_system`/`get_decision`/`update_fragment_group`(REQ-201 标「已实施」)/`refine_session`/`analyze_session_command`/`delete_session_images_all`/`finish_session`/`kb_search`/`video_profile_for_spec`）；**要求**：同步修正 `requirements-pool.md` 中 REQ-201 的状态标注。**2026-09-13 加注：批 7（b72d4709 等）已为其中 6 条补上展示面与生产调用点，条目未关（余量未逐条复核）** | 腐化 | P1 | 2026-09-11 | open |
| TD-2026-09-11-H | 行数治理实际缺口：>600 硬限 **15 个**（文档称 4 个，Rust 10/前端 5；`lib.rs` 1022 / `types.rs` 1017 / `live_session_frame.rs` 974 未在拆件清单内）；301-600 行**46 个从未登记**；豁免表 **12 组重复条目 + 1 条幽灵（ActionCenterOverlay.tsx 已不存在）+ 77 条数值偏差≥15 行**；v0.22 批 0 门槛 1 按现计划不可能达成。**2026-09-13 closed（部分兑现，实测）**：批 0-C1/C2/C3 拆件 + 表重建（f7869fd2 / 7bd8300e）后 `line-limits --full` = **>600 硬限 0 · 301–600 档 121 · 登记条目 121 · 数值一致**（0 个超硬限、登记面 121=121 无漏登）；`v0.22` 批 0 范围已按实测改写。**残留**=工件级棘轮之外的治理惯性（无自动重建入口） | 腐化 | P1 | 2026-09-11 | closed（部分兑现，0/121/121） |
| TD-2026-09-11-I | 版本号三元组分叉：`app/package.json`/`tauri.conf.json`/`Cargo.toml` 均 0.13.9，git tag 已到 v0.42.0，CHANGELOG 止于 0.15.0——`scripts/version-bump.mjs:38-41` 从不写 tauri.conf.json 与 Cargo.toml | 环境变化 | P2 | 2026-09-11 | open |
| TD-2026-09-11-J | AGENTS.md §8 阶段声明停留在 v0.1.0（称 WASAPI/屏幕捕获/闪卡"不在第一阶段"、OCR"接口已 stub"），§0 工作区路径与实测不符——最高执行指令与已交付范围冲突 | 腐化 | P2 | 2026-09-11 | open |
| TD-2026-09-11-K | 前端 738 条测试从未进入 CI（`pr-check.yml` 的 app-frontend job 仅 tsc+build；`release.yml` 两 job 仅 cargo test）；`scripts/validate-all.mjs` 全部步骤指向已不存在的 `client/`、`server/ai-gateway`、`server/sync-service` | 腐化 | P1 | 2026-09-11 | open |
| TD-2026-09-11-L | 发布链 `cargo test --skip` 的 3 条忽略项对应失败已修复（TD-2026-08-30-B closed），skip 成为空操作；忽略机制无校验，存在"已知失败清单只增不减"漂移 | 腐化 | P3 | 2026-09-11 | open |
| TD-2026-09-11-M | 实时链路 6 处 `let _ = db.add_segment/add_ocr_block/add_event` 静默丢弃转写与 OCR（无日志无上报），与 ADR-004「崩溃不丢已识别内容」承诺冲突 | 腐化 | P0 | 2026-09-11 | open |
| TD-2026-09-11-N | `knowledge_links` 多态引用清理只覆盖 note/group/flashcard 三类，删碎片/删目标（fragment/goal）产生永久悬空引用（无 FK、不可自愈），污染反查/图谱边/目标体系视图 | 无意 | P1 | 2026-09-11 | open |
| TD-2026-09-11-O | 事务边界缺口：`create_note`/`update_note`/`create_session`/`create_fragment` 多语句写全程 autocommit（失败时"报错但已落库"）；`db_ai_chat.rs` 全模块无事务入口 | 无意 | P2 | 2026-09-11 | open |
| TD-2026-09-11-P | `execute_settlement` 一次结算 = N 次独立提交且广播早于落库 → 中途失败留下"已归档未结算"，结算周期判据/北极星组成③/里程碑钩子全部失真 | 无意 | P2 | 2026-09-11 | open |
| TD-2026-09-11-Q | 索引缺口 13 项（含 6 处 FK 级联无索引导致每次删父行全表扫）；`knowledge_links` 逐概念相关子查询使体系页/目标页随规模平方退化 | 腐化 | P2 | 2026-09-11 | open |
| TD-2026-09-11-R | 迁移机制无 `user_version`/无 down/无一致性断言；30 处 `ensure_column` 使新库也走 ALTER 路径，`notes.uid` 列序在新旧库不同（`SELECT *` 地雷）；迁移测试用 `temp_dir`+pid 命名 | 无意 | P3 | 2026-09-11 | open |
| TD-2026-09-11-S | 持锁做耗时操作：`kb_search_semantic.rs:58` 在 `with_conn` 内做 ONNX 推理（与 `kb_embed_store.rs:40-42` 自述口径矛盾）；`db_ocr_search.rs:113-115` 锁内做 ≤100 次文件 stat；`graph_snapshot` 4 次取锁=4 个快照（图谱悬挂边） | 无意 | P2 | 2026-09-11 | open |
| TD-2026-09-11-T | `backup_create` 直接 `fs::read` 活跃 SQLite 文件入 zip（无 WAL/busy_timeout/`VACUUM INTO`/backup API）——采集期备份可能得撕裂镜像 | 无意 | P2 | 2026-09-11 | open |
| TD-2026-09-11-U | 路径边界失效：`export_write_todotxt_file`（`commands_after.rs:22-30`，无 `State` 故结构上无法校验归属）与 `web_snapshot_export`（`commands_web.rs:219-265`）接受任意绝对路径写 `.txt`/`.html`，违反 AGENTS.md §4「文件系统访问限定应用数据目录」；同仓已有 `canonicalize+starts_with` 范式（`commands_images.rs:112-142`） | 无意 | P1 | 2026-09-11 | open |
| TD-2026-09-11-V | 供应链完整性：CI 下载 sherpa-onnx/onnxruntime 无哈希（`release.yml:111-129`）、运行期模型仅比 `Content-Length`（`model_downloader.rs:277` / `structure_models.rs:334` / `speaker_download.rs:210` / `commands_kb.rs:120`）、ffmpeg 无哈希下载即执行（`download-ffmpeg.ps1:19-48` → `ffmpeg.rs:180`）；CI action 全部未固定 SHA 且发布 job 持 SSH/AK/`contents:write` | 无意 | P2 | 2026-09-11 | open |
| TD-2026-09-11-W | **AI 授权文案与能力不一致（触产品红线）**：全局授权卡无条件声明「音视频与图像永不出本机」（`AiServicePanel.tsx:235-236`、`ai_settings.rs:119`），而 vision 精修会经 `ai_refine_task.rs:306/375-404` + `ai_note_refine.rs:166` 上传会话屏卡，且 `commands_ai_refine.rs:149` 任务级覆写可越过全局关；局部弹层已条件化（`RefineLaunchDialog.tsx:180-188`）全局卡未条件化 | 有意 | P0 | 2026-09-11 | open |
| TD-2026-09-11-X | SSRF 边界不一致：`import_note_image_url`（`commands_note_images.rs:140-184`）未调用同仓既有的 `is_blocked_host`（`web_capture.rs:103-129`，已在 `commands_web.rs:62`/`commands_web_inbox.rs:290` 使用）→ 内网/回环/169.254 盲 SSRF + `Content-Type` 回显指纹 + 内网图可经 vision 上云；且 URL 采集/快照的 host 校验只覆盖首跳，被 `.redirects(5)`/`.redirects(4)` 绕过 | 无意 | P1 | 2026-09-11 | open |
| TD-2026-09-11-Y | 需求口径失真（三族）：(a) 声称已交付但 UI 通道缺失——REQ-295 迁出通道仅 1/3 可用、REQ-079 FTS5 未实装、v0.11.2 自测/指标两命令零调用、REQ-205/211/212 审计无 UI、`set_task_disposition` 未注册 IPC；(b) **PRD Must 未实现且未登记为后续**——「导出 JSON/Markdown」（`prd.md:81/142`）与「采集路径 full_record」（`prd.md:99`）全仓零实现；(c) 需求池 **12+ 条状态低报**（REQ-001~012/021/153/202~210/224~228/245~247/251~257 仍标待评估/已排期/已立项）＋ `docs/versions/README.md` 与各版本文档 **8 处互相矛盾** | 腐化 | P1 | 2026-09-11 | open |
| TD-2026-09-11-Z | 验收口径缺口：「到期提醒」（`prd.md:80` Must 验收 + REQ-019）已被 v0.20.10 主动移除（`GroupSidebar.tsx:13/52`、`ReviewPage.tsx:6`）但 PRD/REQ 文案未同步；全仓 **86 处「真机验收待执行」**、REQ-146 总清未执行 → 所有"已交付"实质为**代码自验证交付** | 腐化 | P2 | 2026-09-11 | open |
| TD-2026-09-11-AA | **前端确定性崩溃**：`KnowledgeModel.disciplines` 后端给 JSON 字符串（`types.rs:768`）前端当数组（`knowledge.ts:100`），`KnowledgePage.tsx:368 .join()` 与 `canvasElements.ts:236 .map()` 必抛 TypeError → `AppErrorBoundary` 接住 → 整页错误卡片；**单测把该字段 mock 成数组（`KnowledgeLinkSection.test.tsx:26`/`NoteLinkToSystem.test.tsx:30`）掩盖了崩溃**。原 `TD-2026-09-05-B`（已 closed 14e3988）**过早关闭**——出参侧仍反着 | 无意 | P0 | 2026-09-11 | open |
| TD-2026-09-11-AB | **前端契约命名漂移**：`SegmentHit`（Rust `commands_session.rs:357` camelCase vs TS `session.ts:270-277` snake_case）→ 段搜索命中 4 字段全 `undefined`（React 重复 key、点击跳 `undefined`、标题空白、`fmtMs` 显示 `NaN:NaN`），REQ-079「一键跳详情」实际不可用；`AiReviewMeta.quota_hit`（`commands_ai.rs:127` vs `session.ts:285`）→「今日配额耗尽」提示永不显示，**降级不可见**；`KnowledgeDecision.decidedAt`（后端秒 `db_knowledge_decisions.rs:31` vs TS 注释毫秒 `knowledge.ts:465`）→ 决策日志显示 1970 年 | 无意 | P0 | 2026-09-11 | open |
| TD-2026-09-11-AC | 前端渲染性能：`React.memo` **0** + 9 页常驻（`App.tsx:312-419`）+ capture context 每 5s 换新 state（`liveCaptureState.ts:116-133 snapshot` 两出口都 `{...state}`，与同文件 `:134 watchdog-tick` 保持身份的纪律相反）→ **录制期间每 5 秒全 9 页重渲染**；另 97 处 `sort/filter/reduce` 在渲染体（最重：`RefineWorkbench.tsx:296-307` 整篇 markdown×3 栏重建、`TaskThreadCard.tsx:55-63` 逐 token O(n²)）；无虚拟化，`SessionDetailPanel.tsx:469` 渲染无 LIMIT 的全量段 | 无意 | P2 | 2026-09-11 | open |
| TD-2026-09-11-AD | 前端错误通道缺失：**29/451（6.4%）`invoke` 无任何错误处理**（最危险：`useNoteAutosave.ts:89-95 flushLatest` → **自动保存失败无声丢失**、`GoalDetail.tsx:113/124/359`）；`AppErrorBoundary` 只接渲染异常**不接 promise rejection**；4 套自绘 toast + 80 文件内联错误行 + `window.confirm` 8 处与 plugin `confirm` 16 处并存 + `alert` 1 处（`StructureModelSetting.tsx:107`）；50 处静默 `.catch`。**2026-09-13 实测收窄**：`window.confirm` 已归零（批 4），余 `window.prompt` ×1（`ChatPage.tsx:264`）+ `alert` ×1（`StructureModelSetting.tsx:108`，行号与原记 107 相差 1） | 腐化 | P1 | 2026-09-11 | open |
| TD-2026-09-11-AE | 前端可及性系统性缺失：38 个手写覆盖层 **0** `role="dialog"`、**0** 焦点陷阱、**0** body 滚动锁、全库 `aria-*` 仅 **1** 处（`ColumnResizer.tsx:62`）；7 个全屏模态既无 Esc 也无背板点击（含主路径 `InterviewDialog.tsx:149`）；`NoteAiDialog` 打开时 Esc 会退出背后编辑器（`NotesPage.tsx:209-232` 无覆盖层门控）；z-index 17 值/58 处且常驻 `AiConversationDock.tsx:242 z=900` 压住全部 z=50/60 弹窗。**2026-09-13 加注：批 4（Modal/ConfirmDialog 原语）与批 3（z-index 六档标尺 `61c777be`）已兑现其中一部分，条目未关（余量未逐条复核）** | 无意 | P2 | 2026-09-11 | open |
| TD-2026-09-11-AF | 前端契约面空心化：**125 个类型导出无人 import**（666 导出中 143 死导出，仅 18 个是运行时代码）；漏网形状含 `GoalPlanProposal`/`PlanValidationView`/`ArtifactBlock`/`SessionArtifact`/9 个 `New*`；`types.ts` barrel 未导出 knowledge/goals；**类型逃逸主渠道是 322 个 `invoke<T>` 无校验断言**（`any`/`as any`/`@ts-ignore` 全为 0）——四个阻断级漂移正从此进入；另 8 处缺字段（含 `SessionSegment` 缺 volume/speech_rate/pause_ms/speaker、`SessionOcrBlock` 缺 screen_id 导致详情页被迫用时间戳做键） | 腐化 | P2 | 2026-09-11 | open |
| TD-2026-09-11-AG | 前端死代码/死文案：`components/structuredBlocks.ts` **整模块无生产调用方**（唯一 importer 是自身测试）→ `App.css:119 .ed-low-confidence` 这个 UI 特性**从不渲染**、`aiPlaceholderLabel()` 占位文案永不触达；18 个死运行时导出（`orderedBlockFrames`/`systemKindLabel`/`relativeLuminance`/`parseNoteTags` 等）；3 处死文案含 `RefineWorkbench.tsx:374-380` **`onClick` 是纯注释**的按钮。**2026-09-13 实测收窄**：`structuredBlocks.ts` 整模块已删除（99602da4 删死文案 + 5cda5bdb 删死导出；实测文件不存在）、`App.css` 已删除（76d2066a）⇒ 该两条子项已兑现；余=「18 个死运行时导出」这一**汇总结论本身已被证伪**（批 1 计划 §:1179 抽查发现 `relativeLuminance` 活的）与 3 处死文案，未逐条复核 | 腐化 | P3 | 2026-09-11 | open（子项部分兑现） |

**统计口径（权威，与 [./README.md](./README.md) 及 [../README.md](../README.md) 索引行一致）**：**closed 10 笔**（含部分兑现 1 笔）· **carried 3 笔** · **open 46 笔** —— 共 **59 行**。

## 2026-09-13 节（U3 归档 + 滚动核验，执行日）

- **滚动核验（SOP 第 1 步）**：自 **2026-09-09** 权威清单（26 行）逐条核对——
  - **已偿转 closed 5 笔**：`TD-2026-08-24-A`（lib.rs 872→**572**，c409a956）· `TD-2026-08-30-A`（ClassroomPage 745→**287**，拆件链 b8ff1efa~211a1cad）· `TD-2026-08-31-C`（App.css 已删除，76d2066a）· `TD-2026-09-09-A`（NoteListView 646→**242**，拆件链 d548522a~ed6153ae）· `TD-2026-09-09-D`（SessionListPanel 604→**298** / NotesPage 602→**300**，拆件链 2d0cddad~dd4dabf6 与 88b45e8c~61a4022b）
  - **部分兑现 1 笔**：`TD-2026-09-06-G` 的后半句（行数豁免登记批量过期）由批 0-C1 兑现；前半句（web_inbox token 非 CSPRNG）未偿 ⇒ 状态仍 `open` 并加注
  - **其余 20 行**逐条核对**无新偿还条件发生**（carried 3 笔：TD-040 `tauri.conf.json` `ffmpeg` 0 命中 · TD-2026-08-19-D `lib.rs` 仍仅 `mod image_stream_store;` · TD-2026-08-31-B 余 2 处；open 14 笔：主体符号/主题仍在，无偿还动作）
  - **未偿项一律继承**（不因归档日无偿还而删行）——滚动规则「无新增债务的归档日，仍须继承昨日清单」
- **今日新债务识别（SOP 第 2 步）**：`git log --since=2026-09-10`（**566 提交**，含 09-13 的 205 提交）的**新增行**中 `TODO|FIXME|HACK` 命中 **16 行**，逐行判读：**15 行是文档/计划自身对本 SOP 与「占位符扫描」的引述**（非代码标记），**唯一代码面命中**是 `ProfileDetector.tsx:194` 的 `TODO(后端)`，它已在批 7 收口时连同文案更正一并删除（规格 §:367559ff 的 V7 判据）⇒ **本步 0 笔新增**。
  ⇒ 本夹的 **32 笔新增 `open`** 全部来自 **SOP 第 2 步的「妥协方案」面**：2026-09-11 新增代码独立审查报告（[review-2026-09-11.md](./review-2026-09-11.md) §5）给出的 `TD-2026-09-11-A~AG` 建议清单（**33 条**，其中 `H` 经本日实测判 closed（部分兑现）、`AD`/`AE`/`AG` 加注部分兑现收窄）。
- **筛选今日已实施文档（SOP 第 3 步）**：本夹移入 `docs/tech-debt/review-2026-09-11.md`（**191,980 B**，审查报告属「可归档」类，先例 `../2026-09-06/asr-v020-review.md`）。**它此前从未入库（`git ls-files docs/tech-debt` = 0 命中）⇒ 无 git 历史可保留，`git mv` 对它不适用**；实施形态 = `git add` 到归档路径 + 删除原未跟踪目录。**内容零改动**（sha256 归档前后一致，见 [./README.md](./README.md)）。
- **验证记录**：`node scripts/docs-check.mjs` **exit 0**（读数变化与归因见 [./README.md](./README.md)）· `node scripts/line-limits.mjs --full` **exit 0**（>600 硬限 0 · 301–600 档 121 · 登记条目 121）· `node scripts/check-command-registry.mjs` **311/311/0**（本夹零代码改动）。
- **本夹零生产代码改动**：纯文档归档（新夹 3 件 + `../README.md` 索引 1 处）；**既有 19 个日期夹零 hunk**（只读约束）。

## 关联

- 归档快照：[2026-09-13 README](./README.md) · 归档索引：[archive README](../README.md)（2026-09-13 行）
- 上一权威清单：[2026-09-09 tech-debt.md](../2026-09-09/tech-debt.md)（仅历史追溯）· 机制的权威说明：[归档机制](../README.md)
- 新增债务的来源：[review-2026-09-11.md](./review-2026-09-11.md)（本夹快照；批 7 曾授权只读它取 H7 原文）
- 版本与需求：[v0.22 版本文档](../../versions/v0.22.md)（前端重设计系列批 0~8 交付记录）· [需求池](../../product/requirements-pool.md)
