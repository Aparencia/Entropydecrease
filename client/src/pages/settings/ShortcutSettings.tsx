/**
 * ShortcutSettings — 快捷键速查设置区块
 * 展示当前所有系统预设快捷键（只读）
 */
import { Keyboard } from 'lucide-react';

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: '导航',
    shortcuts: [
      { keys: ['1'], description: '打开仪表盘' },
      { keys: ['2'], description: '打开深潜（番茄钟）' },
      { keys: ['3'], description: '打开结礁（笔记）' },
      { keys: ['4'], description: '打开反衰减呼吸（卡片）' },
      { keys: ['5'], description: '打开浮出水面（费曼）' },
      { keys: ['6'], description: '打开灵感' },
      { keys: ['7'], description: '打开回声定位（课堂助手）' },
      { keys: ['0'], description: '打开设置' },
      { keys: ['Esc'], description: '退出/返回当前模块' },
    ],
  },
  {
    title: '操作',
    shortcuts: [
      { keys: ['Ctrl', 'K'], description: '打开命令面板' },
      { keys: ['Ctrl', 'N'], description: '新建笔记' },
      { keys: ['Ctrl', '/'], description: '打开帮助中心' },
      { keys: ['Ctrl', 'Shift', 'H'], description: '打开学习救援面板' },
    ],
  },
  {
    title: '通用',
    shortcuts: [
      { keys: ['Ctrl', 'Z'], description: '撤销' },
      { keys: ['Ctrl', 'Shift', 'Z'], description: '重做' },
      { keys: ['Ctrl', 'S'], description: '保存（自动保存已开启）' },
    ],
  },
];

export default function ShortcutSettings() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Keyboard className="w-icon-md h-icon-md text-brand-500" strokeWidth={1.5} />
        <h2 className="text-b1 font-semibold text-text-primary">快捷键</h2>
      </div>
      <p className="text-b3 text-text-tertiary mb-4">
        以下快捷键为系统预设，可在学习任意页面使用
      </p>

      <div className="space-y-5">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="text-c1 font-medium text-text-secondary mb-2">{group.title}</h3>
            <div className="space-y-1">
              {group.shortcuts.map((item) => (
                <div
                  key={item.description}
                  className="flex items-center justify-between py-1.5 px-3 rounded-kb-md hover:bg-bg-tertiary/50 transition-colors"
                >
                  <span className="text-b3 text-text-secondary">{item.description}</span>
                  <div className="flex items-center gap-1">
                    {item.keys.map((key, i) => (
                      <span key={i} className="flex items-center gap-1">
                        {i > 0 && <span className="text-text-tertiary/50 text-xs">+</span>}
                        <kbd className="px-2 py-0.5 rounded-kb-sm bg-bg-tertiary border border-border/40 text-xs font-mono text-text-primary min-w-[1.5rem] text-center">
                          {key}
                        </kbd>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
