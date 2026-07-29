/**
 * 隐私政策与用户协议同意模态
 *
 * 首次启动或版本升级时展示，
 * 用户需滚动到底部才能点击"同意"按钮。
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Shield, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ConsentModalProps {
  onAccept: () => void;
}

/** 当前隐私政策版本，与写入 consent 表的 version 字段保持一致 */
export const CURRENT_CONSENT_VERSION = '1.0';

export default function ConsentModal({ onAccept }: ConsentModalProps) {
  const [canAccept, setCanAccept] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const checkScrollPosition = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // 内容无需滚动或已滚动到底部 50px 范围内 → 启用同意按钮
    if (scrollHeight - scrollTop - clientHeight < 50) {
      setCanAccept(true);
    }
  }, []);

  // 挂载后检测：若内容不足以滚动则直接启用按钮
  useEffect(() => {
    // 等待一帧确保布局完成
    const frame = requestAnimationFrame(() => {
      checkScrollPosition();
    });
    return () => cancelAnimationFrame(frame);
  }, [checkScrollPosition]);

  const handleScroll = () => {
    checkScrollPosition();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-bg-elevated rounded-kb-xl shadow-kb-lg max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-kb-lg border-b border-border">
          <h2 className="text-h2 font-semibold text-text-primary flex items-center gap-2">
            <Shield className="w-icon-lg h-icon-lg text-brand-500" />
            欢迎使用熵减
          </h2>
          <p className="text-b2 text-text-secondary mt-1">
            请阅读以下隐私政策和用户协议
          </p>
          <p className="text-b3 text-text-tertiary mt-0.5">
            政策版本：{CURRENT_CONSENT_VERSION}
          </p>
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-kb-lg space-y-kb-md"
        >
          <section>
            <h3 className="text-h3 font-medium text-text-primary flex items-center gap-1">
              <Shield className="w-icon-sm h-icon-sm" /> 隐私政策摘要
            </h3>
            <div className="mt-2 text-b2 text-text-secondary space-y-2">
              <p>熵减是一款本地优先的学习工具。我们重视您的隐私：</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>您的学习数据（结礁、反衰减呼吸、深潜记录等）默认存储在本地设备上</li>
                <li>仅在您主动开启云端同步时，数据才会传输到服务器</li>
                <li>我们不会收集、出售或共享您的个人学习数据</li>
                <li>AI 功能仅将您主动提交的内容发送至 AI 服务进行处理</li>
                <li>您可以随时导出或删除所有个人数据</li>
              </ul>
            </div>
          </section>

          <section>
            <h3 className="text-h3 font-medium text-text-primary flex items-center gap-1">
              <FileText className="w-icon-sm h-icon-sm" /> 用户协议摘要
            </h3>
            <div className="mt-2 text-b2 text-text-secondary space-y-2">
              <p>使用熵减即表示您同意以下条款：</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>熵减仅供个人学习使用，不得用于商业目的</li>
                <li>AI 生成的内容仅供参考，不构成专业建议</li>
                <li>您对自己的学习数据负责，建议定期备份</li>
                <li>本软件按"现状"提供，不提供任何形式的保证</li>
                <li>我们保留在必要时更新本协议的权利</li>
              </ul>
            </div>
          </section>

          {!canAccept && (
            <p className="text-b3 text-text-tertiary text-center pt-kb-sm">
              请滚动至底部以启用同意按钮
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-kb-lg border-t border-border flex gap-kb-sm justify-end">
          <Button
            size="md"
            variant="primary"
            onClick={onAccept}
            disabled={!canAccept}
          >
            我已阅读并同意
          </Button>
        </div>
      </div>
    </div>
  );
}
