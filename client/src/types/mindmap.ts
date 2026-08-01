/**
 * 思维导图领域类型
 * Mindmap domain types
 *
 * @ai-context: 纯类型文件，无运行时代码。导图数据以 MindmapData JSON
 * 序列化后存入 Note.content（与 TipTap JSON 共用同一字段），用 type 字段判别。
 * 运行时判别函数 isMindmapData 位于 features/notes/lib/mindmap/mindmapOps.ts。
 * @ai-context: Pure type file. Mindmap data is serialized as MindmapData JSON
 * into Note.content (shared with TipTap JSON), discriminated by the `type` field.
 */

/** 思维导图节点（树形结构） / A single mindmap node (tree structure) */
export interface MindmapNode {
  id: string;
  text: string;
  children: MindmapNode[];
  /** 折叠状态：true 时子树不在画布展开 / collapsed: subtree hidden on canvas */
  collapsed?: boolean;
}

/**
 * 思维导图笔记数据（Note.content 反序列化结果）
 * Mindmap note payload (deserialized from Note.content)
 */
export interface MindmapData {
  /** 与 TipTap JSON 的判别字段 / discriminator vs TipTap JSON */
  type: 'mindmap';
  version: 1;
  root: MindmapNode;
}
