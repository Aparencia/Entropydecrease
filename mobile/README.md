# 熵减 · 移动端（Capacitor 壳）

熵减 Android/iOS 的 Capacitor 7 壳：包装 `client/` 的 Web 构建产物（`dist-capacitor`），提供相机/相册、录屏、本地流式 ASR（sherpa-onnx）等原生能力。

> 一期平台：**Android**。iOS 接入步骤见文末「iOS（后续）」。

## 架构

```
client/                          # 渲染进程（唯一 Web 构建源）
  src/lib/platform/              # 平台检测 + 移动端能力门控
  src/lib/capacitor/             # Capacitor 桥接（相机/相册/视频选取）
  dist-capacitor/                # VITE_CAPACITOR=1 构建产物（禁用 SW）
mobile/
  capacitor.config.ts            # appId/webDir 等
  android/                       # Android 原生工程（Capacitor 生成 + 定制）
    .../EntropyCapturePlugin.java # 自定义原生插件：录屏 / 音频抽取 / 本地 ASR
  scripts/                       # 构建脚本
```

- 数据层：IndexedDB/Dexie 本地优先（复用 `client/src/lib/storage/`，与 PWA 同路径）
- AI：本地流式 ASR（sherpa-onnx 1.13.5，中文流式 Zipformer，模型打进 APK assets）优先，云端 `/api/v1/asr/transcribe` 降级兜底；AI 结构化走网关 summarize/generate-cards
- 认证：Supabase 邮箱+密码，WebView localStorage 持会话

## 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 20 | 本项目开发环境为 v24 |
| Java (JDK) | 17 | Capacitor 7 要求（`java -version` 验证） |
| Android SDK | platforms;android-35+ / build-tools 35+ | `ANDROID_HOME` 指向 SDK 根目录 |
| Android Studio（可选） | — | 运行模拟器 / 可视化调试 |

## 快速开始

```bash
# 0) 环境变量（client/.env.production 必须存在且完整）
#    VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_API_BASE_URL / VITE_AI_GATEWAY_URL

# 1) 构建 Web 产物 + 同步原生工程 + 生成 debug APK
cd mobile
npm install
npm run apk          # = build:web → cap sync android → gradlew assembleDebug

# 产物位置
android/app/build/outputs/apk/debug/app-debug.apk
```

## 日常开发

```bash
# 仅重编 Web 并同步（不动原生）
npm run sync

# 真机/模拟器运行（含 Web 热更新开发：先起 client dev server，再 npx cap run android）
cd ../client && npm run dev          # 终端 A：Vite dev server (localhost:5173)
cd ../mobile
npx cap run android --mode development   # 终端 B：装到设备；开发期可改 capacitor.config server.url 指向局域网 dev server
```

> 开发期热更新：在 `capacitor.config.ts` 临时加 `server: { url: 'http://<电脑局域网IP>:5173', cleartext: true }`（仅 debug 包放行明文，见 network_security_config），改回后重新 `npm run sync`。

## 原生能力与权限

| 能力 | 实现 | 所需权限 |
|---|---|---|
| 相机拍摄 / 相册选图、选视频 | `@capacitor/camera` + `@capacitor/filesystem` | `CAMERA`、`READ_MEDIA_IMAGES`/`READ_MEDIA_VIDEO` |
| 录屏采集网课 | 自定义插件 `EntropyCapturePlugin`（MediaProjection） | `RECORD_AUDIO`、`FOREGROUND_SERVICE_MEDIA_PROJECTION` |
| 本地流式 ASR | 插件内 sherpa-onnx（JNI，模型打进 APK assets `asr/`） | 无（全程本机） |
| 视频抽音频 | 插件内 MediaExtractor/MediaCodec | 无 |

**已知限制**：Android 10+ 对第三方应用音频有播放捕获限制，**录屏无法保证收录网课视频原声**（绝大多数网课 App 未开放 `AudioPlaybackCaptureConfiguration`）。录屏按「画面 + 麦克风人声」录制；需要视频原声时请用**相册导入**路径。

