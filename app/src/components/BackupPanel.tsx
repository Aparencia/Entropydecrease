/**
 * BackupPanel — 数据备份/恢复面板（TD-2026-08-20-G 清偿：REQ-107 TRUST-1
 * backup_create/backup_restore 后端能力此前全应用无 UI，数据备份不可达）。
 *
 * @ai-context: 创建备份（data_dir → backups/backup-<时间>.zip，含 SQLite+图+音频）
 *              + 从备份 zip 恢复（tauri-plugin-dialog 文件选择 + 显式确认——
 *              恢复覆盖当前数据，entropy.db 改名 .pre-restore 兜底，完成后提示重启）。
 * @ai-context: 备份目录即应用数据目录内，提示用户可另行拷贝到外部存储（TRUST-1
 *              本地优先：数据不出本机，备份也仅在本机卷）。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ConfirmDialog } from "../ui/primitives";

interface BackupSummary {
  archivePath: string;
  fileCount: number;
  totalBytes: number;
}

/** 字节 → 可读大小（纯函数）。 */
function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function BackupPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  /** 待确认恢复的备份路径（批 4 T11：`window.confirm` → `ConfirmDialog`，见 `pickRestore` 的 Why） */
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);

  const createBackup = async () => {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const s = await invoke<BackupSummary>("backup_create");
      setInfo(`备份完成：${s.fileCount} 个文件 · ${fmtBytes(s.totalBytes)} · ${s.archivePath}`);
    } catch (e) {
      setError(`备份失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  /**
   * 选文件 → 置待确认态（批 4 T11）。
   *
   * Why 不再是 `window.confirm`：规格 §5.1 —— `window.confirm` 在 WebView2 下**可能静默返回 false**，
   * 而这里是「覆盖当前全部数据」的高危不可逆动作（§5.3），静默 false 会表现为"点了没反应"。
   * Why 拆两段（选文件 / 真恢复）：`window.confirm` 是同步的一行，`ConfirmDialog` 是受控弹层 ——
   * 选中的路径必须留在 state 里活到用户点确认；`runRestore` 里的 `busy` 置位/清理与 `invoke` 实参
   * 与迁移前**逐字相同**，只是触发点从 confirm 的返回值变成确认按钮。
   */
  const pickRestore = async () => {
    // 文件选择（zip）
    const selected = await open({ multiple: false, filters: [{ name: "备份文件", extensions: ["zip"] }] });
    if (typeof selected !== "string" || !selected) return;
    // 显式确认（恢复覆盖当前数据——TRUST-1 高影响操作）
    setPendingRestore(selected);
  };

  /** 真正执行恢复（确认按钮触发；`archivePath` 即原来那个 `selected`） */
  const runRestore = async (archivePath: string) => {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const n = await invoke<number>("backup_restore", { archivePath });
      setInfo(`恢复完成（${n} 个文件）。请重启应用使数据生效。`);
    } catch (e) {
      setError(`恢复失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>🗄 数据备份</span>
        <button
          onClick={() => void createBackup()}
          disabled={busy}
          style={{ padding: "3px 10px", fontSize: 11, border: "1px solid #0d9488", borderRadius: 6, background: "#f0fdfa", color: "#0f766e", cursor: busy ? "wait" : "pointer" }}
          title="备份 SQLite + 会话图片 + 会话音频为 zip"
        >
          {busy ? "处理中…" : "创建备份"}
        </button>
        <button
          onClick={() => void pickRestore()}
          disabled={busy}
          style={{ padding: "3px 10px", fontSize: 11, border: "1px solid #fca5a5", borderRadius: 6, background: "#fff", color: "#dc2626", cursor: busy ? "wait" : "pointer" }}
          title="从备份 zip 恢复（覆盖当前数据，需重启生效）"
        >
          从备份恢复…
        </button>
      </div>
      {error && <div style={{ fontSize: 11, color: "#dc2626" }}>{error}</div>}
      {!error && info && <div style={{ fontSize: 11, color: "#0f766e" }}>{info}</div>}
      <div style={{ fontSize: 10, color: "#9ca3af" }}>
        备份保存在应用数据目录 backups/（本地优先：数据不出本机）；如需异地保存请自行拷贝备份文件
      </div>

      {/* 高危确认（§5.3）：原文案「恢复将覆盖当前全部数据（现有数据库改名 .pre-restore 兜底）。\n继续？」
          逐字拆为 title（首句）+ impacts（括号内的保留项）+ 确认按钮「继续」 */}
      <ConfirmDialog
        open={pendingRestore !== null}
        title="恢复将覆盖当前全部数据"
        impacts={[
          { text: "现有数据库改名 .pre-restore 兜底", keep: true },
        ]}
        confirmLabel="继续"
        busy={busy}
        onConfirm={() => {
          const path = pendingRestore;
          setPendingRestore(null);
          if (path !== null) void runRestore(path);
        }}
        onCancel={() => setPendingRestore(null)}
        testId="backup-restore-confirm"
      />
    </div>
  );
}
