# 中英混说识别 Spike 结论（P1-5）

> 日期：2026-08-16
> 目标：评估课堂「中文讲解 + 英文术语」混说场景的本地/云端识别方案
> 结论来源：ASR 市场调研（`docs/Foresight/asr-market-2025-2026.md` §2）+ 仓库现有引擎代码盘点

---

## 一、现有能力盘点（代码证据）

| 层 | 现状 | 证据 |
|---|---|---|
| 本地流式引擎 | zipformer-transducer **中英双语**模型（bilingual-zh-en），天然支持混说解码；`language` 参数不参与模型选择（模型固定双语） | `client/electron/ai/local-asr/config.ts`（dirName 含 bilingual-zh-en） |
| 本地重打分 | SenseVoice int8 为**多语言模型**（zh/en/ja/ko/yue），混说复核可用 | `config.ts` rescore.dirName |
| 云端转写 | `language` 参数透传（zh/en/auto），Qwen3-ASR 支持 auto 语言检测；混说质量取决于 ASR 服务本身 | `server/ai-gateway/routers/transcribe.py` L34 |
| 客户端语言映射 | 设置项 `mixed` → ASR 参数 `auto`（已接线） | `asrTranscriber.ts` toAsrLanguage |
| 历史遗留 | 仓库曾部署过 sherpa-onnx **paraformer-bilingual-zh-en** 流式模型，后随 zipformer 切换被列入废弃清理清单（P1-1 已把 SenseVoice 移出清理清单；该双语 paraformer 目录仍在清理清单中） | `modelManager.ts` OBSOLETE_MODEL_DIRS |

## 二、Spike 结论

1. **本地混说能力已具备，无需新模型**：zipformer bilingual 的混说解码是引擎固有属性；「mixed→auto」映射对本地引擎无实际作用（模型固定双语），对云端引擎正确（auto = 语言检测）。
2. **真正的缺口不是「能不能混说」，而是「混说准确率未被验证」**：评估基线（P0-1）语料规范目前未包含混说样本；无 CER 数据支撑任何优化决策。
3. **市场方案对照**：FunASR `paraformer-bilingual-zh-en` 是混说专用模型（阿里云同源），sherpa-onnx 有官方转换版；若基线显示 zipformer 混说 CER 显著差于预期，可恢复该模型作为「混说专用引擎」备选（下载源与历史清理清单中目录一致，接入成本低）。
4. **云端路径**：language=auto 已透传；Qwen3-ASR-Flash 的混说质量需在基线语料上实测对比（`eval.mjs --cloud` 已支持）。

## 三、落地动作（P1-5 实施范围）

- [x] 客户端语言映射已支持 mixed→auto（现状接线，无需改动）
- [x] 云端 transcribe 端点 language 参数已透传（现状接线）
- [ ] **基线语料补混说样本**：corpus/README 增加混说样本要求（≥2 节含英文术语课程），CER 对比 zipformer vs 云端 auto
- [ ] **设置 UI 提示**：识别语言「中英混说」选项补充说明（本地双语模型直接支持；云端走语言检测）
- [ ] 若基线混说 CER > 阈值（相对纯中文 +50%）：恢复 paraformer-bilingual 引擎为可选下载项（config.ts 增加第三个模型定义 + 引擎路由）

## 四、验收口径

- 混说样本英文术语不被音译错字（如「python」不被转成「派森」）——热词命中率口径（P0-1）覆盖
- 混说 CER 与纯中文 CER 差距 ≤50%（基线对比）

---

## 附：相关文件

- 市场调研：`docs/Foresight/asr-market-2025-2026.md`（§2 中英混说）
- 评估基线：`client/scripts/asr-eval/`、`docs/archive/2026-08-16/BASELINE-2026-08-16.md`
- 引擎配置：`client/electron/ai/local-asr/config.ts`、`modelManager.ts`
