# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | ASR 报错「whisper.cpp 执行失败」在代码库零匹配：运行构建落后源码 8 个版本 |
| 日期 | 2026-08-02 |
| 类型 | 踩坑记录 |
| 标签 | #ASR #版本错位 #sherpa-onnx #whisper.cpp #构建产物 #诊断方法 |

---

## 症状

用户在费曼模式专注会话中语音转写失败，界面弹出错误提示：

```
转写失败: whisper.cpp 执行失败
```

## 环境

| 项目 | 信息 |
|------|------|
| OS | Windows |
| 客户端 | Electron + React（熵减桌面端） |
| 运行构建 | **v0.25.0**（`client/release/` 目录下的旧安装包/win-unpacked） |
| 当前源码 | **v0.33.1**（dev 分支，最新 tag v0.33.1） |
| 本地 ASR 依赖 | `sherpa-onnx-node ^1.11.0`（当前源码） |

## 排查过程

1. 按 Debug SOP 从错误信息入手，全局检索 `whisper.cpp 执行失败` → **源码、`dist-electron` 编译产物、`server/` 全部零匹配**。
2. 怀疑错误是动态拼接，改搜 `转写失败:` 前缀与 `whisper` 关键字 → 当前代码只有 `asrTranscriber`/`useClassroomEvents` 的云端/本地降级错误，`whisper.cpp` 仅剩 2 处历史注释。
3. 核对依赖：`package.json` 是 `sherpa-onnx-node`，全项目**没有任何 whisper.cpp 二进制**。
4. 核对版本：源码 `version: 0.33.1`，而 `client/release/` 里的安装包是 **0.25.0**——断层 8 个 minor 版本。
5. 交叉验证 UI：截图底部「费曼模式 + 麦克风」栏在当前源码中已被重构移除，进一步坐实运行的是旧构建。
6. 结论：错误只可能来自旧构建，当前源码不可能抛出该信息。

## 根因

**运行的 App 是旧构建（v0.25.0），其本地 ASR 引擎为 whisper.cpp；当前源码（v0.33.1）早已将本地 ASR 整体迁移为 sherpa-onnx（SenseVoice 离线 / Paraformer 流式），whisper.cpp 路径被完全移除。** 旧构建中的 whisper.cpp 可执行文件缺失/不可用导致转写失败，而该错误信息在新代码中已不存在。

这是一个**版本错位**问题，而非当前代码的逻辑缺陷。

## 解决方案

1. **用当前源码重新构建/运行**（旧构建上的 whisper.cpp 路径已整体废弃，无法也无需在旧版上修）：
   ```bash
   cd client
   npm run electron:dev     # 开发验证（推荐）
   npm run electron:build   # 打正式安装包
   ```
2. 重建后 ASR 架构为：**本地 sherpa-onnx 优先 → 失败自动降级云端 AI 网关**（Qwen3-ASR-Flash / GLM-ASR），见 `client/src/features/classroom/utils/asrTranscriber.ts`。本地 ASR 默认关闭，需在 设置 → 本地语音识别 下载模型并启用；不启用则直接走云端。
3. 清理误导性注释：`client/electron/ai/index.ts` 中 `注册本地 ASR（whisper.cpp）IPC handler` 改为 `注册本地 ASR（sherpa-onnx）IPC handler`，避免后人再被误导去查 whisper。

验证：Electron 主进程 `tsc --noEmit` 编译通过；ASR 相关单测 27 例全过（`asrFilters` / classroom utils）。

## 教训

- **报错信息在代码库零匹配时，第一假设应是「运行的构建与源码不同版本」，而不是急着调试逻辑。** 先核对版本号、构建产物、UI 形态三者是否一致，可以直接跳过整类无效排查——本例若先做这一步，几分钟即可定位，无需遍历 ASR 链路。
- **`release/` 目录残留的旧安装包/win-unpacked 是诊断陷阱**：用户（甚至开发者自己）可能直接运行了其中的旧构建。排查前先确认"对方跑的到底是哪份产物"。
- **引擎迁移后必须同步清理旧引擎的注释与文档**：`whisper.cpp` 字样残留在注释里，会让排查者误以为项目仍在用 whisper，浪费大量时间。迁移类 PR 应把"清理旧引用"纳入检查清单。
- **UI 形态不匹配是版本错位的强信号**：截图中的界面元素在当前源码里找不到对应组件时，应立即怀疑版本问题。

## 参考

- 当前本地 ASR 实现：`client/electron/ai/local-asr/`（`SherpaAsrService.ts` / `config.ts` / `index.ts`）
- 转写降级入口：`client/src/features/classroom/utils/asrTranscriber.ts`
- 通用误区已补充至 [Debug 标准操作流程 · 常见误区](../../standards/debug-sop.md)
