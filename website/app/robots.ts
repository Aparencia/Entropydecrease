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
