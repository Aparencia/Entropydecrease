# 技术债清单（权威：2026-08-20 二轮滚动——v0.7.5/v0.7.6 批次后）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-20 一轮清单滚动（其源为 2026-08-19 十六轮清单）+ v0.7.5 会话转
> 笔记规则净化（REQ-162~176，提交 14d4843/f2efab9）+ v0.7.6 笔记纯本地结构渲染
> （REQ-177~181，提交 974343b/4edb5db，1131 单测全绿）+ 新增代码七维审查即修
> （refactor 4dbafdf + fix 84c867f + docs fb40c1e，见"今日已偿"）。

## 未偿债务（逐笔核验）

| ID | 摘要 | 备注 |
|----|------|------|
| TD-040 | tauri.conf.json bundle.resources 未含 ffmpeg——生产安装包无捆绑 ffmpeg（v0.3.0 审查，2026-08-18） | carried（deliberate 有意不修）：resources glob 对缺失目录构建失败；捆绑 ffmpeg（~80MB）与安装包体积权衡留待体积策略；开发期用 download-ffmpeg.ps1 + PATH 覆盖。二轮核验（v0.7.6）：未涉及模型分发/捆绑，保持 carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110 图像流存储层/REQ-123 步骤图卡配图/REQ-088 图注影子层）；ImageStreamStore 零生产调用 | carried：接线点明确（live_frame_process 帧归档处创建 + record；analysis 产物模板消费 step_frames），待 M3 平台图像后续迭代接线。二轮核验：v0.7.5/0.7.6 未涉及图像流存储，保持 |
| TD-2026-08-19-E | 前端未接入：search_ocr_blocks（REQ-133 图内检索入口）与 model_disk_overview（REQ-131 磁盘占用面板）命令已注册但无 UI 调用 | carried：待前端迭代接入（SessionsPage 搜索框可复用）。二轮核验：v0.7.6 未涉前端接入，保持 |
| TD-2026-08-19-F | detect_pause_icon 颜色统计对暗底+中央亮内容（深色幻灯片白字/投影幕布）可能误报暂停——与"保守不产假信号"声明矛盾 | carried：需形状约束（中央连通亮块/双竖杠）或结合画面变化（diff_pass）；真机播放器样本校准计划保留。二轮核验：未涉及，保持 |
| TD-2026-08-19-G | db_ocr_search 只搜最近 500 会话静默截断 + image_path_for 恒返回固定路径不校验存在性 | carried：全库扫描量级控制（500 会话上限可接受，注释注明）；图路径由前端加载降级（诚实）。二轮核验：未涉及，保持 |

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

## 今日新登记 open（审查观察，暂不修）

| ID | 摘要 | 处置 |
|----|------|------|
| TD-2026-08-20-A | preview_session_note/convert_to_note 为 async 命令但主体同步执行，v0.7.6 起叠加 analyze_session_opt 全量分析（章节/术语/重点/练习/书面化）——千段长会话阻塞 IPC 线程；review_text_filter 已有 spawn_blocking 先例 | open（低）：当前会话量级可接受；长会话性能专项时按 review_text_filter 模式改造（数据装载/过滤/分析迁 spawn_blocking） |

## 观察项（登记不立债，保持跟踪）

| ID | 摘要 | 处置 |
|----|------|------|
| （观察 1） | apply_note_structure 构造 SessionDetail 时对 segments/ocr_blocks 全量 clone（千段会话每次预览/转换 2 次拷贝） | 量级为 MB 级拷贝，毫秒级成本；若长会话分析改 spawn_blocking（TD-A）时一并评估借用形态 |
| （观察 2） | render_note_structure 在无章节/无术语时仍重建整篇 markdown（逐字节一致但白算） | 正确性已验证（黄金测试 M2）；如需优化可加"无结构数据早退"（与全关早退同模式），收益微小 |
| （观察 3） | 前端统计卡未展示 titled_chapters（有标题命中的章节数）——仅展示章节总数/词汇表数 | 展示面可后续迭代补（前端一行事）；数据已随 FilterStats 落库 |
