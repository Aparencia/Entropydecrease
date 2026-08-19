# 技术债清单（权威：2026-08-19，十四轮滚动——v0.7.0 全量交付 + 新增代码审查后）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：九轮清单滚动 + v0.7.0 开发（M0-M3，24 提交）——TD-040 维持 carried（deliberate 有意不修）。
> 十三轮滚动（v0.7.0 全量代码建设 + 新增代码七维审查，审查即修 12 项，提交 952386b + 3a97483）：
> 已偿 12 笔（本轮审查发现即修复）；新登记 open 观察项 4 笔（见下）。
> 十四轮补记（信号域审查收尾 + 存储域遗留）：即修 6 笔（提交 87a3277 + 9a0c82e——
> MEDIUM-5/6/7/8/9 五项 + image_crop 注释更正）；新登记观察项 12 笔（信号域 low 5
> + 存储域遗留 7，见下）。

## 未偿债务

| ID | 摘要 | 备注 |
|----|------|------|
| TD-040 | tauri.conf.json bundle.resources 未含 ffmpeg——生产安装包无捆绑 ffmpeg（v0.3.0 审查，2026-08-18） | carried（deliberate 有意不修）：resources glob 对缺失目录构建失败；捆绑 ffmpeg（~80MB）与安装包体积权衡留待体积策略；开发期由 download-ffmpeg.ps1 + PATH 覆盖（ADR-008 风险项，保持观察）。十次核对（2026-08-19）：v0.7.0 全量代码（模型注册表/备份/存储档位）未涉模型分发/捆绑，维持 carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110 图像流存储层/REQ-123 步骤图卡配图/REQ-088 图注影子层）：ImageStreamStore 零生产调用——跟练/白板/编程等 ImageFirst 档案只放宽图集预算，时间轴帧序列未落库，步骤卡"有卡无图"，图注无处落（v0.7.0 审查发现，medium） | open：REQ-110/123/088 验收依赖；接线点明确（live_frame_process 帧归档处创建 ImageStreamStore + record，analysis 产物模板消费 step_frames），待 M3 平台图像后续迭代接线；接线前不新增债务（机制先行已登记豁免） |
| TD-2026-08-19-E | 前端未接入：search_ocr_blocks（REQ-133 图内检索入口）与 model_disk_overview（REQ-131 磁盘占用面板）命令已注册但无 UI 调用——后端就绪用户不可达（v0.7.0 审查发现，medium） | open：REQ-133/131 验收依赖前端入口（SessionsPage 搜索框可复用）；待前端迭代接线 |
| TD-2026-08-19-F | detect_pause_icon 颜色统计对"暗底+中央亮内容"（深色幻灯片白字/投影幕布）可能误报暂停——与"保守不产假信号"声明矛盾（v0.7.0 审查发现，medium） | open：需形状约束（中央连通亮块/双竖条）或结合画面变化（diff_pass）；真机播放器样本校准计划保留（REQ-125 验收含"失败则降级"条款） |
| TD-2026-08-19-G | db_ocr_search 只搜最近 500 会话静默截断 + image_path_for 恒返回约定路径不校验存在性（v0.7.0 审查发现，low） | open：全库扫描量级控制（500 会话上限可接受，注释注明）；图路径由前端加载降级（诚实） |

