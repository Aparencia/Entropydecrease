# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 课堂助手生产包报「无法获取音频，启动失败」：file:// 下 AudioWorklet 模块加载失败且无降级 |
| 日期 | 2026-08-04 |
| 类型 | 踩坑记录 |
| 标签 | #ASR #AudioWorklet #file协议 #Electron #降级兜底 #课堂助手 |

---

## 症状

课堂助手（正式安装包）启动采集后，界面弹出错误提示：

```
音频采集启动失败，无法获取系统音频，请检查音频输出设备
```

主进程日志却显示一切正常（`audio_capture_start 已启动`、displayMedia 授权成功），
音频"看似采到了"但渲染端始终无音频块，ASR 转写不可用。开发模式（Vite dev server）下同样操作完全正常。

## 环境

| 项目 | 信息 |
|------|------|
| OS | Windows |
| 运行构建 | v0.35.1 正式安装包（GitHub Actions `release.yml` 构建，08-04 发布，自动更新已生效） |
| 关键提交 | `0cace68`（2026-08-03）将音频切片管道从 ScriptProcessor 迁移至 AudioWorklet |
| 曾正常版本 | AudioWorklet 迁移之前的版本（纯 ScriptProcessor 路径，无需加载外部模块） |

## 排查过程

1. 错误文案命中 `useClassroomAudio.ts` 管道启动 catch 分支；比对近两轮提交对音频链路的 diff → 无可疑变更。
2. 读运行日志：主进程 `audio_capture_start 已启动`、`DisplayMedia 授予捕获` 均成功 → 问题隔离到**渲染端管道**（取流之后的切片环节）。
3. **误判与纠正**：一度根据 `asar list` 过滤结果断定"安装包缺失 worklet 文件、版本错位"。解压 asar 实物核对后发现 `dist/audio-chunk-processor.js` 实际存在（5397 字节，与源码一致）——此前过滤正则 `^\\dist\\(assets|sounds|audio)` 把 `audio-chunk-processor.js` 一并误排除。**该假设被证伪并作废**。
4. 对比开发/生产差异：开发模式 `loadURL('http://localhost:5173')` 正常；生产模式 `win.loadFile()` 走 **file:// 协议**。Chromium 中 AudioWorklet 模块按 module script 规则加载，file:// 源被视为 opaque origin，模块脚本跨源校验不通过 → `audioWorklet.addModule('./audio-chunk-processor.js')` 抛错。
5. 读代码确认降级缺口：`isAudioWorkletSupported()` 只检测 API 存在（现代 Chromium 恒为 true），不覆盖"模块加载失败"，故 addModule 一抛错就直接落入 catch 报「无法获取系统音频」。

## 根因

**生产环境（file:// 协议）下 `audioWorklet.addModule()` 无法加载本地 worklet 模块**（opaque origin 的模块脚本校验失败），而迁移后的代码只在「AudioWorklet API 不支持」时才降级 ScriptProcessor，**加载失败这种中间态没有任何兜底**，直接对外报"无法获取音频"。

- 开发模式（http://localhost）不受影响 → 开发自测发现不了。
- 迁移前版本走 ScriptProcessor（主线程，无需加载模块）→ 用户感知为"之前版本正常、最新版坏了"。

## 解决方案

1. **代码加固（本仓库已修）**：`lib/audioPipeline.ts` 新增统一入口 `startAudioPipeline()`——优先 AudioWorklet，`addModule`/节点创建任一失败自动降级 ScriptProcessor；`useClassroomAudio.ts`（课堂）与 `useRendererAudioPipeline.ts`（笔记采集）均改走统一入口。生产包实际运行 ScriptProcessor 降级路径，功能完整（ScriptProcessor 虽被规范标记 deprecated，但 Chromium 短期不会移除）。
2. **运行侧修复**：重新打包发布（`npm run electron:build` 或走 CI tag 流程），存量用户经自动更新获取。
3. （可选后续）若坚持生产走 AudioWorklet：需改走自定义协议（`protocol.registerSchemesAsPrivileged` + `app://`）或 blob URL 注入模块源码，并同步放宽 CSP；本次止血未采用，避免扩大改动面。

验证：`tsc -b` 编译通过；Oxlint 0 错误；课堂相关单测 45 例全过。

## 教训

- **开发/生产加载协议差异是 Electron 经典坑**：凡涉及运行时加载外部模块（worklet/worker/wasm/字体）的功能，必须在**打包产物**上回归，http:// 下验证通过不代表 file:// 下可用。
- **"API 可用"≠"资源可用"**：降级判断必须把**加载失败**纳入触发条件，只检测 API 存在会留下"中间态黑洞"。
- **主进程日志全绿不代表链路健康**：采集链路跨进程（主进程选源/授权 → 渲染进程取流切片），两侧需分别核对；生产模式渲染端 console 未回流主日志时，只能靠实物核对（解压 asar、复现对比）。
- **过滤/检索工具的匹配范围要复查**：本次因正则前缀误排除目标文件，得出错误的"文件缺失"结论。对关键证据（文件存在性）应以解压实物等第二手段交叉验证。
- **被证伪的假设必须立即清除**：按 Debug SOP，假设证伪后回退到证据链重新定位，并同步修正已写下的误导性记录（本卡片即为纠正后的版本）。

## 参考

- 音频管道统一入口：`client/src/lib/audioPipeline.ts`（`startAudioPipeline`）
- 生产加载方式：`client/electron/windowManager.ts`（`win.loadFile`）
- worklet 源文件：`client/public/audio-chunk-processor.js`
- [Debug 标准操作流程](../../standards/debug-sop.md)
