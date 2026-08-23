# ADR-021: 笔记正文源多态——`detect_body_source` 抽象层

## 状态

已接受（v0.12.0 M1，2026-08-23 规划定稿）——已实施并交付。

## 日期

2026-08-23

## 背景

`filter_note`（REQ-082）把 `segments`（转写段）硬编码为唯一正文源，`ocr_blocks`（OCR 块）始终为辅助画面要点不入 markdown。对视频会话这是正确设计（关键帧信息密度低，OCR 文本质量不稳），但对图文会话（`kind=photo`，ADR-020）——用户手动框选、OCR 文本即意图——导致转笔记时 markdown 只有标题，正文为空。这是设计债：`(segments, ocr_blocks)` 二元组缺乏"哪个是正文"的表达层。

## 决策

我们将引入 `BodySource` 枚举（`Transcript` / `OcrDirect` / `Empty`）+ `detect_body_source` 纯函数，`filter_note` 内部按来源分派到不同过滤链：

```
  segments ──┐
               ├→ detect_body_source ─→ Transcript ─→ 既有口语过滤链（视频，零改动）
  ocr_blocks ─┘                       → OcrDirect ─→ 精简 OCR 过滤链（图文，新增）
                                       → Empty     ─→ 标题仅
```

- `Transcript` → 既有口语过滤链（逻辑逐字节不变——零回归风险）。
- `OcrDirect` → `filter_note_from_ocr` 精简链：排序 → 置信过滤（0.5，与 photo_capture 同口径）→ 符号归一（**跳过口语净化**——OCR 文本无结巴/口头禅/碎片）→ 相邻去重 → markdown 组装（"图文提取"标注段）。
- `Empty` → 标题仅 markdown（无可用正文的诚实降级，不 panic）。

`refresh_screen_points` / `apply_ai_decisions` / `render_note_structure` 按 `body_source` 分流，防覆盖 OCR 正文（图文会话无时间轴叙述结构，章节插入不适用）。

引用 photo_capture 已有规则：用户框选即意图，OCR 文本不过 UI 垃圾黑名单（与视频链路"OCR 辅助画面要点"语义分离——OCR 文本在图文会话中是正文本身）。

## 备选方案

### 方案 A：打补丁——过滤链内特判 `kind=photo`
- 优点：改动最小。
- 缺点：把"正文来源"拍进过滤链，语义仍被 `kind` 绑定；未来导入 PDF/网页截图转笔记需再造一条特判分支——不可扩展，重蹈硬编码覆辙。

### 方案 B：正文源多态抽象（**选定**）
- 优点：`detect_body_source` 是独立抽象层，新正文源（PDF / 网页截图）只加变体 + 对应过滤链，不改既有 Transcript 路径核；与 `kind` 字段解耦（未来导入语音会话同路径）。
- 缺点：一次性引入枚举 + 分派 + 三路 match，改动面略大。
- 适用场景：长期重构，多正文源演进。

## 选择理由

正文源多态是长期重构而非打补丁。`BodySource` 枚举把"哪个是正文"提升为数据层语义，过滤链核只按来源分派，为未来"导入 PDF/网页截图直接转笔记"提供架构地基（仅需新增 `BodySource::PdfDirect` + 对应过滤链）。Transcript 路径零改动消除回归风险。

## 影响

### 正面影响
- 修复纯图文会话转笔记空内容的 P0 设计债。
- 正文来源表达层化，未来多源扩展只加变体。

### 负面影响 / 代价
- `filter_note` 新增枚举 + 分派 + `filter_note_empty`；`NoteFilterResult` 增加 `body_source` / `ocr_body` 两个 serde-skip 内部字段。

### 风险
- Empty 分支对"空转写段 + 辅助字幕 OCR 块"的视频会话 edge case 由"保留 ocr_screens"变为"标题仅"——与设计一致性（Empty=标题仅）相符，属有意行为。

## 合规性验证

- `cargo test note_filter`（`detect_body_source` 黄金 6 用例、`filter_note_from_ocr` 7 用例、`filter_note_with_empty_segments` 新语义）。
- 纯图文会话转笔记 → markdown 含 OCR 识别文本 + "图文提取"标注段；视频会话转笔记 → 零变化（回归护栏）。

## 相关决策

- ADR-020: 会话类型字段（图文会话）
- ADR-010: AI gap-filling 隐私契约

## 参考

- docs/versions/v0.12.0.md（正文源多态 M1）