## 课堂助手 · 视频知识笔记提取（移动端）

入口：课堂页在 Capacitor 壳内自动切换为原生面板（`MobileAssistantPanel`）。

1. **相册/相机选视频**（主路径，≤60 分钟，超限拦截）→ 原生选择器拷贝到应用私有目录
2. **音频抽取**：插件 MediaExtractor 按 ≤10 分钟分片输出 16kHz 16bit 单声道 WAV
3. **转写（本地优先 + 云端降级）**：sherpa-onnx 本地批量转写 → 失败降级云端 `POST /api/v1/asr/transcribe`（base64 分片）
4. **录屏采集**（小布式边看边录）：MediaProjection 录屏 + WebView 麦克风流式采集 → 本地 ASR **实时字幕**（可关闭）
5. **AI 结构化**：转写文本 → 网关 `/api/v1/ai/summarize` 生成知识笔记（闪卡生成接口已备）
6. 产出沉淀进课堂会话（`classroomNoteStore`），可在笔记中查看

## 构建产物与体积

- 本地 ASR 模型（`assets/asr/`：encoder int8 14.7MB + decoder 7.2MB + joiner int8 1.7MB）打进 APK。
- 原生库（sherpa-onnx AAR）经 `app/build.gradle` 的 `ndk.abiFilters` 只打包 `arm64-v8a` + `x86_64`（真机 + 模拟器），控制体积。
- 换模型：替换 `android/app/src/main/assets/asr/` 下文件并同步 `LocalAsrEngine` 的配置（路径/采样率/特征维）。

## 常见问题

- **`cap add android` 报 webDir 不存在**：先 `cd ../client && npm run build`（`VITE_CAPACITOR=1`）。
- **构建缺环境变量报错**：`client/.env.production` 缺失/含占位符时 Capacitor 构建会主动失败（防呆）。
- **gradle 首次构建慢**：首次会下载 Gradle 发行版与依赖，属正常现象。

## 真机验收清单（12 项）

> 需 Android 12+ 与 Android 14+ 各验一台。安装：`adb install -r android/app/build/outputs/apk/debug/app-debug.apk`，
> 启动：`adb shell am start -n com.entropydecrease.app/.MainActivity`，
> 崩溃检查：`adb logcat -d | grep -E "AndroidRuntime|FATAL"`，截图：`adb exec-out screencap -p > screen.png`。

1. 冷启动 → 登录 → 会话保持（杀掉进程重开仍登录）
2. 新建笔记、输入、插入相机图/相册图、保存后重开仍在
3. 课堂助手：相册选 ≤60 分钟视频 → 全流程进度 → 产出笔记/可问答
4. 录屏 2 分钟 → 停止 → 走同一管道
5. 超 60 分钟视频被拦截
6. 飞行模式（无网）下相册导入视频完成本地转写与笔记生成（本地 ASR 核心价值）
7. 录屏期间实时字幕跟随显示、可关闭、结束后结果一致
8. 本地模型加载失败（模拟模型损坏）时自动降级云端并提示
9. 断网时处理失败给出可重试错误
10. 硬件返回键：路由回退 → 退出确认
11. 横竖屏切换布局正常
12. 桌面端（Electron）与浏览器 PWA 两条路径回归不坏

> 环境说明：本仓库开发机无 Android 模拟器加速（AEHD/HAXM/WHPX 均不可用），
> 纯软件模拟（`-accel off`）启动崩溃，故上述清单需在真机或启用加速的模拟器上执行。

## iOS（后续）

```bash
# 在 macOS + Xcode 环境执行（需 macOS，本期未实现）
cd mobile
npm run build:web
npx cap add ios
npx cap open ios     # Xcode 中配置签名后 Run
```

需要补：iOS 权限描述（NSCameraUsageDescription / NSPhotoLibraryUsageDescription / NSMicrophoneUsageDescription）、本地 ASR 模型打包策略复核、`@capacitor-community/privacy-screen`（可选）。
