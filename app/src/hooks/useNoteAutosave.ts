/**
 * useNoteAutosave — 笔记编辑自动保存 + 草稿层 hook（v0.14 子项目 A）。
 *
 * @ai-context: 自 NoteEditView 平移并增强：双计时器（idle 2s debounce / dirty 后
 *              maxWait 30s 必存）+ 确定性落库 flushLatest（v0.13.6 H1 教训：绕开
 *              saving 卫兵，ESC/完成/Ctrl+E 三出口共用）+ 卸载自动保存 + 草稿
 *              节流写入（localStorage 崩溃兜底，spec §4.4）。getSnapshot 注入
 *              快照读取（title/content 最新值），hook 与渲染层解耦可单测。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { clearDraft, writeDraft } from "../utils/draftStore";

const AUTOSAVE_IDLE_MS = 2000;
const AUTOSAVE_MAX_WAIT_MS = 30_000;
/** 草稿写入节流：doc 变化后 1s 落一次 localStorage（spec §4.4） */
const DRAFT_THROTTLE_MS = 1000;

interface Options {
  noteId: number;
  /** 读取当前 title/content 快照（调用方用 refs 保证最新值） */
  getSnapshot: () => { title: string; content: string };
  /** 保存失败回调（status 展示用） */
  onError?: (msg: string) => void;
}

export function useNoteAutosave({ noteId, getSnapshot, onError }: Options) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirtyRef = useRef(false);
  const onErrorRef = useRef(onError);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // 保存核心：清 dirty + 清草稿（保存成功草稿使命终结）；失败 status 展示
  const doSave = useCallback(async (createVersion: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const { title, content } = getSnapshot();
      await invoke("update_note", { id: noteId, title, content, createVersion });
      setDirty(false);
      clearDraft(noteId);
    } catch (e) {
      onErrorRef.current?.(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  }, [noteId, saving, getSnapshot]);
  const doSaveRef = useRef(doSave);
  useEffect(() => { doSaveRef.current = doSave; }, [doSave]);

  // 双计时器：idle debounce 每次变化重置；maxWait 只在 dirty 起点登记一次
  useEffect(() => {
    if (!dirty) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => void doSaveRef.current(false), AUTOSAVE_IDLE_MS);
    if (!maxWaitTimerRef.current) {
      maxWaitTimerRef.current = setTimeout(() => {
        maxWaitTimerRef.current = null;
        void doSaveRef.current(false);
      }, AUTOSAVE_MAX_WAIT_MS);
    }
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [dirty]);

  // dirty 清零后撤销 maxWait，避免干净态重复保存
  useEffect(() => {
    if (!dirty && maxWaitTimerRef.current) {
      clearTimeout(maxWaitTimerRef.current);
      maxWaitTimerRef.current = null;
    }
  }, [dirty]);

  // 卸载清理定时器（dirty 兜底由卸载保存负责）
  useEffect(() => () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (maxWaitTimerRef.current) clearTimeout(maxWaitTimerRef.current);
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
  }, []);

  // v0.13.6（审查 H1）：绕开 saving 卫兵的确定性落库——ESC/完成/Ctrl+E 共用
  const flushLatest = useCallback(async () => {
    if (!dirtyRef.current) return;
    const { title, content } = getSnapshot();
    await invoke("update_note", { id: noteId, title, content, createVersion: false });
    setDirty(false);
    clearDraft(noteId);
  }, [noteId, getSnapshot]);
  const flushLatestRef = useRef(flushLatest);
  useEffect(() => { flushLatestRef.current = flushLatest; }, [flushLatest]);

  // 草稿节流写入（崩溃/强杀后重开可恢复）
  const scheduleDraftWrite = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const { title, content } = getSnapshot();
      writeDraft(noteId, title, content);
    }, DRAFT_THROTTLE_MS);
  }, [noteId, getSnapshot]);

  // 卸载自动保存（切笔记/切页不丢编辑内容；保存成功清草稿）
  useEffect(() => () => {
    if (dirtyRef.current) {
      const { title, content } = getSnapshot();
      void invoke("update_note", { id: noteId, title, content, createVersion: false })
        .then(() => clearDraft(noteId))
        .catch((e) => console.warn(`[useNoteAutosave] 卸载自动保存失败（笔记 ${noteId}）`, e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // 稳定化返回：下游 useMemo/useCallback 依赖这些函数，每次渲染新建会导致依赖链失效
  const markDirty = useCallback(() => setDirty(true), []);
  const saveVersioned = useCallback(() => void doSaveRef.current(true), []);
  const saveLight = useCallback(() => void doSaveRef.current(false), []);

  return {
    dirty,
    saving,
    /** 内容/标题变化时调用（重启双计时器 + 节流草稿） */
    markDirty,
    /** 显式保存建版本（Ctrl+S/保存按钮） */
    saveVersioned,
    /** 轻量保存不建版本（onBlur/自动保存语义） */
    saveLight,
    /** 三出口确定性落库（在途自动保存场景也强制最新快照） */
    flushLatest,
    flushLatestRef,
    /** doc/title 变化后调度草稿写入 */
    scheduleDraftWrite,
  };
}
