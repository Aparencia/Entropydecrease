/**
 * @ai-context: 笔记页工具栏：三态侧栏开关、搜索、图谱/Markdown 导入/剪藏/迷你测试/
 * 批量管理/折纸/3D 开关、新建笔记按钮、批量操作条与标签筛选。自 NotesPage.tsx 原样拆出；
 * 文件输入 ref 内聚于本组件，其余状态/动作全部经 props 注入。
 * @ai-context: Notes page toolbar extracted verbatim from NotesPage.tsx. Hidden
 * file-input refs live here; all other state/actions are injected via props.
 */
import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PanelLeftClose, PanelLeft, PanelRightClose, PanelRight, Share2, Upload,
  Plus, ClipboardCheck, Layers, FoldVertical, Aperture, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { Tip } from '@/components/ui/Tip';
import { cn } from '@/lib/utils';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { NoteSearchBar } from '../components/NoteSearchBar';
import { NoteTagFilter } from '../components/NoteTagFilter';

interface NotesToolbarProps {
  /** 侧栏三态（左右互斥二选一，可全隐藏） */
  sideMode: 'left' | 'right' | 'none';
  /** 剪藏进行中（按钮禁用 + 文案） */
  clipLoading: boolean;
  /** 批量管理模式 */
  batchMode: boolean;
  /** 批量选中数量 */
  batchCount: number;
  /** 折纸视图开关 */
  origamiMode: boolean;
  /** 沉浸 3D 视图开关 */
  view3D: boolean;
  /** 展开/收起左栏（互斥） */
  onToggleLeftSidebar: () => void;
  /** 展开/收起右栏（互斥） */
  onToggleRightSidebar: () => void;
  /** 打开笔记图谱 */
  onOpenGraph: () => void;
  /** 选择 .md 文件后的导入处理 */
  onImportMarkdown: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** 选择 PDF 文件后的导入处理 */
  onClipPdf: () => void;
  /** 打开剪藏弹窗 */
  onOpenClip: () => void;
  /** 打开迷你测试弹窗 */
  onOpenQuiz: () => void;
  /** 切换批量管理模式 */
  onToggleBatch: () => void;
  /** 批量全选 */
  onSelectAll: () => void;
  /** 批量取消全选 */
  onClearBatch: () => void;
  /** 打开批量删除确认 */
  onOpenBatchDelete: () => void;
  /** 切换折纸视图 */
  onToggleOrigami: () => void;
  /** 切换沉浸 3D 视图 */
  onToggleView3D: () => void;
  /** 新建笔记（打开模板选择器） */
  onNewNote: () => void;
}

