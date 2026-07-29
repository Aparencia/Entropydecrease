/**
 * @ai-context: notes 功能模块 Hook：useAutoSave。
 */
import { useRef, useCallback, useState, useEffect } from 'react';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

const SAVE_STATUS_HIDE_DELAY_MS = 2000;
const AUTOSAVE_DEBOUNCE_MS = 500;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * 自动保存 Hook
 * 提供防抖保存和保存状态指示。
 */
export function useAutoSave(
  noteId: string | null,
  updateNote: (id: string, data: { content: string }) => Promise<void>,
) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSave = useCallback(
    (content: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        if (noteId) {
          setSaveStatus('saving');
          try {
            await updateNote(noteId, { content });
            soundPlayer.play('note_autosave');
            setSaveStatus('saved');
            if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
            saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), SAVE_STATUS_HIDE_DELAY_MS);
          } catch {
            setSaveStatus('failed');
          }
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [noteId, updateNote],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    };
  }, []);

  return { debouncedSave, saveStatus };
}
