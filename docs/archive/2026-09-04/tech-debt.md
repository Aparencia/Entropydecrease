# 技术债清单（权威：2026-09-04）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-09-04（v0.19.2/v0.19.3 交付后新增代码三段并行审查即修；
> 昨日（2026-09-03）8 笔逐条核验：均未发生偿还条件 → 继承 carried）

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） | 有意 | P2 | 2026-08-18 | carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088）——lib.rs 仅 mod 声明，接线条件未发生 | 有意 | P2 | 2026-08-19 | carried |
| TD-2026-08-24-A | lib.rs 超 600 硬限——实测 872（v0.19.3 模块/命令再 +5）；generate_handler 单点展开不可拆，拆分计划维持顺延 | 有意 | P1 | 2026-08-24 | carried |
| TD-2026-08-30-A | ClassroomPage 超 600 硬限——实测 745（v0.19.2 +59、v0.19.3 审查即修 +43）；拆分计划（LiveCaptureCard）未启动 | 有意 | P1 | 2026-08-30 | carried |
| TD-2026-08-30-B | note_filter 预存失败 2 笔（session29_live_ui_excluded_from_points / ocr_points_exclude_watermark_junk_and_dupes）——2026-09-04 全量复现仍 2 例（2058 通过/2 失败） | 预存 | P2 | 2026-08-30 | carried |
| TD-2026-08-31-A | BrowserChrome 对 contenteditable 右键无应用内文本菜单——当前应用无该编辑面 | 有意 | P3 | 2026-08-31 | carried |
| TD-2026-08-31-B | window.prompt/confirm/alert 替换为应用内对话框——v0.19.2/3 零新增，余 13 处未决 | 有意 | P2 | 2026-08-31 | carried |
| TD-2026-08-31-C | App.css 从未被引入（死样式）——引入改全局暗色观感，需单独裁决 | 环境变化 | P3 | 2026-08-31 | carried |

## 今日已偿 / 即修

**无既有债务偿还**。新增代码三段并行审查（Rust 采集/系统层 + Rust v0.19.3 后端 + 前端 v0.19.2/3）定位并**即修 14 项**（不立债，审查修复提交 3c1fcce9）：

1. **[M] capture-1**：lifecycle start 15s 等待全程持 active 锁（主线程 pause/resume/status 命令排队冻结）+ async 命令同步阻塞——**锁外等待重构**（快速初检→锁外等待→最终登记闸；并发双 start 后到者回滚自身并报错）
2. **[M] capture-2**：超时分支用字符串相等做行为分支（文案改动即静默退回双引擎）——**WaitError 枚举化**（Timeout/LoadFailed/Exited + Display）
3. **[M] FE-1（capture）**：非就绪启动成功路径「引擎就绪中…」文案整段会话残留——recording 迁移统一覆写「实时捕获已开始」
4. **[M] FE-2（capture）**：starting 过渡态无超时兜底（事件丢失=按钮永久禁用无停止出口）——**20s 看门狗**查询 live_session_status 收口（对齐 TD-042 stopping 先例）
5. **[M] FE-3（rag）**：DiscoverySuggestSection 无 seq 守卫——概念快速切换 A 旧候选可被确认挂到 B（真实错链）——**序号守卫 + 切换/拉取即清屏**
6. **[L] rag-1**：essence 无落库上限拼入查询（跨 token FTS 表达式可膨胀）——查询截断 240 字符 + 单测
7. **[L] rag-2**：跨体系相似提示含 archived 概念、take 先于排序无口径——过滤 archived + 排序后 truncate + 注释
8. **[L] capture-3**：mark_session_failed 静默（真孤儿 recording）——失败 eprintln 可观测
9. **[L] capture-4**：注释-实现矛盾三处（≤5s/永不失败/回退覆盖）——随重构同步更新
10. **[L] capture-5**：is_system_window 精确相等依赖进程名输出无防护（尾部 \0 风险）——trim_end 防御
11. **[L] FE-4（rag）**：确认成功文案被紧随 load() 清空——load(reset) 参数化，成功文案保留
12. **[L] FE-5（capture）**：liveActiveRef useEffect 后置同步防护概率失效——事件监听器内直写 ref
13. **[L] FE-6（capture）**：release 注释失实 + TTL 回收后 prepareState 陈旧误判——注释如实化 + 点击预同步 prepare 状态
14. **[L] FE-7（capture）**：系统窗口残留选择与折叠卡无标记——折叠卡加 🖥 系统窗口 徽标

