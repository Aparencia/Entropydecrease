/**
 * 课堂窗口监听 hook（列表刷新 / 变化推送 / 课程名提取）
 *
 * @ai-context: 从 useClassroomCapture 拆出。窗口最小化时 IPC 会报告"不可见"，
 * 但这不等于关闭——故用连续消失计数（阈值 10 次轮询 ≈30s）容错：首次消失
 * 只提示不清除选中，恢复可见时提示"采集继续"，超阈值才判定关闭并清空。
 * 课程名规则提取：从窗口标题匹配常见课程关键词，作为 AI 识别不可用时的兜底。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { WindowInfo, CourseMeta } from '@/lib/capture';

/** 连续消失多少次轮询（~30s）才判定目标窗口真正关闭 */
const WINDOW_MISSING_THRESHOLD = 10;

/** 常见课程名关键词（规则模式兜底提取） */
const COURSE_KEYWORDS = /((?:高等数学|线性代数|概率论|大学物理|数据结构|操作系统|编译原理|离散数学|复变函数|英语|高数|大物|C语言|Python|Java|机器学习|深度学习|人工智能|计算机网络|数据库)[^\s|]*)/;

interface UseWindowWatcherOptions {
  courseMeta: CourseMeta;
  setCourseMeta: React.Dispatch<React.SetStateAction<CourseMeta>>;
  onNotify: (type: 'success' | 'warning' | 'error', message: string) => void;
}

export function useWindowWatcher({ courseMeta, setCourseMeta, onNotify }: UseWindowWatcherOptions) {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [windowsLoading, setWindowsLoading] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<WindowInfo | null>(null);
  const missingCountRef = useRef(0);

  const refreshWindows = useCallback(async () => {
    if (!window.electronAPI) return;
    setWindowsLoading(true);
    try {
      const result = await window.electronAPI.invoke('screen_list_windows');
      setWindows(result as WindowInfo[]);
    } catch {
      console.error('[useClassroomCapture] Failed to list windows');
    } finally {
      setWindowsLoading(false);
    }
  }, []);

  useEffect(() => { refreshWindows(); }, [refreshWindows]);

  // 窗口选中时自动提取课程名（规则模式）
  useEffect(() => {
    if (!selectedWindow) return;
    const match = selectedWindow.title.match(COURSE_KEYWORDS);
    if (match && !courseMeta.courseName) {
      setCourseMeta((prev) => ({ ...prev, courseName: match[1], detectedBy: 'window_title' }));
    }
  }, [selectedWindow]); // eslint-disable-line react-hooks/exhaustive-deps

  // 窗口变化监听（后台轮询 + 最小化容错）
  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.invoke('screen_watch_windows_start').catch(() => {});

    const unsubscribe = window.electronAPI.on('screen_windows_changed', (...args: unknown[]) => {
      const newWindows = args[1] as WindowInfo[] | undefined;
      if (!newWindows) return;
      setWindows(newWindows);

      // 检测当前选中窗口是否可见
      setSelectedWindow((prev) => {
        if (!prev) return prev;
        const stillVisible = newWindows.some((w) => w.id === prev.id);

        if (stillVisible) {
          // 窗口恢复可见，重置计数
          if (missingCountRef.current > 0) {
            missingCountRef.current = 0;
            onNotify('success', '目标窗口已恢复，采集继续');
          }
          return prev;
        }

        // 窗口不可见（可能最小化）
        missingCountRef.current += 1;
        if (missingCountRef.current === 1) {
          // 首次消失，提示用户但不清除选中
          onNotify('warning', '目标窗口不可见（可能已最小化），恢复窗口后自动继续采集');
        } else if (missingCountRef.current >= WINDOW_MISSING_THRESHOLD) {
          // 超过阈值，判定为真正关闭
          missingCountRef.current = 0;
          onNotify('error', '目标窗口已关闭，请重新选择');
          return null;
        }
        return prev; // 保留选中状态，等待窗口恢复
      });
    });

    return () => {
      window.electronAPI?.invoke('screen_watch_windows_stop').catch(() => {});
      unsubscribe();
    };
  }, [onNotify]);

  return { windows, windowsLoading, selectedWindow, setSelectedWindow, refreshWindows };
}
