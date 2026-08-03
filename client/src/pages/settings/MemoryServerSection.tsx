/**
 * 学习记忆接口授权区块（MCP 服务器应用内开关 + 阶段 C 演示剧本）
 * Memory interface consent section (in-app toggle + demo script)
 *
 * @ai-context: 宪法 P2 内层防御的用户授权面：开关读写 userData 下的
 * memory-server-consent 标记文件（服务器独立进程只认该标记）。
 * 阶段 C（生态）：开启后展示三步连接引导（复制配置→重启宿主→提问）、
 * 访问审计列表（memory_server:get_access_log，最近 50 条）与世界快照
 * 状态。文案履行「首次开启展示将被读取的记忆清单」承诺，零负向语言
 * （宪法第二条：不说"没有/失败"，只说"第一次问起时留下的足迹"）。
 *
 * @ai-context: Consent toggle plus the phase-C demo script: 3-step host
 * setup guide, access audit list (last 50), and snapshot freshness.
 */
import { useEffect, useState } from 'react';
import { BrainCircuit, ShieldCheck, Copy, ScrollText } from 'lucide-react';
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
  '知识图谱摘要：概念档位与关联数（无卡片背面原文）',
];

/** 工具名 → 友好标签（审计列表展示） */
const TOOL_LABEL: Record<string, string> = {
  'learning_memory.profile': '学习画像',
  'learning_memory.mastery': '概念掌握度',
  'learning_memory.review_candidates': '待唤醒知识',
  'learning_memory.focus_stats': '专注统计',
  'learning_memory.streak': '连击状态',
  'learning_memory.discoveries': '发现图鉴',
  'learning_memory.recent_sessions': '最近会话',
  'learning_memory.world_state': '世界状态',
  'learning_memory.knowledge_graph': '知识图谱',
};

interface AccessLogEntry {
  at: string;
  tool: string;
}
interface AccessLog {
  entries: AccessLogEntry[];
  total: number;
}

/** 时间戳 → 本地短时刻（HH:MM:SS） */
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

export function MemoryServerSection() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [log, setLog] = useState<AccessLog | null>(null);
  const [hostConfig, setHostConfig] = useState<Record<string, unknown> | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);

  useEffect(() => {
    if (!isElectron() || !window.electronAPI) return;
    window.electronAPI
      .invoke('memory_server:get_consent')
      .then((v) => setEnabled(v === true))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // 启用后加载：访问审计 + 宿主配置 + 快照状态（失败各自静默降级）
  useEffect(() => {
    if (!enabled || !window.electronAPI) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [logRes, cfgRes] = await Promise.all([
          window.electronAPI.invoke('memory_server:get_access_log'),
          window.electronAPI.invoke('memory_server:get_host_config'),
        ]);
        if (cancelled) return;
        if (logRes && typeof logRes === 'object' && Array.isArray((logRes as AccessLog).entries)) {
          setLog(logRes as AccessLog);
        }
        if (cfgRes && typeof cfgRes === 'object') setHostConfig(cfgRes as Record<string, unknown>);
      } catch { /* 审计/配置加载失败时区块保持空态 */ }
      try {
        const snap = await window.electronAPI.db.query<{ payload?: string } | null>(
          'worldSnapshots', 'getById', ['latest'],
        );
        if (!cancelled && snap?.payload) {
          const parsed = JSON.parse(snap.payload as string) as { capturedAt?: string };
          setSnapshotAt(parsed.capturedAt ?? null);
        }
      } catch { /* 快照不可读时保持空态 */ }
    };
    void load();
    return () => { cancelled = true; };
  }, [enabled]);

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

  const copyConfig = async () => {
    if (!hostConfig) return;
    const text = JSON.stringify(
      { mcpServers: { 'keban-learning-memory': hostConfig } },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(text);
      toast({ type: 'success', message: '服务器配置已复制——粘贴到你的 AI 宿主即可', silent: true });
    } catch {
      toast({ type: 'error', message: '复制失败，请选中下方配置手动复制' });
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

      {enabled && (
        <div className="flex flex-col gap-3 border-t border-border/40 pt-3">
          {/* 三步连接引导（阶段 C 演示剧本） */}
          <div className="flex flex-col gap-1.5">
            <p className="text-b3 font-medium text-text-primary">三步接入你的 AI</p>
            <ol className="flex flex-col gap-1 text-c1 text-text-secondary">
              <li>1. 复制下方服务器配置</li>
              <li>2. 粘贴到 AI 宿主的 MCP 设置并重启它</li>
              <li>3. 问一句：「我最近在学什么？哪里朦胧了？」</li>
            </ol>
            {hostConfig && (
              <div className="relative mt-1">
                <Button variant="secondary" size="sm" className="mb-1" onClick={copyConfig}>
                  <Copy className="w-3 h-3 mr-1" strokeWidth={1.5} /> 复制配置
                </Button>
                <pre className="text-c1 text-text-tertiary bg-bg-elevated/30 rounded-kb-md p-2 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                  {JSON.stringify({ mcpServers: { 'keban-learning-memory': hostConfig } }, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* 快照状态：世界快照最后同步时刻 */}
          <div className="flex items-center gap-1.5 text-c1 text-text-tertiary">
            <ShieldCheck className="w-3 h-3 text-moss" strokeWidth={1.5} />
            {snapshotAt
              ? `世界快照已同步：${new Date(snapshotAt).toLocaleString('zh-CN')}`
              : '世界快照待应用启动后自动同步'}
          </div>

          {/* 访问审计列表（最近 50 条） */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-c1 text-text-tertiary">
              <ScrollText className="w-3 h-3" strokeWidth={1.5} />
              访问审计{log ? `（共 ${log.total} 次读取，显示最近 ${Math.min(log.total, 50)} 条）` : ''}
            </div>
            {!log ? (
              <p className="text-c1 text-text-tertiary">正在读取审计记录…</p>
            ) : log.entries.length === 0 ? (
              <p className="text-c1 text-text-tertiary">还没有读取记录——你的 AI 第一次问起时，会在这里留下足迹</p>
            ) : (
              <ul className="max-h-40 overflow-y-auto flex flex-col gap-0.5 text-c1 text-text-secondary">
                {log.entries.map((e, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span>{TOOL_LABEL[e.tool] ?? e.tool}</span>
                    <span className="text-text-tertiary tabular-nums">{fmtTime(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
