# process-audio — Windows 进程环回音频采集（Phase 1 spike）

面向课堂助手音频采集的原生模块。当前处于 **Phase 1（可行性验证）已完成**状态，
尚未接入 client 主构建，对已发布版本零影响。

## 为什么需要它

现有音频采集走 Chromium 的 `getDisplayMedia({audio:'loopback'})`，即
**端点环回**——在系统主音量之后截取最终混音，两个原理性缺陷：

| 缺陷 | 后果 |
|---|---|
| 采全系统混音 | QQ/微信提示音、其他视频混入课堂转写（脏数据源头，**主要动因**） |
| 跟随主音量/静音 | 音量 0、每应用音量调低、默认输出设备错配 → 采到全零 |

**进程环回**（Windows 10 2004+ 的 `AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK`）
在混音之前按进程树截取，两个缺陷同时消除。这也是 OBS 28+「应用程序音频采集」
的实现路线，无需虚拟声卡驱动、无需管理员权限。

## Phase 1 验收结果（全部通过）

| 验收项 | 结果 |
|---|---|
| 编译链路（VS 2022 + node-gyp，Python 3.14 可用） | ✅ 零错误零警告 |
| 窗口 → PID → 进程树根 | ✅ 可用。**Chromium 顶层窗口归属 browser process**，窗口 PID 直接即树根 |
| **杂音隔离**（主要收益） | ✅ 发声进程 RMS 0.049 / 同时刻静默进程 RMS 0.000000 |
| **Chromium 进程树覆盖**（网课成败点） | ✅ Electron 声源 RMS 0.055，证明能采到 audio service **子进程**的声音 |
| 系统静音下仍可采 | ✅ 静音时峰值 0.299246 与正常音量下**完全一致**（连衰减都没有） |
| 16kHz mono float32 格式协商 | ✅ 被 Windows 直接接受 → **无需实现重采样** |

## 目录结构

```
src/
  window_finder.{h,cc}    窗口枚举 + PID → 应用根进程回溯
  loopback_capture.{h,cc} WASAPI 进程环回采集 + WAV 落盘 + RMS 统计
  addon.cc                N-API 绑定（listAudioWindows / resolveRootPid / captureToWav）
test/
  spike-windows.mjs       验证窗口/进程解析
  spike-capture.mjs       按窗口关键字采集并落盘（人工复核用）
  spike-isolation.mjs     杂音隔离对照实验
  spike-muted.mjs         系统静音场景验收（需手动静音）
  spike-chromium.mjs      Chromium 进程树覆盖验证（全自动）
  chromium-source/        Electron 等价声源（含播放状态自检）
```

## 本地构建与验证

```bash
cd client/native/process-audio
npm install
npx node-gyp rebuild

node test/spike-windows.mjs        # 窗口与进程解析
node test/spike-chromium.mjs       # 网课场景（全自动，会短暂响铃）
node test/spike-muted.mjs          # 静音场景（按提示手动静音）
```

## 已知边界

- **仅 Windows 10 2004（build 19041）+**，低于此版本需降级到端点环回
- **WASAPI 独占模式**播放的应用采不到（罕见）
- **漏采风险**：只采目标进程树，用户换播放器/新开应用需重新绑定——这是
  与端点环回互补而非替代的根本原因（端点环回"永不漏采但脏"）
- macOS/Linux 无对应 API
- 混音器内**每应用音量**是否衰减尚未单独实测（主音量已确认无影响）

## 后续阶段

Phase 2 集成时需把当前的同步阻塞采集改为**独立采集线程 +
`Napi::ThreadSafeFunction` 流式回调**，产出符合 `AudioChunkData` 契约的
16kHz mono Float32 块（5s/块），下游 VAD/ASR/幻觉过滤零改动。

## 过程教训

验证 Chromium 场景时曾连续两次采到 RMS=0，一度指向"进程环回对 Chromium 无效"
的错误结论。真实原因是 **spike 声源本身没启动**（Electron 以目录方式启动需
`package.json` 指定 main 入口），与被测对象无关。加入「声源自报播放状态」自检
后立即定位。**测量类实验必须先自证伪声源/测量链路，再评价被测对象。**
