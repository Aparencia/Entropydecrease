/**
 * @ai-context: 页面组件：LoginPage。
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('请填写邮箱和密码');
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await signIn(email.trim(), password);
      if (authError) {
        setError(authError.message);
      } else {
        navigate('/', { replace: true });
      }
    } catch {
      setError('登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

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
            <h1 className="text-h1 font-semibold text-text-primary">登录熵减</h1>
            <p className="text-b2 text-text-tertiary mt-1">登录以同步你的学习数据</p>
          </div>
        </div>

        {/* Login Card */}
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
            <div className="flex flex-col gap-1">
              <Input
                label="密码"
                type="password"
                placeholder="输入密码"
                autoComplete="current-password"
                prefix={<Lock className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="flex justify-end">
                <Link
                  to="/reset-password"
                  className="text-c1 text-text-tertiary hover:text-brand-600 transition-colors"
                >
                  忘记密码？
                </Link>
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full mt-1"
            >
              登录
            </Button>
          </form>

          {/* Footer */}
          <p className="text-b3 text-text-tertiary text-center mt-5">
            还没有账号？{' '}
            <Link
              to="/register"
              className="text-brand-600 font-medium hover:text-brand-700 transition-colors"
            >
              立即注册
            </Link>
          </p>
        </Card>

        {/* Skip link */}
        <p className="text-c1 text-text-tertiary text-center mt-5">
          <Link to="/" className="hover:text-text-secondary transition-colors">
            跳过登录，继续使用本地功能
          </Link>
        </p>
      </div>
    </div>
  );
}
