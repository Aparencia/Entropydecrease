# 长期优化完整清单——规则/阈值/词表持续校准项（2026-08-20）

> **状态**: 前瞻调研（未排期，2026-08-20 代码↔文档↔git 三方核验产出）
> **视角**: 与 [long-term-optimization-inventory.md](./long-term-optimization-inventory.md)（接线/排期视角）互补——本清单聚焦**"做完一次不算完"的持续校准类条目**：
> 黑名单/词表扩充、阈值调参、提示词防漂移、回归语料增长。识别标记：`JSON 可校准` / `真机样本校准保留` / `golden 回归` / `留待数据支撑`。
> **核验方法**: 全部条目经源码模块（`app/src-tauri/src/`）+ 版本文档（`docs/versions/`）+ git 提交三处交叉确认；状态以代码为准（多数已从"已排期"变为"已实施"）。

---

## 一、过滤规则类（黑名单/特征库 + 阈值，最多最典型）

| # | 条目 | 代码模块 | 出处/状态 | 长期优化形态 |
|---|------|---------|----------|-------------|
| F1 | 字幕 UI 垃圾源头过滤 `is_ui_junk`（REQ-083） | `ui_junk.rs` + 数据目录 `ui_junk.json` | v0.6.0 **已实施** | 黑名单 JSON 可校准（内置默认+JSON 合并）；真实会话 8/11 垃圾样本 |
| F2 | 视频页 UI 垃圾 VideoPageUi（REQ-166） | `ui_junk.rs`（`JunkCategory::VideoPageUi`）+ `ui_junk_tests.rs`（1.3万0/qh202522/充电专属 用例） | v0.7.5 **已实施** | 词表 JSON 可校准；正文数字不误杀（数字量词正则边界） |
| F3 | 直播互动元素扩充（REQ-157） | `ui_junk.rs`（LiveUi 类别）+ `screens.rs` 共现判定 | v0.7.3 **已实施** | 黑名单扩充 + 启发式兜底；会话29 平台 UI/IDE 污染根治 |
| F4 | 水印/台标/角标过滤（REQ-059） | `watermark_filter.rs`（区域稳定性×文本不变性）+ `screens.rs`/`analysis.rs` 消费 | v0.6.0 **已实施** | `WatermarkConfig` 阈值校准；已知误杀场景：老师固定位置常驻提示语；产物层可逆 |
| F5 | 首页/窗口过滤模式表 | `window_filter.rs`（`SITE_HOMEPAGE_TITLES`）+ `windows.rs` | v0.7.2 **已实施** | 模式表可扩展；bilibili 标题变体未全覆盖——真机样本校准保留（tech-debt 观察项） |
| F6 | 滚动字幕/弹幕过滤（REQ-037） | `subtitle.rs`（is_scrolling LCS ≥60%） | v0.4.0 **已实施** | LCS 阈值 + "位移稳定方向判定增量留待数据支撑" |
| F7 | 滚动字幕防误杀确认器（REQ-112） | `live_frame_process.rs`（连续 N 帧确认） | v0.7.0 **已实施** | CORE-O5：单帧疑似不丢弃，N 帧确认 |
| F8 | 面板抑制（REQ-087） | `capture/grid_diff.rs`（PANEL_HOLD_MS、≥8% 帧面积） | v0.6.0 **已实施** | 阈值按分辨率调校，"长期维护成本高"（ADR-011 自认）；翻页误伤已权衡 |
| F9 | 音频事件过滤（REQ-105） | `audio_event_filter.rs` + `audio_event_filter.json` | v0.7.0 **已实施** | 三阈值 JSON 可校准；**校准 API 已留未接线**（见 §六） |
| F10 | OCR 错误模式校准表（REQ-120） | `ocr_confusion.rs`（影子层） | v0.7.0 影子层 | 混淆对画像 → 替换/校准表，数据驱动 |
| F11 | OCR 错字纠错（REQ-168） | `ocr_correction.rs` + `ocr_correction.json`（种子表合并） | v0.7.5 **已实施** | 种子表 JSON 校准合并；无映射不猜（保守） |
| F12 | 导入链路净化对齐（REQ-117） | `import_frame.rs`（落库前 is_ui_junk） | v0.7.0 **已实施** | 导入/实时双入口同表同口径（PRE-O6） |
| F13 | 结构图过滤（REQ-182） | `structure_detect.rs`（diagram_likeness 0.5/形状约束 h≥3 w≥6/密度 0.04~0.6/墨迹 160）+ `structure_capture.rs` + `structure_store.rs`（STRUCT_BUDGET_AUTO=80） | v0.7.7 **实施中** | 注释自证"合成网格标定，真机调参"；"实现校准：真实流程图页密度高被判 Text"（已修正一次 `a399365`） |

