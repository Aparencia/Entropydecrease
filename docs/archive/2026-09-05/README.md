# 归档 2026-09-05

> 归档 SOP：见 [../README.md](../README.md)。归档当日：2026-09-05（v0.19.6/7 两批交付 + 四区新增代码并行审查 + 审查即修四批 + 文档纠偏）。
> 关联实施：v0.19.6（REQ-281/282/285/290③）· v0.19.7（REQ-284/286/287/290①②/291）；详见 [tech-debt](./tech-debt.md) 与 [v0.19.6](../../versions/v0.19.6.md) / [v0.19.7](../../versions/v0.19.7.md)。

## 归档清单

| 源 | 目的 | 说明 |
|----|------|------|
| — | — | **本日无文档入夹**。候选评估：`docs/superpowers/specs/2026-09-05-v0.19-feedback-batch-design.md` 仍含 v0.19.8 未实施项（REQ-283/288/289 与 D1/D2），`2026-09-05-goal-execution-agent-design.md`（v0.21 规划）未实施——均不满足"内容已实施完成、不再活跃维护"的归档判定，保持活跃待下批；版本文档（versions/）与需求池按机制常驻不入夹 |
| [asr-eval-first-report](./asr-eval-first-report.md) | — | v0.20.0（REQ-263）asr_eval 首轮自测报告——harness 通道就绪 + 真实数据首跑（13 会话弱参考档 CER 均值 0.2784）+ 数据面缺口登记（无 ≥3 段字幕会话）；内容已实施（M1/M2/M2b）入夹 |

## 技术债变更摘要

- 承继（carried）：**8 笔**（TD-040、TD-19-D、TD-24-A、TD-30-A/B、TD-31-A/B/C）——逐笔核验（lib.rs 872/ClassroomPage 745 等口径）无偿还条件发生；权威清单见 [tech-debt.md](./tech-debt.md)
- 偿还/关闭：**0 笔既有**（本日新增债以 carried/open 登记，见下）
- 审查即修（不立债）：**四区并行审查 → 即修 4 批**：`e59c413`（AI 批：SSE [DONE] 收尾校验/去 response_format/整包零成本回退/预算余量 18k/授权文案条件化）、`fa1647a`（捕获批：auto_paused 泄漏/暂停期 watchdog 探针/OCR 重复记账守卫/误停阈值 SUSPECT=2/徽标残留清除）、`7569871`（笔记批：手动序孤儿清理与从属校验/折叠组行排除区间/跨组落点先归组后落位/平铺拖拽守卫/划选监听泄漏与节流/锚点语义/整数绑定）、`553e95a`（挂体系批：模型 disciplines JSON 数组契约/Enter=命中选首项+IME isComposing/轻建代际守卫）
- 新增债务（本日审查遗留，open/carried 见 tech-debt）：
  - TD-2026-09-05-A（open P3）：挂体系空体系「去建体系」引导按钮未交付（组件无跨页跳转通道，待 v0.19.8/组件批）
  - TD-2026-09-05-B（open P3）：模型 disciplines 入参三形态契约漂移（KnowledgeModelDialog/KnowledgeDetailPanel 传数组 vs Rust String；本批新路径已按 JSON 字符串修正）
  - 观察项 6 条（不立债）：暂停期声通道停采（“声画任一恢复”实仅画面通道）/流式行缓冲与 SSE 双实现待公共抽取与单测/轨迹 system 非实发原文/审计与预估不携带 vision 覆写/批量移动串行与保存双 IPC/心跳无前端消费（诊断保留）

## 提交（当日 v0.19.6/7 全部）

- v0.19.6：`4c7dad0` `49d8619` `ddf3cb6` `b1af826` `843886e0` `a21fd6d`
- v0.19.7：`c0c6eff` `1c7f808` `d7d589b5` `a5c912d` `b6a00a4` `305d8cc0` `d001c2fc` `33aff9a` `7460ae3` `a3a7b781`
- 审查即修：`e59c413` `fa1647a` `7569871` `553e95a` `f15320d8`（元数据纠偏）
- v0.20.0 asr_eval（REQ-263 首轮）：`11b3bb8`（M1 纯函数层）`2250310`（M2 harness）`564ee1a`（M2b 会话信道）
- 本归档提交：`docs(archive): archive 2026-09-05`
