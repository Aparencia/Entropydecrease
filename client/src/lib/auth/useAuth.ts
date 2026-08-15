/**
 * 认证上下文与 useAuth Hook（自 AuthContext.tsx 拆出）
 *
 * @ai-context 认证核心：AuthContext + useAuth 从组件文件移出（react-refresh：
 * 组件文件只导出组件），AuthProvider 组件保留在 AuthContext.tsx；所有需鉴权的
 * 页面依赖此上下文。
 */
import { createContext, useContext } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
}

export interface AuthContextValue extends AuthState {
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * 获取全局认证上下文的 Hook
 * @returns AuthContextValue
 * @throws 在 AuthProvider 外部调用时抛出错误
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