## 二、笔记净化规则链（表驱动规则 + 黄金语料回归）

| # | 条目 | 代码模块 | 出处/状态 | 长期优化形态 |
|---|------|---------|----------|-------------|
| N1 | note_filter 过滤链（REQ-082/162/163/165/170/171） | `note_filter.rs`（RULE_VERSION=note-rules-0.7.6） | v0.7.5/0.7.6 **已实施** | 单一管线双出口；规则版本化元数据（可回答"用哪版规则生成"） |
| N2 | **过渡短句/修辞问句净化（v0.7.5 增补）** | `note_filter_discourse.rs`（TRANSITION_PHRASES 21 条 + QUESTION_WORDS 15 条） | v0.7.5 增补 **已实施** | 表驱动；注释自证"边界全部钉在单测与黄金语料里"；宁漏勿误 |
| N3 | AI 复核边界段分类（REQ-085） | `note_filter_ai.rs`（六类边界段分类器） | v0.6.0 **已实施** | 规则判不了 → AI 三态判定；纯规则输出为兜底基线 |
| N4 | **黄金语料回归集（REQ-172/181）** | `note_filter_golden_tests.rs`（会话31/29 夹具） | v0.7.5/0.7.6 **已实施** | 长期优化基础设施：新增规则先写失败测试（TDD）；全量回归一键跑；v0.7.6 已扩展带结构断言 |
| N5 | 净化阈值配置化（REQ-173） | `purify_config.rs` + `purify_config.json` | v0.7.5 **已实施** | 120字/60s/0.5/0.6 集中常量 JSON 校准 |
| N6 | 结构渲染配置（REQ-179） | `structure_note.rs`（NoteStructureConfig：glossary_max_terms=20 防噪音）并入 PurifyConfig | v0.7.6 **已实施** | JSON 可校准；全关 = v0.7.5 输出逐字节一致（零回归护栏） |
| N7 | 符号映射表（REQ-060） | `symbol_normalize.rs`（中文数字/希腊字母/运算符/快捷键） | v0.6.0 **已实施** | 映射表 JSON 可校准；词边界守卫防"派别/学派"误伤 |
| N8 | 结巴折叠 + 术语替换（REQ-164） | `stutter_fold.rs`（白名单矩阵：慢慢/常常不折叠） | v0.7.5 **已实施** | 叠词白名单可扩充；「项目班」→「项目班子」glossary 复用 |
| N9 | 口语书面化（REQ-162/045） | `verbal_normalize.rs`（保守档） | v0.5.0/v0.7.5 **已实施** | 语料驱动；净化后文本才做精确去重（顺序契约） |
| N10 | 术语表自动构建（REQ-046/061） | `glossary.rs`（TF-IDF 文档权重 + 缩略词低阈值召回 + 水印词排除） | v0.5.0/v0.6.0 **已实施** | 术语候选质量 golden；与热词闭环联动 |
| N11 | 热词/替换词表（REQ-040） | `vocab.rs`（JSON 持久化；替换词做 OCR 后纠错） | v0.4.0 **已实施** | 用户确认制（OCR 误识别词不得自动进热词）；长词优先顺序替换 |
| N12 | 重复合并升级（REQ-118） | `asr_dedupe.rs`（归一化比较 + 短语级 Jaccard） | v0.7.0 **已实施** | POST-O7：语义重复（重叠率 ≥0.6）误判率问题的升级路径 |
| N13 | 后续挂接点（未实施） | — | 延期/架构 | X-O2 单一管线收敛（过滤→书面化→结构化→模板化）；C5 后处理流水线面板（各环节开关+顺序+强度可视可调）——典型长期优化载体 |

