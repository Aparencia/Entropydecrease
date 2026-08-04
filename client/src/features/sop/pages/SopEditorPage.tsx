/**
 * SOP 模板编辑器 — 步骤编排 + lint 实时提示
 * SOP template editor — step orchestration with live lint
 *
 * @ai-context: 支持新建与编辑（:id?）。草稿步骤含临时 id（crypto.randomUUID），
 * 保存时经 store 重建 steps 落库。内置模板（builtin）只读——页面提示先复制，
 * 避免绕过列表页的只读约束。lint 问题实时展示在步骤区下方。
 * @ai-context: Create/edit mode driven by optional :id param; draft steps use
 * temp ids and are rebuilt on save. Builtin templates are read-only here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUp, ArrowDown, Plus, Save, Trash2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui';
import { useSopStore, STEP_TYPE_META } from '../store/useSopStore';
import { lintSopTemplate } from '../lib/sopLint';
import type { SopStepConfig, SopStepType } from '../types';

/** 编辑器草稿步骤 */
interface DraftStep {
  id: string;
  step_type: SopStepType;
  title: string;
  durationMinutes: number;
  target: string;
  module: string;
}

const STEP_TYPES: SopStepType[] = ['focus', 'review', 'break', 'module', 'output'];

function emptyDraftStep(): DraftStep {
  return { id: crypto.randomUUID(), step_type: 'focus', title: '', durationMinutes: 25, target: '', module: '' };
}

