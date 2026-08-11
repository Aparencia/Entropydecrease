/**
 * 知识料理书 — 内置菜谱模板
 * Knowledge cookbook — built-in recipe templates
 *
 * @ai-context: 8 种料理类型各配一道示例「菜谱」（静态数据，无副作用）。
 * recipeToSopInput 把菜谱步骤映射为 SOP 步骤（最后一步为 output 复盘，
 * 其余为 focus 专注），供「转化为 SOP」按钮调用 sopRepository.createTemplate。
 * @ai-context: One sample recipe per cooking type (static data). The SOP
 * builder maps recipe steps to SOP steps (last → output, rest → focus).
 */
import type { SopStepConfig, SopStepType } from '@/features/sop/types';
import type { Recipe, RecipeType } from '../types';

/** 转化 SOP 的输入结构（与 sopRepository.createTemplate 参数结构对齐） */
export interface RecipeSopInput {
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  steps: Array<{ step_type: SopStepType; title: string; config: SopStepConfig }>;
}

/** 内置示例菜谱 / Built-in sample recipes */
export const DEFAULT_RECIPES: Recipe[] = [
  {
    id: 'recipe-stir-fry',
    name: '五分钟概念爆炒',
    type: '快炒',
    description: '考前/开会前快速扫盲：用闪卡火力全开，把陌生概念炒熟。',
    ingredients: [
      { title: '待学概念清单', note: '5-10 个' },
      { title: '卡片模板', note: '熟悉' },
    ],
    methods: ['闪卡速记', '自我测验', '即时纠错'],
    duration: 25,
    steps: [
      { title: '列概念清单', description: '把要扫盲的概念写成 5-10 张卡片' },
      { title: '闪卡快攻', description: '进入闪卡复习，答错的立即回炉' },
      { title: '自测收尾', description: '不看答案复述一遍全部概念' },
    ],
  },
  {
    id: 'recipe-slow-cook',
    name: '深度学习慢炖锅',
    type: '慢炖',
    description: '体系化课程/大部头：一个番茄一个主题，文火慢炖出体系。',
    ingredients: [
      { title: '课程章节', note: '体系化材料' },
      { title: '番茄钟', note: '熟悉' },
    ],
    methods: ['番茄深潜', '结礁笔记', '费曼输出'],
    duration: 90,
    steps: [
      { title: '章节深潜', description: '一个番茄专注一章，边读边记' },
      { title: '结礁整理', description: '把笔记整理成结构化文档' },
      { title: '费曼复盘', description: '把整章讲给自己听，找出漏洞' },
    ],
  },
  {
    id: 'recipe-bake',
    name: '公式烘焙坊',
    type: '烘焙',
    description: '数学/物理公式、代码模式：精准复现，一次烤熟。',
    ingredients: [
      { title: '公式/模式清单', note: '含推导过程' },
      { title: '例题', note: '3 道以上' },
    ],
    methods: ['结构化模板', '例题推导', '默写复现'],
    duration: 45,
    steps: [
      { title: '拆解公式', description: '把公式拆成符号 + 含义 + 适用条件' },
      { title: '例题演练', description: '按模板逐题推导，标注关键步骤' },
      { title: '闭卷默写', description: '不看笔记默写公式与推导链' },
    ],
  },
  {
    id: 'recipe-pickle',
    name: '记忆腌菜坛',
    type: '腌制',
    description: '长期记忆固化：间隔重复腌入味，到期自动回锅。',
    ingredients: [
      { title: '已学卡片', note: '10 张以上' },
      { title: '复习计划', note: '了解' },
    ],
    methods: ['间隔重复', '错题复盘', '黄金错误追踪'],
    duration: 30,
    steps: [
      { title: '到期复习', description: '完成今日到期卡片的复习' },
      { title: '错题回炉', description: '把答错的卡片重新腌一遍' },
      { title: '信心标记', description: '为每张卡标记掌握信心' },
    ],
  },
  {
    id: 'recipe-ferment',
    name: '顿悟发酵罐',
    type: '发酵',
    description: '抽象概念/难题：先浸泡再搁置，等灵感自然发酵。',
    ingredients: [
      { title: '疑难问题', note: '1-2 个' },
      { title: '背景材料', note: '了解即可' },
    ],
    methods: ['问题浸泡', '间隔搁置', '灵感捕捉'],
    duration: 60,
    steps: [
      { title: '问题浸泡', description: '通读背景材料，把问题写进灵感收集' },
      { title: '间隔搁置', description: '离开问题，交给潜意识发酵' },
      { title: '灵感捕捉', description: '回来重读，记录新涌现的解法' },
    ],
  },
  {
    id: 'recipe-platter',
    name: '跨域知识拼盘',
    type: '拼盘',
    description: '多学科整合：把零散知识拼成一盘，吃出体系感。',
    ingredients: [
      { title: '多来源笔记', note: '2 个主题以上' },
      { title: '思维导图工具', note: '熟悉' },
    ],
    methods: ['主题联想', '图谱连线', '知识迁移'],
    duration: 45,
    steps: [
      { title: '主题拼盘', description: '把不同来源的知识按主题摆盘' },
      { title: '连线找关系', description: '在概念图上画跨域关联' },
      { title: '迁移总结', description: '总结一个可迁移的心智模型' },
    ],
  },
  {
    id: 'recipe-dessert',
    name: '碎片甜点盒',
    type: '甜点',
    description: '通勤/排队碎片时间：轻量开味，保持学习手感。',
    ingredients: [
      { title: '迷你卡片组', note: '5 张以内' },
      { title: '碎片时间', note: '5-15 分钟' },
    ],
    methods: ['迷你复习', '语音笔记', '随手收集'],
    duration: 10,
    steps: [
      { title: '迷你复习', description: '刷 5 张到期的轻量卡片' },
      { title: '随手收集', description: '把闪过的灵感记进萤火海沟' },
    ],
  },
  {
    id: 'recipe-cocktail',
    name: '个人学习特调',
    type: '特调',
    description: '针对当下目标定制：按需调配各模块，最适合自己。',
    ingredients: [
      { title: '当前学习目标', note: '明确' },
      { title: '可用时间', note: '评估' },
    ],
    methods: ['目标拆解', '模块组合', '节奏调优'],
    duration: 40,
    steps: [
      { title: '定目标', description: '写下今天要攻克的唯一目标' },
      { title: '配模块', description: '按目标挑选番茄/闪卡/费曼组合' },
      { title: '执行调优', description: '执行后记录节奏感受，明天微调' },
    ],
  },
];

