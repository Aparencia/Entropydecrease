# 2026-09-09 采集暂停批设计（暂停来源状态机 / 前台自动暂停 / 前端单一状态源）

> 状态：**已批准并交付**（2026-09-09 用户逐项授权；实施 = v0.20.7 批 2a Rust 核心 + 批 2b 前端接入，交付记录见 `docs/versions/v0.20.md` v0.20.7；架构决策见 ADR-031）。
> 范围：问题 1 暂停延迟与快速恢复丢内容、问题 2 自动暂停（前台语义）、问题 3 切页/事件丢失后 UI 状态回退。

## 1. 用户决策记录（授权口径）

| 项 | 授权内容 |
|---|---|
| 问题 1 | **彻底方案**：暂停命令确认式（µs 级置位，UI 以命令 resolve + 事件双通道）；暂停边沿 flush **跳过 SenseVoice 整句重打分**（质量由恢复侧去重/边界保护兜底）；恢复边沿 flush + 去重边界保护；「暂停后立即恢复」落入轮询间隙的路径由 **seq 代数补偿**消除；事件成对落库；为自动暂停建「暂停来源」底座 |
| 问题 2 | 定制语义：**被采集锚定窗口离开前台 → 自动暂停；回到前台 → 自动恢复**（成对）；仅键盘失焦、熵减自身失前台**不**触发；软件内切页不暂停；手动暂停语义不变；暂停原因需在徽标/浮窗区分显示；**无窗口锚定的采集（全屏/纯音频档案）不启用**本规则并文档写明 |
| 问题 3 | 采用**更彻底方案**（用户"有更好方案就用"）：采集控制状态收拢为**每窗口单一数据源**（挂载查询含 paused_reason + 事件订阅 + 看门狗回查 + 守卫错误自愈），覆盖课堂页/浮窗/导航徽标/右栏 |

## 2. 根因回顾（三路径丢内容 + 延迟源 + 状态分裂）

- **延迟源**：`pause` 命令只置共享标志；`live:paused` 事件与引擎 reset 都在主循环 500ms 轮询边沿上，边沿 flush 内**同步跑 SenseVoice 整句重打分（有界 3s/句）** → UI 延迟数百 ms~3s+。
- **丢内容路径 A**：暂停边沿 flush 阻塞期间用户恢复 → loop 从未见 true 边沿：无 Pause 事件/无 reset，句音频跨暂停拼接。
- **丢内容路径 B**：暂停-恢复快于一次轮询间隙（<200-500ms）→ 边沿不可见、引擎不 reset、事件表无记录（捕获线程仍执行端点 Stop/Start + 时间戳补偿）。
- **丢内容路径 C**：恢复边沿无 flush/边界处理；`pending_merge` 链式合并无暂停边界判断，会跨暂停错误合并。
- **状态分裂**：REQ-291 媒体自动暂停（frame worker 直写标志 + `live:media-paused`）与手动暂停（主循环 `live:paused/resumed`）双轨并存；前端课堂页/浮窗/徽标各自维护状态，挂载拉取曾忽略 `paused` 字段 → 事件丢失/重挂后 UI 回"开始采集"。

## 3. 目标状态模型

```
PauseSource = Manual | Media(REQ-291 随播随停) | Foreground(前台离开，新)
```

- **manual 锁存层**：`manual_held` 期间任何 auto 提议只记条件不动作；手动解除瞬间**重评估** auto 条件，仍真则对应源自动重暂停（fa1647aa「手动恢复后视频仍暂停→重自动暂停」语义的机器化推广）。
- **auto 条件层**：media 与 foreground 各自条件互不解除，只解除自己造成的暂停；屏幕上 reason = 实时来源（serde kebab：`manual`/`media`/`foreground`）。
- **PauseShared**：`paused/total_paused_ms`（写纪律不变，补偿时长仅捕获线程写）+ `seq` 代数计数器（**每完成一个物理暂停区间 +1**，捕获端点 Start 成功时推进）+ `edge` 槽（最近一次实测暂停区间会话时刻）+ reason 槽；request API 单写入点。
- **seq 补偿**：主循环发现 `delta>1`（漏边沿）→ `plan_edge_observation` 纯函数判定（含 own_pending 吸收：本已可见暂停的完成增量不伪合成）→ 补偿动作 = no-rescore flush + reset + 合成 Pause/Resume 事件对（时刻取 edge 槽实测冻结点，恢复时刻 clamp ≥ 上一 Pause 时刻保 DB 单调）；每次观察至多合成一对，更早区间只 flush + 诊断日志。
- **边界切断**：暂停/恢复边沿把 `pending_merge/last_final_clean/sentence_start_ms/last_speech_ms` 等按暂停边界复位，防跨暂停链式合并（persist 仅增 `rescore: bool` 参数，无私有状态改动）。

