# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 课堂真流式 ASR 永不激活：设置页缺失启用开关 + sherpa-onnx-node 1.13 破坏性 API 变更 |
| 日期 | 2026-08-04 |
| 类型 | 踩坑记录 |
| 标签 | #ASR #真流式 #Paraformer #设置页 #IPC死代码 #功能闸门 |

---

## 症状

课堂助手 smart 采集在开发/生产环境均无法进入真流式转写：日志中 `chunkDurationMs=5000`（按段转写参数），从未出现 `[StreamingASR] 已启动`，界面没有"边说边出"的实时字幕。sherpa-onnx 加载正常、Paraformer 流式模型文件完整（encoder.onnx / decoder.onnx / tokens.txt 均在）。

## 排查过程

1. 真流式激活链路：渲染端启动时查 `local_asr_stream_available` → 主进程 `isStreamingAsrAvailable()` = sherpa 已加载 **且** `config.enabled` **且** streaming 模型就绪。
2. 查运行日志：`[LocalASR] No persisted config found, using defaults` → `local-asr-config.json` 不存在，`enabled` 取默认值 `false`。
3. 全局检索 `local_asr_update_config`（唯一能写入 enabled 的 IPC）：**渲染端零调用**——主进程注册了 handler、preload 放行了 channel，但没有任何 UI 调用它；`git log -S` 证实历史上也从未有过调用方。
4. 设置页 `AsrSettingsSection` 只有"下载/删除模型"，没有启用开关。

## 根因

**双层叠加：**

1. **功能闸门缺少 UI 入口**：`enabled` 是本地转写与真流式的生效前提，但全应用没有任何地方能把它置为 true（配置默认 false、无开关、下载模型也不会自动启用）。IPC/主进程链路完整，属于"最后一公里"缺失——典型的**死代码式功能缺口**：handler 存在但无调用方。
2. **依赖升级的破坏性 API 变更**：开关打开后暴露第二层——`sherpa-onnx-node` 升到 1.13.4 后移除了工厂函数 `createOnlineRecognizer/createOfflineRecognizer`（改为导出类 `new OnlineRecognizer(config)`），`acceptWaveform` 从 `(rate, samples)` 双参改为 `({samples, sampleRate})` 单对象，流对象不再有 `free()`。日志报 `TypeError: sherpa.createOnlineRecognizer is not a function`。离线路径同样受影响，只因从未启用而未暴露。

## 解决方案

1. `AsrSettingsSection.tsx` 增加"启用本地语音识别"开关（克隆 `OllamaSettingsSection` 开关范式）：挂载时经 `local_asr_get_config` 回读；切换经 `local_asr_update_config` 持久化（至少一个模型就绪才允许开启）。
2. `SherpaAsrService.ts` 增加新旧 API 双路径兼容：识别器创建按"工厂函数存在则用工厂，否则 `new` 类构造"判别（`instantiateOffline/instantiateOnline`）；新增 `feedWaveform()` 适配层按形参数判别新旧 `acceptWaveform` 签名；`free()` 改可选调用（新版无此方法）。`streamingAsr.ts` 真流式喂块同步切到适配层。

验证：`tsc` 编译通过；独立脚本用真实 Paraformer 模型 + 新版 API 端到端验证（构造/喂块/解码/端点检测全正常）。用户侧：开关打开后需重启 Electron（主进程代码不走 HMR），重新启动课堂采集，日志应出现 `chunkDurationMs=400` 与 `[StreamingASR] 已启动`。

## 教训

- **"handler 已注册"≠"功能可达"**：IPC 通道、preload 白名单、主进程逻辑齐备，只要渲染端没有入口，功能就是死的。新功能交付检查清单应包含"从 UI 出发能否走通全链路"。
- **默认关闭的配置项必须有对应的开启路径**：`enabled: false` 默认值 + 无 UI 开关 = 功能永久关闭。评审时对"默认关"的配置项追问一句"用户从哪里打开"。
- **死功能的下游缺陷会被闸门掩盖**：本例开关缺失掩盖了 sherpa API 不兼容——修好第一层后第二层才暴露。对可选/默认关的功能，应主动构造"全开"环境做一次端到端验证。
- **可选依赖的 semver 区间升级需核对 API 稳定性**：`^1.11.0` 区间内 1.13 直接改导出形态（工厂函数→类），对动态 require 的代码 TS 类型无法拦截，只有运行时 TypeError。包装层双路径兼容 + 加载后打印实际导出形态，能把这类问题提前暴露。
- 定位此类问题最快的信号：日志中该功能的启动日志**从未出现过**，而上游条件（模型、依赖）逐一核对正常——此时应怀疑闸门/开关而非执行链路。

## 参考

- 生效闸门：`client/electron/ai/local-asr/SherpaAsrService.ts`（`isStreamingAsrAvailable`）
- 配置默认值：`client/electron/ai/local-asr/config.ts`（`DEFAULT_CONFIG.enabled = false`）
- 开关 UI：`client/src/pages/settings/components/AsrSettingsSection.tsx`
- [Debug 标准操作流程](../../standards/debug-sop.md)
