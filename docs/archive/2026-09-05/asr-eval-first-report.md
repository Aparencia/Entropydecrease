# asr_eval 首轮自测报告（v0.20.0 / REQ-263，2026-09-05）

> 状态：首轮报告（harness 通道就绪 + 真实数据首跑）；**结论只作相对对比与回归，不宣称绝对指标**（无人工语料自验证路线，2026-09-03 用户裁决①）
> 关联：[v0.20.md](../versions/v0.20.md) · [asr-optimization-plan](../Foresight/asr-optimization-plan.md) · ADR-030 · 提交 11b3bb8/2250310/564ee1a

## 一、交付面（harness 就绪）

- `bin/asr_eval`：文件对信道（wav + 同名 .srt 外挂字幕）+ 会话信道（`--db`）双入口；双路 A/B（预处理开/关，复用业务链同参 AudioPreprocessor）；CER/混淆画像 top-N/汇总表/A/B 结论；基线 JSON + 回归退出码契约（相对基线退化 >2% 即 exit 1）；`--session-ids` 过滤控制运行规模
- 纯函数层（lib，28 单测全绿）：`eval_confusion`（字符差异回溯画像）/ `eval_samples`（SRT 容错解析与配对）/ `eval_report`（统计与回归门）/ `eval_session`（会话信道分档 + dtw 漂移适配）
- 复用：cer.rs / dtw_align.rs（mod→pub 最小导出）/ audio_preprocess；`autobins=false`（bin 辅助模块防误识别）
- 规范口径：AGENTS.md ASR 行已含"Silero VAD 未接线"留痕（2026-09-03，ADR-030 口径）

## 二、首轮真实数据结果（本机 dev DB，13 会话，2026-09-05）

数据面：session_segments 共 asr 1106 段 / subtitle **2 段** / fused 12 段（会话 64）——**字幕真参考在本机数据面不足**（无 ≥3 段字幕的会话）；漂移分布因此不可算（缺口登记见 §三）。

弱参考档（asr 历史段为参考，仅相对对比）——离线整段重跑 vs 实时链路历史：

| 会话 | asr 段 | 离线 vs 参考 CER | 会话 | asr 段 | 离线 vs 参考 CER |
|---|---|---|---|---|---|
| 48 | 59 | 0.2841 | 62 | 6 | 0.1461 |
| 53 | 10 | 0.0694 | 63 | 14 | 0.3835 |
| 54 | 2 | 0.0192 | 64 | 15 | 1.7329 |
| 56 | 2 | 0.0385 | 69 | 24 | 0.3075 |
| 61 | 14 | 0.5553 | 70 | 34 | 0.0177 |
| 71 | 29 | 0.0277 | 72 | 21 | 0.0169 |
| 73 | 46 | 0.0203 | | | |

**弱参考档 CER 均值 = 0.2784（13 会话）**，分布两极化（0.017~1.73）：
- 低 CER 簇（70-73/54/56 ≈0.02-0.04）：历史 asr 段已接近整窗离线质量（疑似导入全窗/低切分损失会话）
- 高 CER 簇（61/64/48/69/63 ≈0.28-1.73）：实时链路端点切分损失或切分语义漂移显著——**方向性观察**：高簇与"实时长会话/口语流"对应，与 REQ-063 取证动机（句尾丢弃/断句不准）一致；是否真因端点待 P1 参数族 A/B 与 DTW 接线后验证

## 三、缺口登记（诚实）

1. **字幕真参考数据面不足**：本机无 ≥3 段字幕会话 → CER 绝对口径与漂移分布暂不可产；需补充带字幕素材（导入视频字幕轨 或 外挂 wav+srt 样本目录）
2. SRT 参考仅 UTF-8/BOM（无 encoding 依赖，GBK 留 P1）
3. mp4/m4a 媒体需 ffmpeg 提取（P0 只收 wav）
4. CI 回归：纯函数 golden 已随 cargo test；harness e2e 需样本资产 → 环境变量/素材到位后接线（注记留 v0.20.md）
5. 会话 63/64 单段字幕曾污染报告（CER 4.05/12.8）——已加 MIN_SUBTITLE_SEGS=3 门槛并回归确认（教训：数据面质量门槛先于结论）

## 四、复现命令

```
cargo run --bin asr_eval -- --db "%APPDATA%\com.entropydecrease.app\entropy.db" --session-ids 48,53,54,56,61,62,63,64,69,70,71,72,73 --preproc off --out <out_dir>
cargo test --test app_lib_tests eval_        # 纯函数 golden（28 用例）
```
