// @ai-context
// 深潜功能页：SEO metadata 由 server 组件导出，页面主体为客户端组件 DivePage。
// Dive feature page: SEO metadata + client page body.
import type { Metadata } from "next";
import { DivePage } from "@/components/dive/DivePage";

export const metadata: Metadata = {
  title: "深潜 · 会呼吸的番茄钟",
  description:
    "熵减「深潜」：把番茄钟养成一只时间生物。六态形态、场景化预设、超昼夜节律——专注本该如此。",
  keywords: ["番茄钟", "专注", "学习", "深潜", "时间生物", "熵减"],
};

export default function Page() {
  return <DivePage />;
}
