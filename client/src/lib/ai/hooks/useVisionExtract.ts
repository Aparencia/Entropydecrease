/**
 * @ai-context: VisionExtract 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */
import { useState, useCallback } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { AIError } from '../types';
import type { VisionExtractResult } from '../types';

/**
 * AI 视觉提取 hook
 */
export function useVisionExtract() {
  const [data, setData] = useState<VisionExtractResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfig, setNeedsConfig] = useState(false);

  const extract = useCallback(async (imageBase64: string, language = 'zh') => {
    setLoading(true);
    setError(null);
    setNeedsConfig(false);
    try {
      const result = await aiPluginLoader.extractScreenContent(imageBase64, language);
      setData(result);
      return result;
    } catch (err) {
      const aiError = err instanceof AIError ? err : null;
      if (aiError?.code === 'service_unavailable') {
        setError('当前还没有配置 AI 网关地址呢，请前往设置页面配置');
        setNeedsConfig(true);
      } else {
        const msg = err instanceof Error ? err.message : '视觉提取失败';
        setError(msg);
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { extract, data, loading, error, needsConfig };
}