## 审查观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 2026-09-04-1 | 超时路径残留加载窗口：被取消线程加载完才退出，期间重试/重挂载 prepare 会与残留并行双引擎加载（加载不可中断；建议 CancelPending 状态机扩展） | 登记后续（随预热状态机强化批评估） |
| 观察 2026-09-04-2 | B站独立客户端首页标题若为裸「哔哩哔哩」会被 homepage demote 清零（与抖音不同——抖音未入首页表）；待真机实测客户端窗口标题形态 | 登记后续（实测后再定 demote 是否按进程限定） |
| 观察 2026-09-04-3 | 建议排除后不回填致候选稀疏（spec 允许截顶）；符合设计，quality 改进登记 | 登记后续 |
| 观察 2026-09-04-4 | 设置页关闭 kb_discovery 与已挂载建议区不联动（旧候选仍可见；影响面小，人工确认流兜底） | 接受（登记说明） |
| 观察 2026-09-04-5 | FE 测试缺口续：ClassroomPage starting 状态机/看门狗、WindowSelectCard 折叠徽标无组件测试（Starting 死锁面本可拦截） | 登记后续（随组件测试批补测） |
| 观察（继承 09-03） | kb 保存钩子事务化候选 / kb_chunk 切块线性化候选 / reindex 报告口径说明 / FE 测试缺口 / 播放中真检测（OCR/音频轮询） | 登记后续（延续） |

## 验证记录

- Rust 全量 `cargo test`：**2058 通过 / 2 失败（note_filter 预存，TD-30-B）/ 6 ignored**；clippy 零警告（预存 lib.rs 多 target 提示除外）
- 前端：vitest **528/528 全绿**；`tsc --noEmit` 零错误
- 提交：审查修复 3c1fcce9（10 文件，Rust+FE+豁免登记+v0.19.3 文档口径同步）

## 关联

- 版本与需求：[v0.19.2 版本文档](../../versions/v0.19.2.md) · [v0.19.3 版本文档](../../versions/v0.19.3.md)（交付 dd5f9b2/cf41a46c + 审查修复 3c1fcce9，REQ-261/262/271~273）
- 归档快照：[2026-09-04 README](./README.md)

---

## 二轮滚动（2026-09-04 晚——v0.19.4/5 审查即修后权威续段）

> 上半（本文件前文）为晨档；本段为同日二轮滚动。晨档 8 笔 carried 状态**不变**（无偿还条件发生）；新增内容如下。

### 即修（不立债，提交已入库）

| 提交 | 范围 |
|------|------|
| 653e8b3 | Rust 批 18 文件：采纳幂等守卫前置×3（commands_ai_{refine,note_refine,enrich}——修 check-after-write 重复落库）；组结算 Goals/Notes/NoteGroups 补广播（commands_settlement）；写端补广播（promote_fragment_to_note/note_versions_rollback/start_photo_session/knowledge-core 概念·模型×4/delete_note→Knowledge）；kb_reindex 重建起点清 embedding meta 三键（修"语义就绪"谎报）；kb_fill_embeddings 分批 512 嵌入写回（限内存限锁）；下载幂等跳过+长度校验+.part 失败清理；kb_embedding_load 异步化（模型解析出主线程）；语义合流统一降级防击穿（meta/推理/形状故障→日志+None）＋纯语义召回空词法路径；陈旧注释/allow/ndarray 直依清理 |
| 8a4a104 | FE 批 16 文件 15 项：采纳成功后详情回写（两宿主 onTaskChanged 重取详情）；dock open 期间 ai:task-update 实时刷新；ChatPage loadMessages seq 防竞态；任务截断 40→60 统一；占位文案中性化「标题不可用」（entityLabel）；TaskConversationView 来源按钮 targetKind=note 分流；GoalsPage 总线含毕业档案重取；dock 懒加载+10s 静态时效；useChatStream unmount rAF 清理；TaskLaunchDialog 确认框去裸号；custom textarea maxLength=500；kindWord 消费；EmbeddingStatusView 归位 types/kb.ts；引擎治理拆 LearningLibraryEngineSection（面板 331→237 行）＋下载后 loadEmb 刷新；NoteAiDialog/ChatSaveNoteDialog 去裸号 |
| 56aa05b | Cargo.lock 净化（移除 ndarray 0.16 直依——ort 自带 0.17 已足够） |

### 二轮观察登记（不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 2026-09-04B-1 | 本地写+总线 300ms 双刷（幂等重拉、防抖挡风暴；成本 1-6 次轻查询/写） | 接受（页面注释说明） |
| 观察 2026-09-04B-2 | kb_chunk 800 字符可超 bge 512 token 窗——尾段由分词器截断不入向量（词法检索不受影响） | 勘误注释已更新；收紧常量需同步 golden——随真机评测项 |
| 观察 2026-09-04B-3 | dock 无组件自动化测试；面板/快捷键/toast 联动入真机项 | 登记（v0.19.4 版本文档真机待办） |
| 观察 2026-09-04B-4 | data:* 事件名跨语言契约无机器校验 | 建议 CI grep 双向断言（登记后续） |
| 观察 2026-09-04B-5 | 设置页技术串裸露（fts5+onnx/dim）与模型下载无进度事件 | 登记后续（文案与进度批） |

### 验证记录（二轮终态）

- Rust 全量：**2083 通过 / 2 失败（note_filter 预存 TD-30-B）/ 6 ignored**；clippy 零新警告
- 前端：vitest **551/551**；`tsc --noEmit` 零错误
- 终稿文档：[v0.19.4 版本文档](../../versions/v0.19.4.md) · [v0.19.5 版本文档](../../versions/v0.19.5.md)（含真机验收待办登记）
