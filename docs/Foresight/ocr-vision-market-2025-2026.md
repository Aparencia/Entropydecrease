# 屏幕内容识别与公式识别技术市场调研报告（2025–2026）

> 调研人：OCR / 视觉文档理解技术市场调研员
> 调研时点：2026-08（检索信息以 2025–2026 公开资料为准；模型版本、价格、榜单排名时效性强，落地前建议复核）
> 范围：中文课堂场景（PPT + 板书截图逐帧识别、公式识别、本地优先/离线）的 OCR 引擎、版面解析、公式识别、多模态大模型、关键帧采样、音画时间轴融合六大主题
> 用途：为「熵减」课堂助手（回声定位，`client/src/features/classroom/`）的视觉链路选型与路线图提供依据

---

## 1. OCR 引擎现状（2025–2026）

### 1.1 市场主流方案对比

| 方案 | 中文截图精度 | 速度（CPU） | 资源占用 | 离线/端侧 | 授权/成本 | 备注 |
|---|---|---|---|---|---|---|
| **PaddleOCR 3.x（PP-OCRv5）** | 极高（中文场景事实标杆；官方称 3.0 全链路精度跃升约 13%） | 快（mobile 模型单帧数十 ms 级） | 中（mobile 0.07B 参数；server 模型更大） | ✅ Paddle Inference / ONNXRuntime 均可 | Apache-2.0 免费 | GitHub 50K+ Star，中国首个破 5 万 Star 的 OCR 项目；PP-OCRv5 超轻量模型被媒体称「超越 GPT-4o / Qwen2.5-VL」（指 OCR 专项榜单），登顶 Hugging Face Trending |
| **RapidOCR** | ≈PP-OCR（同一批 PP-OCR 模型转 ONNX） | 快（ONNX CPU 友好） | 低（无 PaddlePaddle 依赖） | ✅ 纯离线，Windows x64 开箱即用 | Apache-2.0 免费 | PP-OCR 模型的 ONNX 移植，Java/.NET 绑定齐全；广州软件院 12 款开源 OCR 测评中表现优异；需注意 batch 配置不当会明显变慢（官方 Discussion #237/#515） |
| **Tesseract 5** | 低–中（中文明显落后于 Paddle 系） | 中 | 低 | ✅ | Apache-2.0 免费 | 老牌引擎，LSTM 架构；复杂版面/中英混排/截图类文本劣势明显，多用于简单扫描件 |
| **EasyOCR** | 中（中文一般） | 慢（PyTorch 推理开销） | 高 | ✅（需 Python 环境） | Apache-2.0 免费 | 易安装易用，适合快速原型；大规模中文场景不推荐 |
| **百度/腾讯/阿里云 OCR API** | 极高（干净印刷文档普遍宣称 99%+） | 网络往返 0.3–1s/张 | 零本地 | ❌ 纯云端 | 按次计费（通用文字识别约 0.001–0.01 元/次量级） | 精度高、免维护；但成本随帧数线性增长 + 数据出境/隐私问题，与「本地优先」冲突 |
| **Google Vision OCR** | 高（多语种含简体中文） | 网络往返 | 零本地 | ❌ 纯云端 | 按次计费（约 $1.5/千张量级） | 多语种均衡，中文好于 Tesseract 但弱于国内云 API 的中文专项；教室录制场景无离线能力 |
| **2025 新势力（OCR 大模型）**：DeepSeek-OCR（3B，2025-10）、PaddleOCR-VL（文心 4.5 衍生，2025-10）、GLM-OCR（0.9B） | 高（专项评测靠前，PaddleOCR-VL 被称登顶 OCR 综合性能全球第一） | 中–慢（生成式） | 高（需 GPU/量化） | ⚠️ 可本地但资源要求高 | 开源/API 均有 | 端到端生成式 OCR，支持「光学上下文压缩」降低下游 token 成本；对超大文本页有独特价值，但逐帧课堂场景性价比低于轻量检测+识别流水线 |

### 1.2 关键结论

1. **中文屏幕截图（PPT/板书/字幕）场景，PaddleOCR 系是开源事实标准**：PP-OCRv5（mobile + server 双档）在 2025 年成为 HF Trending 第一并获「超越 GPT-4o / Qwen2.5-VL」的媒体评测说法（指 OCR 专项准确率，非通用理解力）。
2. **Windows x64 端侧部署可行性：完全可行，且有多条路径**。① PaddleOCR 官方 Paddle Inference；② **ONNXRuntime 推理（推荐）**——RapidOCR 即 PP-OCR 模型转 ONNX 的开箱实现，无 PaddlePaddle 依赖、CPU 友好；③ 非 NVIDIA 显卡可走 DirectML 加速。注意：Paddle Inference 3.0 曾有 CPU-MKL 性能回退讨论（GitHub #13549），ONNX 路线更稳。
3. **云 OCR API 精度上限最高，但成本与隐私双输**：一节课按 1 fps × 45 分钟约 2700 帧，去重后即使剩 200–500 张，按次计费 + 上传延迟在本地优先产品里不可接受；云 API 只宜作「质量兜底」或对少量高价值帧复核。
4. Tesseract 5 / EasyOCR 中文精度已明显落后，不建议进入课堂场景选型。

