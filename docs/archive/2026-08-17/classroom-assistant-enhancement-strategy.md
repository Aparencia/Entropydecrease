# 课堂助手增强策略与实施规划（2026-08）

> 基于竞品差距分析（`classroom-assistant-competitive-analysis.md`）与技术机制调研（`video-content-extraction-market-2026.md`）的落地决策文档。
> 状态：已决策（本章节） / 待探讨（批量插入章节）
> 对应代码热区：`client/src/features/classroom/`、`client/electron/ipc/keyframeStorage.ts`、`server/ai-gateway/`

---

## 一、差距项决策速览

| # | 差距 | 选定方案 | 优先级 | 性质 |
|---|------|---------|--------|------|
| 1 | 页切换检测 + 页面级去重 | **方案 C**：独立板书/页面双通道哈希池 | P1 | 增量 → 降成本 |
| 2 | PPT 页独立摘要 | **方案 A+B**：页标记 + 图编号精确对齐 | P1 | 质量提升 |
| 3 | 语义章节切分 | **方案 B**：一次性 LLM 章节划分 | P1 | 结构化飞跃 |
| 4 | 时间轴回放 | **方案 A**：文本级时间轴（零新数据依赖） | P0 | 体验基础 |
| 5 | RAG 问答 | **方案 A**：课后问答入口（复用 `askSessionQuestion`） | P0 | 核心缺口 |
| 6 | 转写修正全链路同步 | **方案 A+B**：修正写回 audioText + 原文溯源 | P0 | bugfix |
| 7 | 多格式导出 | Anki 导出优先，Markdown 次之 | P2 | 跨生态 |

### 各方案详细描述

#### ① 页切换检测 + 页面级去重 — 方案 C

- 画面帧按 `changeType` 路由到两个独立哈希池：`slidePool`（score ≥ 0.6） + `boardPool`（score < 0.6）
- 各池独立维护近 50 帧哈希集合，新帧与池中所有帧比较 Hamming 距离
- 去重阈值：`slide` 收紧（≤8 算重复，允许非精确翻页匹配），`board` 维持（≤5，渐进板书疏漏少）
- 在 `SmartSampler` 中新增双池逻辑，`trimOldKeyframeImages` 同步裁剪

> 预期效果：同页动画/光标不再重复捕获，增量分析帧数砍半，同时板书与 PPT 页不去重互扰。

#### ② PPT 页独立摘要 — 方案 A+B

- **A**：`analyzePartial` 拆包时按 `isNewPage`（`changeType === 'slide_change'`）切分，每页独立调 VLM
  输出 `{ pageNumber, summary }`，增量结果带 `pageNumber` 标记存入 `partialNotesRef`
- **B**：每个 `pageSummary` 携带 `[图:N]` 精确标记指向具体关键帧，mergeNotes 时精确匹配而非时间就近兜底

> 效果：摘要粒度从"不确定的 5 帧块"变为"确定的一页笔记"。

#### ③ 语义章节切分 — 方案 B

- mergeNotes 成功（或本地 concat 后）→ 调一次 LLM `chapter_segment` prompt
- Prompt：将整篇笔记划分为章节 + 每章命名 + 一句话概述 + 起止时间
- LLM 不可用时降级：按 partial 序号 + 时间区间规则分割

> 改动最小（纯 prompt 工程 + 一次网关调用），产出质量最高。

#### ④ 文本级时间轴 — 方案 A

- 纯 UI：课后笔记详情页 + 采集过程中侧边栏，展示可点击时间线
- 现有数据直接消费：`audioSegments[i].timestampStart/End` + `audioText` + `keyframes[].timestamp` + `timeline` 书签
- 不新增任何持久化依赖。点击时间点 → 高亮对应转写段落 + 定位关键帧缩略图

#### ⑤ 课后 RAG 问答 — 方案 A

- 在 `SessionContentView` 的 QA Tab（已有）接入 `askSessionQuestion`（移动端 `mobilePipeline.ts` 已实现的函数）
- 用户输入问题 → 调网关 `/api/v1/ai/session-qa` → 展示回答 + 引用时间
- 改造：当前 QA Tab 的 `qaTranscript` 拼接方式改为传入 `liveTranscripts` + `audioSegments` 中的 `audioText` 完整内容

