# 技术债清单（权威：2026-08-19，十四轮滚动——课堂助手页面优化批次 + A/C 批新增代码审查后）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：十三轮清单滚动（v0.7.0 全量代码建设 + 七维审查，审查即修 12 项 952386b + 3a97483；补记轮 87a3277 + 9a0c82e 即修 6 项）+ 2026-08 课堂助手页面优化（窗口过滤/档案右移/模型状态/实时图片，0177a17~0099dff）+ A/C 批（硬暂停/VU/标记/直达/就绪清单，89a1b9e~eb315d3）+ 新增代码七维审查（2026-08-19）。
> 十四轮滚动（审查发现即修）：已偿 3 笔（提交 d390b3f——LiveImageStrip 节流/AudioLevelMeter 定时器/行数豁免更新）；已修待提交 3 笔（H/I/L，工作区与并行 P1-P3 混合，合入后核验 closed）；并行会话 P1-P3（停止即时/播放暂停驱动/引擎预热）工作区开发中未提交，合入后统一核验。

## 未偿债务

| ID | 摘要 | 备注 |
|----|------|------|
| TD-040 | tauri.conf.json bundle.resources 未含 ffmpeg——生产安装包无捆绑 ffmpeg（v0.3.0 审查，2026-08-18） | carried（deliberate 有意不修）：resources glob 对缺失目录构建失败；捆绑 ffmpeg（≥80MB）与安装包体积权衡留待体积策略；开发期用 download-ffmpeg.ps1 + PATH 覆盖（ADR-008 风险项，保持观察）。多次核对（2026-08-19）：v0.7.0 全量代码未涉模型分发/捆绑，保持 carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110 图像流存储层/REQ-123 步骤图卡配图/REQ-088 图注影子层）：ImageStreamStore 零生产调用 | carried：接线点明确（live_frame_process 帧归档处创建 + record，analysis 产物模板消费 step_frames），待 M3 平台图像后续迭代接线；接线前先修内部缺陷（深度审查 M4） |
| TD-2026-08-19-E | 前端未接入：search_ocr_blocks（REQ-133 图内检索入口）与 model_disk_overview（REQ-131 磁盘占用面板）命令已注册但无 UI 调用 | carried：待前端迭代接入（SessionsPage 搜索框可复用） |
| TD-2026-08-19-F | detect_pause_icon 颜色统计对"暗底+中央亮内容"（深色幻灯片白字/投影幕布）可能误报暂停——与"保守不产假信号"声明矛盾 | carried：需形状约束（中央连通亮块/双竖杠）或结合画面变化（diff_pass）；真机播放器样本校准计划保留（REQ-125 验收后失败则降级条款）；并行 P2 自动暂停实现依赖该检测，合入后重点核验 |
| TD-2026-08-19-G | db_ocr_search 只搜最近 500 会话静默截断 + image_path_for 恒返回固定路径不校验存在性 | carried：全库扫描量级控制（500 会话上限可接受，注释注明）；图路径由前端加载降级（诚实） |
| TD-2026-08-19-H | WASAPI 暂停恢复残留缓冲未清空——恢复后以补偿时间戳混入暂停前音频（内容错位） | 修复已落工作区（audio_loopback.rs 恢复边沿清空缓冲，审查即修）；待提交——与并行 P1-P3 工作区混合，待并行批次合入后核验 closed |
| TD-2026-08-19-I | session:fusion-failed 后残留"✅ 融合完成"直达卡片（fusing 已预置 id）——失败误报完成 | 修复已落工作区（ClassroomPage fusion-failed 清除 fusedSessionId）；待提交核验（同上） |
| TD-2026-08-19-L | ClassroomPage.tsx 641 行 >600 硬上限（2026-08 A/C 批增长） | 硬拆已落工作区（ClassroomRightPane 右栏 + MaterialInputPanel 素材/提取，回归 548 行登记豁免）；待提交核验（同上） |

## 今日已偿（审查发现即修，可经代码验证）

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| （审查·J） | LiveImageStrip 事件刷新无节流——live:ocr 一帧多块高频触发目录读（IPC 风暴风险） | 500ms 事件刷新节流合并；修复提交 d390b3f |
| （审查·K） | AudioLevelMeter 削波复位 setTimeout 无句柄清理——组件卸载（暂停/停止）后仍 setState | 定时器句柄化 + effect cleanup；修复提交 d390b3f |
| （审查·L4 延续） | line-limit-exemptions 行数过期：audio_loopback ~320→~430/live_session_loop ~313→~360/structure_models ~303→~320；live_session.rs 与 live_session_frame.rs 重新超 300 行 | 豁免登记行数刷新 + 重新登记与拆分计划；修复提交 d390b3f |
| （审查·A1 补漏） | 会话暂停跨会话残留（paused 标志/补偿时长）——新会话起始即暂停、时间戳偏移 | 并行会话已修（SessionPause::reset + start 时调用），工作区未提交，合入后核验 |
| （审查·A1 断句） | 暂停边沿"喂 100ms 静音"不足以触发 sherpa 端点规则——挂起句内容丢失风险 | 并行会话已修（flush_tail_and_persist + reset 重建流），工作区未提交，合入后核验 |

