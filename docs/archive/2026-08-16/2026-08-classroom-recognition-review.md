# 课堂助手识别升级 — 新增代码六项审查报告

> 审查日期：2026-08-16
> 审查范围：P0/P1/P2 全部实施提交（`d72b920` 评估基线 → `69d4fad` 本地 OCR 骨架，共 16 次提交）
> 审查方式：逐文件接入性/逻辑性/牵连性/性能/冗余/规范六维复查 + 门禁复核
> 结论：**通过**；审查中发现 6 项问题，已全部修复（见 §7），另记录 3 项遗留观察（见 §8）

---

## 1. 代码接入性检查 ✅

所有新增模块/函数/服务均已正确导入调用：

| 新增代码 | 接入点 | 状态 |
|---|---|---|
| `sileroVad.ts`（IpcSileroVad/createSileroVad/classifySileroProb） | `smartCaptureController.start/pushAudioChunk/stop`、`vadMarker.classifySilero` | ✅ 全链路接通 |
| `sileroVadService.ts`（主进程）→ IPC `vad_silero_process` | `ai/index.ts registerAIHandlers` → channels.ts 登记 → preload 白名单 → env.d.ts 类型 → 渲染调用 | ✅ 四层契约一致 |
| `local-ocr/ocrService.ts` → IPC `local_ocr_recognize` | 同上四层 + `visionWorker.ts` 本地优先分支 | ✅（推理管线为骨架态，降级契约完整） |
| `sensevoiceRescore.ts`（rescoreWithSenseVoice/pickRescored） | `SherpaAsrService.transcribeStreaming` + `streamingAsr` final 路径 | ✅ |
| `local_asr_stream_set_hotwords` IPC | preload/env.d.ts/`useClassroomEvents` AI 课程识别回调 | ✅ |
| `asrFilters` 新增（estimateAsrConfidence/dedupeAcrossFinals/形态3） | 主进程 2 处 + 渲染 2 处 | ✅ |
| `hotwordRuntime` 新增（addDynamicBoosts/addSessionReplace） | useClassroomEvents 3 处 | ✅ |
| `contentClassifier.ts` + `hasCommandCue` | useClassroomEvents（分类/补帧）+ smartCaptureController（参数） | ✅ |
| `stepExtractor.ts` + `StepFlowView` | SessionContentView（技能类视图切换） | ✅ |
| `RecognitionStatsBar` + `RecentKeyframesStrip` | SessionContentView / UnifiedTimeline | ✅ |
| `transcriptCorrection.extractCorrection` | useClassroomEvents.handleEditTranscript | ✅ |
| 评估工具 `scripts/asr-eval/` | 独立 CLI（--self-test 已验证全过） | ✅ |

## 2. 代码逻辑性审查 ✅

重点复查结论（已修复问题见 §7）：

- **噪声抑制暂存-确认机制**：语音起始块概率滞后时不丢语音（暂存补入段首）；连续噪声 2 块确认后丢弃——两段式设计正确，6 例单测覆盖
- **静音复核推迟上限**：Silero 误判长噪声为语音时 3000ms 上限强制分段，无段无限拉长风险
- **跨 final 去重边界**：单字重叠不截断、完全一致丢弃、Jaccard>0.9 兜底——27 例 asrFilters 单测覆盖
- **形态 3 跨标点压缩白名单**：单字灌水（"嗯嗯，嗯嗯"）留给幻觉过滤整段丢弃；两字确认语（"是的，是的"）不压缩
- **IPC 合并并发**：IpcSileroVad 在途 ≤1、pending 保最新、不可用停止发送——6 例单测覆盖
- **重打分择优**：一致性 Jaccard≥0.35 才替换；差异过大保守保留流式结果（避免上屏文本整句跳变）
- **步骤提取边界**：slide_change 切分、1s 时序容差、无边界兜底单步骤、40 字标题截断——8 例单测覆盖
- **修正差异提取**：公共前缀/后缀剥离、target 空串（删词语义）、20 字上限——8 例单测覆盖
- **修复后**：漏捕检测定时器登记+卸载清理+20 个上限保护；重打分句音频累积有界（端点后清空）

## 3. 代码牵连性检查 ✅

- **类型扩展全部可选字段**：`LiveTranscript.confidence/speaker`、`ExtractionResult.capturedAt`、`AudioSegment.speaker`、`ScreenshotData.timestamp` 均为可选——既有消费方（PredictionOverlay、笔记链路、存储）零破坏
- **transcribeWithRetry 返回类型变更**（string→TranscribeOutcome）：唯一调用点 useClassroomEvents 已同步改造，全仓 grep 无遗漏
- **端点规则调优（rule2 1.2s→2.0s）**：影响断句延迟（预期行为变更，与重复修复目标一致）
- **collapseAdjacentDuplicates 形态 3**：行为变更（"就是，就是"现在会压缩）已通过测试更新显式化，无隐式破坏
- **ASR_MODELS 新增 rescore**：getModelsStatus/设置页模型列表自动展示双模型；开关条件已收紧（rescore 不能单独转写）
- **OBSOLETE_MODEL_DIRS 移除 SenseVoice**：已清理过旧模型的用户需重新下载（模型管理 UI 可操作，无数据破坏）
- **网关改动**（transcribe confidence 估算 / vision truncated 减半）：331 基线测试不回归；响应契约新增字段向后兼容

## 4. 性能与流畅性检查 ✅

