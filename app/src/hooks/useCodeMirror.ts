/**
 * useCodeMirror — CodeMirror 6 生命周期封装（v0.14 子项目 A）。
 *
 * @ai-context: 项目无 UI 包装库风格（不引 @uiw/react-codemirror，spec §3.3），手写
 *              hook：容器 ref → 挂载 EditorView；doc 外部同步（note 切换/外部更新）；
 *              updateListener 回传 doc 变化；卸载 destroy。编辑器非受控——React
 *              只负责容器与旁路状态（dirty/草稿/保存）。
 */
import { useEffect, useRef } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

interface Options {
  /** 初始/外部 doc（markdown 字符串） */
  doc: string;
  extensions: Extension[];
  /** doc 变化回调（updateListener 内，含工具栏/快捷键所有 transaction） */
  onChange?: (doc: string) => void;
  /** 光标所在行标题级别回调（0=非标题；工具栏高亮态用） */
  onHeadingLevelChange?: (level: number) => void;
  /** CM 初始化失败回调（降级护栏用，catch 挂载异常） */
  onInitError?: (e: unknown) => void;
}

/** 更新监听扩展：过滤非内容变化（selection-only）减少无谓回调 */
function updateListener(
  onChange?: (doc: string) => void,
  onHeadingLevelChange?: (level: number) => void,
): Extension {
  return EditorView.updateListener.of((update) => {
    if (update.docChanged) onChange?.(update.state.doc.toString());
    // 光标行标题级别（selection 变化或内容变化都可能影响当前行级别）
    if ((update.selectionSet || update.docChanged) && onHeadingLevelChange) {
      const line = update.state.doc.lineAt(update.state.selection.main.head);
      const m = /^(#{1,6})\s/.exec(line.text);
      onHeadingLevelChange(m ? m[1].length : 0);
    }
  });
}

export function useCodeMirror({ doc, extensions, onChange, onHeadingLevelChange, onInitError }: Options) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // 防循环：onChange 触发外部 setDoc → doc 同步 effect 判断值相同则跳过
  const lastDocRef = useRef(doc);
  const onChangeRef = useRef(onChange);
  const onHeadingLevelChangeRef = useRef(onHeadingLevelChange);
  const onInitErrorRef = useRef(onInitError);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onHeadingLevelChangeRef.current = onHeadingLevelChange; }, [onHeadingLevelChange]);
  useEffect(() => { onInitErrorRef.current = onInitError; }, [onInitError]);

  // 一次性挂载（组件 key 由父层控制——切笔记即重建）
  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;
    let view: EditorView | null = null;
    try {
      view = new EditorView({
        state: EditorState.create({
          doc,
          extensions: [...extensions, updateListener((d) => {
            lastDocRef.current = d;
            onChangeRef.current?.(d);
          }, (level) => onHeadingLevelChangeRef.current?.(level))],
        }),
        parent,
      });
      viewRef.current = view;
    } catch (e) {
      // 极端情况：CM 初始化失败 → 降级 textarea（RichEditorView 侧渲染 NoteEditView）
      onInitErrorRef.current?.(e);
      return;
    }
    return () => {
      view?.destroy();
      viewRef.current = null;
    };
    // 挂载仅一次；doc/extensions 变化走下方同步 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // doc 外部同步：非用户输入产生的 doc 变化（外部刷新/恢复草稿）→ 整体替换
  useEffect(() => {
    const view = viewRef.current;
    if (!view || doc === lastDocRef.current) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: doc },
      selection: { anchor: 0 },
    });
    lastDocRef.current = doc;
  }, [doc]);

  return { containerRef, viewRef };
}
