/** 迁移进度 UI — 全屏遮罩 + 玻璃拟态卡片，展示 IndexedDB → SQLite 迁移进度 *
 * @ai-context: 通用组件：MigrationProgress。
 */
import { useState, useEffect, useCallback } from 'react';

interface MigrationStatus { completed: boolean; currentTable: string; tablesTotal: number; tablesCompleted: number; rowsMigrated: number; error?: string }
interface Props { onComplete: () => void }

const INIT: MigrationStatus = { completed: false, currentTable: '', tablesTotal: 0, tablesCompleted: 0, rowsMigrated: 0 };
const LABELS: Record<string, string> = {
  notes: '结礁', noteFolders: '文件夹', flashcardDecks: '卡组', flashcards: '反衰减呼吸',
  flashcardReviews: '复习记录', feynmanNotes: '浮出水面笔记', feynmanSummaries: '浮出水面总结',
  feynmanWeakPoints: '薄弱点', pomodoroSessions: '深潜', pomodoroSettings: '深潜设置',
  appSettings: '设置', operationLog: '操作日志', syncConflicts: '同步冲突',
  offlineQueue: '离线队列', studyCheckIns: '打卡', achievements: '成就',
  pomodoroGoals: '番茄目标', windowCaptures: '窗口采集', consent: '协议',
  userProfile: '用户', inspirations: '萤火海沟',
};

export default function MigrationProgress({ onComplete }: Props) {
  const [s, setS] = useState<MigrationStatus>(INIT);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) { setErr('electronAPI 不可用'); return; }
    try {
      const { needed, tableMapping } = await api.migration.check();
      if (!needed) { onComplete(); return; }
      setS((p) => ({ ...p, tablesTotal: tableMapping.length }));
      const { db: dexieDb } = await import('@/lib/storage/database');
      let rows = 0;
      for (let i = 0; i < tableMapping.length; i++) {
        const { dexie, sqlite } = tableMapping[i];
        setS((p) => ({ ...p, currentTable: LABELS[dexie] ?? dexie }));
        const data = await dexieDb.table(dexie).toArray();
        if (data.length > 0) {
          const res = await api.migration.importTable(sqlite, data);
          if (!res.success) throw new Error(res.error ?? `导入 ${dexie} 失败`);
          rows += res.rowsImported ?? data.length;
        }
        setS((p) => ({ ...p, tablesCompleted: i + 1, rowsMigrated: rows }));
      }
      const fin = await api.migration.complete();
      if (!fin.success) throw new Error(fin.error);
      setS((p) => ({ ...p, completed: true, currentTable: '完成' }));
      setTimeout(onComplete, 800);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [onComplete]);

  useEffect(() => { run(); }, [run]);
  const pct = s.tablesTotal > 0 ? Math.round((s.tablesCompleted / s.tablesTotal) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-primary/80 backdrop-blur-sm">
      <div className="bg-bg-elevated/90 backdrop-blur-xl rounded-kb-xl shadow-kb-lg p-kb-xl max-w-md w-full border border-border">
        <div className="flex items-center gap-kb-md mb-kb-lg">
          <div className={`w-icon-md h-icon-md rounded-kb-full bg-brand-500 flex items-center justify-center ${!s.completed && !err ? 'animate-breathe' : ''}`}>
            <svg className="w-icon-sm h-icon-sm text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {s.completed ? <path d="M5 13l4 4L19 7" /> : <path d="M12 2v4m0 12v4m-7-3l3-3m8-8l3-3M2 12h4m12 0h4M5 5l3 3m8 8l3 3" />}
            </svg>
          </div>
          <div>
            <h2 className="text-h2 font-bold text-text-primary">{s.completed ? '迁移完成' : err ? '迁移出错' : '正在迁移数据…'}</h2>
            {!s.completed && !err && <p className="text-b3 text-text-secondary">正在迁移 {s.currentTable}</p>}
          </div>
        </div>
        <div className="mb-kb-md">
          <div className="h-2 rounded-kb-full bg-bg-tertiary overflow-hidden">
            <div className="h-full rounded-kb-full bg-brand-500 transition-all duration-kb-normal" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between mt-kb-xs text-b3 text-text-tertiary">
            <span>{s.tablesCompleted} / {s.tablesTotal} 张表</span>
            <span>{s.rowsMigrated.toLocaleString()} 行</span>
          </div>
        </div>
        {err && (
          <>
            <div className="mb-kb-md p-kb-sm rounded-kb-md bg-semantic-error/10 border border-semantic-error/30">
              <p className="text-b3 text-semantic-error break-all">{err}</p>
            </div>
            <button onClick={() => { setS(INIT); setErr(null); run(); }}
              className="w-full py-kb-sm rounded-kb-lg bg-brand-500 text-white text-b1 font-medium hover:bg-brand-600 transition-colors duration-kb-fast">
              重试
            </button>
          </>
        )}
      </div>
    </div>
  );
}
