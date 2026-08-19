# 2026-08-19 归档索引

> 当日工作：结构模型版落地（版面/表格/公式模型引入 + 按需下载 + 课后精修，REQ-047/049/050 模型版）
> + 新增代码审查（H1-H3/M1/M2/M4/L1/L3 当日全部修复，提交 c5eae08 + 65c950a）+ 文档归档。

## 归档清单

| 源路径 | 归档路径 | 状态 |
|--------|---------|------|
| docs/Foresight/brainstorming-video-types.md | docs/archive/2026-08-19/brainstorming-video-types.md | [ ] 已归档（六轮头脑风暴已全部落地——五类视频档案 REQ-043/044/045/046/047/048/049/050/051/052/055 均已实施；结论进入 v0.5.0 规划并实施完成，生命周期终结） |
| docs/Foresight/brainstorming-classroom-assistant-gaps.md | docs/archive/2026-08-19/brainstorming-classroom-assistant-gaps.md | [ ] 已归档（四维缺口评估 50 项：§9 裁决 22 项已排期 v0.6.0（REQ-059~080，登记于需求池与 v0.6.0 规划）；未选与远期项保留于归档副本待议，决策生命周期终结） |

- **未归档**：ADR-010（补缝式 AI 决策，当前生效——V1.0 云端实装继续引用）；brainstorming-no-cloud-ai-extraction-limit.md（V1.0 规划持续引用）；brainstorming-classroom-assistant-mechanisms.md + fed-guide（v0.5.0/v0.6.0 机制编号 E9/B6/C1/Q1/AL4 等仍在引用，供后续头脑风暴输入）；versions/、standards/、product/ 内容（持续活跃）

## 技术债摘要（滚动自 2026-08-18 清单）

- **未偿 1 笔**：TD-040（P2，deliberate carried——ffmpeg 捆绑与安装包体积权衡，保持观察）
- **今日已偿 8 笔**（审查发现即修复，提交 c5eae08 + 65c950a + 0197560）：
  - H1 精修裁剪图路径错误（critical）——注入会话图片库绝对目录
  - H2 同帧双写覆盖（high）——crop/ 命名空间隔离 + 回归测试
  - H3 公式高精度档切换失效（high）——structure_tier 档位持久化 + 装配路径跟随
  - M1 下载无 Content-Length 校验（medium）——截断下载不再静默成功
  - M2 running 标记 spawn 失败残留（medium）——失败分支清理
  - M3 精修候选匹配不可靠（medium）——best_table bbox 面积选择 + 降级提示对齐
  - M4 精修 N 次全量回填（medium）——单次 replace_artifact
  - L1/L3 前端进度/豁免清单（low）——progress 监听 + 豁免补登
- 累计已偿：昨日 45 笔 + 今日 8 笔 = 53 笔
- **归档日追加**（缺口评估文档归档）：纯文档变更，无新增技术债；TD-040 维持 carried（唯一权威清单见 tech-debt.md）

## 备注

- 归档采用 `git mv`（保留历史链）；活跃区引用已更新（Foresight README 索引改指归档路径 + v0.6.0 规划链接同步）
- 下个归档日需先整理本清单（当前仅 TD-040 carried）

---

## 二轮归档（同日，v0.6.0 M1 提取纯度交付 + 新增代码审查 + 市场调研归档）

> v0.6.0 M1（REQ-059/060/061/082/083/084/085）代码交付完成（8 个提交 cecf9f6..9fa8931）+
> 新增代码审查（七维检查）产出 4 项问题全部即修（提交 463dbf4）+
> 市场技术栈调研文档归档（技术栈 2026-08 已裁决，使命终结）。

### 归档清单（二轮）

| 源路径 | 归档路径 | 状态 |
|--------|---------|------|
| docs/Foresight/market-stack-asr-notes-research.md | docs/archive/2026-08-19/market-stack-asr-notes-research.md | [ ] 已归档（市场技术栈/ASR/笔记生成调研：2026-08 支撑 Tauri 技术栈裁决，选型已固化于 AGENTS.md §2 与 product/README.md，调研使命生命终态；活跃区链接已改指归档路径） |

