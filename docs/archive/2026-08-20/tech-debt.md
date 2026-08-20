# 技术债清单（权威：2026-08-20 五轮滚动——技术债偿还批次后）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：四轮清单滚动（模型/前端接线盘点后）+ 技术债偿还批次
> （TD-A/D/E/F/G/H/I 七笔全部 closed：0336b51/1a88581/5969f55，见"今日已偿"）。
> 五轮核验：open 7 笔全部偿清——台账 open 归零；carried 4 笔保持。

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
| （盘点清偿 S1） | speaker_change.rs `#![allow(dead_code)]` 与"V1.0 接线时移除"注释已过时——v0.7.2（REQ-153）已被 commands_speaker.rs 实际接线 | 移除过时豁免 + 注释更新（盘点核验发现）；提交 56e1133 |
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

## 今日新登记 open

**五轮核验（2026-08-20 技术债偿还批次）：open 全部偿清——台账 open 归零。**

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| TD-2026-08-20-A | 会话→笔记三命令（session_to_note/batch/preview）async 但主体同步执行——千段长会话阻塞 IPC 线程 | 三命令迁 spawn_blocking（AppState clone 移入闭包，review_text_filter 先例）；提交 1a88581 |
| TD-2026-08-20-D | 说话人模型（wespeaker）无应用内一键下载 | 新增 speaker_download.rs 下载器（双镜像回退/.part 原子写/进度事件）+ download_speaker_model/speaker_model_download_status 命令 + SpeakerSwitchCard 下载按钮（进度展示、完成自动重分析）；提交 0336b51 |
| TD-2026-08-20-E | 就绪清单（ReadyCheckCard）不含说话人/标点模型 | health_status 增查 speaker/punctuation 文件 + ReadyCheckCard 加两项（缺失明细提示）；提交 0336b51 |
| TD-2026-08-20-F | 标点恢复模型缺失静默降级无提示 | 随 TD-E 一并（health_status 查文件 + 就绪清单提示"无标点降级"）；提交 0336b51 |
| TD-2026-08-20-G | 备份/恢复（REQ-107 TRUST-1）无 UI 入口 | BackupPanel（创建备份 + dialog 选文件恢复 + 覆盖确认 + 重启提示）；提交 5969f55 |
| TD-2026-08-20-H | 音频落盘状态/清理 UI 承诺未兑现 | AudioStoragePanel（状态/清理/未启用提示）挂课堂助手设置区；提交 0336b51 |
| TD-2026-08-20-I | live:window-lost 无前端监听 | ClassroomPage 监听出一次性横幅（可关闭，停止会话自动清除）；提交 0336b51 |

## 观察项（登记不立债，保持跟踪）

| ID | 摘要 | 处置 |
|----|------|------|
| （观察 1） | apply_note_structure 构造 SessionDetail 时对 segments/ocr_blocks 全量 clone（千段会话每次预览/转换 2 次拷贝） | 五轮核验：拷贝现位于 spawn_blocking 线程内（TD-A 后）不再阻塞 UI；消除拷贝收益微小，保持跟踪 |
| （观察 2） | render_note_structure 在无章节/无术语时仍重建整篇 markdown（逐字节一致但白算） | 正确性已验证（黄金测试 M2）；如需优化可加"无结构数据早退"（与全关早退同模式），收益微小 |
| （观察 3） | 前端统计卡未展示 titled_chapters（有标题命中的章节数）——仅展示章节总数/词汇表数 | 展示面可后续迭代补（前端一行事）；数据已随 FilterStats 落库 |
| （盘点观察 4） | VAD 无模型——实际为 RMS 能量阈值 + 自适应 P10 分位数（vad_adaptive.rs），与 AGENTS.md"Silero VAD"表述不符 | 文档/规范差异：更新 AGENTS.md §2 表述或补 Silero 模型接入（产品未承诺具体模型，倾向改文档） |
| （盘点观察 5） | 说话人卡片与结构图捕获入口仅在会话详情页——课堂助手页停止后自动捕获但看不到结果 | 设计现状（消费端=会话页图库）；课堂助手页加结果提示可后续迭代 |
| （盘点观察 6） | 无"首启自动下载缺失模型"机制——下载全靠命令/脚本/ModelScope 缓存；app_setup 只做目录+捆绑同步 | 设计现状（应用内下载入口已齐备）；全自动首启下载留待分发策略决策 |
| （盘点观察 7） | 结构图捕获走纯规则版面分析（layout_analyzer），课后精修走模型版（pp-doclayout）——"双版面"并存、结果不互认 | 设计如此（实时轻量/课后重器）；统一口径需 ADR 决策 |
| （盘点观察 8） | 词级时间戳未暴露——sherpa-onnx Rust 包装未开 token timestamps 开关（asr.rs 返回 None） | 协议/提取函数已就位；待上游支持或换绑定 |
