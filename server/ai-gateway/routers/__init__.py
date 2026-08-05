"""熵减 AI 网关 — 路由模块"""

from routers.summarize import router as summarize_router
from routers.generate_cards import router as generate_cards_router
from routers.evaluate import router as evaluate_router
from routers.recommend import router as recommend_router
from routers.vision import router as vision_router
from routers.transcribe import router as transcribe_router
from routers.tag_content import router as tag_content_router
from routers.feynman_question import router as feynman_question_router
from routers.inspiration import router as inspiration_router
from routers.learning import router as learning_router
from routers.inspiration_draft import router as inspiration_draft_router
from routers.socratic import router as socratic_router
from routers.multimodal import router as multimodal_router
from routers.course_detect import router as course_detect_router
from routers.streaming import router as streaming_router
from routers.balance import router as balance_router
from routers.ritual_recall import router as ritual_recall_router
from routers.progress_narrative import router as progress_narrative_router
from routers.chat import router as chat_router
from routers.error_pattern import router as error_pattern_router
from routers.quiz_gen import router as quiz_gen_router
from routers.content_tier import router as content_tier_router
from routers.conflict_detect import router as conflict_detect_router
from routers.concept_precheck import router as concept_precheck_router
from routers.import_concept import router as import_concept_router
from routers.license import router as license_router
from routers.beta import router as beta_router
from routers.learning_plan import router as learning_plan_router
from routers.session_qa import router as session_qa_router
from routers.debate import router as debate_router
from routers.counterintuitive import router as counterintuitive_router
from routers.personify import router as personify_router
from routers.mnemonic import router as mnemonic_router
from routers.podcast import router as podcast_router
from routers.learning_coach import router as learning_coach_router
from routers.infographic import router as infographic_router
from routers.freshness import router as freshness_router
from routers.embodied import router as embodied_router
from routers.learning_narrative import router as learning_narrative_router
from routers.haiku import router as haiku_router
from routers.compile import router as compile_router
from routers.micro_card import router as micro_card_router

__all__ = [
    "summarize_router",
    "generate_cards_router",
    "evaluate_router",
    "recommend_router",
    "vision_router",
    "transcribe_router",
    "tag_content_router",
    "feynman_question_router",
    "inspiration_router",
    "learning_router",
    "inspiration_draft_router",
    "socratic_router",
    "multimodal_router",
    "course_detect_router",
    "streaming_router",
    "balance_router",
    "ritual_recall_router",
    "progress_narrative_router",
    "chat_router",
    "error_pattern_router",
    "quiz_gen_router",
    "content_tier_router",
    "conflict_detect_router",
    "concept_precheck_router",
    "import_concept_router",
    "license_router",
    "beta_router",
    "learning_plan_router",
    "session_qa_router",
    "debate_router",
    "counterintuitive_router",
    "personify_router",
    "mnemonic_router",
    "podcast_router",
    "learning_coach_router",
    "infographic_router",
    "freshness_router",
    "embodied_router",
    "learning_narrative_router",
    "haiku_router",
    "compile_router",
    "micro_card_router",
]
