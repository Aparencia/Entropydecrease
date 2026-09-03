# ADR-029：检索与发现层（RAG 接层）——派生索引 + 双读路径 + 人工裁决闸门

> 状态：**已接受**（2026-09-03，随 [v0.19 设计规格](../superpowers/specs/2026-09-03-v0.19-rag-retrieval-discovery-design.md) 用户批准）
> 关联：[v0.19 设计规格](../superpowers/specs/2026-09-03-v0.19-rag-retrieval-discovery-design.md) · [ADR-010](./ADR-010-gap-filling-ai.md)（AI 为增强层·本地兜底铁律）· [ADR-024](./ADR-024-knowledge-system-layer.md)（体系只引用不收纳·AI 只建议不生成）· [ADR-028](./ADR-028-ai-goal-planner.md)（建议制确认落库/预算硬顶/双闸门范式）· REQ-258~262（已登记）

## 背景

用户提出"把当前项目体系改成 RAG 知识库"（2026-09-03），经多角度分析与逐轮裁决：整体重定位（A）与体系层向量化换引擎（C）均否决——前者进入 NotebookLM/书脉/本地 AI 问书竞品的红海主场并拆毁既有学习闭环护城河（v0.13 竞品分析已裁决"不打 AI 问书战"），后者推翻"AI 只建议不生成/体系是人类判断领地"哲学（ADR-024）且破坏依赖结构化体系的规划师弱项分析/决策引用/审计下游。采纳**方案三**：加一层能力（B）＋ C 的良性内核（自动发现关联、人工裁决写入）。

代码核查（2026-09-03）：笔记/会话/OCR 图内检索全为 `LIKE ESCAPE`，**FTS5 未实装**；`/goal` L3 检索为最近笔记标题占位；`budget_allocator::pack_fragments` 已为 REQ-024 检索增强预留 dead_code。REQ-024/REQ-231 的检索欠账真实存在。

## 决策

1. **单一事实源纪律**：`notes/fragments/knowledge_*` 等既有表是唯一真相；新增 `kb_*` 表（`kb_chunks` + FTS5 影子表 `kb_fts` + `kb_meta`）为**派生索引**——只读事实源、可全量重建（`reindex_all`），任何情况下不得反向写回事实源；向量/索引损坏以重建修复，永不当系统记录。
2. **chunk 源 = 净化后文本**：`notes.content` 与 `fragments.text` 的**节级切块**（heading-aware，≤800 字符硬切，记录 char 区间）；原始转写/OCR 原料不入检索主源（噪声；会话检索属 REQ-023 远期）。chunk 携带源引用 → 引用溯源天然成立。
3. **混合检索与降级链**：FTS5 BM25 ∪ 本地 embedding 余弦 → RRF 融合；**embedding 引擎接口化（EmbeddingEngine trait）且向量列可空**——无模型时自动降级纯 FTS5，检索/问答/发现全部能力不依赖 embedding 交付。既有 LIKE 搜索命令/UI 保留不动（零破坏）。
4. **读路径 A · 学习库问答（L3.5 → L4）**：AI 对话新增每会话"学习库问答"模式（`chat_sessions.retrieval` 列）；检索在**本地完成**，**命中片段列表为本地能力恒可用**（零成本零上传，不受闸门约束）；生成回答仅经 content_gate 双闸门 + 能力开关 `kb_qa_enabled`（**默认关**）时启用，仅授权后最小命中片段上云（ADR-010 契约）；预算复用 budget_allocator（`pack_fragments` 转正）；回答**逐条带引用**（笔记/节标题 + snippet + `chat_messages.meta_json`，点击跳笔记并高亮命中词）；无 AI/断网 → 该条回退仅命中列表（"AI 问答不可用 → 检索已在"承诺产品化）。
5. **读路径 B · 检索建议（发现，人工裁决）**：概念/节点详情出"相关素材建议"候选（混合检索 top-K，**排除已链接**）→ 勾选确认后**仅经既有 `link_knowledge_target` 引用通道落库**（target_type 白名单 note/fragment，零迁移）；跨体系相似概念为**提示型**（不自动合并——无合并命令且语义归人）。**默认关**（feature_flags `kb_discovery`，延续交叉点提示默认关）。
6. **生命周期**：笔记保存收口处钩子重索引（spawn_blocking 静默）+ 删除事务内**先经 kb_index 清 kb_chunks/kb_fts 再删源行**（与 knowledge_links 清理同款位置；FK CASCADE 仅兜底，不依赖触发器/recursive_triggers）+ `reindex_all` 三保险；索引失败不静默（`kb_index_stats` 角标可见）。
7. **本地 embedding 选型 spike 门控（M0）**：候选内嵌 ONNX（bge-small-zh-v1.5，分发复用 model_registry/常驻引擎池，ORT 与既有 onnxruntime.dll 共存为必测项）vs Ollama `/api/embeddings` 端点（用户自装，零分发）；中文小评测集（~30 查询）定案；模型文件不入库。
8. **红线延续**：不接 agent 框架/记忆模块/自主 RAG 管线；检索/向量产物不经人工确认不得写结构层；不自动建体系/概念/链接；不做云端向量库/外部检索服务（个人量级本地暴力线性扫描足够，免新原生依赖与 TLS 下载风险）。

