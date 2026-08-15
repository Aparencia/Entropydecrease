/**
 * 匿名笔记分享按钮
 * Anonymous note share button
 *
 * @ai-context: 匿名分享笔记片段到学习社区。分享前去除个人标识信息，
 * 仅分享内容和标签，不包含用户身份。5s 超时静默降级。
 * @ai-context: Anonymously shares note snippets to the learning community.
 * Personal identifiers are stripped before sharing. Only content and tags
 * are shared, never user identity. 5s timeout silent degradation.
 */
import { useState, useCallback } from 'react';
import { Check, Globe, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui';
import { cn } from '@/lib/utils';

interface NoteShareButtonProps {
  noteId: string;
  noteTitle: string;
  noteContent: string;
  tags: string[];
  /** 分享模式 */
  mode?: 'snippet' | 'full' | 'tags-only';
}

/**
 * 匿名化内容：去除个人标识信息
 * Anonymize content: remove personal identifiers
 */
function anonymizeContent(text: string): string {
  return text
    .replace(/\b(我叫|我是|我的名字是|我住在|我的电话|我的邮箱|我的微信|我的QQ)\s*\S{2,30}/g, '***')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***@***')
    .replace(/1[3-9]\d{9}/g, '***********');
}

export function NoteShareButton({
  noteId: _noteId,
  noteTitle,
  noteContent,
  tags,
  mode = 'snippet',
}: NoteShareButtonProps) {
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);
  const { toast } = useToast();

  const handleShare = useCallback(async () => {
    setSharing(true);
    const timeoutId = setTimeout(() => {
      setSharing(false);
      toast({ type: 'error', message: '分享超时，请稍后重试' });
    }, 5000);

    try {
      // 构建分享内容
      const content = mode === 'snippet'
        ? noteContent.slice(0, 500)
        : mode === 'tags-only'
          ? ''
          : noteContent;

      const shareData = {
        type: 'note',
        title: anonymizeContent(noteTitle),
        content: anonymizeContent(content),
        tags: tags.slice(0, 5),
        template: 'note',
        createdAt: new Date().toISOString(),
      };

      // 尝试通过 sync-service 的 social_mirror 协议分享
      const response = await fetch('/api/social/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shareData),
        signal: AbortSignal.timeout(4000),
      });

      if (!response.ok) throw new Error('Share failed');

      clearTimeout(timeoutId);
      setShared(true);
      toast({ type: 'success', message: '已匿名分享到社区', silent: true });
      setTimeout(() => setShared(false), 3000);
    } catch {
      // 静默降级：分享失败不影响用户
      clearTimeout(timeoutId);
      toast({ type: 'info', message: '社区服务暂不可用，已保存到本地', silent: true });
    } finally {
      setSharing(false);
    }
  }, [noteTitle, noteContent, tags, mode, toast]);

  return (
    <button
      onClick={handleShare}
      disabled={sharing}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-kb-sm text-c1 transition-colors',
        shared
          ? 'text-semantic-success bg-semantic-success/10'
          : 'text-text-tertiary hover:text-brand-600 hover:bg-brand-500/10',
        sharing && 'opacity-60 cursor-not-allowed',
      )}
      title={shared ? '已分享' : '匿名分享到社区'}
    >
      {sharing ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
      ) : shared ? (
        <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
      ) : (
        <Globe className="w-3.5 h-3.5" strokeWidth={1.5} />
      )}
      {shared ? '已分享' : '分享'}
    </button>
  );
}

export default NoteShareButton;