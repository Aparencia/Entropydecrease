# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [SemVer](https://semver.org/lang/zh-CN/)。
各版本的深度版本文档在 [docs/versions/](docs/versions/)。

## [Unreleased] - 2026-08-23

### v0.12.7 会话内部 ID 不外显（2026-08-23 交付，详见 [docs/versions/v0.12.7.md](docs/versions/v0.12.7.md)）

- **会话内部 id 不再外显（用户要求）**：实时捕获开始/停止状态、课堂助手实时捕获提示、融合完成直达卡片、图文采集开始/采集中/已保存提示、视频导入完成提示、AI 任务中心 refine 任务行——全部去掉「会话 #N」；仅保留会话列表显示序号（display_no，与内部 id 解耦）
- 验证：`tsc --noEmit` 零错误；vitest 全绿

### v0.12.6 采集浮窗显隐链路修复 + 锁定自解锁（2026-08-23 交付，详见 [docs/versions/v0.12.6.md](docs/versions/v0.12.6.md)）

- **P0 浮窗启动自动显示（用户报告）**：setup 预创建浮窗误传 `precreated=false` → `visible(true)` + 抢焦点——浮窗应用启动即出现。修复：隐藏预创建（失败仍回落懒创建），浮窗只在用户选择（按钮/快捷键）时出现
- **浮窗出现 → 主窗隐藏**：用户要求"出现后主页面隐藏"；打开浮窗后主窗隐藏，收起/停止采集/回主窗一律回显（show+unminimize+focus——绝不把用户留在无可见窗口）
- **锁定自解锁（ADR-025）**：点击穿透是窗口级能力（锁定态浮窗收不到鼠标事件），tauri 2.11.5 无 `set_cursor_hit_test`（分区点击穿透缺失）——引入 `tauri-plugin-global-shortcut`：Ctrl+Shift+F **全局快捷键**（浮窗打开期间注册/收起注销，任意焦点可解锁）；三态语义收拢到 Rust `float_toggle_core`（关→开 / 开未锁→收起 / 开已锁→解锁）+ `float_toggle` 命令，主窗按钮/快捷键共用同一出口（防主窗键+全局键双触发双翻转）；锁定态浮窗显示"🔒 已锁定"提示
- **浮窗两侧透明区 + 最右滚条**：无全局 CSS 下 body 默认 8px margin + 100vh 溢出 → 左右透明条 + 滚动条——浮窗组件注入窗口级重置（margin 0 / overflow hidden / 100%）
- 验证：Rust 新增 `float_next_action_machine` 单测（三态状态机）；`cargo check` 通过；`tsc --noEmit` 零错误；vitest 全绿

### v0.12.5 AI 精修线路修复：工作台采纳前右侧恒空 + 精修流程优化（2026-08-23 交付，详见 [docs/versions/v0.12.5.md](docs/versions/v0.12.5.md)）

- **P0 采纳前工作台右侧恒空（用户报告）**：精修成功 → 「打开工作台」→ 左侧规则版有内容、右侧精修版空（"尚未精修"占位）。根因：`refine_workbench` 的精修版只按**已落库笔记**取（`find_note_by_session`），采纳前笔记不存在 → `None`；前端持有的 `AiRefineResult` 未进入数据源；且任务成功事件先于 DB 落库（竞态）。修复：`refine_workbench` 新增可选 `refine_result` 参数（调用方内存结果，消除竞态）→ 新增 `Db::find_latest_unadopted_refine`（`ai_tasks` 未采纳成功任务按会话取最新——重启后仍可回显）→ 已落库笔记最新版本，三级数据源；前端 `RefineWorkbench` 携带 `taskResult` 时回传 `refineResult`；采纳前成本不虚假回填
- **线路优化：完成即自动打开工作台**：任务 Succeeded → 直开工作台（工作台内含 采纳落库/放弃/重新生成 三出口，消除"打开工作台/放弃"中间步）；关闭后卡片保留重开按钮
- **P1 采纳落库回传真实 taskId**：原来恒传 `null` → 任务不标记 adopted、成本不回填 → 重启后任务中心仍可恢复该结果并再次采纳（**重复建笔记风险**）；现回传并服务端标记 + 成本回填（与任务中心采纳路径收敛）
- **P1 重新生成接入父级管线**：工作台 `onRegenerate` 复用卡片 start（running 态 + 轮询/事件 + 卡住检测）；原实现直连 `ai_refine_start` → 卡片停留旧结果 done 态、新任务无进度（状态残留）
- 验证：Rust 新增 2 项单测（find_latest_unadopted_refine_by_session / stats_from 统计口径）全量通过（既有基线失败项与本版无关）；`tsc --noEmit` 零错误 / vitest 全绿（新增 `RefineWorkbench.test.tsx` 4 项：refineResult 契约 / null 兜底 / 采纳 taskId / null 占位不崩）

### v0.12.4 视频会话画面要点纯图落地 + 笔记预览时间戳锚点 chip 化（2026-08-23 交付，详见 [docs/versions/v0.12.4.md](docs/versions/v0.12.4.md)）

- **P0 视频画面要点残留 OCR 文字（用户 0.12.1 复测）**：v0.12.0 M5（ADR-023）帧侧只删了全帧 OCR 兜底与明文路径，残留两条仍产 OCR 文字的分支——直播路径 `!is_subtitle` 布局分析后仍调 `region_ocr_blocks`（`region=full` 入库），导入路径关键帧不归档图片 + 中区域 OCR。修复：直播 `else` 纯关键帧归档（零 OCR）；导入关键帧无条件纯图归档（`rgb_to_bgra`），仅字幕 OCR 门控保留，删中区域 OCR；展示层 `build_view_screens` 按 kind 分派（photo 保留 ADR-021 OCR 文本屏不变，video 走 `build_keyframe_screens` 纯图屏）；`get_session_detail`/`preview_session_note`/`manual_capture_inner` 三处接入
- **P0 笔记预览原始时间戳锚点外露**：`[⏱ 00:00]([[ts:233]])` 在预览（未精修）阶段仍原文显示——v0.11.5 chip 只落了正式渲染（`NoteMarkdown`），漏了两个轻量字符串渲染器（`NotePreviewView.renderMarkdown`/`RefineWorkbench.renderMd`）。修复：`utils/html.ts` 新增 `renderTimestampAnchors`（已转义文本上先章头后段落，输出与正式笔记同款可跳转 chip），两个渲染器全分支接入
- **会话详情面板 kind 感知**：photo「画面要点（OCR）」/ video「画面要点（关键帧纯图）」标题与空态文案区分，`（原始 N 块）` 提示仅 photo
- **退役机制标注**：残留 OCR 相关机制按 `#[allow(dead_code)]` + `@ai-context` 保留（region_ocr/layout_cache/grid_from_bgra/save_crop），不删除
- 验证：Rust 新增 3 单测（纯图屏逐图/无图空屏/按 kind 分派）全量 1547 通过（3 失败为预存基线：ai_client 默认 Provider 断言旧 SiliconFlow、note_filter 两条黄金用例，HEAD 复现与本版无关）；`tsc --noEmit` 零错误 / vitest 全绿（新增 5 项锚点 chip 用例）/ vite 构建通过 / clippy 零新增警告

### v0.12.3 浮窗死锁修复 + 浮窗交互/架构升级 + 精修工作台契约修复（2026-08-23 交付，详见 [docs/versions/v0.12.3.md](docs/versions/v0.12.3.md)）

