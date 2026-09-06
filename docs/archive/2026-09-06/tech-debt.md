# 技术债清单（权威：2026-09-06）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-09-06（自 2026-09-05 滚动核验——未偿表 10 笔逐条核对：无新偿还条件发生（closed 行状态/哈希不变），无新增债务；v0.20.0/0.20.1 交付后新增代码六维审查即修不立债，见文末「2026-09-06」节）。

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） | 有意 | P2 | 2026-08-18 | carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088）——lib.rs 仅 mod 声明，接线条件未发生 | 有意 | P2 | 2026-08-19 | carried |
| TD-2026-08-24-A | lib.rs 超 600 硬限——实测 872（v0.19.3 模块/命令再 +5）；generate_handler 单点展开不可拆，拆分计划维持顺延 | 有意 | P1 | 2026-08-24 | carried |
| TD-2026-08-30-A | ClassroomPage 超 600 硬限——实测 745；拆分计划（LiveCaptureCard）未启动 | 有意 | P1 | 2026-08-30 | carried |
| TD-2026-08-30-B | note_filter 预存失败 2 笔（session29_live_ui_excluded_from_points / ocr_points_exclude_watermark_junk_and_dupes）——受限会话无法复跑全量；**2026-09-05 closed（3f6413e）**：根因=v0.12.0 正文源多态后无 asr 纯块输入走 OcrDirect（ocr_points 恒空/净化链极简），golden 断言的是旧视频路径语义——补占位 asr 段激活视频路径，全部断言天然满足；全量 2149 绿 | 预存 | P2 | 2026-08-30 | closed（3f6413e） |
| TD-2026-08-31-A | BrowserChrome 对 contenteditable 右键无应用内文本菜单——当前应用无该编辑面 | 有意 | P3 | 2026-08-31 | carried |
| TD-2026-08-31-B | window.prompt/confirm/alert 替换为应用内对话框——余 13 处未决 | 有意 | P2 | 2026-08-31 | carried |
| TD-2026-08-31-C | App.css 从未被引入（死样式）——引入改全局暗色观感，需单独裁决 | 环境变化 | P3 | 2026-08-31 | carried |
| TD-2026-09-05-A | 挂体系空体系「去建体系」引导按钮未交付（spec §2.5-4/需求池文本要求按钮跳体系页向导）——组件无跨页跳转通道；当前为空态提示文案 | 有意 | P3 | 2026-09-05 | closed（6b8f365） |
| TD-2026-09-05-B | 模型 disciplines 入参三形态契约漂移：Rust `disciplines:String`（JSON 数组字符串）vs knowledge.ts `string[]` vs 存量两调用点传数组（KnowledgeModelDialog/KnowledgeDetailPanel）——本批新路径已按 JSON 字符串修正，存量待统一 | 无意 | P3 | 2026-09-05 | closed（14e3988） |

## 今日审查即修（不立债，四批提交）

审查基准 `4c7dad0^..HEAD(a3a7b781)`，四区并行（A 捕获/会话 · B AI 精修 · C 笔记列表 · D 挂体系/元数据），修复提交：

1. **`e59c413`（B 批）**：流式 [DONE] 收尾校验（断流=失败回退非流式，禁止静默截断当成功）；流式拍去除 response_format（与 NDJSON 多值/stream 并存冲突）；整包 JSON 零成本回退兑现（compact/pretty 数组均可解析，免重发）；预算最坏档余量 16k→18k；授权文案按画面理解生效态条件化（不再误称"图像永不出本机"）
2. **`fa1647a`（A 批）**：主路径 tick 对称处理 Resume（清 auto_paused——修"手动暂停被误当自动暂停并自动解除"）；暂停期 watchdog 探针（防 WGC 失活致永久卡自动暂停）；OCR 暂停边沿去重守卫（pause 已置时不重复记账/emit）；误停阈值 SUSPECT_AFTER_TICKS 1→2（静音静止 2~4s 不再误停，真机标定前保守）；live:resumed 清除媒体徽标
3. **`7569871`（C 批）**：note_orders 孤儿行清理钩子（delete/move 命令 purge）+ scope 从属校验（save 前整体校验拒绝陈旧序）；折叠组行剔除区间/划选可见序；跨组行落点"先归组后落位+无锁防互覆"；平铺态（搜索/标签/非默认排序）禁排序拖拽守卫；划选监听泄漏修复（rAF 节流+pointercancel/blur/松开清理）；anchor 语义（普通单击清选集并设锚/无锚 Shift=单选设锚）；INTEGER 参数类型化直绑
4. **`553e95a`（D 批）**：模型轻建 disciplines 改 JSON 数组字符串（原裸串必败）；Enter=有命中选首项/零命中新建 + IME isComposing 守卫；轻建与切体系代际守卫（防旧代覆盖）
5. **`f15320d8`（元数据纠偏）**：requirements-pool REQ-281/282/285 状态收口"已实施 v0.19.6"；v0.19.6 版本文档范围表状态同步；豁免登记行数纠偏（ai_refine_protocol 撤登 340→295≤300；NoteListView 525→524；NoteLinkToSystem 314→325）