## 观察项（登记不立偿，保持跟踪）

| ID | 摘要 | 处置 |
|----|------|------|
| （审查·L1） | disable_asr 无消费点（机制预留） | 已注释（video_profile.rs "机制预留；引擎池只跳过消费端"）；接线计划随 REQ-130 后续档案 |
| （审查·L2） | 导入链路 disable_ocr 门控不可达——import_video 不接收 profile，播客类档案经文件导入仍跑 OCR | 代码注释已说明（前端传 profile 后自动生效）；前端 VideoImportPanel 补 profile 参数留待后续迭代 |
| （审查·L6） | 新旧档案检测关键词重叠（HandsOn"跟练/实操/教程"与 FollowAlong/Coding/GameTutorial 重叠；Interview"播客"与 Podcast 重叠） | 当前靠 CONFLICT_GAP 兜底（低置信需确认）；关键词去重/权重调优留待真机样本校准（REQ-043 记忆偏好闭环兜底） |
| （审查·L9） | merge_lines 滚动代码窗口行重复（第 1-20 行/第 5-25 行时中间重复） | 已知启发式局限（静态代码帧为主）；行集合重叠率切段留待代码档案真机验证 |
| （审查·L10） | 候选列表恒 12 项（含 0 分项噪音） | 前端展示 filter score>0 留待 UI 迭代（当前 0 分项 score=0 不误导——显示 0%） |
| （审查·L11） | 前端 types.ts SessionDetail 缺 events/region_kind 字段（serde 契约漂移，M1.5 起）；EventKind IPC 序列化 PascalCase 与 DB kebab-case 双表示 | 前端当前不消费 events 字段（详情页未显示信号事件），类型补齐随前端迭代；补类型时统一 `#[serde(rename_all="kebab-case")]`（对齐 DB 口径），保留 `#[serde(default)]` 兼容旧缓存 |
| （审查·S-L10） | foreground_switch 事件载荷只存 hwnd（无窗口标题）——消费端辨识度低 + 句柄可枚举隐私面 | 事件为本地落库（数据不出本机）；hwnd 载荷为隐私正面有意偏离（标题敏感，深度审查 L6 通过项）——设计文档载荷表待同步；窗口标题增强随 REQ-128 时间轴 UI 迭代（标题截断 + 敏感词策略先行） |
| （审查·S-L11） | 中断段 gap 用句首时刻（应句尾）——插入/暂停间隙时长统计偏差 | 当前 gap 语义="前句句首到本句句首"（含句长），统计口径注释已注明；切句尾口径随周报聚合（V1.0 A4）一并校准 |
| （审查·S-L12） | 播放器检测 5s 节流粒度——短于 5s 的暂停丢失（已接受） | 节流换成本（全帧 bgra→rgb + 图标检测 5s 一次）；REQ-125 验收后失败则降级条款，真机样本校准保留 |
| （审查·S-L13） | publish(NaN) 位模式原样透传共享槽——诊断面板可能读到 NaN | adaptive_vad 已钳制（next_threshold 输出恒有效）；位模式往返测试覆盖 NaN 不崩溃（防御性记录） |
| （观察·并行） | 并行会话 P1-P3（停止即时 drain/播放暂停驱动自动暂停/引擎预热）在未提交工作区开发中（live_session_prepare.rs 等 7 文件）——P2 自动暂停与手动暂停互斥语义、P3 前端 invoke 失败静默降级需验收 | 合入后按新增代码审查流程核验；本清单 H/I/L 待其合入后统一 closed |
| （观察·A1） | 暂停置位到捕获线程停采的窗口期（≤10ms）内音频仍被消费——暂停前真实内容，语义正确，无内容丢失 | 注释已说明；真机验证暂停边界转写完整性 |
| （观察·C1） | ReadyCheckCard 聚合 health_status/structure_model_status/ocr_device_status——OCR 引擎未启动时 ocr_device_status 返回内存态（可能误报就绪） | 引擎池常驻（setup 即启动），实际不触发；如出现可加 asr_alive/ocr_alive 联合判定 |
| （观察·窗口过滤） | bilibili 首页标题变体（"bilibili - 哔哩哔哩"等）未全部覆盖——未命中首页模式时仍进推荐 | 首页模式表可扩展（window_filter.rs SITE_HOMEPAGE_TITLES）；真机样本校准保留 |
