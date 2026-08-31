# 2026-08-31 归档

> 归档日期：2026-08-31（v0.16.1 用户反馈批交付 + 新增代码审查七维 + 审查即修）
> 归档对象：已实施完成的设计/方案文档（生命终态）
> 当日权威债务清单见 [tech-debt.md](./tech-debt.md)

## 归档清单

| 源路径 | 归档路径 | 状态/原因 |
|--------|----------|-----------|
| ——（本日无文档可归档） | —— | v0.16.1 版本文档属 **versions/ 不归档类**（持续活跃，同 v0.15/v0.16.0 先例）；需求池 requirements-pool/README 属活跃登记区；本批未产生独立设计 spec/头脑风暴/ADR（设计即版本文档） |

## 归档说明

- 本批（2026-08-31）交付内容：图片插入 RangeError 修复 + 正文多色荧光笔（含 hName 缺陷修复）+ 对话转笔记双入口 + AI 任务对话化（线程卡/追问/`/`命令/精修启动自动跳转）+ 精修工作台深链 + 右键菜单完整性（笔记/组/会话行）+ WebView2 浏览器原生右键菜单全局禁用（7 提交：4e30af1f / ae9e89ea / 871d708f / 533e7e92 / 5d080906 / a27954e6 / 09f9689f）
- 文档落位：v0.16.1 版本文档（versions/）、需求池 REQ-238~244 登记（编号说明：REQ-231 已由 v0.16.0 预留给聊天上下文注入，本批顺延自 238）
- code review 定位并即修 5 项（见 tech-debt 当日即修记录）

## 技术债摘要

- **状态**：昨日 5 笔未偿（TD-040 / TD-19-D / TD-24-A / TD-30-A / TD-30-B）逐条核验均未发生偿还条件 → 全部 carried（TD-30-B 经 `cargo test --test app_lib_tests note_filter` 复现 60 通过 / 2 失败，与昨日完全一致）
- **新增 open 3 笔**：TD-2026-08-31-A（BrowserChrome contenteditable 右键未覆盖，P3）/ TD-2026-08-31-B（13 处 window.prompt/confirm/alert 替换，用户裁决后续批，P2）/ TD-2026-08-31-C（App.css 从未引入死样式，P3）
- **观察项**：继承未决 8 项 + 新增 7 项（31-1~31-7，详见 tech-debt.md）
- 权威清单：[tech-debt.md](./tech-debt.md)（5 carried + 3 open + 15 观察项）

## 验证

- 前端 vitest 62 文件 **483 用例全绿**（本批新增 47 测）+ `tsc --noEmit` 零错误
- Rust `cargo check` 零错误（新增依赖 webview2-com 0.38，lock 内已有零下载）；note_filter 预存 2 失败与本次无关（TD-30-B carried 复现）
- docs-check 链接校验：本批文档（v0.16.1.md / versions README / requirements-pool）零新问题
