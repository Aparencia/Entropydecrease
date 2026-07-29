import { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Eye, EyeOff, Shield, ChevronDown, CheckCircle, Zap, Sparkles, BookOpen, Timer, Layers, Brain, Wand2, Lock, RefreshCw, Cpu, Download, HardDrive, Trash2, AlertTriangle, Wallet, ExternalLink, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AIConfig } from '@/lib/ai/config';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useShallow } from 'zustand/react/shallow';
import { useAIGatewayHealth } from '@/hooks/useAIGatewayHealth';
import { useAIBalance } from '@/hooks/useAIBalance';
import { useOllamaStatus } from '@/hooks/useOllamaStatus';
import { OLLAMA_RECOMMENDED_MODELS } from '@/types/ollama';

/** 模式预设方案 */
const modeOptions = [
  {
    key: 'standard',
    label: '标准模式',
    description: '使用免费模型（如 GLM-4-Flash），适合日常学习',
    icon: Zap,
    provider: 'glm' as AIConfig['provider'],
    disabled: false,
  },
  {
    key: 'advanced',
    label: '高级模式',
    description: '使用更强模型，适合深度分析和复杂任务',
    icon: Sparkles,
    provider: 'qwen' as AIConfig['provider'],
    disabled: true, // TODO: 暂时禁用云端模式，待商业化完成后重新启用
  },
] as const;

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

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