## 今日已偿（审查发现即修复，全部可经代码核验）

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| （审查 C1） | cer_bench bin 无法编译——lib.rs 私有模块（mod cer/audio_preprocess）使 bin 访问 E0603，**完整 cargo test 失败**（critical） | pub mod cer/audio_preprocess；修复提交 952386b |
| （审查 H1） | 前台时间线未闭合实践段被零长过滤整体丢弃（监控器"变化才写"→ 序列在离开时刻终止 → 未闭合段 end=离开时刻 → 零长 → 丢弃；与"不丢数据"注释矛盾）（high） | practice_segments 增加 session_end_ms 参数（analysis 从段数据推导）+ 回归测试 3 个；修复提交 952386b |
| （审查 H2） | 前台基线反相——target_hwnd 传入但 observe 未用；录制启动瞬间应用窗口在前台 → 首事件=应用窗口 → 实践段反相（high） | 首观测先落 target 基线事件再落当前观测；修复提交 952386b |
| （审查 H4） | 固定音跨块泄漏——通知音 0.3-0.8s=2-4 块，首块抑制后计数归零，延续块不抑制进 ASR（high） | suppressing 粘滞态（语音块复位）+ 跨块延续回归测试 2 个；修复提交 952386b |
| （审查 H2-b） | backup_restore 对活 DB 改名——Windows 共享冲突失败 / Unix 活连接写旧 inode 数据分裂（high） | 改名失败明确报错（引导关闭应用）+ 解压失败回滚改名；修复提交 952386b |
| （审查 M1） | detect_language `import ` 排 python 首位——Java/JS/TS import 全误判 python（medium） | 按语言特异签名重排判定顺序；修复提交 3a97483 |
| （审查 M3） | merge_nearby 严格 > 优先级——同优先级（双口令）后到边界静默丢弃，快节奏跟练丢步骤卡（medium） | `>=` 保留后者（最新指令语义）；修复提交 3a97483 |
| （审查 M4） | Coding 档案 order 冲突——lecture_blocks + code_blocks 各自从 order=0，DB 按 block_order 排序重复（medium） | code_blocks order 偏移 lecture 块数；修复提交 3a97483 |
| （审查 M5） | ProfileDetector needs_confirmation=true 仍自动预选生效——低置信档案绕过确认闭环（medium） | 需确认时不自动 onProfileChange（UI 提示用户确认）；修复提交 3a97483 |
| （审查 M1-b） | 事件表三类事件无写入方——VolumeSurge/VadSegment/Clipboard 设计文档承诺写入未实现（REQ-108 范围缺失）（medium） | loop 补 VadSegment（Final 顺带）+ VolumeSurge（段差≥0.3，与 highlight 同口径）；clipboard monitor 传入 Db 写 Clipboard 事件（30 字预览）；修复提交 952386b |
| （审查 M6） | 章节检测 `events.is_empty()` 全量判定——只有非章节类事件时会话丢弃 OCR/gap 近似且事件路径稀疏（medium） | 改为按类型判定（仅 FrameSwitch/LongSilence 存在时走事件路径）；修复提交 952386b |
| （审查 M2-b） | 事件容量守卫非事务——INSERT 失败时 DELETE 已提交，最旧事件丢失（medium） | add_event 包单事务（删最旧+插入原子）；修复提交 952386b |
| （审查 L3） | step_boundaries 缺 #[serde(default)]——与同批 practice_segments/player_actions 不一致（旧 JSON 反序列化兼容风险）（low） | 补 serde(default) 保持一致；修复提交 10e36fe |
| （审查 L4） | 豁免登记行数过期（artifact_templates ~529→501/analysis ~376→344/video_profile ~315→394）（low） | line-limit-exemptions.md 行数刷新；修复提交 10e36fe |
| （审查 L5） | 陈旧注释——video_profile.rs"保持 ≤300 行"（实际 394 已豁免）、ProfileDetector"v0.5.0"标签（v0.7.0 十二档案）（low） | 注释更新；修复提交 10e36fe |
| （审查 L7） | 有卡无图步骤卡导出 Markdown 空图引用 `![步骤]()`——笔记坏图（low） | image 空时输出纯文本步骤行；修复提交 10e36fe |
| （审查 L8） | code_blocks `_detail/_analysis` 死参无说明（low） | 注释注明保留理由（统一模板签名）；修复提交 10e36fe |
| （审查 MEDIUM-5） | 事件容量守卫 FIFO 删最旧——长会话可误删前台切换基线事件 → practice_segments 目标窗口错位（medium） | 分级删除：优先删高频噪声事件（frame_switch/long_silence/volume_surge），无高频才回退删最旧；回归测试（基线保留 + 最旧高频被删）；修复提交 87a3277 |
| （审查 MEDIUM-6） | 播放器检测两处时滞：① latest_frame 仅非字幕区 tick 刷新——字幕区 tick（语音活跃期主路径）不刷新，帧源滞后 5-10s；② 检测用采样块开头旧时刻，OCR 耗时 + 5s 周期叠加使暂停事件时戳滞后（medium） | ① 任意 tick 均刷新缓存（此位置 frame 未裁剪必为全帧，1s 粒度 memcpy 成本可忽略）；② 检测时现取 check_now_ms；修复提交 87a3277 |
| （审查 MEDIUM-7） | WASAPI 路由探针测试依赖真实音频设备——无设备环境 count=-1 必失败，违反测试隔离（medium） | 测试改 #[ignore] + ENTROPY_WASAPI_PROBE=1 env 门控（真机手动验证）；修复提交 87a3277 |
| （审查 MEDIUM-8） | VAD 阈值诊断无新鲜度信息——无活动会话时 current=上次会话残留值，诊断面板误读为当前口径（medium） | 槽记录发布来源会话 id（AtomicI64）+ is_live 判定（发布会话=活动会话）；commands_diag 填充 + 测试更新；修复提交 87a3277 |
| （审查 MEDIUM-9） | 播放器首次检测写假 Pause——录制开始前已暂停的视频，首轮 paused=true ≠ 初始 false 写非转换事件（medium） | player_state_initialized 标记：首轮仅记录基线状态不写事件；修复提交 87a3277 |
| （审查 H4-storage） | image_crop 模块注释虚称"命令层已接线"——实际零生产调用（影子层）（low） | 注释更正为如实声明（接线点 = image_store 调用侧，REQ-134 IMG-2 验收时接线）；修复提交 9a0c82e |

## 观察项（登记不立债，保持追踪）

