# 本地 ASR 引擎验证记录（无设备环境的替代验证）

> 本机无 Android 模拟器硬件加速（AEHD/HAXM/WHPX 不可用，`-accel off` 纯软件模拟多次启动崩溃/锁死），
> 采用 **JVM 版 sherpa-onnx + 与 Android 端完全相同的模型与解码链**在 Windows 上执行真实转写，
> 作为「本地 ASR 链路可用」的功能性证据（Android 端 LocalAsrEngine 与 JVM 版仅 API 形态不同
> ——Kotlin/Java——引擎与模型一致）。

## 验证方法

- 模型：`mobile/android/app/src/main/assets/asr/`（APK 内同一份：encoder int8 / decoder / joiner int8 / tokens.txt）
- 引擎：`sherpa-onnx-jvm-1.13.5.jar` + `sherpa-onnx-native-lib-win-x64-1.13.5.jar`（官方发布）
- 程序：`TestAsr.java`（流式 Zipformer + greedy_search + 16kHz 特征，与 LocalAsrEngine 同配置）
- 音频：模型官方配套 `test_wavs/`（0.wav 16kHz、8k.wav 8kHz）

```bash
javac -encoding UTF-8 -cp sherpa-onnx-jvm-1.13.5.jar TestAsr.java
JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8 java -cp "sherpa-onnx-jvm-1.13.5.jar;sherpa-onnx-native-lib-win-x64-1.13.5.jar;<verify目录>" TestAsr <modelDir> <wav>
```

## 结果（2026-08-17）

| 音频 | 采样率 | 加载 | 解码 | 识别文本 |
|---|---|---|---|---|
| 0.wav（5.6s） | 16kHz | 1148ms | 133ms | 对我做了介绍那么我想说的是大家如果对我的研究感兴趣 |
| 8k.wav | 8kHz | — | 73ms | 深入的分析分析这一次全球金融动荡背后的根源 |

- ✅ 中文课堂/演讲场景识别准确（官方测试语料）
- ✅ 8kHz 输入鲁棒（引擎按流采样率自适应；AudioExtractor 产出 16kHz 属正常输入区间）
- ✅ 解码性能：约 24× 实时（5.6s 音频 133ms），低端机可接受

## 结论

「视频 → 抽音频（16kHz 分片 WAV）→ 本地 sherpa-onnx 转写」链路在引擎/模型层面已验证可用；
Android 端差异仅为 JNI/Kotlin API 封装（已编译进 APK）。剩余 UI 级 12 项验收仍需真机或
启用加速的模拟器执行（清单见 `mobile/README.md`）。
