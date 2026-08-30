/**
 * clipboardImage.test.ts — 剪贴板图片提取纯函数单测（v0.15）。
 *
 * @ai-context: 结构契约——image/* 文件项 → {blob, mime}；无图片/空剪贴板 → null
 *              （调用方走默认文本粘贴）；多图取首张。纯函数无副作用。
 */
import { describe, expect, it } from "vitest";
import { extractClipboardImage, IMAGE_IMPORT_MAX_BYTES } from "./clipboardImage";

/** 构造最小粘贴事件桩（ClipboardEvent 构造器 jsdom 不支持 clipboardData——结构桩） */
function fakePaste(items: { kind: string; type: string; getAsFile?: () => Blob | null }[]): ClipboardEvent {
  return {
    clipboardData: {
      items: items.map((it) => ({
        kind: it.kind,
        type: it.type,
        getAsFile: it.getAsFile ?? null,
      })),
    },
  } as unknown as ClipboardEvent;
}

describe("extractClipboardImage", () => {
  it("image/* 文件项提取为 {blob, mime}", () => {
    const blob = new Blob(["x"], { type: "image/png" });
    const e = fakePaste([{ kind: "file", type: "image/png", getAsFile: () => blob }]);
    const img = extractClipboardImage(e);
    expect(img).not.toBeNull();
    expect(img?.mime).toBe("image/png");
    expect(img?.blob).toBe(blob);
  });

  it("纯文本粘贴（无图片项）→ null（走默认文本粘贴）", () => {
    const e = fakePaste([{ kind: "string", type: "text/plain" }]);
    expect(extractClipboardImage(e)).toBeNull();
  });

  it("多图取首张", () => {
    const first = new Blob(["a"], { type: "image/png" });
    const e = fakePaste([
      { kind: "file", type: "image/png", getAsFile: () => first },
      { kind: "file", type: "image/jpeg", getAsFile: () => new Blob(["b"], { type: "image/jpeg" }) },
    ]);
    expect(extractClipboardImage(e)?.blob).toBe(first);
  });

  it("空剪贴板/无 clipboardData → null", () => {
    expect(extractClipboardImage({ clipboardData: null } as unknown as ClipboardEvent)).toBeNull();
    expect(extractClipboardImage({} as ClipboardEvent)).toBeNull();
  });

  it("大小上限与后端对齐（10MB）", () => {
    expect(IMAGE_IMPORT_MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});
