/**
 * DecisionDetailPanel — 决策日志单条展开详情（批 7 T20 · §9 #40 · 审计 H7 的 `get_decision` 面）。
 *
 * @ai-context Why：`get_decision` 今天**零调用点** ⇒ 决策日志每行只有「一行 ellipsis 摘要 + 🗑」，
 *   用户看不到四行法（预期 / 实际 / 反思）与引用明细。规格 §9 的处置逐字是「决策日志单条详情」。
 * @ai-context 🔴 **审计 H7 的边界（§C11.7 + 计划 C8 条，逐字照办）**：H7 的原文里**只有**
 *   「日志只读 ellipsis 无展开/分页」这一片**属于 `get_decision` 的详情面**，本件做它；
 *   H7 的其余部分（决策表单引用无搜索 · 碎片 limit 截断 · 候选池「+」清空）**超出详情面** ⇒
 *   **不在这里做**，已逐字登记为批 8 输入（见 `task-20-report.md`）。分页也**不在本件**
 *   （本件是「单条展开」，不是「列表分页」）⇒ 同属批 8。
 * @ai-context 依赖方向：唯一 IPC = `get_decision`（读）。**不复用**列表已有的对象直接把字段画出来 ——
 *   那会让「命令接没接上」不可测（本任务的验收恰恰是「点条目 ⇒ invoke(`get_decision`)」）。
 * @ai-context 冻结键口径（C9.12）：新文件 ⇒ 六棘轮零字面量；**不用 `EmptyState`**（余量集逐文件冻结）；
 *   排版全走 `Text` 档位；错误行走 `StatusLine kind="error"`。
 * 副作用：挂载时一次 `invoke`。边界：① 加载失败 ⇒ 错误行 + **不渲染半截字段**；
 *   ② 列表对象里已有的 `content` **不预填**（详情必须来自命令 —— 否则「接上了」是假象）。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { KnowledgeDecision } from "../../types/knowledge";
import { countUsedRefs, parseUsedRefs } from "../../types/knowledge";
import { StatusLine, Text } from "../../ui/primitives";

/** 四行法的一行（标签 + 值；空值渲染「未填」而不是省略 —— 省略会让「没写」与「没显示」不可分） */
function Field({ label, value }: { readonly label: string; readonly value: string | null }): React.ReactElement {
  return (
    <Text as="p" size={5} tone="ink-2" style={{ margin: "2px 0" }}>
      {label}：{value === null || value.trim() === "" ? "未填" : value}
    </Text>
  );
}

export default function DecisionDetailPanel({ id }: { readonly id: number }) {
  const [row, setRow] = useState<KnowledgeDecision | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    void invoke<KnowledgeDecision>("get_decision", { id })
      .then((d) => {
        if (alive) setRow(d);
      })
      .catch((e: unknown) => {
        if (alive) setErr(`详情加载失败: ${String(e)}`);
      });
    return () => {
      alive = false; // 切走/换行后丢弃晚到的结果（不排队、不覆盖下一行）
    };
  }, [id]);

  if (err !== "") return <StatusLine kind="error" testId="decision-detail-error">{err}</StatusLine>;
  if (row === null) return null;
  const refs = parseUsedRefs(row.usedRefs);
  return (
    <div data-testid="decision-detail" style={{ padding: "4px 0 8px 18px" }}>
      <Field label="内容" value={row.content} />
      <Field label="预期" value={row.expectation} />
      <Field label="实际" value={row.actual} />
      <Field label="反思" value={row.reflection} />
      <Text as="p" size={5} tone="ink-3" style={{ margin: "2px 0" }}>
        挂接：体系 {row.systemId ?? "—"} · 节点 {row.questionId ?? "—"} · 引用 {countUsedRefs(refs)} 个
      </Text>
      <Text as="p" size={5} tone="ink-3" style={{ margin: "2px 0" }}>
        记录时刻 {new Date(row.decidedAt).toISOString().slice(0, 16).replace("T", " ")}
      </Text>
    </div>
  );
}
