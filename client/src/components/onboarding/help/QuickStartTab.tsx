/**
 * QuickStartTab — 快速上手指引：3D导航说明 + 模块一览表 + 重播引导
 *
 * @ai-context: 通用组件：QuickStartTab。
 */
import { Compass, RotateCw, MousePointerClick, ScrollText } from 'lucide-react';
import { useOnboardingStore } from '../useOnboardingStore';

const MODULES = [
  { color: 'bg-indigo-500', name: '仪表盘', desc: '学习概览与数据统计' },
  { color: 'bg-rose-500', name: '深潜', desc: '番茄钟专注与休息提醒' },
  { color: 'bg-emerald-500', name: '结礁', desc: '学习笔记管理与富文本编辑' },
  { color: 'bg-amber-500', name: '反衰减呼吸', desc: '间隔重复记忆卡片' },
  { color: 'bg-cyan-500', name: '浮出水面', desc: '费曼学习法输出练习' },
  { color: 'bg-purple-500', name: '灵感', desc: '灵感收集与知识关联' },
];

export function QuickStartTab() {
  const closeHelp = useOnboardingStore((s) => s.closeHelp);

  const handleReplayGuide = () => {
    localStorage.removeItem('kb-3d-guide-done');
    closeHelp();
    // 短暂延迟后启动引导，让面板先关闭
    setTimeout(() => {
      useOnboardingStore.getState().startGuide();
    }, 300);
  };

  return (
    <div className="space-y-8">
      {/* 3D 导航说明 */}
      <section>
        <h3 className="text-lg font-semibold text-white/90 mb-4 flex items-center gap-2">
          <Compass className="w-5 h-5 text-indigo-400" />
          3D 导航
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: MousePointerClick, label: '点击物体', desc: '进入对应学习模块' },
            { icon: RotateCw, label: '拖拽旋转', desc: '浏览3D空间全景' },
            { icon: ScrollText, label: '滚轮缩放', desc: '拉近/拉远视角' },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
            >
              <item.icon className="w-5 h-5 text-indigo-300 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white/80">{item.label}</p>
                <p className="text-xs text-white/50">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 模块功能一览表 */}
      <section>
        <h3 className="text-lg font-semibold text-white/90 mb-4">模块一览</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {MODULES.map((m) => (
            <div key={m.name} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
              <div className={`w-3 h-3 rounded-full ${m.color} shrink-0`} />
              <div>
                <span className="text-sm font-medium text-white/80">{m.name}</span>
                <span className="text-xs text-white/50 ml-2">{m.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 重播引导 */}
      <section className="pt-2">
        <button
          onClick={handleReplayGuide}
          className="px-5 py-2.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 text-sm font-medium transition-colors"
        >
          重新播放引导
        </button>
        <p className="text-xs text-white/40 mt-2">清除引导记录，下次打开时将重新展示7步引导</p>
      </section>
    </div>
  );
}
