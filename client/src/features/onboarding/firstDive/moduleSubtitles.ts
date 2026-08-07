/**
 * 模块副标题映射 — 新手期双标签的唯一数据源
 *
 * @ai-context: 隐喻命名（深潜/结礁…）无法自解释，是新手墙之一；
 * 新手期（首潜未完成）各导航面在模块名旁附直白副标题。
 * 所有导航面（3D 标签 / 移动端网格 / 侧边栏）统一从此处取值，禁止各自硬编码。
 */
export const MODULE_SUBTITLES: Record<string, string> = {
  pomodoro: '专注番茄钟',
  notes: '学习笔记',
  flashcards: '记忆闪卡',
  feynman: '费曼讲解',
  inspiration: '灵感收集',
  classroom: '课堂采集',
  constellation: '知识可视化',
};

/** 取模块副标题；无副标题（如首页）返回 undefined */
export const getModuleSubtitle = (moduleId: string): string | undefined =>
  MODULE_SUBTITLES[moduleId];
