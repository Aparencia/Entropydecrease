"""
熵减 AI 网关 — 超时与频率限制配置

@ai-context: 按 feature 维度配置超时（秒）与每日频率上限。多模态/视频分析
成本高、耗时长，故超时与限流都显著高于文本类功能。call_with_fallback 以
TIMEOUT_CONFIG * 1.5 作为整条 fallback 链的总预算。
"""

# ============================================================
# 超时配置（单位：秒）
# ============================================================

TIMEOUT_CONFIG: dict[str, int] = {
    "summarize": 30,          # 笔记摘要，模型响应可能较慢
    "generate_cards": 30,
    "evaluate": 20,
    "recommend": 10,
    "vision_extract": 20,
    "transcribe": 30,
    "tag_content": 10,
    "optimize_card": 15,
    "feynman_question": 15,
    "feynman_evaluate": 15,
    "sort_inspiration": 15,
    # v1.0.0/v1.1.0 新增 Chain
    "anchor_point": 15,
    "socratic": 30,           # 多轮对话，需要更长时间
    "predict": 15,
    "rescue": 30,             # 三级救援内容较多
    "inspiration_draft": 15,
    "ritual_recall": 15,      # v0.26.0 B1.2：单个小问，快速返回
    "progress_narrative": 15, # A3 微进展叙述：两句话短文本，快速返回
    # FEAT-022: 苏格拉底式学习
    "socratic_brainstorm": 20,
    "socratic_evaluate": 15,
    "socratic_deepening": 15,
    # Path B: 多模态课堂分析（多图 + 长文本生成，需要宽裕超时）
    "multimodal_analyze": 120,
    # Path C: 视频分析（视频处理 + 长文本生成，需要更长超时）
    "video_analyze": 300,
    # 学伴对话（流式 SSE，多轮交互 + 长上下文，需要更宽裕的超时）
    "chat": 60,
    # F4: 黄金错误模式分析（JSON Mode，输入最多 20 条错误）
    "error_pattern": 20,
    # N1: 课程级迷你测试生成（JSON Mode，生成 5-10 题耗时较长）
    "quiz_gen": 30,
    # N5: 内容分层（JSON Mode，三层摘录）
    "content_tier": 30,
    # N6: 概念冲突检测（JSON Mode，跨文本比对）
    "conflict_detect": 30,
    # E1: 概念预检（JSON Mode，1-2 个探测问题）
    "concept_precheck": 30,
    # 知识入籍概念化（JSON Mode，切块文本→概念候选，与同批 JSON Mode 链一致）
    "import_concept": 30,
}

# ============================================================
# 频率限制（每日上限）
# ============================================================

RATE_LIMITS: dict[str, int] = {
    "daily_total": 50,
    "summarize": 15,
    "generate_cards": 10,
    "evaluate": 10,
    "recommend": 15,
    "vision_extract": 20,
    # 课堂实时转录为段级高频调用（VAD 每 5-30s 产生一段，一节课数百段），
    # 对齐主流 ASR 按时长计费模式放宽次数限制；中间件对其豁免全局每日总量
    "transcribe": 600,
    "tag_content": 30,
    "optimize_card": 15,
    "feynman_question": 15,
    "feynman_evaluate": 15,
    "sort_inspiration": 20,
    # v1.0.0/v1.1.0 新增 Chain
    "anchor_point": 15,
    "socratic": 20,           # 多轮对话，频率稍高
    "predict": 15,
    "rescue": 10,             # 救援场景，适度限制
    "inspiration_draft": 15,
    "ritual_recall": 20,      # v0.26.0 B1.2：每日启动仪式触发，适度上限
    "progress_narrative": 5,  # A3 微进展叙述：每周一次节奏，低频即可
    # FEAT-022: 苏格拉底式学习
    "socratic_brainstorm": 15,
    "socratic_evaluate": 20,
    "socratic_deepening": 15,
    # Path B: 多模态课堂分析（单次分析成本较高，适度限制）
    "multimodal_analyze": 5,
    # Path C: 视频分析（单次成本最高，严格限制）
    "video_analyze": 3,
    # 学伴对话（流式 SSE）：多轮闲聊场景下单次会话即可超过 20 条，
    # 原值导致内测用户当日配额耗尽后消息持续 429（"有概率发送失败"），放宽至 100
    "chat": 100,
    # F4: 黄金错误模式分析（非高频场景，适度限制）
    "error_pattern": 10,
    # N1: 课程级迷你测试生成（生成成本高，严格限频）
    "quiz_gen": 5,
    # N5: 内容分层（生成成本高，严格限频）
    "content_tier": 5,
    # N6: 概念冲突检测（生成成本高，严格限频）
    "conflict_detect": 5,
    # E1: 概念预检（生成成本高，严格限频）
    "concept_precheck": 5,
    # 知识入籍概念化（批量导入场景，适度限频）
    "import_concept": 10,
}
