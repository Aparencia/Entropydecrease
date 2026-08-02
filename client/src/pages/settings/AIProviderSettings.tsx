/**
 * AI 提供商设置页
 *
 * @ai-context: 2026-07 拆分后的组合层。网关健康指示器、能力一览、余额查询、
 * Ollama 本地引擎、本地 ASR 均为独立组件。
 * @ai-context: 用户自带 API Key（BYOK）能力已移除——AI 能力统一由服务端网关
 * （服务端配置 Key）与本地 AI（Ollama 推理 / sherpa-onnx ASR）提供，用户侧无需
 * 也无法再配置自定义 Key，故高级模式与 API Key 模态框整体删除。
 */
import { useState } from 'react';
import { Card } from '@/components/ui';
import { useAIGatewayHealth } from '@/hooks/useAIGatewayHealth';
import { GatewayHealthIndicator, ProviderHealthDetails } from './components/GatewayHealthIndicator';
import { AICapabilitiesList } from './components/AICapabilitiesList';
import { OllamaSettingsSection } from './components/OllamaSettingsSection';
import { AsrSettingsSection } from './components/AsrSettingsSection';
import { AIBalanceSection } from './components/AIBalanceSection';

export default function AIProviderSettings() {
  const health = useAIGatewayHealth();
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);

  return (
    <>
      {/* ── AI 服务配置 ── */}
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

        <AICapabilitiesList
          open={capabilitiesOpen}
          onToggle={() => setCapabilitiesOpen((v) => !v)}
        />
      </Card>

      {/* ── API 余额查询 ── */}
      <AIBalanceSection />

      {/* ── 本地 AI 引擎（Ollama） ── */}
      <OllamaSettingsSection />

      {/* ── 本地语音识别（ASR） ── */}
      <AsrSettingsSection />
    </>
  );
}
