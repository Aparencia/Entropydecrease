# 课堂助手（回声定位）可执行优化路线图

> 来源：基于 2026-08 竞品调研（任务 #1）与内部代码盘点（任务 #2）撰写
> 编制日期：2026-08
> 配套文档：《课堂助手竞品差异化对比分析报告》（`docs/Foresight/classroom-assistant-competitive-analysis.md`）
> 范围：课堂助手 P0 止血（2-4 周）→ P1 核心体验（1-2 月）→ P2 差异化增强（季度级）
> 工作区根目录以 `<root>` 代指 `d:\Program own\aicode\work space\Entropydecrease\`，涉及文件路径均相对该根目录

> **实施状态更新（2026-08 全仓体检核实）**：P0-1~P0-6 已全部落地（v0.35.0，错误四分类/降级提示/启动记忆/健康检查阻断/应用内确认/ASR 丢弃提示，见 CHANGELOG v0.35.0「classroom: P0 止血」）；P1-3 热词/替换词表已落地（v0.35.0「热词/替换词表与本地持久化」）；P1-1 问答、P1-2 时间轴、P1-4 书面化、P2 各项仍为待实施规划。

---

## 一、总体目标与原则

### 1.1 总体目标

把课堂助手从「采集-转写闭环」升级为「采集-转写-问答-复习闭环」：先止血（让用户看得见发生了什么），再补齐竞品已验证的复习纵深（多轮问答/时间轴/热词），最后拉开独有差异化（进程环回纯净音轨、重点→闪卡联动）。

### 1.2 必须遵守的架构约束

| 约束 | 说明 | 证据 |
|---|---|---|
| **本地优先** | 本地 sherpa-onnx ASR 优先于云端；新增 AI 能力须有本地兜底路径 | `client/src/features/classroom/hooks/useSessionControl.ts` |
| **离线降级** | AI 全链失败必须有本地兜底（当前兜底 local-concat 质量差，需逐步改善而非绕过） | `server/ai-gateway/config/fallback.py` |
| **无感采集** | `useSystemPicker: false`，任何改动不得引入系统级二次确认 | `client/electron/displayMediaHandler.ts` |
| **SEC-005 IPC 安全** | 数据回传 IPC 一律 sender.id 验证 + 运行时结构断言；新 IPC 通道须登记 `ipc/channels.ts` 并加入 preload 白名单 | `client/electron/mediaCaptureHandlers.ts`、`client/electron/preload.ts` |
| **版本定位延续** | 课堂助手定位 M6 侧边栏混合方案，当前已超 beta.2 范围，后续增量不改变定位 | `docs/versions/v0.4.0.md` |

### 1.3 通用工程约定

- 新增 AI 网关端点须遵守既有路由注册顺序规范（防通配路由遮蔽）与 IPC 鉴权注入（参考记忆：AI 网关新增端点两个必检项）。
- 单文件 ≤300 行、含 `@ai-context` 双语注释（AI 编程规范 §1/§3）。
- 客户端 `npm run lint` + `npm run test` + `npm run build` 全绿；网关 `python -m pytest tests/ -q` 基线不回归。
- 工作量标注：**S** ≤3 人日 ｜ **M** 3-10 人日 ｜ **L** >10 人日。

---

## 二、P0：止血级（2-4 周）

目标：消除「用户不知道发生了什么」的全部盲区。均为前端编排层小改动，风险低、收益直接。

| 编号 | 优化项 | 动机/对标竞品 | 技术方案要点 | 涉及文件 | 验收标准 | 工作量 |
|---|---|---|---|---|---|---|
| P0-1 | 错误态细分与重试引导 | 内部 C2：错误固定文案「请在设置中检查AI网关配置」，无类型细分、无重试；对标 Otter/腾讯会议按原因分类的错误态 | 扩展 `classifyAnalysisError` 的错误分类（网络/网关未配置/超时/额度），错误卡片按类型渲染差异化文案与操作按钮（重试/打开设置）；错误条目保留可重试的原始请求载荷 | `client/src/features/classroom/pages/ClassroomPage.tsx`、`client/src/features/classroom/hooks/useClassroomAnalysis.ts` | 4 类错误各有专属文案与可操作按钮；重试按钮可重发失败请求；单测覆盖分类映射 | M |
| P0-2 | 降级态可见性提示 | 内部 C6：mergePartialNotes 降级 local-concat、ASR 降级均静默；对标讯飞弱网提示转离线录音 | 降级事件统一走 toast/状态条组件：`modelUsed==='local-concat'` 时提示「云端不可用，本次笔记为本地拼接，联网后可重新生成」并附重试入口；ASR 本地↔云端切换同样提示 | `client/src/features/classroom/hooks/useClassroomAnalysis.ts`、`client/src/lib/ai/asrWorker.ts` | 任一降级发生均有可见提示；提示包含原因与后续操作；无降级时不打扰 | S |
| P0-3 | 启动流程简化（默认路径 + 记忆上次配置） | 内部 C5：选窗口→选路径→选模式认知负荷高，AsrModelPrompt 打断启动流；对标腾讯会议「一键开关+课前预设全自动」 | 持久化上次选择（路径/模式/ASR 模型偏好，localStorage 或 Dexie）；默认 smart + mixed + 本地 ASR 优先；ASR 模型弹窗改为非阻断式默认选择（可事后修改）；启动按钮在有记忆配置时一键直达 | `client/src/features/classroom/hooks/useClassroomCapture.ts`、`client/src/features/classroom/components/AsrModelPrompt.tsx`、`client/src/features/classroom/pages/ClassroomPage.tsx` | 二次用户从打开页面到开始采集 ≤2 次点击；首次用户默认路径可直接开始；无系统级二次确认（无感采集约束） | M |
| P0-4 | 健康检查阻断策略 | 内部 C3：启动前 GET /health 失败仅警告不阻断，数分钟后分析阶段才发现网关不可用 | 健康检查失败时按模式分级处理：依赖云端分析的路径给出显式阻断提示（可选「仅本地采集，稍后联网分析」继续）；检查通过前禁用开始按钮并显示检查中状态；网关恢复后自动放行 | `client/src/features/classroom/hooks/useSessionControl.ts` | 网关不可用时用户在开始前即明确知晓；选择「仅本地采集」后转写走本地 ASR 不中断 | S |
| P0-5 | window.confirm 替换为应用内对话框 | 内部 C4：full_record 停止用原生 `window.confirm`，与 UI 割裂 | 新增应用内确认对话框组件（复用项目既有 Dialog 风格），替换 full_record 停止确认；预留后续 P1 问答入口复用 | `client/src/features/classroom/hooks/useSessionControl.ts`、新增 `client/src/features/classroom/components/ConfirmDialog.tsx` | 全流程无 `window.confirm`；对话框样式与应用主题一致；支持键盘确认/取消 | S |
| P0-6 | ASR 队列丢弃用户提示 | 内部 D2：`MAX_ASR_QUEUE=10` 超限丢最旧块，网络抖动时段落无声缺失无提示 | 队列丢弃时计数并通过状态条提示「网络繁忙，N 段音频转写延迟/跳过」；连续丢弃超阈值时建议切本地 ASR（若可用）；丢弃事件落日志便于排查 | `client/src/features/classroom/utils/asrTranscriber.ts`、`client/src/features/classroom/hooks/useClassroomEvents.ts` | 发生丢弃必有可见提示与计数；提示不阻断采集；vitest 覆盖丢弃提示路径 | S |

**P0 依赖关系**：P0-1 与 P0-2 共享错误/降级提示组件，建议同批实施（P0-2 → P0-1 顺序：先建提示基建再做细分）；其余各项相互独立，可并行。全部无跨端/网关改动，纯客户端。

---

## 三、P1：核心体验（1-2 月）

目标：补齐竞品已验证的「转写后复习纵深」，其中 P1-1 AI 多轮问答是对标差距最大项。

| 编号 | 优化项 | 动机/对标竞品 | 技术方案要点 | 涉及文件 | 验收标准 | 工作量 |
|---|---|---|---|---|---|---|
| P1-1 | 基于课堂会话的 AI 多轮问答 | 内部最大缺口（课堂模块问答检索 0 匹配）；对标 Otter AI Chat、通义听悟问答回顾、腾讯 AI 小助手 Pro | ① 网关新增 `/api/v1/classroom/chat` 端点（注册顺序防通配遮蔽）+ `classroom_chat_chain.py`，上下文 = 本课转写分段 + 笔记摘要（超长按章节摘要压缩）；② 主进程新增 IPC handler（SEC-005 校验 + channels.ts 登记 + preload 白名单），走既有 `gatewayHttp.ts`；③ 渲染端课堂页新增问答面板（侧栏抽屉），支持多轮会话与引用转写定位；④ **离线队列**：请求失败落 IndexedDB 队列（Dexie 新表），联网恢复后按序重放，队列态可见可取消；⑤ 本地无网关时面板置灰并说明（本地优先原则下的优雅降级） | 新增 `server/ai-gateway/routers/classroom_chat.py`、`server/ai-gateway/chains/classroom_chat_chain.py`、`client/electron/ai/handlers/classroomChatHandler.ts`、`client/src/features/classroom/components/ClassroomChatPanel.tsx`；改动 `client/electron/ipc/channels.ts`、`client/electron/preload.ts`、`server/ai-gateway/main.py`、`client/src/lib/storage/captureStore.ts`（离队列表） | 问答可用率纳入度量；断网提问入队、联网后自动重放成功；上下文正确注入转写+笔记；网关 pytest + client vitest 覆盖；多轮上下文保持 ≥5 轮 | L |
| P1-2 | 转写时间轴回放与可编辑 | 内部缺口：无回放、转写只读、FIFO 200 条界面不可回溯（内部 C7）；对标 Otter 逐词高亮、飞书妙记拖拽定位+改字同步纪要 | ① 转写段落持久化已剥离 audioBase64，需保留音频片段的本地落盘引用（keyframe 式独立存储或按段存短音频文件）以支持回放；② 会话回顾视图：全量转写按时间轴渲染（虚拟化列表），点击跳转播放、播放时当前段高亮；③ 转写可编辑，修正后回写存储并标记「已修正」，下游笔记/闪卡生成优先使用修正版（借鉴飞书「改字同步纪要」） | `client/src/features/classroom/hooks/useClassroomEvents.ts`（FIFO 与持久化）、`client/src/lib/storage/captureStore.ts`、`client/src/features/classroom/components/LiveTranscript.tsx`、新增 `client/src/features/classroom/components/TranscriptTimeline.tsx`、`client/electron/ipc/keyframeStorage.ts`（参照其独立落盘模式存音频段） | 2 小时课程转写全量可浏览可搜索；点击段落 ≤500ms 定位播放；编辑保存后重跑笔记生成使用修正文本；内存峰值不超既有基线 | L |
| P1-3 | 热词/替换词表（本地存储，按课程维度） | 内部 D3 无热词机制；对标讯飞「自定义热词 + 替换热词」双机制（课堂术语场景最成熟方案） | ① 本地词表存储（Dexie 新表），按课程/学科维度组织，支持导入导出；② 提升机制：本地 sherpa 支持 hotwords 参数则接入，云端 ASR 请求附带热词字段（网关 transcribe 端点透传）；③ 替换机制：ASR 返回后在 `asrFilters` 之后做本地替换后处理（与幻觉过滤同层）；④ 课程维度绑定：会话关联课程后自动应用对应词表 | 新增 `client/src/lib/storage/hotwordStore.ts`；改动 `client/src/lib/ai/asrWorker.ts`、`client/src/features/classroom/utils/asrTranscriber.ts`、`client/src/lib/capture/asrFilters.ts`、`client/electron/ai/local-asr/`、`server/ai-gateway/routers/transcribe.py` | 词表 CRUD 可用且按课程生效；替换词命中后转写文本被纠正；本地存储不依赖云端（本地优先）；单测覆盖替换与边界（不误伤） | M |
| P1-4 | 口语书面化 | 对标讯飞「语篇规整」、通义听悟「口语书面化」——决定转写是否值得复习 | 在笔记生成链路（analyze-session / merge-notes）增加书面化后处理选项：去除语气词/重复、口语句转书面句；作为生成笔记的默认步骤（可开关），不改变原始转写（原始转写保真，书面化产物独立存储） | `server/ai-gateway/chains/multimodal_analyze_chain.py`、`server/ai-gateway/routers/multimodal.py`、`client/src/features/classroom/hooks/useClassroomAnalysis.ts` | 生成笔记默认无语气词灌水；原始转写保持不变；离线时该步骤跳过并提示（优雅降级） | M |

**P1 依赖关系**：
- P1-2 是 P1-1 的体验基础（问答引用定位依赖时间轴），但 P1-1 可先基于「转写全文上下文」独立上线，建议 P1-1 与 P1-2 并行、P1-2 收尾稍后。
- P1-3 依赖既有转写链路，无前置；建议与 P1-2 并行。
- P1-4 依赖网关多模态链稳定，建议排在 P1-1 之后（共享上下文压缩经验）。
- P1-1 的离线队列与 P0-6 的丢弃提示共享「网络异常可观测」基建，P0 完成后实施更顺。

---

## 四、P2：差异化增强（季度级）

目标：兑现熵减独有优势项，拉开与云系竞品的差距。

| 编号 | 优化项 | 动机/对标竞品 | 技术方案要点 | 涉及文件 | 验收标准 | 工作量 |
|---|---|---|---|---|---|---|
| P2-1 | native 进程环回接入主构建（隔离系统杂音） | 内部 D1：端点环回采全系统混音（提示音/其他播放器混入转写），native 模块 Phase 1 已验证但未接入；对标讯飞「只录网课声音」 | ① 将 `client/native/process-audio` 纳入 client 主构建（prebuild/prebuild-install 二进制分发 + CI 构建矩阵）；② `audioCapture.ts` ADR-001 选源链中启用进程环回为第一优先级（按目标窗口 PID 定向采音），故障自动降级端点环回（既有机制）；③ 保留 `ENTROPY_PROCESS_LOOPBACK=0` 应急总闸；④ 打包配置同步（electron-builder extraResources） | `client/native/process-audio/`（binding.gyp、build.mjs）、`client/electron/audioCapture.ts`、`client/package.json`、`client/electron-builder.yml`、`.github/workflows/` | 采集指定窗口音频时其他应用声音不进入转写；native 模块缺失/崩溃自动降级不中断采集；Windows 打包产物可运行；CI 构建全绿 | L |
| P2-2 | 章节速览/思维导图 | 对标通义听悟章节速览+思维导图（竞品中仅其具备导图）、腾讯会议智能章节；课堂版按「知识点章节」而非议程章节 | 网关新增章节切分 + 导图生成链（复用多模态分析链的分块并行模式）；渲染端会话回顾页增加章节导航（点击跳时间轴，依赖 P1-2）与思维导图视图（Markmap 或力导向轻量渲染）；消耗云端额度，呼应 AI 用量分层 | 新增 `server/ai-gateway/chains/chapter_outline_chain.py`；改动 `client/src/features/classroom/components/TranscriptTimeline.tsx`、新增导图组件 | 60 分钟课程产出 ≥3 级章节导航并可跳转；导图一键生成；离线时入口置灰说明 | L |
| P2-3 | 重点标记 → 闪卡自动联动 | 竞品 action items 的课堂化改造；熵减独有闭环机会（无任何竞品打通重点→间隔重复） | M 键重点标记已存在，扩展为：打点生成时间轴书签并加权摘要区域；课程结束时自动把「重点段落 + 教师强调语」喂给闪卡生成（flashcardHandler），支持「仅重点」生成模式；问答面板（P1-1）可引用重点打点 | `client/src/features/classroom/hooks/useClassroomEvents.ts`（M 键打点）、`client/electron/ai/handlers/flashcardHandler.ts`、`client/src/features/classroom/hooks/useClassroomCapture.ts` | 打点即时可见为书签；「仅重点」模式生成的闪卡全部关联打点段落；闪卡数量与重点数成正比（有上限保护） | M |
| P2-4 | 中英混说 | 对标通义听悟「中英自由说」；高校双语课/英文原版课刚需；Otter 因无自动语言检测翻车的反面教材 | 评估 sherpa-onnx 多语言/混说模型可行性（本地优先）；云端路径在 transcribe 端点启用混说识别参数；语言检测结果写入转写段元数据 | `client/electron/ai/local-asr/`、`server/ai-gateway/routers/transcribe.py`、`client/src/features/classroom/utils/asrTranscriber.ts` | 中英混讲课样本转写英文术语不被音译为错字；本地模型不支持时自动走云端且提示 | L |

**P2 依赖关系**：
- P2-1 无前置依赖，但因涉及 CI 与打包配置（变更需额外审查文件），建议独立排期、单独验证。
- P2-2 章节跳转依赖 P1-2 时间轴。
- P2-3 与 P1-1 联动（问答引用打点），建议 P1 完成后实施。
- P2-4 依赖 P1-3 热词机制（混说场景术语纠正），且本地模型选型需先做 spike。

---

## 五、全景依赖与排期建议

```
P0（2-4 周）                    P1（1-2 月）                        P2（季度级）
─────────────                  ──────────────────                 ──────────────────
P0-2 降级提示 ──┐
P0-1 错误细分 ──┼─(提示基建)──→ P1-1 AI 多轮问答 ─────────────────→ P2-3 重点→闪卡联动
P0-6 丢弃提示 ──┘               P1-2 时间轴回放与编辑 ────────────→ P2-2 章节速览/导图
P0-3 启动简化                    P1-3 热词/替换词表 ───────────────→ P2-4 中英混说
P0-4 健康检查                    P1-4 口语书面化（依赖 P1-1 之后）   P2-1 进程环回接入（独立）
P0-5 应用内对话框
```

- P0 全部为客户端前端改动，可并行快速落地；P0-1/P0-2 建议合并为一个提示基建 PR。
- P1-1 是跨端大项（网关 + IPC + 前端 + 离线队列），建议按「端点与链 → IPC 与鉴权 → 面板 UI → 离线队列」四个可验证里程碑推进。
- P2-1 涉及 `.github/workflows/` 与 `electron-builder.yml`（AGENTS.md 标注需额外审查），单独排期。

---

## 六、成功度量

落地后以下可观测指标作为验收与回归基准（括号内为当前基线/采集方式）：

| 指标 | 定义 | 目标 | 采集方式 |
|---|---|---|---|
| **转写丢失率** | 被 ASR 队列丢弃或链路失败导致无转写的音频段占比 | P0 后可观测（有计数）；P1 后 <1%（网络正常时） | `asrTranscriber.ts` 丢弃计数 + 会话级汇总日志 |
| **首屏到可采集时长** | 打开课堂页到开始采集的耗时/点击数 | 二次用户 ≤2 次点击、≤10 秒（当前需选窗口+路径+模式+ASR 弹窗） | 埋点（P0-3 验收） |
| **问答可用率** | 提问后成功获得有效回答的比例（含离线队列重放成功） | 联网 ≥95%；断网入队重放成功率 ≥90% | `classroomChatHandler` 请求/响应计数 |
| **长课内存峰值** | 120 分钟课堂会话渲染进程内存峰值 | 不高于当前基线（audioBase64 剥离后水平），长课无 OOM | Electron 进程内存采样 |
| **降级感知率** | 发生降级时用户可见提示的覆盖比例 | 100%（P0-2/P0-6 验收红线） | 降级事件与提示渲染的单测覆盖 + 手工回归 |
| **杂音混入率** | 端点/进程环回场景下非课堂声音进入转写的比例 | P2-1 后进程环回场景趋近 0（定向采音） | 内测对照实验（系统播放干扰音） |
| **重点→闪卡转化** | 「仅重点」模式下闪卡关联打点段落的比例 | ≥90%（P2-3 验收） | 闪卡生成结果断言 |
| **错误态可操作率** | 错误卡片带有效操作按钮（重试/打开设置）的比例 | 100%（P0-1 验收红线） | 单测覆盖全部错误分类 |

---

## 附：依据材料

- 竞品对标依据：`docs/Foresight/classroom-assistant-competitive-analysis.md`（2026-08 竞品调研）。
- 内部短板与代码热区：任务 #2 内部现状评估报告（`ClassroomPage.tsx`、`useSessionControl.ts`、`useClassroomEvents.ts`、`useClassroomAnalysis.ts`、`asrTranscriber.ts`、`audioCapture.ts`、`client/native/process-audio/` 等）。
- 已实施优化与剩余增量项：`docs/knowledge/solutions/2026-08-performance-analysis-optimization-roadmap.md`。
- 已知 bug 修复记录：`docs/knowledge/bugs/2026-07-classroom-capture-asr-hallucination-json-leak.md`。
- 版本定位：`docs/versions/v0.4.0.md`；需求池呼应：`docs/product/requirements-pool.md`（FEAT-022 AI 启发式学习、FEAT-039 合书自测等条目与 P1-1 问答方向互补）。
