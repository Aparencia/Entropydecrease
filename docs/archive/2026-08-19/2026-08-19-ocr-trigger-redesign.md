# OCR 触发重做与 UI 面板抑制（设计规格）

> 对应 [ADR-011](../adr/ADR-011-grid-diff-ocr-trigger.md)（决策）与需求池 REQ-086/REQ-087。
> 状态：设计已确认（2026-08-19），待写实施计划。

## 1. 背景与根因

### 用户反馈（2026-08-19）

- 同一视频（**非全屏、窗口前台可见、画面基本静止**）内页面发生变化（字幕行切换/幻灯片翻页）→ OCR 触发不良
- 切换到其他软件页面 → 立即触发 OCR

### 根因（代码定位）

| # | 根因 | 位置 | 机制 |
|---|------|------|------|
| 1 | **采样混叠漏检（主因）** | `capture/frame_diff.rs` `block_hashes` | 8 块 × 60 字节均匀采样；1920 宽窗口采样列仅 {0,480,960,1440}；静止画面下唯一变化（字幕行/翻页文字）落采样列外 → 完全漏检 → 不触发，只能等 FORCE_OCR 15s 兜底 |
| 2 | **触发与裁剪解耦不足（次因）** | `live_session_frame.rs` `process_frame` | 字幕路径 diff 在裁剪前全帧上做，与页面/鼠标/动作耦合；全帧路径 5s 低频 + diff 门控 → 页面变化延迟大 |
| 3 | **视频区内突发 UI 无防线** | `handle_subtitle_frame` 上游 | 控制栏/弹窗出现在 ROI 内：REQ-084 不触发（窗口未切换）、ui_junk 只拦已知词、投票器对持续 UI 照投通过 |

### 约束

- 本地优先、纯规则、确定性（无 LLM）
- 实时性：字幕/页面变化秒级反映
- 成本：变化检测成本必须远低于 OCR 推理（OCR 是昂贵环节，检测是门卫）
- 零回归：DualRateScheduler / FORCE_OCR / idle_governor / RoiTracker / SubtitleVoter / ui_junk / watermark_filter 语义不变
- 原料层不动（ADR-006 事实/派生分离）：面板抑制只拦"进投票器"，不删库中原文

## 2. 目标与非目标

### 目标

1. 结构性消除采样混叠：任何位置的局部文字变化都能命中变化检测
2. 字幕触发与页面变化解耦：字幕路径只对 ROI 帧判变
3. 页面（幻灯片）变化 ≤2s 触发全帧 OCR（事件驱动 + 节流）
4. 视频区内突发 UI（控制栏/弹窗/面板）不再产生错误字幕

### 非目标（后续候选）

- 鼠标悬停门控（GetCursorPos 悬停期样本低置信）——后续项
- ROI 常驻文本（水印/角标）在线过滤——产物层 watermark_filter 已有兜底，后续项
- WGC 按窗口捕获换底（遮挡场景专项）——后续项
- 变化热力图滑动窗口聚类"视频活动区"（播放区域锁定的进一步）——本期只产出变化包围盒，不聚类

## 3. 总体设计

### 3.1 模块划分（自底向上）

| 模块 | 文件 | 职责 | 依赖 |
|------|------|------|------|
| 网格指纹 | `capture/grid_diff.rs`（新） | `GridDiffDetector`：帧 → 网格指纹 → `changed_cells` + 包围盒 + 带外标志 | 无（纯逻辑） |
| 面板事件 | 同上（`panel_event` 纯函数） | 变化格连通聚类 → 面板出现/消失事件 | 无（纯逻辑） |
| 触发编排 | `live_session_frame.rs`（改） | 两级 diff 接入：ROI 帧判变 + 全帧网格 diff + 带外触发节流；面板事件 → 字幕源头丢弃 | grid_diff、RoiTracker、调度器 |
| 统计 | `ScreenStats`（改） | 增 `panel_filtered` 计数 | — |

`frame_diff.rs` 保留：`Rect`、`crop_frame`、`downscale_bgra`、`DualRateScheduler`、`SampleRegion`。
`frame_diff.rs` 删除：`FrameDiffDetector`、`block_hashes`（测试迁移至 grid_diff_tests.rs，含回归用例）。

### 3.2 GridDiffDetector（核心数据结构）

