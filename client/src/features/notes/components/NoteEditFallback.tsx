/**
 * 笔记编辑页加载/缺失回退视图
 * Note-edit page loading/missing fallback views
 *
 * @ai-context: 从 NoteEditPage 拆出。isLoading 时展示加载中 spinner；
 * 笔记不存在时展示缺失提示与返回列表按钮。纯展示层，返回动作由页面注入。
 * @ai-context: Extracted from NoteEditPage. Shows a loading spinner while
 * isLoading; shows a missing-note notice with a back-to-list button when the
 * note does not exist. Pure presentational; the back action is injected.
 */
interface NoteEditFallbackProps {
  loading: boolean;
  onBack: () => void;
}

export function NoteEditFallback({ loading, onBack }: NoteEditFallbackProps) {
  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="flex items-center gap-2 text-text-tertiary">
          <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
          <span className="text-b2">加载中...</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col h-full items-center justify-center">
      <div className="flex flex-col items-center gap-kb-md text-center">
        <h3 className="text-h2 font-medium text-text-primary">笔记不存在</h3>
        <p className="text-b2 text-text-tertiary">该笔记可能已被删除</p>
        <button
          onClick={onBack}
          className="mt-2 text-brand-600 hover:text-brand-700 text-b2 font-medium"
        >
          返回笔记列表
        </button>
      </div>
    </div>
  );
}
