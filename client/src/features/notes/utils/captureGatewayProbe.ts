/**
 * 采集启动前的 AI 网关预检
 *
 * @ai-context: 从 useCaptureSession 拆出。遵循本地优先原则——网关不可用
 * 仅提示（采集与本地 OCR 照常进行），只有课后 AI 分析会受影响，因此
 * 不抛异常、不阻断启动流程。
 */
import { requireGatewayUrl } from '@/lib/ai/config';

/** 主进程音频启动返回值 */
export interface IPCAudioStartResult {
  success: boolean;
  error?: string;
}

type ToastFn = (opts: { type: 'warning'; message: string }) => void;

/** 预检 AI 网关连通性（不可用仅提示，不阻断采集） */
export async function probeGateway(toast: ToastFn): Promise<void> {
  try {
    const gatewayUrl = requireGatewayUrl();
    const healthResp = await fetch(`${gatewayUrl}/health`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    if (!healthResp.ok) {
      toast({ type: 'warning', message: 'AI网关不可用，采集可继续但课后分析可能失败' });
    }
  } catch {
    toast({ type: 'warning', message: '无法连接AI网关，请检查网络。采集仍可进行，课后分析需要网络。' });
  }
}