## 备选（否决）

- **A 整体重定位为通用 RAG 知识库产品**：进入竞品红海（NotebookLM 免费冲击已判定）；亲手拆毁 v0.11~v0.18 学习闭环护城河；与"被 AI 问/人类见证"定位冲突。
- **C 体系层向量化（换引擎）**：概念=向量簇无稳定 ID → 规划师弱项分析/决策 typed 引用/审计可枚举性全部失去地基，下游重写；体系退化为"安慰剂问答机器"（ADR-024 明载风险）。
- **朴素 B+C 双轨并行**：结构画布与向量库两套知识景观互不相认、双真相、双维护，违背"身份诚实"。
- **FTS5 直接升级替代（无语义层）**：作为 M1 基线可行且保留（降级链），但无法偿还 O5/C8/语义召回欠账——仅检索不做发现路径则本设计价值减半。
- **云端向量库/embedding API 为主链**：违背本地优先铁律；上传面失控（仅作未来显式授权项）。

## 影响

### 正面影响
- 偿还长期欠账：REQ-024 检索增强、REQ-231 L3 全库、X1 检索面、O5/C8 前置条件（embedding 选型）一次合流。
- 本地 FTS5 先行（无 embedding 依赖）→ 逐层降级交付，无全有全无风险；既有搜索/知识体系/AI 平台零破坏复用。
- 引用溯源（笔记/节/snippet/跳转高亮）差异化体验；发现路径以既有引用通道落库，体系纪律零突破。

### 负面影响 / 代价
- 新增 kb_* 三表 + 索引生命周期（钩子/级联/重建）维护面；notes 保存路径新增重索引钩子（需防阻塞：spawn_blocking + 静默失败可见）。
- FTS5 需确认 bundled SQLite 使能（编译期配置，无下载风险）；中文 BM25 切词口径需 spike 校准。
- chat_sessions/chat_messages 各 +1 列（ensure_column）；ai_chat 命令签名扩展需回归。
- 若 spike 否决内嵌 ONNX：语义检索依赖用户自装 Ollama（接受度门槛）或降级 FTS-only（能力损失明确可见）。

### 风险
- 索引一致性漂移（钩子漏挂路径）→ 以"保存收口单点挂钩 + reindex_all 兜底 + stats 角标"三保险防御。
- 生成式问答幻觉 → 只依据片段回答 + 无命中明说 + 逐条引用可见 + 默认关（治理前置）。
- 发现路径沦为"AI 写体系后门"→ 建议仅经人工确认 + link 通道落库，不新增写路径。

## 合规性验证

- 混合检索 RRF/切块/预算截断纯函数 TDD（golden 矩阵）；kb_chunks FK 级联与 FTS 影子表同步测试；chat_send 双闸门 + 降级链路径测试（无 AI/无 embedding）；discovery 确认流复用 link 幂等语义回归；cargo test / clippy / vitest / tsc 全绿（v0.19 验收 ①~⑧）。

## 相关决策

- ADR-010（AI 增强层·本地兜底——本 ADR 的降级链是其产品化延续）· ADR-024（体系层——发现路径只走引用通道，不新增写路径）· ADR-028（建议制/预算/双闸门范式复用）· ADR-016（AI 凭据——密钥链不动）· REQ-024/REQ-231（本 ADR 落地其检索欠账）· P13/REQ-029（知识图谱出局——检索建议不承担增长机制）

## 参考

- v0.19 设计规格（§三~§十三：分层/索引/双读路径/治理/验收/排期）· 代码核查事实（search_notes/db_ocr_search/goal_chat_context/budget_allocator 注释）· v0.13 竞品分析（NotebookLM 冲击判定）· ADR-024 哲学条款
