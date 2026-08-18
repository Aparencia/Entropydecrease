# 2026-08-18 归档索引

> 首轮基线归档：重构区建立首个提交（45faa07），文档体系（docs-starter-kit/）自此受 git 跟踪。
> 二轮归档（同日）：v0.2.0 实时捕获链路代码审查完成，技术债清单滚动更新。
> 三轮归档（同日）：二次代码审查（P0 发现 DXGI SDKVersion 错误）+ P0/P1 修复完成，技术债再滚动。
> 四轮归档（同日）：技术债专项处理——19 笔未偿债务全部偿还（再分析验证 + 修复），技术债清零；同日追加偿还原生崩溃 TD-032（sherpa-onnx 空热词流）。

## 归档内容

- 本轮无文档移入归档：docs-starter-kit/ 下全部为持续活跃文档（standards/、templates/、product/、versions/、knowledge/index.md，按 archive/README.md 判定标准不归档）
- v0.2.0 新增文档（ADR-001~005、versions/v0.2.0.md）均为**当前生效/活跃**文档，不满足归档条件
- 新增活跃登记：[standards/line-limit-exemptions.md](../../standards/line-limit-exemptions.md)（单文件行数豁免清单，AGENTS.md §3 落地）
- 本轮代码成果（实时捕获链路 + 模型自动下载 + 审查 P0/P1 修复 + 技术债四轮修复）待提交（工作区未提交状态）

## 技术债摘要（四轮滚动）

- 未偿 0 笔：四轮 20 笔全部偿还（TD-001~007/009~014/016/024~028/032；含 P1×2、P2×10、P3×8）
- 今日已偿累计 39 笔：二轮 8 笔 + 三轮 11 笔 + 四轮 20 笔
- 四轮修复要点：TD-024 融合文本比例切分、TD-025 内存 OCR（消灭临时 BMP，TD-012 随之消除）、TD-026 屏幕采样线程化（OCR 不再阻塞音频）、TD-027 cfg(windows) 门控、TD-005 旧 command 全量补校验

## 备注

- 下个归档日需先整理本日清单（当前无 carried 债务）
- 后续归档流程：git log --since= 筛选已实施文档 → 判定 → git mv 入本夹
- 待办：v0.2.0 代码与文档提交后，为已偿项回填偿还提交哈希

## 五轮归档（同日，v0.3.0 构建 + 新增代码审查）

> v0.3.0 版本构建完成（M1 文件导入 / M2 字幕探测优先 / M3 融合停止异步化 / REQ-034 七项质量优化），
> 10 个提交推送 rebuild（e980220..8d0ff95）；新增代码审查产出 3 笔即修（TD-034/035/036）+ 5 笔登记（TD-037~041）。

### 归档清单

| 源路径 | 归档路径 | 状态 |
|--------|---------|------|
| docs-starter-kit/Foresight/classroom-capture-technical-review.md | docs-starter-kit/archive/2026-08-18/classroom-capture-technical-review.md | [ ] 已归档（A 档七项已实施完成，审查结论生命终态；活跃区链接已改指归档路径） |

- 未归档：ADR-006/007/008（当前生效）、brainstorming-no-cloud-ai-extraction-limit.md（V1.0 规划持续引用）、versions/v0.3.0.md（versions/ 内容 + 实施中）

### 技术债摘要（五轮滚动）

- 已偿 3 笔（审查发现即修，提交 8d0ff95）：TD-034（ffmpeg 管道阻塞，P0）、TD-035（融合标记泄漏，P1）、TD-036（生产 ffmpeg 路径注入，P2）
- 新增未偿 5 笔：TD-037（导入全帧 OCR 未缩小，P3）/ TD-038（字幕文件大小上限，P3）/ TD-039（投票器固定阈值，P3）/ TD-040（bundle 未含 ffmpeg，P2）/ TD-041（ASR end_ms 端点滞后，P3）
- TD-033（窗口跨显示器 DXGI）延续未偿（P2）
- 累计已偿 42 笔；未偿 6 笔（详见本夹 tech-debt.md）

## 六轮归档（同日，技术债专项）与七轮归档（同日，实时面板审查）

> 六轮：TD-037~039/041 已偿（提交 1c95c32：区域裁剪整合/字幕大小上限/投票比例阈值/句尾校正），TD-040 标记 deliberate 有意不修。
> 七轮：实时活动面板（REQ-035）+ OCR 修复审查——规范问题当场修复（ClassroomPage 行数豁免更新、REQ-035 需求追溯登记）；新增 TD-042/043 登记（P3 观察）。

### 归档清单（六轮 + 七轮）

- 本轮无文档移入归档：无新增满足归档条件的文档（ADR/versions/Foresight 均活跃；技术审查已于五轮归档）

### 技术债摘要（七轮滚动）

- 累计已偿 42 笔；未偿 4 笔：TD-033（carried，P2）/ TD-040（carried deliberate，P2）/ TD-042（stopping 超时兜底，P3）/ TD-043（前端时间戳估算偏差，P3）

## 十轮归档（同日，v0.4.0 发布 + 新增代码审查）

