# 技术债清单（权威：2026-08-20，v0.7.2 课堂助手深化批次滚动——十七轮后）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-19（十七轮）清单滚动 + v0.7.2 课堂助手四深化批次合入（REQ-148~154：
> 三连体验/信息面板/合集联动/说话人分离/断句自适应，提交 9097e8f~5159bee，1016
> 单测全绿）+ 新增代码七维审查（提交 751b9c6：五处即修——平台表单一来源/中文数字
> 判定去重/暂停后语速基准重置/识别中拆行标点过滤/讲者分析异步化+自动暂停探测）。

## 未偿债务

| ID | 摘要 | 备注 |
|----|------|------|
| TD-040 | tauri.conf.json bundle.resources 未含 ffmpeg——生产安装包无捆绑 ffmpeg（v0.3.0 审查，2026-08-18） | carried（deliberate 有意不修）：resources glob 对缺失目录构建失败；捆绑 ffmpeg（~80MB）与安装包体积权衡留待体积策略；开发期用 download-ffmpeg.ps1 + PATH 覆盖（ADR-008 风险项，保持观察）。多次核对（2026-08-20）：本次未涉及模型分发/捆绑，保持 carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110 图像流存储层/REQ-123 步骤图卡配图/REQ-088 图注影子层）；ImageStreamStore 零生产调用 | carried：接线点明确（live_frame_process 帧归档处创建 + record；analysis 产物模板消费 step_frames），待 M3 平台图像后续迭代接线；接线前先修内部缺陷（深度审查 M4）；本次核对：v0.7.2 未涉及，保持 |
| TD-2026-08-19-E | 前端未接入：search_ocr_blocks（REQ-133 图内检索入口）与 model_disk_overview（REQ-131 磁盘占用面板）命令已注册但无 UI 调用 | carried：待前端迭代接入（SessionsPage 搜索框可复用）；本次核对：未涉及，保持 |
| TD-2026-08-19-F | detect_pause_icon 颜色统计对暗底+中央亮内容（深色幻灯片白字/投影幕布）可能误报暂停——与"保守不产假信号"声明矛盾 | carried：需形状约束（中央连通亮块/双竖杠）或结合画面变化（diff_pass）；真机播放器样本校准计划保留（REQ-125 验收后失败则降级条款）；本次核对：未涉及，保持 |
| TD-2026-08-19-G | db_ocr_search 只搜最近 500 会话静默截断 + image_path_for 恒返回固定路径不校验存在性 | carried：全库扫描量级控制（500 会话上限可接受，注释注明）；图路径由前端加载降级（诚实）；本次核对：v0.7.2 仅适配包装结构（行为未变），保持 |

## 今日已偿（核验 + 审查即修，可经代码验证）

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| （审查 R1） | 平台后缀表两处维护（series_detect::normalize_title 与 session_info::detect_platform 各 8 条，漂移风险） | 平台表统一为 `(suffix, name)` 单一来源；detect_platform 移入 series_detect（`pub use` 复用）；提交 751b9c6 |
| （审查 R2） | 中文数字判定重复定义（commands_session::is_cjk_num 与 series_detect::is_cjk_num_char） | course_of 改用 series_detect::is_cjk_num_char，删除本地副本；提交 751b9c6 |
| （审查 R3） | 暂停后首段与暂停前语速比较会跨暂停区间误判语速骤变（SpeechRateDrop 假事件） | 暂停边沿 flush 后重置 last_speech_rate=None；提交 751b9c6 |
| （审查 R4） | 识别中行按句读拆分的连续句读切出纯标点垃圾行（"结束。。"） | splitBySentence 过滤纯标点/空白段（hasText）；提交 751b9c6 |
| （审查 R5） | 讲者分析同步命令在千段长会话上阻塞 IPC 吞吐 + 自动暂停时播放器信息不探测（暂停态视频时长缺失） | analyze_session_speakers 改 async + spawn_blocking；probe_player_info 抽公共函数并在 auto_paused 轻量轮询接入；提交 751b9c6 |

## 观察项（登记不立债，保持跟踪）

| ID | 摘要 | 处置 |
|----|------|------|
| （观察 1） | 播放器信息探测 OCR 与主采样共享 OCR 引擎（10s 一次 ~0.2s，串行竞争可接受） | 注释已说明（probe_player_info）；真机观察是否影响采样节奏，如出现再节流调整 |
| （观察 2） | 讲者分析依赖 session-audio 保留期（30 天 + 磁盘预算清理后历史会话无法再分析） | 保留期语义与音频存档一致（诚实：音频没了分析自然不可用）；如需长期分析需延长保留或摘要缓存 |
| （观察 3） | 说话人 embedding 段 <0.5s 或模型 is_ready 不足的段跳过（音色向量不稳，误判比漏判更伤） | 注释已说明（speaker_engine MIN_SEGMENT_MS）；真机样本校准阈值保留 |
| （观察 4） | final 文本被判空（幻觉/纯标点）时后端不发 final 事件——前端无法感知新句边界，旧识别中行被新句覆盖 | 语义正确（该 utterance 内容本无效，丢弃合理）；如需更精细可加"句边界"事件，暂不需要 |
