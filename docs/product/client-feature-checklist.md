# 熵减客户端功能清单与验收标准

> **版本**：v0.35.2（2026-08-05 基线）
> **范围**：`client/`（Electron + React 桌面客户端）全部功能模块
> **类型**：产品功能清单 + 验收标准（Acceptance Criteria）
> **依据文档**：[v0.4.0 测试策略与验收标准](../versions/v0.4.0.md)、[测试规范](../standards/testing.md)、[API 设计规范](../standards/api-design.md)、[PRD 模板](../templates/prd-template.md)、[性能优化规范](../standards/performance.md)、[安全规范](../standards/security.md)、[UI/UX 设计系统](../product/ui-ux-system.md)

---

## 一、验收标准体系说明

### 1.1 优先级分级（MoSCoW）

| 级别 | 含义 | 验收约束 |
|------|------|---------|
| **Must** | 核心功能，缺失即产品不可用 | 发布前必须全部满足，否则阻断发版 |
| **Should** | 核心体验增强 | 该迭代内满足，允许带 workaround |
| **Could** | 锦上添花 | 资源允许时满足 |
| **Won't** | 明确不做 | 需在文档中声明理由与去向 |

### 1.2 测试分层（L1–L5，引自 v0.4.0 §一）

| 层级 | 类型 | 工具 | 覆盖率目标 | 执行频率 |
|------|------|------|-----------|---------|
| L1 | 单元测试 | Vitest | ≥80%（核心逻辑 ≥90%） | 每次提交 |
| L2 | 集成测试 | Vitest + @testing-library/react | 核心路径 | 每次 MR |
| L3 | 系统测试 | Playwright（可选） | 核心流程 | 发版前 |
| L4 | UAT | 手动验收 | Exit Criteria | 子版本发布前 |
| L5 | 回归测试 | 全量自动化 + 手动 | 全量 | 每次发版 |

### 1.3 缺陷分级（引用 v0.4.0 §四）

| 级别 | 定义 | 处理时限 | 示例 |
|------|------|---------|------|
| P0 | 应用崩溃、数据丢失、核心功能不可用 | 立即修复 | 白屏、数据丢失、番茄钟无法计时 |
| P1 | 核心功能部分不可用、无 workaround | 24 小时内 | 同步失败、AI 摘要不可用 |
| P2 | 非核心功能异常、有 workaround | 当前迭代内 | 动效掉帧、样式偏差 |
| P3 | 体验优化、文案、美观 | 下个迭代 | 文案错别字、hover 不一致 |

### 1.4 验收标准书写约定

- **功能类**：行为可操作、结果可验证（含文件/接口级别断言）
- **量化类**：给出明确阈值（准确率、延迟、帧率、包体积）
- **兼容类**：明确环境矩阵（OS / 浏览器 / 设备）
- 每条验收标准必须可被 L1–L4 中至少一个层级覆盖

---

## 二、核心功能模块

### 2.1 学习看板 Dashboard（`features/dashboard/`）— Must

**描述**：「知识星空」沉浸式学习生态可视化首页，含英雄区（粒子背景+核心数据）、学习脉搏（强度曲线）、知识预览（最近笔记/闪卡/番茄钟浮动卡片）、成就面板（深海生物主题成就）、学习分析（效率/趋势/热力图）、学习启动仪式（呼吸仪式+回顾闪回+微目标）、证书页。

**验收标准**：
- [ ] 首页加载后 3s 内呈现英雄区与核心数据（L3），各数据卡在无数据时显示空态而非报错（L2）
- [ ] 学习脉搏曲线、趋势图、热力图、雷达图在 500 条学习记录下渲染延迟 <500ms（L3，性能规范基线）
- [ ] 统计卡与知识预览卡支持点击跳转对应模块，目标路由正确（L2，v0.31.0）
- [ ] 成就面板：成就达成时弹出 AchievementToast，成就状态持久化，重启后不重复弹出已达成成就（L2）
- [ ] 分析页数据聚合（aggregator）为纯函数，单元测试覆盖求和/均值/连续天数边界（L1，≥90%）
- [ ] 深色/浅色模式下图表与 3D 背景对比度满足可读性，无闪烁（L4）
- [ ] 证书页在无数据时显示可执行的引导文案（L4）

#### 2.1.1 学习启动仪式（Ritual，v0.27.0 重塑）— Should

**描述**：每次进入学习前的仪式化流程——呼吸容器（4-4-4-4 Box Breathing 贯穿全程）、记忆挑战卡（遮罩-揭示主动提取）、掌握标记闭环（模糊/未掌握 → 生成复习卡）、目标接力（昨日未完成目标置顶+5 快选标签）、自适应编排（无数据裁剪回顾 / 连续 7 天轻档 / 深夜放松版）、AI 回顾小问（离线降级）、光尘转场、仪式火种、今日学习卡。

**验收标准**：
- [ ] 呼吸相位 4-4-4-4 节奏误差 <100ms；React 状态仅在相位切换时更新（重渲染 ≤4 次/16s，React DevTools Profiler 验证）（L1/L3，v0.27.0 A1.2/A2.1）
- [ ] `prefers-reduced-motion` 开启时呼吸视觉降级为数字倒计时圆环，无位移动画（L4）
- [ ] 掌握标记写入 `ritualRecords`；「模糊/未掌握」生成复习卡进入今日队列，按 noteId+日期幂等（不重复生成）（L2，A1.5）
- [ ] 快选标签 5 个正确生成：第一项为最近一条未完成目标，其余 4 项取自最近笔记高频词（L1，A1.6）
- [ ] AI 回顾小问：联网 2s 内返回；超时/离线无缝回退遮罩摘要模式；当日结果缓存命中（L2，B1.2）
- [ ] 微目标下压番茄钟：计时页顶部展示，会话结束回收确认仅一次，`goalCompleted` 正确回写（L2，B1.3）
- [ ] 仪式任何环节可跳过（Esc/按钮），跳过三选项（仅本次/今天/永久）正确持久化（L4，A1.3）
- [ ] `ritualPlanner` 编排规则全分支有单元测试：无数据 / 连续 7 天 / 深夜 / 手动强度优先（L1，B1.1）
- [ ] 呼吸引导音与相位切换对齐误差 <100ms；静音偏好持久化；预加载无首播延迟（L4，A2.3）
- [ ] 光尘转场 600ms 内完成并触发 3D 相机飞行；低端设备/reduced-motion 降级为普通淡出（L4，A2.4）

### 2.2 番茄钟 Pomodoro（`features/pomodoro/`）— Must

**描述**：沉浸式番茄钟（专注/短休/长休 + 循环周期），含模式预设自定义、周期标记、目标输入（三段式填空+语音说目标+快选接力）、AI 推荐时长（本地规则引擎回退）、能量建议条、锚点提醒（AnchorReminder）、滑动退出、完成庆祝、统计页与设置页；计时全局调度与墙钟校准。

