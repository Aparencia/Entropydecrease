// @ai-context
// robots.txt 生成器：允许全部抓取并指向站点地图。robots.txt generator.
// Why: 静态导出模式需 force-static 显式声明，否则构建报错。
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

/**
 * robots.txt — 允许所有搜索引擎抓取，并指向站点地图
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://entropydecrease.com/sitemap.xml",
  };
}
