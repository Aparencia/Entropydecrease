/**
 * knowledgeSample.ts — 摄影示例体系常量（v0.13.7 具象化）。
 *
 * @ai-context: 示例≠预填（纪律裁决 2026-08-24）——示例是用户可见的完整
 *              参照物，复制后处于"待改造"状态。结构对应既有 command 入参，
 *              复制时逐条调 create/add 命令落库（零新命令）。
 */
import type { KnowledgeNodeType, SystemKind } from "../types/knowledge";

export interface SampleNode {
  type: KnowledgeNodeType;
  text: string;
  parentId: number | null;
}
export interface SampleConcept {
  name: string;
  essence: string;
  boundary: string;
  relation: string;
}
export interface SampleModel {
  name: string;
  disciplines: string[];
  claim: string;
  validWhen: string;
  invalidWhen: string;
}

export const SAMPLE_SYSTEM = {
  name: "摄影",
  kind: "domain" as SystemKind,
  coreQuestion: "如何拍出有表达力、不灰蒙蒙的照片？",
  /** 问题树：7 节点（4 根 + 3 子；含 1 场景根）——parentId 索引指向 nodes 内下标 */
  nodes: [
    { type: "question", text: "照片为什么发灰、不通透？", parentId: null },        // 0
    { type: "question", text: "怎么判断一张照片曝光是否准确？", parentId: 0 },       // 1
    { type: "question", text: "高光溢出了怎么办？", parentId: 0 },                  // 2
    { type: "question", text: "为什么拍人像背景虚化不了？", parentId: null },        // 3
    { type: "question", text: "怎么让背景虚化（光圈优先）？", parentId: 3 },         // 4
    { type: "question", text: "构图总是很平淡怎么办？", parentId: null },            // 5
    { type: "scenario", text: "本周修好 10 张发灰的旅行照", parentId: null },       // 6
  ] as SampleNode[],
  concepts: [
    {
      name: "曝光三角",
      essence: "光圈/快门/ISO 三者平衡光量的关系",
      boundary: "只影响明暗，不影响景深的是 ISO",
      relation: "感光元件对光的响应，是后期降噪的基础",
    },
    {
      name: "安全快门",
      essence: "1/焦距 的倒数，低于它手抖必糊",
      boundary: "有防抖/三脚架时失效",
      relation: "与曝光三角中快门联动",
    },
    {
      name: "三分构图",
      essence: "把主体放在画面 1/3 分割线上",
      boundary: "对称构图/居中构图时不用",
      relation: "与引导线结合更出效果",
    },
  ] as SampleConcept[],
  models: [
    {
      name: "黄金时刻法则",
      disciplines: ["摄影"],
      claim: "日出日落前后 1 小时光质最佳",
      validWhen: "户外自然光",
      invalidWhen: "室内闪光灯/阴天正午想拍蓝调",
    },
  ] as SampleModel[],
};
