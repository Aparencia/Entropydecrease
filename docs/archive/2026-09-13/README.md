# 归档 2026-09-13

> 归档 SOP：见 [../README.md](../README.md)。归档当日：**2026-09-13**（执行日）——**U3 用户裁决落地**：`docs/tech-debt/` 归档入本夹（6 步日收工 SOP）。本夹为零代码改动的纯文档归档。
> 🔴 **日期口径**：子夹名取**实际执行日** `2026-09-13`；被归档文件的文件名里的 `2026-09-11` 是**审查日期**，不是归档日。
> 🔴 **09-10 / 09-11 / 09-12 无日期夹**：按机制「空白日不建夹」（`../README.md:53`），这三天未单独归档，其间的债务一并并入本夹（「最新归档必有权威清单」）。

## 归档清单

| 源 | 目的 | 说明 |
|----|------|------|
| docs/tech-debt/review-2026-09-11.md（**未跟踪**，191,980 B） | [review-2026-09-11.md](./review-2026-09-11.md) | 2026-09-11 新增代码独立审查报告（审查报告属「可归档」类，先例 [../2026-09-06/asr-v020-review.md](../2026-09-06/asr-v020-review.md)）——[ ] 已归档。**内容零改动**：`Buffer.byteLength` = **191,980 B** · sha256 = `d185caff7faceee0f64aa43fd738c7e1de7d65186cf00ae63c2f775383f5c1dd`（归档前后逐字相同）· `git hash-object --path` = `52ad1d01dc0e3cd9329623f82f73945a6c02e3e9`（两侧同值） |
|（滚动） | [tech-debt.md](./tech-debt.md) | 当日权威债务清单（59 行：closed 10 + carried 3 + open 46；自 [2026-09-09](../2026-09-09/tech-debt.md) 权威清单滚动核验 + 登记 2026-09-11 审查的新增 open） |

**归档形态说明（🔴 必读，否则会被读成「没用 `git mv`」的违规）**：`docs/tech-debt/review-2026-09-11.md` **此前从未入库**（`git ls-files docs/tech-debt` = **0 命中**；`git status --porcelain` 恒为 `?? docs/tech-debt/`）⇒ 🔴 **它没有 git 历史可保留**，`git mv` 对未跟踪文件**不适用**（`git mv` 的前提是源已在索引里）。本夹的实施形态 = **`git add` 到归档路径** + 删除原未跟踪目录，**不是** `git mv`，也**不声称保留任何历史**。

**归档后 `docs/tech-debt/` 已不存在**（实测：目录与其中的文件均不可读）。

活跃区候选判读（不入夹）：`docs/versions/v0.22.md`、`docs/product/requirements-pool.md`、`docs/standards/line-limit-exemptions.md`、`docs/adr/ADR-032~035` 均属「不归档（持续活跃）」类；`.superpowers/**` 为 gitignore 台账，不入归档域。

## 债务摘要

- **滚动核验（SOP 第 1 步）**：自 2026-09-09 权威清单 **26 行**逐条核对 ⇒ **已偿转 closed 5 笔**（TD-2026-08-24-A `c409a956` lib.rs 872→572 · TD-2026-08-30-A 拆件链 ClassroomPage 745→287 · TD-2026-08-31-C `76d2066a` App.css 删除 · TD-2026-09-09-A 拆件链 NoteListView 646→242 · TD-2026-09-09-D 拆件链 SessionListPanel 604→298 / NotesPage 602→300）+ **部分兑现 1 笔**（TD-2026-09-06-G 后半句）；**其余 20 行无新偿还条件发生，全部继承**（carried 3 / open 14，滚动规则「无新增债务的归档日仍须继承昨日清单」）。
- **今日新增（SOP 第 2 步）**：`TODO/FIXME/HACK` 面 **0 笔**（`git log --since=2026-09-10` 566 提交的新增行命中 16 行，其中 15 行是文档自身对本 SOP 的引述，唯一代码面 `ProfileDetector.tsx:194 TODO(后端)` 已在批 7 删除）；**妥协方案面 32 笔 `open`** —— 全部来自 2026-09-11 新增代码独立审查报告 §5 的建议清单 `TD-2026-09-11-A~AG`（**33 条**，其中 `H` 经本日实测判 `closed（部分兑现）`；`AD`/`AE`/`AG` 加注已部分兑现的收窄读数）。**这一批债务此前无任何归档日收容过**（最新归档日 2026-09-09 早于 09-11），并入本夹是滚动规则的必然结果。
- **统计口径（权威，与 tech-debt.md 一致）**：**closed 10 + carried 3 + open 46 = 59 行**。
- ⚠️ **归档不追认结论**：本夹的审查报告是一份**审查报告**（其结论由控制方/用户另行裁量）；归档只改变其**路径与跟踪状态**，**不改变其内容**，**不代表其结论被追认**。
- ⚠️ **保留面**：`docs/standards/tech-debt.md:117/119` 仍把债务登记入口写作 `docs/tech-debt.md` / `docs/tech-debt/review-YYYY-MM.md` —— 本夹归档后该目录**不存在**，该标准的这两行已陈旧。**本单元不改它**（不在 T26 卡片的 `Files:` 内，且属 `docs/standards/**`）⇒ 单列为未决项，请控制方指派（建议随 v0.22 批 8 的文档回写单元一并更正）。

## 门禁读数（归档前后）

| 门禁 | 归档前 | 归档后 | 归因 |
|---|---|---|---|
| `docs-check` | **扫描 282 / 检查 182**（exit 0） | **扫描 284 / 检查 181**（exit 0） | `files` 282 **−1**（`docs/tech-debt/review-2026-09-11.md` 从非归档路径移走）+ **+3**（本夹 README / tech-debt / review-2026-09-11）= **284**；`activeFiles` 182 **−1**（被移入 archive 的那份不再算活跃，`scripts/docs-check.mjs:107-111` 按**路径段**排除 `archive`）+ **+0**（本夹新增 3 件全在 archive 内）= **181** —— 与计划预测 **284 / 181** 逐字一致 |
| `line-limits --full` | 0 / 121 / 121（exit 0） | 0 / 121 / 121（exit 0） | 零生产代码改动 |
| `check-command-registry` | 311 / 311 / 0 | 311 / 311 / 0 | 零 IPC 面改动 |
| `git status --porcelain` | `?? docs/tech-debt/`（唯一一行） | **空** | 归档后目录消失、新文件已入库 |

## 关联

- 归档索引：[2026-09-13 索引行](../README.md)（archive README）
- 上一权威清单：[2026-09-09 tech-debt.md](../2026-09-09/tech-debt.md) · 机制的权威说明：[归档机制](../README.md)
- 用户裁决依据：批 8 §U3 = a（归档到 `docs/archive/`）· 执行单元：T26
- 版本与需求：[v0.22 版本文档](../../versions/v0.22.md) · [需求池](../../product/requirements-pool.md)
