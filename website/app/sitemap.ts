// @ai-context
// sitemap.xml 生成器：所有页面的优先级与更新频率声明。sitemap.xml generator.
// Why: 静态导出模式需 force-static 显式声明，否则构建报错。
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE_URL = "https://entropydecrease.com";

/**
 * sitemap.xml — 站点地图，帮助搜索引擎发现所有页面
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/download`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/story`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/support`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // 隐私政策与用户协议 — 法律合规页面，更新频率较低
    {
      url: `${BASE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
