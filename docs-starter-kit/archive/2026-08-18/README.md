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
