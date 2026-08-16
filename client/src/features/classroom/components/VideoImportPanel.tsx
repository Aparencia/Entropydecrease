/**
 * VideoImportPanel — 课堂助手移动端视频导入入口（PWA 视频转笔记主力通道）
 *
 * @ai-context: PWA 下替代桌面端"窗口选择"的入口：①「导入视频」= 选择手机录屏/
 * 网课下载/抖音保存的视频 → analyzeVideoFile 上传网关 analyze-video 生成笔记
 * （结果已持久化 classroomNoteStore）；②抖音链接引导 = 粘贴分享链接时检测
 * douyin.com，提示"保存到相册再导入"（方案 A，不做服务端自动解析）。
 * @ai-context EN: PWA replacement for the desktop window-picker: (1) import a
 * screen-record/course video to upload via analyzeVideoFile and generate a
 * note (persisted already); (2) Douyin link guide — detect douyin.com and tell
 * the user to "save to album then import" (plan A, no server-side scraping).
 */
import { useRef, useState } from 'react';
import { useToast } from '@/components/ui';
import { Upload, Video, Loader2 } from 'lucide-react';
import { analyzeVideoFile, isDouyinUrl } from '../lib/uploadVideoAnalysis';

export function VideoImportPanel() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [douyinUrl, setDouyinUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选择同一文件
    if (!file) return;
    setUploading(true);
    try {
      await analyzeVideoFile(file);
      toast({ type: 'success', message: '视频笔记已生成，可在笔记中查看' });
    } catch {
      toast({ type: 'error', message: '视频分析失败，请检查网络或文件格式' });
    } finally {
      setUploading(false);
    }
  };

  const showDouyinGuide = isDouyinUrl(douyinUrl);

  return (
    <div className="space-y-2.5">
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-kb-lg border border-dashed border-border/60 text-text-secondary hover:text-brand-600 hover:border-brand-400 active:scale-[0.98] transition-all text-b3 disabled:opacity-60"
      >
        {uploading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> 分析中，约 1-3 分钟…</>
        ) : (
          <><Upload className="w-4 h-4" /> 导入视频生成笔记</>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* 抖音链接引导（方案 A：检测 douyin.com → 引导保存相册导入） */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
          <Video className="w-3.5 h-3.5" />
          <span>抖音视频：粘贴分享链接获取导入指引</span>
        </div>
        <input
          value={douyinUrl}
          onChange={(e) => setDouyinUrl(e.target.value)}
          placeholder="粘贴抖音分享链接（如 v.douyin.com/…）"
          className="w-full px-2.5 py-1.5 rounded-kb-md border border-border/50 text-[12px] bg-bg-elevated/50 focus:outline-none focus:border-brand-400"
        />
        {showDouyinGuide && (
          <p className="text-[11px] leading-relaxed text-brand-600">
            在抖音 App 中点「分享 → 保存到相册」，再点上方「导入视频」选择该视频即可生成笔记
          </p>
        )}
      </div>
    </div>
  );
}