- **未归档**：brainstorming-no-cloud-ai-extraction-limit.md（V1.0 规划持续引用）、brainstorming-classroom-assistant-mechanisms.md + fed-guide（后续头脑风暴输入）、versions/、standards/、product/ 内容（持续活跃，多轮先例）

### 技术债摘要（二轮滚动）

- **未偿 1 笔**：TD-040（P2，deliberate carried——M1 代码未涉模型分发/捆绑，二次核对维持观察）
- **今日追加已偿 4 笔**（M1 新增代码审查即修，提交 463dbf4）：
  - R1 AI merge 目标丢失错拼无关段（medium）——保守恢复原段 + 回归测试
  - R2 复核命令未拦截 recording 会话（medium）——与 preview 口径一致
  - R3 复核缓存键不含上下文（low）——键纳入全送审内容
  - R4 符号规则逐段重复排序（low）——排序移至构造期
- 累计已偿：53 + 4 = 57 笔

---

## 三轮归档（同日，v0.6.0 M2-M6 交付 + 新增代码审查）

> v0.6.0 M2-M6（REQ-062~085：融合时间戳/画面提取/音频信号/性能资源/会话体验）
> 全部代码交付完成（~20 提交，626d4f9..dd9a84d）+ 新增代码审查（七维检查）
> 产出 6 项问题全部即修（提交 8582083）。

### 归档清单（三轮）

- **本轮无文档移入归档**：无新增满足归档判定标准的文档——v0.6.0.md（开发完成待 M7 真机验收，活跃）；
  多轮先例保留项（no-cloud-ai / mechanisms + fed-guide / versions/ / standards/ / product/）维持活跃；
  本轮代码文档（实施状态标注/行数豁免登记）已随代码提交落库，非归档对象。

### 技术债摘要（三轮滚动）

- **未偿 1 笔**：TD-040（P2，deliberate carried——M2-M6 代码未涉模型分发/捆绑，三次核对维持观察）
- **今日追加已偿 6 笔**（M2-M6 新增代码审查即修，提交 8582083）：
  - R5 笔记预览未转义 HTML——恶意字幕注入（high）——renderMarkdown 全文本 escapeHtml
  - R6 融合兜底把无置信度核对段标 0.5——note_filter 低置信误删（medium）——OverlapDecision 枚举重构 + 回归断言
  - R7 预览 AI 判定不落库——预览/落库不一致（medium）——TextFilterReview.decisions 回传
  - R8 图片去重仅最近一张——PPT 往返重复存图（medium-low）——8 张 FIFO 指纹缓冲
  - R9 段搜索片段字节切片 panic 面（low）——get(..pos) 安全化
  - R10 audio_store path() 死代码（low）——删除
- 累计已偿：57 + 6 = 63 笔（今日累计 18 笔：H1-H3/M1-M4/L1/L3 + R1-R10）

---

## 四轮归档（同日，ADR-011 实施交付 + 新增代码审查 + 设计规格归档）

> ADR-011（REQ-086/087：网格差异 OCR 触发重做 + UI 面板抑制）实施交付
> （提交 9b034f1）+ 新增代码审查（七维检查，范围 = 新增代码及其直接关联调用）
> 产出 2 项问题全部即修（提交 8aab331）+ 设计规格归档（M1-M3 已实施，M4 真机验收待执行）。

### 归档清单（四轮）

| 源路径 | 归档路径 | 状态 |
|--------|---------|------|
| docs/Foresight/2026-08-19-ocr-trigger-redesign.md | docs/archive/2026-08-19/2026-08-19-ocr-trigger-redesign.md | [ ] 已归档（ADR-011/REQ-086/087 设计规格：M1-M3 已实施完成（659 单测全绿），M4 真机验收待执行；活跃区链接已改指归档路径——ADR-011/需求池/v0.6.0 状态行/Foresight README 索引） |

- **未归档**：ADR-011（当前生效决策，docs/adr/ 保留）；需求池 REQ-086/087 条目（已实施，活跃）；多轮先例保留项（no-cloud-ai / mechanisms + fed-guide / versions/ / standards/ / product/）维持活跃

