/**
 * SOP 模板列表页 — 模板卡片 + 运行历史
 * SOP template list page — template cards and run history
 *
 * @ai-context: 仪式页头 + 模板卡片网格。内置模板（builtin）只读，
 * 可复制为用户模板；用户模板可编辑/删除。开始运行跳转全屏执行器
 * /sop/run/:runId。lint 问题数量展示在卡片角标。
 * @ai-context: Ritual header + template card grid. Builtin templates are
 * read-only (copy-to-user); user templates are editable. Starting a run
 * navigates to the fullscreen runner.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Pencil, Copy, Trash2, History, Download, Upload } from 'lucide-react';
import RitualHeader from '@/features/inspiration/components/RitualHeader';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui';
import { useSopStore } from '../store/useSopStore';
import { lintSopTemplate } from '../lib/sopLint';
import { exportTemplateJson, importTemplateJson, downloadJsonFile } from '../lib/sopRepository';
import { templateTotalMinutes } from '../types';
import type { SopRunRow, SopTemplate } from '../types';

const RUN_STATUS_META: Record<SopRunRow['status'], { label: string; cls: string }> = {
  running: { label: '进行中', cls: 'bg-emerald-500/15 text-emerald-400' },
  awaiting_module: { label: '模块中', cls: 'bg-cyber/15 text-cyber' },
  completed: { label: '已完成', cls: 'bg-blue-500/15 text-blue-400' },
  aborted: { label: '已中止', cls: 'bg-rose-500/15 text-rose-400' },
};

function TemplateCard({ template, onStart, onEdit, onCopy, onDelete, onExport }: {
  template: SopTemplate;
  onStart: (t: SopTemplate) => void;
  onEdit: (t: SopTemplate) => void;
  onCopy: (t: SopTemplate) => void;
  onDelete: (t: SopTemplate) => void;
  onExport: (t: SopTemplate) => void;
}) {
  const issues = useMemo(() => lintSopTemplate(template), [template]);
  const total = templateTotalMinutes(template);
  const isBuiltin = template.source === 'builtin';

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/40 bg-bg-secondary/60 p-4 backdrop-blur-xl transition-colors hover:border-accent-400/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>{template.icon || '📋'}</span>
          <div>
            <h3 className="text-b1 font-semibold text-text-primary">{template.name}</h3>
            <p className="text-c1 text-text-tertiary">{template.category || '未分类'}</p>
          </div>
        </div>
        {isBuiltin ? (
          <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-c1 font-medium text-brand-400">内置</span>
        ) : (
          <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-c1 font-medium text-text-tertiary">自建</span>
        )}
      </div>

      <p className="line-clamp-2 text-c1 text-text-secondary">{template.description || '无描述'}</p>

      <div className="flex flex-wrap items-center gap-1.5 text-c1 text-text-tertiary">
        <span>{template.steps.length} 步</span>
        {total > 0 && <span>· 约 {total} 分钟</span>}
        {issues.length > 0 && (
          <span className="text-amber-400">· {issues.length} 条优化建议</span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-1.5 pt-2">
        <Button size="sm" variant="primary" icon={<Play className="w-3.5 h-3.5" />} onClick={() => onStart(template)}>
          开始
        </Button>
        {!isBuiltin && (
          <Button size="sm" variant="secondary" icon={<Pencil className="w-3.5 h-3.5" />} onClick={() => onEdit(template)}>
            编辑
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" icon={<Download className="w-3.5 h-3.5" />} onClick={() => onExport(template)}>
            导出
          </Button>
          {isBuiltin && (
            <Button size="sm" variant="ghost" icon={<Copy className="w-3.5 h-3.5" />} onClick={() => onCopy(template)}>
              复制
            </Button>
          )}
          {!isBuiltin && (
            <Button size="sm" variant="ghost" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => onDelete(template)}>
              删除
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SopListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { templates, runs, isLoading, loadAll, startRun, deleteTemplate, createTemplate } = useSopStore();

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleStart = async (t: SopTemplate) => {
    const runId = await startRun(t.id);
    if (runId) navigate(`/sop/run/${runId}`);
    else toast({ type: 'error', message: '启动流程失败，请重试' });
  };

  const handleCopy = async (t: SopTemplate) => {
    const id = await createTemplate({
      name: `${t.name}（副本）`,
      description: t.description,
      icon: t.icon,
      category: t.category,
      steps: t.steps.map((s) => ({
        step_type: s.step_type,
        title: s.title,
        config: { durationMinutes: s.configParsed.durationMinutes, target: s.configParsed.target, module: s.configParsed.module },
      })),
    });
    if (id) {
      toast({ type: 'success', message: '已复制为自建模板' });
      navigate(`/sop/editor/${id}`);
    } else {
      toast({ type: 'error', message: '复制失败' });
    }
  };

  const handleDelete = async (t: SopTemplate) => {
    const ok = await deleteTemplate(t.id);
    toast({ type: ok ? 'success' : 'error', message: ok ? '已删除模板' : '删除失败' });
  };

  /** 导出模板为分享文件（本地下载，不经云端） */
  const handleExport = async (t: SopTemplate) => {
    const json = await exportTemplateJson(t.id);
    if (!json) { toast({ type: 'error', message: '导出失败' }); return; }
    const safeName = t.name.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'sop-template';
    downloadJsonFile(json, `entropy-sop-${safeName}.json`);
    toast({ type: 'success', message: '已导出模板分享文件' });
  };

  /** 从分享文件导入模板（校验后入库） */
  const handleImportFile = async (file: File) => {
    const text = await file.text().catch(() => '');
    if (!text) { toast({ type: 'error', message: '读取文件失败' }); return; }
    const result = await importTemplateJson(text);
    if (result.error) { toast({ type: 'error', message: result.error }); return; }
    toast({ type: 'success', message: '模板已导入' });
    await loadAll();
    if (result.id) navigate(`/sop/editor/${result.id}`);
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-kb-lg py-kb-xl">
      <RitualHeader title="SOP 流程库" note="步骤成章 复利生长">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
            e.target.value = '';
          }}
        />
        <Button size="sm" variant="secondary" icon={<Upload className="w-3.5 h-3.5" />} onClick={() => fileInputRef.current?.click()}>
          导入
        </Button>
        <Button size="sm" variant="ai" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => navigate('/sop/editor')}>
          新建模板
        </Button>
      </RitualHeader>

      {isLoading && templates === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-bg-secondary/60" />
          ))}
        </div>
      ) : (templates ?? []).length === 0 ? (
        <div className="kb-ritual-empty py-kb-xl">
          <p className="kb-ritual-empty-title">流程尚空</p>
          <p className="kb-ritual-empty-note">创建第一个标准作业流程</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(templates ?? []).map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onStart={handleStart}
              onEdit={(tt) => navigate(`/sop/editor/${tt.id}`)}
              onCopy={handleCopy}
              onDelete={handleDelete}
              onExport={handleExport}
            />
          ))}
        </div>
      )}

      {(runs ?? []).length > 0 && (
        <section className="mt-2">
          <div className="mb-3 flex items-center gap-2">
            <History className="w-4 h-4 text-text-tertiary" />
            <h2 className="text-b2 font-semibold text-text-primary">最近执行</h2>
          </div>
          <div className="flex flex-col gap-2">
            {(runs ?? []).slice(0, 8).map((run) => {
              const template = templates?.find((t) => t.id === run.template_id);
              const meta = RUN_STATUS_META[run.status];
              return (
                <button
                  key={run.id}
                  onClick={() => run.status !== 'completed' && run.status !== 'aborted' && navigate(`/sop/run/${run.id}`)}
                  disabled={run.status === 'completed' || run.status === 'aborted'}
                  className="flex items-center gap-3 rounded-xl border border-border/30 bg-bg-secondary/40 px-4 py-2.5 text-left transition-colors hover:border-accent-400/40 disabled:cursor-default disabled:opacity-70"
                >
                  <span className="text-lg" aria-hidden>{template?.icon || '📋'}</span>
                  <span className="flex-1 truncate text-b2 text-text-primary">
                    {template?.name ?? '未知模板'}
                    <span className="ml-2 text-c1 text-text-tertiary">
                      第 {run.current_step_index + 1} 步
                    </span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-c1 font-medium ${meta.cls}`}>{meta.label}</span>
                  <span className="text-c1 text-text-tertiary">{new Date(run.started_at).toLocaleDateString()}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
