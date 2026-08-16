/**
 * 个人资料页 · 头像区块
 *
 * @ai-context: ProfileSettings 审计拆分。头像 + hover 上传覆盖层 + 隐藏文件
 * 输入 + 编辑态「上传」按钮；inputRef 由父组件（useAvatarUpload）注入，保证
 * 上传完成后重置输入值的行为一致。
 * @ai-context: Extracted from ProfileSettings. Avatar preview, hover overlay,
 * hidden file input and edit-mode upload button; inputRef comes from the parent
 * so the post-upload input reset behaves identically.
 */
import type { ChangeEvent, RefObject } from 'react';
import { Camera, Upload } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';

interface ProfileAvatarSectionProps {
  avatarUrl: string;
  name: string;
  uploading: boolean;
  editing: boolean;
  inputRef: RefObject<HTMLInputElement>;
  onAvatarChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

export function ProfileAvatarSection({
  avatarUrl,
  name,
  uploading,
  editing,
  inputRef,
  onAvatarChange,
}: ProfileAvatarSectionProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative group">
        <Avatar
          src={avatarUrl || undefined}
          name={name}
          size="lg"
          className="w-16 h-16 text-h1"
        />
        {/* 上传按钮覆盖层 */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
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
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={onAvatarChange}
      />
      {editing && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
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
  );
}