## 三、AI 层（提示词资产 + 防漂移）

| # | 条目 | 代码/位置 | 出处/状态 | 长期优化形态 |
|---|------|----------|----------|-------------|
| A1 | AI 复核提示词模板（REQ-085） | `prompts/text_filter.json`（`ai_text_filter.rs` include_str 编译期捆绑） | v0.6.0 **已实施** | 模板独立可校准 + 真实样本 few-shot（口头禅删/技术保留/破碎句删/截断句 merge） |
| A2 | AI 精修/补充提示词（REQ-141/142） | 按档案模板（12 档案分组） | v0.8.0 **已排期** | AiRefine/AiEnrich 协议；精修=整理不创作 |
| A3 | 提示词 golden 冒烟回归（REQ-147） | — | v0.8.0 **已排期** | 固定样本断言结构不漂移；提示词改动有回归护栏 |
| A4 | 成本校准单价表（REQ-143） | note_ai_usage 落库 | v0.8.0 **已排期** | token 预估偏差记录 → 校准单价表 |
| A5 | 已搁置登记项 | — | 2026-08-19 头脑风暴 | Prompt 资产治理全量、AI 质量基准 golden 会话集（样本收集+标注成本高） |

## 四、算法/模型参数调优类（阈值体系持续校准）

| # | 条目 | 代码模块 | 出处/状态 | 长期优化形态 |
|---|------|---------|----------|-------------|
| T1 | 置信度体系真实化（REQ-098） | `asr_rescore.rs`（重打分一致性替代硬编码 0.9） | v0.7.0 **已实施** | 校准矩阵 spike；重打分一致性≠识别置信度，口径标注 |
| T2 | VAD 阈值自适应（REQ-069/115） | `vad_adaptive.rs`（会话内能量统计自适应）+ 共享槽 | v0.6.0/v0.7.0 **已实施** | 阈值随会话自适应；诊断面板可查 |
| T3 | OCR 加权投票（REQ-065） | `subtitle.rs`/`live_frame_process.rs`（清晰度×score 加权 + 帧间 tracking） | v0.6.0 **已实施** | score 暴露面；字符平权 → 加权演进 |
| T4 | DTW 时序对齐（REQ-063） | `dtw_align.rs`（影子层 L3，未接线） | v0.6.0 机制先行 | spike 门未过：等音频落盘实测漂移分布，有收益才接入（"无收益则裁剪"） |
| T5 | 播放器暂停检测（TD-F / 观察 S-L12） | 播放器行为信号（REQ-125） | tech-debt carried | 真机播放器样本校准保留；需形状约束（中央连通亮块/双竖杠） |
| T6 | 说话人 embedding 阈值（观察 3） | speaker 引擎 MIN_SEGMENT_MS=0.5s | tech-debt 观察 | 真机样本校准阈值保留；<0.5s 段跳过（误判比漏判更伤） |
| T7 | 档案检测反馈闭环（#11/#12/#14） | `video_profile` 记忆库 | Foresight 第二批 | 关键词命中统计 + 会话后复盘自动修正记忆——用户改选=免费标注集，越用越准 |
| T8 | 语速停顿自适应（REQ-154） | `asr_merge.rs`（动态合并阈值 clamp 300-900ms + 语速骤变 ≥40% 事件） | v0.7.2 **已实施** | S-1/S-2 自适应阈值；暂停边沿重置防假事件 |
| T9 | 音频预处理链（REQ-101） | `audio_preproc_config.rs` + `bin/cer_bench.rs` | v0.7.0 **已实施** | CER 微基准定默认值；设置 UI 开关 |
| T10 | 跟练口令短语表（REQ-123） | `follow_along_detect.rs` + `follow_along.json`（cue/demo/practice 三组） | v0.7.0 **已实施** | 口令短语 JSON 可校准（同 ui_junk 模式——无法用 JSON 删默认项，防误删） |
| T11 | 代码域映射表（REQ-121 M13） | v0.7.0 登记 | 已排期 | "下划线 init"→`_init` 映射表 JSON 可校准（沿用 REQ-060 模式） |
| T12 | 术语锚点词边界（TD-B） | 已偿（`1b24168`） | 已清偿 | 词边界+大小写折叠匹配——同类规则持续演进先例 |

