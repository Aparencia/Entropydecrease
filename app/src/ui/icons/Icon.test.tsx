// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "./index";
import { SCALE_TOKENS } from "../tokens";

const getSvg = (container: HTMLElement) => container.querySelector("svg")!;

describe("Icon 渲染契约", () => {
  it("渲染一个 svg，viewBox 取自真源（24 网格）", () => {
    const { container } = render(<Icon name="notes" />);
    expect(getSvg(container).getAttribute("viewBox")).toBe(`0 0 ${SCALE_TOKENS.iconGrid} ${SCALE_TOKENS.iconGrid}`);
  });

  it("默认尺寸 20，可用 size 覆盖为 16 / 24", () => {
    const { container, rerender } = render(<Icon name="notes" />);
    expect(getSvg(container).getAttribute("width")).toBe("20");
    rerender(<Icon name="notes" size={16} />);
    expect(getSvg(container).getAttribute("width")).toBe("16");
    expect(getSvg(container).getAttribute("height")).toBe("16");
    rerender(<Icon name="notes" size={24} />);
    expect(getSvg(container).getAttribute("width")).toBe("24");
  });

  it("描边颜色是 currentColor —— 这是不用 emoji 的核心理由", () => {
    const { container } = render(<Icon name="notes" />);
    expect(getSvg(container).getAttribute("stroke")).toBe("currentColor");
  });

  it("填充为 none（线性图标，非实心）", () => {
    const { container } = render(<Icon name="notes" />);
    expect(getSvg(container).getAttribute("fill")).toBe("none");
  });

  it("描边宽度引用 token 且带字面量兜底（测试环境未加载 tokens.css）", () => {
    const { container } = render(<Icon name="notes" />);
    expect(getSvg(container).getAttribute("stroke-width")).toBe(`var(--ed-icon-stroke, ${SCALE_TOKENS.iconStroke})`);
  });

  it("默认是装饰性的：aria-hidden，且不进可及性树", () => {
    const { container } = render(<Icon name="notes" />);
    expect(getSvg(container).getAttribute("aria-hidden")).toBe("true");
    expect(getSvg(container).hasAttribute("aria-label")).toBe(false);
    expect(getSvg(container).hasAttribute("role")).toBe(false);
  });

  it("给了 label 则角色变为 img 并暴露名字", () => {
    const { container } = render(<Icon name="notes" label="笔记" />);
    expect(getSvg(container).getAttribute("role")).toBe("img");
    expect(getSvg(container).getAttribute("aria-label")).toBe("笔记");
    expect(getSvg(container).hasAttribute("aria-hidden")).toBe(false);
  });

  it("渲染出几何数据的全部元素（数量与 tag 与数据一致）", () => {
    const { container } = render(<Icon name="notes" />);
    const svg = getSvg(container);
    expect(svg.querySelectorAll("path").length).toBe(2);
  });

  it("不含任何字面量颜色（继承父级墨度是全部意义所在）", () => {
    const { container } = render(<Icon name="notes" size={24} />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(container.innerHTML).not.toMatch(/\b(?:rgb|hsl)a?\(/);
  });

  it("className 透传（供调用点做定位，不用于着色）", () => {
    const { container } = render(<Icon name="notes" className="my-slot" />);
    expect(getSvg(container).getAttribute("class")).toBe("my-slot");
  });
});
