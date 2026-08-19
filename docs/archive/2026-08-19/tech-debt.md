# 技术债清单（权威：2026-08-19，M2-M6 新增代码审查后三次滚动）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：本日二轮清单滚动——TD-040 维持 carried（deliberate 有意不修）。
> 三次滚动（v0.6.0 M2-M6 交付 + 新增代码审查，REQ-062~085）：
> 发现 6 项问题全部当日修复（提交 8582083，见下）。

## 未偿债务

| ID | 摘要 | 备注 |
|----|------|------|
| TD-040 | tauri.conf.json bundle.resources 未含 ffmpeg——生产安装包无捆绑 ffmpeg（v0.3.0 审查，2026-08-18） | carried（deliberate 有意不修）：resources glob 对缺失目录构建失败；捆绑 ffmpeg（~80MB）与安装包体积权衡留待体积策略；开发期由 download-ffmpeg.ps1 + PATH 覆盖（ADR-008 风险项，保持观察）。三次核对（2026-08-19）：M2-M6 代码未涉模型分发/捆绑，维持 carried |

## 今日已偿（审查发现即修复，全部可经代码核验）

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| （审查 H1） | 精修读取裁剪图路径错误——`state_image_path_for` 仅返回相对路径，`image::open` 在进程工作目录解析必然失败，精修功能不可用（critical） | `run_refine` 注入会话图片库绝对目录（`data_dir/session-images/<id>`），`refine_one` 目录内解析 + 文件缺失明确报错（提交 c5eae08） |
| （审查 H2） | 同帧双写冲突——`region_ocr` 裁剪图与 `handle_full_frame` 关键帧同时间戳写 `full/<ts>.webp` 互相覆盖，精修输入变整帧（high） | `SessionImageStore::save_crop` 新增 `crop/` 命名空间隔离 + `list_crops`；`run_refine` 候选改用裁剪图清单；2 个回归测试（提交 c5eae08） |
| （审查 H3） | 公式高精度档切换失效——`structure_model_paths` 硬编码 pp-formulanet，UniMERNet 下载后 `formula_ready` 仍 false，精修跳过公式（high） | 新增 `structure_tier.rs` 档位持久化（JSON + 显式 serde rename）+ 下载时按档位保存 + 装配路径按档位解析 + `structure_formula_tier` 命令 + 前端档位回显（提交 c5eae08） |
| （审查 M1） | 下载无 Content-Length 校验——1.84GB 截断下载静默成功，残缺模型被装配（medium） | `download_one` 读取 Content-Length 结束时比对（同 model_downloader 口径）（提交 c5eae08） |
| （审查 M2） | `running` 标记在 spawn 失败时残留——该类模型永久"下载中"无法重试（medium） | spawn 失败分支移除 running 标记（提交 c5eae08） |
| （审查 M3） | 精修对裁剪图重跑完整管线取 first 不可靠；decide_refine 提示与上游 layout 必选约束不符（medium） | `best_table` 按 bbox 面积降序选最大者（裁剪图即区域本体）+ 测试；decide_refine 提示明确"版面模型未下载（管线依赖）"（提交 c5eae08 + 65c950a） |
| （审查 M4） | 精修 N 次全量产物重写——大会话 DB 写放大（medium） | 先全部识别收集 → 内存合并 → 单次 `replace_artifact`（提交 c5eae08） |
| （审查 L1/L3） | 前端无下载进度事件；行数豁免清单过时（low） | 监听 progress 事件实时刷新；豁免清单补登 structure_models（提交 c5eae08 + 0197560） |
| （审查 R1） | AI merge 目标段被前序判定删除时 `unwrap_or(0)` 把文本错拼到 index 0 无关段——笔记数据损坏（medium） | `apply_ai_decisions` 找不到 target 时保守恢复原段（不删不并）+ 回归测试（提交 463dbf4） |
| （审查 R2） | `review_text_filter` 未拦截 recording 会话——数据不完整时 AI 复核浪费配额且结果无意义（medium） | 复核命令与 preview 口径一致：recording 会话拒绝（提交 463dbf4） |
| （审查 R3） | AI 复核缓存键不含上下文（prev/next/hint）——merge 方向判定跨上下文误复用旧判定（low） | 缓存键纳入全送审内容（段文本+上下文+类别提示）（提交 463dbf4） |
| （审查 R4） | `symbol_normalize::normalize` 逐段重复排序规则表（大会话数千段 × 70 条规则）（low） | 规则排序移至配置构造期一次（default/from_json 均排序），normalize 直接遍历（提交 463dbf4） |
| （审查 R5） | 笔记预览 `dangerouslySetInnerHTML` 渲染未转义——恶意字幕（`<script>/<img onerror>`）注入 HTML，存储型 XSS（high） | `renderMarkdown` 全文本 `escapeHtml` 转义后再包标签（提交 8582083） |
| （审查 R6） | 融合兜底分支把无置信度核对段标记为 0.5——被 note_filter 低置信规则（<0.6）误删，v0.5.0 行为回归（内容丢失）（medium） | `decide_overlap` 重构为 `OverlapDecision` 枚举（SubtitleWins/KeepReview），兜底透传 None（未知≠低置信）+ 回归断言（提交 8582083） |
| （审查 R7） | 预览 AI 复核后一键落库 `aiDecisions: null`——落库不含 AI 判定，预览/落库输出不一致（REQ-081 验收破坏）（medium） | `TextFilterReview` 新增 `decisions` 字段（缓存命中+正常送审全量收集），前端保存并回传 `session_to_note`（提交 8582083） |
| （审查 R8） | 图片去重 `last_fingerprint` 仅最近一张——PPT 往返（A→B→A）场景重复存图耗预算（medium-low） | 改最近 8 张 FIFO 指纹缓冲（往返窗口内去重），仍不占预算（提交 8582083） |
| （审查 R9） | `snippet_around` 的 `text[..pos]` 字节切片——`to_lowercase` 长度变化字符（U+0130 类）下可能非字符边界 panic（low） | `text.get(..pos)` 安全取前缀（非边界回退整串不 panic）（提交 8582083） |
| （审查 R10） | `audio_store` `SessionAudioWriter::path()` 无调用方（low） | 删除方法 + 未读 `path` 字段（提交 8582083） |

## 登记规则

- 类型四分类：有意（deliberate）/ 无意（inadvertent）/ 环境变化（environment）/ 腐化（bit rot）
- 优先级：P0 立即处理 / P1 近期 / P2 排期 / P3 观察
- 偿还时在"今日已偿"登记，状态改 closed；代码未提交的偿还注"待 commit"
- 行数豁免登记见 [standards/line-limit-exemptions.md](../../standards/line-limit-exemptions.md)
