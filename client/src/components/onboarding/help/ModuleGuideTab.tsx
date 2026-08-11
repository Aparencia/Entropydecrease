/**
 * ModuleGuideTab — 6个模块的详细说明卡片，折叠/展开式
 *
 * @ai-context: 通用组件：ModuleGuideTab。
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface ModuleInfo {
  color: string;
  name: string;
  description: string;
  scenarios: string;
  aiCapability: string;
}

const MODULES: ModuleInfo[] = [
  {
    color: 'bg-brand-500',
    name: '仪表盘',
    description: '学习数据的可视化中心，展示学习时长、效率趋势、模块使用分布等关键指标。',
    scenarios: '查看每日/周学习报告，了解学习进度与效率变化。',
    aiCapability: 'AI 自动生成学习建议与效率分析报告。',
  },
  {
    color: 'bg-rose-500',
    name: '深潜（番茄钟）',
    description: '基于番茄工作法的专注计时器，支持自定义专注/休息时长，提供沉浸模式。',
    scenarios: '课堂听讲、自主复习、完成作业时保持专注。',
    aiCapability: 'AI 分析专注模式，智能推荐最佳学习时段。',
  },
  {
    color: 'bg-emerald-500',
    name: '结礁（笔记）',
    description: '富文本学习笔记管理，支持 Markdown、代码高亮、图片插入与标签分类。',
    scenarios: '课堂笔记、知识点整理、读书笔记记录。',
    aiCapability: 'AI 辅助总结、提取关键概念、生成思维导图。',
  },
  {
    color: 'bg-amber-500',
    name: '反衰减呼吸（卡片）',
    description: '基于间隔重复算法的记忆卡片系统，科学安排复习时间，对抗遗忘曲线。',
    scenarios: '背诵公式、记忆术语、复习考试重点。',
    aiCapability: 'AI 自动从笔记生成记忆卡片，智能调整复习间隔。',
  },
  {
    color: 'bg-cyber',
    name: '浮出水面（费曼）',
    description: '费曼学习法实践工具，用自己的话解释概念，发现知识盲区。',
    scenarios: '检验理解深度、考前自测、向他人讲解前准备。',
    aiCapability: 'AI 扮演听众，指出解释中的逻辑漏洞与遗漏。',
  },
  {
    color: 'bg-accent-500',
    name: '灵感',
    description: '灵感收集与知识关联网络，捕捉学习中的灵感瞬间，建立知识间联系。',
    scenarios: '头脑风暴、跨学科关联、创意记录。',
    aiCapability: 'AI 发现知识点间的隐含关联，推荐相关内容。',
  },
  {
    color: 'bg-lime-500',
    name: '标准作业（SOP）',
    description: '标准作业流程：把可复用的学习流程固化为模板，按步骤逐步执行并推进。',
    scenarios: '固定学习流程（预习-听课-复习）、周复盘仪式、长任务拆解。',
    aiCapability: 'AI 校验模板步骤完整性（lint），流程可导出/导入分享。',
  },
];

function ModuleCard({ module }: { module: ModuleInfo }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden transition-colors hover:bg-white/[0.07]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className={`w-3 h-3 rounded-full ${module.color} shrink-0`} />
        <span className="text-sm font-medium text-white/90 flex-1">{module.name}</span>
        <ChevronDown
          className={`w-4 h-4 text-white/40 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t border-white/5">
          <div>
            <p className="text-xs font-medium text-white/50 mb-1">功能描述</p>
            <p className="text-sm text-white/70">{module.description}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-white/50 mb-1">使用场景</p>
            <p className="text-sm text-white/70">{module.scenarios}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-white/50 mb-1">AI 增强</p>
            <p className="text-sm text-white/70">{module.aiCapability}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function ModuleGuideTab() {
  return (
    <div className="space-y-3">
      {MODULES.map((m) => (
        <ModuleCard key={m.name} module={m} />
      ))}
    </div>
  );
}