| 关注点 | 结论 |
|---|---|
| Silero IPC 频率 | 音频块粒度 2.5 次/秒（400ms）或 0.5 次/秒（2s）；在途 ≤1 合并 → 负载有界 |
| 主进程 VAD/重打分阻塞 | Silero 推理 ~10-30ms/块可忽略；SenseVoice 每句一次 ~200-500ms，发生在断句间隙（>2s 静音），不挤占实时 decode |
| 句音频累积 | 最长 28s×16k×4B ≈ 1.8MB，端点后清空，有界 |
| CPU 优化 | 线程数默认 min(4,cpuCount)（原 cpuCount-1）+ 静音隔块喂入，内测 CPU 100% 问题的主杠杆 |
| 步骤提取/缩略流 | extractSteps O(n+m) + useMemo；缩略流仅 6 帧过滤，keyframes ≤240 有界 |
| 分类器开销 | 每句转写跑 ~10 个正则，微秒级 |
| 渲染 | RecognitionStatsBar/RecentKeyframesStrip 纯展示，无新订阅；步骤视图仅在技能类会话挂载 |

## 5. 冗余代码和死代码检查 ✅

- `isRescoreAvailable`（sensevoiceRescore）：当前无 UI 调用者——**保留**（P1-1 设置页"重打分就绪"展示的未来接入点，见集成文档）
- `OcrLine` 类型与 env.d.ts 内联类型重复：跨进程类型无法共享的既有惯例，保留
- `ocrService` 骨架占位（`void ort; void dir`）：联调 TODO 明确标注，非死代码
- lint `--deny-warnings` 0 警告证明无未使用导入/变量
- 无重复逻辑：置信度估算/Jaccard 相似度等复用函数集中（asrFilters/sensevoiceRescore 各一份，用途语境不同）

## 6. dev 提交规范检查 ✅

| 规范项 | 状态 |
|---|---|
| Conventional Commits | 16 次提交全部 `feat(classroom)/fix(classroom)/docs(classroom)` 前缀，header ≤100 字符（commitlint 强制通过） |
| 命名约定 | 新文件 kebab 描述性命名；IPC 通道 channels.ts 集中登记；常量 SCREAMING_SNAKE |
| 代码风格 | oxlint --deny-warnings 0 错误 0 警告（1184+ 文件全量） |
| 注释完整性 | 全部新文件含 `@ai-context` 中英双语注释；关键机制（暂存-确认/择优/边界）有设计说明 |
| 类型安全 | typecheck（渲染 + Electron 主进程）零错误；IPC 返回类型 env.d.ts 权威声明，无 as unknown/any |
| 错误处理 | 本地引擎全部「加载失败静默降级」模式（Silero→RMS、OCR→云端 VLM、重打分→流式原结果） |
| 单文件 ≤300 行 | 审查修复后全部新文件达标（vadMarker 300 / UnifiedTimeline 300 / 其余 <300） |
| 测试 | 客户端 1308 测试全过（本次新增 ~60 例）；网关 331 基线不回归 |

## 7. 审查发现与修复记录

| # | 发现 | 严重度 | 修复 |
|---|---|---|---|
| 1 | `SmartSampler.forceNextCapture` 字段与方法同名（实例字段覆盖原型方法，调用 TypeError） | 高 | 字段重命名 forceCapturePending + 注释防再犯 |
| 2 | 漏捕检测 setTimeout 未随组件卸载清理（卸载后 toast 泄漏风险） | 中 | 定时器集合登记 + unmount 清理 + 20 个上限 |
| 3 | vadMarker.ts 317 行超 300 规范 | 低 | Silero 常量与三态分类抽至 sileroVad.ts → 300 行 |
| 4 | UnifiedTimeline.tsx 318 行超 300 规范 | 低 | 缩略流抽为 RecentKeyframesStrip → 300 行 |
| 5 | 形态 3 压缩单字灌水破坏幻觉过滤（"嗯嗯，嗯嗯嗯。" 不再被整段丢弃） | 中 | 单字灌水（unique<2）不压缩，留给幻觉过滤 |
| 6 | 转写修正单字差异（"减"→"降"）被误拒入库 | 中 | 去掉单字限制（用户主动修正即强信号，正是最高频术语纠错形态） |

## 8. 遗留观察（非阻塞，记录备案）

1. **useClassroomEvents.ts 593 行 / useClassroomCapture.ts 355 行 / modelManager.ts 323 行**：本次修改前即已超 300 行规范（既有问题）。本次新增逻辑已按职责归属放置；后续可把 useClassroomEvents 的场景处理/修正回写/说话人标注再拆子 hook（建议下个迭代）。
2. **P2-1/2/3 推理管线**：本地 OCR 为骨架态（模型文件未随仓库分发），需按 `docs/knowledge/solutions/2026-08-local-ocr-integration.md` 验证清单在装有模型的环境联调；公式引擎与版面解析尚未接入（依赖 P2-1 完成）。P2-6 输入事件触发需安全评审后实施。以上均已文档化，降级契约完整、零回归。
3. **P2-5 VLM 分类**：规则版（P1-6）已上线达标 ≥80%；VLM 版待本地 VLM/网关视觉端点就绪后替换（接入路径已文档化）。

## 9. 门禁复核记录

- `npm run lint`：0 警告 0 错误 ✅
- `npm run typecheck` + `npm run typecheck:electron`：零错误 ✅
- `npm run test`：1308/1308 通过 ✅
- `python -m pytest tests/ -q`（ai-gateway）：331/331 基线不回归 ✅
- lint-staged + commitlint：全部提交通过 ✅
