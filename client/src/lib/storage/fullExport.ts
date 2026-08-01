import { db } from './database';
import type {
  FlashcardDeck, Flashcard,
  PomodoroSession, PomodoroSettings, Note, NoteFolder,
  FlashcardReview, FeynmanNote, FeynmanSummary, FeynmanWeakPoint,
  OperationLog, AppSettings, StudyCheckIn, Achievement,
  PomodoroGoal, SyncConflict, OfflineQueueItem, WindowCapture, WindowCaptureSegment,
  RitualRecord,
} from '@/types/models';

/**
 * 全量数据导出/导入模块
 *
 * @ai-context: ExportData.version '2.0' 是备份文件格式版本（非应用版本），
 * 已散布在用户历史备份文件中，格式只可追加字段不可删改。
 * @ai-context: importData 是破坏性操作——事务内先 clear 全部业务表再写入，
 * 失败时 Dexie 事务自动回滚。调用方必须在 UI 层二次确认。
 * @ai-context: 导出内容为数据库原始记录（敏感字段若已加密则导出密文），
 * 跨设备恢复后需同一 CryptoManager 密钥才能解密——这是已知限制。
 */

export interface ExportData {
  version: string;
  exportedAt: string;
  data: {
    pomodoroSessions: PomodoroSession[];
    pomodoroSettings: PomodoroSettings[];
    notes: Note[];
    noteFolders: NoteFolder[];
    flashcardDecks: FlashcardDeck[];
    flashcards: Flashcard[];
    flashcardReviews: FlashcardReview[];
    feynmanNotes: FeynmanNote[];
    feynmanSummaries: FeynmanSummary[];
    feynmanWeakPoints: FeynmanWeakPoint[];
    operationLog: OperationLog[];
    appSettings: AppSettings[];
    // v0.5.0 A1.3 补全：
    studyCheckIns: StudyCheckIn[];
    achievements: Achievement[];
    pomodoroGoals: PomodoroGoal[];
    syncConflicts: SyncConflict[];
    offlineQueue: OfflineQueueItem[];
    windowCaptures: WindowCapture[];
    // P2-14: 采集片段独立表（旧备份无此字段时导入安全跳过）
    windowCaptureSegments: WindowCaptureSegment[];
    // v0.26.0 A1 补全：
    ritualRecords: RitualRecord[];
  };
}

/** 参与全量导出/导入的业务表清单（新增表时在此登记） */
const EXPORT_TABLES = [
  'pomodoroSessions', 'pomodoroSettings', 'notes', 'noteFolders',
  'flashcardDecks', 'flashcards', 'flashcardReviews',
  'feynmanNotes', 'feynmanSummaries', 'feynmanWeakPoints',
  'operationLog', 'appSettings', 'studyCheckIns', 'achievements',
  'pomodoroGoals', 'syncConflicts', 'offlineQueue', 'windowCaptures',
  'windowCaptureSegments',
  'ritualRecords',
] as const;

type ExportTableName = (typeof EXPORT_TABLES)[number];

/** 全量导出所有数据为 JSON 字符串 */
export async function exportAllData(): Promise<string> {
  const arrays = await Promise.all(
    EXPORT_TABLES.map((name) => db.table(name).toArray()),
  );

  const data = Object.fromEntries(
    EXPORT_TABLES.map((name, i) => [name, arrays[i]]),
  ) as ExportData['data'];

  const exportData: ExportData = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    data,
  };

  return JSON.stringify(exportData);
}

/** 触发浏览器下载 JSON 文件 */
export function downloadExport(jsonString: string, filename?: string): void {
  const defaultName = `entropy-decrease-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? defaultName;
  document.body.appendChild(a);
  a.click();

  // 清理
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 导入数据（清空旧数据后批量写入） */
export async function importData(
  jsonString: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const parsed = JSON.parse(jsonString) as ExportData;

    if (!parsed.version) {
      return { success: false, message: '无效的备份文件：缺少 version 字段' };
    }

    const { data } = parsed;
    if (!data || typeof data !== 'object') {
      return { success: false, message: '无效的备份文件：缺少 data 字段' };
    }

    // 在事务中清空旧数据并批量写入（失败自动回滚）
    const tables = EXPORT_TABLES.map((name) => db.table(name));
    await db.transaction('rw', tables, async () => {
      for (const name of EXPORT_TABLES) {
        await db.table(name).clear();
      }
      for (const name of EXPORT_TABLES) {
        const rows = data[name as ExportTableName];
        if (rows?.length) {
          await db.table(name).bulkPut(rows);
        }
      }
    });

    return { success: true, message: '数据导入成功' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误';
    return { success: false, message: `导入失败：${msg}` };
  }
}

/** 使用 FileReader 读取文件为文本 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}
