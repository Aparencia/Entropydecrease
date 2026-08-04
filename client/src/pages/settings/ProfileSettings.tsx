import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { User, Mail, Pencil, Check, X, Camera, Upload } from 'lucide-react';
import { Card, Button, Input, Avatar, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/AuthContext';
import { supabase, isPlaceholder } from '@/lib/auth/supabaseClient';
import { db } from '@/lib/storage/database';
import type { UserProfile } from '@/types/models';

export default function ProfileSettings() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // 跟踪最新 avatarUrl 用于 cleanup 时 revoke blob URL
  const avatarUrlRef = useRef(avatarUrl);

  // 同步 avatarUrl 到 ref
  useEffect(() => {
    avatarUrlRef.current = avatarUrl;
  }, [avatarUrl]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadProfile();

    // 组件卸载时释放 blob URL 防止泄漏
    return () => {
      const currentUrl = avatarUrlRef.current;
      if (currentUrl && currentUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadProfile() {
    if (!user) return;
    setLoading(true);
    try {
      const existing = await db.userProfile.where('userId').equals(user.id).first();
      if (existing) {
        setProfile(existing);
        setDisplayName(existing.displayName);
        setBio(existing.bio);
        setAvatarUrl(existing.avatarUrl);
      } else {
        // 从 Supabase user metadata 初始化
        const meta = user.user_metadata as Record<string, unknown> | undefined;
        const init: UserProfile = {
          id: crypto.randomUUID(),
          userId: user.id,
          email: user.email ?? '',
          displayName: (meta?.['display_name'] as string) ?? '',
          bio: (meta?.['bio'] as string) ?? '',
          avatarUrl: (meta?.['avatar_url'] as string) ?? '',
          updatedAt: new Date().toISOString(),
        };
        await db.userProfile.put(init);
        setProfile(init);
        setDisplayName(init.displayName);
        setBio(init.bio);
        setAvatarUrl(init.avatarUrl);
      }
    } catch {
      // 加载失败时静默处理
    } finally {
      setLoading(false);
    }
  }

  /**
   * 乐观更新保存 Profile：先更新 UI，再异步同步后端，失败时回滚
   * @param e 表单提交事件
   * @ai-context Profile 编辑保存核心逻辑，采用乐观更新 + 失败回滚模式
   */
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;

    // 1. 快照旧值，用于失败回滚
    const previousProfile = { ...profile };
    const previousDisplayName = displayName;
    const previousBio = bio;
    const previousAvatarUrl = avatarUrl;

    // 2. 乐观更新 UI —— 立即反映用户修改
    const optimisticProfile: UserProfile = {
      ...profile,
      displayName,
      bio,
      avatarUrl,
      updatedAt: new Date().toISOString(),
    };
    setProfile(optimisticProfile);
    setEditing(false);
    setSaving(true);

    try {
      // 3. 异步同步 Supabase metadata
      const { error: updateError } = await supabase.auth.updateUser({
        data: { display_name: displayName, bio, avatar_url: avatarUrl },
      });
      if (updateError) {
        // eslint-disable-next-line no-console
        console.error('[ProfileSave] updateUser error:', updateError);
        throw updateError;
      }

      // 刷新 session 使侧边栏等组件立即获取最新 metadata
      await supabase.auth.refreshSession();

      // 4. 后端成功 → 持久化到本地 Dexie
      await db.userProfile.put(optimisticProfile);
      toast({ type: 'success', message: '资料已保存' });
    } catch (err) {
      // 5. 失败回滚到快照值
      const msg = err instanceof Error ? err.message : '未知错误';
      // eslint-disable-next-line no-console
      console.error('[ProfileSave] Failed, rolling back:', err);
      setProfile(previousProfile);
      setDisplayName(previousDisplayName);
      setBio(previousBio);
      setAvatarUrl(previousAvatarUrl);
      setEditing(true);
      toast({ type: 'error', message: `更新失败，请重试：${msg}` });
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (profile) {
      setDisplayName(profile.displayName);
      setBio(profile.bio);
      setAvatarUrl(profile.avatarUrl);
    }
    setEditing(false);
  }

  /**
   * 头像上传乐观更新：先预览新头像，再异步上传，失败时回滚
   * @param e 文件输入 change 事件
   * @ai-context 头像上传逻辑，采用乐观更新 + 失败回滚模式
   */
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // 校验文件类型和大小
    if (!file.type.startsWith('image/')) {
      toast({ type: 'error', message: '请选择图片文件' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ type: 'error', message: '头像大小不能超过 2MB' });
      return;
    }

    if (isPlaceholder) {
      // 未配置 Supabase 时，用本地预览
      // 先释放旧 blob URL 防止泄漏
      if (avatarUrl && avatarUrl.startsWith('blob:')) {
        URL.revokeObjectURL(avatarUrl);
      }
      const localUrl = URL.createObjectURL(file);
      setAvatarUrl(localUrl);
      toast({ type: 'success', message: '头像已预览（云服务未配置，重启后失效）' });
      return;
    }

    // 1. 快照旧值，用于失败回滚
    const previousAvatarUrl = avatarUrl;
    const previousProfile = profile ? { ...profile } : null;

    // 2. 乐观更新 UI —— 立即显示本地预览
    const optimisticUrl = URL.createObjectURL(file);
    setAvatarUrl(optimisticUrl);
    setUploading(true);

    try {
      // 3. 异步上传到 Supabase Storage
      const ext = file.name.split('.').pop() || 'png';
      const filePath = `avatars/${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        // eslint-disable-next-line no-console -- 上传失败需记录具体错误
        console.error('[AvatarUpload] Upload error:', uploadError);
        throw new Error(uploadError.message);
      }

      // 获取公开访问 URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const newAvatarUrl = urlData.publicUrl;

      // 4. 替换乐观预览 URL 为真实 URL
      setAvatarUrl(newAvatarUrl);
      URL.revokeObjectURL(optimisticUrl);

      // 同步更新 Supabase user metadata
      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: newAvatarUrl },
      });
      if (updateError) {
        // eslint-disable-next-line no-console
        console.error('[AvatarUpload] updateUser error:', updateError);
      }

      // 5. 持久化到本地 Dexie
      if (profile) {
        const updated = { ...profile, avatarUrl: newAvatarUrl, updatedAt: new Date().toISOString() };
        await db.userProfile.put(updated);
        setProfile(updated);
      }

      toast({ type: 'success', message: '头像上传成功' });
    } catch (err) {
      // 6. 失败回滚到旧头像
      const msg = err instanceof Error ? err.message : '未知错误';
      // eslint-disable-next-line no-console
      console.error('[AvatarUpload] Failed, rolling back:', err);
      URL.revokeObjectURL(optimisticUrl);
      setAvatarUrl(previousAvatarUrl);
      if (previousProfile) setProfile(previousProfile);
      toast({ type: 'error', message: `头像上传失败：${msg}` });
    } finally {
      setUploading(false);
      // 重置 input 以便重复选择同一文件
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  if (!user) {
    return (
      <Card padding="md" className="flex flex-col gap-kb-sm items-center py-kb-lg">
        <User className="w-8 h-8 text-text-tertiary" strokeWidth={1.5} />
        <p className="text-b2 text-text-secondary">请先登录以管理个人资料</p>
        <Link
          to="/login"
          className="text-b3 text-brand-500 hover:text-brand-600 transition-colors"
        >
          前往「登录」页面开始使用 →
        </Link>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card padding="md" className="flex flex-col gap-kb-md">
        <h2 className="text-b1 font-semibold text-text-primary">个人资料</h2>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-kb-full bg-bg-tertiary animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 bg-bg-tertiary rounded animate-pulse" />
            <div className="h-3 w-48 bg-bg-tertiary rounded animate-pulse" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="md" className="flex flex-col gap-kb-md">
      <div className="flex items-center justify-between">
        <h2 className="text-b1 font-semibold text-text-primary">个人资料</h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md',
              'text-b2 text-text-secondary hover:text-text-primary',
              'hover:bg-bg-tertiary transition-colors',
            )}
          >
            <Pencil className="w-icon-xs h-icon-xs" strokeWidth={1.5} />
            编辑
          </button>
        )}
      </div>

      {/* 头像 + 基本信息 */}
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center gap-2">
          <div className="relative group">
            <Avatar
              src={avatarUrl || undefined}
              name={displayName || profile?.email || ''}
              size="lg"
              className="w-16 h-16 text-h1"
            />
            {/* 上传按钮覆盖层 */}
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploading}
              className={cn(
                'absolute inset-0 rounded-kb-full',
                'flex items-center justify-center',
                'bg-black/40 text-white opacity-0 group-hover:opacity-100',
                'transition-opacity duration-kb-fast',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              title="更换头像"
            >
              {uploading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-kb-full animate-spin" />
              ) : (
                <Camera className="w-5 h-5" strokeWidth={1.5} />
              )}
            </button>
          </div>
          {/* 隐藏的文件输入 */}
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={handleAvatarUpload}
          />
          {editing && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploading}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-kb-sm',
                  'text-c1 text-brand-500 hover:text-brand-600 hover:bg-brand-50',
                  'transition-colors disabled:opacity-50',
                )}
              >
                <Upload className="w-3 h-3" strokeWidth={1.5} />
                上传
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {editing ? (
            <form id="profile-form" onSubmit={handleSave} className="flex flex-col gap-kb-sm">
              <Input
                label="昵称"
                placeholder="输入昵称"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                prefix={<User className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
              />
              <div className="flex flex-col gap-1">
                <label className="text-b2 font-medium text-text-secondary">邮箱</label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-kb-md bg-bg-tertiary border border-border">
                  <Mail className="w-icon-sm h-icon-sm text-text-tertiary flex-shrink-0" strokeWidth={1.5} />
                  <span className="text-b2 text-text-secondary truncate">{profile?.email || user.email}</span>
                  <span className="text-c1 text-text-tertiary flex-shrink-0">只读</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-b2 font-medium text-text-secondary">个人简介</label>
                <textarea
                  placeholder="简单介绍一下自己..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={200}
                  className={cn(
                    'w-full px-3 py-2 rounded-kb-md resize-none',
                    'bg-bg-elevated border border-border text-b2 text-text-primary',
                    'placeholder:text-text-tertiary',
                    'focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20',
                    'transition-all duration-kb-fast',
                  )}
                />
                <span className="text-c1 text-text-tertiary text-right">{bio.length}/200</span>
              </div>
            </form>
          ) : (
            <div className="space-y-2">
              <div>
                <p className="text-b1 font-medium text-text-primary">
                  {displayName || <span className="text-text-tertiary">未设置昵称</span>}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Mail className="w-icon-xs h-icon-xs text-text-tertiary" strokeWidth={1.5} />
                  <p className="text-b2 text-text-secondary">{profile?.email || user.email}</p>
                </div>
              </div>
              {bio ? (
                <p className="text-b2 text-text-secondary">{bio}</p>
              ) : (
                <p className="text-b3 text-text-tertiary italic">暂无个人简介</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 编辑操作按钮 */}
      {editing && (
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/50">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            icon={<X className="w-icon-xs h-icon-xs" strokeWidth={1.5} />}
          >
            取消
          </Button>
          <Button
            type="submit"
            form="profile-form"
            variant="primary"
            size="sm"
            loading={saving}
            icon={<Check className="w-icon-xs h-icon-xs" strokeWidth={1.5} />}
          >
            保存
          </Button>
        </div>
      )}
    </Card>
  );
}
