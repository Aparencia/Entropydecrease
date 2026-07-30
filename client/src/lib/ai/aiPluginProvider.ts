/**
 * AI 插件提供者（环境选择 + 懒加载 + 鉴权注入）
 *
 * @ai-context: 从 AIPluginLoader 拆出。Electron 环境返回 ElectronAIPlugin
 * （走 IPC → 主进程，本地 Ollama 优先/云端降级），Web 环境返回
 * RemoteAIPlugin（直连 AI 网关）。每次获取 Electron 插件都会刷新
 * Supabase access_token（token 会过期，不可缓存注入结果）。
 * @ai-context: 模块级懒加载单例；测试通过 vi.mock 插件模块拦截。
 */
import { RemoteAIPlugin } from './RemoteAIPlugin';
import { ElectronAIPlugin } from './ElectronAIPlugin';
import { isElectron } from '../utils/platform';
import type { AIPlugin } from './types';

let remotePlugin: RemoteAIPlugin | null = null;
let electronPlugin: ElectronAIPlugin | null = null;

/**
 * 获取远程 AI 插件实例（懒加载）
 */
export function getRemotePlugin(): RemoteAIPlugin {
  if (!remotePlugin) {
    remotePlugin = new RemoteAIPlugin();
  }
  return remotePlugin;
}

/**
 * 获取 Electron AI 插件实例（懒加载）
 * 自动从 Supabase session 注入 authToken
 */
export async function getElectronPlugin(): Promise<ElectronAIPlugin> {
  if (!electronPlugin) {
    electronPlugin = new ElectronAIPlugin();
  }
  try {
    const { supabase } = await import('../auth/supabaseClient');
    const { data: { session } } = await supabase.auth.getSession();
    electronPlugin.setAuthToken(session?.access_token ?? null);
  } catch {
    // Supabase token injection failed, proceed with null token
  }
  return electronPlugin;
}

/**
 * 根据运行环境获取 AI 插件实例
 */
export async function getAIPlugin(): Promise<AIPlugin> {
  if (isElectron()) return await getElectronPlugin();
  return getRemotePlugin();
}
