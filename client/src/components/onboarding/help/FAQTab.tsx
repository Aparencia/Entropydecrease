/**
 * FAQTab — 常见问题折叠面板
 *
 * @ai-context: 通用组件：FAQTab。
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    question: '如何切换深海/穹顶模式？',
    answer: '在3D主界面点击右下角的主题切换按钮，或使用命令面板（Ctrl+K）搜索"切换主题"。深海模式适合暗光环境，穹顶模式适合明亮环境。',
  },
  {
    question: '番茄钟沉浸模式是什么？',
    answer: '沉浸模式会在专注计时期间隐藏大部分 UI 元素，仅保留计时器和背景，帮助你减少干扰、深度投入学习。可在深潜模块设置中开启。',
  },
  {
    question: '如何查看所有快捷键？',
    answer: '打开帮助中心（Ctrl+/）→ 切换到"快捷键"标签页，即可查看所有可用快捷键及其说明。也可以在命令面板（Ctrl+K）中查看操作对应的快捷键。',
  },
  {
    question: '数据保存在哪里？',
    answer: '所有数据默认保存在本地浏览器存储中（IndexedDB / LocalStorage），确保离线可用。桌面端数据保存在应用本地目录。如果配置了云端同步，数据会自动备份到服务器。',
  },
  {
    question: '如何重置引导？',
    answer: '打开帮助中心（Ctrl+/）→ 在"快速上手"标签页底部点击"重新播放引导"按钮。这会清除引导完成记录，立即重新展示7步新手引导。',
  },
  {
    question: 'AI 功能需要联网吗？',
    answer: '是的，AI 增强功能（如智能总结、卡片生成、费曼对话等）需要网络连接来调用 AI 模型。基础的学习、笔记、记忆卡片功能可以完全离线使用。',
  },
  {
    question: '如何导出我的学习数据？',
    answer: '使用命令面板（Ctrl+K）搜索"导出"，或进入设置 → 数据管理 → 导出数据。支持 JSON 格式导出全部学习记录、笔记和卡片数据。',
  },
  {
    question: '费曼学习法怎么用？',
    answer: '进入"浮出水面"模块，选择一个要讲解的概念，用你自己的话写出来。系统会用 AI 分析你的解释，指出遗漏或逻辑不清的地方，帮助你加深理解。',
  },
  {
    question: '记忆卡片的间隔重复是什么原理？',
    answer: '基于 SM-2 算法的科学记忆方法。系统会根据你对每张卡片的熟悉程度，自动安排最优的复习时间。越熟悉的卡片复习间隔越长，越不熟悉的则会更频繁出现。',
  },
  {
    question: '支持哪些浏览器？',
    answer: '推荐使用 Chrome 90+、Edge 90+、Firefox 88+ 或 Safari 15+。3D 场景需要 WebGL 2.0 支持。桌面端（Electron）在所有主流系统上均可运行。',
  },
];

function AccordionItem({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden bg-white/5 hover:bg-white/[0.07] transition-colors">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <span className="text-sm font-medium text-white/85 flex-1">{item.question}</span>
        <ChevronDown
          className={`w-4 h-4 text-white/40 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-0 border-t border-white/5">
          <p className="text-sm text-white/60 leading-relaxed">{item.answer}</p>
        </div>
      )}
    </div>
  );
}

export function FAQTab() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {FAQS.map((item, i) => (
        <AccordionItem
          key={i}
          item={item}
          isOpen={openIndex === i}
          onToggle={() => setOpenIndex(openIndex === i ? null : i)}
        />
      ))}
    </div>
  );
}