export default function AIProviderSettings() {
  const { toast } = useToast();

  const {
    aiConfig,
    showApiKey,
    setAIConfig,
    toggleShowApiKey,
    saveAIConfigAction,
  } = useSettingsStore(useShallow(s => s));

  const { status: healthStatus, latency, errorType, providers, healthyCount, totalCount, recheck } = useAIGatewayHealth();

  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');

  /** 当前模式推断：根据 provider 匹配 */
  const currentMode = modeOptions.find((m) => m.provider === aiConfig.provider) ?? modeOptions[0];

  /** 切换模式 */
  const handleModeChange = (modeKey: string) => {
    const mode = modeOptions.find((m) => m.key === modeKey);
    if (!mode) return;
    const nextConfig = { ...aiConfig, provider: mode.provider };
    setAIConfig(nextConfig);
    // 标准模式：立即持久化；高级模式：等模态框保存时再持久化
    if (modeKey === 'standard') {
      saveAIConfigAction();
    } else {
      setTestStatus('idle');
      setTestMessage('');
      setShowApiModal(true);
    }
  };

  /** 模态窗口取消：回退到标准模式并持久化 */
  const handleModalCancel = () => {
    setShowApiModal(false);
    const fallbackConfig = { ...aiConfig, provider: 'glm' as const };
    setAIConfig(fallbackConfig);
    saveAIConfigAction();
  };

  /** 模态窗口保存：保存 + 自动测试连接 */
  const handleModalSave = async () => {
    setTestStatus('testing');
    setTestMessage('正在测试连接...');

    // 先保存配置
    saveAIConfigAction();

    try {
      const gatewayUrl = aiConfig.gatewayUrl || '';
      if (!gatewayUrl) {
        setTestStatus('idle');
        setTestMessage('');
        toast({ type: 'error', message: '请先配置 AI 网关地址' });
        return;
      }
      const response = await fetch(`${gatewayUrl}/health/quick`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status !== 'ok' && data.status !== 'healthy') {
        throw new Error(`服务状态异常: ${data.status}`);
      }

      setTestStatus('success');
      setTestMessage('连接成功，AI 服务可用');
    } catch (err) {
      setTestStatus('idle');
      setTestMessage('');
      let message: string;
      if (err instanceof DOMException && err.name === 'AbortError') {
        message = '连接超时，请检查网关地址是否正确';
      } else if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        // Failed to fetch 在浏览器中可能是 CORS、connection refused 或 DNS 错误
        message = navigator.onLine
          ? '无法连接到网关，请检查网关地址是否正确，或确认网关服务是否已启动'
          : '网络连接已断开，请检查网络后重试';
      } else if (err instanceof TypeError && (err.message.includes('CORS') || err.message.includes('cross-origin'))) {
        message = '跨域请求被拒绝，请检查网关 CORS 配置是否允许当前来源访问';
      } else if (err instanceof Error && err.message.startsWith('HTTP ')) {
        message = `网关返回错误（${err.message}），请稍后重试`;
      } else if (err instanceof Error && err.message.startsWith('服务状态异常')) {
        message = err.message;
      } else {
        message = '连接失败，请检查网络或网关地址';
      }
      toast({ type: 'error', message });
    }
  };

  return (
    <>
      {/* ── AI 服务配置（简化版） ── */}
      <Card padding="md" className="flex flex-col gap-kb-md">
        <div className="flex items-center justify-between">
          <h2 className="text-b1 font-semibold text-text-primary">AI 服务配置</h2>

          {/* 网关健康状态指示器 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {/* 状态圆点 */}
              <span
                className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0',
                  healthStatus === 'online' && 'bg-semantic-success',
                  healthStatus === 'degraded' && 'bg-semantic-warning',
                  healthStatus === 'offline' && 'bg-semantic-error',
                  healthStatus === 'checking' && 'bg-text-quaternary animate-pulse',
                )}
              />
              {/* 状态文字 */}
              <span
                className={cn(
                  'text-c1',
                  healthStatus === 'online' && 'text-semantic-success',
                  healthStatus === 'degraded' && 'text-semantic-warning',
                  healthStatus === 'offline' && 'text-semantic-error',
                  healthStatus === 'checking' && 'text-text-quaternary',
                )}
              >
                {healthStatus === 'online' && '已连接'}
                {healthStatus === 'degraded' && (
                  healthyCount !== undefined && totalCount !== undefined
                    ? `部分可用（${healthyCount}/${totalCount} 服务在线）`
                    : '部分可用'
                )}
                {healthStatus === 'offline' && (
                  errorType === 'network_disconnected' ? '网络已断开' :
                  errorType === 'connection_refused' ? 'AI 网关服务未启动' :
                  errorType === 'timeout'            ? '连接超时' :
                  errorType === 'cors_error'         ? 'CORS 配置错误' :
                  errorType === 'server_error'       ? '服务端错误' :
                  errorType === 'dns_error'          ? 'DNS 解析错误' :
                  '未连接'
                )}
                {healthStatus === 'checking' && '检测中...'}
              </span>
              {/* 延迟显示 */}
              {(healthStatus === 'online' || healthStatus === 'degraded') && latency !== undefined && (
                <span className="text-c1 text-text-quaternary">{latency}ms</span>
              )}
            </div>
            {/* 重新检测按钮 */}
            <button
              type="button"
              onClick={recheck}
              disabled={healthStatus === 'checking'}
              className={cn(
                'p-1 rounded-kb-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated',
                'transition-colors duration-kb-fast',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                healthStatus === 'checking' && 'animate-spin',
              )}
              title="重新检测"
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* degraded 状态 Provider 详情 */}
        {healthStatus === 'degraded' && providers && (
          <div className="flex flex-col gap-1.5 p-3 rounded-kb-md bg-semantic-warning/5 border border-semantic-warning/20">
            <p className="text-c1 font-medium text-semantic-warning mb-0.5">服务可用性详情</p>
            {Object.entries(providers).map(([name, info]) => (
              <div key={name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full flex-shrink-0',
                      info.status === 'healthy' ? 'bg-semantic-success' : 'bg-semantic-error',
                    )}
                  />
                  <span className="text-c1 text-text-secondary">{name}</span>
                </div>
                <span className={cn(
                  'text-c2',
                  info.status === 'healthy' ? 'text-text-tertiary' : 'text-semantic-error',
                )}>
                  {info.status === 'healthy'
                    ? `${info.latency_ms}ms`
                    : info.error ?? '不可用'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 模式选择 */}
        <div className="flex flex-col gap-kb-sm">
          <label className="text-b2 font-medium text-text-secondary">使用模式</label>
          <div className="grid grid-cols-2 gap-3">
            {modeOptions.map(({ key, label, description, icon: Icon, provider: _, disabled }) => {
              const isActive = currentMode.key === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => !disabled && handleModeChange(key)}
                  disabled={disabled}
                  className={cn(
                    'flex flex-col items-start gap-1.5 p-3 rounded-kb-md text-left',
                    'border-2 transition-all duration-kb-fast',
                    disabled && 'opacity-50 cursor-not-allowed',
                    isActive
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/10'
                      : 'border-border/50 bg-bg-elevated hover:border-border',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      className={cn(
                        'w-icon-sm h-icon-sm',
                        isActive ? 'text-brand-600' : 'text-text-tertiary',
                      )}
                      strokeWidth={1.5}
                    />
                    <span className={cn(
                      'text-b2 font-medium',
                      isActive ? 'text-brand-700 dark:text-brand-400' : 'text-text-primary',
                    )}>
                      {label}
                    </span>
                    {disabled && (
                      <span className="text-c2 px-1.5 py-0.5 rounded-kb-sm bg-bg-tertiary text-text-quaternary">即将开放</span>
                    )}
                  </div>
                  <span className="text-c1 text-text-tertiary leading-relaxed">{description}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* AI 能力一览 */}
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setCapabilitiesOpen((v) => !v)}
            className="flex items-center justify-between w-full py-1"
          >
            <span className="text-b2 font-medium text-text-secondary">AI 能力一览</span>
            <ChevronDown
              className={cn(
                'w-4 h-4 text-text-tertiary transition-transform duration-200',
                capabilitiesOpen && 'rotate-180',
              )}
              strokeWidth={1.5}
            />
          </button>

          <div
            className={cn(
              'grid transition-all duration-300 ease-in-out',
              capabilitiesOpen ? 'grid-rows-[1fr] opacity-100 mt-kb-sm' : 'grid-rows-[0fr] opacity-0',
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

      </Card>

      {/* ── 高级模式 API Key 配置模态窗口 ── */}
      {showApiModal && (
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
                  value={aiConfig.apiKey}
                  onChange={(e) => setAIConfig({ ...aiConfig, apiKey: e.target.value })}
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
                  onClick={toggleShowApiKey}
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
                <Button
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={handleModalCancel}
                >
                  取消
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  className="flex-1"
                  onClick={handleModalSave}
                >
                  保存配置
                </Button>
              </>
            )}
            {testStatus === 'testing' && (
              <Button
                variant="primary"
                size="md"
                className="w-full"
                loading
                disabled
              >
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
                <Button
                  variant="primary"
                  size="md"
                  className="w-full"
                  onClick={() => {
                    setShowApiModal(false);
                    setTestStatus('idle');
                    setTestMessage('');
                    toast({ type: 'success', message: '高级模式配置已保存' });
                  }}
                >
                  完成
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── API 余额查询 ── */}
      <AIBalanceSection />

      {/* ── API 密钥管理快捷入口 ── */}
      <ApiKeyLinksSection />

      {/* ── 本地 AI 引擎（Ollama） ── */}
      <OllamaSettingsSection />
    </>
  );
}

// ================================================================
// API 余额查询区块
// ================================================================

function AIBalanceSection() {
  const { status, providers, fromCache, queriedAt, error, refresh } = useAIBalance();

  return (
    <Card padding="md" className="flex flex-col gap-kb-md mt-kb-md">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-icon-sm h-icon-sm text-text-secondary" strokeWidth={1.5} />
          <h2 className="text-b1 font-semibold text-text-primary">API 余额</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* 缓存标记 */}
          {status === 'success' && fromCache && (
            <span className="text-c2 text-text-quaternary">缓存</span>
          )}
          {/* 查询时间 */}
          {status === 'success' && queriedAt && (
            <span className="text-c2 text-text-quaternary">
              {new Date(queriedAt * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {/* 刷新按钮 */}
          <button
            type="button"
            onClick={refresh}
            disabled={status === 'loading'}
            className={cn(
              'p-1 rounded-kb-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated',
              'transition-colors duration-kb-fast',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            title="刷新余额"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', status === 'loading' && 'animate-spin')} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 加载中 */}
      {status === 'loading' && (
        <div className="flex items-center justify-center py-4">
          <div className="w-5 h-5 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <span className="ml-2 text-b3 text-text-tertiary">正在查询余额...</span>
        </div>
      )}

      {/* 错误状态 */}
      {status === 'error' && (
        <div className="flex items-center gap-2 p-3 rounded-kb-md bg-semantic-error/5 border border-semantic-error/20">
          <AlertTriangle className="w-icon-sm h-icon-sm text-semantic-error flex-shrink-0" strokeWidth={1.5} />
          <span className="text-b3 text-semantic-error">{error || '查询失败'}</span>
        </div>
      )}

      {/* 空闲状态（未配置网关） */}
      {status === 'idle' && (
        <p className="text-b3 text-text-tertiary py-2">
          配置 AI 网关后将自动显示各服务商的 API 余额
        </p>
      )}

      {/* 余额列表 */}
      {status === 'success' && providers.length > 0 && (
        <div className="space-y-2">
          {providers.map((p) => (
            <div
              key={p.provider}
              className="flex items-center justify-between p-3 rounded-kb-md bg-bg-elevated border border-border-default"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    p.status === 'ok' && p.supported && 'bg-semantic-success',
                    p.status === 'ok' && !p.supported && 'bg-text-quaternary',
                    p.status === 'error' && 'bg-semantic-error',
                  )}
                />
                <span className="text-b3 text-text-primary">{p.display_name}</span>
              </div>

              {/* 余额数值 */}
              {p.status === 'ok' && p.supported && p.total_balance !== null && p.total_balance !== undefined ? (
                <div className="text-right">
                  <span className={cn(
                    'text-b2 font-semibold tabular-nums',
                    p.total_balance > 10 ? 'text-semantic-success' :
                    p.total_balance > 0 ? 'text-semantic-warning' : 'text-semantic-error',
                  )}>
                    ¥{p.total_balance.toFixed(2)}
                  </span>
                  {/* 赠送/充值明细 */}
                  {p.granted_balance != null && p.topped_up_balance != null && (
                    <p className="text-c2 text-text-quaternary mt-0.5">
                      赠送 ¥{p.granted_balance.toFixed(2)} · 充值 ¥{p.topped_up_balance.toFixed(2)}
                    </p>
                  )}
                </div>
              ) : p.status === 'ok' && !p.supported ? (
                <span className="text-c1 text-text-quaternary">{p.reason || '暂不支持查询'}</span>
              ) : (
                <span className="text-c1 text-semantic-error">{p.error || '查询失败'}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 成功但无 Provider */}
      {status === 'success' && providers.length === 0 && (
        <p className="text-b3 text-text-tertiary py-2">
          未检测到已配置的 AI 服务商，请检查服务端环境变量
        </p>
      )}
    </Card>
  );
}

// ================================================================
// API 密钥管理快捷入口
// ================================================================

/** 开放平台链接配置 */
const API_PLATFORM_LINKS = [
  {
    name: '阿里云百炼',
    description: '通义千问系列模型',
    url: 'https://bailian.console.aliyun.com/cn-beijing?tab=model#/api-key',
    color: 'text-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-900/15',
  },
  {
    name: '智谱 GLM',
    description: 'GLM-4 系列免费模型',
    url: 'https://open.bigmodel.cn/usercenter/apikeys',
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/15',
  },
  {
    name: 'DeepSeek',
    description: '深度求索推理模型',
    url: 'https://platform.deepseek.com/api_keys',
    color: 'text-indigo-500',
    bg: 'bg-indigo-50 dark:bg-indigo-900/15',
  },
  {
    name: 'Google Gemini',
    description: 'Gemini 多模态模型',
    url: 'https://aistudio.google.com/app/apikey',
    color: 'text-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-900/15',
  },
];

function ApiKeyLinksSection() {
  return (
    <Card padding="md" className="flex flex-col gap-kb-md mt-kb-md">
      {/* 标题行 */}
      <div className="flex items-center gap-2">
        <KeyRound className="w-icon-sm h-icon-sm text-text-secondary" strokeWidth={1.5} />
        <h2 className="text-b1 font-semibold text-text-primary">API 密钥管理</h2>
      </div>

      <p className="text-c1 text-text-tertiary -mt-2">
        快速访问各开放平台的 API Key 管理页面，用于查看、创建或更新密钥
      </p>

      {/* 平台链接网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {API_PLATFORM_LINKS.map((platform) => (
          <a
            key={platform.name}
            href={platform.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-3 p-3 rounded-kb-md',
              'border border-border-default bg-bg-elevated',
              'hover:border-brand-300 hover:shadow-kb-sm',
              'transition-all duration-kb-fast group',
            )}
          >
            {/* 平台图标 */}
            <div className={cn(
              'w-8 h-8 rounded-kb-sm flex items-center justify-center flex-shrink-0',
              platform.bg,
            )}>
              <KeyRound className={cn('w-4 h-4', platform.color)} strokeWidth={1.5} />
            </div>

            {/* 平台信息 */}
            <div className="flex-1 min-w-0">
              <p className="text-b3 font-medium text-text-primary truncate">{platform.name}</p>
              <p className="text-c2 text-text-quaternary truncate">{platform.description}</p>
            </div>

            {/* 外链图标 */}
            <ExternalLink
              className="w-3.5 h-3.5 text-text-quaternary group-hover:text-brand-500 transition-colors flex-shrink-0"
              strokeWidth={1.5}
            />
          </a>
        ))}
      </div>

      {/* 安全提示 */}
      <div className={cn(
        'flex items-start gap-2 p-2.5 rounded-kb-md',
        'bg-semantic-success/5 border border-semantic-success/20',
      )}>
        <Shield className="w-3.5 h-3.5 text-semantic-success flex-shrink-0 mt-0.5" strokeWidth={1.5} />
        <p className="text-c1 text-text-secondary leading-relaxed">
          API Key 仅保存在本地，不会上传到任何服务器。请定期轮换密钥以确保安全。
        </p>
      </div>
    </Card>
  );
}

// ================================================================
// Ollama 本地引擎设置区块
// ================================================================

function OllamaSettingsSection() {
  const { toast } = useToast();
  const { status, config, loading, refresh, setConfig, pullModel, deleteModel, pullProgress } = useOllamaStatus();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 非 Electron 环境不显示
  if (typeof window === 'undefined' || !window.electronAPI?.ollama) return null;

  const isEnabled = config?.enabled ?? false;
  const isInstalled = status?.installed ?? false;
  const isRunning = status?.running ?? false;
  const models = status?.models ?? [];

  const handleToggle = async () => {
    if (!isInstalled) {
      toast({ type: 'info', message: '请先安装 Ollama：https://ollama.com/download' });
      return;
    }
    if (!isRunning) {
      toast({ type: 'info', message: 'Ollama 服务未运行，请启动 Ollama 后再开启' });
      return;
    }
    await setConfig({ enabled: !isEnabled });
    toast({ type: 'success', message: isEnabled ? '已关闭本地推理' : '已开启本地推理，AI 功能将优先使用本地模型' });
  };

  const handlePull = async (modelName: string) => {
    try {
      await pullModel(modelName);
      toast({ type: 'success', message: `模型 ${modelName} 下载完成` });
    } catch {
      toast({ type: 'error', message: `模型 ${modelName} 下载失败` });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteModel(deleteTarget);
      toast({ type: 'success', message: `模型 ${deleteTarget} 已删除` });
      setDeleteTarget(null);
    } catch {
      toast({ type: 'error', message: `模型 ${deleteTarget} 删除失败` });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card padding="md" className="flex flex-col gap-kb-md mt-kb-md">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-icon-sm h-icon-sm text-text-secondary" strokeWidth={1.5} />
          <h2 className="text-b1 font-semibold text-text-primary">本地 AI 引擎</h2>
        </div>
        {/* 状态指示 */}
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              isRunning && isEnabled && 'bg-semantic-success',
              isRunning && !isEnabled && 'bg-semantic-warning',
              !isRunning && isInstalled && 'bg-text-quaternary',
              !isInstalled && 'bg-semantic-error',
            )}
          />
          <span className="text-c1 text-text-tertiary">
            {!isInstalled && '未安装'}
            {isInstalled && !isRunning && '未运行'}
            {isRunning && !isEnabled && '已就绪'}
            {isRunning && isEnabled && '已启用'}
          </span>
          <button
            type="button"
            onClick={() => refresh(true)}
            disabled={loading}
            className="p-1 rounded-kb-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated transition-colors disabled:opacity-50"
            title="刷新状态"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 未安装引导 */}
      {!isInstalled && (
        <div className="p-3 rounded-kb-md bg-bg-elevated border border-border-default">
          <p className="text-b3 text-text-secondary mb-2">
            安装 Ollama 后即可使用本地模型，完全免费、无调用限制、离线可用。
          </p>
          <a
            href="https://ollama.com/download"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-b3 text-accent-default hover:underline"
          >
            <Download className="w-icon-xs h-icon-xs" strokeWidth={1.5} />
            下载 Ollama
          </a>
        </div>
      )}

      {/* 已安装：开关 + 模型管理 */}
      {isInstalled && (
        <>
          {/* 启用开关 */}
          <div className="flex items-center justify-between p-3 rounded-kb-md bg-bg-elevated">
            <div>
              <p className="text-b3 font-medium text-text-primary">优先使用本地模型</p>
              <p className="text-c1 text-text-tertiary mt-0.5">开启后 AI 功能将优先调用本地 Ollama，失败时自动降级到云端</p>
            </div>
            <button
              type="button"
              onClick={handleToggle}
              disabled={!isRunning}
              className={cn(
                'relative w-10 h-5.5 rounded-full transition-colors duration-200 flex-shrink-0',
                isEnabled && isRunning ? 'bg-accent-default' : 'bg-bg-inverted/20',
                !isRunning && 'opacity-50 cursor-not-allowed',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform duration-200',
                  isEnabled && isRunning ? 'translate-x-5' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>

          {/* 已有模型列表 */}
          {models.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-c1 font-medium text-text-tertiary">已拉取模型</p>
              {models.map((m) => (
                <div key={m} className="flex items-center gap-2 px-2 py-1.5 rounded-kb-sm bg-bg-elevated group">
                  <HardDrive className="w-icon-xs h-icon-xs text-text-quaternary" strokeWidth={1.5} />
                  <span className="text-b3 text-text-secondary font-mono flex-1">{m}</span>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(m)}
                    disabled={!isRunning}
                    className={cn(
                      'p-1 rounded-kb-sm text-text-quaternary transition-colors',
                      'hover:text-semantic-error hover:bg-semantic-error/10',
                      'opacity-0 group-hover:opacity-100',
                      !isRunning && 'cursor-not-allowed opacity-0',
                    )}
                    title="删除模型"
                  >
                    <Trash2 className="w-icon-xs h-icon-xs" strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 下载加速（镜像配置） */}
          <MirrorConfigSection config={config} setConfig={setConfig} />

          {/* 推荐模型下载 */}
          <div className="flex flex-col gap-1.5">
            <p className="text-c1 font-medium text-text-tertiary">推荐模型</p>
            {OLLAMA_RECOMMENDED_MODELS.map((model) => {
              const alreadyPulled = models.some((m) => m.startsWith(model.name.split(':')[0]));
              const isPulling = pullProgress?.model === model.name && pullProgress.status === 'downloading';
              return (
                <div key={model.name} className="flex items-center justify-between px-3 py-2 rounded-kb-md bg-bg-elevated border border-border-default">
                  <div>
                    <p className="text-b3 text-text-primary">{model.label}</p>
                    <p className="text-c1 text-text-quaternary">{model.size} · {model.requirement}</p>
                  </div>
                  {alreadyPulled ? (
                    <span className="text-c1 text-semantic-success flex items-center gap-1">
                      <CheckCircle className="w-icon-xs h-icon-xs" strokeWidth={1.5} /> 已就绪
                    </span>
                  ) : isPulling ? (
                    <span className="text-c1 text-accent-default">{pullProgress?.percent ?? 0}%</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePull(model.name)}
                      disabled={!isRunning}
                    >
                      <Download className="w-icon-xs h-icon-xs mr-1" strokeWidth={1.5} />
                      下载
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 删除确认对话框 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-kb-lg bg-bg-elevated border border-border-default shadow-kb-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-semantic-error/10">
                <AlertTriangle className="w-5 h-5 text-semantic-error" strokeWidth={1.5} />
              </span>
              <h3 className="text-b1 font-semibold text-text-primary">删除模型</h3>
            </div>
            <p className="text-b3 text-text-secondary mb-2">
              确定要删除本地模型 <code className="px-1.5 py-0.5 rounded bg-bg-default font-mono text-accent-default">{deleteTarget}</code> 吗？
            </p>
            <p className="text-c1 text-text-tertiary mb-6">
              删除后模型文件将从磁盘移除，如需再次使用需重新下载。此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                取消
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={handleDeleteConfirm}
                loading={deleting}
                disabled={deleting}
              >
                {deleting ? '删除中...' : '确认删除'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ================================================================
// 镜像加速配置区块
// ================================================================

function MirrorConfigSection({ config, setConfig }: {
  config: import('@/types/ollama').OllamaConfig | null;
  setConfig: (partial: Partial<import('@/types/ollama').OllamaConfig>) => Promise<void>;
}) {
  const [mirrorInput, setMirrorInput] = useState(config?.registryMirror ?? '');
  const [saved, setSaved] = useState(false);

  const handleSaveMirror = async () => {
    await setConfig({ registryMirror: mirrorInput.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-kb-md bg-bg-elevated border border-border-default">
      <p className="text-b3 font-medium text-text-primary">下载加速（国内镜像）</p>
      <p className="text-c1 text-text-tertiary">
        模型下载慢？填写国内镜像地址加速。保存后需重启 Ollama 生效。
      </p>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="text"
          value={mirrorInput}
          onChange={(e) => setMirrorInput(e.target.value)}
          placeholder="https://ollama-registry.aifree.site"
          className={cn(
            'flex-1 px-2.5 py-1.5 rounded-kb-sm text-b3 font-mono',
            'bg-bg-default border border-border-default',
            'text-text-primary placeholder:text-text-quaternary',
            'focus:outline-none focus:border-accent-default',
            'transition-colors duration-kb-fast',
          )}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSaveMirror}
        >
          {saved ? '已保存' : '保存'}
        </Button>
      </div>
      {mirrorInput.trim() && (
        <p className="text-c1 text-text-quaternary mt-0.5">
          需设置系统环境变量：<code className="px-1 py-0.5 rounded bg-bg-default text-accent-default">OLLAMA_REGISTRY={mirrorInput.trim()}</code>，然后重启 Ollama
        </p>
      )}
    </div>
  );
}
