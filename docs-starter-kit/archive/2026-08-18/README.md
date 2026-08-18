# 2026-08-18 归档索引

> 首轮基线归档：重构区建立首个提交（45faa07），文档体系（docs-starter-kit/）自此受 git 跟踪。
> 二轮归档（同日）：v0.2.0 实时捕获链路代码审查完成，技术债清单滚动更新。
> 三轮归档（同日）：二次代码审查（P0 发现 DXGI SDKVersion 错误）+ P0/P1 修复完成，技术债再滚动。

## 归档内容

- 本轮无文档移入归档：docs-starter-kit/ 下全部为持续活跃文档（standards/、templates/、product/、versions/、knowledge/index.md，按 archive/README.md 判定标准不归档）
- v0.2.0 新增文档（ADR-001~005、versions/v0.2.0.md）均为**当前生效/活跃**文档，不满足归档条件
- 新增活跃登记：[standards/line-limit-exemptions.md](../../standards/line-limit-exemptions.md)（单文件行数豁免清单，AGENTS.md §3 落地）
- 本轮代码成果（实时捕获链路 + 模型自动下载 + 审查 P0/P1 修复）待提交（工作区未提交状态）

## 技术债摘要（三轮滚动）

- 未偿 19 笔：TD-001~007 carried；TD-009~014/016 carried（二轮未修项）；新增 open TD-024~028（二次审查：融合文本重复/OCR 磁盘 IO/OCR 阻塞音频/非 Windows 门控/CoUninitialize）
- 今日已偿 19 笔：二轮 8 笔 + 三轮 11 笔（TD-008/015/017/018/019/020/021/022/023/030/031；含 P0 DXGI SDKVersion）

## 备注

- 下个归档日需先整理本日清单（继承 carried 债务）
- 后续归档流程：git log --since= 筛选已实施文档 → 判定 → git mv 入本夹
- 待办：v0.2.0 代码与文档提交后，为已偿项回填偿还提交哈希
