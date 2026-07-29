/**
 * 自由画布浮层（右键菜单 + 操作面板 + 快捷键提示）
 *
 * @ai-context: 从 FreeCanvas 拆出的纯展示层——仅渲染由父组件传入的
 * 动作列表与开关状态，自身无业务逻辑。画布交互状态机（框选/平移/选中）
 * 仍耦合在 FreeCanvas 主体，属高内聚交互组件，不宜进一步拆解。
 */
import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

/** 画布操作项（右键菜单与操作面板共用） */
export interface CanvasAction {
  id: string;
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  execute: () => void;
}

interface FreeCanvasOverlaysProps {
  contextMenu: { x: number; y: number } | null;
  contextMenuActions: CanvasAction[];
  onCloseMenu: () => void;
  paletteOpen: boolean;
  actions: CanvasAction[];
  onClosePalette: () => void;
}

export function FreeCanvasOverlays({
  contextMenu,
  contextMenuActions,
  onCloseMenu,
  paletteOpen,
  actions,
  onClosePalette,
}: FreeCanvasOverlaysProps) {
  return (
    <>
      {/* 右键快捷菜单 */}
      <AnimatePresence>
        {contextMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={onCloseMenu}
              onContextMenu={(e) => { e.preventDefault(); onCloseMenu(); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className="fixed z-50 min-w-[180px] py-1.5 bg-bg-elevated/95 backdrop-blur-2xl rounded-[var(--kb-radius-xl)] shadow-kb-lg border border-border/40 overflow-hidden"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {contextMenuActions.map(action => (
                <button
                  key={action.id}
                  disabled={action.disabled}
                  onClick={() => { action.execute(); onCloseMenu(); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-bg-sunken/60 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  <action.icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                  <span>{action.label}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 操作面板 */}
      <AnimatePresence>
        {paletteOpen && (
          <>
            <div
              className="absolute inset-0 z-40"
              onClick={onClosePalette}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
              className="absolute left-1/2 top-12 z-50 -translate-x-1/2 w-[300px] bg-bg-elevated/90 backdrop-blur-2xl rounded-[var(--kb-radius-xl)] shadow-kb-lg border border-border/40 overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-border/30 flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">画布操作</span>
                <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-bg-sunken text-muted-foreground/70 font-mono">Shift+A</kbd>
              </div>
              <div className="py-1.5">
                {actions.map(action => (
                  <button
                    key={action.id}
                    disabled={action.disabled}
                    onClick={() => {
                      action.execute();
                      onClosePalette();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-bg-sunken/60 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <action.icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 右下角快捷键提示 */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 text-xs text-muted-foreground/50 select-none pointer-events-none">
        <span>Shift+A 操作面板 · 双击添加文本块 · Shift+拖拽框选 · 右键拖拽平移 · Ctrl+D 复制</span>
      </div>
    </>
  );
}
