/**
 * AI 能力一览（折叠）与高级模式 API Key 配置模态框
 *
 * @ai-context: 从 AIProviderSettings 拆出。能力一览按模块（结礁/深潜/
 * 反衰减呼吸/浮出水面/通用增强）罗列 AI 功能，用 grid-rows 过渡实现平滑折叠。
 * 模态框三态：idle 输入+保存、testing 连通性测试中、success 展示结果；
 * API Key 明文/密文切换，且明确告知仅本地保存不上传。
 */
import { Button } from '@/components/ui';
import {
  Eye, EyeOff, Shield, ChevronDown, CheckCircle,
  BookOpen, Timer, Layers, Brain, Wand2, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** AI 能力一览数据 */
const aiCapabilities = [
  {
    module: '结礁',
    icon: BookOpen,
    features: [
      { name: 'AI 摘要', desc: '一键提炼结礁核心要点' },
      { name: 'AI 反衰减呼吸生成', desc: '从结礁自动生成记忆卡片' },
    ],
  },
  {
    module: '深潜',
    icon: Timer,
    features: [
      { name: 'AI 时长预测', desc: '根据内容智能预估所需时间' },
      { name: 'AI 锚点', desc: '专注过程中的智能节点标记' },
      { name: 'AI 救援', desc: '分心时智能提醒拉回注意力' },
    ],
  },
  {
    module: '反衰减呼吸',
    icon: Layers,
    features: [
      { name: 'AI 优化卡片', desc: '自动优化问答内容与表述' },
    ],
  },
  {
    module: '浮出水面',
    icon: Brain,
    features: [
      { name: 'AI 提问', desc: '苏格拉底式引导深度思考' },
      { name: 'AI 评估回答', desc: '智能评估理解程度并给出反馈' },
    ],
  },
  {
    module: '通用增强',
    icon: Wand2,
    features: [
      { name: '内容智能分类', desc: '自动为笔记和灵感打标签' },
      { name: '排序灵感', desc: 'AI 推荐最优学习顺序' },
      { name: '学习评估', desc: '阶段性学习效果智能分析' },
    ],
  },
];

export function AICapabilitiesList({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full py-1"
      >
        <span className="text-b2 font-medium text-text-secondary">AI 能力一览</span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-text-tertiary transition-transform duration-200',
            open && 'rotate-180',
          )}
          strokeWidth={1.5}
        />
      </button>

      <div
        className={cn(
          'grid transition-all duration-300 ease-in-out',
          open ? 'grid-rows-[1fr] opacity-100 mt-kb-sm' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3">
            {aiCapabilities.map(({ module, icon: Icon, features }) => (
              <div key={module} className="flex gap-3">
                <div className="w-7 h-7 rounded-kb-sm bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-3.5 h-3.5 text-brand-500" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-b3 font-medium text-text-primary">{module}</p>
                  <div className="mt-0.5 space-y-0.5">
                    {features.map((f) => (
                      <p key={f.name} className="text-c1 text-text-tertiary leading-relaxed">
                        <span className="text-text-secondary font-medium">{f.name}</span>
                        <span className="mx-1">·</span>
                        {f.desc}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export type TestStatus = 'idle' | 'testing' | 'success' | 'error';

export interface ApiKeyModalProps {
  apiKey: string;
  showApiKey: boolean;
  testStatus: TestStatus;
  testMessage: string;
  onApiKeyChange: (value: string) => void;
  onToggleShowApiKey: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDone: () => void;
}

export function ApiKeyModal({
  apiKey, showApiKey, testStatus, testMessage,
  onApiKeyChange, onToggleShowApiKey, onCancel, onSave, onDone,
}: ApiKeyModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-md mx-4 p-6 rounded-kb-lg bg-bg-card border border-border/50 shadow-2xl flex flex-col gap-kb-md">
        {/* 标题 */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-kb-md bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
            <Lock className="w-5 h-5 text-brand-500" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-b1 font-semibold text-text-primary">高级模式配置</h3>
            <p className="text-c1 text-text-tertiary">请输入 API Key 以使用高级模型</p>
          </div>
        </div>

        {/* API Key 输入 */}
        <div className="flex flex-col gap-kb-sm">
          <label className="text-b2 font-medium text-text-secondary">API Key</label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="请输入 API Key"
              autoFocus
              className={cn(
                'w-full px-3 py-2.5 pr-10 rounded-kb-md text-b2',
                'bg-bg-elevated border-2 border-border/50 text-text-primary',
                'placeholder:text-text-quaternary',
                'focus:outline-none focus:border-brand-500',
                'transition-colors duration-kb-fast',
              )}
            />
            <button
              type="button"
              onClick={onToggleShowApiKey}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
              tabIndex={-1}
            >
              {showApiKey
                ? <EyeOff className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
                : <Eye className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        {/* 安全提示 */}
        <div className={cn(
          'flex items-start gap-2 p-2.5 rounded-kb-md',
          'bg-semantic-success/5 border border-semantic-success/20',
        )}>
          <Shield className="w-3.5 h-3.5 text-semantic-success flex-shrink-0 mt-0.5" strokeWidth={1.5} />
          <p className="text-c1 text-text-secondary leading-relaxed">
            API Key 仅保存在本地，不会上传到任何服务器。
          </p>
        </div>

        {/* 操作按钮 */}
        {testStatus === 'idle' && (
          <>
            <Button variant="secondary" size="md" className="flex-1" onClick={onCancel}>
              取消
            </Button>
            <Button variant="primary" size="md" className="flex-1" onClick={onSave}>
              保存配置
            </Button>
          </>
        )}
        {testStatus === 'testing' && (
          <Button variant="primary" size="md" className="w-full" loading disabled>
            正在测试连接...
          </Button>
        )}
        {testStatus === 'success' && (
          <>
            <div className={cn(
              'flex items-center gap-2 p-2.5 rounded-kb-md',
              'bg-semantic-success/5 border border-semantic-success/20',
            )}>
              <CheckCircle className="w-icon-sm h-icon-sm text-semantic-success flex-shrink-0" strokeWidth={1.5} />
              <span className="text-b3 text-semantic-success">{testMessage}</span>
            </div>
            <Button variant="primary" size="md" className="w-full" onClick={onDone}>
              完成
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
