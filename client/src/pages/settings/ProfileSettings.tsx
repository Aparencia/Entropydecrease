/**
 * 个人设置页（组合入口）
 *
 * @ai-context: 2026 审计拆分——头像/表单/展示/操作按钮/空态/骨架拆至
 * pages/settings/components/，头像上传逻辑拆至 hooks/useAvatarUpload.ts。
 * 本文件保留状态与编排：profile/displayName/bio/avatarUrl 状态、乐观保存
 * handleSave、加载 loadProfile、blob URL 释放与表单提交联动。
 * @ai-context: Assembly page. Presentational blocks moved to
 * pages/settings/components/, avatar upload logic to hooks/useAvatarUpload.ts.
 * Keeps state, optimistic save, profile loading, blob-URL cleanup and the
 * cross-component form-submit link.
 */
import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import { Card, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/AuthContext';
import { supabase } from '@/lib/auth/supabaseClient';
import { db } from '@/lib/storage/database';
import type { UserProfile } from '@/types/models';
import { useAvatarUpload } from '@/hooks/useAvatarUpload';
import { ProfileAvatarSection } from './components/ProfileAvatarSection';
import { ProfileFormFields } from './components/ProfileFormFields';
import { ProfileDisplayFields } from './components/ProfileDisplayFields';
import { ProfileEditActions } from './components/ProfileEditActions';
import { ProfileLoginPrompt } from './components/ProfileLoginPrompt';
import { ProfileLoadingSkeleton } from './components/ProfileLoadingSkeleton';

/** 编辑表单 id：ProfileFormFields 与 ProfileEditActions 通过它跨组件关联提交 */
const PROFILE_FORM_ID = 'profile-form';

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
  // 跟踪最新 avatarUrl 用于 cleanup 时 revoke blob URL
  const avatarUrlRef = useRef(avatarUrl);

  const { uploading, avatarInputRef, handleAvatarUpload } = useAvatarUpload({
    user,
    avatarUrl,
    profile,
    setAvatarUrl,
    setProfile,
  });

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

  if (!user) {
    return <ProfileLoginPrompt />;
  }

  if (loading) {
    return <ProfileLoadingSkeleton />;
  }

  const email = profile?.email || user.email;

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
        <ProfileAvatarSection
          avatarUrl={avatarUrl}
          name={displayName || profile?.email || ''}
          uploading={uploading}
          editing={editing}
          inputRef={avatarInputRef}
          onAvatarChange={handleAvatarUpload}
        />

        <div className="flex-1 min-w-0 space-y-2">
          {editing ? (
            <ProfileFormFields
              displayName={displayName}
              bio={bio}
              email={email}
              formId={PROFILE_FORM_ID}
              onDisplayNameChange={setDisplayName}
              onBioChange={setBio}
              onSubmit={handleSave}
            />
          ) : (
            <ProfileDisplayFields displayName={displayName} email={email} bio={bio} />
          )}
        </div>
      </div>

      {/* 编辑操作按钮 */}
      {editing && <ProfileEditActions saving={saving} formId={PROFILE_FORM_ID} onCancel={handleCancel} />}
    </Card>
  );
}
