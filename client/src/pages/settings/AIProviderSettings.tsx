/**
 * AI 提供商设置页
 *
 * @ai-context: 2026-07 拆分后的组合层。网关健康指示器、能力一览、API Key
 * 模态框、余额查询、密钥入口、Ollama 本地引擎均为独立组件；连接测试见
 * useGatewayConnectionTest。
 * @ai-context: 模式语义——标准模式（GLM 免费模型）切换即持久化；高级模式
 * 需先通过模态框配置 API Key 并测试连通后才落盘，取消则回退标准模式。
 * 高级模式当前禁用（disabled），待商业化完成后启用。
 */
import { useState } from 'react';
import { Card } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Zap, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AIConfig } from '@/lib/ai/config';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useShallow } from 'zustand/react/shallow';
import { useAIGatewayHealth } from '@/hooks/useAIGatewayHealth';
import { GatewayHealthIndicator, ProviderHealthDetails } from './components/GatewayHealthIndicator';
import { AICapabilitiesList, ApiKeyModal } from './components/AICapabilitiesList';
import { OllamaSettingsSection } from './components/OllamaSettingsSection';
import { AIBalanceSection, ApiKeyLinksSection } from './components/AIBalanceSection';
import { useGatewayConnectionTest } from './hooks/useGatewayConnectionTest';

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

export default function AIProviderSettings() {
  const { toast } = useToast();

  const {
    aiConfig,
    showApiKey,
    setAIConfig,
    toggleShowApiKey,
    saveAIConfigAction,
  } = useSettingsStore(useShallow(s => s));

  const health = useAIGatewayHealth();
  const { testStatus, testMessage, runTest, reset: resetTest } = useGatewayConnectionTest();

  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);

  /** 当前模式推断：根据 provider 匹配 */
  const currentMode = modeOptions.find((m) => m.provider === aiConfig.provider) ?? modeOptions[0];

  /** 切换模式 */
  const handleModeChange = (modeKey: string) => {
    const mode = modeOptions.find((m) => m.key === modeKey);
    if (!mode) return;
    setAIConfig({ ...aiConfig, provider: mode.provider });
    // 标准模式：立即持久化；高级模式：等模态框保存时再持久化
    if (modeKey === 'standard') {
      saveAIConfigAction();
    } else {
      resetTest();
      setShowApiModal(true);
    }
  };

  /** 模态窗口取消：回退到标准模式并持久化 */
  const handleModalCancel = () => {
    setShowApiModal(false);
    setAIConfig({ ...aiConfig, provider: 'glm' as const });
    saveAIConfigAction();
  };

  /** 模态窗口保存：保存 + 自动测试连接 */
  const handleModalSave = async () => {
    saveAIConfigAction();
    await runTest(aiConfig.gatewayUrl || '');
  };

  return (
    <>
      {/* ── AI 服务配置（简化版） ── */}
      <Card padding="md" className="flex flex-col gap-kb-md">
        <div className="flex items-center justify-between">
          <h2 className="text-b1 font-semibold text-text-primary">AI 服务配置</h2>
          <GatewayHealthIndicator
            status={health.status}
            latency={health.latency}
            errorType={health.errorType}
            healthyCount={health.healthyCount}
            totalCount={health.totalCount}
            onRecheck={health.recheck}
          />
        </div>

        {/* degraded 状态 Provider 详情 */}
        {health.status === 'degraded' && <ProviderHealthDetails providers={health.providers} />}

        {/* 模式选择 */}
        <div className="flex flex-col gap-kb-sm">
          <label className="text-b2 font-medium text-text-secondary">使用模式</label>
          <div className="grid grid-cols-2 gap-3">
            {modeOptions.map(({ key, label, description, icon: Icon, disabled }) => {
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

        <AICapabilitiesList
          open={capabilitiesOpen}
          onToggle={() => setCapabilitiesOpen((v) => !v)}
        />
      </Card>

      {/* ── 高级模式 API Key 配置模态窗口 ── */}
      {showApiModal && (
        <ApiKeyModal
          apiKey={aiConfig.apiKey}
          showApiKey={showApiKey}
          testStatus={testStatus}
          testMessage={testMessage}
          onApiKeyChange={(value) => setAIConfig({ ...aiConfig, apiKey: value })}
          onToggleShowApiKey={toggleShowApiKey}
          onCancel={handleModalCancel}
          onSave={handleModalSave}
          onDone={() => {
            setShowApiModal(false);
            resetTest();
            toast({ type: 'success', message: '高级模式配置已保存' });
          }}
        />
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
