/**
 * 课堂笔记持久化 hook（同课程查询 / 追加 / 新建 / 采集序号）
 *
 * @ai-context: 从 useClassroomCapture 拆出。复用 noteStore +
 * createWithLog/updateWithLog，保证 content 加密、操作日志与 CRDT 同步
 * 与全站一致；Note.content 存储 TipTap JSON（Markdown 需先转换）。
 * 采集序号从已有笔记内容中反查"YYYY/M/D 第N次采集"标记的最大值 +1，
 * 使同一天多次采集可追加到同一篇笔记且分段可读。
 * @ai-context: 落地前先经 resolveKeyframeMarkers 把 [图:N] 标记替换为
 * 本地关键帧图片（keyframe:// URL），无标记时按时间就近兜底插入。
 */
import { useCallback } from 'react';
import { noteStore } from '@/lib/storage';
import { createWithLog, updateWithLog } from '@/lib/storage/writeWithLog';
import { markdownToTipTapJson, appendMarkdownToTipTapJson } from '../utils/tipTapConverter';
import { resolveKeyframeMarkers } from '../utils/tipTapImageUtils';
import type { CourseNoteItem } from '../components/NoteInsertDialog';
import type { CourseMeta, SessionBundle } from '@/lib/capture';

export function useClassroomNotes(courseMeta: CourseMeta, smartBundle?: Partial<SessionBundle>) {
  /** [图:N] 标记 → 关键帧图片替换（相对秒数与 analyzePartial 同基准：首帧 timestamp） */
  const applyKeyframeImages = useCallback((markdown: string): string => {
    const kfs = smartBundle?.keyframes ?? [];
    if (kfs.length === 0) return markdown;
    const base = kfs[0].timestamp;
    const refs = kfs.map((kf) => ({
      fileUrl: kf.fileUrl,
      relativeSeconds: Math.max(0, (kf.timestamp - base) / 1000),
    }));
    return resolveKeyframeMarkers(markdown, refs);
  }, [smartBundle]);

  /** 查询同课程名的已有笔记（用于"追加到已有笔记"下拉列表） */
  const fetchCourseNotes = useCallback(async (courseName: string): Promise<CourseNoteItem[]> => {
    if (!courseName) return [];
    try {
      const matched = await noteStore.find((n) => n.title.includes(courseName));
      return matched
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 10)
        .map((n) => ({
          id: n.id,
          title: n.title,
          content: n.content,
          updatedAt: new Date(n.updatedAt).toISOString(),
        }));
    } catch (err) {
      console.warn('[useClassroomCapture] 查询课程笔记失败:', err);
      return [];
    }
  }, []);

  /** 追加内容到已有笔记末尾（带时间分隔标记，合并 TipTap JSON） */
  const appendToNote = useCallback(async (noteId: string, markdownContent: string, sessionLabel: string) => {
    const existing = await noteStore.getById(noteId);
    const mergedContent = appendMarkdownToTipTapJson(
      existing?.content ?? '',
      sessionLabel,
      applyKeyframeImages(markdownContent),
    );
    await updateWithLog(noteStore, 'notes', noteId, {
      content: mergedContent,
      updatedAt: new Date(),
      wordCount: markdownContent.length,
    });
  }, [applyKeyframeImages]);

  /** 创建新的课程笔记（Markdown 转 TipTap JSON） */
  const createCourseNote = useCallback(async (title: string, markdownContent: string) => {
    const now = new Date();
    const tipTapContent = markdownToTipTapJson(applyKeyframeImages(markdownContent));
    await createWithLog(noteStore, 'notes', {
      title,
      content: tipTapContent,
      template: 'blank',
      tags: [courseMeta.courseName ?? '课堂笔记'],
      createdAt: now,
      updatedAt: now,
      wordCount: markdownContent.length,
      pinned: false,
    });
  }, [courseMeta, applyKeyframeImages]);

  /** 计算当天同课程的采集序号（用于"第N次采集"标签） */
  const getSessionSeq = useCallback(async (): Promise<number> => {
    const name = courseMeta.courseName;
    if (!name) return 1;
    const notes = await fetchCourseNotes(name);
    const today = new Date().toLocaleDateString('zh-CN');
    const escaped = today.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let maxSeq = 0;
    for (const note of notes) {
      // content 为 TipTap JSON，直接在其字符串形式中检索分段标题
      const matches = (note.content ?? '').matchAll(new RegExp(`${escaped} 第(\\d+)次采集`, 'g'));
      for (const m of matches) {
        maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
      }
    }
    return maxSeq + 1;
  }, [courseMeta.courseName, fetchCourseNotes]);

  return { fetchCourseNotes, appendToNote, createCourseNote, getSessionSeq };
}
