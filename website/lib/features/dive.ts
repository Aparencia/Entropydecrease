// @ai-context
// 深潜功能页内容配置：数据驱动渲染，新增功能页时复制本文件结构。
// Dive feature page content config.
import type { FeatureConfig } from "./types";
import { CHRONOS_STATES } from "./chronos";

export const DIVE_CONFIG: FeatureConfig = {
  slug: "dive",
  name: "深潜",
  origin: "番茄钟",
  tagline: "把番茄钟，养成一只时间生物",
  hero: {
    title: "把番茄钟，养成一只时间生物",
    subtitle: "它不是倒计时，是你亲手点亮、看着它燃烧与生长的 Chronos。",
  },
  mechanics: {
    title: "它的一生，由你点亮",
    hint: "点击形态，中央的 Chronos 会变成它",
    items: CHRONOS_STATES.map((s) => ({ key: s.key, name: s.name, icon: s.icon, desc: s.desc }))
  },
  scenes: {
    title: "不是 25 分钟，是你的节奏",
    items: [
      { name: "刷题", rhythm: "50 / 10", story: "沉浸演算，别让铃声打断思路。" },
      { name: "背单词", rhythm: "15 / 3", story: "短频快，趁记忆窗口最亮时反复。" },
      { name: "晚自习", rhythm: "90 / 20", story: "长线作战，跟着超昼夜节律走。" },
    ],
  },
  outcome: {
    title: "你的深潜，会积成一片海",
    desc: "每一次专注都是一段下潜深度——它们被记录、被看见、长成只属于你的认知星图。",
  },
  science: {
    title: "为什么「一个番茄」不够",
    points: [
      "注意力遵循 90–120 分钟的超昼夜节律，固定 25 分钟会截断你的高效期。",
      "休息不是浪费——清醒期记忆重放，让刚学的内容在后台沉淀。",
      "失败不被惩罚：连续受挫时屏幕注入柔粉，而非刺眼的红色。",
    ],
  },
  cta: { text: "免费下载 · 现在就能养一只" },
};