- **P0 浮窗/覆盖层窗口创建死锁（wry#583）**：同步 command 在 WebView2 IPC 回调（主线程）内执行 `WebviewWindowBuilder::build()`——`CreateCoreWebView2ControllerWithOptions` 完成回调需主线程派发而主线程阻塞在回调内等它（循环等待）。症状：点「浮窗化」→ 空白窗 + 全应用不可点击（ASR 引擎线程独立不受影响）。修复：建窗/关窗命令全部 async（Tauri 官方要求模式），`commands_window.rs` / `commands_overlay.rs` 四个命令 + 注释锚定
- **P0 精修工作台 undefined.split 崩溃**：`WorkbenchData` 缺失 `#[serde(rename_all = "camelCase")]`（同模块唯一漏网）→ 前端 `ruleMarkdown` 读到 undefined → `renderMd(undefined).split` 崩。修复：回填契约 + Rust 序列化单测（含嵌套 SectionDiff 保持 snake_case 锚定）+ 前端 `?? ""` 防御
- **浮窗交互层（P1）**：面板/字幕条双形态（Esc/⤡⤢ 切换）+ 拖拽移动 + 位置记忆（localStorage）+ 边缘吸附（≤8px）+ 点击穿透锁定（主窗解锁）+ 置顶开关 + 透明度滑杆（35–100%）+ 回主窗改为显示聚焦且浮窗保留；主窗按钮三态（浮窗化 ⇄ 收起 ⇄ 解锁）
- **浮窗架构层（P2）**：setup 预创建常驻（隐藏，秒开 + 点击期零建窗风险；失败回落懒创建）+ 窗口状态收敛（AppState.float_ui 单一来源 + float:state 事件）+ capabilities 拆分（default/float/overlay，浮窗与覆盖层去 dialog 权限）
- 验证：`cargo test`（新增契约单测）/ `cargo check --all-targets` / `tsc --noEmit` 零错误 / `vitest` 81 通过（新增 floatWindow 14 项：钳制/吸附/偏好往返/损坏回退/透明度钳制）

### v0.12.2 笔记页信息架构重构（三栏 + 收件箱动线 + 路由信息收敛，2026-08-23 规划定稿、未启动——顺延为后续版本候选，详见 [docs/versions/v0.12.2.md](docs/versions/v0.12.2.md)）

- **三栏布局（P0 交互债）**：笔记页从"550px 一栏塞三职"重构为三栏分工——GroupSidebar（240px 组筛选/快速记录/收件箱入口）+ NoteListView（320px 常驻中部）+ NoteReadingView（右栏）；组行单击=仅过滤（消除"过滤+展开"双动作歧义）；搜索/标签过滤时中部列表原位切换，布局不变
- **收件箱动线（P0 产品缺口）**：碎片二元论转正——碎片=原料不是短笔记；收件箱恒常首项（待处理计数）只装碎片，未归组笔记在「全部笔记」（两种实体两条动线）；碎片卡三出口：✍ 升为笔记（轻确认：标题预填首句可改 + 归组下拉默认未归组 → 右侧自动打开新笔记闭环可见）/ ⚙ 升为闪卡（幂等可重复触发）/ 🗑 删除（二次确认）；空态引导三种归宿
- **路由信息收敛（P1 信息债）**：组行小字人话一行（系统自动归类 / ⚠ 待确认 / 已改判 · ⓘ）；ⓘ 弹层四区=人话归因+信号明细默认折叠 / 改判（修改即记忆）/ 组管理（生成闪卡·结算·复习本组·移入移出选中笔记）/ 周契约卡——REQ-198"可见可改"重释：结果可见、原因可按需、误判可一键纠正
- **新建笔记零对话框（P2 摩擦）**：去 `window.prompt`——点「✍ 新建」即建"未命名笔记"直接进入编辑态聚焦首行，落未归组（全部笔记可见）
- **后端（Phase 2）**：新增 `promote_fragment_to_note`（事务建笔记+搬运图片+删碎片；图引用写 notes-images/；绑定卡自动解绑保留）+ `promote_fragment_to_card`（复用多句卡生成规则；按碎片查重幂等）；feedCapture 开关语义改为「快速记录入口」并默认开启（用户裁决转正；旧持久化配置不受影响）
- 验证：cargo test（碎片升级 4 新测 + 闪卡幂等判据 1 新测）/ cargo clippy；前端 tsc 零错误、vitest 67 通过（新增 jsdom 组件测试：收件箱状态机 捕获→升笔记→移除 + ⓘ 弹层四区交互）、vite 构建通过

### v0.12.1 OCR 引擎回归修复（2026-08-23 交付，详见 [docs/versions/v0.12.1.md](docs/versions/v0.12.1.md)）

- **P0 回归修复**：`oar-ocr` 恢复 `auto-download` feature（v0.12.0 构建修复关 default 时误关独立 feature——模型注册名不再解析为 ModelScope 缓存路径，OCR 引擎 CUDA/CPU 双后端读字典均失败，全链路不可用）；模型已在本机 `~/.oar` 缓存，恢复后零网络命中
- **引擎就绪状态真实化（engine_ready）**：OcrDeviceStatus 新增 engine_ready（worker 加载成功/失败回写）；就绪清单（ReadyCheckCard）/ 模型管理面板 / OCR 设备设置 / 系统徽标四处改用——不再用线程心跳冒充引擎就绪（v0.12.0 验收误报根因：OCR 全挂仍显示 ✓）
- **图文会话讲者分析误报修复**：SpeakerSwitchCard 按 `kind=photo` 跳过分析，输出"不适用"灰态——修复每个图文会话详情页误报红色"讲者分析不可用：会话音频缺失"
- 验证：device_config 单测补充（engine_ready 缺省 + 往返 + 旧载荷兼容）；tsc / vite 构建通过；真机验收回归路径待执行

### v0.12.0 图文与窗口捕获重塑（2026-08-23 规划定稿，详见 [docs/versions/v0.12.0.md](docs/versions/v0.12.0.md)）

- **正文源多态（M1）**：filter_note 增加 detect_body_source 抽象层——图文会话 OCR 文本直接进笔记 markdown（修复纯图文会话转笔记空内容）；OCR 走精简净化链（跳过口语净化）
- **WGC 窗口级捕获（M2）**：新增 capture/wgc_capture.rs，WGC 主路径 + DXGI 降级 1 + GDI 兜底三级自愈链——目标窗口不被遮挡
- **系统级覆盖层截图（M3）**：Tauri 独立全屏透明窗口替代应用内 letterbox 框选，1:1 原始像素显示 + 全局快捷键
- **DeepSeek 默认化（M4）**：默认 Provider 切 DeepSeek + 默认模型 deepseek-v4-flash-vision-exp；设置页预设/文案/价格表同步；旧 key 环境变量废除
- **视频画面要点降级 + vision 精修（M5）**：本地 OCR 只做字幕/图文采集（视频会话关键帧纯图，存图触发解耦）；AI 精修可选图片理解（vision_refine_enabled 开关默认关，仅视频会话）
- **采集浮窗化（M6）**：Tauri 子窗口 alwaysOnTop 悬浮小窗（状态/转写/控制），全屏看视频时仍可操作采集
- **文档（M7）**：ADR-021（正文源多态）+ ADR-022（WGC 三级链）+ ADR-023（视频 OCR 下线 + vision 精修隐私契约）

