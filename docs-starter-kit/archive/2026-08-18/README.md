# 2026-08-18 归档索引

> 首轮基线归档：重构区建立首个提交（45faa07），文档体系（docs-starter-kit/）自此受 git 跟踪。
> 二轮归档（同日）：v0.2.0 实时捕获链路代码审查完成，技术债清单滚动更新。

## 归档内容

- 本轮无文档移入归档：docs-starter-kit/ 下全部为持续活跃文档（standards/、templates/、product/、versions/、knowledge/index.md，按 archive/README.md 判定标准不归档）
- v0.2.0 新增文档（ADR-001~005、versions/v0.2.0.md）均为**当前生效/活跃**文档，不满足归档条件：ADR 属"当前生效 ADR"、版本规划属 versions/ 活跃区
- 本轮代码成果（实时捕获链路：WASAPI/DXGI/流式 ASR/字幕 OCR/双源融合/会话管理 + 模型自动下载）待提交（工作区未提交状态）

## 技术债摘要（二轮滚动）

- 未偿 17 笔：TD-001~007 全部 carried（TD-005 部分偿还：新增 command 已补入参校验）；新增 TD-008~017（审查 L1/L2/L4/L5/L6/L7/L8/L9/L10/L12 未修项，P2×5 / P3×5）
- 今日已偿 8 笔：审查严重 S1（EXTENSIBLE 格式误判）/S2（时间戳墙钟）与中等 M1/M3/M5/M6/M7/M8 全部本次会话修复（代码未提交，待 commit）

## 备注

- 下个归档日需先整理本日清单（继承 carried 债务）
- 后续归档流程：git log --since= 筛选已实施文档 → 判定 → git mv 入本夹
- 待办：v0.2.0 代码与文档提交后，为已偿项回填偿还提交哈希