### 技术债摘要（四轮滚动）

- **未偿 1 笔**：TD-040（P2，deliberate carried——本轮代码未涉模型分发/捆绑，四次核对维持观察）
- **今日追加已偿 2 笔**（ADR-011 新增代码审查即修，提交 8aab331）：
  - R11 latest_frame 缓存按原始 region 判定——带外强制全帧时全帧未缓存，截图命令读到旧帧（medium-low）——缓存判断移至最终 region 决定后（force_full 时本 tick 为全帧数据必须缓存）
  - R12 文档状态同步遗漏——需求池 REQ-086/087 仍"已排期"、v0.6.0.md 未标注 ADR-011 实施、规格 §5 集成测试承诺未落地（low）——需求池转"已实施"、v0.6.0 状态行补充、规格 §5 注明编排层由真机验收覆盖（COM 采样器无法单测）
- 累计已偿：63 + 2 = 65 笔（今日累计 20 笔）

## 归档索引（docs/archive/README.md 汇总行追加）

| 归档日期 | 内容摘要 | 未偿债务 |
|----------|---------|----------|
| 2026-08-19（四轮） | ADR-011 实施交付（REQ-086/087 网格差异触发 + 面板抑制，提交 9b034f1）+ 新增代码审查：R11/R12 即修（8aab331）；ocr-trigger-redesign 设计规格归档（[ ] 已归档，M1-M3 实施完成待 M4 真机验收）；累计已偿 65 笔 | TD-040（P2，deliberate carried），共 1 笔 |

---

## 五轮归档（同日，ADR-012 实施交付 + 新增代码审查 + 取证报告归档）

> ADR-012（流式 ASR 质量修复：截断/短句/断句，F1-1~F3-2 全部落地）实施交付
> （提交 49614c2 + 005438e + 3a7d497）+ 新增代码审查（七维检查，范围 = 新增代码
> 及其直接关联调用）产出 4 项问题全部即修（提交 e41f6cc）+ ASR 取证报告归档
> （调研取证已完成，ADR-012 落地后使命终结）。

### 归档清单（五轮）

| 源路径 | 归档路径 | 状态 |
|--------|---------|------|
| （新产出调研文档，初始放置于归档夹，git 已跟踪 443cce0） | docs/archive/2026-08-19/2026-08-19-asr-forensic-report-13.md | [ ] 已归档（13.wav 取证：正常电平下 4/16 段句尾真实丢字 + 离线复核证明音频完整——ADR-012 截断根因证据；调研使命终结，ADR-012 §背景 引用） |
| （同上） | docs/archive/2026-08-19/2026-08-19-asr-forensic-report-12-13.md | [ ] 已归档（12/13.wav 首轮取证：12.wav 全文件 RMS 峰值 0.004 < 静音阈值——低电平质量崩坏证据；调研使命终结） |

- **未归档**：ADR-012（当前生效决策，docs/adr/ 保留，参考节已改指归档路径）；多轮先例保留项（no-cloud-ai / mechanisms + fed-guide / versions/ / standards/ / product/）维持活跃

### 技术债摘要（五轮滚动）

- **未偿 1 笔**：TD-040（P2，deliberate carried——本轮代码未涉模型分发/捆绑，五次核对维持观察）
- **今日追加已偿 4 笔**（ADR-012 新增代码审查即修，提交 e41f6cc）：
  - L1 streaming_asr.rs 残留重复注释（low）——删除
  - L2 asr_forensic.rs BLOCK_MS 未用常量（low）——删除
  - L3 streaming_asr.rs 320 行超限未登记豁免（low）——line-limit-exemptions.md 补登记
  - L4 live_session.rs 豁免登记行数过期（~351→600，近硬拆红线）（medium-low）——登记更新 + 拆分计划明确化
- 累计已偿：65 + 4 = 69 笔（今日累计 24 笔）
- **无新增编号债务**：F2-3 AGC 默认关为 ADR-012 设计决策（env 先行，随 REQ-041 微基准推进），非债务；真机验收（3 节课对比）为 ADR-012 合规待办，随 v0.6.0 M7 执行

