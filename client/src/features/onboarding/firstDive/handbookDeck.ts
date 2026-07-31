/**
 * 《潜航员手册》自举卡组 · 纯数据
 *
 * @ai-context: 手册卡组是"产品自己教自己"的载体——新用户复习这副卡
 * 即同时学会软件用法与间隔重复方法论。卡组 ID 固定，种子写入幂等。
 * @ai-context: 版本更新机制——HANDBOOK_VERSION 递增时，seedHandbook
 * 只追加 front 不存在的新卡，绝不覆盖用户已有的复习进度。
 * 修改已发布卡片的 front 文本等于新增一张卡，需慎重。
 */

/** 固定牌组 ID（跨版本稳定，种子幂等判断依据） */
export const HANDBOOK_DECK_ID = 'builtin-handbook-deck';

/** 手册内容版本（追加新卡时 +1），存于 localStorage kb-handbook-version */
export const HANDBOOK_VERSION = 1;

export const HANDBOOK_VERSION_KEY = 'kb-handbook-version';

export const HANDBOOK_DECK_NAME = '潜航员手册';

export const HANDBOOK_DECK_DESCRIPTION =
  '沉船遗物 · 这副卡会教你如何使用熵减——当它隔几天再次浮现时，你也在亲历间隔重复的原理。';

export interface HandbookCard {
  front: string;
  back: string;
}

export const HANDBOOK_CARDS: HandbookCard[] = [
  {
    front: '「深潜」（专注番茄钟）帮你解决什么？',
    back: '把学习切成一段段可坚持的专注（如 25 分钟），专注时白噪音隔绝干扰，结束后强制短休——对抗"一学习就走神"。',
  },
  {
    front: '为什么番茄钟的休息不是浪费时间？',
    back: '大脑在休息时才完成记忆巩固。短休 5 分钟是专注循环的一部分，跳过休息反而让后续专注质量下降。',
  },
  {
    front: '「结礁」（笔记）和普通笔记软件有什么不同？',
    back: '结礁的笔记是活的：AI 可以把一段笔记一键"结晶"成闪卡，进入复习循环——记下来只是开始，记得住才是目的。',
  },
  {
    front: '一张闪卡什么时候会再次出现？',
    back: '由间隔重复算法决定：答得越熟，下次出现隔得越久（1 天 → 3 天 → 1 周…）。就像这张卡，它会在你快忘记时准时回来。',
  },
  {
    front: '「浮出水面」（费曼学习法）为什么要求你讲出来？',
    back: '能用自己的话讲清楚，才是真的懂。讲不下去的地方就是知识盲区——AI 会扮演听众帮你找到它。',
  },
  {
    front: '复习时忘了很多，正常吗？',
    back: '完全正常。遗忘是大脑的默认行为，间隔重复正是利用"快忘时复习"来加固记忆。没关系，暗流很正常。',
  },
  {
    front: '我的学习数据存在哪里？',
    back: '全部在你自己的电脑里（本地优先）。不联网也能用；云同步是可选项，由你决定。',
  },
  {
    front: '卡住了、找不到功能怎么办？',
    back: '按 Ctrl + / 随时打开帮助中心：快速上手、快捷键、模块详解、常见问题都在里面。',
  },
];
