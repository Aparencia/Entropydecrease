/**
 * 头像上传 Hook（乐观更新 + 失败回滚）
 *
 * @ai-context: ProfileSettings 审计拆分。未配置 Supabase（isPlaceholder）时
 * 仅做本地 blob 预览；否则上传 Supabase Storage → 换真实 URL → 同步 metadata
 * → 持久化 Dexie，任一步失败回滚旧头像并释放 blob URL。uploading 与
 * avatarInputRef 随本 hook 管理，上传完成后重置输入值以便重复选择同一文件。
 * @ai-context: Extracted from ProfileSettings. Optimistic avatar upload with
 * rollback; degrades to a local blob preview when Supabase is not configured.
 * Owns `uploading` and `avatarInputRef`; resets the input after upload.
 */
import { useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { useToast } from '@/components/ui';
import { supabase, isPlaceholder } from '@/lib/auth/supabaseClient';
import { db } from '@/lib/storage/database';
import type { UserProfile } from '@/types/models';

interface UseAvatarUploadOptions {
  user: { id: string } | null;
  avatarUrl: string;
  profile: UserProfile | null;
  setAvatarUrl: Dispatch<SetStateAction<string>>;
  setProfile: Dispatch<SetStateAction<UserProfile | null>>;
}

export function useAvatarUpload({
  user,
  avatarUrl,
  profile,
  setAvatarUrl,
  setProfile,
}: UseAvatarUploadOptions) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  /**
   * 头像上传乐观更新：先预览新头像，再异步上传，失败时回滚
   * @param e 文件输入 change 事件
   * @ai-context 头像上传逻辑，采用乐观更新 + 失败回滚模式
   */
  async function handleAvatarUpload(e: ChangeEvent<HTMLInputElement>) {
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

  return { uploading, avatarInputRef, handleAvatarUpload };
}
