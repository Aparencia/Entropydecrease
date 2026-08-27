// @ai-context
// 功能总览页：SEO metadata + 客户端页面主体。
// Features overview page.
import type { Metadata } from "next";
import { FeaturesPage } from "@/components/features/FeaturesPage";

export const metadata: Metadata = {
  title: "六大认知模块",
  description:
    "深潜番茄钟、结礁笔记、反衰减呼吸闪卡、浮出水面费曼——熵减的完整学习闭环。",
};

export default function Page() {
  return <FeaturesPage />;
}