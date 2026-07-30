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
]
