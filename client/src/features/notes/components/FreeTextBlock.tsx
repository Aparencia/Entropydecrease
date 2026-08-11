/**
 * @ai-context: 通用组件：FreeTextBlock。
 */
import { useRef, useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { GripVertical, Trash2, Copy, Pencil } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import type { FreeCanvasBlock } from '@/types/models';

interface FreeTextBlockProps {
  block: FreeCanvasBlock;
  onMove: (id: string, x: number, y: number) => void;
  onContentChange: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onResize: (id: string, width: number, height: number) => void;
  isSelected: boolean;
  onSelect: (id: string, addToSelection?: boolean) => void;
  onReleaseOutside?: () => void;
  onDuplicate?: (id: string) => void;
}

export default function FreeTextBlock({
  block,
  onMove,
  onContentChange,
  onDelete,
  onResize,
  isSelected,
  onSelect,
  onReleaseOutside,
  onDuplicate,
}: FreeTextBlockProps) {
  const onMoveRef = useRef(onMove);
  const onContentChangeRef = useRef(onContentChange);
  const onResizeRef = useRef(onResize);
  onMoveRef.current = onMove;
  onContentChangeRef.current = onContentChange;
  onResizeRef.current = onResize;

  const rootRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [blockContextMenu, setBlockContextMenu] = useState<{ x: number; y: number } | null>(null);

  // 解析初始内容（TipTap JSON）
  const initialContent = (() => {
    if (!block.content) return undefined;
    try {
      const parsed = JSON.parse(block.content);
      if (parsed && parsed.type === 'doc') return parsed;
      return undefined;
    } catch {
      return undefined;
    }
  })();

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    immediatelyRender: false,
    // TipTap v3 需显式声明 tiptap 类以启用 index.css 的 .tiptap 样式
    editorProps: { attributes: { class: 'tiptap' } },
    onFocus: () => onSelect(block.id, false),
    onUpdate: ({ editor: e }) => {
      const json = e.getJSON();
      onContentChangeRef.current(block.id, JSON.stringify(json));
    },
  });

  // 拖拽移动逻辑（直接 DOM 操作，避免每帧 React re-render）
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;
      soundPlayer.play('ui_drag_start');
      const startX = e.clientX;
      const startY = e.clientY;
      const origX = block.position.x;
      const origY = block.position.y;
      let rafId = 0;

      const handleMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        dragOffsetRef.current = { x: dx, y: dy };
        // 直接操作 DOM transform，跳过 React 渲染
        if (rootRef.current) {
          cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            rootRef.current!.style.transform = `translate(${dx}px, ${dy}px)`;
          });
        }
      };

      const handleMouseUp = (ev: MouseEvent) => {
        isDraggingRef.current = false;
        soundPlayer.play('ui_drop');
        cancelAnimationFrame(rafId);
        // 清除拖拽中的 transform
        if (rootRef.current) {
          rootRef.current.style.transform = '';
        }
        // 提交最终位置到 React state
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        dragOffsetRef.current = { x: 0, y: 0 };
        onMoveRef.current(block.id, origX + dx, origY + dy);
        // 检查是否释放到块外部
        if (rootRef.current && onReleaseOutside) {
          const rect = rootRef.current.getBoundingClientRect();
          if (
            ev.clientX < rect.left || ev.clientX > rect.right ||
            ev.clientY < rect.top || ev.clientY > rect.bottom
          ) {
            onReleaseOutside();
          }
        }
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [block.id, block.position.x, block.position.y, onReleaseOutside],
  );

  // 调整大小逻辑
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const origW = block.size.width;
      const origH = typeof block.size.height === 'number' ? block.size.height : 120;

      const handleMouseMove = (ev: MouseEvent) => {
        const newW = Math.max(120, origW + (ev.clientX - startX));
        const newH = Math.max(60, origH + (ev.clientY - startY));
        onResizeRef.current(block.id, newW, newH);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [block.id, block.size.width, block.size.height],
  );

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBlockContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleBlockCopy = useCallback(() => {
    onDuplicate?.(block.id);
    setBlockContextMenu(null);
  }, [onDuplicate, block.id]);

  // 编辑器生命周期由 @tiptap/react v3 useEditor 托管（卸载时自动销毁），无需自定义 destroy。

  const blockHeight = typeof block.size.height === 'number' ? block.size.height : undefined;

  return (
    <>
      <div
        ref={rootRef}
        data-freeblock
        style={{
          position: 'absolute',
          left: block.position.x,
          top: block.position.y,
          width: block.size.width,
          height: blockHeight,
        }}
        className={cn(
          'bg-bg-elevated rounded-kb-md shadow-sm overflow-hidden flex flex-col border',
          isSelected ? 'ring-2 ring-blue-500/40 border-blue-500' : 'border-border/50',
        )}
        onClick={(e) => {
          onSelect(block.id, e.shiftKey);
          // 点击块体即聚焦编辑器，避免首次点击无响应（块内 mousedown 不再被画布 blur）
          if (!isDraggingRef.current) editor?.commands.focus();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onContextMenu={handleContextMenu}
      >
        {/* 拖拽手柄栏 */}
        <div
          className="flex items-center h-7 px-1.5 bg-bg-tertiary/60 border-b border-border/40 flex-shrink-0 cursor-grab select-none"
          onMouseDown={handleDragStart}
        >
          <GripVertical className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" strokeWidth={1.5} />
          <div className="flex-1" />
        </div>

        {/* TipTap 编辑区域 */}
        {editor && (
          <div className="flex-1 overflow-y-auto p-2 text-sm">
            <EditorContent editor={editor} />
          </div>
        )}

        {/* 右下角调整大小手柄 */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize select-none"
          style={{
            background:
              'linear-gradient(135deg, transparent 50%, rgba(156,163,175,0.5) 50%, rgba(156,163,175,0.5) 60%, transparent 60%, transparent 75%, rgba(156,163,175,0.5) 75%, rgba(156,163,175,0.5) 85%, transparent 85%)',
          }}
        />
      </div>

      {/* 块右键菜单 */}
      <AnimatePresence>
        {blockContextMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setBlockContextMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setBlockContextMenu(null); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className="fixed z-50 min-w-[160px] py-1.5 bg-bg-elevated/95 backdrop-blur-2xl rounded-[var(--kb-radius-xl)] shadow-kb-lg border border-border/40 overflow-hidden"
              style={{ left: blockContextMenu.x, top: blockContextMenu.y }}
            >
              <button
                onClick={() => { editor?.commands.focus('start'); setBlockContextMenu(null); }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-bg-sunken/60 transition-colors"
              >
                <Pencil className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                <span>编辑</span>
              </button>
              <button
                onClick={() => { onDelete(block.id); setBlockContextMenu(null); }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-bg-sunken/60 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                <span>删除</span>
              </button>
              <button
                onClick={() => { handleBlockCopy(); }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-bg-sunken/60 transition-colors"
              >
                <Copy className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                <span>复制</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
