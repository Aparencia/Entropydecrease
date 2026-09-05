// @vitest-environment jsdom
/**
 * useRefineStream.test.ts — 流式片正文归集纯函数（REQ-290①，v0.19.7）。
 *
 * @ai-context: sliceStreamContent 契约——delta 逐节增量按到达序拼接（打字机）；
 *              blockDone 作终稿标记（已有 delta 时忽略其重复文本——流式片）；
 *              无 delta 的整包片（模型未逐节/重试拍）仍由 blockDone 提供正文；
 *              输出按 sliceIndex 升序（乱序到达排序）；complete=终稿已到。
 */
import { describe, expect, it } from "vitest";
import { sliceStreamContent, type RefineStreamFrame } from "./useRefineStream";

function f(kind: RefineStreamFrame["kind"], idx: number, text = ""): RefineStreamFrame {
  if (kind === "delta") return { kind: "delta", sliceIndex: idx, text };
  if (kind === "blockDone") return { kind: "blockDone", sliceIndex: idx, markdown: text };
  if (kind === "progress") return { kind: "progress", sliceIndex: idx, sliceTotal: 3 };
  if (kind === "done") return { kind: "done", slices: 2, failedSlices: 0 };
  throw new Error(`unused kind: ${kind}`);
}

describe("sliceStreamContent 归集（REQ-290①）", () => {
  it("delta 按到达序拼接为打字机正文，blockDone 只收尾不重复", () => {
    const frames: RefineStreamFrame[] = [
      f("delta", 1, "## 节A\n\n正文一"),
      f("delta", 1, "\n\n## 节B\n\n正文二"),
      f("blockDone", 1, "忽略的整片终稿"),
    ];
    const out = sliceStreamContent(frames);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("## 节A\n\n正文一\n\n## 节B\n\n正文二");
    expect(out[0].complete).toBe(true);
  });

  it("无 delta 的整包片由 blockDone 提供正文（旧路径兼容）", () => {
    const out = sliceStreamContent([f("blockDone", 2, "整片 markdown")]);
    expect(out).toEqual([{ sliceIndex: 2, text: "整片 markdown", complete: true }]);
  });

  it("乱序到达按 sliceIndex 升序输出；进行中片带 ▍ 判定输入（complete=false）", () => {
    const frames: RefineStreamFrame[] = [
      f("delta", 2, "片2部分"),
      f("delta", 1, "片1部分"),
    ];
    const out = sliceStreamContent(frames);
    expect(out.map((s) => s.sliceIndex)).toEqual([1, 2]);
    expect(out[0].complete).toBe(false);
    expect(out[0].text).toBe("片1部分");
  });

  it("进度/失败/done 帧不影响正文归集", () => {
    const frames: RefineStreamFrame[] = [
      f("progress", 1),
      { kind: "sliceFailed", sliceIndex: 3, reason: "x" },
      { kind: "done", slices: 2, failedSlices: 1 },
      f("blockDone", 1, "md"),
    ];
    const out = sliceStreamContent(frames);
    expect(out).toEqual([{ sliceIndex: 1, text: "md", complete: true }]);
  });
});
