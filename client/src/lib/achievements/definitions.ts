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
];
