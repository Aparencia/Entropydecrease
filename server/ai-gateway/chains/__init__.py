"""
熵减 AI 网关 — Chain 模块

Chain（链）是业务逻辑的核心编排层，负责：
- 加载和组装 Prompt 模板
- 调用 Provider 执行模型推理
- 解析和结构化模型输出
- 处理重试、降级等策略

每个 Chain 对应一个 AI 功能场景：
- SummarizeChain: 笔记摘要生成
- CardGenChain: 闪卡生成（两阶段 prompt）
- EvaluationChain: 费曼评估
- RecommendChain: 番茄钟推荐
- AnchorPointChain: 记忆锚点生成（v1.0.0）
- SocraticChain: 苏格拉底追问（v1.0.0，多轮对话）
- PredictChain: 预测驱动学习（v1.0.0）
- RescueChain: 卡壳三级救援（v1.0.0）
- InspirationDraftChain: AI 草稿生成（v1.1.0）
- DebateChain: AI 辩论对手（Phase2）
- CounterintuitiveChain: 反直觉发现器（Phase2）
- PersonifyChain: 概念拟人化（Phase2）
- MnemonicChain: 个性化记忆术生成器（Phase2）
- PodcastChain: AI 播客生成器（Phase2）
- LearningCoachChain: AI 学习教练（Phase2）
- InfographicChain: 知识信息图生成器（Phase2）
"""