```rust
/// 网格差异结果（每 tick 一次全帧 + 每次字幕采样一次 ROI 帧）
pub struct GridDiff {
    /// 变化格集合（列优先索引：y * cols + x）
    pub changed_cells: Vec<usize>,
    /// 变化包围盒（帧坐标；无变化为 None）
    pub bounds: Option<Rect>,
    /// 带外变化（包围盒与字幕带无交，或变化格数 ≥ 大面积阈值）
    pub outside_band: bool,
}

/// 网格指纹（纯函数）：帧 → 每格指纹；逐格比较产出 GridDiff
pub struct GridDiffDetector {
    cols: u32, rows: u32,          // 网格密度（全帧 32×18；ROI 帧 8×4）
    samples_per_cell: usize,       // 每格子采样数（默认 8）
    last_fingerprints: Vec<u64>,   // 上一帧指纹（尺寸变化时重建）
    frame_w: u32, frame_h: u32,
}
```

指纹：每格内均匀子采样 `samples_per_cell` 个 BGRA 像素 → 拼成 u64（每样本 8 bit 亮度量化）。格子 ≤ 全帧 576 格 × 8 采样 ≈ 4.6K 像素采样/tick，成本为 OCR 的千分之一量级。

语义：

- 首帧（无基准）视为变化（与现 `has_changed` 一致）
- 帧尺寸变化 → 重建网格索引与指纹（全变视为变化）
- 空帧/尺寸 0 → `changed_cells` 为空（防御）
- 无论是否判定变化，均更新基准指纹（防亚阈值累积，语义同现有实现）

**字幕带定义**（带外判定基准）：复用 `region_tracker::prior_roi` 语义——播放区域内底部 25% 带（`video_rect` 存在时）；无播放区域退化为窗口底部 25% 带。带外 = 变化包围盒与该带无交。

### 3.3 触发决策（process_frame 新控制流）

```
capture 帧（全窗）进入 process_frame
├─ 1) 全帧网格 diff（每 tick 一次，成本 ~4.6K 采样）
│     → changed_cells / bounds / outside_band
│     → outside_band 且距上次全帧 OCR > 2s → 本 tick 强制走全帧路径（覆盖调度 region）
│     → 全帧网格 diff 通过计数驱动 idle_governor（语义不变）
│
├─ 2) region=Subtitle 且非强制全帧：
│     → RoiTracker.decide() 裁剪 ROI 帧
│     → ROI 帧网格 diff（8×4，裁剪后、downscale 前）
│     → 变化 或 force_ocr(15s) → 走字幕 OCR；否则 return（省 downscale + OCR）
│
├─ 3) 全帧路径（region=Full / 带外强制）：
│     → 全帧网格 diff 已算：变化或 force_ocr → 版面分析 + 分区 OCR
│
└─ 4) 面板事件（全帧 diff 的变化格 → 连通聚类，与路径无关）
      → 面板活跃期（滑动窗口，见 3.4）内的字幕 OCR 文本 → 源头丢弃
```

要点：

- **两级 diff 职责分离**：全帧网格 diff 负责"页面级变化 + 带外信号 + idle 信号"；ROI 帧 diff 负责"字幕变化"，与页面/鼠标/动作完全解耦——静止画面下字幕 OCR 频率由 ROI 内容决定
- **force_ocr 语义保留**：单一 `last_ocr_at`（任一路径 OCR 成功刷新），两条路径各自在"未变化但 force_ocr"时放行
- **带外触发节流**：`outside_band` 上升沿 + 距上次全帧 OCR > 2s（`EVENT_FULL_OCR_COOLDOWN_MS`）才强制；下降沿清节流状态
- **大面积阈值**：变化格数 ≥ 全帧网格的 8%（`LARGE_CHANGE_RATIO`）即视为"页面切换"级变化（即使与字幕带相交也触发全帧——翻页时字幕带与页面同变）

### 3.4 UI 面板抑制（REQ-087）

```
变化格集合 → 4-邻接连通聚类 → 聚类面积 ≥ 帧面积 8%（PANEL_MIN_AREA_RATIO）→ 面板候选
连续 2 tick 同一区域出现候选 → 面板出现事件（上升沿）
面板活跃期 = 滑动窗口（确认后 3s，区域内再变化则重置；无变化则窗口自然到期）
```

