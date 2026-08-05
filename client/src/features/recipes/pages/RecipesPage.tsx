/**
 * 知识料理书页
 * Knowledge cookbook page
 *
 * @ai-context: 菜谱网格 + 类型筛选 + 详情视图 + 「转化为 SOP」。
 * 转化走 useSopStore.createTemplate（经 sopRepository 单事务写入
 * sopTemplates/sopSteps），成功后跳转 SOP 编辑器。菜谱为静态内置
 * 数据（DEFAULT_RECIPES），后续可扩展为可编辑库。
 * @ai-context: Recipe grid + type filter + detail view + "convert to SOP"
 * (via useSopStore.createTemplate, then navigates to the SOP editor).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, Flame, Clock, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import RitualHeader from '@/features/inspiration/components/RitualHeader';
import { Button, useToast } from '@/components/ui';
import { RecipeCard } from '../components/RecipeCard';
import { DEFAULT_RECIPES, recipeToSopInput } from '../lib/recipeTemplates';
import { RECIPE_TYPE_META, type Recipe, type RecipeType } from '../types';
import { useSopStore } from '@/features/sop/store/useSopStore';

const ALL_TYPES: Array<RecipeType | '全部'> = ['全部', '快炒', '慢炖', '烘焙', '腌制', '发酵', '拼盘', '甜点', '特调'];

export default function RecipesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createTemplate = useSopStore((s) => s.createTemplate);
  const [filter, setFilter] = useState<RecipeType | '全部'>('全部');
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [converting, setConverting] = useState(false);

  const filtered = useMemo(
    () => (filter === '全部' ? DEFAULT_RECIPES : DEFAULT_RECIPES.filter((r) => r.type === filter)),
    [filter],
  );

  /** 转化为 SOP：菜谱步骤 → SOP 步骤（output/focus），单事务入库 */
  const handleConvertToSop = async (recipe: Recipe) => {
    setConverting(true);
    try {
      const id = await createTemplate(recipeToSopInput(recipe));
      if (id) {
        toast({ type: 'success', message: `「${recipe.name}」已转化为 SOP 模板` });
        navigate(`/sop/editor/${id}`);
      } else {
        toast({ type: 'error', message: '转化失败，请重试' });
      }
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-kb-lg py-kb-xl">
      <RitualHeader title="知识料理书" note="火候到了 知识熟了" />

      {/* 类型筛选 / Type filter */}
      <div className="flex flex-wrap items-center gap-2">
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter(t)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-c1 font-medium transition-colors',
              filter === t
                ? 'bg-brand-500/15 text-brand-400'
                : 'bg-bg-secondary/60 text-text-tertiary hover:text-text-secondary',
            )}
          >
            {t !== '全部' && <span aria-hidden>{RECIPE_TYPE_META[t as RecipeType].icon}</span>}
            {t}
          </button>
        ))}
      </div>

      {/* 菜谱网格 / Recipe grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((r) => (
          <RecipeCard
            key={r.id}
            recipe={r}
            selected={selected?.id === r.id}
            onClick={setSelected}
          />
        ))}
      </div>

      {/* 详情视图 / Detail view */}
      {selected && (
        <RecipeDetail
          recipe={selected}
          converting={converting}
          onConvert={() => handleConvertToSop(selected)}
        />
      )}
    </div>
  );
}

/** 菜谱详情（食材/手法/步骤） / Recipe detail */
function RecipeDetail({ recipe, converting, onConvert }: {
  recipe: Recipe;
  converting: boolean;
  onConvert: () => void;
}) {
  const meta = RECIPE_TYPE_META[recipe.type];
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border/40 bg-bg-secondary/60 p-5 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-3xl" aria-hidden>{meta.icon}</span>
          <div>
            <h2 className="text-b1 font-semibold text-text-primary">{recipe.name}</h2>
            <p className="mt-0.5 text-c1 text-text-tertiary">{meta.description}</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ai"
          icon={<ArrowRightLeft className="w-3.5 h-3.5" />}
          onClick={onConvert}
          disabled={converting}
        >
          {converting ? '转化中…' : '转化为 SOP'}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {/* 前置知识（食材） / Ingredients */}
        <div className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-1.5 text-b3 font-medium text-text-secondary">
            <Flame className="w-3.5 h-3.5" /> 前置知识（食材）
          </h3>
          <ul className="flex flex-col gap-1 text-c1 text-text-secondary">
            {recipe.ingredients.map((ing) => (
              <li key={ing.title} className="flex items-baseline gap-1.5">
                <span className="text-text-primary">{ing.title}</span>
                {ing.note && <span className="text-text-tertiary">· {ing.note}</span>}
              </li>
            ))}
          </ul>
        </div>

        {/* 学习方法（手法） / Methods */}
        <div className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-1.5 text-b3 font-medium text-text-secondary">
            <ChefHat className="w-3.5 h-3.5" /> 学习方法（手法）
          </h3>
          <ul className="flex flex-col gap-1 text-c1 text-text-secondary">
            {recipe.methods.map((m) => (
              <li key={m} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-brand-400/60" aria-hidden />
                {m}
              </li>
            ))}
          </ul>
        </div>

        {/* 步骤 / Steps */}
        <div className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-1.5 text-b3 font-medium text-text-secondary">
            <Clock className="w-3.5 h-3.5" /> 步骤（约 {recipe.duration} 分钟）
          </h3>
          <ol className="flex flex-col gap-1.5 text-c1 text-text-secondary">
            {recipe.steps.map((s, i) => (
              <li key={s.title} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-c2 font-medium text-brand-400">
                  {i + 1}
                </span>
                <span>
                  <span className="font-medium text-text-primary">{s.title}</span>
                  <span className="text-text-tertiary"> — {s.description}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