## 4. 前台自动暂停（ForegroundGate）

- 启用门 `anchor_eligible = hwnd.is_some() && ocr_enabled`（窗口锚定采集；全屏/disable_ocr 档案停摆——worker 不存在或无目标句柄）。
- 滞回：`FG_TICK_MS=250`；foreign 连续 2 拍确认 Suspend、target 连续 2 拍确认 Resume（先例：fa1647aa SUSPECT_AFTER_TICKS=2）。
- **自窗中性**：`is_self_hwnd`（GetAncestor(GA_ROOT) → 进程 id == 自身）——主窗/浮窗（always-on-top）/overlay/原生对话框的激活**不计入** foreign，也不撤销既有确认（防"一点浮窗即误暂停"这一最高风险点）。
- 前台采样只做于非 manual 期；触发/解除都走 request(Foreground)（不直写标志）。
- 音频-only（无 screen worker）与无锚定：规则整体停摆，文档口径（用户已知晓）。

## 5. IPC / 事件契约（前端 2b 消费）

| 项 | 变化 |
|---|---|
| `live:paused` / `live:resumed` | 载荷 unit → `{"reason": "manual"\|"media"\|"foreground"}`（旧监听忽略载荷，兼容） |
| DB session_events pause/resume payload | `{"source": …}`（JSON TEXT 列，无 schema 变更） |
| `live_session_status` | `LiveSessionStatus` 增 `paused_reason: Option<String>`（未暂停恒 null） |
| `live:media-paused/resumed` | 仍发（unit 载荷）但前端**零订阅**（批 2b 收口；Rust 侧清理为候选开放项） |
| 合成事件对 | UI 可能收到连续 paused→resumed（≈同冻结点）；前端 reducer 按到达序幂等收敛，终态=最后事件，无需去抖 |

## 6. 前端单一状态源（每窗口实例）

- `CaptureStatusProvider`（`useCaptureControl`）：主窗挂在 App shell（课堂页/徽标/右栏消费 context）；浮窗为独立 webview，App 的 `?float=1` 分支单独包一层 provider（每窗恰好一个订阅实例）。
- 数据通道：① 挂载 `live_session_status`（含 `paused_reason`）；② 事件 `live:status/paused/resumed/recovering/recovered/session:fusing/live:error`；③ **看门狗**：active/starting 期每 5s 回查校正漂移；④ **守卫错自愈**：动作返回"已处于暂停/未处于暂停/已有进行中"类错误 → 自动重拉并把错误转 UI 提示。
- 动作带 pending（防连点，重复动作静默忽略不弹红错）；auto 暂停期恢复按钮禁用 + title 提示（"视频暂停/切走中，条件恢复时自动继续"），不宣称恢复成功。
- 文案分层：徽标/浮窗/右栏 = 三短文案（`⏸ 已暂停` / `⏸ 已随视频暂停` / `⏸ 已自动暂停（切走）`）；课堂卡状态行 = reason + 自动继续语义长文案。
- 旧债顺修：徽标由事件驱动改 provider 挂载快照驱动 → 刷新后不再空白直至下次会话。

## 7. 测试与验收

- Rust：pause_state 真值表 12 例、plan_edge_observation（delta 0/1/2/更大、own_pending 吸收、合成对至多一对、时刻单调 clamp）13 例、ForegroundGate 阈值/自窗中性/快速往返 6 例；全量 `cargo test --test app_lib_tests` 2287 通过。
- 前端：liveCaptureState reducer 16 例（守卫自愈/看门狗/事件序列幂等收敛/合成对终态）；全量 vitest 597 通过、tsc 0 错误。
- **真机验收清单（登记 v0.20.7）**：三窗暂停一致性 / media 随播随停 reason 文案与自动继续 / foreground 切走-切回自动暂停-恢复 / 快速连点无红错 / reason 切换（manual 持锁）/ 刷新后状态还原 / 停止路径浮窗关闭与融合卡。前台判定阈值需真机标定（alt-tab 快速往返、置顶弹窗）。

## 8. 开放项

- media-* Rust 事件与 DB 侧保留但前端零订阅——后续清理候选（先例：不破坏既有外部监听假设）。
- 双屏「并排看+写」场景：目标可见但前台在另一屏会暂停——若实测误停频繁，可加"可见性门控"选项（IsWindowVisible+非最小化），待用户裁决。
- b2a5d900 单独提交含 JSX-in-.ts 语法缺陷（无消费方、不破坏其他文件），次提交 3c4867fd rename 修复；历史保留未改写（AGENTS：禁 force push）。