### 1.3 来源

- PaddleOCR 3.0 发布、精度跃升 13%：[中国站长之家（2025）](https://m.chinaz.com/ainews/18263.shtml)、[PaddleOCR 3.0 与后续版本对比（百度开发者）](https://developer.baidu.com/article/detail.html?id=7542090)
- PP-OCRv5 0.07B 超轻量模型、超越 GPT-4o/Qwen2.5-VL 说法、HF Trending 第一：[品玩](https://www.pingwest.com/w/307755)、[IT之家](https://m.ithome.com/html/883925.htm)、[极客公园](https://w.geekpark.net/news/354125#comment)、[PP-OCRv5 vs PP-OCRv4 升级解析（百度智能云）](https://cloud.baidu.com/article/4226038#1)
- PaddleOCR 50K Star：[DoNews](https://www.donews.com/news/detail/4/6130942.html)
- Windows 端侧部署：PaddleOCR 官方[高性能推理文档](https://github.com/PaddlePaddle/PaddleOCR/blob/1903e73d/docs/version3.x/deployment/high_performance_inference.md)、[Paddle Inference 3.0 CPU 性能回退讨论 #13549](https://github.com/PaddlePaddle/PaddleOCR/discussions/13549)、[DirectML Windows OCR 推理（CSDN）](https://lw112190.blog.csdn.net/article/details/162055612)
- RapidOCR：[广州软件院 12 款开源 OCR 测评（RapidOCR 优异）](https://rapidai.github.io/RapidOCRDocs/v3.0.0/blog/2024/12/08/guangzhou-software-institute-reviews-12-open-source-ocr-tools-rapidocr-stands-out/)、[RapidOCR vs PaddleOCR 性能讨论 #237](https://github.com/RapidAI/RapidOCR/discussions/237)、[ONNX TextDetector 慢问题 #515](https://github.com/RapidAI/RapidOCR/discussions/515)
- 多引擎对比：[PaddleOCR vs Tesseract vs EasyOCR（GigaGPU）](https://gigagpu.com/paddleocr-vs-tesseract-vs-easyocr/)、[开源 OCR 深度评测（百度智能云）](https://cloud.baidu.com/article/3617940#1)
- 云 API 对比：[五款主流通用文字识别 API 深度评测（百度智能云）](https://cloud.baidu.com/article/4190643#1)、[中文 OCR 产品与多模态大模型 OCR 能力选型报告](https://jishuzhan.net/article/2002194403692183553#1)、[中国云厂商 OCR 接口对比](https://www.ocrproducts.cn/changshangocr/795.html)
- 2025 OCR 大模型：[DeepSeek-OCR（3B，光学上下文压缩，c114）](https://www.c114.net.cn/ainews/29947.html)、[DeepSeek-OCR 97% 长文本压缩精度（c114）](https://www.c114.net.cn/industry/30067.html)、[PaddleOCR-VL 登顶 OCR 综合性能全球第一（赛迪网）](https://www.ccidnet.com/news/1019049.jhtml)、[GLM-OCR 0.9B 千次 0.1 元（站长之家）](https://www.chinaz.com/ainews/25178.shtml#1)、[GLM-OCR IDP 榜单排名（Nanonets）](https://benchmarking.nanonets.com/models/glm-ocr)

---

## 2. 版面分析与文档智能解析（PPT 页面 → 结构化内容）

### 2.1 主流方案对比

| 方案 | 机制 | 提取质量（版面/表格/公式/阅读顺序） | 速度与资源 | 离线 | PPT 支持 | 备注 |
|---|---|---|---|---|---|---|
| **PP-StructureV3（PaddleOCR 3.x）** | 版面检测（LayoutLMv3 系）+ 表格识别 + 公式识别 + OCR 多模块流水线 | 高（中英版面、表格、公式全链路） | CPU 可跑，较快 | ✅ | 渲染为图后解析 | 百度官方文档智能流水线；PP-ChatOCRv4 再加 LLM 做问答/结构化抽取 |
| **MinerU**（OpenDataLab/上海 AI 实验室） | 版面模型 + OCR + 公式识别 + 阅读顺序还原 → Markdown/JSON | 很高（复杂论文/教材社区口碑好） | 中（默认 GPU，CPU 可用较慢） | ✅ | 2.5-Pro 起支持 Office（PPT/Word）解析 | 开源 + SaaS；联通昇腾上部署推理性能提升 50% |
| **marker（datalab.to）** | Surya OCR + 版面模型 → Markdown | 高（英文优秀，中文一般） | Marker 2「更快、CPU 可用、更准」 | ✅ | 经 PDF 中转 | 主打 PDF→Markdown，中文非强项 |
| **olmOCR / olmOCR-2**（AI2） | Qwen2-VL-7B 微调的端到端 VLM，直接图像 → 文本（含版式/阅读顺序）；olmOCR-2 引入 unit-test 奖励 | 很高（OlmOCR-Bench 上逼近/超过闭源 API） | 需 GPU（7B） | ✅ | 渲染为图后解析 | ICML 2025；arXiv:2502.18443 / 2510.19817 |
| **docling / Granite-Docling**（IBM） | DocLayNet 版面模型 + 传统 OCR；Granite-Docling-258M 为端到端「结构+内容」单模型 | 高（学术/技术文档强） | 258M 模型极轻量 | ✅ | 渲染为图后解析 | IBM 官方公告（2025）；docling 默认版面模型已弃用，迁移至 Granite-Docling |
| **VLM 直出（Qwen2.5-VL / GPT-4o 等）** | 直接给整页图，要求输出 Markdown/JSON | 最高（语义级结构化，可顺带解读图表） | 慢 + 贵（token 计费） | ⚠️ 小模型本地可跑 | 强 | 见第 4 节 |

### 2.2 PPT/幻灯片识别最佳实践（关键结论）

1. **没有开箱即用的「PPT 版面模型」**——行业通行的三条路：
   - **原生解析**：PPTX 文件本身可解析（python-pptx 等取文本/备注/大纲），适用于「有源文件」场景；
   - **渲染后解析（推荐用于录屏/截图）**：幻灯片 → 图像 → 版面+OCR 流水线（PP-StructureV3 / MinerU）或 VLM 直出；
   - **混合**：原生文本 + 图像视觉信息互补（图表、公式只能从像素层拿）。
2. **PPT 页面结构比论文简单（标题/正文/图表/公式块），PP-StructureV3 一类流水线性价比最高**；对图表语义解读（趋势/结论）再交给 VLM 做增强，而不是让 VLM 做全部 OCR。
3. 第三方基准（ertas.ai：Docling vs Unstructured vs Marker vs Visual Pipeline）显示：**复杂版面下「视觉流水线（VLM）」准确率最高，但时延与成本也最高**；生产选型通常是「专用版面+OCR 兜底 → 只把疑难页/图表页送 VLM」。

### 2.3 来源

- PP-StructureV3：[官方文档（GitHub）](https://github.com/PaddlePaddle/PaddleOCR/blob/acfd89b1/docs/version3.x/pipeline_usage/PP-StructureV3.md)、[PP-StructureV3 算法说明](https://github.com/PaddlePaddle/PaddleOCR/blob/c1664488/docs/version3.x/algorithm/PP-StructureV3/PP-StructureV3.en.md)、[PP-ChatOCRv4 文档](https://github.com/PaddlePaddle/PaddleOCR/blob/acfd89b1/docs/version3.x/pipeline_usage/PP-ChatOCRv4.md)
- MinerU：[MinerU 2.5-Pro 上线 SaaS 解锁 Office 解析（SegmentFault）](https://segmentfault.com/a/1190000047765734)、[昇腾部署性能提升 50%（昇腾社区）](https://www.hiascend.com/activities/dynamic-news/587)、[MinerU 复杂文档测评（CSDN）](https://blog.csdn.net/weixin_32047493/article/details/156969263)
- marker：[Marker 2: faster, CPU-ready, and more accurate（datalab.to 官方博客）](https://www.datalab.to/blog/marker-2)、[marker-pdf PyPI](https://pypi.org/project/marker-pdf/)
- olmOCR：[ICML 2025 论文页](https://icml.cc/virtual/2025/48195)、[olmOCR 论文摘要（arXiv:2502.18443）](https://ui.adsabs.harvard.edu/abs/2025arXiv250218443P/abstract)、[olmOCR-2 论文（arXiv:2510.19817）](https://ar5iv.labs.arxiv.org/html/2510.19817)、[OlmOCR-Bench 评测与陷阱（LlamaIndex 中文）](https://llamaindex.org.cn/blog/olmocr-bench-review-insights-and-pitfalls-on-an-ocr-benchmark)
- docling：[IBM Granite-Docling 端到端文档理解（官方公告）](https://www.ibm.com/cn-zh/new/announcements/granite-docling-end-to-end-document-conversion)、[granite-docling-2stage-258m（HuggingFace）](https://huggingface.co/docling-project/granite-docling-2stage-258m)、[docling 默认版面模型弃用 #2175](https://github.com/docling-project/docling/issues/2175)
- 基准对比：[PDF 解析精度基准：Docling vs Unstructured vs Marker vs Visual Pipeline（ertas.ai 中文）](https://www.ertas.ai/zh/blog/pdf-parsing-accuracy-benchmark-docling-unstructured)、[opendataloader-bench（PDF→Markdown 加载器基准）](https://github.com/opendataloader-project/opendataloader-bench)

---

## 3. 公式识别（公式 OCR）

### 3.1 主流方案对比

| 方案 | 类型 | 印刷公式 | 手写公式 | 中文板书场景表现 | 部署难度 | 备注 |
|---|---|---|---|---|---|---|
| **UniMERNet**（OpenDataLab） | 开源统一公式识别模型（arXiv:2404.15254） | 优 | **优**（训练集含手写） | 当前开源手写最优之一；HWE 手写评测集上存在精度复现争议（GitHub #16） | 中（PyTorch/ONNX 均可，模型小） | 训练数据 UniMER-1M（约 100 万张印刷+手写+混合公式图），印刷/手写均显著提升 |
| **pix2tex / LaTeX-OCR** | 开源 ViT+Transformer 序列生成 | 良 | 弱（开箱即用差，需合成数据微调） | 板书手写需微调才有可用性 | 低（老牌、生态成熟） | 印刷公式主力开源选择；手写可用合成数据管线微调（社区有教程） |
| **PaddleOCR 3.x 公式识别**（LaTeX-OCR 集成 + **PP-FormulaNet**） | 开源模块（`formula_recognition` 产线） | 优 | 中（PP-FormulaNet 覆盖部分手写） | 与 PP-StructureV3 一体化，中文场景工程最顺 | 低（随 PaddleOCR 装） | PP-FormulaNet（arXiv:2503.18382）主打精度-效率平衡；另有 PP-FormulaNet_plus-S 轻量变体 |
| **Mathpix** | 商业 API/App | 优 | **优** | 手写/印刷/化学式全支持，商用天花板 | 极低（调 API） | 按量付费，App/网页/SDK 齐全；2026 社区实测 5 类公式（手写/印刷/混合）识别质量第一梯队 |
| **微软 Azure AI Document Intelligence** | 商业云 API | 良–优 | 弱 | 数学公式可提取但社区反馈偶有失败（尤其复杂公式） | 极低（调 API） | 并入文档智能整体方案，非中文公式专项；LlamaIndex 2025 表格提取基准对闭源 API 有对比 |

### 3.2 关键结论

1. **印刷公式（PPT 里的公式）**：UniMERNet / PaddleOCR（LaTeX-OCR、PP-FormulaNet）均可用，PaddleOCR 路线与版面解析一体化最省事；Mathpix 质量最高但按量付费。
2. **手写公式（黑板/白板板书）**：UniMERNet 是开源首选（训练集明确含手写），Mathpix 是商用首选；pix2tex 必须微调，开箱不可用。
3. **中文课堂板书场景**：画面质量差（斜拍、反光、粉笔灰、字迹重叠）是主要失效源，**识别前预处理（透视校正、增强、二值化）比换模型收益更大**；建议「版面先定位公式框 → 单独送公式模型」，避免全页硬识别。
4. 公式识别输出为 LaTeX 序列，天然可被 LLM 后处理纠错（公式语义校验），与第 4 节混合架构互补。

### 3.3 来源

- UniMERNet：[GitHub（opendatalab/UniMERNet）](https://github.com/opendatalab/UniMERNet)、[论文（arXiv:2404.15254）](http://arxiv.org/pdf/2404.15254v1)、[HWE 手写评测精度复现争议 #16](https://github.com/opendatalab/UniMERNet/issues/16)、[UniMER 数据集（HuggingFace）](https://huggingface.co/datasets/deepcopy/UniMER)
- pix2tex：[Image-to-LaTeX（arXiv:2408.04015）](https://ar5iv.labs.arxiv.org/html/2408.04015)、[合成数据微调 pix2tex 处理手写方程（Hotdry Blog）](https://blog.hotdry.top/posts/2025/10/02/fine-tuning-pix2tex-handwritten-equations-synthetic-data/)
- PaddleOCR 公式识别：[官方模块文档（GitHub）](https://github.com/PaddlePaddle/PaddleOCR/blob/f8b41a62/docs/version3.x/module_usage/formula_recognition.md)、[PP-FormulaNet 论文（arXiv:2503.18382）](https://huggingface.co/papers/2503.18382)、[PP-FormulaNet_plus-S（HuggingFace）](https://huggingface.co/PaddlePaddle/PP-FormulaNet_plus-S)、[PaddleX 公式识别模块教程](https://paddlepaddle.github.io/PaddleX/3.5/module_usage/tutorials/ocr_modules/formula_recognition.html)
- Mathpix：[Mathpix Snip（App Store）](https://apps.apple.com/cn/app/mathpix-snip/id1445642260)、[2026 版 5 类公式实测（CSDN）](https://blog.csdn.net/weixin_26911099/article/details/162798471)、[Mathpix for Chemistry](https://mathpix.com/use-cases/for-chemistry)
- 微软：[Azure Document Intelligence 数学公式提取问题（Microsoft Q&A）](https://learn.microsoft.com/en-za/answers/questions/2260900/ocr-issues-extracting-math-formulas-with-document)、[2025 表格提取基准（LlamaIndex 中文）](https://llamaindex.org.cn/insights/table-extraction-benchmark)

---

## 4. 多模态大模型视觉提取 vs 专用 OCR

### 4.1 方案对比

| 维度 | 专用 OCR（PaddleOCR/RapidOCR） | 小参数 VLM 本地（Qwen2.5-VL-7B / Qwen3-VL-4B / GLM-4v-9b） | 云端 VLM（GPT-4o / Gemini 2.x / Qwen-VL-API / GLM-4V） | OCR 大模型（DeepSeek-OCR / PaddleOCR-VL / GLM-OCR） |
|---|---|---|---|---|
| 文本识别精度（中文干净截图） | 极高（专项模型，字符级） | 高（VLM 偶有幻觉，字符级不如专项 OCR） | 高–极高 | 极高（专项评测靠前） |
| 版面/阅读顺序/结构化 | 需版面流水线配合 | 好（天然 Markdown/JSON 输出） | 最好 | 好 |
| 表格/图表解读（趋势、结论） | ❌ 需额外 LLM | ✅ 可 | ✅ 最强 | ⚠️ 部分支持 |
| 公式 → LaTeX | 专用公式模型（见 §3） | ✅ 可（手写板书较弱） | ✅ 强（GPT-4o 等公式理解好） | ✅ |
| 延迟（单张） | 毫秒–百毫秒级（CPU） | 秒级（本地 GPU/量化） | 1–3s（网络 + 生成） | 秒级（生成式） |
| 成本 | 免费 | 免费（电费/硬件） | 每张 token 计费（一张 1000px 图 ≈ 数百–上千 token） | 开源免费 / API 计费 |
| 离线 | ✅ | ✅（需本地推理栈） | ❌ | ⚠️ 本地可跑但资源高 |
| 幻觉/不可控风险 | 低 | 中（长文本易漏字/加字） | 中 | 低 |

### 4.2 关键结论

1. **2025–2026 的格局是「专用 OCR 打底、VLM 增强」**：纯文本抽取上 VLM 尚不能稳定战胜 PP-OCRv5 这类专项模型（媒体对比中 PP-OCRv5 0.07B 即超越 GPT-4o/Qwen2.5-VL 的 OCR 专项成绩），但 VLM 在**结构化输出、图表解读、公式语义、要点归纳**上不可替代。
2. **端到端 VLM 全量做 OCR 是工程陷阱**：token 成本随帧数线性爆炸、延迟不可用于逐帧、幻觉会污染笔记数据；行业主流做法是「**专用 OCR 先抽文本/版面 → 仅对关键帧或疑难页送 VLM 做结构化/解读**」（社区有「CNN+VLM > 纯 VLM」的实证讨论）。
3. **国产小 VLM 已具备本地部署能力**：Qwen2.5-VL-7B 可在 8GB 显存跑文档结构化；Qwen3-VL 系列（2B/4B/8B/30B-A3B）中 4B 被评价为「16GB Mac 可跑」，30B-A3B（MoE）智能体任务接近 GPT-5-Mini 水平——离线增强有了现实选择。
4. **DeepSeek-OCR 类「光学上下文压缩」值得关注**：若未来课堂笔记需要把整页板书/PPT 喂给 LLM 做长文理解，压缩式 OCR 能把 token 成本降一个量级；但目前仍是生成式、资源要求高于轻量流水线。
5. 结合「熵减」现状（本地 ASR + 云端降级网关已存在）：**推荐「RapidOCR/PaddleOCR（本地逐帧）→ 去重 → 关键帧进本地小 VLM（Qwen2.5-VL-7B 量化）或云端网关做结构化笔记」的混合链路**，与现有 `multimodal.py` 的「关键帧 + 转写 → Markdown」架构天然兼容。

### 4.3 来源

- Qwen2.5-VL：[Technical Report 解读（CSDN）](https://blog.csdn.net/qq_42735631/article/details/153819332)、[开源并斩获多榜单冠军（阿里云开发者）](https://developer.aliyun.com/article/1653640#1)、[8GB 显存本地文档结构化部署（CSDN）](http://www.chinadongda.com/j/?weixin_30606461/article/details/95493515)、[PPT 截图→要点提炼案例（CSDN）](https://blog.csdn.net/weixin_30653091/article/details/157569908)
- Qwen3-VL：[4B/8B 发布（鞭牛士）](https://www.bianews.com/news/details?id=223015&type=0)、[30B-A3B 媲美 GPT-5-Mini（凤凰科技）](https://tech.ifeng.com/c/8nAvbm4bHOl)、[16GB Mac 可跑 4B（智东西）](https://m.zhidx.com/p/508806.html)
- GLM-4V / GLM-OCR：[GLM-4v-9b 中文 OCR 落地案例（CSDN）](https://blog.csdn.net/weixin_29097457/article/details/158084626)、[GLM-OCR 0.9B 发布（站长之家）](https://www.chinaz.com/ainews/25178.shtml#1)
- GPT-4o / Gemini：[KITAB-Bench 表格提取（GPT-4o 85.76% TEDS，arXiv:2502.14949）](https://ar5iv.labs.arxiv.org/html/2502.14949)、[OmniAI OCR 基准与榜单（HuggingFace）](https://huggingface.co/datasets/getomni-ai/ocr-leaderboard)、[OmniAI OCR Benchmark 博客](https://getomni.ai/blog/ocr-benchmark)
- 工程取舍：[CNN + VLM > VLM（Interfaze）](https://interfaze.ai/blog/cnn-plus-vlm-more-than-vlm)、[LLM Vision OCR 集成（rasterrocket Wiki）](https://github.com/pthomasfournet/rasterrocket/wiki/LLM-Vision-OCR-Integration)、[DeepSeek-OCR vs 各方案 2025 对比（Skywork）](https://skywork.ai/blog/ai-agent/deepseek-ocr-vs-google-azure-aws-abbyy-paddleocr-tesseract-comparison)

---

## 5. 屏幕关键帧采样与去重

### 5.1 市场级做法对比

| 方法 | 原理 | 去重/采样质量 | 计算成本 | 适用场景 | 代表实现 |
|---|---|---|---|---|---|
| **dHash / pHash（感知哈希）** | 图像降采样后比较灰度梯度/频域指纹，Hamming 距离 < 阈值判重 | 对亮度/压缩鲁棒，对内容差异敏感 | 极低（每帧 μs–ms 级） | 屏幕/PPT 变化检测首选 | `smartSampler.ts`（熵减现有）、[Video_Page_Extractor](https://github.com/davidhc1230/Video_Page_Extractor) |
| **SSIM 结构相似度** | 亮度+对比度+结构三通道比较 | 精细（可区分细微变化） | 中 | 在 dHash 初筛后做二次复核 | [filter-frame-dedup](https://github.com/PlainsightAI/filter-frame-dedup) |
| **帧间差异（像素差/PSNR）** | 相邻帧逐像素差异超过阈值即「新帧」 | 对噪声/镜头抖动敏感，容易误触发 | 低 | 录屏（画面干净）场景可用 | [FrameSelect（Plainsight）](https://docs.plainsight.ai/docs/filters/frame-select/overview/) |
| **直方图比较** | 颜色直方图距离 | 对布局变化不敏感 | 低 | 粗筛 | 各框架内置 |
| **学习式/视频级去重** | 视频哈希/近重复检测（videohash） | 面向「整段视频相似度」，不适合帧级 | 中 | 批量视频去重 | [videohash](https://raw.githubusercontent.com/akamhy/videohash/master/README.md) |

### 5.2 课堂视频关键帧提取最佳实践（关键结论）

1. **标准流水线：低帧率采样（0.5–2 fps）→ 变化检测 → dHash 去重 → SSIM 复核 → 关键帧落盘（带时间戳）**。PPT 翻页是「大幅变化」，动画/光标是「小幅变化」，阈值分层可兼顾。
2. **幻灯片切换检测是独立研究课题**（Spatio-Temporal Residual Networks 等），对录屏类视频，**结合时间戳 + 内容哈希即可达到工程可用精度**，无需深度模型；社区有现成工具（如 [PPTVideo_to_image](https://github.com/fishyy119/PPTVideo_to_image)：从 PPT 录屏视频提取不相似帧逆向重建各页）。
3. **与 ASR 联动（VAD/词级时间戳）**：只在说话窗口采样可再砍一半帧数，并让「关键帧 ↔ 转写片段」天然对齐（熵减现有 VAD 切段可复用）。
4. 熵减现状已具备 dHash 去重 + 变化检测（`screenCapture.ts` / `smartSampler.ts`），**缺口是 SSIM 复核与「板书摄像头帧」独立通道**（板书与屏幕变化节奏不同，应分开采样与去重）。

### 5.3 来源

- [Video_Page_Extractor：PHash + SSIM 去重抽取稳定帧（GitHub）](https://github.com/davidhc1230/Video_Page_Extractor)
- [PPTVideo_to_image：PPT 录屏提取不相似帧（GitHub）](https://github.com/fishyy119/PPTVideo_to_image)
- [filter-frame-dedup（PlainsightAI）](https://github.com/PlainsightAI/filter-frame-dedup)、[FrameSelect 文档](https://docs.plainsight.ai/docs/filters/frame-select/overview/)
- [videohash：近重复视频检测](https://raw.githubusercontent.com/akamhy/videohash/master/README.md)
- [讲座视频幻灯片切换检测（时空残差网络，KCI）](https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002500996)、[TalkMiner（ACM MM'10，幻灯片检测经典工作）](https://rd.springer.com/content/pdf/10.1007/978-3-319-71607-7_50.pdf)
- [Video-Summarizer：场景检测+Whisper+关键帧全 CPU 管线（GitHub）](https://github.com/Prerak-Sanghvi/Video-Summarizer)

---

## 6. 视觉内容与语音转写的时间轴融合

### 6.1 竞品做法对比

| 产品 | 幻灯片/截图抓取 | 与转写对齐方式 | 产出 | API/离线 | 备注 |
|---|---|---|---|---|---|
| **通义听悟（阿里）** | 自动识别 PPT 并抽取关键帧/页面 | 幻灯片时间码与转写逐段对齐，时间轴可跳转 | 图文笔记 + 章节摘要 + 问答 | ✅ 开放 API；高校师生可领 500h 免费额度（2024-03 口径） | 中文课堂/会议标杆；底层为通义语音 + 多模态大模型 |
| **Otter.ai** | **Automated Slide Capture**：会议/课程中自动抓取幻灯片 | 每张幻灯片带时间戳，与逐词转写同步高亮、可点击跳转 | 图文笔记 + 自动摘要 + AI Chat | ❌ 纯云端；Pro 含 edu 折扣 | 英文场景标杆；隐私争议（未经同意入会录音）反证本地优先价值 |
| **飞书妙记** | 自动识别 PPT/课件并同步到时间轴（生成妙记） | PPT 页码与转写时间轴联动 | 图文纪要 + 章节 + 发言纪要 | ❌ 飞书生态内 | 中文会议场景强，深度绑定飞书 |
| **熵减（现状）** | 关键帧采样（smart 路径）/ 逐帧 OCR（fine 路径） | VAD 切段 + 时间窗交叉融合（fine）；关键帧 + 转写 → Markdown（增量每 5 帧） | 本地笔记 + 闪卡闭环 | ✅ 本地优先，云端降级链 | 与竞品最大差距是缺「时间轴跳转回放」与 AI 问答（见 `classroom-assistant-competitive-analysis.md`） |

### 6.2 对齐技术（关键结论）

1. **工程主流是「采集期对齐（capture-time alignment）」而非事后检索**：抓屏/截图时直接记录时间戳，ASR 输出词级/句级时间戳，两边按时间轴合并即可——成本最低、最可靠。社区成熟参考：[lecture-to-notes](https://github.com/drpwchen/lecture-to-notes)（Whisper ASR · slide extraction · OCR · capture-time alignment 一体化管线）。
2. **事后对齐（对齐已录制的视频+音频）**：可用 CLIP 式图文检索（幻灯片图像 ↔ 转写片段语义匹配）或强制对齐器（如 Qwen3-ForcedAligner + CLIP 的跨媒体检索方案）；学术界「temporal video-text alignment」亦有成熟基线（如 TalkMiner 一类 slide-transcript 对齐）。
3. **对齐粒度建议**：幻灯片级（翻页时刻为分割点）+ 句级（ASR 时间戳）双粒度，支撑「点时间轴 → 跳到对应板书/PPT」的交互；这也正是 Otter/通义听悟的体验核心。
4. **交叉验证可纠错**：OCR 文本与 ASR 文本在时间窗内做关键词/语义比对，可同时修正 OCR 错字与 ASR 幻觉（熵减 fine 路径已有雏形，可加强为「文本级互证」）。

### 6.3 来源

- 通义听悟：[产品页（阿里云）](https://cn.aliyun.com/activity/intelligent/nsl/tingwu)、[API 接入文档](https://tingwu.aliyun.com/helpcenter/api)、[高校 500 小时免费（量子位）](https://www.qbitai.com/2024/03/129271.html)、[多模态+大模型技术分享（CSDN）](https://blog.csdn.net/AlibabaTech1024/article/details/135292682)
- Otter.ai：[Automated Slide Capture 官方说明](https://help.otter.ai/hc/en-us/articles/5093321813911-Automated-Slide-Capture-Overview)、[教育版页面](https://otter.ai/education)
- 飞书妙记：[生成妙记（官方帮助中心）](https://www.feishu.cn/hc/zh-CN/articles/386045971891)、[妙记与 PPT 同步说明](https://www.feishu.cn/content/article/7578773484596153570)
- 对齐技术：[lecture-to-notes（capture-time alignment 管线，GitHub）](https://github.com/drpwchen/lecture-to-notes)、[Qwen3-ForcedAligner + CLIP 跨媒体检索（CSDN）](https://blog.csdn.net/weixin_27645199/article/details/159264987)、[Qwen3-ASR-1.7B 讲座→PPT 关键帧+语音对齐实战（CSDN）](https://blog.csdn.net/weixin_42153793/article/details/156967690)、[幻灯片检测+音画同步专利（Justia）](https://patents.justia.com/patent/11990131)

---

## 7. 推荐技术栈：中文课堂（PPT + 板书逐帧识别、公式识别、本地优先/离线）

> 对齐「熵减」现有架构：本地流式 ASR（sherpa-onnx Paraformer）+ 关键帧采样（dHash）+ 云端降级网关 + Markdown 笔记生成。以下建议**保持本地优先，云端仅作可选增强**。

### 7.1 推荐组合

| 环节 | 推荐方案 | 备选/兜底 | 理由与取舍 |
|---|---|---|---|
| **屏幕抓取** | Windows Graphics Capture API（现有） | 端点环回降级 | 现状已具备，无需改动 |
| **关键帧采样与去重** | 0.5–1 fps 采样 → 变化检测 → **dHash 去重（现状）+ SSIM 复核（新增）**；板书摄像头帧独立通道（新增） | 幻灯片切换检测模型（录屏场景收益有限） | SSIM 复核能滤掉「光标/动画级」伪变化；板书与屏幕节奏不同需分开处理 |
| **文本 OCR（逐帧/关键帧）** | **RapidOCR（PP-OCRv5 mobile/server 转 ONNX，onnxruntime 推理）**，Windows x64 本地 | PaddleOCR 3.x 官方引擎；百度/腾讯云 API 仅作质量兜底 | 中文截图精度事实标杆 + 纯离线 + CPU 毫秒级 + 零成本；ONNX 路线避免 Paddle Inference 3.0 的 CPU 性能回退问题（GitHub #13549） |
| **版面与 PPT 结构化** | **PP-StructureV3 产线**（版面 + 表格 + 公式 + 阅读顺序） | MinerU（复杂文档/教材）；PPTX 原生解析（有源文件时） | PPT 版面结构简单，PP-StructureV3 一体化性价比最高，且与 OCR/公式同栈 |
| **公式识别** | 印刷（PPT 内公式）：**PaddleOCR PP-FormulaNet / LaTeX-OCR 模块**；手写（板书）：**UniMERNet（ONNX 本地）** | Mathpix API（商用兜底/对极难手写） | UniMERNet 训练集明确含手写，开源手写最优之一；先版面定位公式框再送识别，别全页硬识别 |
| **语义增强（可选）** | **Qwen2.5-VL-7B（本地，量化，8GB 显存）或 Qwen3-VL-4B**，只对去重后关键帧做「要点/图表解读/纠错」 | 云端网关（Qwen-VL API / GLM-4V） | 让 VLM 做「结构化与解读」而非逐帧 OCR，token 成本与延迟可控；离线可用与本地优先一致 |
| **时间轴融合** | 采集期对齐：关键帧时间戳 + ASR 句级时间戳 → 幻灯片级 + 句级双粒度时间轴；OCR 文本 ↔ ASR 文本时间窗互证纠错 | 事后对齐：CLIP 式图文检索（仅对已录视频） | 采集期对齐最可靠最省；互证纠错同时压 OCR 错字与 ASR 幻觉，切中课堂场景痛点 |

### 7.2 推荐理由与取舍总结

1. **为什么不是「端到端 VLM 全量 OCR」**：一节课数十分钟、逐帧（fine 路径）或去重后数百张关键帧，VLM 的 token 成本、1–3s/张延迟与幻觉都会击穿本地优先的约束；PP-OCRv5 系在中文字符级精度上不输（甚至超过）VLM 的 OCR 专项成绩，成本却趋近于零。
2. **为什么是「RapidOCR + PP-StructureV3 + UniMERNet + 本地小 VLM 增强」四段式**：每段各司其职（文本 / 版面 / 公式 / 语义），可单独替换、可离线运行、可按需关闭，与「AI 增强可选」的产品哲学一致；全部有 Apache-2.0 级开源实现，无需按量付费。
3. **唯一的显性成本是硬件**：Windows x64 上 RapidOCR 纯 CPU 即可（无 GPU 也能跑）；本地小 VLM 需要 8–16GB 显存或量化推理，作为可选增强而非默认依赖——默认路径（smart：关键帧 + ASR + OCR + 云端网关降级）不要求用户有 GPU。
4. **风险与对策**：① 板书手写仍是最难环节——用「版面定位 + UniMERNet + LLM 公式语义校验」三层兜底，必要时引导用户补拍/重拍；② 时间轴对齐依赖采集期时间戳，若拿到的是「已经录好的视频+音频」，需走 CLIP 式事后对齐（备选路线）；③ 榜单/价格类信息时效性强，落地前按第 6.3/7.1 来源复核最新版本号与 API 定价。

---

*报告完。所有结论均附来源 URL；模型版本、榜单、价格以检索时点（2026-08）公开信息为准。*
