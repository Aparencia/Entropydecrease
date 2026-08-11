/**
 * 知识料理书 — 菜谱卡片
 * Knowledge cookbook — recipe card
 *
 * @ai-context: 菜谱网格卡片：类型图标 + 名称 + 描述 + 食材数/手法/耗时。
 * 点击回调由 RecipesPage 注入（详情视图）。纯展示组件，无副作用。
 * @ai-context: Recipe grid card with type icon, name, description and meta.
 * Pure presentational component; click handled by the parent page.
 */
import { Clock, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RECIPE_TYPE_META, type Recipe } from '../types';

interface RecipeCardProps {
  recipe: Recipe;
  selected: boolean;
  onClick: (recipe: Recipe) => void;
}

export function RecipeCard({ recipe, selected, onClick }: RecipeCardProps) {
  const meta = RECIPE_TYPE_META[recipe.type];
  return (
    <button
      type="button"
      onClick={() => onClick(recipe)}
      className={cn(
        'flex flex-col gap-2 rounded-2xl border p-4 text-left transition-colors',
        selected
          ? 'border-brand-400/60 bg-brand-500/8'
          : 'border-border/30 bg-bg-secondary/50 hover:border-brand-400/30 hover:bg-bg-secondary',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl" aria-hidden>{meta.icon}</span>
        <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-c2 font-medium text-text-tertiary">
          {recipe.type}
        </span>
      </div>

      <h3 className="text-b1 font-semibold text-text-primary">{recipe.name}</h3>
      {recipe.description && (
        <p className="line-clamp-2 text-c1 text-text-secondary">{recipe.description}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-c1 text-text-tertiary">
        <span className="flex items-center gap-1">
          <ListChecks className="w-3.5 h-3.5" />
          {recipe.ingredients.length} 食材 · {recipe.steps.length} 步
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {recipe.duration} 分钟
        </span>
      </div>
    </button>
  );
}
