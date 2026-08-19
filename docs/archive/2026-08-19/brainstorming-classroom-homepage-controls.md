# 头脑风暴：课堂助手主页缺口——采集控制与实时感知 + 开始前准备流

**状态**: 已裁决（2026-08 用户选定 A+C 两方向；A1~A4、C1、C2 按本设计实现）

## 基本信息

| 字段 | 内容 |
|------|------|
| 主题 | 课堂助手主页（ClassroomPage）在"配置可信 + 实时反馈丰富"方向上的缺口设计 |
| 日期 | 2026-08 |
| 参与者 | 熵减重构区 |
| 关联 | [课堂助手缺口评估](./brainstorming-classroom-assistant-gaps.md)（机制层已排期项，本设计不重复）· [需求池](../product/requirements-pool.md) · [PRD](../product/prd.md) · 2026-08 课堂助手页面优化批次（窗口过滤/档案右移/模型状态/实时图片） |

## 1. 背景与方法

### 对照基线（勿重复提出）
- **已实施**：窗口枚举与过滤增强（最小化/cloaked/工具窗口/站点首页）、视频类型档案（右移+记忆偏好）、流式 ASR 全链路（VAD/热词/重打分/降级）、字幕 OCR + 画面 OCR + 关键帧三层图存储、融合时间轴、结构模型按需下载（磁盘状态兜底）、音频预处理链（默认开）、实时转写 + 最近画面条 + 画面要点
- **已排期/明确不做**（PRD）：AI 多轮问答、章节导图（P2）、时间轴编辑（P1 迭代）、移动端、社交排行、实时增量融合、多窗口并行采集（S3 延后）

### 需求来源
- 用户头脑风暴"课堂助手主页还差什么"→ 四维缺口全景（采集控制/准备流/数据入口/链路整合）→ 用户选定 **A（采集控制与实时感知）+ C（开始前准备流）**，B（主页数据入口）与 D（双链路整合）保留待后续批次

### 设计原则
- 本地优先：所有能力本地完成，云不参与
- 复用存量：暂停落库走 session_events（REQ-108）、电平复用块级 RMS（REQ-103）、标记复用 save_user_screenshot（REQ-051）、就绪清单聚合现有 command——本批次零新增系统依赖
- YAGNI：试听不做"录 3 秒回放"（需新增音频播放依赖），用 VU 表实时替代

---

## 2. A 批：采集控制与实时感知

### A1 暂停/继续（硬暂停）

**语义**：暂停 = 完全停采（不消费音频块、不喂 ASR、不 OCR、不落库）；恢复 = 时间轴继续，无内容丢失、无端点重连（WASAPI/DXGI 保持不释放——重连是最大抖动源）。

**Rust 侧**
- `LiveSessionManager` 增加 `paused: Arc<AtomicBool>`（与 stop_flag 同模式；Clone 透传）
- 新命令 `pause_live_session` / `resume_live_session`（commands_live.rs）：无活动会话 → Err("无活动会话")；已暂停再暂停 → Err（幂等拒绝）
- 消费端（live_session_loop.rs 音频主循环 + live_session_frame.rs 屏幕 worker 循环）：每轮检查 paused——
  - 音频：暂停期不 recv 消费（或消费即丢弃），channel 不积压；恢复后从当前块继续
  - 屏幕：暂停期跳过采样与 OCR（worker 内 sleep 节流）
  - 时间轴：`paused_total: Duration` 累计；会话相对时间 = now - epoch - paused_total（AudioLoopbackCapture 的 epoch 基准按同一补偿逻辑，恢复后时间戳无跳跃）
- 事件：独立 `live:paused` / `live:resumed`（**不复用 live:status**——App.tsx/ClassroomPage 既有 `payload === "recording"` 契约不动）
- 落库：`EventKind` 增 `Pause` / `Resume` 变体 → `session_events` 表（容量守卫 FIFO 自动处理），会话页时间轴可见暂停标记
- 边界：暂停中停止 → 正常停止路径（无新内容，drain 语义安全）；暂停中关闭应用 → 既有确认框文案不变

