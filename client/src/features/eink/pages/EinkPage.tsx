/**
 * EinkPage — 电子墨水学习板次窗口页面
 *
 * 由主进程 createEinkWindow() 打开（#/eink），针对电子墨水屏优化：
 * 纯黑白高对比、无动画、大字号衬线字体。
 * 通过 eink:card 事件接收闪卡，支持翻面与关闭次窗口。
 *
 * @ai-context: 3.18 电子墨水学习板——渲染端页面，与 electron/windowManager.ts
 * 的 showEinkCard/hideEinkWindow 及 preload 白名单 'eink:card' 配对使用。
 */

import { useEffect, useState } from 'react';

/** 主进程推送的卡片载荷（与 StudySessionPage handleEinkShow 序列化结构一致） */
interface EinkCardPayload {
  id: string;
  front: string;
  back: string;
}

/** 校验 IPC 载荷结构，损坏/未知载荷直接丢弃 */
function isEinkCardPayload(value: unknown): value is EinkCardPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.front === 'string' && typeof v.back === 'string';
}

export default function EinkPage() {
  const [card, setCard] = useState<EinkCardPayload | null>(null);
  const [showBack, setShowBack] = useState(false);

  // 订阅主进程卡片推送；卸载时自动取消监听
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return undefined;
    return api.on('eink:card', (payload: unknown) => {
      if (!isEinkCardPayload(payload)) return;
      setCard(payload);
      setShowBack(false);
    });
  }, []);

  /** 关闭墨水屏次窗口（幂等：非 Electron 环境静默忽略） */
  const handleHide = (): void => {
    const api = window.electronAPI;
    if (api) void api.invoke('eink:hide');
  };

  // 非 Electron 环境占位（例如浏览器中直接访问 #/eink）
  if (!window.electronAPI) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-3xl font-serif font-bold">墨水屏学习板</p>
          <p className="mt-8 text-xl text-gray-700">请通过桌面应用（Electron）打开此页面</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      <header className="border-b-2 border-black px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-serif font-bold tracking-wide">墨水屏学习板</h1>
        <button
          type="button"
          onClick={handleHide}
          className="text-xl border-2 border-black px-4 py-1 hover:bg-black hover:text-white"
        >
          关闭
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-10">
        {card ? (
          <>
            <div className="w-full max-w-2xl border-2 border-black p-8 min-h-[320px] flex flex-col">
              <p className="text-sm tracking-[0.3em] text-gray-800 mb-4">
                {showBack ? '答 案' : '问 题'}
              </p>
              <div className="flex-1 text-3xl font-serif leading-relaxed whitespace-pre-wrap break-words">
                {showBack ? card.back : card.front}
              </div>
            </div>

            <div className="mt-8 flex gap-6">
              <button
                type="button"
                onClick={() => setShowBack((v) => !v)}
                className="text-2xl font-serif border-2 border-black px-8 py-3 hover:bg-black hover:text-white"
              >
                {showBack ? '返回问题' : '显示答案'}
              </button>
              <button
                type="button"
                onClick={handleHide}
                className="text-2xl font-serif border-2 border-black px-8 py-3 hover:bg-black hover:text-white"
              >
                关闭
              </button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <p className="text-3xl font-serif font-bold">等待卡片推送…</p>
            <p className="mt-8 text-xl text-gray-700">
              在闪卡复习页点击「墨水屏复习」将卡片发送到此窗口
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
