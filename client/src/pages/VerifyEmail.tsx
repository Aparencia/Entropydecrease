/**
 * @ai-context: 页面组件：VerifyEmail。
 */
import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { MailCheck, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/auth/supabaseClient';

type Status = 'verifying' | 'success' | 'error';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  const [status, setStatus] = useState<Status>('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!tokenHash || type !== 'signup') {
      setStatus('error');
      setErrorMessage('无效的验证链接');
      return;
    }

    supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'signup' }).then(({ error }) => {
      if (error) {
        setStatus('error');
        setErrorMessage(error.message);
      } else {
        setStatus('success');
      }
    }).catch(() => {
      setStatus('error');
      setErrorMessage('验证失败，请稍后重试');
    });
  }, [tokenHash, type]);

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
            <MailCheck className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <h1 className="text-h1 font-semibold text-text-primary">邮箱验证</h1>
            <p className="text-b2 text-text-tertiary mt-1">
              {status === 'verifying' && '正在验证你的邮箱...'}
              {status === 'success' && '邮箱验证成功！'}
              {status === 'error' && '验证遇到问题'}
            </p>
          </div>
        </div>

        {/* Card */}
        <Card padding="lg" variant="elevated">
          <div className="flex flex-col items-center gap-4 py-2">
            {status === 'verifying' && (
              <>
                <Loader2 className="w-12 h-12 text-brand-500 animate-spin" strokeWidth={1.5} />
                <p className="text-b2 text-text-secondary text-center">
                  正在验证邮箱，请稍候...
                </p>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="w-16 h-16 rounded-kb-full bg-emerald-100 flex items-center justify-center">
                  <MailCheck className="w-8 h-8 text-emerald-600" strokeWidth={1.5} />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-b1 font-medium text-text-primary">验证成功！</p>
                  <p className="text-b2 text-text-tertiary">你的邮箱已通过验证，可以开始使用熵减了</p>
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => navigate('/', { replace: true })}
                  className="w-full mt-2"
                >
                  开始使用
                </Button>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="w-16 h-16 rounded-kb-full bg-[#F43F5E]/10 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-[#F43F5E]" strokeWidth={1.5} />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-b1 font-medium text-text-primary">验证失败</p>
                  <p className="text-b2 text-[#F43F5E]">{errorMessage || '验证链接无效或已过期'}</p>
                </div>
                <div className="flex flex-col gap-2 w-full mt-2">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => navigate('/register', { replace: true })}
                    className="w-full"
                  >
                    重新注册
                  </Button>
                </div>
              </>
            )}
          </div>

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