> **交付进度（2026-08-23）**：M1（正文源多态）/ M2（WGC 窗口级捕获三级降级链）/ M3（系统级覆盖层截图）/ M4（DeepSeek 默认化）/ M5（vision-exp 精修 + 视频全帧 OCR 下线 + 关键帧存图触发解耦）/ M6（采集浮窗化）/ M7（ADR 落档）已全部交付；真机验收待执行。

### v0.11.7 图文会话（截屏导入）（2026-08-22 规划，详见 [docs/versions/v0.11.7.md](docs/versions/v0.11.7.md)）

- **图文采集**：课堂助手第三动线——全屏框选截屏 → kind=photo 图文会话（OCR 全图识别 + 屏卡流 + 转笔记）；sessions.kind 字段 + 列表 📷 徽标 + 详情空态；与实时捕获互斥 + 24h 崩溃残留清扫 + 零截图不留空壳
- **跨链路体验**：视频导入完成「去会话页」直达；导入 OCR 进度携带累计识别块数

### v0.11.5 采集体验与笔记打磨（2026-08-22 交付，详见 [docs/versions/v0.11.md](docs/versions/v0.11.md)）

- **采集体验**：采集态档案三维（形态/画面档/领域）热切换（update_live_profile 命令 + 共享 override 槽）；形态/领域每 150s 自动重评（用户手动覆写维度锁定不覆盖）；记忆机制改"检测优先 + 记忆兜底 + 冲突以检测为准"（四象限）；领域检测增 ASR 开场白信号 + B站选集 OCR 证据增强；窗口选择浮层展开自动后台刷新
- **数据过滤**：会话编号显示序号化（display_no，删除后归位显示、内部 id 不变）；新颖度比较域改变化区域 + 阈值按画面档自适应（PPT 同构页不再误过滤）；水印过滤 bbox 接入 region_key + 文本相似聚类（OCR 抖动）+ 区域出现率（会话 38 "万事如番茄LilLil" 回归）
- **会话页**：产物视图下线（后端命令保留）；课后精修懒自动化（原料视图自动触发、幂等）；精修工作台（并排双栏 + 章节语义 diff + 同步滚动 + 采纳/重新生成/放弃）；AI 输入剥离时间戳锚点 + 章节级回挂 + 预估修正；画面要点/词汇表移出笔记 + 会话详情术语表；笔记预览展示已采纳精修版（切页不回退）
- **笔记页**：组与笔记列表树形合并（单栏树：全部笔记根 + 组节点展开叶子）+ 大纲可收起；笔记图片缩略图 + 点击原图；归组路由领域命中强前提（低结构会话归主题组）
- 验收：cargo test **1497 通过 / 0 失败**；tsc 零错误、vitest 43 通过、vite 构建通过；clippy 本次引入警告清零

### v0.11 大目标系列：笔记组与学习循环（2026-08-22 全系列交付，详见 [docs/versions/v0.11.md](docs/versions/v0.11.md)）

- **v0.11.0 笔记组基建·容器侧（REQ-195~198）**：note_groups 表（terrain container/feed + kind course/topic/standalone + domain_tag + series_key 唯一）+ notes.group_id 幂等迁移；group_route 结构密度路由纯函数（加权投票三态 + 7 个 golden 用例）；容器侧组化接线（会话→笔记自动归课程组/主题组/独立组）；组侧栏 UI（路由理由可见/一键改判/笔记移动）
- **v0.11.1 feed 进料口（功能开关默认关）**：fragments 独立原料层（碎片不是笔记）；feature_flags 开关机制（feed_capture 默认关 + 后端二次校验）；碎片快速捕获（文本 + 剪贴板图片 base64，解码验证落盘）；DomainTag 自动归 feed 主题组；设置页开关 + 组侧栏捕获区
- **v0.11.2 学习循环统一（REQ-199 前置基建）**：FSRS-6 调度器（fsrs crate，ADR-018；无 streak 弹性承诺）；flashcards/review_logs/metrics_events 三表；组→闪卡本地规则生成（词汇表术语卡 + 碎片多句卡，幂等查重）；复习面最小化 UI（front→回忆→back→四档评分）；北极星/过程指标埋点 + learning_metrics 读数
- **v0.11.3 组结算机制（防沼泽仪式）**：settlement 双触发判据（≥50 条阈值 / ≥20 条且 ≥90 天周期）；重复合并判据（bigram 包含度 ≥0.7 贪心一对一）；结算仪式（计划呈现→确认→执行）+ settlements 留痕 + group_settled 埋点；归档不删除可恢复
- **v0.11.4 学习循环补齐 + feed 消费闭环（REQ-199~201）**：内容分型 action 卡最小版（步骤信号→kind=action，front=动作名 back=步骤清单，golden TDD）；周契约视图 UI（contracts 表 + upsert_week_contract 幂等 + week_contract_status 周聚合纯函数 + 周契约卡：目标设定/进度/断签不清零视觉/最小可行日徽标）；feed 消费闭环（delete_fragment/update_fragment_group/resolve_fragment_image 三命令 + feed 组碎片列表（文本+图片缩略+删除/移出+空态引导）+ 复习面碎片卡/动作卡徽标）
- 验收：card_generate 22 测 + week_contract 16 测独立验证通过；cargo build + clippy 零错误；前端 tsc + vite + vitest 35 通过；**环境备注**：cargo test 运行受阻（test harness 0xc0000139，2026-08-12 Windows 更新引入的加载期兼容问题，与本版代码无关，纯函数已独立编译验证）

### 视频档案框架 v2 四维解耦（任务 5：v0.9.0 M1~M5 代码建设，2026-08-21）

- **四维解耦数据模型（REQ-188）**：新增 `video_profile_spec.rs` + `video_profile_spec_data.rs`——形态 7 类（讲授/实操/解说/对话/题目/代码/音频）× 画面档 4 档（高/中/低/无）× 领域 × 语言 四维解耦；13→7 映射（whiteboard→讲授=高、podcast/live→音频=无档）；参数矩阵（形态→产物模板+后处理、画面档→采样/OCR/存储）；记忆库 kind 映射迁移（MemoryEntry.form 字段 + remember_form/lookup_form，旧 JSON 零回归）；新 command（video_profile_for_spec / video_profile_spec_by_kind / remember_video_profile_form）
- **画面价值自动检测（REQ-189）**：新增 `video_tier_detect.rs`——三信号加权投票（帧切换率/OCR 文字面积/区域构成）+ 升降档裁决（升档静默/降档确认）+ 重评窗口聚合（150s 定档）；screen worker 集成观测器 + DualRateScheduler::retune 动态调档 + live:tier-changed / live:tier-downgrade-request 事件 + confirm_tier_downgrade command
- **领域标签体系（REQ-190）**：新增 `video_profile_domain.rs` + `video_profile_domain_data.rs`——粗 15 领域 × 种子词表 + 细标签开放 + 四来源检测（平台>用户>标题>术语）；hotwords 预热（preheat_domain_hotwords 注入 VocabManager）、术语筛选、区域预期（数学→公式区）接线
- **平台信号适配（REQ-191）**：新增 `platform_adapter.rs`——平台推断（标题后缀/URL/本地文件）+ bilibili 分区标签提取（会话 33 实证 `知识科普|经济管理`）+ local 路径语义 + OCR 标签通用化（不依赖平台枚举）；无平台信号零回归
- **检测卡 v2（REQ-192）**：ProfileDetector 重写为三维一体交互（形态/画面/领域各自可调下拉，修改即记忆）；未知维"识别中"不阻塞；形态低置信必问；档案卡无开始按钮（归采集控制区）
- **叙事结构模板变体（REQ-193）**：新增 `narrative_detect.rs`——故事化特征投票（角色+转折词）→ 摘要模板"叙事线+要点提取"变体（会话 33 小马故事归属）；直接教学零回归
- 验收：cargo test 1352 全绿 + clippy 零警告；M6 真机验收（会话 33 复测）待执行