> v0.4.0（M0–M8）全部实施完成并发布（21 提交推送 rebuild，bbfd28d..7f7eaf0；版本 0.4.0 + CHANGELOG）；
> 新增代码六维审查（4 组并行，引擎/设备层、实时链路、命令/词表层、前端/规范）产出问题清单：
> 核实确认 critical×1 / high×5 / medium×5 / low×10+；即修 0 笔（本次任务仅审查输出），全部登记/记录见下。

### 归档清单（十轮）

| 源路径 | 归档路径 | 状态 |
|--------|---------|------|
| docs/Foresight/brainstorming-classroom-assistant-mechanisms-merged.md | docs/archive/2026-08-18/brainstorming-classroom-assistant-mechanisms-merged.md | [ ] 已归档（机制整合版 v2：v0.4.0 采纳增量 REQ-036~042 已全部实施，规划使命生命终态；活跃区链接已改指归档路径） |

- 未归档：brainstorming-classroom-assistant-mechanisms.md / -fed-guide.md（面向后续版本头脑风暴的活跃前瞻，同 no-cloud-ai 先例保留）；ADR-009（当前生效 ADR）；versions/v0.4.0.md（versions/ 内容不归档）

### 审查纪要（low 级观察，未编号，随下一轮审查合并处理）

- mixdown_prefer_cleanest 非整帧尾部样本静默丢弃（WASAPI 实际不触发）
- recent_ocr_texts ORDER BY 跨会话相对时间戳语义误导 + 冗余 JOIN（无功能影响）
- extract_pptx_text 无单测（合法/超大/非法路径/超页夹具缺失）
- db_sessions.rs use 声明置于文件底部（风格）
- apply_replacements 顺序替换可链式（A→B→C 级联），语义未声明
- suggest_from_ocr_texts 按 OCR 块计数而非会话数（固定字幕可刷提名，需用户确认取舍）
- LoadMonitor 注释"占用率>80%"实为单核当量语义（多核下 0.8 过早触发）
- 多 NVIDIA 卡：select_best 序号与 CUDA device_id=0 不一致（ADR-009 已知风险，留 NVML）
- 健康巡检模型清单仅流式 ASR 四件套（缺 sensevoice/OCR 模型）
- SystemStatusBadge refresh 空 catch（违反安全红线"空 catch 块"，下轮即修）
- download-ort-cuda.ps1 单镜像无 -TimeoutSec/重试（AGENTS.md §3.4）
- 里程碑 feat 与 docs(v0.4.0) 状态流转分提交（AGENTS.md §6"文档与代码同提交"口径歧义）

### 技术债摘要（十轮滚动）

- 已偿 0 笔（本次为审查轮）；累计已偿 44 笔（含 TD-033，提交 2a88b25；TD-042/043 八轮已偿 7af0da8）
- 新增未偿 12 笔：TD-044（P0，OCR 模式契约）/ TD-045~049（P1×5，心跳/ROI 坐标/静音判定/词表快照/PPTX 解压炸弹）/ TD-050~054（P2×5，dt 步长/AGC 契约/引用比较/updater 副作用/面板定位）/ TD-055（P3，行数豁免登记）
- 未偿合计 13 笔：TD-040（carried deliberate）+ TD-044~055（open 12 笔，详见本夹 tech-debt.md）

## 十一轮归档（同日，审查问题全量修复）

> 上轮审查问题清单（critical×1 / high×5 / medium×5 / low×12）**全部修复**并补测试：
> 门禁全绿（245 单测 +2 忽略 / clippy 干净 / 前端构建通过）；TD-044~055 全部 closed（详见本夹 tech-debt.md）。

### 修复摘要（十一轮）

- **TD-044**（P0）：模式入参改 `OcrDeviceMode` 枚举 + 配置内存态单点（TOCTOU 同批修复）+ 多 NVIDIA 卡 Auto 保守落 CPU（decide 增 nvidia_count 参数）
- **TD-045~049**（P1×5）：心跳 AliveGuard（Drop 置 false）；feed_ocr 缩放比反算 + resize 清 video_rect；静音判定改 AGC 前原始样本；词表请求循环重读 + 缓存存原始结果；PPTX 声明尺寸预检 + take 限流 + 文本总预算（补 4 单测）
- **TD-050~054**（P2×5）：dt=0.2s；target_rms≤0 跳过 AGC（契约回归测试）；backendKey 规范化比较；partialRef 镜像移出 updater 副作用；徽标容器 relative 锚定
- **low 项**：校准 RAII guard、live:asr-recovered 恢复事件、调度器独立计数（degraded 全帧不再被字幕遮蔽）、mixdown 尾部直通防御、recent_ocr_texts SQL 修正 + 单测、extract_courseware/suggest 改 async+spawn_blocking、suggest 按会话去重、apply_replacements 链式语义声明 + 测试、LoadMonitor 单核当量注释、健康巡检补 sensevoice 模型、SystemStatusBadge 空 catch 修复 + 过期标记、ps1 超时重试、行数豁免补登 5 项（TD-055）

### 技术债摘要（十一轮滚动）

- 已偿 12 笔（TD-044~055）；累计已偿 56 笔
- 未偿 1 笔：TD-040（carried deliberate，P2）
