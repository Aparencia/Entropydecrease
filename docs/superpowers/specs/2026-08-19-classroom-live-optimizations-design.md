# 课堂助手三项优化设计（2026-08-19）

> 状态：已获用户批准（设计评审 2026-08-19）｜实现前请先评审本文件
> 对应代码：`app/src-tauri/src/live_session*.rs`、`app/src-tauri/src/capture/`、`app/src/pages/ClassroomPage.tsx`

## 1. 背景与目标

课堂助手实时捕获链路存在三处可优化点，本次一并修复：

| # | 问题 | 现状根因 | 目标 |
|---|------|---------|------|
| P1 | 停止捕获不立即生效，且终端输出 `[LiveSession] 会话线程 5s 内未退出，已 detach` | 停止后 drain 宽限 8s 内捕获线程仍在喂块，队列永不空；`stop_active` 只等 5s，必然超时 | 停止后 ~0.3–1s 内 `live:status stopped`；detach 日志仅作为真卡死兜底 |
| P2 | 捕获无法根据视频播放状态自启停 | REQ-125 已能检测暂停/恢复（落库），但未驱动捕获 | 视频暂停 → 捕获整链路自动暂停；恢复播放 → 自动恢复；前端可见徽标 |
| P3 | 引擎初始化在点"开始"之后才开始 | `StreamingAsrEngine::load`（SenseVoice + 标点恢复，数秒）在会话线程内执行 | 进课堂助手页即后台预热；点"开始"毫秒级启动 |

用户已确认的决策：
- P2 暂停范围：**整条链路暂停**（音频不喂 ASR、不写 WAV；屏幕采样与 OCR 全停）。
- P3 预热时机：**进课堂助手页即预热，离开页面释放**（外加 15 分钟空闲 TTL 兜底）。

## 2. 方案 P1：停止立即生效

### 2.1 根因链

1. `stop_active()` 置位 stop 标志（`live_session.rs`）。
2. `run_audio_loop` 在 `recv_timeout` 超时分支观察到 stop → 进入 drain 模式，宽限 `DRAIN_GRACE_SECS = 8s`（`live_session_loop.rs`）。
3. 但 WASAPI 捕获线程的停止只发生在循环结束后 `audio.stop()`（第 340 行）——drain 期间捕获线程**持续向 channel 喂块**，队列永不空，`recv_timeout` 恒返回 `Ok(chunk)`，循环只能烧满 8s 宽限。
4. `stop_active` 有界等待仅 5s（100ms 轮询）→ 必然超时 → detach 日志必现；`stop_live_session` IPC 5s 才返回。

### 2.2 修复

`live_session_loop.rs`，超时分支：

```
Err(Timeout) => {
    if draining { break; }
    if stop {
        draining = true;
        audio.stop();   // 新增：立即停捕获线程 → channel 断开
    }
}
```

- `audio.stop()` 置位捕获线程 stop 标志并 join；捕获线程每 ≤10ms 轮询一次（重连退避期间每 100ms），退出有界。
- 断开后：队列中残留块继续经 `Ok(chunk)` 正常处理（内容不丢，既有 drain 语义），随后 `Err(Disconnected)` 退出。
- 8s 宽限保留为理论兜底（ASR flush 真卡死等极端场景），正常路径不再触发。
- `commands_live.rs`：`stop_live_session` 实际未按注释用 `spawn_blocking` 包裹（异步 command 直接阻塞 5s）——补上 `tauri::async_runtime::spawn_blocking`（`LiveSessionManager` 为 Clone，闭包可 'static）。

### 2.3 边界

- 停止瞬间积压块：drain 继续喂入 ASR 处理（内容不丢，与既有设计一致），通常 <1s 处理完。
- 捕获线程处于 10s 退避（设备缺失重连）时：退避等待循环每 100ms 检查 stop → ≤100ms 退出。
- `stop_active` 的 5s 有界等待与 detach 日志保留，作为不可预知阻塞的兜底可观测点。

