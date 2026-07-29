/**
 * Supabase 客户端单例
 *
 * @ai-context: URL/ANON_KEY 由 VITE_SUPABASE_* 环境变量注入（anon key 为
 * 前端公开密钥，非泄密）。缺失时应用以离线模式运行，不得抛错阻塞启动。
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

/** 检测 Supabase 凭证是否为占位符（未配置） */
export const isPlaceholder = !supabaseUrl ||
  supabaseUrl.includes('your-project') ||
  !supabaseAnonKey ||
  supabaseAnonKey === 'your-anon-key';

/**
 * Supabase 客户端单例
 * 占位符凭证时禁用自动 session 恢复，避免向无效地址发起网络请求
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: !isPlaceholder,
    persistSession: !isPlaceholder,
    detectSessionInUrl: !isPlaceholder,
  },
});
