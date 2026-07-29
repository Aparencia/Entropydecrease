/**
 * @ai-context: 页面组件：RegisterPage。
 */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/AuthContext';

export default function RegisterPage() {
  const { signUp } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('请填写所有字段');
      return;
    }

    if (password.length < 6) {
      setError('密码长度至少为 6 位');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await signUp(email.trim(), password);
      if (authError) {
        setError(authError.message);
      } else {
        setSuccess(true);
      }
    } catch {
      setError('注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
        {/* 双世界沉浸式背景（深海意识 / 晨曦觉醒，随主题自适应） */}
        <div className="absolute inset-0 bg-bg-primary kb-immersive-bg" aria-hidden="true" />
        <div className="relative w-full max-w-sm">
          <Card padding="lg" variant="elevated">
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div
                className={cn(
                  'w-12 h-12 rounded-kb-full flex items-center justify-center',
                  'bg-emerald-500/10 text-emerald-500',
                )}
              >
                <CheckCircle className="w-6 h-6" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="text-h2 font-semibold text-text-primary">注册成功</h2>
                <p className="text-b2 text-text-tertiary mt-1.5 leading-relaxed">
                  验证邮件已发送至<br />
                  <span className="text-brand-600 font-medium">{email}</span>
                </p>
                <p className="text-b3 text-text-tertiary mt-3">
                  请查收邮件并点击链接完成验证，之后即可登录。
                </p>
              </div>
              <Link to="/login">
                <Button variant="primary" size="md" className="mt-2">
                  前往登录
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      {/* 双世界沉浸式背景（深海意识 / 晨曦觉醒，随主题自适应） */}
      <div className="absolute inset-0 bg-bg-primary kb-immersive-bg" aria-hidden="true" />

      <div className="relative w-full max-w-sm">
        {/* Logo & Title */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div
            className={cn(
              'w-14 h-14 rounded-kb-lg flex items-center justify-center',
              'bg-gradient-to-br from-brand-500 to-brand-600 text-white',
              'shadow-kb-lg ring-1 ring-white/20',
            )}
          >
            <span className="text-h1 font-bold">课</span>
          </div>
          <div className="text-center">
            <h1 className="text-h1 font-semibold text-text-primary">注册熵减</h1>
            <p className="text-b2 text-text-tertiary mt-1">创建账号以同步学习数据</p>
          </div>
        </div>

        {/* Register Card */}
        <Card padding="lg" variant="elevated">
          <form onSubmit={handleSubmit} className="flex flex-col gap-kb-md">
            {/* Error Banner */}
            {error && (
              <div
                className={cn(
                  'flex items-start gap-2 px-3 py-2.5 rounded-kb-md',
                  'bg-[#F43F5E]/10 border border-[#F43F5E]/30',
                )}
              >
                <AlertCircle className="w-icon-sm h-icon-sm text-[#F43F5E] flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                <p className="text-b3 text-[#F43F5E]">{error}</p>
              </div>
            )}

            {/* Email */}
            <Input
              label="邮箱"
              type="email"
              placeholder="your@email.com"
              autoComplete="email"
              prefix={<Mail className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {/* Password */}
            <Input
              label="密码"
              type="password"
              placeholder="至少 6 位"
              autoComplete="new-password"
              prefix={<Lock className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {/* Confirm Password */}
            <Input
              label="确认密码"
              type="password"
              placeholder="再次输入密码"
              autoComplete="new-password"
              prefix={<Lock className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={
                confirmPassword && confirmPassword !== password
                  ? '两次输入的密码不一致'
                  : undefined
              }
            />

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full mt-1"
            >
              注册
            </Button>
          </form>

          {/* Footer */}
          <p className="text-b3 text-text-tertiary text-center mt-5">
            已有账号？{' '}
            <Link
              to="/login"
              className="text-brand-600 font-medium hover:text-brand-700 transition-colors"
            >
              立即登录
            </Link>
          </p>
        </Card>

        {/* Skip link */}
        <p className="text-c1 text-text-tertiary text-center mt-5">
          <Link to="/" className="hover:text-text-secondary transition-colors">
            跳过注册，继续使用本地功能
          </Link>
        </p>
      </div>
    </div>
  );
}
