/**
 * AI 插件提供者（环境选择 + 懒加载 + 鉴权注入）
 *
 * @ai-context: 从 AIPluginLoader 拆出。Electron 环境返回 ElectronAIPlugin
 * （走 IPC → 主进程，本地 Ollama 优先/云端降级），Web 环境返回
 * RemoteAIPlugin（直连 AI 网关）。Supabase access_token 缓存 60s（token 寿命约 1h，
 * 保守 TTL）避免每次 AI 调用都 getSession；supabaseClient 改静态 import 免动态开销。
 * @ai-context: 模块级懒加载单例；测试通过 vi.mock 插件模块拦截。
 */
import { RemoteAIPlugin } from './RemoteAIPlugin';
import { ElectronAIPlugin } from './ElectronAIPlugin';
import { isElectron } from '../utils/platform';
import { supabase } from '../auth/supabaseClient';
import type { AIPlugin } from './types';

let remotePlugin: RemoteAIPlugin | null = null;
let electronPlugin: ElectronAIPlugin | null = null;

// token 缓存：Supabase access_token 约 1h 有效，缓存 60s 避免每次 AI 调用都 getSession。
// TTL 远小于 token 寿命，过期风险极低；即使偏偶失效，AI 调用失败重试即可恢复。
let cachedToken: string | null = null;
let tokenCachedAt = 0;
const TOKEN_CACHE_TTL_MS = 60_000;
/** 提前刷新窗口：token 距过期不足此时长时主动 refresh，避免设备休眠唤醒后首条 AI 请求 401 */
const TOKEN_REFRESH_AHEAD_MS = 10_000;

/**
 * 获取当前 Supabase access_token（带 60s 缓存）
 * @ai-context: 从 getElectronPlugin 抽出——供渲染层需要显式透传 authToken
 * 的场景复用（如 A3 ai_progress_narrate IPC、学伴对话）。失败返回 null，调用方降级。
 * getSession 不保证返回未过期 token（设备休眠后 refresh 定时器可能失效），
 * 故在此基于 expires_at 主动 refreshSession，避免网关 401 造成"消息发送失败"。
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const now = Date.now();
    if (cachedToken === null || now - tokenCachedAt > TOKEN_CACHE_TTL_MS) {
      let session = (await supabase.auth.getSession()).data.session;
      // token 已过期或即将过期 → 主动刷新
      if (session?.expires_at && session.expires_at * 1000 <= now + TOKEN_REFRESH_AHEAD_MS) {
        const { data } = await supabase.auth.refreshSession();
        session = data.session ?? session;
      }
      cachedToken = session?.access_token ?? null;
      tokenCachedAt = now;
    }
    return cachedToken;
  } catch {
    return null;
  }
}

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
  // Supabase token 注入失败时以 null 继续，插件内部走离线降级
  electronPlugin.setAuthToken(await getAuthToken());
  return electronPlugin;
}

/**
 * 根据运行环境获取 AI 插件实例
 */
export async function getAIPlugin(): Promise<AIPlugin> {
  if (isElectron()) return await getElectronPlugin();
  return getRemotePlugin();
}
