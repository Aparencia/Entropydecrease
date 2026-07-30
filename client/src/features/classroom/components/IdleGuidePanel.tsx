/**
 * IdleGuidePanel — 右侧空态"当前配置说明书"面板
 * Right-side idle guide: sonar visual + explanation cards of current selection.
 *
 * @ai-context: 采集未开始时的右侧空态。只展示"当前选中"的采集路径与模式各
 * 1 张说明卡（文案来自 constants.ts），左栏切换选项时通过 key 变化触发
 * page-fade-in 重播实现淡入切换；声呐波纹用 animate-ping 实现并遵循
 * prefers-reduced-motion（motion-reduce:animate-none）。
 * @ai-context: Idle-state panel showing ONLY the currently selected capture
 * path & mode cards; children slot hosts the CourseInfoCard at the bottom.
 */
import type { ReactNode } from 'react';
import { Radar } from 'lucide-react';
import type { CaptureMode, CapturePath } from '@/lib/capture';
import { PATH_OPTIONS, MODE_OPTIONS } from '../constants';
import type { CaptureOptionMeta } from '../constants';

interface IdleGuidePanelProps {
  capturePath: CapturePath;
  mode: CaptureMode;
  hasWindow: boolean;
  /** 底部插槽：课程信息卡等启动前配置 */
  children?: ReactNode;
}

/** 单张说明卡：图标 + 名称 + 简述徽标 + 详细说明 + 适合场景 */
function GuideCard({ meta, kind }: { meta: CaptureOptionMeta<string>; kind: string }) {
  const Icon = meta.icon;
  return (
    <div className="rounded-kb-lg border border-border/20 bg-bg-secondary/40 p-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
        <span className="text-b2 font-medium text-text-primary">{meta.label}</span>
        <span className="px-1.5 py-0.5 rounded-kb-xs bg-brand-50 text-brand-500 text-[10px] font-medium">{meta.brief}</span>
        <span className="ml-auto text-[10px] text-text-tertiary">{kind}</span>
      </div>
      <p className="mt-2 text-b3 leading-relaxed text-text-secondary">{meta.detail}</p>
      <p className="mt-1.5 text-[11px] text-text-tertiary">适合：{meta.scene}</p>
    </div>
  );
}

export function IdleGuidePanel({ capturePath, mode, hasWindow, children }: IdleGuidePanelProps) {
  const pathMeta = PATH_OPTIONS.find((p) => p.value === capturePath) ?? PATH_OPTIONS[0];
  const modeMeta = MODE_OPTIONS.find((m) => m.value === mode) ?? MODE_OPTIONS[2];

  return (
    <div className="flex flex-col items-center px-6 py-10">
      {/* 声呐待命视觉：双层波纹 + 中心雷达 */}
      <div className="relative flex items-center justify-center w-24 h-24">
        <span
          className="absolute inset-0 rounded-full bg-brand-500/10 animate-ping motion-reduce:animate-none"
          style={{ animationDuration: '2.4s' }}
        />
        <span
          className="absolute inset-3 rounded-full bg-brand-500/10 animate-ping motion-reduce:animate-none"
          style={{ animationDuration: '2.4s', animationDelay: '0.6s' }}
        />
        <span className="relative flex items-center justify-center w-12 h-12 rounded-full bg-brand-50 border border-brand-200/40">
          <Radar className="w-6 h-6 text-brand-500" strokeWidth={1.5} />
        </span>
      </div>
      <p className="mt-4 text-b2 font-medium text-text-secondary">声呐待命</p>
      <p className="mt-1 text-b3 text-text-tertiary">
        {hasWindow ? '配置就绪，点击左侧「开始回声定位」启动扫描' : '先在左侧锁定目标窗口'}
      </p>

      {/* 当前配置说明卡：key 变化触发淡入切换 */}
      <div key={`${capturePath}-${mode}`} className="page-fade-in w-full max-w-md space-y-3 mt-8">
        <GuideCard meta={pathMeta} kind="采集路径" />
        <GuideCard meta={modeMeta} kind="采集模式" />
      </div>

      {children && <div className="w-full max-w-md mt-3">{children}</div>}
    </div>
  );
}