### 重构与基建（任务 4 完成）

- **分支重构**：远程分支重建为 `dev`（日常开发主线）/ `main`（发布线，semantic-release 自动发布）/ `old`（旧代码存档，dev+main 合并，只读）；删除 `rebuild`；GitHub 默认分支切换为 dev
- **目录互换**：原项目目录更名 `Entropydecrease-old`（只读存档）；主工作区保留原名 `Entropydecrease -重构区`（IDE 工作区绑定稳定优先）
- **工作设施继承与适配**：`.husky`（commitlint hooks）+ `commitlint.config.js` + 根 `package.json`（semantic-release 工具链）+ `scripts/`（docs-check/version-bump/validate-all/session-*）+ `.releaserc.json`（assets 适配 app/）+ CI workflows（pr-check 适配为 app-frontend/app-rust/docs 三 job；release 适配为 Tauri NSIS 打包 + 服务器/OSS 同步骨架）+ `server/` 部署配置（deploy.sh/docker-compose/nginx/.env 模板，不含真实密钥）+ 根 `.gitignore` 适配版
- **文档**：视频档案框架 v2 设计文档（docs/Foresight/video-profile-framework-v2.md）+ v0.9.0 版本文档 + 需求池登记 REQ-188~193；docs-check 全绿（索引补登记 ADR-016/long-term×2/v0.9.0；note31 归档）
- 待办：首次发布前需在 main 手动打 `v0.8.0` 基线 tag（semantic-release 从 v1.0.0 起步）

### 界面（任务 1：设置页，2026-08-21）

- **新增「⚙ 设置」页**（与课堂助手同级导航，提交 `6720bec`）：课堂助手 9 个设置类面板迁出——模型（模型管理/磁盘占用/OCR 设备）/ 音频（预处理链/落盘管理）/ AI 服务（密钥授权/任务中心）/ 数据（备份恢复）/ 词表 五组，单页滚动 + 分组标题布局（市场调研定稿方案 A）
- **课堂助手左栏精简**：仅保留采集动线（就绪清单/窗口选择/实时捕获/素材导入/提取）；设置面板迁出后无共享状态问题（模型下载全局事件由保留挂载的监听器接收）

## [0.8.0] - 2026-08（AI 接入，M1/M2/M3/M4 开发中）

### 新增（M4 版本管理与成本完整，REQ-144 + REQ-143 完整）

- **notes_versions 快照链（REQ-144）**：`(id, note_id, content, source: rule|ai-refine|ai-enrich|user-edit, parent_id, created_at, meta{成本/模型/切片/合并摘要})`；旧数据迁移兼容（旧笔记首快照=当前内容，惰性创建）；**统一 versioned 写路径**——转笔记（首快照）/精修采纳/补充采纳/手动保存（update_note）/回滚全部走 versioned_save（事务：更新 notes + 插入快照 + 上限合并）
- **50 版上限**：超限合并最旧两版（删最旧 + 次旧 meta 追加 merged_from 摘要——meta 不丢）
- **回滚不破坏历史链**：回滚=新版本（content=目标版本，source=user-edit，parent=最新版本——线性链语义，规划"parent=目标版本"会制造分叉故取线性，见 v0.8.0.md M4 注记）
- **任意两版段级 diff**：`note_versions_diff` 复用 note_diff 内核（版本对比视图高亮）
- **成本落库（REQ-143 完整）**：`note_ai_usage` 表（操作类型/token 输入输出/费用/模型/切片数）——精修/补充采纳时自动落库（token 估算与预估同口径，校准单价表数据源）
- **版本时间线 UI**：笔记详情页「🕘 版本时间线」面板——版本列表（时间/source 徽标/费用/合并摘要）+ 回滚到此处 + 两版 diff 对比（下拉选择）+ AI 成本记录

### 测试

- 单测 +11（全量 1264 通过）：来源标记 serde/label · meta 合并摘要（含/不含 AI 元信息）· 惰性首快照（旧数据兼容）· versioned 写链（rule 基快照 + ai-refine 新版本 + parent 链）· 回滚不破坏历史链（3 条）· 50 版上限合并（merged_from 摘要）· 成本记录 roundtrip/互不干扰 · 缺失笔记拒绝

### 新增（M3 知识补充，REQ-142）