- 活跃期 = **滑动窗口**：确认后 3s（`PANEL_HOLD_MS`）内有效；期间每次在面板区域再次检测到变化，重置 3s 窗口；无变化时窗口自然到期（**不提前结束**——静止面板是控制栏悬停常态，提前结束会放过它；3s 后残留 UI 文本由 ui_junk 词表 + 投票器兜底，实施微调 2026-08-19）
- 活跃期内 `handle_subtitle_frame` 的文本 → 不进投票器、不落段、不推事件（源头丢弃，`stats.panel_filtered += 1`，诊断可见）
- 全帧路径不受面板抑制（页面内容本身可能是有用画面；控制栏/弹窗内容由 layout/ui_junk/watermark_filter 既有链兜底）
- 误判防护：滚动字幕/弹幕是窄带持续变化（聚类窄长、面积小），不达大面积阈值 → 不误判；面板抑制时间窗短，且原料层不动（ADR-006），可复查
- 阈值参数化（const，验收后按真实会话校准）

### 3.5 保留语义（回归红线）

| 机制 | 现状 | 新设计 |
|------|------|--------|
| DualRateScheduler | 双速率 tick 调度 | 不变 |
| FORCE_OCR 15s | 全帧 diff 漏检兜底 | 不变（两条路径共用） |
| idle_governor | 依赖 diff 通过计数 | 由全帧网格 diff 通过计数驱动（等价） |
| RoiTracker | 锁定/重扫/前台切换冻结 | 不变 |
| SubtitleVoter | 多帧投票/滚动过滤 | 不变（面板抑制在其上游） |
| ui_junk / watermark_filter | 文本特征 / 区域稳定性 | 不变 |

## 4. 错误处理与边界

- 帧尺寸变化：GridDiffDetector 重建网格（无 panic；变化判定为"全变"）
- 空帧/零尺寸：返回空变化（防御，不触发）
- ROI 裁剪为空（窗口移动瞬间）：现逻辑 return，不触发（不变）
- OCR 失败帧：不计入面板事件（失败 ≠ 无文本，与 RoiTracker 语义一致）
- 窗口关闭/越界/捕获失败：既有 ADR-007/TD-033 路径不变
- 带外触发在 idle 期：idle_governor 探针逻辑不变（probe 强制 Full 与带外触发互不冲突，二者都是"强制全帧采样"的既有入口）

## 5. 测试计划

### 单元测试（grid_diff_tests.rs，AAA）

1. 静止帧（两帧相同）→ 零变化、bounds=None、outside_band=false
2. 局部变化命中：构造 1920×1080 静止底图，在**任意位置**（左上/中/右下/左对齐边缘）画一个小文字块 → changed_cells 非空、bounds 覆盖该区域
3. **回归用例（本次 bug）**：1920 宽静止帧 + 底部左对齐字幕行变化 → 命中（旧 8 块采样在文档中已证伪：采样列仅 {0,480,960,1440}）
4. 字幕带内 vs 带外：变化位于字幕带内 → outside_band=false；位于带外 → outside_band=true
5. 大面积变化（≥8% 格数）→ outside_band=true（即使与带相交）
6. 首帧视为变化；尺寸变化视为变化并重建；空帧防御
7. 面板聚类：单块大字（一个聚类、面积小）→ 非面板；多块同帧出现（≥8% 面积）→ 面板候选；窄带滚动（长条）→ 非面板

### 集成测试（live_session_frame_tests.rs）

8. ROI 帧判变：ROI 外变化（构造帧只在带外画块）→ 字幕路径不触发；ROI 内变化 → 触发
9. 带外触发节流：outside_band 上升沿强制全帧；2s 冷却内不重复
10. 面板活跃期丢弃：面板事件期间 handle_subtitle_frame 输入 → 不产出段、panel_filtered 计数增长

> **实施说明（2026-08-19）**：8/9/10 的**逻辑内核**已由 grid_diff_tests 覆盖（任意位置判变/带外判定/面板状态机与门控判定），但 process_frame 编排层因依赖 COM 采样器（ScreenCaptureSampler 非 Send、线程内创建）无法在单测中实例化，编排接线由 M4 真机验收覆盖（§7 验收标准 1-3 直接对应 8/9/10 的端到端语义）。

### 真机验收（对照 §7）

## 6. 实施拆分