| ID | 摘要 | 处置 |
|----|------|------|
| （审查 L1） | disable_asr 无消费点（机制预留） | 已注释（video_profile.rs "机制预留；引擎池只跳过消费端"）；接线计划随 REQ-130 后续档案 |
| （审查 L2） | 导入链路 disable_ocr 门控不可达——import_video 不接收 profile，播客类档案经文件导入仍跑 OCR | 代码注释已说明"前端传 profile 后自动生效"；前端 VideoImportPanel 补 profile 参数留待后续迭代 |
| （审查 L6） | 新旧档案检测关键词重叠（HandsOn"跟练/实战/教程"与 FollowAlong/Coding/GameTutorial 重叠；Interview"播客"与 Podcast 重叠） | 当前靠 CONFLICT_GAP 兜底（低置信需确认）；关键词去重/权重调优留待真机样本校准（REQ-043 记忆偏好闭环兜底） |
| （审查 L9） | merge_lines 滚动代码窗口行重复（帧 1-20 行/帧 5-25 行时中间重复） | 已知启发式局限（静态代码帧为主）；行集合重叠率切段留待代码档案真机验证 |
| （审查 L10） | 候选列表恒 12 项（含 0 分项噪音） | 前端展示 filter score>0 留待 UI 迭代（当前 0 分项 score=0 不误导——显示"0%"） |
| （审查 L11） | 前端 types.ts SessionDetail 缺 events/region_kind 字段（serde 契约漂移，M1.5 起） | 前端当前不消费 events 字段（详情页未显示信号事件），类型补齐随前端迭代 |
| （审查 S-L10） | foreground_switch 事件载荷只存裸 hwnd（无窗口标题）——消费端辨识度低 + 句柄可枚举隐私面（low） | 事件为本地落库（数据不出本机）；窗口标题增强随 REQ-128 时间线 UI 迭代（标题截断 + 敏感词策略先行） |
| （审查 S-L11） | 中断段 gap 用句首时刻（应句尾）——插播/暂停间隙时长统计偏差（low） | 当前 gap 语义="前句句首到本句句首"（含句长），统计口径注释已注明；切句尾口径随周报聚合（V1.0 A4）一并校准 |
| （审查 S-L12） | 播放器检测 5s 节流粒度——<5s 暂停丢失（low，已接受） | 节流换成本（全帧 bgra→rgb + 图标检测 5s 一次）；REQ-125 验收含"失败则降级"条款，真机样本校准保留 |
| （审查 S-L13） | publish(NaN) 位模式原样透传共享槽——诊断面板可能读到 NaN（low） | adaptive_vad 已钳制（next_threshold 输出恒有效）；位模式往返测试覆盖 NaN 不崩溃（防御性记录） |
| （审查 S-L14） | hwnd 句柄复用——窗口销毁后系统可能复用句柄，前台判定误中（low） | 录制目标窗口常驻场景（销毁即 window-lost 事件）；前台判定带窗口存在性复核留待真机场景观察 |
| （审查 ST-L1） | LongSilence 事件 duration_ms 恒 3000——silent_blocks 计满 15 即触发且停止递增，更长静音载荷失真（low） | 触发语义="连续静音 ≥3s"（3000 为最小保证值）；真实时长续报（静音持续中周期刷新）随容量守卫分级后评估 |
| （审查 ST-L2） | ocr_confusion 先前去重按 `from` 键——同一来源多次"误识"可产生冲突 to 值（low） | 消费端按"最新记录胜出"语义读取；冲突策略（合并/最近）随 OCR 校准数据积累再定 |
| （审查 ST-L3） | REQ-131"可回退"仅查询无动作——model_disk_overview 只读展示（low） | 前端面板（TD-2026-08-19-E 接线时）配套"清理"动作；验收条款含前端迭代 |
| （审查 ST-L4） | model_disk_overview 同步全树扫描主线程——诊断命令（low） | 量级小（数百文件）+ 前端未接线无感知；接线时改异步扫描（spawn_blocking） |
| （审查 ST-L5） | 备份恢复 zip 无大小上限 + .pre-restore 覆盖既有 + 整文件内存读——zip 炸弹/磁盘填满风险（low，防御性） | 本地自恢复场景威胁面低（攻击者需先落恶意备份文件再诱导恢复）；恢复前大小上限校验 + 流式解压留待备份安全加固迭代 |
| （审查 ST-L6） | log_redact 混合文本阈值绕过——中英混排低于阈值比例时整段不脱敏（low） | 日志本地留存场景；脱敏策略（分段判定/正则兜底）随日志安全加固迭代 |
| （审查 ST-L7） | 事件写入错误 `let _ =` 吞掉（frame_switch/clipboard 等实时链路）——丢事件不丢会话（low） | 降级语义已注明（实时链路不阻塞主流程）；错误计数可见化（诊断统计）随诊断面板迭代 |

## 登记规则

- 类型四分类：有意（deliberate）/ 无意（inadvertent）/ 环境变化（environment）/ 腐化（bit rot）
- 优先级：P0 立即处理 / P1 近期 / P2 排期 / P3 观察
- 偿还时在"今日已偿"登记，状态改 closed；代码未提交的偿还注"待 commit"
- 行数豁免登记见 [standards/line-limit-exemptions.md](../../standards/line-limit-exemptions.md)
