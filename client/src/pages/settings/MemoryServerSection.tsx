/**
 * 学习记忆接口授权区块（MCP 服务器应用内开关）
 * Memory interface consent section (in-app toggle for the MCP server)
 *
 * @ai-context: 宪法 P2 内层防御的用户授权面：开关读写 userData 下的
 * memory-server-consent 标记文件（服务器独立进程只认该标记）。
 * 文案履行「首次开启展示将被读取的记忆清单」承诺；关闭即立即撤销。
 */
import { useEffect, useState } from 'react';
import { BrainCircuit, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { isElectron } from '@/lib/utils/platform';
import { cn } from '@/lib/utils';

/** 开启前向用户披露的记忆清单（承诺透明） */
const DISCLOSED_ITEMS = [
  '学习画像：累计深潜时长、模块足迹、最佳专注时段',
  '概念掌握度档位与待唤醒知识（无倒计时、无截止日期）',
  '专注历史统计与最近学习会话摘要',
  '连击状态与世界状态快照（派生值）',
];

export function MemoryServerSection() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isElectron() || !window.electronAPI) return;
    window.electronAPI
      .invoke('memory_server:get_consent')
      .then((v) => setEnabled(v === true))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const toggle = async () => {
    if (!window.electronAPI) return;
    const next = !enabled;
    try {
      const res = (await window.electronAPI.invoke('memory_server:set_consent', next)) as {
        success: boolean; error?: string;
      };
      if (res?.success) {
        setEnabled(next);
        toast({
          type: 'success',
          message: next
            ? '学习记忆接口已开启——你的个人 AI 代理现在可以读取学习摘要（只读、本地）'
            : '学习记忆接口已关闭——授权标记已删除',
        });
      } else {
        toast({ type: 'error', message: `切换失败：${res?.error ?? '未知错误'}` });
      }
    } catch {
      toast({ type: 'error', message: '切换失败：IPC 调用异常' });
    }
  };

  if (!isElectron()) return null;

  return (
    <div className="rounded-kb-lg border border-border/50 bg-bg-secondary/30 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <BrainCircuit className="w-4 h-4 text-focus" strokeWidth={1.5} />
        <span className="text-b2 font-medium text-text-primary">学习记忆接口（MCP）</span>
        <span
          className={cn(
            'ml-auto text-c1 px-2 py-0.5 rounded-kb-full border',
            enabled
              ? 'text-moss border-moss/40 bg-moss/10'
              : 'text-text-tertiary border-border/60',
          )}
        >
          {loaded ? (enabled ? '已开启' : '已关闭') : '读取中…'}
        </span>
      </div>

      <p className="text-b3 text-text-secondary leading-relaxed">
        允许你自己的 AI 代理（Claude Desktop 等）读取本地学习记忆的<b>只读摘要</b>，
        让熵减成为你 AI 的学习记忆基座。数据永不离开本机，服务器不监听任何网络端口，
        每次读取都会留痕可审计。
      </p>

      <ul className="flex flex-col gap-1">
        {DISCLOSED_ITEMS.map((item) => (
          <li key={item} className="text-c1 text-text-tertiary flex items-start gap-1.5">
            <ShieldCheck className="w-3 h-3 mt-0.5 flex-shrink-0 text-text-tertiary" strokeWidth={1.5} />
            {item}
          </li>
        ))}
      </ul>

      <div>
        <Button variant={enabled ? 'secondary' : 'primary'} size="sm" onClick={toggle} disabled={!loaded}>
          {enabled ? '关闭接口并撤销授权' : '开启接口'}
        </Button>
      </div>
    </div>
  );
}
