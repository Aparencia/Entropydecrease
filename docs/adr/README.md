# 架构决策记录（ADR）索引

> 记录重要技术决策的背景、备选方案与权衡。规范见 [ADR 标准](../standards/adr.md)，
> 模板见 [ADR 模板](../templates/adr-template.md)。

| 编号 | 标题 | 状态 | 日期 |
|------|------|------|------|
| ADR-001 | [WASAPI 端点环回音频捕获方案](./ADR-001-wasapi-loopback-capture.md) | 已接受 | 2026-08-18 |
| ADR-002 | [DXGI 屏幕捕获与关键帧变化检测方案](./ADR-002-dxgi-screen-capture.md) | 已接受 | 2026-08-18 |
| ADR-003 | [流式 ASR 引擎与模型分发方案](./ADR-003-streaming-asr-architecture.md) | 已接受 | 2026-08-18 |
| ADR-004 | [会话管理数据模型方案](./ADR-004-session-data-model.md) | 已接受 | 2026-08-18 |
| ADR-005 | [字幕 OCR 与双源转写融合方案](./ADR-005-subtitle-ocr-fusion.md) | 已接受 | 2026-08-18 |
| ADR-006 | [会话段派生视图：原始段与融合轴分离](./ADR-006-session-segments-derived-view.md) | 提议 | 2026-08-18 |
| ADR-007 | [采集会话生命周期与窗口解耦（持续不间断运行）](./ADR-007-live-session-lifecycle.md) | 已接受 | 2026-08-18 |
| ADR-008 | [文件导入与字幕优先转写方案（含采集链路质量优化）](./ADR-008-file-import-subtitle-priority.md) | 已接受 | 2026-08-18 |

## 编号规则

按创建顺序递增，三位数字（ADR-001、ADR-002…），编号一经分配不再复用。
文件名格式：`ADR-XXX-kebab-case-title.md`。

## 状态说明

| 状态 | 含义 |
|------|------|
| 提议 | 尚在讨论，未开始实施 |
| 已接受 | 决策生效，代码/配置按此实施 |
| 已废弃 | 不再适用，但保留供历史追溯 |
| 已取代 | 被更新的 ADR 替代，需注明取代者编号 |

## 使用建议

- 决策 ≥ 30 分钟讨论或有多个备选方案时，就值得写 ADR
- 每个 ADR 独立文件，索引表按编号排序
- 被取代的 ADR 不删除，改为"已取代"并注明新编号（保留决策历史）
