/**
 * imageDecoration.test.ts — components/imageDecoration.ts 单测（spec §6.1）。
 */
import { describe, expect, it } from "vitest";
import { scanImageRefs } from "./imageDecoration";

describe("scanImageRefs", () => {
  it("独立行图片", () => {
    const refs = scanImageRefs("![图](notes-images/1/a.png)");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ from: 0, to: 26, alt: "图", url: "notes-images/1/a.png" });
  });

  it("行内图片（前后有文本）", () => {
    const refs = scanImageRefs("前文 ![alt](x.png) 后文");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ from: 3, alt: "alt", url: "x.png" });
  });

  it("无 alt 图片", () => {
    const refs = scanImageRefs("![](a.png)");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ alt: "", url: "a.png" });
  });

  it("嵌套括号 URL 完整匹配", () => {
    const refs = scanImageRefs("![图](a(b)c.png)");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ url: "a(b)c.png" });
    // 整段范围到最外层闭合括号
    expect(refs[0].to).toBe("![图](a(b)c.png)".length);
  });

  it("未闭合括号不视为图片", () => {
    expect(scanImageRefs("![图](a(b.png")).toHaveLength(0);
  });

  it("多图同行各自匹配", () => {
    const refs = scanImageRefs("![a](1.png) ![b](2.png)");
    expect(refs).toHaveLength(2);
    expect(refs[0].url).toBe("1.png");
    expect(refs[1].url).toBe("2.png");
  });

  it("普通链接不误匹配", () => {
    const refs = scanImageRefs("见 [文档](doc.md) 与 [图](img.png)");
    expect(refs).toHaveLength(0);
  });

  it("感叹号文本不误匹配（后非左括号）", () => {
    expect(scanImageRefs("强调！[链接](a.md)")).toHaveLength(0);
  });

  it("空文档 / 无图文档", () => {
    expect(scanImageRefs("")).toHaveLength(0);
    expect(scanImageRefs("纯文本\n第二行")).toHaveLength(0);
  });
});
