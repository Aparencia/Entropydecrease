# 熵减 (Entropydecrease) — 路由映射

React Router v6 `createHashRouter`，全部页面 lazy 加载 + Suspense 骨架屏。

## 主布局（AuthGuard → AppLayout）

所有业务页面嵌套在 `AppLayout` 中：Electron 标题栏（Layer 2）+ 3D 场景全屏背景（Layer 0）+ 功能覆盖层 FunctionalOverlay（Layer 1，含页面 Outlet）。

| 路径 | 页面 | 模块隐喻名 |
|------|------|-----------|
| `/` | DashboardPage — 知识星空仪表盘 | 首页 |
| `/pomodoro` | PomodoroPage | 深潜（专注番茄钟） |
| `/pomodoro/stats` | PomodoroStatsPage | 统计 |
| `/pomodoro/settings` | PomodoroSettingsPage | 设置 |
| `/notes` | NotesPage | 结礁（学习笔记） |
| `/notes/graph` | NotesGraphPage | 笔记图谱 |
| `/notes/:id` | NoteEditPage | 笔记编辑 |
| `/flashcards` | FlashcardsPage | 反衰减呼吸（记忆闪卡） |
| `/flashcards/:deckId` | DeckDetailPage | 卡组详情 |
| `/flashcards/:deckId/study` | StudySessionPage | 学习会话 |
| `/flashcards/:deckId/generative-review` | GenerativeReviewPage | AI 生成复习 |
| `/feynman` | FeynmanPage | 浮出水面（费曼讲解） |
| `/feynman/graph` | FeynmanGraphPage | 费曼图谱 |
| `/feynman/:sessionId` | FeynmanSessionPage | 费曼会话 |
| `/socratic` | SocraticSessionPage | 苏格拉底会话 |
| `/settings` | SettingsPage | 设置 |
| `/analytics` | AnalyticsPage | 数据分析 |
| `/inspiration` | InspirationPage | 萤火海沟（灵感收集） |
| `/classroom` | ClassroomPage | 回声定位（课堂采集） |
| `/settling` | SettlingPage | 沉淀 |

## 独立路由（无 AppLayout）

`/onboarding`、`/login`、`/register`、`/privacy`、`/terms`、`/reset-password`、`/verify-email`

## 路由与 3D 模块映射（OrbitalStore）

模块 ID 与路由：dashboard→`/`、pomodoro→`/pomodoro`、notes→`/notes`、flashcards→`/flashcards`、feynman→`/feynman`、inspiration→`/inspiration`、classroom→`/classroom`、settling→`/settling`。数字键 0-7 快捷导航。