export default function SopEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { templates, loadAll, getTemplate, createTemplate, updateTemplate } = useSopStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState('');
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  // 加载模板（编辑模式）→ 填充草稿
  useEffect(() => {
    void loadAll().then(() => {
      if (!id) {
        setSteps([emptyDraftStep()]);
        setReady(true);
        return;
      }
      const t = getTemplate(id);
      if (!t) {
        toast({ type: 'error', message: '模板不存在' });
        navigate('/sop');
        return;
      }
      setName(t.name);
      setDescription(t.description);
      setIcon(t.icon);
      setCategory(t.category);
      setSteps(
        t.steps.map((s) => ({
          id: s.id,
          step_type: s.step_type,
          title: s.title,
          durationMinutes: s.configParsed.durationMinutes ?? 0,
          target: s.configParsed.target ?? '',
          module: s.configParsed.module ?? '',
        })),
      );
      setReady(true);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const editingBuiltin = useMemo(
    () => Boolean(id && templates?.find((t) => t.id === id)?.source === 'builtin'),
    [id, templates],
  );

  const patchStep = useCallback((stepId: string, changes: Partial<DraftStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...changes } : s)));
  }, []);

  const moveStep = useCallback((index: number, delta: -1 | 1) => {
    setSteps((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const removeStep = useCallback((stepId: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
  }, []);

  // lint：将草稿转为 lint 所需结构（configParsed 即时派生）
  const lintIssues = useMemo(() => {
    const draftSteps = steps.map((s) => ({
      id: s.id,
      template_id: id ?? '',
      step_type: s.step_type,
      title: s.title,
      config: '{}',
      order: 0,
      configParsed: {
        durationMinutes: s.durationMinutes || undefined,
        target: s.target || undefined,
        module: s.module || undefined,
      } as SopStepConfig,
    }));
    return lintSopTemplate({ steps: draftSteps });
  }, [steps, id]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ type: 'error', message: '请填写流程名称' });
      return;
    }
    const validSteps = steps.filter((s) => s.title.trim());
    if (validSteps.length === 0) {
      toast({ type: 'error', message: '请至少添加一个有效步骤' });
      return;
    }
    setSaving(true);
    const input = {
      name,
      description,
      icon,
      category,
      steps: validSteps.map((s) => ({
        step_type: s.step_type,
        title: s.title,
        config: {
          durationMinutes: s.durationMinutes > 0 ? s.durationMinutes : undefined,
          target: s.step_type === 'module' && s.target ? s.target : undefined,
          module: s.step_type === 'module' && s.module ? s.module : undefined,
        } as SopStepConfig,
      })),
    };
    const ok = id ? await updateTemplate(id, input) : Boolean(await createTemplate(input));
    setSaving(false);
    if (ok) {
      toast({ type: 'success', message: id ? '已保存修改' : '模板已创建' });
      navigate('/sop');
    } else {
      toast({ type: 'error', message: '保存失败，请重试' });
    }
  };

  if (!ready) return <div className="p-6 text-c1 text-text-tertiary">加载中…</div>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-kb-lg py-kb-xl">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/sop')}>
          返回
        </Button>
        <h1 className="text-b1 font-semibold text-text-primary">{id ? '编辑模板' : '新建模板'}</h1>
        {editingBuiltin && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-c1 font-medium text-amber-400">
            内置模板只读——请返回列表复制后编辑
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-border/40 bg-bg-secondary/60 p-4 backdrop-blur-xl">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Input placeholder="流程名称（如：每日复习三件事）" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="图标（emoji）" value={icon} onChange={(e) => setIcon(e.target.value)} className="w-24" />
        </div>
        <Input placeholder="描述" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input placeholder="分类（如：复习、费曼、错题）" value={category} onChange={(e) => setCategory(e.target.value)} />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-b2 font-semibold text-text-primary">步骤</h2>
          <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setSteps((prev) => [...prev, emptyDraftStep()])}>
            添加步骤
          </Button>
        </div>

        {steps.map((s, i) => (
          <div key={s.id} className="flex flex-col gap-2 rounded-xl border border-border/30 bg-bg-secondary/40 p-3">
            <div className="flex items-center gap-2">
              <span className="w-5 text-center text-c1 text-text-tertiary">{i + 1}</span>
              <select
                value={s.step_type}
                onChange={(e) => patchStep(s.id, { step_type: e.target.value as SopStepType })}
                className={`rounded-full border border-border/40 bg-bg-tertiary px-2 py-1 text-c1 font-medium focus:outline-none ${STEP_TYPE_META[s.step_type].badge}`}
              >
                {STEP_TYPES.map((t) => (
                  <option key={t} value={t}>{STEP_TYPE_META[t].label}</option>
                ))}
              </select>
              <Input
                placeholder="步骤说明（如：讲解概念 15 分钟）"
                value={s.title}
                onChange={(e) => patchStep(s.id, { title: e.target.value })}
                className="flex-1"
              />
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" disabled={i === 0} icon={<ArrowUp className="w-3.5 h-3.5" />} onClick={() => moveStep(i, -1)} />
                <Button size="sm" variant="ghost" disabled={i === steps.length - 1} icon={<ArrowDown className="w-3.5 h-3.5" />} onClick={() => moveStep(i, 1)} />
                <Button size="sm" variant="ghost" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => removeStep(s.id)} />
              </div>
            </div>
            <div className="flex items-center gap-2 pl-7">
              <label className="flex items-center gap-1.5 text-c1 text-text-tertiary">
                时长
                <input
                  type="number" min={0} max={180}
                  value={s.durationMinutes || ''}
                  onChange={(e) => patchStep(s.id, { durationMinutes: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-16 rounded-lg border border-border/40 bg-bg-tertiary px-2 py-1 text-c1 focus:outline-none"
                />
                分钟
              </label>
              {s.step_type === 'module' && (
                <>
                  <Input
                    placeholder="跳转路由（如 /flashcards）"
                    value={s.target}
                    onChange={(e) => patchStep(s.id, { target: e.target.value })}
                    className="w-44"
                  />
                  <Input
                    placeholder="模块名（如 闪卡）"
                    value={s.module}
                    onChange={(e) => patchStep(s.id, { module: e.target.value })}
                    className="w-32"
                  />
                </>
              )}
            </div>
          </div>
        ))}

        {lintIssues.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
            {lintIssues.map((issue) => (
              <p key={issue.rule} className="flex items-start gap-1.5 text-c1 text-amber-400">
                <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" />
                {issue.message}
              </p>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate('/sop')}>取消</Button>
        <Button
          variant="primary"
          icon={<Save className="w-4 h-4" />}
          loading={saving}
          disabled={editingBuiltin}
          onClick={handleSave}
        >
          保存模板
        </Button>
      </div>
    </div>
  );
}
