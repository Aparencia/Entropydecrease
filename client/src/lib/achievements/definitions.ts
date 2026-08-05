/**
 * 成就定义表
 *
 * @ai-context: key 是成就唯一标识，用户已解锁记录按 key 持久化匹配——
 * key 一经发布绝不可改名或删除（否则用户成就丢失），仅允许追加新成就。
 * icon 为 lucide-react 图标名，需与前端图标映射表保持一致。
 */

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  icon: string;  // lucide-react 图标名
  category: 'starter' | 'habit';
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // 入门引导型
  { key: 'first_pomodoro', title: '第一颗番茄', description: '完成第一个番茄钟', icon: 'Timer', category: 'starter' },
  { key: 'first_card', title: '知识播种者', description: '创建第一张闪卡', icon: 'Layers', category: 'starter' },
  { key: 'first_feynman', title: '费曼学徒', description: '完成第一次费曼讲解', icon: 'Lightbulb', category: 'starter' },
  { key: 'first_note', title: '笔记达人', description: '创建第一篇笔记', icon: 'FileText', category: 'starter' },
  // 习惯养成型
  { key: 'streak_3', title: '三日不辍', description: '连续 3 天打卡', icon: 'Flame', category: 'habit' },
  { key: 'streak_7', title: '周冠军', description: '连续 7 天打卡', icon: 'Trophy', category: 'habit' },
  { key: 'streak_30', title: '月度学者', description: '连续 30 天打卡', icon: 'Medal', category: 'habit' },
  // 里程碑型（R9 扩展，累计计数）
  { key: 'pomodoro_100', title: '百颗番茄', description: '累计完成 100 个番茄钟', icon: 'Timer', category: 'habit' },
  { key: 'reviews_100', title: '百卡复习', description: '累计复习 100 张闪卡', icon: 'Repeat', category: 'habit' },
  { key: 'feynman_10', title: '十次浮出水面', description: '累计完成 10 次费曼讲解', icon: 'Lightbulb', category: 'habit' },
  { key: 'notes_20', title: '笔记长廊', description: '累计创建 20 篇笔记', icon: 'FileText', category: 'habit' },
  { key: 'sop_first_run', title: '流程驾驭者', description: '完成第一次 SOP 运行', icon: 'ListChecks', category: 'starter' },
  // 赛季型成就（R12 扩展，仅追加不改既有 key——已解锁记录按 key 匹配）
  { key: 'pomodoro_200', title: '深潜老手', description: '累计完成 200 个番茄钟', icon: 'Timer', category: 'habit' },
  { key: 'reviews_500', title: '千锤百炼', description: '累计复习 500 张闪卡', icon: 'Repeat', category: 'habit' },
  { key: 'feynman_30', title: '三十次浮出水面', description: '累计完成 30 次费曼讲解', icon: 'Lightbulb', category: 'habit' },
  { key: 'notes_50', title: '礁石群落', description: '累计创建 50 篇笔记', icon: 'FileText', category: 'habit' },
  { key: 'streak_60', title: '深海守望者', description: '连续 60 天打卡', icon: 'Flame', category: 'habit' },
  { key: 'cards_200', title: '知识播撒者', description: '累计创建 200 张闪卡', icon: 'Layers', category: 'habit' },
];
