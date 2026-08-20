# 技术债清单（权威：2026-08-20 四轮滚动——模型接入/自动化配置/课堂助手接线盘点后）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：三轮清单滚动（v0.7.7 结构图批次后）+ 模型接入全景盘点
> （speaker_engine/streaming_asr/ocr/structure_models/model_downloader 等模块核验，
> 证据见会话盘点输出）+ 四轮审查（无新增代码——f9c9638 后零变更，沿用三轮结论）。

## 未偿债务（逐笔核验；carried 仅留 ID + 一行摘要）

| ID | 摘要 |
|----|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡，开发期脚本+PATH 覆盖）；四轮核验未涉及，保持 |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088）；四轮核验：结构图存储独立于图像流，保持 |
| TD-2026-08-19-F | detect_pause_icon 暗底+中央亮内容可能误报暂停（与"保守不产假信号"矛盾）；四轮核验未涉及，保持 |
| TD-2026-08-19-G | db_ocr_search 500 会话静默截断 + 图路径不校验存在性（量级控制可接受+前端降级）；四轮核验未涉及，保持 |

## 今日已偿（v0.7.6 审查即修，可经代码/提交验证）

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| （审查 H1） | AI 复核路径（review_text_filter）未接结构渲染层——复核后预览丢失章节标题/词汇表块，与 preview_session_note/session_to_note 输出不一致（REQ-081 单一管线三出口契约违约） | apply_note_structure 提升 pub(crate)，review_text_filter 两返回点前补调用（与落库同函数同口径）；提交 84c867f |
| （审查 H2） | commands_session.rs 611 行 >600 硬拆阈值（v0.7.6 增 69 行致 542→611，AGENTS.md §3 不允许豁免）+ 豁免登记过期（登记 ~494） | 笔记转换管线（原料装载/结构渲染/单条转换/批量编排/预览）拆至 commands_session_note.rs（240 行 ≤300）；commands_session 回归 ~357 行并重新登记；lib.rs 按定义模块注册；提交 4dbafdf |
| （审查 M1） | glossary_max_terms=0 语义：.max(1) 使 0→1 条，与"0=关闭"直觉相悖 | 0 = 不输出词汇表块（条件加 >0 守卫），补单测 glossary_max_terms_zero_disables_block；提交 84c867f |
| （审查 M2） | 零回归护栏盲区：默认配置 + 无章节/无术语（口播档案最常见路径）无逐字节断言——仅 contains 断言 | 黄金测试 session31_structure_empty_data_is_byte_identical（真实管线产物 + 默认配置空结构 → 逐字节一致）；提交 84c867f |
| （审查 L1） | structure_note_tests.rs 死代码 helpers（env/_screen_placeholder/_payload_placeholder——"下游接线将使用"理由已过期，接线已落地仍未被用） | 删除三个 allow(dead_code) helpers + imports 清理；提交 84c867f |
| （审查 L2） | 行数豁免登记过期：commands_session ~494（实际 611）、note_filter ~423（实际 ~560）、缺 structure_note_tests/golden_tests/commands_ai 登记 | 登记同步：commands_session ~357 + commands_session_note ~240 新增 + note_filter ~560 + structure_note_tests ~415 + note_filter_golden_tests ~390 + commands_ai ~337；提交 fb40c1e |
| （TD-B） | 术语锚点 first_occurrence_ms 大小写敏感子串匹配——短术语（如 "AI"）可能锚到无关段或漏锚 | word_boundary_contains 词边界 + 内部大小写折叠（汉字前后不设限）；5 个新单测；提交 1b24168 |
| （TD-C） | apply_note_structure 中 db.list_events 错误静默吞掉——事件缺失时章节检测回退 OCR/gap 近似（诚实降级），但无日志线索 | match + eprintln（purify_config 同模式），降级行为不变；提交 f8be4d3 |
| （TD-E） | 前端未接入 search_ocr_blocks（REQ-133 图内检索）与 model_disk_overview（REQ-131 磁盘占用） | 会话列表搜索框新增「画面」模式（图搜：命中行带时间/屏区间/📷 标记，点击跳详情）+ 模型设置面板挂 ModelDiskPanel（总占用+明细+版本徽标）；提交 5147d85 |
| （三轮审查 R1） | structure_capture 预算耗尽处理：`Err(_)` 吞所有错误——单区域编码/IO 失败被误判预算耗尽，终止整个会话后续捕获 | 预算前置检查（remaining_budget）拦截 + 单区域失败仅 eprintln 继续；提交 bca36da |
| （三轮审查 R2） | 删除结构图顺序：先删 DB 记录后删文件——文件删除失败时记录已删、孤儿文件残留不一致 | db_structures 分离 get_structure_image 查询；命令层先删文件后删记录（失败时记录保留可重试）；提交 bca36da |
| （三轮审查 R3） | 手动捕获屏定位按 screen_id——旧数据聚类屏 screen_id 全 NULL，多聚类屏时匹配错屏 | 命令参数改 first_seen_ms 精确定位（前端 BoxSelectOverlay/SessionDetailPanel 同步）；提交 bca36da |
| （三轮审查 R4） | BoxSelectOverlay 单击未拖动（初始占位 w=h=1）→ 确认浮层全屏框选——误触保存整屏图 | moved 标志区分"拖拽/单击"（单击忽略）；提交 bca36da |
| （三轮审查 R5） | 手动捕获 <32px 错误消息误导（越界钳制后报"过小"） | 消息改"框选区域无效（过小或超出画面边缘）"；提交 bca36da |
| （三轮审查 R6） | rgb_to_bgra 在 structure_capture 与 commands_structures 重复实现 | structure_capture 提 pub(crate) 复用，命令层删除重复；提交 bca36da |
| （三轮审查 R7） | BoxSelectOverlay 拖出框外残留虚线框（onMouseLeave 仅清 dragging） | onMouseLeave 同时清 box 残留；提交 bca36da |
| （三轮审查 R8） | StructureImageSection 用 error state 显示非错误信息（重跑无新增显示红色） | info state 分离（错误红/信息灰）；提交 bca36da |
| （三轮审查 R9） | structure_capture_tests 冗余行 `let _: FrameGrid = grid;` | 删除；提交 bca36da |

