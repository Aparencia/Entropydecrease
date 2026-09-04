/**
 * useDbRefresh — data:* 域变更总线订阅 hook（REQ-278，v0.19.4 §5 前端半场）。
 *
 * @ai-context: Rust 侧在笔记/会话/组/目标/知识体系等写入命令后广播
 *              `data:{domain}-changed`（负载空）。本 hook 把一组域聚合成一次
 *              防抖刷新：同域/跨域事件风暴合并为单次 onChanged；卸载即解绑；
 *              回调经 ref 镜像（订阅只注册一次、永远调用最新回调——页面闭包
 *              更新不触发重订阅）。
 * @ai-context: 常驻订阅（v0.19.4 设计修正 2026-09-05）——App 页面保留挂载
 *              （display:none 切换，TD-004），若按页面激活门控，隐藏期发生的
 *              事件会被漏收，切回该页仍是陈旧数据（恰是本 REQ 要根治的痛点：
 *              「AI 精修完成/采纳后需切页才见」）；隐藏页后台刷新成本仅数次
 *              轻量查询，可接受，且 300ms 防抖已挡事件风暴——故不设 active。
 * @ai-context: 边界——listen 为异步注册：卸载发生在 resolve 前时用 cancelled
 *              标志丢弃（不 push 旧 unlisten）；监听失败（非 Tauri 环境 /
 *              测试兜底）静默吞掉，单域失败不影响其它域。
 */
import { useEffect, useMemo, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

/** data:* 事件域集合——事件名 = `data:${domain}-changed` */
export type DataDomain = "notes" | "sessions" | "note-groups" | "goals" | "knowledge";

/** 默认防抖窗口（ms）——事件风暴（如 AI 采纳连续落库）合并为一次刷新 */
export const DB_REFRESH_DEBOUNCE_MS = 300;

/**
 * 订阅一组 data:* 域事件并防抖触发 onChanged。
 * @param domains    订阅的域（事件名 `data:${domain}-changed`）
 * @param onChanged  刷新回调（事件风暴合并后调用一次；hook 经 ref 镜像最新引用）
 * @param debounceMs 防抖窗口（默认 300ms）
 */
export function useDbRefresh(
  domains: DataDomain[],
  onChanged: () => void,
  debounceMs: number = DB_REFRESH_DEBOUNCE_MS,
): void {
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  // 防抖定时器共用同一 ref——任意域事件重置窗口，实现跨域风暴合并
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 域列表序列化 key：页面内联数组每次渲染都是新引用，join 后按内容比较——
  // 内容未变则 effect 不重跑（避免每渲染都重订阅）
  const domainsKey = useMemo(() => domains.join(","), [domains]);

  useEffect(() => {
    if (domainsKey === "") return;
    let cancelled = false;
    const unlisteners: (() => void)[] = [];
    const schedule = () => {
      if (cancelled) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!cancelled) onChangedRef.current();
      }, debounceMs);
    };
    void (async () => {
      for (const domain of domainsKey.split(",")) {
        if (cancelled) break;
        try {
          const unlisten = await listen(`data:${domain}-changed`, schedule);
          if (cancelled) {
            // 注册完成前已卸载——立即解绑，防旧监听残留
            unlisten();
          } else {
            unlisteners.push(unlisten);
          }
        } catch {
          // 监听失败静默：非 Tauri 环境（vitest/jsdom）/ listen 被禁时兜底，
          // 不让订阅链路影响页面渲染；单域失败不阻断其余域注册
        }
      }
    })();
    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      unlisteners.forEach((u) => u());
    };
  }, [domainsKey, debounceMs]);
}