## 技术债修复登记（2026-09-05 二轮，用户指令"技术债修复"）

- **TD-2026-09-05-A closed（6b8f365）**：空体系引导「去体系页创建（向导）」——App 增 createSystemSignal 递增信号 + KnowledgePage 消费开向导 + NotesPage/NoteLinkToSystem 链路贯通；空体系测试补引导按钮断言
- **TD-2026-09-05-B closed（14e3988）**：模型 disciplines 三形态统一——KnowledgeModelDialog/KnowledgeDetailPanel 均改 JSON.stringify（Rust String=JSON 数组字符串契约）；挂体系轻建路径此前已按同范式修正
- **观察 2026-09-05-2 closed 核心项（b9571ccc）**：SSE 读取内核 read_sse_lines 收敛 + ndjson_feed 行缓冲纯函数（feed/flush）与 3 单测，adapter 闭包改调纯函数
- **观察 2026-09-05-1/3 closed（bb24e84）**：暂停期声通道边界如实化文档；轨迹 system 注释如实化
- **观察 2026-09-05-6 部分（bb24e84）**：recent_session_titles 加 LIMIT 200；其余整理项随后续批
- **观察 2026-09-05-4/5 carried**：审计/预估 vision 维度、批量移动串行与双 IPC——未实施，随后续性能与审计批评估

## 审查观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 2026-09-05-1（A-F2） | 暂停期 audio_loopback 端点停采 → media_sound 槽冻结，auto 轮询的“声画任一恢复”实际只剩画面通道 | 已处理（bb24e84 边界如实化入 media_state 文档）；低占空采样仍为后续候选 |
| 观察 2026-09-05-2（B-B10） | 流式行缓冲无单测；SSE 循环双实现 | 核心项已处理（b9571ccc：read_sse_lines 内核 + ndjson_feed 3 单测）；stream_chat 切换共用内核价值低——余项接受 |
| 观察 2026-09-05-3（B-B7） | 轨迹 AiTurn.system 记基座（缺动态段）；response 为重组 JSON | 已处理（bb24e84 注释如实化） |
| 观察 2026-09-05-4（B-B12） | 任务审计/AiRefineResult 无 vision 覆写标记；ai_refine_estimate 不含 vision 维度（开关切换预估费用不变） | 登记后续：审计补 vision 标记、预估随 effectiveVision 重算 |
| 观察 2026-09-05-5（C-L10） | 批量移动串行 await N 次 invoke 无进度；每次 saveOrder 全量重拉 | 登记后续：并行/进度与局部刷新（量级小暂缓） |
| 观察 2026-09-05-6（A-F6/提示） | live:frame-heartbeat 无前端消费（保留=诊断）；recent_session_titles 无 LIMIT；title_rules TITLE_MAX_CHARS=40 与 commands.rs 同名值 100；import 标题未 normalize 与实时入口不一致 | 部分处理（bb24e84：recent_session_titles LIMIT 200）；heartbeat 前端无消费=诊断保留、TITLE_MAX_CHARS 同名异值、import normalize 对齐——仍待整理批 |
| 观察（继承 09-04B） | 事件名跨语言契约无机器校验 / kb_chunk 超窗尾段不入向量 / 本地写+总线双刷 / dock 无组件测试 / 播放中真检测 / 设置页技术串与模型下载进度 | 延续 |

## 验证记录

- Rust：`cargo check --all-targets` 干净；clippy 终检 exit 0（受限会话无法启动 Rust 测试二进制——单测随文件入库，常规终端/CI 补跑，口径同 v0.19.6 文档）
- 前端：vitest 全量绿（修复后复跑）；`tsc --noEmit` 零错误
- 提交：审查即修四批 + 元数据纠偏（见上表）

## 关联

- 版本与需求：[v0.19.6 版本文档](../../versions/v0.19.6.md) · [v0.19.7 版本文档](../../versions/v0.19.7.md)（REQ-281~291 交付记录与真机验收待办）· [v0.20 版本文档](../../versions/v0.20.md)（v0.20.0/0.20.1 已交付；v0.20.2~4 待实施）
- 活跃设计：[v0.19 反馈批设计](../../superpowers/specs/2026-09-05-v0.19-feedback-batch-design.md)（v0.19.8 余项仍活跃）· [目标执行智能体设计](../../superpowers/specs/2026-09-05-goal-execution-agent-design.md)（v0.21 未实施）
- 归档快照：[2026-09-05 README](./README.md)（同日快照位于 [2026-09-05](../2026-09-05/README.md)）

