/**
 * @ai-context: 页面组件：ResetPassword。重置密码采用邮箱验证码（OTP）流程：
 * 请求重置 → 邮件收 6 位验证码 → 应用内输入验证码+新密码。
 * Why: 桌面端邮件链接在系统浏览器打开、恢复会话无法回到应用（file:// 协议
 * 也无法作为 redirectTo），链接回跳模式结构性不可用，故全程留在应用内。
 * 依赖 Supabase Recovery 邮件模板包含 {{ .Token }} 验证码。
 */
import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, KeyRound, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/auth/supabaseClient';

type ViewMode = 'request' | 'reset';

export default function ResetPassword() {
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>('request');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
    };
  }, []);

  async function handleRequestReset(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('请输入注册邮箱');
      return;
    }

    setLoading(true);
    try {
      // 不传 redirectTo：验证走应用内 OTP 验证码，不依赖邮件链接跳转
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (resetError) throw resetError;
      setViewMode('reset');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '发送失败，请稍后重试';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!otpCode.trim() || otpCode.trim().length < 6) {
      setError('请输入邮件中的 6 位验证码');
      return;
    }
    if (!password || password.length < 8) {
      setError('密码长度至少 8 位');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      // 先用验证码换取恢复会话，再更新密码
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: 'recovery',
      });
      if (otpError) throw otpError;
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
      navigateTimerRef.current = setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '重置失败，请稍后重试';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
      <div className="w-full max-w-sm">
        {/* Logo & Title */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div
            className={cn(
              'w-12 h-12 rounded-kb-lg flex items-center justify-center',
              'bg-brand-600 text-white shadow-kb-md',
            )}
          >
            <Lock className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <h1 className="text-h1 font-semibold text-text-primary">
              {viewMode === 'request' ? '重置密码' : '设置新密码'}
            </h1>
            <p className="text-b2 text-text-tertiary mt-1">
              {viewMode === 'request'
                ? '输入邮箱以接收验证码'
                : `验证码已发送至 ${email}`}
            </p>
          </div>
        </div>

        {/* Card */}
        <Card padding="lg" variant="elevated">
          {success ? (
            <div className="flex flex-col items-center gap-4 py-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" strokeWidth={1.5} />
              <p className="text-b1 font-medium text-text-primary text-center">密码重置成功</p>
              <p className="text-b2 text-text-tertiary text-center">即将跳转到登录页...</p>
            </div>
          ) : (
            <>
              {error && (
                <div
                  className={cn(
                    'flex items-start gap-2 px-3 py-2.5 rounded-kb-md mb-4',
                    'bg-[#F43F5E]/10 border border-[#F43F5E]/30',
                  )}
                >
                  <AlertCircle className="w-icon-sm h-icon-sm text-[#F43F5E] flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  <p className="text-b3 text-[#F43F5E]">{error}</p>
                </div>
              )}

              {viewMode === 'request' ? (
                <form onSubmit={handleRequestReset} className="flex flex-col gap-kb-md">
                  <Input
                    label="注册邮箱"
                    type="email"
                    placeholder="your@email.com"
                    autoComplete="email"
                    prefix={<Mail className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />

                  <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-1">
                    发送验证码
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleResetPassword} className="flex flex-col gap-kb-md">
                  <Input
                    label="邮箱验证码"
                    type="text"
                    inputMode="numeric"
                    placeholder="邮件中的 6 位验证码"
                    autoComplete="one-time-code"
                    prefix={<KeyRound className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                  />

                  <Input
                    label="新密码"
                    type="password"
                    placeholder="至少 8 位"
                    autoComplete="new-password"
                    prefix={<Lock className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />

                  <Input
                    label="确认新密码"
                    type="password"
                    placeholder="再次输入密码"
                    autoComplete="new-password"
                    prefix={<Lock className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />

                  <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-1">
                    重置密码
                  </Button>

                  <button
                    type="button"
                    onClick={() => { setViewMode('request'); setError(null); }}
                    className="text-b3 text-text-tertiary hover:text-text-secondary transition-colors text-center"
                  >
                    没收到验证码？返回重新发送
                  </button>
                </form>
              )}
            </>
          )}

          {/* Footer link */}
          <div className="flex items-center justify-center gap-1.5 mt-5">
            <ArrowLeft className="w-icon-xs h-icon-xs text-text-tertiary" strokeWidth={1.5} />
            <Link
              to="/login"
              className="text-b3 text-text-tertiary hover:text-text-secondary transition-colors"
            >
              返回登录
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
