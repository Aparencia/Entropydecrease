# 课堂识别评估工具（asr-eval）

> 用途：课堂助手识别评估基线（P0-1）——CER（字错率）+ 热词命中率，对齐市场口径（AISHELL 评测体系 + 竞品热词验收）。

## 快速开始

```bash
# 算法自检（无引擎/语料依赖，CI 可跑）
node scripts/asr-eval/eval.mjs --self-test

# 离线评测语料中预置的识别文本
node scripts/asr-eval/eval.mjs --file

# 经 AI 网关转写后评测（需网关运行）
node scripts/asr-eval/eval.mjs --cloud

# 本地 sherpa 转写评测（需 LOCAL_ASR_MODEL_DIR 指向 zipformer 模型目录）
# 注意：sherpa-onnx-node 为 Electron ABI 编译，纯 Node 环境加载失败是预期现象，
# 本地引擎评测请走 --cloud 或在 Electron 主进程环境内跑
LOCAL_ASR_MODEL_DIR=... node scripts/asr-eval/eval.mjs --local
```

## 指标口径

| 指标 | 定义 | 口径 |
|---|---|---|
| CER | (替换+删除+插入) / 参考字符数 | 中文逐字、英文按词；参考文本全角转半角归一化 |
| 热词命中率 | 命中术语数 / 参考中出现的术语数 | 术语在参考中出现且识别文本命中（含替换词纠正后命中）；未在参考出现的术语不计分母 |

## 语料

见 `corpus/README.md`（清单入库、音频与转写不入库）。基线报告见 `docs/asr-eval-baseline/`。
