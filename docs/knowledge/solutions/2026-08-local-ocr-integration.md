# 本地识别引擎集成指南（P2-1 OCR / P2-2 公式 / P2-3 版面 / P2-5 VLM 分类 / P2-6 区域监测）

> 日期：2026-08-16
> 状态：**P2-1 本地 OCR 已完整实现并联调验证**（识别「熵减学习助手」「本地OCR测试2026」置信度 >0.99）；P2-2/3/5/6 为集成指南
> 原则：所有本地引擎均为可选增强——模型缺失/推理失败时自动降级云端 VLM（现状路径），零回归风险

---

## 一、P2-1 本地 OCR（PP-OCRv5 / RapidOCR ONNX）✅ 已完成

### 交付内容

- `client/electron/ai/local-ocr/ocrService.ts`：模型下载管理（ModelScope 官方源，det 4.6MB + rec 15.9MB + dict 25.6KB，进度广播）+ 会话懒加载 + nativeImage 解码 + 完整识别管线；IPC `local_ocr_recognize` / `local_ocr_download_model` / `local_ocr_status`
- `client/electron/ai/local-ocr/ocrPipeline.ts`：PP-OCRv5 后处理纯函数（DB 二值化 0.3 → 2×2 膨胀 → 8 邻域连通域 → AABB 框 + box score 0.5 → CTC greedy 解码），12 例单测
- `client/src/lib/ai/visionWorker.ts`：本地 OCR 优先分支（available+lines 时返回文本草稿，失败静默降级云端 VLM）
- 模型自动下载：设置页/课堂模块调用 `local_ocr_download_model`，下载至 `userData/ocr-models/`，无需手动放置

### 联调验证记录（2026-08-16）

- 测试图：900×240 白底黑字「熵减学习助手 / 本地OCR测试2026」（Microsoft YaHei 42pt）
- 结果：两行全部正确识别，置信度 0.993 / 0.995
- 关键实现决策：① det 输出为全分辨率概率图（无下采样），与 PP-OCRv4 的 H/4 不同；② 字典为模型专用 `ppocrv5_dict.txt`（18383 行，blank 前插 + 空格尾插 = 18385 通道），旧版 `ppocr_keys_v1.txt` 不兼容；③ AABB + 框外扩 padding（横 5%+4px/纵 15%+4px）替代 minAreaRect+unclip 简化，实测不损失首尾字

### 验收对照

- 离线 fine 路径可用率：模型就绪后 100%（本地 OCR 优先）
- OCR 文本 CER 对比云端 VLM：见 P0-1 基线脚本（--file 模式可对比预置识别文本）

---

## 二、P2-2 公式引擎 / P2-3 版面解析

### 集成路径（依赖 P2-1 完成）

- **公式（UniMERNet）**：onnx 导出（PyTorch → ONNX）→ `client/electron/ai/local-formula/` 服务（照 ocrService 模式）→ 版面定位公式框（P2-3）→ 识别 → 与 VLM 公式输出交叉校验
- **版面（PP-StructureV3 layout）**：PicoDet layout ONNX → `client/electron/ai/local-layout/` 服务 → 分块结果注入 VisionWorker structured 字段
- 市场选型依据：`docs/Foresight/ocr-vision-market-2025-2026.md`（§2/§3）

---

## 三、P2-5 VLM 内容分类

- 规则版分类已上线（P1-6 `contentClassifier.ts`，标题关键词 + 转写证据，分类驱动采样参数与步骤视图）
- VLM 版：待本地 VLM（Ollama 多模态模型经既有 `callWithLocalFallback`）或网关 vision 端点就绪后，实现 `classifyContentByVision(frame)` 替换规则版（保留规则版为离线回退）
- 验收：分类准确率 ≥90%（对比 P1-6 规则版 ≥80%）

---

## 四、P2-6 区域化监测 + 输入事件触发

- **区域化 OCR 监测**：依赖 P2-3 版面定位参数面板区域 → 定时 OCR 数值变化 → 参数变更记录（「曝光 +0.5」形态，注入 `LessonStep.paramChanges`，stepExtractor 已预留字段）
- **输入事件触发截图**：系统级输入监听需单独安全评审（无感采集约束 `useSystemPicker: false`，隐私影响评估后默认关闭、用户授权启用）；评审通过前不实施
- 临时替代已上线：P1-7 指令句补帧（转写指令词触发强制补帧）+ P1-8 漏捕检测手动补截（C 键）覆盖「操作瞬间捕捉」的主路径

---

## 附：依赖与依据

- 选型报告：`docs/Foresight/ocr-vision-market-2025-2026.md`
- 采集约束：`docs/Foresight/classroom-assistant-optimization-roadmap.md` §1.2（无感采集/本地优先）
- 现有本地引擎模式参考：`client/electron/ai/vad/sileroVadService.ts`（P0-2，完整落地样例）
