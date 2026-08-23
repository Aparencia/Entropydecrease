// @vitest-environment jsdom
/**
 * ModelCardCreateDialog.test.tsx — 组侧「＋ 概念卡」弹窗交互测试（v0.13.2 §六）。
 *
 * @ai-context: 覆盖 §五 组侧最小方案——name 必填拦截、提交 invoke 参数契约
 *              （create_model_card groupId/name/essence/boundary/relation）、
 *              幂等返回提示（同组同名已存在则返回既有卡，成功提示说明不误导重复记账）。
 *              invoke 全 mock（不触碰真实后端）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Flashcard } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import ModelCardCreateDialog from "./ModelCardCreateDialog";

const createdFlashcard: Flashcard = {
  id: 10, groupId: 3, noteId: null, fragmentId: null,
  front: "安全边际", back: "本质：\n边界：\n联系：",
  kind: "model", stateJson: "{}", dueAt: 0, createdAt: 0,
};

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "create_model_card") return createdFlashcard;
    throw new Error(`unexpected: ${cmd}`);
  });
});

afterEach(() => cleanup());

function renderDialog(onCreated = vi.fn()) {
  return render(
    <ModelCardCreateDialog groupId={3} groupName="化妆课" onClose={vi.fn()} onCreated={onCreated} />,
  );
}

describe("ModelCardCreateDialog 组侧概念卡", () => {
  it("渲染：名称 + 三问输入行 + 提交按钮齐全", () => {
    renderDialog();
    expect(screen.getByTestId("model-card-dialog")).toBeTruthy();
    expect(screen.getByTestId("model-card-name")).toBeTruthy();
    expect(screen.getByTestId("model-card-essence")).toBeTruthy();
    expect(screen.getByTestId("model-card-boundary")).toBeTruthy();
    expect(screen.getByTestId("model-card-relation")).toBeTruthy();
    expect(screen.getByTestId("model-card-submit")).toBeTruthy();
  });

  it("必填校验：名称为空点提交 → 红字拦截且不调用 create_model_card", () => {
    renderDialog();
    fireEvent.click(screen.getByTestId("model-card-submit"));
    expect(screen.getByTestId("model-card-status").textContent).toContain("概念名不能为空");
    expect(invokeMock).not.toHaveBeenCalledWith("create_model_card", expect.anything());
  });

  it("提交：按契约调用 create_model_card（groupId/name/essence/boundary/relation）", async () => {
    renderDialog();
    fireEvent.change(screen.getByTestId("model-card-name"), { target: { value: "安全边际" } });
    fireEvent.change(screen.getByTestId("model-card-essence"), { target: { value: "赔率领先" } });
    fireEvent.change(screen.getByTestId("model-card-boundary"), { target: { value: "不是分散仓位" } });
    fireEvent.change(screen.getByTestId("model-card-relation"), { target: { value: "与仓位相关" } });
    fireEvent.click(screen.getByTestId("model-card-submit"));
    await screen.findByTestId("model-card-status");
    expect(invokeMock).toHaveBeenCalledWith("create_model_card", {
      groupId: 3, name: "安全边际",
      essence: "赔率领先", boundary: "不是分散仓位", relation: "与仓位相关",
    });
  });

  it("幂等返回：成功提示说明「已存在则返回既有卡」", async () => {
    renderDialog();
    fireEvent.change(screen.getByTestId("model-card-name"), { target: { value: "安全边际" } });
    fireEvent.click(screen.getByTestId("model-card-submit"));
    const msg = (await screen.findByTestId("model-card-status")).textContent ?? "";
    expect(msg).toContain("已创建概念卡");
    expect(msg).toContain("已存在则返回既有卡");
  });
});