**验收标准**：
- [ ] 计时精度：25 分钟专注在后台/切页/最小化后误差 <2s（墙钟校准，L3，v0.35.0 修复项）
- [ ] 状态机：开始/暂停/继续/跳过/完成/重置全路径正确，无副作用双重执行；周期计数（CycleMarkers）随长休重置（L1，usePomodoroStore 56 测试基线，≥90%）
- [ ] 到达专注结束触发短休提示与声音；到达长休节点进入长休；所有状态切换有持久化（重启后恢复正确状态或安全归零）（L2/L4）
- [ ] 模式预设：支持自定义时长/名称/标签页切换，预设 CRUD 持久化（L2，v0.31.0）
- [ ] 目标输入：三段式填空（我要[动词][对象][范围]）与自由输入可切换；语音输入（Web Speech API）失败时静默回退键盘输入（L2，v0.27.0 B1.5）
- [ ] AI 推荐时长：联网返回 AI 建议；离线/失败时本地规则引擎计算（加权平均历史完成会话），UI 标注来源标签（local_rule / ai）（L2，adaptiveEngine 测试）
- [ ] 锚点提醒：到达设定时刻弹出提醒，可点击跳转目标模块；提醒不可用时不阻塞计时（L4）
- [ ] 沉浸视图：TimerRing 圆环进度与剩余时间一致；滑动退出手势可用；沉浸双视图不叠加错位（L4，v0.35.0）
- [ ] 统计页：今日/本周/累计专注数据与 Dexie/SQLite 数据一致；空数据显示空态（L2）
- [ ] 每小时重渲染优化：CycleMarkers 与预设标签栏 memo 化，计时页无整页每秒重渲染（L3，性能规范）

### 2.3 智能笔记 Notes（`features/notes/`）— Must