/**
 * 菜谱 → SOP 输入映射
 * 最后一步转为 output（产出复盘），其余转为 focus（专注），
 * 时长按步骤均摊（每步最少 5 分钟）。
 */
export function recipeToSopInput(recipe: Recipe): RecipeSopInput {
  const perStep = Math.max(5, Math.round(recipe.duration / Math.max(1, recipe.steps.length)));
  return {
    name: recipe.name,
    description: recipe.description ?? `${RECIPE_TYPE_LABEL(recipe.type)}：${recipe.methods.join(' / ')}`,
    icon: recipeTypeIcon(recipe.type),
    category: '知识料理',
    steps: recipe.steps.map((s, i) => ({
      step_type: i === recipe.steps.length - 1 ? ('output' as const) : ('focus' as const),
      title: s.title,
      config: { durationMinutes: perStep },
    })),
  };
}

/** 料理类型图标 / Recipe type icon */
export function recipeTypeIcon(type: RecipeType): string {
  return typeIconMap[type];
}

const typeIconMap: Record<RecipeType, string> = {
  快炒: '🍳', 慢炖: '🍲', 烘焙: '🍞', 腌制: '🥒',
  发酵: '🫙', 拼盘: '🥗', 甜点: '🧁', 特调: '🍹',
};

/** 料理类型标签（转化 SOP 描述用） / Recipe type label */
export function RECIPE_TYPE_LABEL(type: RecipeType): string {
  return type;
}