#### ⑥ 转写修正全链路同步 — 方案 A+B

- **A**：`handleEditTranscript` 保存时同步更新 `smartBundle` 中对应 `audioSegment.audioText`（不可变更新）
  mergeNotes 从 `audioSegments` 拿修正后文本，修正自动流入笔记 + 闪卡
- **B**：保留 `audioTextRaw`（已有字段），UI 增加"原始视图/修正视图"切换

> 当前修正只改 UI 态不下游同步，这是必须修的 bug（约 10 行）。

#### ⑦ 多格式导出

- **Anki 导出优先**：现有闪卡已存 `front/back/cloze` 结构，导出 `.apkg`（ZIP + CSV/SQLite）即可跨生态
- **Markdown 导出**：`note.content` 是 Markdown 转 TipTap 存的，逆向转换后写 `.md` 文件

---

## 二、优先级路线图

### P0 — 立即（1~2 天，独立不阻塞）

```
① 转写修正全链路同步
② 课后 RAG 问答 UI 接入
③ 文本级时间轴（纯 UI）
```

### P1 — 近中期（3~5 天，逐项推进）

```
④ 页面级去重（双池哈希）
⑤ 页级摘要拆分 + 精确图对齐
⑥ 一次性语义章节切分（LLM）
```

### P2 — 后续评估

```
⑦ Anki/Markdown 导出
```

### 不做（至少当前阶段不触及）

```
- PPT 页重建导出
- 逐词同步高亮
- 实时视觉 OCR 流（smart 路径）
- 下载多平台 URL 视频
```

---

## 三、待探讨：语音转写文本的批量插入笔记

### 3.1 问题描述

当前转写文本（smart 路径 `liveTranscripts` / fine 路径 `segments`）没有进入笔记插入弹窗的路径：

- `liveTranscripts` 在 UnifiedTimeline 中仅展示/编辑，**不可选中、不可批量插入**
- `segments` 在 SegmentList 中有多选，但落地是**复制到剪贴板**而非插入笔记弹窗
- `NoteInsertDialog` 只被 `AnalysisPreview`（AI 分析结果）触发

用户如果想在 AI 分析完成之前（或替代 AI 分析）直接把转写原文段落塞进笔记，无法操作。

### 3.2 用户场景

1. **课中快速摘录**：上课 20 分钟出现重要讨论 → 勾选对应转写段落 → 追加到已有课程笔记
2. **课后快速归档**：AI 分析需要等待 2~5 分钟 → 不等了，选中关键原文批量插入
3. **原文备份**：AI 整理版之外，保留逐句转写原文作为底稿

### 3.3 方案探讨

**方案 A（推荐，轻量）**：UnifiedTimeline 每行转写加勾选框 → 底部"插入笔记"按钮 → 选中文本拼接为 Markdown（带 `[HH:MM:SS]` 时间戳）→ 传入 `NoteInsertDialog`（复用现有弹窗，`content` 参数不限来源）

**方案 B（增强）**：AI 分析弹窗中增加"切换到原始转写版本"开关，用户选择插哪版

**方案 C（顺手修复）**：`SegmentList` 的"插入选中"改为弹出 `NoteInsertDialog`（而非当前仅 `clipboard.writeText`）

### 3.4 与现有优先级的协同

推荐纳入 P0：
- 改动量约 100 行，风险低
- 与 P0 时间轴方案共用选中交互，一次 UI 设计覆盖两个需求
- 修复了"采集 → 笔记"之间的灰色地带

---

## 四、技术注意

1. **主进程 CPU 评估**：页面级去重（方案 C）的双池哈希在渲染侧离线计算，不涉及主进程推理，性能风险低
2. **章节切分的 LLM 降级**：必须保留纯规则降级路径，防止章节切分阻塞笔记生成流程
3. **转写修正同步范围**：修正同步至 `audioText` 后，下游消费链为：mergeNotes（读 audioText）→ structureAndSave → 闪卡生成；需验证无数据穿透（修正后的文本不应回流到 ASR 模型）
4. **NoteInsertDialog 通用化**：目前为止它只被 AnalysisPreview 调用。改为独立路由后，需确认弹窗被同时多次打开时的竞态（用 `showNoteDialog` 布尔锁已足够，无需额外防护）