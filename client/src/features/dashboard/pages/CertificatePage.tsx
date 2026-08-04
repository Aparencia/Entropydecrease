/**
 * CertificatePage — R9 学习成就证书（window.print 打印）
 * Learning achievement certificate — printable via window.print
 *
 * @ai-context: 汇总已解锁成就生成打印证书：@media print 下隐藏操作栏与
 * 侧边栏，证书区白底深字（脱离暗色主题）；打印前先 window.print 由浏览器
 * 原生打印对话框完成保存 PDF。无解锁成就时展示空态引导。
 * @ai-context: Assembles unlocked achievements into a print-friendly
 * certificate; screen-only chrome is hidden under @media print.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Award } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import { db } from '@/lib/storage/database';
import { ACHIEVEMENT_DEFS } from '@/lib/achievements/definitions';
import type { Achievement } from '@/types/models';

/** 打印样式注入（页面级 scoped style，避免污染全局） */
const PRINT_STYLE = `
  @media print {
    body { background: #fff !important; }
    .cert-no-print { display: none !important; }
    /* 隐藏应用框架（底部导航/自绘标题栏），证书纸上只保留证书本体 */
    nav, .drag-region { display: none !important; }
    .cert-sheet {
      box-shadow: none !important;
      border: 2px solid #d4d4d4 !important;
      background: #fff !important;
      color: #1f2937 !important;
    }
    .cert-sheet * { color: inherit !important; }
  }
`;

function formatDate(d: Date): string {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export default function CertificatePage() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.achievements.toArray()
      .then((list) => setUnlocked(list))
      .finally(() => setLoading(false));
  }, []);

  const total = ACHIEVEMENT_DEFS.length;
  const byCategory = {
    starter: unlocked.filter((a) => ACHIEVEMENT_DEFS.find((d) => d.key === a.key)?.category === 'starter'),
    habit: unlocked.filter((a) => ACHIEVEMENT_DEFS.find((d) => d.key === a.key)?.category === 'habit'),
  };

  return (
    <div className="h-full overflow-y-auto bg-bg-primary">
      <style>{PRINT_STYLE}</style>

      {/* 屏幕操作栏（打印时隐藏） */}
      <div className="cert-no-print sticky top-0 z-10 flex items-center justify-between px-kb-md py-3 bg-bg-primary/90 backdrop-blur-sm border-b border-border/30">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b2 text-text-secondary hover:bg-bg-tertiary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> 返回
        </button>
        <Button icon={<Printer className="w-4 h-4" strokeWidth={1.5} />} onClick={() => window.print()}>
          打印 / 存为 PDF
        </Button>
      </div>

      <div className="max-w-3xl mx-auto py-kb-lg px-kb-md">
        {loading ? (
          <div className="h-64 flex items-center justify-center text-b2 text-text-tertiary">正在整理证书…</div>
        ) : unlocked.length === 0 ? (
          <EmptyState
            icon={<Award className="w-12 h-12" strokeWidth={1.2} />}
            title="还没有解锁成就"
            description="完成番茄钟、闪卡复习、费曼讲解或创建笔记，点亮成就后即可生成证书"
            action={<Button variant="secondary" onClick={() => navigate('/')}>去开始学习</Button>}
          />
        ) : (
          <div className="cert-sheet rounded-kb-xl border border-border/40 bg-bg-elevated shadow-kb-lg p-8 print:p-4">
            {/* 证书头 */}
            <div className="text-center border-b border-border/30 pb-6 mb-6">
              <p className="text-c1 tracking-[0.35em] text-brand-600/80 uppercase mb-2">Entropy Decrease</p>
              <h1 className="text-3xl font-bold text-text-primary tracking-wide">熵 减 学 习 证 书</h1>
              <p className="mt-2 text-b2 text-text-secondary">兹证明本证书持有者已点亮以下学习成就</p>
              <p className="mt-3 text-c1 text-text-tertiary">签发日期：{formatDate(new Date())} · 共 {unlocked.length}/{total} 项</p>
            </div>

            {/* 入门成就 */}
            {byCategory.starter.length > 0 && (
              <section className="mb-6">
                <h2 className="text-b3 font-semibold text-text-tertiary uppercase tracking-wider mb-3">入门启程</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {byCategory.starter.map((a) => (
                    <div key={a.key} className="rounded-kb-md border border-brand-300/30 bg-brand-50/30 p-3 text-center">
                      <div className="text-2xl mb-1">✦</div>
                      <p className="text-b2 font-medium text-text-primary">{a.title}</p>
                      <p className="text-c1 text-text-tertiary mt-0.5">{a.description}</p>
                      <p className="text-c1 text-brand-600/70 mt-1">{formatDate(new Date(a.unlockedAt))}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 习惯/里程碑成就 */}
            {byCategory.habit.length > 0 && (
              <section className="mb-6">
                <h2 className="text-b3 font-semibold text-text-tertiary uppercase tracking-wider mb-3">习惯与里程碑</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {byCategory.habit.map((a) => (
                    <div key={a.key} className="rounded-kb-md border border-amber-300/30 bg-amber-50/30 p-3 text-center">
                      <div className="text-2xl mb-1">🏅</div>
                      <p className="text-b2 font-medium text-text-primary">{a.title}</p>
                      <p className="text-c1 text-text-tertiary mt-0.5">{a.description}</p>
                      <p className="text-c1 text-amber-600/70 mt-1">{formatDate(new Date(a.unlockedAt))}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 证书落款 */}
            <div className="flex items-end justify-between pt-6 mt-2">
              <p className="text-c1 text-text-tertiary max-w-[260px]">
                学习如深海潜行，每一次浮出水面都是对自己的证明。
              </p>
              <p className="text-c1 text-text-secondary border-t border-border/50 pt-1.5 min-w-[140px] text-right">
                熵减 · 学习系统
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