**前端侧**
- 采集中按钮组：`⏸ 暂停 | ⏹ 停止`；暂停态变 `▶ 继续 | ⏹ 停止`
- 状态行：左侧卡片与右侧 LiveActivityPanel 状态机显示"⏸ 已暂停"（监听 live:paused/resumed）
- App.tsx 全局采集徽标暂停态文案（"🎙 采集中"→"⏸ 已暂停"）

**验收**：暂停 30s 恢复，转写时间轴无暂停期内容、无跳跃错位；暂停期 CPU 显著下降；重复暂停/继续幂等。

### A2 音频电平仪表（VU）

- Rust：live_session_loop 音频块处理处每 ~200ms emit `live:audio-level`，载荷 `{ rms: f32 (0-1), clipping: bool }`（复用 sentence_rms_sum 与削波检测）
- 前端：左栏采集中卡片 12 段电平条（绿→红渐变，削波段标红）；静音平、讲话跳动
- 验收：讲话/静音/削波三种状态肉眼可辨

### A3 手动标记按钮

- Rust：`save_user_screenshot` 成功后补 `emit("live:image-saved", rel)`（修复：当前手动截图后"最近画面"条不刷新的闭环缺口）
- 前端：采集中卡片加 `⭐ 标记此刻` 按钮（tooltip 提示 Ctrl+Shift+S）
- 验收：点按钮 → 最近画面条顶部即时出现新图

### A4 停止后直达融合结果

- App.tsx：给 ClassroomPage 传 `onOpenSessions: () => void`；持 `focusSessionId` state 传给 SessionsPage（自动打开对应会话详情）
- ClassroomPage：`session:fused` 后右侧显示结果卡片"✅ 融合完成（会话 #id）→ 查看时间轴"，点击跳「会话」页并定位
- 验收：融合完成 → 一键到达该会话时间轴

---

## 3. C 批：开始前准备流

### C1 引擎就绪清单（零后端）

- 左栏顶部新卡片"就绪检查"：聚合现有 command——流式 ASR 模型（asr_streaming_model_status）/ SenseVoice（asr 模型路径存在性）/ OCR 设备（ocr_device_status）/ 结构模型（structure_model_status）/ 磁盘空间（健康检查）
- 每项 ✓（就绪）/ ✗（缺失，附操作按钮：复用现有下载/重新检测）/ ⚠（降级提示）
- 全就绪 → 绿条"一切就绪，可开始实时捕获"；有缺失 → 列缺失项
- 若 SenseVoice/磁盘无现成只读 command → 补两个只读 command（低成本）

### C2 试听自检（收敛设计）

- **不做**"录 3 秒回放"（需新增音频播放依赖，违反 YAGNI）
- A2 的 VU 表即自检：开始后前 3 秒 VU 条高亮"请确认能听到课程声音"——路由错了当场可见
- 远期可选：开始前 2 秒静默探测电平 + "检测到音频信号 ✓"提示（本批次不做）

---

## 4. 实现顺序与提交计划

1. `feat(live): 会话暂停/继续（硬暂停）`——Rust（manager/loop/worker/events/commands）+ 前端按钮组与状态
2. `feat(live): 音频电平仪表 + 手动标记闭环`——live:audio-level 事件 + VU 条 + 标记按钮 + save_user_screenshot 补事件
3. `feat(classroom): 融合完成直达会话`——App 导航回调 + focusSessionId + 结果卡片
4. `feat(classroom): 引擎就绪清单`——聚合卡片 + 缺失项操作

每步 `cargo test`（当前 936 例基线）+ 收尾 `npm run build`；暂停语义需真机验证（时间轴补偿）。

## 5. 不做（本批次）

- 录 3 秒回放试听（依赖新增播放链路）
- 会话中实时编辑/回看转写（时间轴编辑为 PRD P1 迭代）
- 多窗口并行采集（S3 延后）
- 主页最近会话/笔记入口与统计（B 方向，待后续批次）
- 实时/文件双链路合并（D 方向，待后续批次）