- **知识补充入口**（笔记详情页「✨ 知识补充」，与精修语义分开）：九子项勾选面板（深度 D1 概念展开/D2 步骤补全/D3 例子补全 + 广度 B1 前置知识/B2 进阶/B3 横向关联/B4 对比辨析/B5 实践建议/B6 资源推荐；**记忆上次选择** localStorage）
- **AiEnrich 协议**：一次批量返回块数组（省请求）+ schema 强校验（kind ∈ 勾选子项/深度块锚点必填/广度块不带锚点/**B6 块禁止 URL——仅标题不输出链接**，防幻觉约束）
- **混合落位**：深度块按 anchor_ref 就近插入引用章节之下（引用风边框 + "AI 展开"徽标 + 溯源锚点；同锚点合并）；广度块聚合笔记尾部"扩展区"（"AI 补充·非课程内容·需核实"徽标 + 需核实声明 + 各自成节）；锚点未命中追加尾部不丢块
- **删除与撤销**：采纳=update_note 覆盖内容；撤销=base 还原（删除无残留）；重补=新版本（M4 版本管理消费）
- **切片复用**：长笔记按章节切片（REQ-145 基建复用，进度按片上报）；任务注册表/事件/容量守卫与精修共用（AiTaskEntry.result 泛化为 JSON）；`AI_ENRICH_MOCK=1` 离线开发路径
- 提示词模板 `prompts/note_enrich.json`（九子项说明动态注入，B6 无链接约束在 system 层）

### 测试

- 单测 +17（全量 1253 通过）：九子项分类/label · validate 强校验（未请求子项/深度缺锚点/广度带锚点/B6 含 URL 拒绝/置信度越界/超量）· 混合落位（深度就近/广度聚合/同锚点合并/锚点未命中不丢块）· 提示词模板解析/勾选子项注入

### 新增（M2 会话→笔记 AI 精修，REQ-141/145 + REQ-143 基础版）

- **AI 精修双模式（REQ-141）**：笔记预览视图新增「✨ AI 精修」入口——规则草稿（单一管线三出口：预览/落库/精修同基线，`build_rule_draft` 提取）→ 切片 → 云端结构化精修（`AiRefineResponse`：sections/blocks 五类型，schema 强校验，非法响应丢弃回退）→ **diff 预览**（本地规则版为基线，新增绿/删除红高亮）→ 采纳落库/放弃
- **档案分组提示词**：`prompts/note_refine.json`——网课=讲义式/实操=步骤式/口播=摘要式/访谈=问答式/会议=纪要式 + 扩展类（直播/白板/题目/跟练/编程）回退讲义式；核心指令"精修=整理不创作（不增补课程外事实）"
- **异步任务化（REQ-145）**：`ai_task.rs` 状态机（Pending/Running(按片进度)/Succeeded/Failed(原因四类)）+ `slice_note` 切片纯函数（≤8000 字/片、章节边界优先、CJK 字符级硬切防 panic）；任务注册表 + "ai:task-update" 事件 + 轮询双通道；失败原因四类引导（未授权→配置密钥/网络→重试/余额→充值/配额→明日再试）+ 重试入口
- **成本确认基础版（REQ-143）**：`ai_cost.rs` token 估算（字符数保守上界）+ 单价表可配（env `SILICONFLOW_PRICE_PER_1M_TOKENS`，默认免费档 ¥0）+ 确认面板（token/费用/内联余额 ai_get_balance 复用 + "记住此选择"持久化）
- **段级 diff 内核**：`note_diff.rs`（行级 LCS，未变/新增/删除三态）——M4 版本对比共用
- mock 适配器扩展（`AiMockAdapter::refine`）+ `AI_REFINE_MOCK=1` 离线开发路径

### 测试

- 单测 +32（全量 1236 通过）：精修协议 validate 强校验/to_markdown 五类型渲染 · 切片边界/章节优先/CJK 不 panic/失败映射 · 成本估算/单价 env 竞态锁 · diff LCS/重组/规模守卫 · 提示词模板解析/档案风格回退

### 新增（M1 AI 使能层，REQ-138/139/140）

- **AI 服务设置面板**（课堂助手左栏）：全局开关（授权红线默认关）+ 端点/模型可配 + 一键测试连接 + 余额卡片（total/grants/topped_up 分项 + 刷新 + 低余额提醒）+ 审计列表（可清空）
- **密钥管理（REQ-138）**：密钥掩码输入/保存/清除——Windows DPAPI 加密存储到 `ai_credentials.bin`（明文红线：不落 SQLite/明文文件；ADR-016：keyring spike 因本机 TLS 拦截跳过，走规划 DPAPI fallback）；环境变量 `SILICONFLOW_API_KEY` 保留为开发路径（优先级 env > 凭据库）；前端永不回传密钥（视图只有 has_key/key_source）
- **余额查询（REQ-139）**：`ai_balance.rs`——GET /v1/user/balance + 解析容错（字段缺失按 0 尽力而为）+ 低余额阈值可配（默认 ¥1）；`ai_test_connection` 复用余额接口做一键连通性验证（错误密钥明确报错）
- **授权与审计（REQ-140）**：`ai_settings.rs` 持久化（enabled/authorized 默认关——授权红线）；开启开关时内联授权确认卡（上传说明：仅文本+最小上下文，音视频/图像永不出本机）；审计列表消费 REQ-085 `AiAuditEntry` 缓冲
- **共享 AI client（REQ-138）**：`ai_client.rs` 抽取——base_url/api_key/model 配置聚合（env > 设置 > 默认）+ 超时/指数退避重试 + 错误归一六类（Auth/Network/Balance/Quota/Server/Parse，REQ-145 失败原因映射基础）；`ai_text_filter.rs` 重构复用（既有测试保持全绿）

### 测试

- 单测 +20（ai_settings 默认关/partial JSON/损坏回退/roundtrip/双门控边界 · ai_credentials 内存桩 roundtrip/清除/空密钥拒绝 · ai_balance 解析容错/低余额边界 · ai_client payload/no_think/剥围栏/解析错误/无密钥 Auth 错误）；全量 `cargo test --lib` 1204 通过

## [0.7.2] - 2026-08（开发中）
### 新增

- **课堂助手体验三连（2026-08 用户需求，已完成）**：
  - 最近画面按时间先后排列：缩略图条去掉"最新在前"反转——前→后 = 旧→新，新画面追加在末尾（后端本就按时间戳升序返回）
  - ASR 未沉淀行多行展示：实时转写不再折叠为单行——识别中（灰斜）与已定稿待沉淀（黑）各行并存；连续定稿（快速短句）不再互相覆盖丢失，新句首个 partial 到达时统一沉淀入列表；**2026-08 修正**：识别中 partial 按句读（。！？…）拆多行灰斜体全部显示（整句候选含多句时不再一行越滚越长），定稿时合并为一行黑色待沉淀（纯前端，后端单流协议不变）
  - 视频类型档案新增「未知」选项：自动检测零信号命中（无法识别）时如实选中「未知」并生效（参数走默认档零回归、产物模板同网课讲义）；记忆偏好/会话 profile/产物构建全链路支持 unknown
- **课堂助手四深化（2026-08 用户需求，实施中）**：
  - 采集信息面板（REQ-151）：采集过程右侧信息区显示播放平台/视频时长/合集集号/字幕情况——平台=标题后缀规则；时长=播放器区域 OCR 时间文本；合集=标题规则+播放器 OCR 分P文本；字幕=实时字幕检测状态（全部本地，无网络）
  - 合集检测与联动（REQ-152）：extract_series/normalize_title 纯逻辑（P/集/EP/括号/数字后缀，防误判边界）+ 档案检测系列名投票（跨集投票一致）+ 记忆偏好系列键（用户选一次，整系列生效）+ 课程分组扩展；B站搜索接口反查方案否决（风控/隐私/维护成本），播放器 OCR 为本地增强
  - 说话人分离弱化版（REQ-153）：sherpa SpeakerEmbeddingExtractor 引擎接线 + VAD 段馈入 + 讲者切换事件（时间戳+置信度）落库与展示；模型缺失降级为无讲者标注；课堂助手使用说明同步提醒
  - 语速停顿自适应（REQ-154）：S-1 动态合并阈值（段前停顿统计 → 合并 gap 从固定 600ms 参数化）；S-2 语速骤变事件（speech_rate 已落库 → 段间骤变事件落库，重点标注备数据）

### 测试

- 单测 N 个（实施中）：合集序列识别矩阵（P/集/EP/括号/数字后缀+反例）· 平台后缀剥离 · 课程分组回归 · 检测系列名投票一致性 · 记忆系列键跨集命中与旧 JSON 兼容 · 断句自适应阈值统计与注入

## [0.7.1] - 2026-08（开发中）

### 新增

- **会话体验小版本（REQ-135~137，2026-08-19 头脑风暴）**：
  - 会话↔笔记双向关联：`notes.session_id` 列迁移（删除会话 `SET NULL` 只断关联不删笔记——笔记是用户资产；旧数据诚实 NULL 不猜不填）；`list_sessions` 返回 `SessionListItem`（has_note/note_id/note_title/has_content 子查询标记）；`artifact_to_note` 同步写关联（口径统一）
  - 批量转笔记 `batch_session_to_note`：≤50 条、部分成功语义（单条失败不阻塞、跳过原因显式回传）、重复 id 去重、跳过已转防重复；`convert_to_note` 核心提取——单条与批量共用同一过滤管线（REQ-081/082 原则延续）
  - 会话页管理台重构：列表状态徽标（录制中/待转/已转笔记/异常）+ 状态/转化筛选 + 排序（新→旧/旧→新/时长）+ 批量操作栏（批量转笔记/批量删除，确认框说明笔记保留）+ 行内一键「转笔记」（4 步→1 步，转完就地变「查看笔记 →」）+ 双模式搜索整合（标题本地即时过滤/转写内容段搜索）
  - 会话↔笔记双向互跳：会话「查看笔记 →」直达笔记页并定位；笔记行「来源会话 →」跳回会话详情（复用 A4 focusSessionId 模式）
  - 状态实时性根治：`active` prop（切页刷新）+ `live:status`/`session:fused` 事件驱动刷新——display:none 挂载不刷新导致的"采集中"残留消除；新完成会话顶部提示条（📬 N 个已完成采集）；操作反馈升级为自绘 toast（3s 自动消失）；空态引导 + 无结果"清除筛选" + 加载态
  - 详情面板拆出 `SessionDetailPanel`（豁免清单拆分计划落地），质量报告/大纲/视图模式下沉为面板内部状态

### 测试

- 单测 945 个（+13）：notes 迁移补列与旧数据 NULL / list_sessions 四象限标记 / 删会话 SET NULL 保笔记 / find_note_by_session 取最新 / 批量转 6 用例（全成功/跳过录制中与重复/已转跳过/不存在/超限/部分失败不阻塞）

### 变更

- `list_sessions` 返回类型改为 `SessionListItem`（前端同步新契约；`db_ocr_search`/`search_session_segments` 内部适配包装结构）
- 会话删除语义明确：转写/OCR/图集级联删除不变，关联笔记保留（SET NULL）

## [0.7.0] - 2026-08（开发中）

### 新增

- **信任收尾（REQ-098~107，M1）**：ASR 置信度真实化（重打分一致性代理置信度替代硬编码 0.9/0.8——无法产出落 None 诚实表达未知；字幕投票置信度落库）；悬空机制治理（讲者诚实降级移除空转/音量骤变接线/预处理链闭环）；quality_report 引擎失败计数双源+重打分超时率；预处理链 CER 微基准+持久化开关；段级 volume 落库+重点标注三信号全亮；剪贴板信号（课中复制=高置信信号，只存 30 字预览）+剪贴板图片直贴；音频事件过滤（固定音模式+VAD 门控）；日志脱敏；数据备份/恢复
- **存储使能（REQ-108~110，M1.5）**：统一信号事件表（帧切换/长静音/音量骤变/VAD 段/剪贴板/前台/播放器七类，分级落库+容量守卫，章节检测消费真实信号）；段级元数据列（语速/段前停顿+speaker 影子列）；档案级存储策略档位（文本优先/均衡/图像优先）+图像流存储层（时间轴帧序列分级存储）
- **类型扩展（REQ-121~124+130，M2）**：12 档案注册（新增播客/直播/白板/游戏教程/题目讲解/跟练/编程实战）+UI 显示名；P4 无音/无图短路（播客/直播跳过画面链）；跟练档案步骤边界三信号（口令/练习段/示范交替）；编程档案代码块产物+diff 步骤卡
- **信号机制（REQ-125~129，M2）**：前台时间线（窗口切换事件落库+实践段标记）；播放器行为信号（暂停/播放检测+倍速感知采样）；抢话/打断代理版（短间隔+能量突变）；WASAPI 分应用音频路由 spike（API 面验证通过）；样式信号暴露面核查（oar-ocr 无颜色/字号，降级方案定稿）
- **平台与图像（REQ-131/133/134/088，M3）**：模型磁盘占用面板+版本标记；图内文字检索（搜 PPT 的词命中图）；图片白边裁剪；关键图图注生成（OCR 高频×转写摘要交叉，影子层）
- **质量小项（REQ-111~120，M2）**：融合切分对齐标点/词边界；滚动字幕防误杀确认机制；导入分窗 2s 重叠+窗边句合并；抗混叠重采样（FIR 低通+抽取）；24bit 左对齐解包；VAD 阈值诊断暴露；导入链路 UI 垃圾源头过滤；重复合并归一化+短语级 Jaccard；中英混排拼接空格；OCR 混淆画像→替换词候选

### 测试

- 单测 921 个（+212）：置信度一致性矩阵/事件表 roundtrip/存储档位/图像流/步骤边界/信号机制/图注/白边裁剪/切分对齐/滚动确认/重叠窗/抗混叠/24bit/混淆画像等


### 修复

- **结构模型状态误报（2026-08 用户反馈）**：structure_model_status 原只读内存态（每次启动为空）——已下载完成的版面/表格/公式模型被误报"未下载"，点下载又立即"完成"。现合并磁盘存在性检查（按公式档位），启动即如实显示"已就绪"。
- **音频预处理链默认值与样式（2026-08 用户需求）**：默认改为开启（防低音量课程 VAD 截断，覆盖 REQ-041 原默认关裁决）；UI 误用未定义 CSS 类（setting-card*）导致无样式裸控件——改为与 OCR 推理设备等面板一致的内联样式卡片。

### 变更
- **采集控制与实时感知（2026-08 用户需求，A 批）**：
  - 会话暂停/继续（硬暂停）：完全停采（WASAPI 端点 Stop/Start，无重连风险），时间轴冻结并补偿暂停时长，Pause/Resume 落 session_events 表；暂停中停止/关闭安全
  - 实时音频电平条（VU）：live:audio-level 事件（200ms/次，RMS+削波）→ 12 段电平条，静音/讲话/削波当场可辨（试听自检实时化）
  - 手动标记按钮"⭐ 标记此刻"：save_user_screenshot 补 live:image-saved 事件，"最近画面"条即时刷新（快捷键 Ctrl+Shift+S 同效）
  - 融合完成直达：停止后右侧显示"查看时间轴 →"卡片，一键跳会话页并自动打开对应会话详情
- **开始前准备流（2026-08 用户需求，C 批）**：引擎就绪清单卡片（流式模型/SenseVoice/OCR 设备/结构模型/磁盘，聚合现有只读命令，零后端改动）——缺什么一目了然，全就绪显示"可开始"
- **课堂助手三项优化（2026-08 用户需求）**：
  - 停止即时生效：停止信号置位即停捕获线程（channel 断开后 drain 残留块），停止响应从 ~8s 降至 <1s；"会话线程 5s 内未退出，已 detach" 由常态日志降级为真卡死兜底；stop 命令改 spawn_blocking 不再阻塞异步运行时
  - 视频播放状态自动暂停/恢复：REQ-125 暂停图标检测驱动 A1 硬暂停标志——视频暂停 → 整链路停采（WASAPI 端点 Stop / 不喂 ASR / 不写 WAV / 屏幕零分析），恢复播放自动继续；暂停边沿 flush 尾句 + 引擎 reset（替代 100ms 静音方案——真正断句，暂停前后语音不连句）
  - 引擎预热（开始即录）：进课堂助手页即后台加载流式 ASR 引擎（预备线程 park 等待交接——引擎非 Send 不跨线程），点"开始"毫秒级启动；离开页面释放 + 15min TTL 兜底；预热失败/未就绪回退内联加载（零回归）
  - 修复：A1 暂停标志/补偿时长跨会话残留（新会话起始即暂停、时间戳偏移）——start 时按会话复位

- **课堂助手页面优化（2026-08 用户需求）**：
  - 窗口选择：自动过滤无法采集的窗口（最小化/零尺寸/cloaked/工具窗口）；B站/YouTube 等站点首页（无视频内容落地页）降权移出推荐并标注"站点首页"，仍可手动选择兜底
  - 视频类型档案（12 类）从左侧栏移至右侧内容区（配置态顶部，选定窗口后出现）
  - 结构分析模型清单整理：状态徽标化 + 行内体积/进度 + 公式档位独立小节
  - 实时转写右侧新增"最近画面"缩略图条（关键帧实时归档展示，点击放大；独立区域不引起转写行跳动）

## [0.5.0] - 2026-08（开发中）

### 新增

- **视频类型档案（REQ-043，M1）**：五档案（网课/实操/口播/访谈/会议）纯配置（采样预算/信号权重/后处理开关/产物模板）+ JSON 可校准；混合检测（标题/URL/画面切换/字幕信号投票 + 记忆偏好 JSON 持久化 + 用户确认闭环）；档案驱动采样（DualRateScheduler::from_budget 按档案查预算表）；sessions.profile 列（DB 迁移兼容旧库）；前端"检测为：网课（可改）"档案卡
- **档案支撑机制（REQ-044/045/046，M2）**：章节检测（画面切换/长静音/n-gram 话题三信号投票）；口语书面化（语气词/重复压缩/标点恢复，可逆——原料层保留原文）；重点候选标注（重复短语/音量骤变/OCR 停留）；术语表交叉（OCR 高频×ASR 低频）；说话人变化弱化版判定器（embedding 余弦相似度，模型分发留 V1.0）；会话结构化分析命令（按档案开关门控）
- **规则版版面分析（REQ-047，M3）**：区域分类 text/table/formula/code/image/unknown（表格线全局检测 + 行带投影 + 公式中线/代码对齐启发式）；版面缓存（指纹 + LRU + TTL，事件帧触发复用）；区域价值采样权重表；实时链路全帧分支接入
- **分区域 OCR 编排（REQ-048，M4）**：区域裁剪（边距 12px + 表格 2x/公式代码 1.5x 放大）→ 识别 → 坐标还原纯函数（缩放/负偏移边界单测）→ region_kind 标注合并；每帧 ≤4 区封顶；失败回退整帧直跑；session_ocr_blocks.region_kind 列迁移
- **表格/公式专项（REQ-049/050/053，M5）**：表格线检测重建 Markdown（含转义/置信度/诚实降级）；公式上下标重建 LaTeX（x²→x^2、H₂O→H_2O、\frac{}）；模型版（SLANet/UniMERNet）双轨留 V1.0；KaTeX 本地化（无 CDN）+ Markdown 表格渲染 + 低置信/AI 占位样式
- **结构模型版落地（REQ-047/049/050 模型版）**：oar-ocr 0.9.1 内置 OARStructure 全套结构管线（重大发现——layout/表格/公式模型托管于 ModelScope 注册表，算子兼容由上游保证）；按需下载器（版面 pp-doclayout-l 129MB / 表格 slanet_plus_v2 8MB / 公式 PP-FormulaNet-s 231MB，UniMERNet 1.84GB 高精度档可切换）；跟随 OCR backend（CUDA EP + CPU 回退 + gpu_mem_limit）；方案 A 增强版课后精修（实时链路存裁剪图 → 课后懒加载模型批处理 → 产物静默升级）；设置面板三模型状态 + ArtifactView"课后精修"按钮
- **图片配套（REQ-051，M6）**：帧聚类（感知哈希）+ 多信号筛选投票（新文字/变化/停留/用户截图最高权重）；三层图存储（full+thumb WebP lossless、去重、50 张预算上限）；Ctrl+Shift+S 用户截图；图集画廊（懒加载 + 删除 + 路径穿越防御）
- **产物体系（REQ-052/053，M7）**：ArtifactBlock 块模型（16 类型 + refs 引用原料不复制 + source 标记）+ 五档案模板（讲义/步骤卡/摘要/对话纪要/会议纪要含触发词）；artifact_blocks 表（可重算覆盖）；产物视图（原料/产物切换 + KaTeX/表格/图集渲染 + 一键落笔记）
- **补缝式 AI 前置（REQ-055，M8）**：判定器（unknown 区/重建失败/低置信三入口 + 最小上下文可关）；请求/响应协议 schema 强校验（越界/缺失/悬空边拒绝）；mock 适配器（全类型合法响应验证链路）；护栏骨架（每日配额/同图缓存/审计缓冲/来源标记）；"AI 增强（V1.0 开放）"占位
- **词级时间戳（REQ-054，M9）**：WordTimestamp 协议 + 提取纯函数（sherpa-onnx 1.13 Rust 包装未暴露 enable_token_timestamps，启用点=V1.0）；段级/块级置信度落库已有

### 测试

- 单测 453 个（+221）：档案 JSON roundtrip/检测投票矩阵/记忆闭环、章节三信号/书面化语料/重点标注/术语交叉/讲者余弦、版面分类 golden/指纹/缓存、坐标还原/区域调度、表格/公式重建 golden、帧聚类/筛选投票、图片存储/预算、块模型 roundtrip/五模板 golden/DB roundtrip、协议 schema 校验/mock 合法性/判定器矩阵/配额/缓存、词级时间戳提取
- 待用户执行：M0 基线收尾（REQ-033 真机验收/RNNoise 微基准）+ v0.5.0 全链路真机验收

### 修复

- **ASR 链路取优整合（会话 11/12/22 转写时间轴差异实测分析，2026-08-19）**：
  - 重打分**有界等待**（3s 超时降级）——推理异常不再无限阻塞主循环（阻塞 → 音频积压 → 停止时丢弃 = 内容缺失）
  - 停止时 **drain 积压块**（宽限 8s）——停止瞬间已送达未处理的语音不丢
  - **VAD 阈值绝对上限**（0.05）——P10 噪声底在"全程高能量"音频上失真时阈值不再爬到语音级（防全判静音 → 隔块喂入 → 内容缺失/碎片）
  - **前缀扩展接受放开至 rule3 硬切段**——硬切段尾字丢失（13.wav 取证 4/16 段）同样由 SenseVoice 补回；跨段重复由 F3-2 去重 + F4-1 合并重叠跳过防护
  - ASR 健康判定改用固定阈值——VAD 阈值失真时降级提示仍触发（静默失败可见性不失效）
- **实时转写逐句沉淀（merge-then-split 演进，取代固定次数一刀切）**：链式合并后的合并文本按**段内真实句号**切分——完整句逐句落库推送（句子级实时性，边界不切碎句子），无句号的尾部残余继续挂起合并（半句不丢）；子句时间戳按字符比例近似分配；`MAX_MERGE_CHAIN` 降级为模型长期无句号时的兜底上限
- **实时转写整段合一（用户实测：实时只显示一行 / 结束采集后全部语音集中在一条段内）**：连续语音（句间停顿 <600ms）时 sherpa 端点只由 rule3（8s）触发，F4-1 链式合并无上限——所有硬切段无限挂起合并，挂起期间不推送不落库（实时流只剩 partial 一行），停止时 flush 才一次性整段兜底落库。修复：合并后句子切分 + `MAX_MERGE_CHAIN=4` 兜底（覆盖 13.wav"同句三刀"模式；超过强制落库并推送，内容不丢，实时流恢复逐段沉淀）
- **视频采集全帧 OCR 断链（会话 14/15 实测全程 0 OCR 块，参考图集只剩首帧占坑图）**：规则版面分析将视频画面误判为版面区域（letterbox 黑边→全屏 Text、播放器进度条→Formula）后，区域路径独占整帧 OCR 且空产出不回退——真实画面文字永不被识别。修复链：
  - 区域路径空产出 → 回退整帧 OCR（结构性回退链补全，不再依赖版面分类正确性）
  - 版面区域网格坐标 → 帧像素坐标换算落实（`regions_to_frame`；crop_spec/map_to_frame 此前两套坐标系混用，区域被裁到错误位置）
  - 公式启发加固：满宽长条须薄（≤3 行）/不贴区域首末行/上下两侧均有内容——进度条与黑边不再误判 Formula
  - 低信息纯色区域（黑边/纯色底）判 Image 调度跳过——不再误判强置信 Text
  - 全帧路径 UI 垃圾源头过滤（与字幕 REQ-083 同口径）——播放器时间码不再刷屏归档
  - 空文本帧不归档——去掉首帧无条件占坑归档
  - `save_crop` 双指纹去重（与 save_frame 同口径）——静态误判区域不再每 tick 重复存图耗尽 50 张共享预算（会话 15 实测 49 张全同垃圾 crop）

### 测试

- 单测 709 个（+8）：坐标换算缩放/溢出防御/退化安全、进度条+黑边非公式/纯黑帧非文本/深底亮字保留、裁剪图双指纹去重、命名空间隔离回归改 seeded 帧（纯色帧是双指纹退化输入）

## [0.4.0] - 2026-08

### 新增

- **OCR GPU 卸载（REQ-036，ADR-009）**：CUDA 执行提供程序（EP 注入 + CPU 自动回退 + 回退原因可查）；DXGI 硬件门槛探测（NVIDIA 候选过滤）+ 三层检测；Auto/ForceGpu/ForceCpu 模式 + "重新检测"微基准校准（CPU/GPU 各 3 帧取中位数，防抖动阈值）；ORT 调优（intra_threads + 图优化 All）；`ocr_device_status/set_mode/recalibrate` 命令 + ClassroomPage 设置区；`download-ort-cuda.ps1` 运行时分发（含 CUDA 包，AddDllDirectory 注入 DLL 搜索路径）
- **动态字幕区域（REQ-037）**：播放区域检测（黑边扫描，5s 周期重扫）+ det bbox 驱动 ROI 锁定/失效重扫（`playback_region.rs` / `region_tracker.rs`）；OcrBlock 携带 bbox（oar-ocr 0.9.1 确认暴露）；先验=播放区域底部 1/4，无播放区域退化窗口坐标零回归
- **实时字幕体验（REQ-038）**：partial 上屏灰→黑原位静默修正（无闪烁无跳动，已定稿行沉淀入列表）；投票器同文本 hash 短路（跳过字符级 levenshtein）
- **采样预算与自动降级（REQ-039）**：双速率调度预算封顶（字幕 ≤2fps / 全帧 ≤0.5fps）+ 高负载降级档（全帧 0.1fps 封顶，保 ASR 主链路）+ VAD 旋钮参数化；CPU 负载监测（GetProcessTimes，持续超阈值 3s 触发）；OCR 结果 LRU 缓存（8×8 均值哈希，A→B→A 帧往返零推理）
- **热词/替换词闭环（REQ-040）**：词表本地持久化（JSON）+ CRUD 命令 + 前端词表管理；热词注入流式 ASR（端点断句自动生效，TD-032 防空串保留）；替换词 OCR 后纠错（长词优先，缓存存修正结果）；最近会话 OCR 高频词建议（用户确认加入）；课件预热最小版（pptx/txt/md 文本提取，PDF 留 v0.5）
- **音频前端与信号增强（REQ-041）**：预处理链（AGC 目标 RMS + 峰值钳制 + 削波检测 + 动态静音能量阈值防轻声截断，默认关，微基准定默认）；立体声声道 RMS 选优混音（杂音声道不混入）；窗口标题信号确认入库（source_window）
- **韧性与可观测性（REQ-042）**：ASR 三级降级链状态机（流式→离线重打分→静音占位，静默语音 5s/15s 触发，恢复自动回落）+ `live:asr-degraded` UI 提示；资源健康巡检（磁盘剩余/模型完整性/引擎线程心跳）+ 系统状态徽标；静默失败可见化（ASR/OCR 失败计数 + OCR 缓存命中率 + 诊断面板）；启动加速核对（引擎常驻启动即加载）

### 修复

- TD-033：窗口跨显示器移动后 DXGI duplication 不更新（最长 30s 空窗）——DxgiState 保存输出 DesktopCoordinates，窗口中心越界立即重建（2s 快速节流）；DxgiState 拆分至 `dxgi_state.rs`
- **审查闭环修复（2026-08-18 发布审查问题全量）**：
  - OCR 设备模式前后端契约不匹配（模式设置不可用，P0）→ 入参改枚举 + 配置内存态单点 + 多 NVIDIA 卡 Auto 保守落 CPU
  - 引擎线程心跳恒 true → AliveGuard（Drop 置 false，panic 路径也释放）
  - ROI 坐标系与 downscale 不一致（>960px 屏幕字幕裁半）→ bbox 按缩放比反算 + resize 清播放区域
  - 静音判定 AGC 前后尺度不一致 → 改原始样本判定；AsrHealthMonitor dt 步长 0.5→0.2s
  - OCR 替换词运行期不生效 → 请求循环重读 + 缓存存原始结果
  - PPTX 解压炸弹（声明尺寸预分配）→ 预检 + 限流读取 + 文本总预算
  - 调度器 degraded 档全帧被字幕 tick 遮蔽 → 独立计数
  - 其余：校准标记 RAII、降级恢复事件、AGC target_rms=0 契约、前端引用比较/updater 副作用/面板定位、词表建议按会话去重、课件提取 async 化、健康巡检补 sensevoice、ps1 超时重试等

### 变更

- 引擎池/词表/健康监控等共享状态经 `Arc<Mutex<...>>` 注入（命令层与 worker 解耦）
- 依赖新增：`zip`（课件预热 PPTX 提取）
- 版本：0.3.0 → 0.4.0（Cargo.toml / package.json / tauri.conf.json）

### 测试

- 单测 232 个（+93）：CUDA 设备决策矩阵、黑边扫描、ROI 状态机、OCR 缓存 LRU/哈希、调度预算/降级、词表/纠错/候选、预处理 DSP、降级链状态机、健康巡检等
- 真机验收项（REQ-033 关闭保护/音频重连/DXGI 重建 + GPU 卸载实际生效）待用户执行

## [0.3.0] - 2026-08

视频文件导入（字幕优先 + ASR fallback + 关键帧 OCR）、字幕探测与融合体验优化（停止秒回/融合异步化/句起句尾时间戳）、采集链路质量优化（时间戳统一/引擎池并行/分窗转写/多帧投票/OCR 输入缩小）、实时活动面板。详见 [docs/versions/v0.3.0.md](docs/versions/v0.3.0.md)。

## [0.2.0] - 2026-08

系统实时捕获链路（WASAPI 环回 + DXGI 屏幕 + 流式 ASR + 字幕 OCR + 双源融合 + 会话）。详见 [docs/versions/v0.2.0.md](docs/versions/v0.2.0.md)。

## [0.1.0] - 2026-08

本地提取链路 MVP（ASR + OCR + 拼接 + 笔记）。详见 [docs/versions/v0.1.0.md](docs/versions/v0.1.0.md)。

[0.4.0]: https://github.com/Aparencia/Entropydecrease/tree/dev