## 归档索引（docs/archive/README.md 汇总行追加）

| 归档日期 | 内容摘要 | 未偿债务 |
|----------|---------|----------|
| 2026-08-19（五轮） | ADR-012 实施交付（流式 ASR 质量修复 F1-1~F3-2，提交 49614c2+005438e+3a7d497，691 单测全绿）+ 新增代码审查：L1-L4 即修（e41f6cc）；ASR 取证报告 2 份归档（[ ] 已归档，调研使命终结）；累计已偿 69 笔 | TD-040（P2，deliberate carried），共 1 笔 |

---

## 六轮归档（同日，F4-1/F4-2 交付 + 捕获修复链 + 新增代码审查）

> ADR-012 F4-1（语义级合并）/F4-2（标点恢复）交付（提交 e30b276 + fbc1630，
> 回归修复 babb58a）+ 视频画面版面误判断链修复（提交 63bb1d6）+ 新增代码审查
> （七维检查，范围 = e41f6cc..HEAD 新增/变更代码及其直接关联调用）产出
> 5 项问题全部即修（提交 a2e31b1）。

### 归档清单（六轮）

- **本轮无文档移入归档**：无新增满足归档判定标准的文档——ADR-012 追加修订
  （F4-1/F4-2）仍为**当前生效决策**（docs/adr/ 保留，真机验收随 v0.6.0 M7 执行）；
  CHANGELOG / standards / versions / product 持续活跃；多轮先例保留项
  （no-cloud-ai / mechanisms + fed-guide）维持活跃。

### 技术债摘要（六轮滚动）

- **未偿 1 笔**：TD-040（P2，deliberate carried——本轮代码（F4-1/F4-2/捕获修复）
  未涉模型分发/捆绑，六次核对维持观察）
- **今日追加已偿 5 笔**（六轮新增代码审查即修，提交 a2e31b1）：
  - R13 区域路径整帧回退以原始块为空判定——低分/垃圾块（播放器时间码等）使整帧兜底失效（medium）——has_useful_blocks 过滤后判定 + 单测
  - R14 标点下载脚本 fp32 兜底文件名 model.onnx 与运行时 model.int8.onnx 约定不符（medium）——兜底下载后重命名 + Node ≥18 注明
  - R15 裁剪图去重跨命名空间误判（crop ↔ full 同图返回错误路径且不落盘）（medium-low）——dedupe_hit 命名空间限定 + 回归测试
  - R16 live_session.rs 691 行超 600 硬拆红线（豁免登记过期 + 拆分承诺未兑现）（medium）——豁免登记更新至 ~691 + M7 强制拆分
  - R17 行数豁免登记过期批量更新 + 测试未用变量告警（low）——streaming_asr ~365 / layout_analyzer ~475 / live_frame_process ~491 更新 + 变量下划线
- **补登记已偿 1 笔**：TD-2026-08-19（F4-1 链式合并回归——挂起段覆盖致转写丢失，提交 babb58a，此前仅 ADR 提及未入权威清单）
- 累计已偿：69 + 5 + 1 = 75 笔（今日累计 30 笔）
- **无新增编号债务**：观察项 2 条（low，登记于六轮审查报告，不立债）：标点模型会话级加载未池化（与引擎池"模型只加载一次"架构不一致）；公式启发"长条不贴区域首末行"对稀疏分子小公式的边界回归。真机验收（3 节课对比）仍随 v0.6.0 M7 执行

## 归档索引（docs/archive/README.md 汇总行追加）

| 归档日期 | 内容摘要 | 未偿债务 |
|----------|---------|----------|
| 2026-08-19（六轮） | ADR-012 F4-1/F4-2 交付（e30b276+fbc1630，回归 babb58a）+ 视频画面版面误判断链修复（63bb1d6）+ 新增代码审查：R13-R17 即修（a2e31b1），712 单测全绿；累计已偿 75 笔 | TD-040（P2，deliberate carried），共 1 笔 |
