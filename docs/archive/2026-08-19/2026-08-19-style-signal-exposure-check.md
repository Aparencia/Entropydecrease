# 样式信号暴露面核查（REQ-129 M12 / v0.7.0 M2 spike 前置）

> 日期：2026-08-19
> 状态：核查完成，降级方案定稿（实装留 V1.0）
> 结论：**oar-ocr 0.9.1 不暴露颜色/字号等样式信息**（与预期一致——PP-OCR 系输出文本/框/置信度，样式属视觉特征，结构模型输出才有）→ 启发式降级方案定稿。

## 1. 核查对象与版本

| 项 | 值 |
|----|----|
| OCR 库 | oar-ocr（Cargo.toml `oar-ocr = { version = "0.9", features = ["auto-download"] }`） |
| 锁定版本 | oar-ocr **0.9.1** / oar-ocr-core **0.9.1**（Cargo.lock） |
| 项目封装 | `app/src-tauri/src/ocr.rs`（`OcrEngine::recognize_image` → `OcrBlock` 映射） |
| 暴露面数据源 | oar-ocr-core 0.9.1 `src/domain/text_region.rs` 的 `TextRegion` |

## 2. oar-ocr 暴露字段清单（TextRegion，oar-ocr-core 0.9.1）

| 字段 | 类型 | 说明 |
|------|------|------|
| `bounding_box` | `BoundingBox` | 文本检测框（x/y/w/h，几何） |
| `dt_poly` / `rec_poly` | `Option<BoundingBox>` | 检测/识别多边形（版面精修前后；默认同 bounding_box） |
| `text` | `Option<Arc<str>>` | 识别文本（低置信被过滤为 None） |
| `confidence` | `Option<f32>` | 识别置信度 |
| `orientation_angle` | `Option<f32>` | 文本行方向角（方向分类执行时填充） |
| `word_boxes` | `Option<Vec<BoundingBox>>` | 词级框（启用词级检测时填充） |
| `label` | `Option<Arc<str>>` | 区域标签（formula / text / seal 等） |

项目侧映射（`types.rs` `OcrBlock`）：`timestamp_ms / text / score / bbox / region_kind` —— 仅取文本 + 框 + 置信度 + 版面类型；样式字段在映射层本就无来源。

## 3. 颜色/字号是否暴露：**不暴露**

- `TextRegion` **无任何颜色字段**（无前景/背景色、无 RGB、无灰度、无平均色）——检测（det）+ 识别（rec）管线输出几何 + 文本 + 置信度；颜色属像素级视觉特征，需从裁剪图自行计算。
- **无字号/字重字段**——字号只能从 `bounding_box` 高度（`TextBox.h`）近似推导。
- 结论：**oar-ocr 0.9.1 不暴露颜色与字号样式信息**。v0.7.0 信号组（重点标注/难点信号）无法直接消费样式信号，须降级。

## 4. 启发式降级方案（定稿，实装留 V1.0）

样式信号（红色强调板书/大字标题）对重点标注与难点信号有增量价值，oar-ocr 不暴露 → 降级：

| 样式信号 | 降级方案 | 数据来源 | 实装位置 |
|----------|----------|----------|----------|
| 颜色 | 区域**平均色/主色**：从裁剪图计算（oar-ocr 提供 `BBoxCrop::crop_bounding_box(image, bbox)` 可复用）；红色系/高饱和区域可加权"重点" | bbox 裁剪图 + 像素统计 | `region_ocr` / 版面分析层（V1.0） |
| 字号 | **bbox 高度 = 字号近似**（`TextBox.h`）；同屏相对比较：标题块 h > 正文块 h | 已有 `TextBox.h`（M2/REQ-037 起由 det 填充） | 版面分层 / 标题检测（V1.0） |

- 消费方向：颜色 → "红色强调"重点加权；字号 → 标题/正文分层（与 M13 代码域映射同波）。
- 优先级：**V1.0**——样式信号为增强型输入，非 v0.7.0 核心链路阻断项。
- 依赖检查：字号降级方案所需的 `TextBox.h` 已在 v0.7.0 前可用（REQ-037 已填充 bbox）；颜色降级所需裁剪 API 在 oar-ocr 0.9.1 已存在，无依赖升级需求。

## 5. 与 v0.7.0 的关系

- REQ-129 验收 = 核查结论记录 + 降级方案定稿 → 本文档即交付物（spike 前置，无代码实装）。
- 实装（区域平均色 / 字号分层）不在 v0.7.0 范围，随 V1.0 信号增强波次。