| 里程碑 | 内容 | 验收 |
|--------|------|------|
| M1 | `grid_diff.rs` 纯函数 + 全量单测（含回归用例）；删除 `FrameDiffDetector` | `cargo test` 全过 |
| M2 | process_frame 两级 diff 接入 + 带外触发节流 + ScreenStats 扩展 | 集成测试 8/9 过；真机：翻页 ≤2s、字幕 ≤2s |
| M3 | 面板事件检测 + 字幕源头丢弃 | 集成测试 10 过；真机：控制栏悬停无错误字幕 |
| M4 | 真机验收 + 参数校准（网格密度/阈值/节流） | §7 验收标准全过 |

## 7. 验收标准

1. 静止幻灯片 + 字幕行变化：≤2s 触发字幕 OCR（对比现状：概率漏检 + 15s 兜底）
2. 幻灯片翻页：≤2s 全帧 OCR 产出（对比现状：≤5s + 可能漏检）
3. 播放器控制栏悬停出现：不产生字幕段（panel_filtered 计数可见）
4. 切换其他软件页面：仍能触发（不回归；识别内容为当时实际画面，不做承诺）
5. 静止画面下 OCR 推理次数不高于现状（ROI 精确判变的收益）
6. 现有全部测试通过，无回归

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 带外触发参数不当 → 全帧 OCR 频率上升 | 默认 2s 节流 + 8% 大面积阈值；验收阶段实测校准 |
| 面板事件误判（视频内快速场景切换） | 抑制仅作用于字幕路径 + 3s 短窗 + 原料层不动可复查 |
| 高分屏小字漏检 | 网格密度参数化（默认 32×18），真机校准 |
| 网格统计新增每 tick 成本 | ~4.6K 采样 ≈ 微秒级，OCR 的千分之一量级，可忽略 |

## 9. 遗留问题

- 悬停门控（GetCursorPos）与"视频区内老师用鼠标标注"的误判权衡——后续项
- 变化热力图滑动窗口 → "视频活动区"聚类（播放区域锁定的下一步）——后续项

## 10. 实施微调记录（2026-08-19 落地，ADR-011 M1-M3）

实现与设计的差异（保持一致性的登记）：

1. **`GridDiff` 不含 `outside_band` 字段**：带外判定改为纯函数 `is_outside_band(bounds, band, changed_ratio, large_change_ratio)`，字幕带由调用方传入（`RoiTracker::subtitle_band()`，即 `prior_roi` 语义）——grid_diff 模块不感知字幕带概念，更内聚。
2. **`diff_pass`/`diff_skip` 统计口径更新**：由全帧网格差异驱动（diff_pass = 画面变化 tick 数、diff_skip = 画面静止 tick 数）——idle_governor 依赖 diff_pass 增长作"画面变化"信号，必须与 OCR 路径解耦，否则静止画面下 OCR 跳过会误触发空闲降频。
3. **触发状态打包 `TriggerState`**（live_session_frame.rs）：full_grid/roi_grid/panel/last_ocr_at/last_full_ocr_at 一个结构传入 process_frame，避免参数膨胀。
4. **面板丢弃位置**：OCR 成功后、`handle_subtitle_frame` 调用前门控（`panel.is_active()` → `stats.panel_filtered += 1` 并跳过）——与 ROI 回喂（`feed_ocr`）解耦，面板期间 ROI 跟踪不冻结（控制栏消失后字幕立即恢复）。
5. **FORCE_OCR 15s 保留**：两条路径共用 `last_ocr_at`（任一路径 OCR 成功刷新）；全帧 OCR 成功额外刷新 `last_full_ocr_at`（带外触发冷却基准）。
6. **带外强制全帧对 `latest_frame` 缓存的影响**：缓存判断使用**最终 region**（审查修复 2026-08-19）——带外强制全帧时本 tick 为全帧数据，必须缓存（原按原始 region 判断导致截图命令读到旧帧）。
7. **面板"消失提前结束"删除**：原设计的"区域连续无变化 0.5s 提前结束"与静止面板（控制栏悬停后停住、不再产生变化格）冲突——会放过静止 UI。活跃期改为纯滑动窗口（确认后 3s，区域内再变化重置，无变化则自然到期）；3s 后的残留 UI 文本由 ui_junk 词表 + 投票器兜底（详见 §3.4）。
8. **活跃期重置不校验 bbox 重叠**（审查说明 2026-08-19）：活跃期内任何大面积变化（含翻页/场景切换）都重置窗口——翻页瞬间字幕本就在变，多丢弃 ≤3s 可接受；校验重叠会引入"面板区域漂移"复杂状态，收益低。
