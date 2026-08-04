import React, { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, isPlaceholder } from './supabaseClient';
import { useToast } from '@/components/ui';
import { cryptoManager } from '@/lib/crypto';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * 全局认证上下文，管理用户会话生命周期
 * - 监听 Supabase auth 状态变化，处理 token 自动刷新
 * - 刷新失败时派发 `kb:session-expired` 事件，由 useSessionExpiry 引导重登
 * @ai-context 核心认证状态管理，所有需鉴权的页面均依赖此 Provider
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    isAuthenticated: false,
  });

  const { toast } = useToast();
  /** 标记用户主动登出，避免将主动登出误判为 session 过期 */
  const intentionalSignOutRef = useRef(false);

  // GW-3(X1): 加密初始化接入登录生命周期——init 原无调用方，safeStorage 加密
  // 路径从未激活（敏感字段恒明文写入）。登录成功后派生设备级 AES 密钥
  //（Electron 环境经 safeStorage 加密落盘），登出/未登录时清除密钥。
  // init 失败时显式提示（已置 initFailed 标记），不静默降级为明文
  useEffect(() => {
    const userId = state.user?.id;
    if (userId) {
      cryptoManager.init(userId).catch((err) => {
        console.warn('[Auth] CryptoManager init failed, sensitive fields will be stored in plaintext:', err);
        toast({ type: 'warning', message: '本地加密初始化失败，敏感字段将以明文存储' });
      });
    } else {
      cryptoManager.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.user?.id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
        isAuthenticated: !!session,
      });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Token 刷新成功 —— 仅在之前存在 session 时提示（说明是从即将过期状态恢复）
      if (event === 'TOKEN_REFRESHED' && session) {
        toast({ type: 'info', message: '登录已自动刷新', duration: 2000 });
      }

      // 用户 metadata 更新（如昵称/头像变更），静默同步状态
      if (event === 'USER_UPDATED' && session) {
        setState({
          user: session.user,
          session,
          loading: false,
          isAuthenticated: true,
        });
        return;
      }

      // 非主动登出却丢失 session → token 刷新失败，引导重新登录
      // 仅派发事件，由 useSessionExpiry 统一弹出提示并跳转，避免重复提示用户登录
      if (event === 'SIGNED_OUT' && !intentionalSignOutRef.current) {
        window.dispatchEvent(new CustomEvent('kb:session-expired'));
      }

      // 重置主动登出标记
      if (event === 'SIGNED_OUT') {
        intentionalSignOutRef.current = false;
      }

      setState({
        user: session?.user ?? null,
        session,
        loading: false,
        isAuthenticated: !!session,
      });
    });

    return () => subscription.unsubscribe();
  // toast 实例稳定，无需加入依赖
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 邮箱注册
   * @param email 用户邮箱
   * @param password 用户密码
   * @returns 包含 AuthError 的结果对象
   */
  const signUp = useCallback(async (email: string, password: string) => {
    if (isPlaceholder) {
      return { error: { message: '云服务尚未配置，请先在 .env 中设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY' } as AuthError };
    }
    // emailRedirectTo：验证邮件链接在系统浏览器打开，桌面端无法回到应用，
    // 故落地到官网验证成功页（需同步加入 Supabase Redirect URLs 白名单，
    // 否则回退到 Site URL）
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: 'https://entropydecrease.com/verified' },
    });
    return { error };
  }, []);

  /**
   * 邮箱登录
   * @param email 用户邮箱
   * @param password 用户密码
   * @returns 包含 AuthError 的结果对象
   */
  const signIn = useCallback(async (email: string, password: string) => {
    if (isPlaceholder) {
      return { error: { message: '云服务尚未配置，请先在 .env 中设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY' } as AuthError };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  /**
   * 主动登出，标记 intentionalSignOut 以避免触发 session-expired 事件
   */
  const signOut = useCallback(async () => {
    intentionalSignOutRef.current = true;
    await supabase.auth.signOut();
  }, []);

  /**
   * 获取当前有效 access_token，供 API 请求鉴权使用
   * @returns 当前 session 的 access_token，未登录时返回 null
   */
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signUp, signIn, signOut, getAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

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