export default function NotesToolbar({
  sideMode,
  clipLoading,
  batchMode,
  batchCount,
  origamiMode,
  view3D,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  onOpenGraph,
  onImportMarkdown,
  onClipPdf,
  onOpenClip,
  onOpenQuiz,
  onToggleBatch,
  onSelectAll,
  onClearBatch,
  onOpenBatchDelete,
  onToggleOrigami,
  onToggleView3D,
  onNewNote,
}: NotesToolbarProps) {
  const mdInputRef = useRef<HTMLInputElement>(null);
  const clipInputRef = useRef<HTMLInputElement>(null);

  return (
    /* 工具栏 */
    <div className="sticky top-0 z-20 flex flex-col gap-2 px-4 py-3 border-b border-border/30 flex-shrink-0 backdrop-blur-md bg-bg-primary/80">
      <div className="flex items-center gap-2">
        {/* 左侧边栏控制按钮（文件组）：展开时自动收起右侧预览栏（互斥） */}
        <Tip text={sideMode === 'left' ? '收起文件夹栏' : '展开文件夹栏'}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onToggleLeftSidebar}
          className={cn(
            'hidden md:flex p-1.5 rounded-full transition-all duration-200',
            sideMode === 'left'
              ? 'text-brand-600 bg-brand-50/60'
              : 'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/40',
          )}
        >
          {sideMode === 'left' ? <PanelLeftClose className="w-5 h-5" strokeWidth={1.5} /> : <PanelLeft className="w-5 h-5" strokeWidth={1.5} />}
        </motion.button>
        </Tip>
        {/* 结礁仪式标识（compact）：三栏布局下的模块归属 */}
        <ModuleRitualHeader
          title="结礁"
          sealChar="礁"
          sealColor="#6B9BD2"
          compact
          className="mr-1"
        />
        <NoteSearchBar />
        {/* 右侧边栏控制按钮（预览区）：展开时自动收起左侧文件组（互斥） */}
        <Tip text={sideMode === 'right' ? '收起预览栏' : '展开预览栏'}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onToggleRightSidebar}
          className={cn(
            'hidden lg:flex p-1.5 rounded-full transition-all duration-200',
            sideMode === 'right'
              ? 'text-brand-600 bg-brand-50/60'
              : 'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/40',
          )}
        >
          {sideMode === 'right' ? <PanelRightClose className="w-5 h-5" strokeWidth={1.5} /> : <PanelRight className="w-5 h-5" strokeWidth={1.5} />}
        </motion.button>
        </Tip>
        {/* 笔记图谱按钮，升级原生 title 为 Tip 组件 */}
        <Tip text="笔记图谱">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onOpenGraph}
          className="p-2 rounded-full text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-all duration-200"
        >
          <Share2 className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        </Tip>
        {/* 导入 Markdown 按钮，升级原生 title 为 Tip 组件 */}
        <Tip text="导入 Markdown">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => mdInputRef.current?.click()}
          className="p-2 rounded-full text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-all duration-200"
        >
          <Upload className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        </Tip>
        {/* 剪藏按钮：导入网页或 PDF 为笔记 */}
        <Tip text={clipLoading ? '剪藏中…' : '剪藏'}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onOpenClip}
          disabled={clipLoading}
          className="p-2 rounded-full text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-all duration-200 disabled:opacity-40 relative"
        >
          <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">{clipLoading ? '…' : '+'}</span>
        </motion.button>
        </Tip>
        {/* 迷你测试按钮（N1）：选定多篇笔记生成课程级小测试 */}
        <Tip text="迷你测试">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onOpenQuiz}
          className="p-2 rounded-full text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-all duration-200"
        >
          <ClipboardCheck className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        </Tip>
        {/* 批量管理按钮（多选删除，对齐萤火海沟批量模式） */}
        <Tip text={batchMode ? '退出批量管理' : '批量管理'}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onToggleBatch}
          className={cn(
            'p-2 rounded-full transition-all duration-200',
            batchMode
              ? 'bg-brand-50 text-brand-600'
              : 'text-text-tertiary hover:text-brand-600 hover:bg-brand-50',
          )}
        >
          <Layers className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        </Tip>
        {/* 折纸视图开关：开启后笔记以 OrigamiView 网格展示（默认关闭，列表视图不受影响） */}
        <Tip text={origamiMode ? '退出折纸视图' : '折纸视图'}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onToggleOrigami}
          aria-pressed={origamiMode}
          className={cn(
            'p-2 rounded-full transition-all duration-200',
            origamiMode
              ? 'bg-brand-50 text-brand-600'
              : 'text-text-tertiary hover:text-brand-600 hover:bg-brand-50',
          )}
        >
          <FoldVertical className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        </Tip>
        {/* 沉浸 3D 视图开关：深色=沉降深渊 / 浅色=穹顶石窟（双形态随主题） */}
        <Tip text={view3D ? '退出沉浸视图' : '沉浸视图（3D）'}>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onToggleView3D}
          aria-pressed={view3D}
          className={cn(
            'p-2 rounded-full transition-all duration-200',
            view3D
              ? 'bg-brand-50 text-brand-600'
              : 'text-text-tertiary hover:text-brand-600 hover:bg-brand-50',
          )}
        >
          <Aperture className="w-4 h-4" strokeWidth={1.5} />
        </motion.button>
        </Tip>
        <input
          ref={mdInputRef}
          type="file"
          accept=".md,text/markdown"
          className="hidden"
          onChange={onImportMarkdown}
        />
        <input
          ref={clipInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={onClipPdf}
        />
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
          <Button size="sm" icon={<Plus className="w-4 h-4" strokeWidth={2} />} onClick={onNewNote}>
            新建笔记
          </Button>
        </motion.div>
      </div>
      {/* 批量操作条（批量模式下显示，对齐萤火海沟交互） */}
      <AnimatePresence>
        {batchMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 flex-wrap"
          >
            <motion.button whileTap={{ scale: 0.95 }} onClick={onSelectAll}
              className="px-2.5 py-1 rounded-full text-xs font-medium text-text-secondary bg-bg-secondary border border-border/40 hover:text-text-primary transition-colors">
              全选
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={onClearBatch}
              className="px-2.5 py-1 rounded-full text-xs font-medium text-text-tertiary bg-bg-secondary border border-border/40 hover:text-text-secondary transition-colors">
              取消全选
            </motion.button>
            <span className="text-c1 text-text-tertiary">已选中 {batchCount} 篇</span>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onOpenBatchDelete}
              disabled={batchCount === 0}
              className={cn(
                'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium',
                'bg-semantic-error/10 text-semantic-error border border-semantic-error/30',
                'hover:bg-semantic-error/20 transition-colors',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              <Trash2 className="w-3 h-3" strokeWidth={1.5} />
              删除选中
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
      <NoteTagFilter />
    </div>
  );
}
