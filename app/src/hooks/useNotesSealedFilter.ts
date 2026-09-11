/**
 * useNotesSealedFilter — 笔记页 SE 封存（#树洞）显隐开关与列表过滤（v0.20.3 REQ-301）。
 *
 * @ai-context: 设置里的 SE 封存 tag 默认不可见；本 hook 把「取 feature flags +
 *              按开关过滤列表」收敛成一处，NotesPage 只把 filterSealed 接进
 *              visibleNotes（自 NotesPage 拆分，行为不变）。
 * @ai-context: 副作用——挂载与 refreshToken 变化时 invoke `get_feature_flags`，
 *              失败兜底 false（=默认排除态，与后端缺省一致）；refreshToken 由
 *              页面注入（与颜色/组数据同一令牌），hook 内**不自建**第二令牌。
 * @ai-context: 边界——只做客户端过滤，不合并 groupFilter 等其它视图态（调用方
 *              自行组合）；sealedVisible=true 时原样返回同一数组引用（不产生
 *              新数组，保持下游 memo 的引用语义）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Note } from "../types";

/** 单篇是否带 SE 封存 tag（#树洞 精确匹配——防「树洞XX」子串误滤） */
function isSealedNote(note: Note): boolean {
  try {
    const tags = JSON.parse(note.tags ?? "[]") as unknown[];
    return tags.some((t) => String(t).replace(/^#/, "").trim() === "树洞");
  } catch {
    return false; // tags 非 JSON（旧数据）→ 不误滤
  }
}

interface SealedFilter {
  /** 封存笔记是否可见（设置项；默认 false=默认排除） */
  sealedVisible: boolean;
  /** 按当前显隐开关过滤（关=滤掉封存笔记；开=原样返回入参数组） */
  filterSealed: (notes: Note[]) => Note[];
}

export function useNotesSealedFilter(refreshToken: number): SealedFilter {
  const [sealedVisible, setSealedVisible] = useState(false);
  useEffect(() => {
    void invoke<{ sealedTagsVisible?: boolean }>("get_feature_flags")
      .then((f) => setSealedVisible(!!f.sealedTagsVisible))
      .catch(() => setSealedVisible(false));
  }, [refreshToken]);

  // filterSealed 身份只随 sealedVisible 变——调用方 memo 的重算时机与拆前逐字一致
  const filterSealed = useCallback(
    (notes: Note[]) => (sealedVisible ? notes : notes.filter((n) => !isSealedNote(n))),
    [sealedVisible],
  );

  return { sealedVisible, filterSealed };
}
