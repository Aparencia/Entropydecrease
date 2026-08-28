/**
 * resolveNoteImageSrc.test.ts — utils/resolveNoteImageSrc.ts 单测（spec §6.1）。
 */
import { describe, expect, it } from "vitest";
import { resolveNoteImageSrc } from "./resolveNoteImageSrc";

describe("resolveNoteImageSrc", () => {
  it("外链 http/https 直出", () => {
    expect(resolveNoteImageSrc("https://example.com/a.png")).toBe("external");
    expect(resolveNoteImageSrc("http://example.com/a.png")).toBe("external");
  });

  it("data/blob 直出", () => {
    expect(resolveNoteImageSrc("data:image/png;base64,AAA")).toBe("external");
    expect(resolveNoteImageSrc("blob:file-123")).toBe("external");
  });

  it("相对路径/绝对路径视为本地引用", () => {
    expect(resolveNoteImageSrc("notes-images/1/a.png")).toBe("local");
    expect(resolveNoteImageSrc("session-images/5/full/100.webp")).toBe("local");
    expect(resolveNoteImageSrc("C:\\data\\a.png")).toBe("local");
    expect(resolveNoteImageSrc("/abs/path/a.png")).toBe("local");
  });

  it("空/纯空白 src 无效", () => {
    expect(resolveNoteImageSrc("")).toBe("invalid");
    expect(resolveNoteImageSrc("   ")).toBe("invalid");
  });

  it("空白包裹的外链仍识别（trim 后判定）", () => {
    expect(resolveNoteImageSrc("  https://example.com/a.png  ")).toBe("external");
  });
});
