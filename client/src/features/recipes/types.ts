/**
 * 知识料理书 — 类型定义
 * Knowledge cookbook — type definitions
 *
 * @ai-context: 把「学习」隐喻为「烹饪」：不同知识适合不同料理方式。
 * 8 种料理类型（快炒/慢炖/烘焙/腌制/发酵/拼盘/甜点/特调）对应不同
 * 学习方法论；recipes 可一键转化为 SOP 模板（features/sop），连接
 * 知识料理书与标准作业流程两个模块。
 * @ai-context: Learning as cooking — 8 recipe types map to distinct study
 * methodologies; any recipe can be converted into a runnable SOP template.
 */

/** 料理类型（学习方法论标签） / Recipe type (methodology label) */
export type RecipeType = '快炒' | '慢炖' | '烘焙' | '腌制' | '发酵' | '拼盘' | '甜点' | '特调';

/** 前置知识（食材） / Prerequisite knowledge (ingredients) */
export interface RecipeIngredient {
  title: string;
  /** 掌握程度提示（如「熟悉」「了解即可」） / Mastery hint */
  note?: string;
}

/** 单个烹饪步骤（学习方法） / A single cooking step (study method) */
export interface RecipeStep {
  title: string;
  description: string;
}

/** 知识料理配方 / A knowledge recipe */
export interface Recipe {
  id: string;
  name: string;
  type: RecipeType;
  /** 一句话描述这道菜（知识） / One-line description */
  description?: string;
  /** 前置知识（食材） / Prerequisite knowledge */
  ingredients: RecipeIngredient[];
  /** 学习方法（烹饪手法） / Study methods (cooking techniques) */
  methods: string[];
  /** 预计耗时（分钟） / Estimated duration (minutes) */
  duration: number;
  /** 烹饪步骤（转化 SOP 的步骤来源） / Steps (SOP conversion source) */
  steps: RecipeStep[];
  /** 来源 SOP 模板 ID（由菜谱转化的 SOP） / Source SOP template id */
  sourceSopId?: string;
}

/** 料理类型元信息 / Recipe type meta */
export const RECIPE_TYPE_META: Record<RecipeType, {
  icon: string;
  description: string;
}> = {
  快炒: { icon: '🍳', description: '高火快攻：短时高频，适合概念扫盲与临时突击' },
  慢炖: { icon: '🍲', description: '小火慢熬：长线沉浸，适合体系化深度学习' },
  烘焙: { icon: '🍞', description: '精准配方：结构化复现，适合公式与流程记忆' },
  腌制: { icon: '🥒', description: '反复浸渍：间隔重复，适合长期记忆固化' },
  发酵: { icon: '🫙', description: '静置转化：内化沉淀，适合需顿悟的抽象概念' },
  拼盘: { icon: '🥗', description: '多元组合：跨域联结，适合知识体系整合' },
  甜点: { icon: '🧁', description: '愉悦奖励：轻量趣味，适合碎片时间与兴趣培养' },
  特调: { icon: '🍹', description: '个性定制：情境适配，适合个人化学习方案' },
};
