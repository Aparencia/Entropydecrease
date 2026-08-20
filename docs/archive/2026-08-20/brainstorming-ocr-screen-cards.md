# 画面要点（OCR）屏卡体系——头脑风暴与设计规格

**状态**: 已裁决（2026-08-20 用户头脑风暴：路线 A+B+D，屏段落+配图）
**关联**: [ADR-015](../../adr/ADR-015-screen-cards-ocr.md)（架构决策）· 需求池 REQ-155~161 · 会话29 实证（本机 `entropy.db`）
**触发**: 用户反馈"画面要点（OCR）提取的内容零碎（时间整理和识别内容）"

---

## 一、问题实证（会话29：221s / 34 段转写 / 175 块 OCR）

| 现象 | 数据证据 | 根因 |
|------|---------|------|
| **时间碎片**：同一 PPT 内容在 12 个时间戳重复 | `为什么`/`为什么高手管`/`为什么高手管理者思路特别清晰？` 三种截断变体；`系统思维` 等 8+ 次出现 | 去重是"整帧文本集合精确相等"（`same_texts`）——截断抖动使集合永不相等，去重失效 |
| **内容碎片**：一屏拆成 15~30 个小块 | `要素`、`连接`、`功能/目标`（图注标签）；长句被 det 切两半：`…相互作用的若干要`+`素组成的表现出新功能的整体` | 无"屏"抽象：块是 det 单行，直接逐块落库展示 |
| **平台 UI 污染** | `X`、`1人正在看`、`发送`、`清晖项目管理`（频道名）、`Chanyovey Prujoct ugt r an`（logo 乱码） | 黑名单只覆盖播放器时间码/水印/编辑器/应用 UI，无直播互动元素模式 |
| **其他窗口污染** | `wsh ·Co`、`commit and push…`、`给智能体发消息`、`Full access`（用户自己的 IDE/浏览器） | 全帧 OCR 无前台窗口过滤（字幕路径已有 REQ-084 先例） |
| **时间戳无区间** | 每块时间戳=识别时刻，无"出现→消失"语义 | 屏级 first_seen/last_seen 缺失 |
| **落库丢位置** | `session_ocr_blocks` 只有 text/score/region/region_kind，无 bbox | 全帧块落库时丢弃 `OcrBlock.bbox`（内存链路可用，TD-046 坐标反算已有先例） |

**核心洞察**: 画面要点缺"屏"（幻灯片/画面帧组）这一中间抽象。课堂记忆的天然单位是屏（老师翻到哪页我记哪页），而当前是**块流**直接进列表。一次翻页（FrameSwitch 事件已有）就是一张新屏。

## 二、头脑风暴全景（按管线环节）

| 环节 | 思路 | 收益 | 代价/风险 |
|------|------|------|-----------|
| **1. 采集治理**（少收垃圾） | 1a 前台窗口过滤扩展到全帧（复用 `roi_tracker.foreground_foreign()`） | 根治 IDE/浏览器污染 | 用户故意切窗看资料会被误杀 |
| | 1b 直播平台 UI 黑名单扩充（`1人正在看`/`发送`/`X`/`下载`/频道名/logo 乱码） | 立竿见影 | 追不上新平台；需启发式兜底 |
| | 1c 持久元素自学习：同 bbox 位置+长期不变小块 → 自动标记 UI | 一帧学会全课过滤 | 依赖 bbox 落库；采集侧状态机复杂度（第二波） |
| **2. 屏级聚合**（块→屏） | 2a bbox 落库（迁移+双写） | 行合并/版面角色/位置去重全可做 | 数据量↑ |
| | 2b 屏 ID 落库：版面指纹变化=新屏（layout_cache 现成）；屏带 first/last_seen+成员块 | 时间区间天然形成 | 在线状态机 |
| **3. 屏级时间整理** | 3a 屏内容相似合并：归一化+集合重叠率（吸收截断抖动）→ `00:02–03:23 系统思维…` | 12 时间戳→1 条区间 | 翻回旧页判定（间隔>3s 再出现=新屏） |
| **4. 屏内组织** | 4a 行合并：bbox y 邻近+x 相邻 → 拼接断行 | 内容完整 | 需 bbox |
| | 4b 版面角色：标题（大字/居中）/正文/图注标签 | 卡片可读 | — |
| | 4c 结构识别接线：region_kind=table/formula/code → Markdown 表格/LaTeX/代码块 | OCR 价值跃升 | 消费端接线（识别内核已就绪） |
| **5. 消费端** | 5a 原料屏卡流 + 笔记屏段落+配图 + 大纲/检索按屏 | 全链路一致 | — |
| | 5b 章节检测升级：屏标题变化=精确章节边界 | 更准 | 可选第二波 |
| **6. AI 精修**（可选） | 6a OCR 文本（图像永不出本机）→ AI 整理屏内碎片 | 质量上限最高 | 依赖 v0.8.0 AI 层排期；**裁决不做**，留给 v0.8.0 |