## 五、长期演进方向（架构级，明确标注"长期"）

| # | 方向 | 出处 | 状态 |
|---|------|------|------|
| L1 | WGC 捕获（Windows.Graphics.Capture） | ADR-002 | 长期演进方向保留，不构成当前替换理由 |
| L2 | M10 分应用音频路由（REQ-126） | `audio_route_probe.rs` spike 已过 | 环回污染根治；F9 降为兜底 |
| L3 | 持久元素自学习（同 bbox 位置+长期不变小块自动标记 UI） | v0.7.3 头脑风暴第二波 | 一帧学会全课过滤；依赖 bbox 落库（已具备） |
| L4 | TD-040 ffmpeg 捆绑体积权衡 | tech-debt carried | deliberate 有意不修，保持观察 |
| L5 | 词级时间戳（L7） | 依赖 sherpa-onnx 上游暴露 | 提取函数+单测已就位，启用点=V1.0 升级/FFI |
| L6 | 图像流接线（L4，`image_stream_store.rs`） | TD-2026-08-19-D carried | 待"图像优先档"档案组（跟练/白板/题目讲解） |

## 六、校准口子"已留未接线"（值得优先关注）

| # | 位置 | 现象 | 建议 |
|---|------|------|------|
| W1 | `audio_event_filter.rs::load_pattern_config` | `#[allow(dead_code)]` 豁免；注释"生产链路暂用默认配置，本函数为校准 API（单测覆盖）" | 接进装配链（app_setup.rs），audio_event_filter.json 生效 |
| W2 | `follow_along_detect.rs` | 注释"校准文件接入时启用（同 ui_junk 模式）——当前生产用内置" | 同上，接线 follow_along.json |
| W3 | `ocr_confusion.rs` | 影子层（REQ-120 校准表） | 数据驱动填充，随真实混淆画像积累 |

---

## 七、核心结论

1. **过滤规则类（13 项）是长期优化主战场**——全部为"黑名单/特征库+阈值"形态，设计上留了 JSON 校准口子，随真实会话样本持续扩充。
2. **黄金语料回归集（N4）是规则迭代的地基**——REQ-172→REQ-181 持续扩展，新增规则必须先写失败测试，防止"按下葫芦浮起瓢"。
3. **三个"校准口子已留未接线"（§六）**——零成本接线收益，属低挂果实。
4. **状态需批量刷新**：大部分条目已实施（非"已排期"）；v0.7.7 结构图过滤（F13）是当前唯一"实施中"的规则类条目。

## 关联

- [长期优化清单·接线/排期视角](./long-term-optimization-inventory.md) · [需求池远期区段](../product/requirements-pool.md) · [技术债台账](../archive/2026-08-20/tech-debt.md) · [v0.7.5](../versions/v0.7.5.md) · [v0.7.6](../versions/v0.7.6.md) · [v0.7.7](../versions/v0.7.7.md)