## 2026-09-06 节（v0.20.0/0.20.1 交付后六维审查）

- **未偿表滚动**：10 笔逐条核验——closed 3 笔（TD-2026-08-30-B/2026-09-05-A/B，哈希不变）、carried 7 笔（无偿还条件发生）；**无新增债**（审查问题全部即修，不立债）
- **审查即修（152cf56）**：CER 超长护栏（>20k 字 → None 诚实不可比，O(n×m) 时间成本防线）；SRT 跨块同号文本误并修复（块内累积一次性推入）；asr_eval 进度输出换行；豁免登记 bin/asr_eval.rs 386 行（300-600 档，见 v0.20.md 交付记录）
- **观察（不立债）**：并行工作区 WIP（asr_pass2/v0.20.2 线，未入库）致全量回归暂含其失败用例——归并行线，非本批回归；harness 流式档无重打分（近似口径已文档化，慢速档回放待真机集成验证）
- **验证记录**：目标测试全绿（eval_ 28/28、cer 11/11）；`cargo build --bin asr_eval` 通过；clippy 本批零新增告警；全量回归待并行 WIP 入库后终跑（口径：v0.20.0/0.20.1 已交付时点 2159 绿）

## 2026-09-06 节（v0.20.2~0.20.4 主批 + 三路审查收口，本线）

- **未偿表滚动**：carried 7 笔维持（closed 3 笔哈希不变，无新偿还条件）
- **新增 open 8 笔（审查登记，台账见同夹 v020-batch-review-ledger.md）**：

| ID | 摘要 | 类型 | 优先级 | 状态 |
|----|------|------|--------|------|
| TD-2026-09-06-A | 有效轴窗边裁剪：跨采纳窗段覆盖 ≥60% 整段让位致窗外 ≤40% 文本在产物缺位（asr_pass2 二值取舍，clip 未实现） | 无意 | P2 | open |
| TD-2026-09-06-B | proofread_run async 内同步分块请求阻塞 worker（长会话）；重复 run 未清上次 pending | 无意 | P2 | open |
| TD-2026-09-06-C | SOP 保鲜 diff 仅比首步（2..N 步改动不提示）；start 时段漂移 stale 提示未实现 | 无意 | P3 | open |
| TD-2026-09-06-D | SOP 执行器 READ-DO/CONFIRM 渲染无实质差异；证据图片三入口上传流未接（现为相对路径文本输入） | 有意 | P3 | open |
| TD-2026-09-06-E | SE 封存过滤仅 NotesPage 默认列表（复习面/检索/组视图未覆盖；tag 子串匹配含“树洞XX”） | 无意 | P3 | open |
| TD-2026-09-06-F | kind=web 预览后端未统一路由（preview_session_note 走转写链）；渲染型整页快照与截图兜底未实现；扩展商店发布未做 | 有意 | P3 | open |
| TD-2026-09-06-G | web_inbox token 非 CSPRNG 且 ACL 注释漂移；行数豁免登记批量过期（commands_proofread/commands_web_inbox/commands_session_note 及前端 ActionCenterOverlay/SessionDetailPanel） | 有意 | P3 | open |
| TD-2026-09-06-H | 完成史 reverted 事件无来源；GoalsPage 回顾流未接 completion_history；set_task_disposition/练习暂停归档 UI/工具栏「生成 SOP」选区入口未接线 | 有意 | P3 | open |

- **审查即修提交链**：`0796f14b`（周回顾直写补 kb/广播+收件慢速超时）`086ccbfe`（裁决属主）`ef0a1ec7`（校对失败记账）`a855cbce`（警告清零）`943238f`（快照净化）`17adf140`（CSS 解码内联/收件体量上限/会话限定写）`e19984f`（任务索引元数据载荷追踪）`775cf78e`（SOP 保链/步数/幂等/回填）`cb28f22`（前端 camelCase 契约）`a3a3b48`（批决议复核/钩子补齐）`c55bdefb`（second_pass 生命周期/孤儿清理/图白名单）`3fee11a9`（SSRF 边界/校对门控护栏）
- **验证记录**：Rust 全量 2254/0（`cargo test --test app_lib_tests`）；tsc 0；vitest 571/571；origin/dev 推送截至 e19984f（后续 3 提交网络重置待续推）