## 今日新登记 open（审查观察，暂不修）

| ID | 摘要 | 处置 |
|----|------|------|
| TD-2026-08-20-A | preview_session_note/convert_to_note 为 async 命令但主体同步执行，v0.7.6 起叠加 analyze_session_opt 全量分析（章节/术语/重点/练习/书面化）——千段长会话阻塞 IPC 线程；review_text_filter 已有 spawn_blocking 先例 | open（低）：当前会话量级可接受；长会话性能专项时按 review_text_filter 模式改造（数据装载/过滤/分析迁 spawn_blocking） |
| TD-2026-08-20-D | 说话人模型（wespeaker）无应用内一键下载——仅有 scripts/download-speaker-model.ps1；SpeakerSwitchCard 只能提示用户手动跑脚本（对照：流式/结构模型均有应用内下载命令+UI） | open（中）：建议按 structure_models 模式加 speaker 下载命令+UI 入口（speaker_engine.rs 路径约定 speaker-embedding/model.onnx，无下载器） |
| TD-2026-08-20-E | 就绪清单（ReadyCheckCard）不含说话人/标点模型——health_status 的 missing_models 只查流式四件套 + SenseVoice（commands_diag.rs:53-67）；说话人模型缺失到会话详情才由 SpeakerSwitchCard 提示 | open（低）：health_status 增查 speaker/punctuation 模型文件存在性，就绪清单加两项 |
| TD-2026-08-20-F | 标点恢复模型（models/punctuation/model.int8.onnx）缺失时懒加载静默降级（streaming_asr.rs:132-140），无任何提示；仅 download-punctuation.mjs 脚本兜底 | open（低）：随 TD-E 一并处理（health_status 查文件 + 提示）；缺失不影响主链路（无标点降级） |

## 观察项（登记不立债，保持跟踪）

| ID | 摘要 | 处置 |
|----|------|------|
| （观察 1） | apply_note_structure 构造 SessionDetail 时对 segments/ocr_blocks 全量 clone（千段会话每次预览/转换 2 次拷贝） | 量级为 MB 级拷贝，毫秒级成本；若长会话分析改 spawn_blocking（TD-A）时一并评估借用形态 |
| （观察 2） | render_note_structure 在无章节/无术语时仍重建整篇 markdown（逐字节一致但白算） | 正确性已验证（黄金测试 M2）；如需优化可加"无结构数据早退"（与全关早退同模式），收益微小 |
| （观察 3） | 前端统计卡未展示 titled_chapters（有标题命中的章节数）——仅展示章节总数/词汇表数 | 展示面可后续迭代补（前端一行事）；数据已随 FilterStats 落库 |
