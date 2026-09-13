/**
 * KnowledgeSystemEditPanel — 知识体系「编辑」（名称 / 核心问题 / 状态）（批 7 T20 · §9 #47）。
 *
 * @ai-context Why：`update_knowledge_system` 今天**零调用点** ⇒ 体系**无法改名 / 改核心问题 / 改状态**
 *   （审计原文逐字称其为「**最明确的功能缺口**」）。规格 §9 的处置 =「体系改名 / 核心问题 / 状态」。
 * @ai-context 形态：入口按钮 + **就地展开的三字段表单**（不新开弹层 —— 体系详情面板本身已是右栏，
 *   再叠一层 `Modal` 会与它的折叠/展开语义打架；就地表单的退出 = 再点入口或按取消）。
 *   三字段一次提交（`name` / `coreQuestion` / `status`）：后端三个参数都是 `Option`，
 *   **未改的字段传 `null` 不传旧值**（避免「打开就写一遍」的伪写）。
 * @ai-context 冻结键口径（C9.12）：新文件 ⇒ 六棘轮零字面量（按钮 = `Button`、`select` = 原生元素
 *   但**不是** `<button>`（`nativeButton` 只数按钮）· 错误行 = `StatusLine` · 排版 = `Text` 档位）；
 *   **不用 `EmptyState`**（`emptyStateRatchet` 余量集逐文件冻结）。宿主 `KnowledgeDetailPanel` 已 298/300
 *   ⇒ 本件按「宿主只加两行」设计（import + 一行 JSX），**不吃它的余量**。
 * 副作用：一次 `invoke("update_knowledge_system")`。边界：① 三字段**全未改** ⇒ 不发 IPC（直接收起）；
 *   ② 成功后回调 `onChanged`（宿主重拉体系）并收起；③ 失败 ⇒ 错误行 + **保持展开**（不丢用户输入）。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { KnowledgeSystem } from "../types/knowledge";
import { Button, StatusLine, Text } from "../ui/primitives";

/** 体系状态三档（后端 `require_status("system", …)` 的白名单；中文标签只在这里出一次） */
const STATUS_LABEL: Readonly<Record<string, string>> = { active: "进行中", watching: "观察中", archived: "已归档" };
const INPUT = { fontSize: 12, padding: "3px 6px", width: "100%" } as const;

export default function KnowledgeSystemEditPanel({ system, onChanged }: {
  readonly system: KnowledgeSystem;
  /** 保存成功后的回调（宿主重拉体系；本件不自己改宿主的对象） */
  readonly onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(system.name);
  const [coreQuestion, setCoreQuestion] = useState(system.coreQuestion ?? "");
  const [status, setStatus] = useState<string>(system.status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  /** 展开时把三个受控值同步到**当前**体系（换选中项后不留上一项的半截输入） */
  const toggle = (): void => {
    if (!open) {
      setName(system.name);
      setCoreQuestion(system.coreQuestion ?? "");
      setStatus(system.status);
      setErr("");
    }
    setOpen(!open);
  };

  const save = async (): Promise<void> => {
    const nextName = name.trim() === system.name ? null : name.trim();
    const nextCore = coreQuestion.trim() === (system.coreQuestion ?? "") ? null : coreQuestion.trim();
    const nextStatus = status === system.status ? null : status;
    if (nextName === null && nextCore === null && nextStatus === null) {
      setOpen(false); // 边界①：什么都没改 ⇒ 不发 IPC
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await invoke("update_knowledge_system", { id: system.id, name: nextName, coreQuestion: nextCore, status: nextStatus });
      setOpen(false);
      onChanged();
    } catch (e) {
      setErr(`保存失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span data-testid="knowledge-system-edit">
      <Button size="sm" variant="secondary" onClick={toggle} title="编辑体系名称 / 核心问题 / 状态">
        {open ? "收起编辑" : "✎ 编辑体系"}
      </Button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
          <Text as="p" size={5} tone="ink-3" style={{ margin: 0 }}>名称</Text>
          <input aria-label="体系名称" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} style={INPUT} />
          <Text as="p" size={5} tone="ink-3" style={{ margin: 0 }}>核心问题</Text>
          <input aria-label="核心问题" value={coreQuestion} disabled={busy} onChange={(e) => setCoreQuestion(e.target.value)} style={INPUT} />
          <Text as="p" size={5} tone="ink-3" style={{ margin: 0 }}>状态</Text>
          <select aria-label="体系状态" value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)} style={INPUT}>
            {Object.keys(STATUS_LABEL).map((k) => (
              <option key={k} value={k}>{STATUS_LABEL[k]}</option>
            ))}
          </select>
          {err !== "" && <StatusLine kind="error" testId="knowledge-system-edit-error">{err}</StatusLine>}
          <span style={{ display: "flex", gap: 6 }}>
            <Button size="sm" variant="secondary" busy={busy} onClick={() => void save()}>保存</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>取消</Button>
          </span>
        </div>
      )}
    </span>
  );
}
