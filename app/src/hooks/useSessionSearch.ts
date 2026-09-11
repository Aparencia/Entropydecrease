/**
 * useSessionSearch — 会话列表三模式搜索（批 0-C2 自 SessionListPanel 拆出）。
 *
 * @ai-context: TD-2026-08-19-E 三模式：标题（本地即时过滤——keyword 交由面板的视图
 *              模型消费）/ 内容（段搜索 search_session_segments，REQ-079）/ 画面
 *              （图内文字检索 search_ocr_blocks，REQ-133）。本 hook 是**全文件唯一**
 *              两个 invoke 的落点，面板因此成为零 Tauri 依赖的纯编排组件。
 * @ai-context 边界：
 *              ① 空关键词**短路不 invoke**——只把对应命中清成 null（回到列表视图）；
 *              ② invoke 失败走 showToast(`…失败: ${e}`, "err") 降级，命中保持上一次；
 *              ③ 画面检索有 ocrBusy（按钮禁用 + 「检索中…」），段搜索无 busy（既有行为）；
 *              ④ 切模式清 hits/ocrHits，但**不清 searchKw**（关键词跨模式复用，既有行为）；
 *              ⑤ 命中非空即接管列表区（列表/分组不渲染），批量栏同时隐藏。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { OcrBlockHit, SegmentHit } from "../types";

export type SearchMode = "title" | "content" | "ocr";

interface Options {
  showToast: (msg: string, kind: "ok" | "err") => void;
}

export function useSessionSearch({ showToast }: Options) {
  const [keyword, setKeyword] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("title");
  const [searchKw, setSearchKw] = useState("");
  const [hits, setHits] = useState<SegmentHit[] | null>(null); // REQ-079：段搜索命中
  // TD-2026-08-19-E 清偿：图内文字检索命中（REQ-133 search_ocr_blocks 前端接入）
  const [ocrHits, setOcrHits] = useState<OcrBlockHit[] | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);

  /** REQ-079：段搜索（片段上下文 + 点击跳详情） */
  const searchSegments = async () => {
    const kw = searchKw.trim();
    if (!kw) {
      setHits(null);
      return;
    }
    try {
      setHits(await invoke<SegmentHit[]>("search_session_segments", { keyword: kw }));
    } catch (e) {
      showToast(`段搜索失败: ${e}`, "err");
    }
  };

  /** TD-2026-08-19-E 清偿：图内文字检索（REQ-133——搜 PPT 上的词命中图） */
  const searchOcrBlocks = async () => {
    const kw = searchKw.trim();
    if (!kw) {
      setOcrHits(null);
      return;
    }
    setOcrBusy(true);
    try {
      setOcrHits(await invoke<OcrBlockHit[]>("search_ocr_blocks", { keyword: kw }));
    } catch (e) {
      showToast(`画面检索失败: ${e}`, "err");
    } finally {
      setOcrBusy(false);
    }
  };

  /** 切模式：清两类命中（命中视图随之退回列表）；searchKw 保留（跨模式复用） */
  const selectMode = (mode: SearchMode) => {
    setSearchMode(mode);
    setHits(null);
    setOcrHits(null);
  };

  return {
    keyword, setKeyword, searchMode, selectMode, searchKw, setSearchKw,
    hits, ocrHits, ocrBusy, searchSegments, searchOcrBlocks,
  };
}
