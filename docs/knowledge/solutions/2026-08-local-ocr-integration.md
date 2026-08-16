# 本地识别引擎集成指南（P2-1 OCR / P2-2 公式 / P2-3 版面 / P2-5 VLM 分类 / P2-6 区域监测）

> 日期：2026-08-16
> 状态：**代码骨架已就绪，推理管线待装有模型的环境联调验证**（模型文件未随仓库分发）
> 原则：所有本地引擎均为可选增强——模型缺失/推理失败时自动降级云端 VLM（现状路径），零回归风险

---

## 一、P2-1 本地 OCR（PP-OCRv5 / RapidOCR ONNX）

### 已落地

- `client/electron/ai/local-ocr/ocrService.ts`：模型就绪检测（userData/ocr-models/ 目录约定）、IPC `local_ocr_recognize`、`recognizeLocal` 骨架（det/rec 推理管线标注 TODO(P2-1-联调)）
- `client/src/lib/ai/visionWorker.ts`：本地 OCR 优先分支（available+lines 时返回文本草稿，失败静默降级云端 VLM）
- IPC 登记：`channels.ts` LOCAL_OCR_RECOGNIZE + preload 白名单 + env.d.ts 类型

### 待联调（验证清单）

1. 模型获取：RapidOCR 官方 ONNX 发行版（GitHub RapidAI/RapidOCR → 模型仓库 `ch_PP-OCRv5_det_infer.onnx` / `ch_PP-OCRv5_rec_infer.onnx` / `ppocr_keys_v1.txt`），放置到 `userData/ocr-models/`
2. 推理管线：nativeImage 解码 PNG → det 预处理（等比缩放到 32 倍数、归一化）→ det 推理 → DB/框后处理（PP-OCRv5 det 输出格式以官方推理代码为准）→ 框排序裁剪 → rec 预处理（48 高等比宽）→ rec 推理 → CTC 字典解码（ppocr_keys_v1.txt）
3. 验收：离线 fine 路径可用率 100%（模型就绪后）；OCR 文本 CER 对比云端 VLM（P0-1 基线脚本）

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
