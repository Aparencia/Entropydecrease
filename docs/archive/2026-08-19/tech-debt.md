# 技术债清单（权威：2026-08-19，十三轮滚动——v0.7.0 全量交付 + 新增代码审查后）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：九轮清单滚动 + v0.7.0 开发（M0-M3，24 提交）——TD-040 维持 carried（deliberate 有意不修）。
> 十三轮滚动（v0.7.0 全量代码建设 + 新增代码七维审查，审查即修 12 项，提交 952386b + 3a97483）：
> 已偿 12 笔（本轮审查发现即修复）；新登记 open 观察项 4 笔（见下）。

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

## 登记规则

- 类型四分类：有意（deliberate）/ 无意（inadvertent）/ 环境变化（environment）/ 腐化（bit rot）
- 优先级：P0 立即处理 / P1 近期 / P2 排期 / P3 观察
- 偿还时在"今日已偿"登记，状态改 closed；代码未提交的偿还注"待 commit"
- 行数豁免登记见 [standards/line-limit-exemptions.md](../../standards/line-limit-exemptions.md)
