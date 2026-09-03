# 技术债清单（权威：2026-09-03）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-09-03（v0.19.0~1「检索与发现层」全链路交付 + 三段并行新增代码审查即修；
> 昨日（2026-09-02）8 笔逐条核验：均未发生偿还条件 → 继承 carried）

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） | 有意 | P2 | 2026-08-18 | carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088）——lib.rs 仅 mod 声明，接线条件未发生 | 有意 | P2 | 2026-08-19 | carried |
| TD-2026-08-24-A | lib.rs 超 600 硬限——实测 867（v0.19 模块/命令注册再 +43）；generate_handler 单点展开不可拆，拆分计划维持顺延 | 有意 | P1 | 2026-08-24 | carried |
| TD-2026-08-30-A | ClassroomPage 超 600 硬限——实测 643（08-30 登记 607，此后他批再 +36 未登记）；拆分计划（LiveCaptureCard）未启动 | 有意 | P1 | 2026-08-30 | carried |
| TD-2026-08-30-B | note_filter 预存失败 2 笔（session29_live_ui_excluded_from_points / ocr_points_exclude_watermark_junk_and_dupes）——2026-09-03 全量复现仍 2 例（2048 通过/2 失败，独立于本批域） | 预存 | P2 | 2026-08-30 | carried |
| TD-2026-08-31-A | BrowserChrome 对 contenteditable 右键无应用内文本菜单——当前应用无该编辑面 | 有意 | P3 | 2026-08-31 | carried |
| TD-2026-08-31-B | window.prompt/confirm/alert 替换为应用内对话框——本批零新增（v0.19 引用/重建均走应用内控件），余 13 处未决（用户裁决后续批） | 有意 | P2 | 2026-08-31 | carried |
| TD-2026-08-31-C | App.css 从未被引入（死样式）——引入改全局暗色观感，需单独裁决 | 环境变化 | P3 | 2026-08-31 | carried |

## 今日已偿 / 即修

**无既有债务偿还**。本日新增代码三段并行审查（Rust 纯函数/数据层 + Rust 命令/系统层 + 前端）定位并**即修 13 项**（不立债，见审查修复提交 bdd63383；另修复 v0.18.2 批次遗留红测试 1 项 402da10）：

1. **[H] 审查-H-1（FE）**：App `focusNoteSearch` 只写不清 → NotesPage 合并 effect 优先取残留旧引用，普通跨页打开被重定向到错误笔记——`openNotePlain` 收敛三处普通打开并清带词态
2. **[H] 审查-H-2（Rust）**：kb_search fts-only 通道忽略 limit（命中放大 8 倍，kb_search 测试因漏挂 #[path] 从未编译——补挂后现红 4 例）——无条件 truncate(limit) + 测试激活
3. **[H] 审查-H-3（Rust）**：生成中失败（断网/401/429）消息不挂 hits meta——引用在失败重载后消失——meta_hits 快照 + failed 分支回填（与生成前失败同契约）
4. **[M] 审查-M-1（Rust）**：kb_chat_regenerate/纯聊 regenerate 在 flag 注册后 list 早退漏 end_stream——会话永久"进行中"——两处补 end_stream
5. **[M] 审查-M-2（Rust）**：带引号/全角引号短词按原文判长进 FTS → trigram 零 token 静默漏检——分类前剥离引号按内容判档 + DB 端到端测试
6. **[M] 审查-M-3（Rust）**：16K 长问句滑窗 ~4n 短语膨胀 + O(n²) 去重——>32 字不整段 verbatim + 首/尾 24 字区滑窗 + 96 硬顶 + 有界测试
7. **[M] 审查-M-4（Rust）**：reindex 无整表清空 + fts 孤儿行不可清；index_version 先行落值中断自相矛盾——启动整清两影子表 + 版本/时间同点收尾落值
8. **[M] 审查-M-5（FE）**：引用跳转不退出编辑态 → 高亮注入编辑视图 + autoFocus 抢焦点——NotesPage setEditing(false)（handleSelect 同款）+ NoteReadingView editing 守卫
9. **[L] 审查-L-1（FE）**：readerSearch 消费不清除 → 离开再回同一笔记旧高亮复活——injectedRef {noteId,key} 登记（null↔值往返不注入）
10. **[L] 审查-L-2（FE）**：LearningLibraryPanel 8s 轮询随设置页常驻全生命周期空转——active 门控（SettingsPage 透传 page==="settings"，SessionsPage 先例）
11. **[L] 审查-L-3（FE）**：parseKbMeta 元素级零校验（单条畸形崩渲染）——isKbHit 过滤 + CitationChips snippet 双保险 + 测试
12. **[L] 审查-L-4（FE/Rust）**：regenerate 旧 failed 行与流内 chips 双份——launch ok 即 loadMessages；全文取回失败静默——补 eprintln 降级
13. **[L] 审查-L-5（Rust）**：gate-off 路径不 bump chat_sessions.updated_at 排序失真——touch_chat_session + 两流调用
14. **预存红测试（v0.18.2 遗留）**：budget_allocator pack_fragments 截断断言与"部分截断+诚实信号"语义矛盾（短片断在 20 字符预算内可全收）——加长片段对齐语义（402da10）

## 审查观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 2026-09-03-1 | kb 保存钩子（create/update/delete/fragment）autocommit 双写存在语句间崩溃窗口——半态可由全量重建整清自愈（今日修复 M-4），显式事务改造（promote/versioned_save 同款）成本高收益低 | 登记后续（随 kb 索引一致性强化批评估） |
| 观察 2026-09-03-2 | kb_chunk overflow_split 对超长单行（无换行）二次复杂度——正文 200k 上限内最坏单次数百 ms、仅粘贴 dump 触发；字节游标线性化为可选项 | 无问题（登记说明：量级有界，不立债） |
| 观察 2026-09-03-3 | reindex 报告 sources_total（按行含空正文源）与 stats（trim 非空）口径不同——进度终点与角标总数可能不一致 | 登记说明（语义各自成立：进度=执行行数，角标=可索引源） |
| 观察 2026-09-03-4 | FE 测试缺口：useChatStream（无测试文件）/NotesPage 合并 effect 焦点语义/NoteReadingView externalSearch/ ChatMessageList chips 分支/LearningLibraryPanel 均无新增用例（H-1 本可被 NotesPage 级单测拦截） | 登记后续（随组件测试批补测） |
| 观察 2026-09-03-5 | ChatStreamEvent 前端分发已加固为显式终态枚举 + 未知事件告警（未来新增非终态事件安全） | 无问题（登记说明） |

## 验证记录

- Rust 全量 `cargo test`：**2048 通过 / 2 失败（note_filter 预存，TD-30-B）/ 6 ignored**；`kb_` 域 67 用例全绿；clippy 零警告（预存 lib.rs 多 target 提示除外）
- 前端：vitest **525/525 全绿**（新增 kbHits 元素校验 2 例等）；`tsc --noEmit` 零错误
- 提交：审查修复 bdd63383（21 文件，Rust+FE+豁免登记）· 预存红测试对齐 402da10 · v0.19 交付 2da0281b/970bea58

## 关联

- 版本与需求：[v0.19.0 版本文档](../../versions/v0.19.0.md) · [v0.19.1 版本文档](../../versions/v0.19.1.md)（交付 2da0281b/970bea58 + 审查修复 bdd63383，REQ-258/260/262 部分）
- 归档快照：[2026-09-03 README](./README.md)