## 三、裁决（2026-08-20）

1. **路线 A+B+D**：屏卡体系 = 采集治理 + 屏ID + 屏级去重合并 + bbox 落库 + 行合并/版面角色 + 结构识别接线
2. **组织策略：混合**——新数据采集时写 `screen_id`+`bbox`；旧数据（NULL）走视图层聚类兜底；在线/离线共用同一套纯函数（ADR-006 派生视图传统）
3. **笔记形态：屏段落+配图**——每屏一段（区间+标题+正文+图注），full 图内联引用（asset protocol 已 enable）
4. **不做**：AI 精修（路线 C → v0.8.0）、持久元素自学习（1c → 第二波）、章节检测升级（5b → 可选第二波）

## 四、设计规格

### 4.1 数据层（自底向上）

- **迁移**（`db.rs` `ensure_column` 幂等，先例 ADR-014）：
  - `session_ocr_blocks` 加 `bbox TEXT`（JSON `{x,y,w,h}`，帧坐标系；NULL=旧数据）
  - `session_ocr_blocks` 加 `screen_id INTEGER`（采集时分配的屏号；NULL=旧数据无屏）
  - **不建新表**：屏 first/last_seen/成员块 = `GROUP BY screen_id` 派生查询
- **纯函数模块 `screen_merge.rs`**（原子层，可单测）：
  - `normalize(text)`：去空白/标点/全角半角统一（吸收截断抖动）
  - `screen_similarity(a, b)`：归一化文本集合重叠率（Jaccard）——屏级比较比块级稳定
  - `cluster_blocks_into_screens(blocks, gap_ms, sim_threshold)`：旧数据兜底（gap>3s 或相似<阈值 → 分新屏；翻回旧页间隔>3s → 新屏）
  - `line_merge(blocks)`：bbox y 中心差≤行高×0.6 且 x 相邻（间隔≤半字宽）→ 同行拼接；否则换行
  - `classify_roles(blocks)`：块高≥屏高 4% 或居中大字 → 标题；≤6 字散布 → 图注/标签；其余 → 正文
- **在线侧 `ScreenTracker`**（live_frame_process 挂载，内存状态机）：版面指纹变化（layout_cache）→ 新屏；同屏续屏（更新 last_seen 不新增行）；落库带 screen_id+bbox；`live:ocr` 事件带屏号

### 4.2 采集治理

- **前台窗口过滤**：全帧路径复用 `roi_tracker.foreground_foreign()`（REQ-084 字幕先例）——前台≠目标窗口期间画面要点不落库
- **UI 黑名单扩充**（`ui_junk.rs`）：直播互动元素模式（`1人正在看`/`发送`/`X`/`下载`/频道名/非 CJK 乱码 logo）
- 持久元素自学习（1c）：第二波（依赖 bbox 落库后自然支持）

### 4.3 屏内组织

- **屏卡契约 `SessionScreen`**（Rust struct + TS interface 强类型）：
  ```
  session_id, screen_id, first_seen_ms, last_seen_ms,
  title: Option<String>,           // 标题角色块
  body: Vec<String>,               // 行合并后的正文行
  labels: Vec<String>,             // 图注/标签
  image_ref: Option<String>,       // first_seen 时刻 full 图（已有归档机制）
  structure: Vec<ScreenStructure>, // {kind: table|formula|code, markdown?/latex?, artifact_ref?}
  ```
- **结构块**：`region_kind=table/formula/code` 不参与行合并，屏卡内徽标 + 可精修入口

### 4.4 结构识别接线（D 路线）

