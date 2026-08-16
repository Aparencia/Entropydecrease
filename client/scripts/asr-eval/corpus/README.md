# 课堂识别评估语料规范（corpus/）

> 用途：课堂助手识别评估基线（P0-1）的语料目录。**语料文件本身不入库**（版权与体积），仅清单 `manifest.json` 与说明入库。

## 目录结构

```
corpus/
├── manifest.json      # 语料清单（入库；见下格式）
├── ref/               # 参考转写（人工校对，.txt，不入库）
├── audio/             # 音频（16kHz/16bit/单声道 WAV，不入库）
└── transcripts/       # 预置识别文本（可选，不入库）
```

## 准备语料（一次性）

1. **选取 10 节课样本**：5 节知识授课（网课/讲座）+ 5 节软件技能（PS/剪辑/编程），各约 10 分钟。
2. **音频**：用应用内课堂助手采集（smart 路径）或自行导出，统一转为 **16kHz / 16bit / 单声道 WAV**（推荐 `ffmpeg -i in.m4a -ar 16000 -ac 1 -sample_fmt s16 out.wav`）。
3. **参考转写**：人工校对文字稿（含标点），保存 `ref/<id>.txt`。
4. **术语表**：每节课整理 20-50 个课程专属术语（教师名字、学科名词、软件菜单/参数名），写入 manifest 的 `terms` 字段。
5. 填写 `manifest.json`（格式见下），运行评测。

## manifest.json 格式

```json
{
  "items": [
    {
      "id": "course-math-01",
      "label": "线性代数第3讲（网课）",
      "referenceFile": "ref/course-math-01.txt",
      "audioFile": "audio/course-math-01.wav",
      "mode": "auto",
      "terms": ["线性代数", "特征值", "矩阵的逆"],
      "language": "zh",
      "sampleRate": 16000,
      "channels": 1
    }
  ]
}
```

- `mode`：`auto`（默认，CJK 逐字 + 拉丁按词）/ `char` / `word`
- `--file` 模式可用 `hypothesis`（内嵌文本）或 `hypothesisFile`（transcripts/ 下文件）代替引擎转写

## 版权提示

语料仅用于本地质量回归，勿将他人课程音视频公开分发；参考转写为个人学习用途的合理使用。
