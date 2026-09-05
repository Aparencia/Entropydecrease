/**
 * useRefineStream — 精修流式帧订阅（v0.17.0 REQ-247，B+ 档）。
 *
 * @ai-context: 订阅 "ai:refine-stream" 事件（后端口径：片完成 validate 后推
 *              渲染 markdown——中间态永不承诺；失败帧诚实提示）。按 taskId
 *              过滤（多任务并行各收各的）；taskId 变化清空重订阅。
 */
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

/** 精修流式帧（Rust RefineStreamFrame；serde tag="kind" + camelCase 字段） */
export type RefineStreamFrame =
  | { kind: "progress"; sliceIndex: number; sliceTotal: number }
  | { kind: "blockDone"; sliceIndex: number; markdown: string }
  | { kind: "delta"; sliceIndex: number; text: string }
  | { kind: "sliceFailed"; sliceIndex: number; reason: string }
  | { kind: "done"; slices: number; failedSlices: number };

export function useRefineStream(taskId: number | null): RefineStreamFrame[] {
  const [frames, setFrames] = useState<RefineStreamFrame[]>([]);
  useEffect(() => {
    if (taskId == null) return;
    setFrames([]);
    // 审查修复：listen 失败容错（无事件系统环境/测试渲染——绝不抛未处理 rejection）
    const un = listen<{ taskId: number; frame: RefineStreamFrame }>("ai:refine-stream", (e) => {
      if (e.payload.taskId !== taskId) return;
      setFrames((f) => [...f, e.payload.frame]);
    }).catch(() => {
      /* 流式订阅不可用 = 呈现增强缺失，不影响任务主链路（轮询兜底） */
      return () => undefined;
    });
    return () => { void un.then((f) => f()); };
  }, [taskId]);
  return frames;
}

/** 帧归集：按片序排序的已到块（流式正文展示——乱序到达按 sliceIndex 排序） */
export function orderedBlockFrames(frames: RefineStreamFrame[]) {
  return frames
    .filter((f): f is { kind: "blockDone"; sliceIndex: number; markdown: string } => f.kind === "blockDone")
    .sort((a, b) => a.sliceIndex - b.sliceIndex);
}

/** 片正文（REQ-290①）：Delta 逐节增量按到达序拼接（打字机正文）；
 * 流式片完成后 blockDone 到达不再重复拼接（delta 已含全文）；非流式片
 * （模型未逐节/重试拍）仍由 blockDone 提供整片。complete=该片终稿已到。 */
export interface SliceStreamContent {
  sliceIndex: number;
  text: string;
  complete: boolean;
}

export function sliceStreamContent(frames: RefineStreamFrame[]): SliceStreamContent[] {
  const byIndex = new Map<number, SliceStreamContent>();
  const collect = (idx: number, text: string, complete: boolean) => {
    const cur = byIndex.get(idx);
    if (!cur) {
      byIndex.set(idx, { sliceIndex: idx, text, complete });
      return;
    }
    // 同一片：delta 追加；blockDone 作为终稿标记（有 delta 时忽略其文本）
    cur.text = complete && cur.text.length > 0 ? cur.text : cur.text + text;
    cur.complete = cur.complete || complete;
  };
  for (const f of frames) {
    if (f.kind === "delta") collect(f.sliceIndex, f.text, false);
    else if (f.kind === "blockDone") collect(f.sliceIndex, f.markdown, true);
  }
  return [...byIndex.values()].sort((a, b) => a.sliceIndex - b.sliceIndex);
}