现状盘点（几乎全现成）：region_ocr 已产出 region_kind 块+裁剪图；structure 模型已下载（pp-doclayout-l 129MB / pp-formulanet-s 231MB / slanet_plus_v2 6MB）；`commands_refine` 已有"候选识别表格→Markdown / 公式→LaTeX → artifact_blocks"全链路（REQ-049/050）。

- 抽纯函数 `refine_screen_structures(screen)`：屏内结构块 → 复用 commands_refine_inner 候选识别逻辑（command 胶水抽出，可单测）
- **触发时机**：会话停止后批量精修（自动）；模型本地无网络依赖；失败降级徽标保留
- **渲染**：屏卡内表格→Markdown、公式→LaTeX、代码→等宽块；产物视图同步消费
- **成本控制**：每屏结构块通常 0-2；无模型/缺文件 → 跳过不阻断

### 4.5 消费端

- **原料视图**（SessionDetailPanel）：175 行文本列表 → 屏卡流（时间区间徽标+标题+正文+图注+full 图缩略图+结构徽标）；屏卡可展开块级明细（复查误合并）；`SessionDetail` 增加 `screens: Vec<SessionScreen>`
- **笔记**（note_filter / NotePreviewView）：`ocr_points` 升级为屏段落数组——每屏 `**MM:SS–MM:SS** 标题` + 正文行 + `![…](asset://…/full/{ts}.webp)`（配图可开关）；预览过滤统计按屏口径
- **大纲**（outline.rs）：屏标题 → 大纲条目（替代文本启发式；无 bbox 旧数据回退现状）
- **检索**（db_ocr_search）：命中 → 返回所在屏（区间+图引用）
- **实时面板**：`live:ocr` 带 screen_id，前端"最近画面要点"按屏摘要显示

### 4.6 降级链（四级，本地优先铁律）

1. 新数据（bbox+screen_id）→ 全能力屏卡
2. 旧数据 → 聚类屏（区间成立，无行合并/角色/结构）
3. refine 失败/无模型 → 徽标保留不渲染
4. 全失败 → 现行文本列表兜底（零回归）

### 4.7 测试（AAA，纯函数优先）

- `screen_merge`：normalize/similarity 边界（空集/全等/截断变体）、cluster（gap 分屏/相似合并/翻回旧页）、line_merge（断行拼接/不同行不误并）、classify_roles（标题/正文/标签）
- `ScreenTracker`：mock 块流（新版面=新屏/同屏续屏/UI 变化不扰屏）
- 迁移：加列后旧库可读、新库可写
- note_filter：屏段落输出、配图引用格式、旧数据降级路径
- 真机验收：会话29 重跑 → 175 块 → ~7 屏卡（与 7 张 full 图对应）

## 五、验收标准

- [ ] 会话29 原料视图：屏卡流 ≤10 张卡，每卡带时间区间、无平台 UI/其他窗口污染、正文完整（断行已合并）
- [ ] 笔记画面要点：屏段落+配图，数量与 full 图对应；预览过滤统计按屏口径
- [ ] 旧会话（无 screen_id/bbox）：聚类屏正常展示（降级 2 级），零回归
- [ ] 直播平台新会话：UI 元素不进屏卡（黑名单扩充生效）
- [ ] 表格/公式屏：停止后自动精修，屏卡内 Markdown/LaTeX 渲染；模型缺失时降级徽标
- [ ] `cargo test` + `cargo clippy` 全绿；前端构建通过

## 六、需求登记（REQ-155~161，详见需求池）

| REQ | 内容 | 优先级 |
|-----|------|--------|
| REQ-155 | 屏级聚合与去重：screen_merge 纯函数 + ScreenTracker 在线屏 + 旧数据聚类兜底 | P1 |
| REQ-156 | bbox/screen_id 落库迁移：session_ocr_blocks 加列双写（实时+导入双入口） | P1 |
| REQ-157 | 采集治理：前台窗口过滤扩展全帧 + ui_junk 直播元素扩充 | P1 |
| REQ-158 | 屏内组织：行合并 + 版面角色 + SessionScreen 契约 | P1 |
| REQ-159 | 结构识别接线：屏内 table/formula/code → refine → 屏卡渲染 | P2 |
| REQ-160 | 消费端：原料屏卡流 + 笔记屏段落配图 + 大纲/检索按屏 | P1 |
| REQ-161 | 实时面板按屏显示：live:ocr 带 screen_id，最近画面要点按屏摘要 | P2 |
