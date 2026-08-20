# ADR-015: 画面要点屏卡体系（screen_id/bbox 落库 + 屏聚合纯函数 + 派生屏视图）

## 状态

已接受（2026-08-20 用户头脑风暴裁决：路线 A+B+D，屏段落+配图；规格见
[archive/2026-08-20/brainstorming-ocr-screen-cards.md（[ ] 已归档）](../archive/2026-08-20/brainstorming-ocr-screen-cards.md)）

## 日期

2026-08-20

## 背景

用户反馈"画面要点（OCR）提取的内容零碎（时间整理和识别内容）"。会话29 实证（221s / 34 段转写 / 175 块 OCR）：

1. **时间碎片**：同一 PPT 内容在 12 个时间戳重复（OCR 截断抖动使 `same_texts` 精确集合去重失效）。
2. **内容碎片**：一屏拆成 15~30 个小块（图注标签 + det 断行），逐块落库展示。
3. **污染**：直播平台 UI（`1人正在看`/`发送`/频道名）+ 用户自己的 IDE/浏览器内容混入（全帧 OCR 无前台窗口过滤）。
4. **落库丢位置**：`session_ocr_blocks` 无 bbox 列——行合并/版面角色/位置去重无法事后进行。

根因：画面要点缺"屏"（幻灯片/画面帧组）这一中间抽象——课堂记忆的天然单位是屏，当前是**块流**直接进列表。

约束：旧数据兼容（历史会话 screen_id/bbox 均为 NULL）；原料层可逆（ADR-006 派生视图传统）；本地优先（图像不出本机）；AI 精修属 v0.8.0 范围不提前引入。

## 决策

1. **`session_ocr_blocks` 加两列**（`ensure_column` 幂等迁移，先例 ADR-014）：
   - `bbox TEXT`（JSON `{x,y,w,h}`，帧坐标系；NULL=旧数据）
   - `screen_id INTEGER`（采集时分配的屏号；NULL=旧数据无屏）
   - 实时（live_keyframes/handle_full_frame）与导入（import_frame）**双入口同口径双写**（延续 REQ-117 双入口统一原则）。

2. **不建新表，屏为派生视图**：屏 first_seen/last_seen/成员块 = `GROUP BY screen_id` 聚合查询；旧数据（screen_id NULL）走纯函数 `cluster_blocks_into_screens`（时间 gap>3s 或相似度<阈值 → 分新屏）聚类兜底——零冗余、可逆、旧数据自动兼容。

3. **屏聚合/去重/组织逻辑全部收敛为纯函数模块 `screen_merge.rs`**（normalize / screen_similarity / cluster_blocks_into_screens / line_merge / classify_roles），在线侧 `ScreenTracker`（内存状态机，版面指纹变化=新屏，layout_cache 复用）与离线聚类共用同一套逻辑——在线/离线一致性由构造保证（延续 REQ-081"单一管线双出口"原则）。

4. **采集治理**：全帧路径复用 `roi_tracker.foreground_foreign()`（REQ-084 字幕先例）——前台≠目标窗口期间画面要点不落库；`ui_junk.rs` 黑名单扩充直播互动元素模式。

5. **消费端契约 `SessionScreen`**：`{session_id, screen_id, first_seen_ms, last_seen_ms, title, body, labels, image_ref, structure}`；`SessionDetail.screens` 后端聚合；笔记画面要点 = 屏段落 + full 图内联引用（asset protocol 已 enable）。

6. **结构识别接线**（表格/公式/代码区域）：抽纯函数 `refine_screen_structures(screen)` 复用 commands_refine_inner 候选识别逻辑（REQ-049/050 内核不动），会话停止后批量精修，屏卡内渲染 Markdown/LaTeX/代码块；失败降级徽标。

7. **降级四级链**：新数据全能力 → 旧数据聚类屏（无行合并/角色/结构）→ refine 失败徽标 → 现行文本列表兜底（零回归）。

## 备选方案

### 方案 A：实时屏 ID 落库 + bbox 双写（决策 1+3 的在线部分，选定）
- 优点：语义最准（翻页即新屏）；live:ocr 可按屏推；图集按屏管理；消费端查询简单。
- 缺点：采集侧状态机复杂度（屏相似判定在线做）；需迁移。

### 方案 B：纯事后聚类（不落库）
- 优点：零迁移、可逆、旧数据全兼容。
- 缺点：无 bbox 做不了行合并/版面角色/位置去重；查询每次重算；实时流无法按屏推。

### 方案 C：新建 session_screens 表（屏元数据独立存储）
- 优点：屏元数据显式化，可携带图引用/精修状态。
- 缺点：多一张表 + 双写事务；屏 first/last/成员可由 GROUP BY 派生，YAGNI（决策 2 拒绝）。

### 方案 D：AI 精修屏内容（OCR 文本走云端）
- 优点：整理质量上限最高。
- 缺点：依赖 v0.8.0 AI 层排期；本版范围纪律拒绝，明确留给 v0.8.0（与 REQ-141 精修管线对接，图像永不出本机）。

## 选择理由

- 方案 A 的在线语义 + 方案 B 的旧数据兜底结合（决策 3 共用纯函数）以最小 schema 变更覆盖碎片化根因，且保持原料可逆与双入口统一。
- 屏为派生视图而非新表：符合 ADR-006 派生视图传统，零冗余，避免双写不一致风险。
- 结构识别内核（SLANet/FormulaNet/refine 链路）已就绪，本 ADR 只补消费端接线——投入产出比最高。
- 范围纪律：AI 精修、持久元素自学习、章节检测升级明确排第二波/后续版本，不在本版膨胀。

## 影响与风险

- **性能**：GROUP BY screen_id 聚合 + 屏相似度比较在查询层——会话 ≤200 块量级可忽略；聚类兜底仅在 screen_id NULL 会话触发一次（命令层缓存或惰性派生）。
- **迁移**：加列幂等（ensure_column 先例）；旧库只读不受影响。
- **误合并风险**：line_merge 保守阈值（y 差≤行高×0.6 + x 间隔≤半字宽），屏卡可展开块级明细复查（原料不动，可逆）。
- **隐私**：配图引用为本地 asset://（scope $APPDATA/**），图像不出本机（本地优先铁律）；AI 精修本版不做。
