# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 课堂助手精细采集三症状：视觉抓取页面元数据、ASR 静音幻觉、截断 JSON 泄漏 UI |
| 日期 | 2026-07-31 |
| 类型 | 踩坑记录 |
| 标签 | #课堂助手 #多模态 #ASR幻觉 #VAD #prompt工程 #JSON解析 |

---

## 症状

内测用户在课堂助手（回声定位）使用**精细采集**（Path A）看 B 站网课时，时间线出现三类异常：

- **A 视觉轨**：反复输出同一段浏览器页面元数据（视频标题/播放量/日期/URL/导航栏文字），而非教学内容
- **B 音频轨**：大量"嗯嗯嗯嗯""。""是是是"及短句脏话（"我操你妈的。"）——用户观感极差（"我要哭了，还会骂人"）
- **C**：一条视觉条目直接显示原始 JSON 片段（`"keyPoints": [...], "codeBlocks": []...}` ``` ）

## 根因（三个独立缺陷，同场景集中暴露）

| 症状 | 根因 | 位置 |
|---|---|---|
| A | vision prompt 只说"提取所有可见的学习内容"，未指示忽略浏览器 chrome/页面元数据；整窗口截图里标题栏/侧栏被模型忠实 OCR | `server/ai-gateway/chains/vision_extract_chain.py` VISION_MODE_PROMPTS |
| B | Path A 音频链**无 VAD**：固定切片全部直送 ASR，静音/背景音乐段触发 ASR 模型典型幻觉（重复语气词、脏话短句是 Qwen/GLM-ASR 在静音段的高频幻觉形态）；且输出端无幻觉过滤 | `client/src/lib/ai/asrWorker.ts`（对比：Path B smart 模式有 vadMarker，Path A 没有） |
| C | 模型输出被 max_tokens（2048）截断 → 残缺 JSON 三段解析全失败 → 兜底分支把**原始 content 整段**当 text 返回 → 前端原样渲染 | `vision_extract_chain.py` `_parse_response` 兜底分支 |

## 解决方案

1. **A**：auto/full 两个 prompt 增加硬性指令——忽略浏览器/网站 UI 元数据，只提取教学画面内容，无教学内容时 text 返回空串
2. **B**：新增 `client/src/lib/capture/asrFilters.ts` 双防线——送 ASR 前 RMS 静音门控（阈值 0.008 与 vadMarker loopback 预设一致）+ ASR 返回后幻觉过滤（纯标点/重复字符灌水/短句脏话，宁放过不误杀）
3. **C**：`_parse_response` 兜底分支区分形态——形似 JSON（含 `"text":`、fence、`{` 开头）则正则抢救 `text` 字段值（还原转义），抢救不到返回空文本；纯文本形态才原样透传

验证：新增 vitest 10 例 + pytest 6 例全过（用例直接取自内测截图的真实幻觉文本）；client 455 tests / gateway 164 tests 全绿。

## 教训

- **管线成对能力要对齐**：Path B 有 VAD、Path A 没有——同一功能的并行实现路径，防护能力不一致时薄弱路径必然先炸。新增采集路径时应有"能力清单"对照（VAD/去重/降级/过滤）。
- **ASR 静音幻觉是已知模型行为不是玄学**：静音/音乐段送 ASR，输出重复语气词甚至脏话是大模型 ASR 的公开特性，任何 ASR 集成都必须有静音门控 + 输出过滤两道防线。
- **LLM 结构化输出的兜底分支同样要"结构化"**：`解析失败→返回原文`看似安全，实际把内部协议（JSON）泄漏给了用户；兜底必须考虑"截断的半个 JSON"这一最常见失败形态。
- **prompt 的"提取所有内容"在真实屏幕上是错的**：用户屏幕永远比教学内容多（浏览器 UI、弹幕、推荐位），提取类 prompt 必须显式声明忽略清单。

## 参考

- 修复文件：`server/ai-gateway/chains/vision_extract_chain.py`、`client/src/lib/capture/asrFilters.ts`（新增）、`client/src/lib/ai/asrWorker.ts`
- 回归测试：`client/src/lib/capture/asrFilters.test.ts`、`server/ai-gateway/tests/test_vision_chain.py`
- 后续跟进（未在本次范围）：smart 路径的流式 ASR 输出可复用 `isLikelyHallucination`；`fine` 路径可考虑接入窗口区域裁剪只截视频区