**描述**：富文本笔记系统（TipTap v3），含四种模板（自由画布 free / 康奈尔 cornell / todo / 普通正文）、OneNote 式墨迹手绘（钢笔/荧光笔/橡皮擦）、思维导图编辑器（React Flow+dagre）、双向链接（[[wiki-link 自动补全+反向链接面板+笔记图谱）、Markdown 往返、AI 摘要/闪卡生成/解释/提炼（流式输出）、课堂采集（屏幕截图+系统音频）、AI 预测（12 分钟定时器+活跃度追踪）、笔记健康度、标签/文件夹/搜索（FTS5）、待办统计。

**验收标准**：
- [ ] 自动保存：编辑停顿 1s 后自动保存（useAutoSave），重启后未丢失内容；显式保存按钮可用（L2）
- [ ] 四种模板创建与渲染正确：free 渲染自由画布、cornell 渲染三栏布局、todo 渲染任务列表并统计、其他渲染 TipTap 正文（L2，v0.4.0 边界）
- [ ] 墨迹手绘：钢笔/荧光笔/橡皮擦可用，SVG 平滑笔画，色板与笔粗设置生效；canvas 缩放/平移后笔画对齐（L2，v0.32.0 阶段三）
- [ ] 思维导图：节点增删改、拖拽布局（dagre）、导图↔大纲↔Markdown 往返无损（L1/L2，mindmapOps/convert/text 测试，≥80%）
- [ ] 双向链接：`[[` 触发自动补全；反向链接面板实时更新；笔记图谱渲染 noteLinks 索引（L2，v0.32.0 阶段二）
- [ ] 搜索：FTS5 全文搜索（BM25 排序）命中正确、中英文分词可用；索引增量维护（insert/update/delete）；异常时降级 LIKE 且不崩溃（L2，v0.34.0 P0-1）
- [ ] AI 摘要：输入 ≥10 字符才可触发（否则 Toast「内容过短，请输入至少 10 个字符」）；断网立即提示「当前离线」而非超时等待；流式输出渐进显示，失败降级非流式（L1/L2，v0.4.0 T1.3/T1.4、v0.32.0 P2-12）
- [ ] AI 摘要结果 <10 字符时显示友好 Toast（v0.4.0 验收 T1.3）
- [ ] AI 解释/提炼：选中文本右键可触发，paragraph/bullet 风格正确，离线操作入队待联网重放（L2，v0.34.0 P1-10）
- [ ] 笔记列表：过滤/标签/选中结果 useMemo 缓存生效；120 字截断预览，AI 操作使用完整文本（L3，v0.32.0 P1-7、v0.33.0）
- [ ] 图片插入：压缩降采样+懒加载，控制内嵌 base64 体积（L3，v0.32.0 P2-10）
- [ ] 笔记健康度（noteHealth）计算正确且有单元测试（L1）
- [ ] AI 预测：12 分钟定时器+活跃度追踪触发预测，结果写入 predictions 表（SQLite）；无网络时静默跳过（L2，v0.34.0 P2-21）

### 2.4 闪卡复习 Flashcards（`features/flashcards/`）— Must

**描述**：间隔重复闪卡系统，支持 SM-2 与 FSRS-5 双算法（策略模式热切换）、学习会话（翻转/评分/拖拽评分）、间隔天数预览+键盘快捷键（1/2/3/4）、恢复包（中断 ≥3 天生成 ≤10 张核心卡+记忆回响）、金错误面板、生成式复习（AI）、AI 优化卡片、牌组分享/导入导出（Anki 兼容）、记忆强度脉动可视化。

**验收标准**：
- [ ] 调度算法：SM-2 间隔计算（quality 0/1/2/3 → 正确天数，EF=1.3 极端值正确）与 FSRS-5（19 权重参数不可单独微调）均有单元测试，间隔预览 `getIntervalPreview()` 全 rating 覆盖（L1，v0.4.0 T3.5、fsrs.test 33 基线）
- [ ] 学习会话：进入即装载到期卡（startSession）；评分后 store 计算下次间隔并推进；会话结束（已完成 >0）弹出统计（L2，StudySessionPage）
- [ ] 键盘快捷键：1→重来、2→困难、3→良好、4→简单；非复习状态不响应；评分按钮内显示 [1][2][3][4] 提示（L2，v0.4.0 T3.5）
- [ ] 评分按钮错落入场（每项延迟 60ms×index）；FlipCard 翻转 60fps 流畅，`will-change` 仅动画期间设置，回弹缓动曲线使用 `--kb-ease-bounce`（L4，v0.4.0 T3.3）
- [ ] 拖拽评分与点击评分结果一致（L2，useCardInteraction）
- [ ] 恢复包：中断 ≥3 天（RECOVERY_GAP_DAYS）时显示恢复包入口；卡片精选本地完成（≤10 张）；记忆回响为可选 AI 增强，失败静默跳过；文案强调「欢迎回来」（L2，recoveryPack）
- [ ] 金错误面板：错误卡片查询与展示正确（L2）
- [ ] 生成式复习：AI 生成问题可用；离线时降级为普通复习（L2，useGenerativeReview）
- [ ] 右键菜单：牌组（重命名/导出/统计/删除）、卡片（编辑/重置/查看上下文置灰/AI 优化/删除）、学习中（暂停/跳过/搁置）三处菜单正确（L2，v0.4.0 T2.4）
- [ ] 搁置 = dueDate 推后一年；标记困难 = easeFactor -0.2（下限 1.3）（L1，StudySessionPage 说明）
- [ ] 牌组分享：分享卡片渲染（renderShareCard）正确，导入兼容 Anki 格式（L2，v0.3.0 C8）
- [ ] 当日复习数查询走 reviewedAt 索引（L3，v0.32.0 P1-8 性能基线）

### 2.5 费曼讲解 Feynman（`features/feynman/`）— Must

**描述**：费曼学习法四步流程（选择概念→讲解→发现薄弱→复习简化）、语音讲解录音（WAV 本地落盘可回放）、AI 评估（含多维度薄弱点收集）、苏格拉底式对话（AI 追问）、AI 追问/通俗化/查漏补缺（选中文本右键）、概念内化状态、讲解图谱（feynmanGraph）、AI 反馈持久化。

**验收标准**：
- [ ] 四步流程（FeynmanSteps）状态机推进/回退/跳过正确；步骤指示器与当前步骤一致（L2，useFeynmanStore 测试）
- [ ] 录音：开始/暂停/继续/结束可用；WAV 保存至 `{userData}/recordings`（fileName 强制安全字符+`.wav` 后缀防路径穿越）；跨会话可回放；文件不存在时返回 `not_found` 供静默降级（L2/L4，recordingStorage）
- [ ] AI 评估：讲解文本 ≥10 字符可提交；评估结果持久化（v0.33.0）；薄弱点收集（collectWeakDimensions）与汇总展示正确（L1/L2）
- [ ] 苏格拉底对话（SocraticDialogue）：AI 追问流式输出；`useSocraticFlow` 状态机（提问→回答→反馈）测试覆盖 24 基线（L1，v0.34.0）
- [ ] 右键 AI 操作：选中文本显示「AI 追问/通俗化/查漏补缺」，无选中 fallthrough 原生菜单（L2，v0.4.0 T2.5）
- [ ] 概念内化（ConceptInternalized）：标记后状态持久化，进入闪卡/笔记联动入口可用（L2）
- [ ] 讲解图谱：feynmanGraph 节点/边渲染正确（L2）
- [ ] 录音时长限制与文件清理策略明确（单文件体积、保留策略见设置页说明）（L4）

### 2.6 课堂助手 Classroom（`features/classroom/`）— Must

**描述**：「回声定位」网课笔记提取独立全页模块——OS 级窗口监听（desktopCapturer 窗口列表/选择/定时截图）、系统音频捕获（WASAPI Loopback / 进程环回原生模块 / 麦克风 Provider / DRM 自动阻止）、ASR 语音转文字（云端 Paraformer + 本地 sherpa-onnx 双引擎）、多模态 AI 视觉提取（图表/公式/板书识别）、智能路由降级链（UI Automation→多模态 AI）、VAD 驱动动态抓帧、ASR/OCR 文本去重融合、实时转写（LiveTranscript）、关键帧持久化、热词/替换词表、网关健康软阻断、会话 Q&A、提取结果插入笔记（TipTap TimestampMark/ExtractedBlock）。

**验收标准**：
- [ ] 窗口选择：可列出当前所有可见窗口并选择目标；选择后定时截图间隔可配（100ms–60s 边界校验），实际间隔误差 <10%（L4/L1，v0.4.0 beta.1）
- [ ] 变化检测（pixelmatch/ssim）：相同画面跳过率 >95%，不同画面触发率 100%（L1，v0.4.0 beta.1）
- [ ] 多模态 AI 识别：中文 PPT/网页/图表识别率 ≥95%（GLM-4V-Flash/Qwen-VL-Plus）；板书/手写 ≥80%；公式/LaTeX 正确（L4，v0.4.0 beta.1/beta.2）
- [ ] 音频捕获：能捕获系统播放音频（WASAPI Loopback）；DRM 保护内容自动阻止且提示用户、不崩溃（L4，v0.4.0 beta.2）
- [ ] ASR：阿里云 Paraformer 中文识别率 ≥90%；本地 sherpa-onnx 引擎切换对渲染层零改动（IPC 契约一致）（L4，v0.4.0 beta.2）
- [ ] ASR 转写延迟 <3s（首句）；流式转写渐进显示（L3，v0.4.0 T5 验收）
- [ ] 智能路由：UI Automation 失败自动降级多模态 AI，多模态失败给出友好提示；静止时停止抓帧，翻页立即触发（L2，v0.4.0 beta.2）
- [ ] 文本去重：同一内容同时出现于屏幕与语音时不产生重复笔记（L2，v0.4.0 beta.2）
- [ ] 热词/替换词表：可配置并本地持久化，转写结果实时应用（L2，v0.35.0）
- [ ] 网关健康：健康检查失败时软阻断（提示+确认），不静默失败；错误四分类（网络/认证/限流/服务端）可见（L2，v0.35.0 P0 止血）
- [ ] 结果插入：提取片段带时间戳标记（TimestampMark）插入 TipTap，点击时间戳可回跳；来源标记（ExtractedBlock）视觉可区分（L2，v0.4.0 beta.1）
- [ ] 30 分钟网课完整提取流程端到端可完成，笔记结构合理；单节课 API 成本 <1 元（L4，v0.4.0 beta.2 Exit）
- [ ] 截图处理后原始图片立即删除（不持久化，隐私边界）（L2，v0.4.0 beta.1 Exit）

### 2.7 灵感空间 Inspiration（`features/inspiration/`）— Should

**描述**：灵感碎片收集与沉淀（卡片流）、AI 批量排序（AISortPanel）、标签编辑、沉浸画布（ImmersiveCanvas）、星座布局/轨道布局（orbLayout）、排序待处理提醒（SortPendingBanner）、随机浮现（useRandomSurface）、玻璃拟态卡片（GlassInspirationCard）。

**验收标准**：
- [ ] 卡片 CRUD + 标签增删改持久化；筛选（FilterBar）正确（L2）
- [ ] AI 批量排序：选中多卡片触发排序，结果回写卡片顺序；离线/失败时显示可重试状态（SortPendingBanner），不丢数据（L2）
- [ ] 排序待处理计算（sortPendingCalc）单元测试覆盖边界（L1）
- [ ] 沉浸画布与轨道布局在 medium/low 性能档下流畅（无帧循环卡顿）（L3，v0.35.0 星座双轨原则）
- [ ] 卡片键盘可达（Tab 导航+Enter 打开）（L4，a11y）

### 2.8 知识入籍 Settling（`features/settling/`）— Should

**描述**：外部知识「入籍」闭环（阶段 A）——来源（粘贴文本/PDF 拖拽/URL）→ 解析（import:parse-pdf / import:fetch-url）→ AI 概念化预览（可编辑概念卡，离线降级手动建卡）→ 批量安放（imports 溯源 + 签名时刻演出）。

**验收标准**：
- [ ] 三种来源解析：粘贴文本、PDF（import:parse-pdf）、URL（import:fetch-url）均可解析（L2/L4）
- [ ] AI 概念化：预览生成概念卡可编辑；离线/失败时降级为手动建卡，不阻塞流程（L2）
- [ ] 内容安全：contentSanitizer 过滤非法内容（SSRF 防护、英文断行粘连处理、响应体内存限制、重试幂等）（L1，v0.35.0 修复项）
- [ ] 文本分块（textChunker）正确切分长文本（L1）
- [ ] 入籍记录写入 imports 表（溯源），签名时刻演出触发（L2）
- [ ] 解析失败文案为零负向语言（「可手动粘贴」的可执行引导）（L4）

### 2.9 SOP（`features/sop/`）— Could

**描述**：SOP 模板系统——模板列表（内置只读+用户可编辑）、模板编辑器、lint 检查（sopLint）、全屏沉浸执行器（/sop/run/:runId，绕开 3D canvas）、运行历史。

**验收标准**：
- [ ] 内置模板只读、可复制为用户模板；用户模板可编辑/删除（L2）
- [ ] lint 问题数量展示在模板卡片角标，规则由 sopLint 纯函数定义并有单元测试（L1）
- [ ] 运行执行器：按步骤推进、步骤完成勾选、运行记录持久化（L2/L4）
- [ ] 全屏执行器在低端设备上无 3D 渲染开销（挂在 AuthGuard/AppLayout 之外）（L4）

### 2.10 知识星座 Constellation（`features/constellation/`）— Should

**描述**：知识图谱可视化——概念掌握度映射发光体亮度（宪法第一条）、DOM/SVG 双轨渲染（medium/low 档纯静态 SVG 无帧循环，high 档 3D）、朦胧雾滤镜（雾可拨开）、冷启动引导文案、知识预算节点数控制。

**验收标准**：
- [ ] 图谱由纯函数派生（knowledgeGraph + knowledgeLayout），有单元测试（L1，≥80%）
- [ ] medium/low 档渲染 ≤ 每档规定节点数，纯静态 SVG 无帧循环，低端核显安全（L3，v0.35.0 阶段 B）
- [ ] 朦胧节点雾晕可点击拨开露出节点本体；牢固节点清冽明亮（L4，宪法第二/一条）
- [ ] 冷启动（无数据）显示引导文案而非空画布（L4，宪法第七条）

### 2.11 统一收件箱 Inbox（`features/inbox/`）— Should

**描述**：三路来源（剪贴板 Ctrl+Shift+B 实时灌入 / 灵感 / 导入）待沉淀项汇聚，来源+状态筛选，操作：沉淀/归档（可逆）/删除。

**验收标准**：
- [ ] 剪贴板来源：全局快捷键 Ctrl+Shift+B 触发后 inbox_items 实时新增条目（L2）
- [ ] 来源/状态筛选正确（L2）
- [ ] 沉淀→跳转目标模块；归档可逆（可从归档恢复）；删除需确认（L2/L4）
- [ ] 空状态显示引导文案（L4）

### 2.12 今日航线 Planner（`features/planner/`）— Could

**描述**：个性化学习计划面板——展示今日计划任务（模块徽章/时长/理由/完成勾选）、点击跳转对应模块、AI 计划与本地规则计划双来源（source 标签区分）、AI 不可用时本地规则回退；焦虑防线（无倒计时/赤字/比较）。

**验收标准**：
- [ ] AI 计划可用时展示 AI 来源任务；不可用时展示本地规则计划（L2，planRepository）
- [ ] 任务完成勾选持久化；全部完成时折叠为空态（L2）
- [ ] UI 不含倒计时/赤字/比较类焦虑元素（L4，设计约束）

### 2.13 应用运行模式 ModeManager（`lib/mode/`）— Must

**描述**：应用运行模式管理（local 纯本地 / hybrid 联网·本地优先+可选同步 / full 完全云端实时同步），模式决定 AI 与云存储开关组合；localStorage 键从 `keban_app_mode` 一次性迁移至 `ed_app_mode`（2027-01 前兼容）。

**验收标准**：
- [ ] 三种模式切换后 AI/同步/云存储开关组合正确且持久化（L1，ModeManager.test）
- [ ] local 模式：断网可用全部本地功能，无网络请求（L3）
- [ ] hybrid 模式：已登录且有网络时可同步，离线自动降级为本地（L2）
- [ ] 旧键 `keban_app_mode` 值一次性迁移，读取后写入新键（L1）
- [ ] 非法模式值回退默认值，不崩溃（L1）

### 2.14 内测与授权 Beta（`features/beta/`）— Could

**描述**：内测用户系统（BetaProfile + 邀请码）、激活码升级（ENTROPY-PRO-XXXX-XXXX / ENTROPY-LIFE-XXXX-XXXX）、层级访问控制（useTierAccess）、升级提示（UpgradePrompt）。

**验收标准**：
- [ ] 激活码格式校验正确（前缀+类型+分组）；首次验证需联网，成功后本地缓存 7 天宽限期（L2，LicenseActivation）
- [ ] 层级访问：非授权 tier 访问受限功能时显示 UpgradePrompt，不白屏（L2）
- [ ] 邀请码校验与错误提示正确（L2）

---

## 三、AI 相关功能

### 3.1 AI 网关调度（`client/electron/ai/` + `server/ai-gateway/`）— Must

**描述**：本地 Ollama + 云端多 provider（Qwen/DeepSeek/GLM/Gemini）统一调度；降级链（provider 不可用熔断→下一 provider）、限流（12+ 路由注册、chat 20 次/分）、超时（chat 60s、首 token 空闲超时保护）、成本追踪、语义缓存、流式输出（streamHandler）。

**验收标准**：
- [ ] 降级链：首选 provider 失败自动切换下一可用 provider，切换过程用户可见状态而非报错（L3，v0.34.0 P0-3）
- [ ] 限流：超限返回 429 + `Retry-After`，客户端友好提示（L2，API 设计规范 §三）
- [ ] 超时：弱网下请求在配置时限内失败并提示「AI 服务响应超时」，不无限等待（L1/L2，v0.4.0 T1.4）
- [ ] 流式：SSE 流式输出可用；首 token 空闲超时保护生效；流中断时降级非流式重试或明确失败（L3，v0.32.0 P2-13）
- [ ] 多模态模型 `max_tokens` 上限：Qwen 最大 4096、GLM-4V-Flash 最大 1024（clamp 生效）（L1，AGENTS.md 约定）
- [ ] 余额/用量：设置页 AIBalanceSection 展示网关余额查询结果，失败时有降级展示（L4）

### 3.2 本地推理 Ollama（`electron/ai/ollama/`）— Should

**描述**：本地 Ollama 状态检测（ollama:get-status）、配置（ollama:set-config）、模型下载/删除（流式进度推送 ollama:pull-model）、本地推理作为离线优先路径。

**验收标准**：
- [ ] 状态检测：Ollama 未安装/未启动/已启动三态正确返回（L1，mock 测试）
- [ ] 模型拉取：流式进度条实时更新；可取消；失败可重试（L2）
- [ ] 本地推理失败时自动切换云端 provider（降级链一部分）（L2）
- [ ] 设置页 OllamaSettingsSection 配置持久化并在下次启动生效（L2）

### 3.3 本地 ASR（`electron/ai/local-asr/`）— Should

**描述**：sherpa-onnx 本地语音识别引擎——IPC 契约与 whisper.cpp 版完全一致（local_asr_transcribe / get_config / update_config / check_available / download_model / delete_model / get_models），模型管理，渲染层零改动切换。

**验收标准**：
- [ ] IPC 契约与渲染层 asrTranscriber 完全兼容（接口一致性测试）（L1）
- [ ] 模型下载/删除/列表状态正确（L2）
- [ ] 本地识别可用性检测正确（未安装/未下载模型/就绪三态）（L1）
- [ ] 本地识别准确率 ≥85%（标准音频测试集，如可用）（L4）

### 3.4 AI 助手 Assistant（`features/assistant/`）— Should

**描述**：AI 深海同伴（水母形象）——聊天（流式）、主动引擎（useProactiveEngine 基于行为信号触发）、意图教练、睡前提醒、语音输入（useVoiceInput）、TTS 语音回复（speechStreamer/ttsController）、认知负荷评估（cognitiveLoad）、行为指标（behaviorMetrics）、进度统计；偏好 enabled=false 时整体零渲染。

**验收标准**：
- [ ] 聊天流式输出（StreamingCursor 光标）；会话持久化（assistant_sessions/messages 表）（L2）
- [ ] 主动触发：proactiveRules 规则命中才触发消息，不打断用户高频操作（防打扰）；可在设置关闭（L2/L4，proactiveRules 测试）
- [ ] TTS：可播放/停止，失败时静默降级为文本（L2）
- [ ] 语音输入：麦克风权限拒绝时优雅提示，不崩溃（L2）
- [ ] 关闭开关：enabled=false 后全局不渲染、无事件监听残留（L2，可逆>不可逆原则）
- [ ] 睡前提醒在设定时段触发一次（L2）

### 3.5 AI 离线队列（`lib/` + OfflineQueue）— Should

**描述**：离线 AI 操作（摘要等）入队（指数退避重试、nextRetryAt 水位、5 次超限丢弃）、联网后自动重放（Service Worker Background Sync + online 事件）、消费互斥锁防重复。

**验收标准**：
- [ ] 离线触发 AI 操作 → 入队并提示「已离线，将联网后自动完成」；本地数据不受影响（L2，v0.32.0 P2-11）
- [ ] 恢复网络后自动消费队列；重放成功移除；5 次失败丢弃并标记（L2，OfflineQueue 测试）
- [ ] 互斥锁：并发消费不重复执行同一操作（L1，v0.35.0 修复项）
- [ ] 应用重启后队列持久化不丢失（L2）

### 3.6 AI 错误处理统一拦截（AIPluginLoader withGuard）— Must

**描述**：所有 AI 操作经 `withGuard()` 统一校验与错误分类（content_too_short / offline / timeout / service_unavailable）。

**验收标准**：
- [ ] content <10 字符抛出 `content_too_short`；空字符串立即拒绝；≥10 字符正常通过（L1，v0.4.0 T1.3）
- [ ] `navigator.onLine === false` 时 apiClient 立即抛 OFFLINE，不等待 fetch 超时（L1，v0.4.0 T1.4）
- [ ] AIError.code 联合类型包含四个值，useAI catch 分支正确匹配并给出对应 Toast（L1/L2）
- [ ] 各 AI 插件（ElectronAIPlugin/RemoteAIPlugin）无重复长度校验代码（L1，代码审查项）

---

## 四、UI/UX 功能

### 4.1 3D 沉浸场景（`App.tsx` + 3D 场景）— Should

**描述**：R3F/three.js 3D 知识星空场景（深色模式兼容）、模块导航行星（SpatialNav）、相机飞行、性能分级（tier 三档+滞回策略）、深海主题（deep-sea / aurora-dome 双主题）。

**验收标准**：
- [ ] 深色/浅色模式切换后 3D 场景正常渲染，无白屏/闪烁（L4，v0.35.0 修复项回归）
- [ ] 性能分级：低端设备自动降档（粒子跳帧、后处理分档），tier 切换滞回防抖动（L3，v0.30.2）
- [ ] 相机飞行：点击模块导航目标正确、动画流畅；概览模式常驻显示模块标签与副标题（L4，v0.30.2）
- [ ] 3D 场景不可用时降级为 2D 布局，不阻塞功能使用（L4，优雅降级原则）
- [ ] canvas 层级不拦截功能点击（z-0）（L4，v0.30.2 回归）

### 4.2 动效体系（纯 CSS 动画令牌）— Should

**描述**：设计令牌（`--kb-ease-bounce`、`--kb-duration-stagger`、骨架屏令牌）、四个 `@keyframes`（scale-bounce / stagger-in / pulse-skeleton / blink-cursor）、按钮微交互（active:scale-95、hover:-translate-y-0.5）、Modal 入场回弹、闪卡翻转回弹、评分按钮 stagger、Skeleton shimmer/pulse 双变体、TypewriterText 打字机（长文本自动加速 10ms/字符）。

**验收标准**：
- [ ] 4 个动画令牌与 `@keyframes` 存在且 tailwind.config.js 映射可用（L1，v0.4.0 T3.1）
- [ ] 所有动画保持 60fps；仅使用 transform/opacity（不触发重排，DevTools Performance/Layout 验证）（L3，v0.4.0 性能验收）
- [ ] 按钮/卡片微交互统一生效（v0.4.0 T3.2）
- [ ] TypewriterText：默认 30ms/字符、完成移除光标、>500 字符自动加速（L2，v0.4.0 T3.4）
- [ ] `prefers-reduced-motion: reduce` 时所有自定义动画禁用，内容直接显示最终状态（L4，v0.4.0 性能验收）
- [ ] 包体积增量 <5%（动效无额外 JS 依赖）（L3，v0.4.0 性能验收）

### 4.3 导航与布局（Navbar / Sidebar / BottomNav / 面包屑）— Must

**描述**：自定义标题栏（CustomTitlebar）、侧边栏（含主页入口、5 模块进度真实数据聚合）、顶部导航（Navbar 返回按钮+面包屑 useBreadcrumb）、底部导航（新手期双标签）、页面过渡（PageTransition）、Suspense 骨架屏加载。

**验收标准**：
- [ ] 非根路由 Navbar 显示 ← 返回按钮；根路由不显示；有历史 navigate(-1)、无历史兜底导航 `/`（L2，v0.4.0 T1.5）
- [ ] `useBreadcrumb`：`/notes/abc` → [首页, 笔记, 编辑笔记]；`/flashcards/123/study` → [首页, 闪卡, 学习会话]（L1，v0.4.0 T1.5）
- [ ] 侧边栏「学习看板」为导航第一项（LayoutDashboard 图标，to="/"），点击跳转 Dashboard（L2，v0.4.0 T1.5）
- [ ] 侧边栏 4 个 store 聚合 5 模块进度为真实数据（useMemo 响应式，无硬编码）（L2，v0.34.0 P2-20）
- [ ] 新手期双标签导航：新用户 BottomNav 显示两个标签，随首潜进度解锁（L2，v0.29.0）
- [ ] 模块切换加载显示骨架屏（animate-pulse）而非 spinner；核心页面预加载（prefetchRoute）生效（L3）

### 4.4 右键菜单 ContextMenu 2.0 — Should

**描述**：统一右键菜单框架（分组 groups + separator + 声明式注册 + 向后兼容 items prop）、useContextMenu hook（isOpen/position/targetElement/onContextMenu/onClose）、笔记/闪卡/费曼三模块菜单、Esc/外部点击关闭。

**验收标准**：
- [ ] groups 模式多分组+分隔线正确渲染；旧 items prop 调用方无需修改（L2，v0.4.0 T2.1）
- [ ] `onContextMenu` 正确调用 preventDefault + stopPropagation（L1，v0.4.0 T2.2）
- [ ] Esc 与外部点击关闭菜单；菜单项 onClick 正确触发（L2，v0.4.0 TC-CM-001）
- [ ] TipTap 编辑器右键仅在选中文本时显示自定义菜单，否则 fallthrough 原生菜单（L2，v0.4.0 T2.3）
- [ ] 右键操作后不丢失编辑器选区（P2 缺陷回归项）（L2）

### 4.5 反馈面板 FeedbackPanel — Should

**描述**：侧边栏滑出式反馈面板——类型（Bug/功能建议/体验优化/其他）+ 描述 + 模块选择、必填校验、提交入 Dexie/SQLite feedbacks 表、历史列表（倒序、类型标签+摘要+状态）、空状态文案。

**验收标准**：
- [ ] 点击反馈按钮面板从右侧滑出（translateX 过渡），再次点击/外部点击收起（L2，v0.4.0 T3.6）
- [ ] 必填字段校验：空描述提交显示提示（L2）
- [ ] 提交后数据入库、历史列表实时更新、表单重置、Toast 成功（L2，v0.4.0 T3.6）
- [ ] 历史列表按 createdAt 倒序，摘要 ≤30 字符；空状态「暂无反馈记录」（L2）

### 4.6 命令面板 CommandPalette（Cmd+K）— Could

**描述**：全局命令面板（AppLayout 挂载），命令注册表（registry + defaultCommands），支持搜索与执行命令。

**验收标准**：
- [ ] Cmd/Ctrl+K 打开关闭；Esc 关闭（L2）
- [ ] 命令搜索过滤正确；执行命令跳转/动作正确（L2）
- [ ] 无命令匹配时显示空态（L2）

### 4.7 新手引导与帮助中心 — Should

**描述**：注册后引导（OnboardingPage 多步引导：欢迎/导航/相机飞行/功能面板/退出演示/全景/快捷键）、First Dive 首潜引导（L1 底部常驻微光伴航+任务驱动式完整学习循环+手册牌组+双标签导航）、帮助中心（快速开始/模块指南/快捷键/FAQ）、ModuleTourToast。

**验收标准**：
- [ ] 4 步核心引导完整可走通（番茄钟→笔记→闪卡→费曼），每步含功能名+视觉演示+说明+下一步按钮，最后引导到主界面（L4，v0.4.0 T2.7）
- [ ] First Dive：完成检查基于数据基线差值（checkProgress 轮询），与模块 UI 零耦合；跳过用可见按钮；diving 阶段 8s 间隔轮询+窗口聚焦触发（L2，v0.29.0）
- [ ] 引导可随时跳过；再次进入不重复强制引导（完成状态持久化）（L4）
- [ ] 帮助中心四个 Tab 内容与当前版本快捷键一致（L4，ShortcutsTab 同步 shortcutDefs）

### 4.8 主题与设计令牌 — Must

**描述**：深色/浅色双主题（首屏 useLayoutEffect 防闪白）、deep-sea / aurora-dome 场景主题、设计令牌（tokens.css 颜色/间距/动效）、Tailwind var() 透明度修饰符。

**验收标准**：
- [ ] 启动无主题闪白（首帧前应用主题）（L4，App.tsx）
- [ ] 主题切换即时生效并持久化（L2）
- [ ] 所有 UI 颜色引用设计令牌，无硬编码色值（代码审查项）
- [ ] 弹窗等使用 var() 透明度修饰符的样式正确渲染（回归：v0.29.0 Tailwind 修复项）（L4）

### 4.9 知识星河 KnowledgeGalaxy — Could

**描述**：Dashboard 横向区域展示已掌握知识点（每个星点=一张已掌握闪卡），悬浮显示标题；入场 stagger（40ms/星点）、悬浮放大发光、呼吸闪烁（2-4s 周期）、reduced-motion 禁用全部动效。

**验收标准**：
- [ ] 星点数量与已掌握闪卡一致，掌握/未掌握状态变化后实时更新（L2）
- [ ] 悬浮显示标题与高亮动效正确（L4）
- [ ] `prefers-reduced-motion` 时无动画（L4）

### 4.10 留存机制 Retention（`features/retention/`）— Should

**描述**：珊瑚生态（CoralEcosystem + 白化检查）、连续打卡（逐日推算）、深海发现（DiscoveryReveal portal）、疲劳共情（FatigueEmpathy）、学习画像（LearningProfile）、签名时刻三幕演出（SignatureMoment，掌握一个概念）、社交证明横幅、世界回顾、声景体系（真实自然声景 11 轨×5 分钟）。

**验收标准**：
- [ ] 5 大组件 React.lazy 懒加载 + 全局初始化 hook（useRetentionInit 按开关决定初始化顺序）（L2，v0.34.0 P1-9）
- [ ] 连续打卡天数逐日推算正确（跨月/断签边界）（L1，streakEngine 测试）
- [ ] 疲劳共情：检测到连续学习时长超阈值触发，可关闭（L2，fatigue 测试）
- [ ] 签名时刻：三幕演出（掌握一个概念）触发条件正确；可变重奏演出库随机不重复（L2，v0.35.0）
- [ ] 全部留存机制可在设置关闭（可逆原则），关闭后零渲染开销（L2）
- [ ] 声景：11 轨真实自然声景循环播放无爆音，音量可控（L4，v0.33.0）

---

## 五、系统功能

### 5.1 窗口与托盘（`electron/windowManager.ts` + `trayManager.ts`）— Must

**描述**：主窗口创建与关闭策略（退出确认/最小化到托盘/退出前同步等待）、系统托盘（恢复/退出菜单）、单实例锁（second-instance 恢复窗口）。

**验收标准**：
- [ ] 关闭窗口：按关闭偏好执行（退出确认或最小化到托盘）；托盘双击恢复主窗口；托盘菜单「退出」真正退出（L4，v0.4.0 T3.7）
- [ ] 单实例：二次启动激活已有窗口而非新开实例（L4）
- [ ] 最小化时任务栏右键关闭无响应问题不回归（L4，v0.29.0 修复项）
- [ ] 退出前同步完成（completeSyncBeforeQuit）不丢数据（L2）
- [ ] 番茄钟运行时最小化到托盘，计时继续正确（L4）

### 5.2 自动更新（`electron/updater.ts`）— Must

**描述**：electron-updater 自动更新——4h 节流检查、下载进度推送、安装确认（IPC 由用户确认）、双更新源（GitHub + 自建服务器 CDN）。

**验收标准**：
- [ ] 启动后按 4h 节流检查更新，不打扰用户（L2，mock 测试）
- [ ] 新版本下载进度经 IPC 推送渲染层展示；下载完成提示安装，用户确认后安装重启（L4）
- [ ] 主更新源不可用时回退备用源（L3）
- [ ] 更新失败不阻塞应用正常使用（L2）

### 5.3 全局快捷键（`electron/shortcutManager.ts` + `features/shortcut/`）— Should

**描述**：全局快捷键注册（shortcutDefs 定义、globalShortcut）、IPC 触发分发（shortcutDispatcher）、剪贴板捕获（Ctrl+Shift+B 灌入收件箱）、快捷键设置页（可自定义）。

**验收标准**：
- [ ] 快捷键定义与设置页展示一致；注册失败非致命（记录日志，不崩溃）（L1，v0.4.0 约定）
- [ ] 触发后正确分发到目标功能（剪贴板→收件箱等）（L2）
- [ ] 快捷键冲突（与其他应用）时提示用户修改（L4）
- [ ] 退出前全部注销（dispose），无残留注册（L1）

### 5.4 数据层（`electron/db/` + `lib/storage/`）— Must

**描述**：better-sqlite3 本地持久化（SQLite 主存储）、Schema 迁移（双版本兼容）、FTS5 全文搜索（BM25 + rebuildIndex 异步分批 + 增量维护 + 异常降级）、IPC 白名单（6+ 表）、Dexie 兼容层（StorageAdapter 抽象）、加密存储（safeStorage）、操作日志（operationLog + writeWithLog）。

**验收标准**：
- [ ] 启动时 Schema 初始化幂等；迁移不丢数据（备份先行）（L2，migration 测试）
- [ ] FTS5：rebuildIndex 异步分批不阻塞启动关键路径；insert/update/delete 增量维护；异常传播并降级 LIKE（L2，v0.34.0 P0-1/审查 1-2）
- [ ] IPC 白名单：白名单内 channel 可调用、白名单外拒绝（sender 验证）（L1，v0.4.0 beta.1）
- [ ] 写操作全部走 writeWithLog 记录操作日志，同步可追溯（L1）
- [ ] 数据库文件路径可配置（设置页 StoragePathSection），重启后生效（L2）
- [ ] 数据量 10 万级记录下核心查询 <200ms（L3，性能规范）

### 5.5 备份 / 导入导出（`lib/crypto/` + `lib/storage/`）— Must

**描述**：加密备份（AES-GCM + 口令派生，backupCrypto/encryption）、完整导出（fullExport，JSON + 媒体）、Anki 牌组导入导出（deckExchange）、备份恢复校验（版本/结构/白名单）。

**验收标准**：
- [ ] 加密备份：口令不一致无法解密（明确报错）；解密数据与备份一致（L1，backupCrypto 测试）
- [ ] 备份/恢复往返数据无损（L2，round-trip 测试）
- [ ] 导入校验：格式/版本/大小防御（BOM/超限提示），非法文件不崩溃（L1，v0.35.0 审查修复项）
- [ ] 导入恢复后 FTS 索引重建，搜索立即可用（L2）

### 5.6 数据主权「世界之书」（`electron/sovereigntyHandlers.ts` + `features/sovereignty/`）— Should

**描述**：世界导出（叙述层：图谱摘要+世界快照+入籍记录+隐私声明；恢复层：10 张白名单表完整行，幂等 INSERT OR REPLACE，事务整体回滚）+ 恢复校验（版本/结构/节点上限/白名单/总行数）+ 导出不含任何密钥（AI 密钥/网关配置永不入包）。

**验收标准**：
- [ ] 导出 bundle 不包含 AI 密钥/网关配置/敏感字段（L1，worldExport 测试断言）
- [ ] 恢复校验失败（版本不符/结构损坏/超限）返回明确错误，不写入任何数据（L2）
- [ ] 恢复成功：10 表数据完整、事务原子（任一表失败整体回滚）、FTS 重建（L2，v0.35.0 阶段 D）
- [ ] 恢复表白名单扩展正确（含 world_snapshots/imports）（L1，importWhitelist 测试）
- [ ] 主权页（设置内）展示导出/恢复入口与结果状态（L4）

### 5.7 同步 Sync（`lib/sync/` + 云同步服务）— Should

**描述**：CRDT 协同引擎（crdtEngine/crdtCodec/crdtSyncChannel）、操作日志同步（oplogSyncChannel + 游标 syncCursors）、离线队列（OfflineQueue）、网络管理（NetworkManager 状态感知）、冲突处理（ConflictDialog）、同步模式（syncMode）、同步状态栏（SyncStatusBar）、Service Worker Background Sync。

**验收标准**：
- [ ] 双端同步：A 端修改经云端同步到 B 端，无冲突时结果一致（L3）
- [ ] CRDT 合并：并发编辑同一文档收敛到一致状态（L1，crdtEngine 测试）
- [ ] 冲突场景弹出 ConflictDialog 供用户选择；选择后正确应用（L2）
- [ ] 离线编辑入队，恢复网络自动同步（含 Background Sync 触发）（L2，SyncEngine/OfflineQueue 测试）
- [ ] 同步进度/状态在 SyncStatusBar 可见；失败可重试（L4）
- [ ] 敏感字段（sensitiveFields）不参与同步（L1）

### 5.8 PWA 与离线支持（`service-worker/` + `public/`）— Should

**描述**：PWA manifest + Service Worker 缓存策略（离线.html）、离线操作 localStorage 降级队列、Background Sync（渐进增强，Chromium 完整支持，其他浏览器静默降级）、AI 离线降级提示。

**验收标准**：
- [ ] 断网后应用可加载（缓存策略生效），核心本地功能（番茄钟/笔记/闪卡）完全可用（L3，v0.4.0 §3.4）
- [ ] 断网时 AI 操作显示「当前离线」提示而非超时（L2，v0.4.0 T1.4）
- [ ] 非 Chromium 浏览器 Background Sync 静默降级，不影响功能（L4）
- [ ] 安装为 PWA 后窗口/图标/标题正确（L4）

### 5.9 性能模式与诊断（`lib/performance/`）— Should

**描述**：三档性能模式（静谧/从容/澎湃，performanceMode）、帧率/CPU/内存实时采集诊断面板（PerformanceDiagnostics，一键复制上报）、3D tier 联动、AudioWorklet 零拷贝传输。

**验收标准**：
- [ ] 三档模式切换即时生效并持久化；澎湃档启用全部特效、静谧档关闭高开销渲染（L2，performanceMode 测试）
- [ ] 诊断面板 FPS/CPU/内存数据实时且可一键复制（L2，v0.32.0 P3-18）
- [ ] 低帧率（<30fps）自动触发降级或提示（L3）

### 5.10 设置页 Settings — Must

**描述**：外观（主题/信息密度）、AI Provider 配置（网关 URL/Key/健康指示 GatewayHealthIndicator）、Ollama 配置、ASR 配置（引擎选择/模型管理）、音频采集（声源选择/麦克风）、数据（存储路径/清除数据/加密备份/导入导出）、快捷方式、声音、性能（模式/诊断）、记忆服务器授权、世界主权、关于（版本/许可证）。

**验收标准**：
- [ ] 全部设置项保存后持久化并在下次启动生效（L2）
- [ ] 网关健康指示：可用/不可用状态正确，不可用时给出配置引导（L2，v0.35.0）
- [ ] 清除数据：二次确认 + 清除后应用状态干净可重新初始化（L2，useClearData）
- [ ] 存储路径修改：旧数据迁移提示与执行正确（L2，useStoragePath）
- [ ] 设置页未来功能区块显示 ComingSoonBadge（L4，v0.4.0 T2.6）
- [ ] 关于页版本号与 package.json 一致（L1）

### 5.11 MCP 学习记忆服务器（`electron/mcpManager.ts` + `mcpMemoryServer.ts`）— Could

**描述**：MCP Server 桥接（Bridge 架构：主进程 fork 子进程加载 MCP SDK）、8 只只读工具（profile/mastery/review_candidates/focus_stats/streak/discoveries/recent_sessions/world_state/knowledge_graph）、授权门禁（应用内开关 + 首次使用 consent）、访问审计、世界快照跨进程桥。

**验收标准**：
- [ ] 未授权时 MCP 工具调用返回拒绝（L2，memoryServerConsent）
- [ ] 授权开关关闭后服务器不启动/不响应（零开销）（L2）
- [ ] 8+ 工具返回数据与本地学习数据一致（L3，mcp 集成测试）
- [ ] 访问审计记录可查询（L1）
- [ ] 桥接进程异常退出可自动重启或安全降级（L2）

### 5.12 认证体系（`pages/` 登录/注册/验证）— Could

**描述**：登录/注册/忘记密码/邮箱验证页面、AuthGuard 路由守卫（占位符凭证 pass-through 软模式）、公开路由白名单（/onboarding、/login、/register）。

**验收标准**：
- [ ] 占位符凭证时 AuthGuard 完全 pass-through 渲染 children（L2，v0.4.0 T2.8）
- [ ] 有效凭证+未登录+非公开路由显示 LoginPrompt（含跳过按钮）（L2）
- [ ] 公开路由白名单不拦截（L2）
- [ ] 邮箱验证跳转/重置密码链接可用（回归：v0.29.0 修复项）（L4）
- [ ] 表单校验（邮箱格式/密码强度）与错误提示正确（L2，LoginPage.test 基线）

---

## 六、非功能需求与全局验收标准

### 6.1 性能（引用 [性能优化规范](../standards/performance.md)）

| 指标 | 目标值 | 测量方式 |
|------|--------|---------|
| 冷启动 | 主窗口 3s 内可交互 | 计时录制 |
| 页面切换 | 模块切换 <300ms（含骨架屏） | DevTools |
| 动画帧率 | 全部动画 60fps，无 Long Task | Performance 面板 |
| 单元测试执行 | <30s（v0.4.0 §1.2） | npm test |
| 首包体积 | 增量 <5%每版本 | CI 体积监控（200MB 门禁） |
| 长列表 | 500 条渲染 <500ms | 性能基线 |
| 内存 | 长时间采集/会话无无界增长（关键帧内存限制） | Heap snapshot |

### 6.2 安全（引用 [安全规范](../standards/security.md)）

- [ ] IPC sender 验证 + channel 白名单（v0.34.0 P0-2）
- [ ] 输入校验：AI handler 入参校验、宽松 JSON 解析（v0.35.0）
- [ ] 文件安全：录音/导出文件名防路径穿越（安全字符校验）
- [ ] 导入校验：BOM/大小/结构防御（v0.35.0 审查项）
- [ ] 导出不携带密钥/敏感字段（5.6）
- [ ] 网络：网关 URL 可配置无硬编码 IP（v0.34.0 P0-6）
- [ ] CSP 策略生效（cspPolicy.ts）
- [ ] 加密存储：safeStorage + 加密备份（AES-GCM）

### 6.3 兼容性

| 环境 | 要求 |
|------|------|
| Windows | 10/11 桌面端（唯一构建目标，v0.34.0 残余风险） |
| 浏览器（PWA） | Chrome 最新（主）、Edge 最新（辅）、Firefox 90+、Safari 15+ 兼容验证 |
| 移动端 | Chrome DevTools 移动模拟器响应式验证（非主目标） |
| Node | ≥20，npm ≥10（开发环境） |

### 6.4 可访问性

- [ ] 键盘可达：Tab 焦点循环（仪式层焦点陷阱）、Esc/Enter 快捷键、快捷键提示
- [ ] `prefers-reduced-motion` 全站降级（动效 4.2、仪式 2.1.1）
- [ ] `aria-live` 播报关键状态（呼吸相位、AI 加载）
- [ ] 颜色对比度满足可读性（深浅双主题）
- [ ] 语音输入不可用时隐藏按钮（功能隐藏级降级）

### 6.5 数据与隐私

- [ ] 本地优先：核心数据全部本地持久化，AI 为可选增强（AGENTS.md 核心理念）
- [ ] 截图原始图片处理后立即删除（课堂助手）
- [ ] 敏感字段不参与同步（5.7）
- [ ] 备份加密（5.5）；导出无密钥（5.6）
- [ ] MCP 授权门禁（5.11）
- [ ] 清除数据功能完整可用（5.10）

---

## 七、质量门禁（发布前全量检查）

### 7.1 自动化门禁

- [ ] `npm run lint` 通过（Oxlint，0 error）
- [ ] `npm test` 退出码 0（单元+集成，核心模块覆盖率 ≥80%，新增代码 ≥80%）
- [ ] `npm run build`（tsc -b + vite build）无错误
- [ ] `npm run electron:build` 构建成功（NSIS 安装包，安装/卸载/首启验证）
- [ ] CI：PR 检查全绿 + 覆盖率门槛 + 体积监控 200MB（v0.34.0 P2-17）
- [ ] 后端（AI 网关 pytest、同步服务 go test）全绿（如涉端到端）

### 7.2 手动验收门禁（L4 UAT）

- [ ] 四大核心模块（番茄钟/笔记/闪卡/费曼）回归通过（v0.4.0 §2.7）
- [ ] Dashboard 数据展示与设置页（主题/信息密度/AI 配置）回归通过
- [ ] 数据持久化（SQLite/Dexie 读写、配置持久化）回归通过
- [ ] PWA Service Worker 离线缓存回归通过
- [ ] v0.3.0 已交付功能回归（成就系统、RichTooltip、牌组分享、设计令牌）
- [ ] 无 P0/P1 缺陷遗留（P2 全部在当前迭代关闭或明确排期）
- [ ] 动效性能验证（60fps + GPU 合成层）与 reduced-motion 降级验证

### 7.3 E2E 建议路径（残余风险：E2E 缺失，v0.34.0）

以下关键用户路径建议引入 Playwright 覆盖（后续迭代）：

1. 启动 → 仪式 → 番茄钟完整一轮 → 记录生成
2. 新建笔记 → AI 摘要 → 生成闪卡 → 进入学习会话评分
3. 课堂助手 → 选窗 → 截图提取 → 插入笔记
4. 反馈提交 → 历史列表更新
5. 离线操作 → 恢复网络 → 队列重放

---

## 八、功能覆盖率映射（测试归属）

| 模块 | 主要测试文件（现有基线） | 覆盖率状态 |
|------|------------------------|-----------|
| 番茄钟 | usePomodoroStore.test.ts（56）、adaptiveEngine.test、rhythmEngine.test | ✅ 核心 ≥90% |
| 闪卡 | fsrs.test（33）、sm2.test、useCardInteraction | ✅ 核心 ≥90% |
| 费曼 | useSocraticFlow.test（24）、useFeynmanStore.test、FeynmanRecorder.test | ✅ 核心 ≥80% |
| 笔记 | useNoteStore.test、noteMarkdown/mindmapOps/links 系列、classroomNoteStore.test | ✅ 核心 ≥80% |
| 课堂 | asrTranscriber.test、tipTapConverter.test、analysisErrors.test、keyframePersistence.test | ✅ 核心 ≥80% |
| 采集管线 | smartSampler.test、vadMarker.test、audioPipeline（AudioWorklet） | ✅ |
| 加密/备份 | backupCrypto.test、encryption | ✅ |
| 同步 | SyncEngine.test、OfflineQueue.test、NetworkManager.test、crdtCodec | ✅ |
| 知识入籍 | contentSanitizer.test、textChunker.test、useSettleConcepts.test | ✅ |
| 主权 | worldExport.test、importWhitelist.test | ✅ |
| 留存 | streakEngine、fatigue.test、worldState.test | ✅ |
| 仪式 | useRitualMachine.test、BreathingProvider.test、ritualPlanner.test | ✅ |
| 助手 | speechNormalizer/speechStreamer/cognitiveLoad/behaviorMetrics/bedtimeReview/progressStats | ✅ |
| 工具库 | tokenizer、textDiff、backupCrypto、smartSampler、noteHealth、linkExtractor 等 | ✅ ≥80% |

> 注：上表为代码库中已存在的测试基线（v0.34.0 审计新增 287 个测试后）；新功能开发时需同步补充测试，遵循 [测试规范](../standards/testing.md) 的命名（函数+场景+期望）与 AAA 结构。

---

## 九、变更追溯

| 版本 | 变更要点 | 对应章节 |
|------|---------|---------|
| v0.27.0 | 学习启动仪式重塑（呼吸容器/掌握闭环/自适应编排） | 2.1.1 |
| v0.29.0 | First Dive 新手引导、双标签导航 | 4.7 |
| v0.30.0 | 进程环回音频采集（Phase 0-3） | 2.6 |
| v0.32.0 | 思维导图/双向链接/自由画布/Markdown 往返、三档性能模式、本地 ASR、离线 AI 队列、流式摘要 | 2.3 / 3.x / 5.9 |
| v0.34.0 | FTS5 搜索、留存机制上线、AI 解释/提炼、AudioWorklet、麦克风 Provider、侧边栏真实数据、隐私政策 | 2.3 / 4.9 / 5.4 / 5.1x |
| v0.35.0 | 知识星座双轨、知识入籍、世界之书、MCP 记忆服务器、签名时刻、声景体系、热词表、课堂错误四分类 | 2.6 / 2.8 / 2.10 / 5.6 / 5.11 |

---

*文档结束*
