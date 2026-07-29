/**
 * AI 网关连接测试 hook（高级模式保存时使用）
 *
 * @ai-context: 从 AIProviderSettings 拆出。命中 /health/quick 判定服务
 * 可用性（8s 超时）；异常按类型给出可操作提示——AbortError=超时、
 * Failed to fetch 需结合 navigator.onLine 区分"本机断网"与"网关不可达"、
 * CORS/HTTP 状态码/服务状态异常各自独立文案。测试失败保持 idle 态让用户
 * 可修改后重试。
 */
import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import type { TestStatus } from '../components/AICapabilitiesList';

/** 将连接异常转为用户可操作的中文提示 */
function describeTestError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return '连接超时，请检查网关地址是否正确';
  }
  if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
    // Failed to fetch 在浏览器中可能是 CORS、connection refused 或 DNS 错误
    return navigator.onLine
      ? '无法连接到网关，请检查网关地址是否正确，或确认网关服务是否已启动'
      : '网络连接已断开，请检查网络后重试';
  }
  if (err instanceof TypeError && (err.message.includes('CORS') || err.message.includes('cross-origin'))) {
    return '跨域请求被拒绝，请检查网关 CORS 配置是否允许当前来源访问';
  }
  if (err instanceof Error && err.message.startsWith('HTTP ')) {
    return `网关返回错误（${err.message}），请稍后重试`;
  }
  if (err instanceof Error && err.message.startsWith('服务状态异常')) {
    return err.message;
  }
  return '连接失败，请检查网络或网关地址';
}

export function useGatewayConnectionTest() {
  const { toast } = useToast();
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');

  const reset = useCallback(() => {
    setTestStatus('idle');
    setTestMessage('');
  }, []);

  /** 测试网关连通性；失败时回到 idle 并 toast 提示 */
  const runTest = useCallback(async (gatewayUrl: string) => {
    setTestStatus('testing');
    setTestMessage('正在测试连接...');

    try {
      if (!gatewayUrl) {
        reset();
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
      reset();
      toast({ type: 'error', message: describeTestError(err) });
    }
  }, [toast, reset]);

  return { testStatus, testMessage, runTest, reset };
}
