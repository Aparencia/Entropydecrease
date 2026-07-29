/**
 * ShortcutsTab — 快捷键速查表：分组展示，kbd 样式
 *
 * @ai-context: 通用组件：ShortcutsTab。
 */

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

export function ShortcutsTab() {
  return (
    <div className="space-y-8">
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className="text-lg font-semibold text-white/90 mb-3">{group.title}</h3>
          <div className="space-y-1.5">
            {group.shortcuts.map((item) => (
              <div
                key={item.description}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="text-sm text-white/70">{item.description}</span>
                <div className="flex items-center gap-1">
                  {item.keys.map((key, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-white/30 text-xs">+</span>}
                      <kbd className="px-2 py-0.5 rounded-md bg-white/10 border border-white/20 text-xs font-mono text-white/80 min-w-[1.5rem] text-center">
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
  );
}