## 3. 方案 P2：视频播放状态驱动捕获自暂停/自恢复

### 3.1 信号源

复用现有 REQ-125 检测（`player_behavior.rs` + `live_session_frame.rs` 内 5s 节流状态机）：
- 暂停 = `detect_pause_icon` 命中（中央暗遮罩 + 亮图标颜色统计，保守阈值）。
- 恢复 = 状态机从 "Pause → 无图标" 推导。
- 现有行为保留：`record_action` 落库 Pause/Play 事件；首次检测只建基线不写事件（MEDIUM-9）。

**局限（诚实标注，不做夸大承诺）**：检测依赖播放器暂停图标可见（窗口在前台、播放器显示图标）；遮挡/最小化可能漏检或误判恢复；生效滞后 ≤5s（检测节流）；播客/直播档案（`disable_ocr`）无屏幕 worker → 无自动暂停（无视频画面，语义一致）。

### 3.2 共享状态

新增 `paused: Arc<AtomicBool>`，与 `speech_active` 同模式：
- 创建于 `run_session`（`live_session.rs`），注入屏幕 worker 与音频循环 ctx。
- 屏幕 worker 是唯一写入方（检测结果）；音频循环只读。

### 3.3 屏幕 worker（`live_session_frame.rs`）

- 检测到暂停（含首检基线为暂停）→ `paused.store(true)` + 推 `live:paused`；检测到恢复 → `paused.store(false)` + 推 `live:resumed`（事件为新增契约，前端徽标用）。
- **暂停模式**：跳过 `process_frame`（无 diff/OCR/落库/图片归档），但仍保留：
  - 低频仅取帧（1s 一拍，`sampler.capture(None)`）刷新 `latest_frame`——检测读的就是 `latest_frame`，不刷新则无法发现恢复播放；只取帧不做任何分析，成本可忽略。
  - 前台时间线监控轮询（2s）照常（暂停期间切走窗口仍应记录）。
  - 播放检测轮询（5s）照常（恢复的唯一信号）。
- 会话开始时视频已暂停：首检基线 `paused=true` → 直接进入暂停模式，不写假 Pause 事件（沿用 MEDIUM-9 逻辑，只多一个标志写入）。

### 3.4 音频循环（`live_session_loop.rs`）

- 每个 chunk 处理前检查 `paused`：
  - **上升沿（false→true）**：调用公共 helper `flush_tail_and_persist(ctx, ...)`（从停止路径尾句落库逻辑提取，含挂起段兜底、跨 final 去重、句起/句尾时间戳、音量/停顿透传），随后 `ctx.asr_engine.reset()`（方法已存在，注释即"复用预留"：重建流、清句音频、热词重读）→ 进入暂停消费模式。
  - **暂停中**：消费并丢弃 chunk（防无界 channel 积压）；不写 WAV、不喂 ASR；`speech_active` 置 false（防御性）。
  - **下降沿（true→false）**：无特殊动作；首个非静音块自然重建句起时间戳（`sentence_start_ms` 为 None）。
- 时间轴语义：暂停段在会话时间轴上自然形成间隙（epoch 单调墙钟时间）；恢复后从当前时刻继续，与观看行为一致。
- WAV 语义：暂停段不写入 → WAV 时长 < 墙钟时长。已知影响：`asr_forensic`/`cer_bench` 等按段时间戳对齐 WAV 的开发工具在含暂停会话上会有偏移——属开发工具口径问题，用户已确认"不写 WAV"，文档标注即可，不为此改变方案。
- `flush_tail_and_persist` 与停止路径共用 → 停止路径行为零回归（同一代码路径）。

### 3.5 前端（`ClassroomPage.tsx`）

- 监听 `live:paused` / `live:resumed` → 状态 `livePaused`。
- `livePaused` 时：录制面板显示"⏸ 视频已暂停，捕获自动暂停中"（录制中徽标旁）；停止按钮始终可用；状态不影响"停止"语义。
- 事件丢失兜底：不新增超时清理（暂停态跟随下一次检测自愈；最坏情况徽标延迟 ≤5s 恢复）。

