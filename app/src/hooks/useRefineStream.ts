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
  | { kind: "sliceFailed"; sliceIndex: number; reason: string }
  | { kind: "done"; slices: number; failedSlices: number };

export function useRefineStream(taskId: number | null): RefineStreamFrame[] {
  const [frames, setFrames] = useState<RefineStreamFrame[]>([]);
  useEffect(() => {
    if (taskId == null) return;
    setFrames([]);
    const un = listen<{ taskId: number; frame: RefineStreamFrame }>("ai:refine-stream", (e) => {
      if (e.payload.taskId !== taskId) return;
      setFrames((f) => [...f, e.payload.frame]);
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