## 4. 方案 P3：引擎预热提前到选窗口阶段

### 4.1 约束

`StreamingAsrEngine` 含 FFI 句柄（非 Send），**不能跨线程移交** → 采用"预备会话线程"：预热线程加载引擎后停在原线程等待交接，加载结果通过 channel 传递，引擎本身不移动。

### 4.2 新文件 `live_session_prepare.rs`（≤300 行）

```rust
enum PrepareMsg { Start(LiveSessionParams, i64 /*session_id*/), Cancel }
enum PrepareStatus { Loading, Ready, Failed(String), Idle }
struct PreparedSession {
    tx: mpsc::Sender<PrepareMsg>,
    thread: JoinHandle<()>,
    status: Arc<Mutex<PrepareStatus>>,   // 与代码库 Arc<Mutex> 既有风格一致
}
```

- `LiveSessionManager` 新增字段 `prepared: Arc<Mutex<Option<PreparedSession>>>`。
- 预备线程流程：`StreamingAsrEngine::load`（输入：streaming_models / engines / vocab / punctuation_model，均来自 AppState）→ 成功置 `Ready`，失败置 `Failed(reason)` 后退出 → park 循环 `recv_timeout(500ms)` 检查 `Cancel` 与 15 分钟 TTL → 收到 `Start` 后执行 `run_session_after_engine`（见 4.4）。
- 加载失败/模型缺失：置 `Failed` 退出，不阻塞任何后续流程（start 走内联兜底）。

### 4.3 命令契约（`commands_live.rs` + `lib.rs` 注册）

- `prepare_live_session(state) -> PrepareStatus`：
  - 已有活动会话 → 返回 `Idle`（不重复预热，避免白占内存）。
  - 已有预备 → 返回当前状态（幂等）。
  - 模型未就绪（`ensure_model_files` 预检）→ 返回 `Failed("模型未就绪")`，不 spawn。
  - 否则 spawn 预备线程，返回 `Loading`/`Ready`（异步状态经共享槽）。
- `release_live_prepare(state)`：发送 `Cancel`，有界 join ≤1s，超时 detach + 日志（可观测）。
- `live_session_status` 增加 `prepared: bool`（前端提示"引擎已就绪"）。
- `start_live_session` 修改：
  1. 锁 `active`；已有活动会话 → 报错（现状）。
  2. `db.create_session`（现状，标题在 start 时确定）。
  3. 若 `prepared` 存在：take 出 → 等状态（`Loading` 时有界等待 ≤5s；`Ready` 直接发 `Start`）→ 发送 `Start(params, session_id)` → 线程成为会话线程 → `JoinHandle` 移入 `active`。
  4. 若 `Failed`/无预备/等待超时：回退现状（新线程内联加载引擎），start 永不因预热缺席而失败。
  5. 锁顺序固定：先 `active` 后 `prepared`（防死锁）。
- 注意：`start` 的会话纪元 epoch 仍在移交后创建（模型已加载完，无 A1 秒级偏移问题；ADR-008 A1 语义保持）。

### 4.4 会话线程重构（`live_session.rs`）

```
run_session() = load 引擎 → run_session_after_engine(engine, params, session_id, latest_frame)
run_session_after_engine() = 现状步骤 2–5（音频捕获 → 屏幕 worker → 音频循环 → 后台融合）
预备线程 = load 引擎 → park 等 Start → run_session_after_engine(...)
```

### 4.5 前端触发时机（`ClassroomPage.tsx`）

- 页面挂载 → `prepare_live_session`（进入选窗口流程即开始预热）。
- 页面卸载 → `release_live_prepare`。
- 停止会话成功后 → 再次预热（页面仍在，下一次开始也应秒启）。
- 模型下载完成（`model:download-done`）→ 再次预热。
- 按钮下方提示：`preparing → "引擎预热中…"`；`ready → "引擎已就绪，开始即录"`；`failed → 不提示（start 走兜底，模型状态区已有错误 UI）`。

### 4.6 边界

- 预热加载中用户点"开始"：有界等待 ≤5s，不双开引擎（防内存翻倍）。
- 预热后 15 分钟未开始：线程自行退出释放内存（TTL）。
- 页面卸载但 TTL 未到：`release_live_prepare` 主动释放。
- 词表/档案在预热后变更：档案经 Start 消息传入（无影响）；热词在 `reset()`/`new_stream()` 时重读——**会话中途生效**（既有机制），预热后未开始前的词表变更在首次端点时生效（现状即如此，无回归）。
- 同页连续多次会话：每次 stop 后前端重新预热，期间内存短暂空窗（引擎随线程退出释放），可接受。

## 5. 文件改动清单

| 文件 | 改动 |
|------|------|
| `src-tauri/src/live_session.rs` | 拆分 `run_session_after_engine`；新增 `paused` 共享标志装配；manager 增加 prepared 字段与 start 交接 |
| `src-tauri/src/live_session_prepare.rs` | **新增**：预备线程/状态机/消息（≤300 行） |
| `src-tauri/src/live_session_loop.rs` | 停止即 `audio.stop()`；`paused` 上升沿 flush+reset；暂停消费丢弃；尾句 helper 提取 |
| `src-tauri/src/live_session_persist.rs` | 提取 `flush_tail_and_persist` 公共 helper |
| `src-tauri/src/live_session_frame.rs` | 暂停模式（仅取帧刷新 + 检测轮询 + 标志写入/事件推送） |
| `src-tauri/src/commands_live.rs` | 新命令 ×2；`live_session_status` 加 `prepared`；stop 用 spawn_blocking |
| `src-tauri/src/lib.rs` | 注册新命令 |
| `app/src/pages/ClassroomPage.tsx` | 预热/释放/事件徽标/提示文案 |
| `app/src/types.ts` | `LiveSessionStatus` 加 `prepared` |
| `docs/` | 本设计 + CHANGELOG 更新；ADR-013 补登（会话生命周期变更，AGENTS §10 要求） |

## 6. 测试计划

- Rust 单测：
  - 引擎级：`flush()` + `reset()` 后继续 `feed()` 的回归（暂停路径核心，验证不双发/不丢后续内容）；沿用现有假模型/测试基建，模型不可用则标注集成测试。
  - 预备状态机：PrepareStatus 流转纯逻辑（Loading→Ready/Failed、Cancel/TTL 退出路径）。
  - 既有测试全量回归（`cargo test` + `cargo clippy`）。
- 前端：无 vitest 基建 → 手动验证清单（见下）。
- 手动验证：
  1. 停止响应 <1s，无 detach 日志。
  2. 播放中暂停视频 → 5s 内徽标出现、OCR 停、WAV 暂停写入；恢复播放 → 自动恢复，字幕连续。
  3. 进页面 → 预热提示；数秒内点"开始" → 秒启动；离开页面 → 内存释放（任务管理器观察）。
  4. 预热加载中点"开始" → 正常开始不卡死。

## 7. 验收标准

- [ ] 停止后 `stop_live_session` 返回 <1.5s；正常路径无 `5s 内未退出` 日志。
- [ ] 视频暂停 → 捕获暂停（ASR/WAV/OCR 全停 + 前端徽标）；恢复 → 自动恢复；暂停段字幕不丢（尾句已 flush 落库）。
- [ ] 预热就绪后点"开始"：从点击到 `live:status recording` ≤ 300ms（不含 IPC 网络开销）。
- [ ] 预热失败/未就绪时 start 行为与现状一致（兜底路径零回归）。
- [ ] `cargo test` 全绿、`cargo clippy` 无新增告警、单文件行数合规（新增文件 ≤300 行）。
