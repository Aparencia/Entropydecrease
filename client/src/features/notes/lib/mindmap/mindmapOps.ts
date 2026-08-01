/**
 * 思维导图树操作（纯函数，不可变）
 * Mindmap tree operations (pure, immutable)
 *
 * @ai-context: 导图数据的单一数据源是 MindmapData.root 树；所有节点增删改
 * 均返回新树（不修改入参），便于 React 渲染与撤销扩展。新节点 id 用
 * crypto.randomUUID()。isMindmapData/parseMindmapData 为运行时判别（按约定
 * 放 lib 层而非纯类型文件）。
 * @ai-context: The mindmap tree (MindmapData.root) is the single source of truth;
 * every mutation returns a new tree (inputs untouched). Runtime guards live here
 * (lib layer) per the "pure type files have no runtime" convention.
 */
import type { MindmapNode, MindmapData } from '@/types/models';

/** 新建节点（id 可注入，便于调用方选中/编辑新节点） / Create a node (injectable id) */
export function createNode(text: string, id: string = crypto.randomUUID()): MindmapNode {
  return { id, text, children: [] };
}

/** 深度优先查找节点 / DFS lookup */
export function findNode(root: MindmapNode, id: string): MindmapNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** 给指定节点追加子节点（并展开该节点） / Append a child to parentId (and expand it) */
export function addChild(root: MindmapNode, parentId: string, text = '新节点', newId?: string): MindmapNode {
  const newNode = createNode(text, newId);
  const recur = (node: MindmapNode): MindmapNode => {
    if (node.id === parentId) {
      return { ...node, collapsed: false, children: [...node.children, newNode] };
    }
    return { ...node, children: node.children.map(recur) };
  };
  return recur(root);
}

/**
 * 在指定节点后插入同级节点；若目标是根节点则退化为给根加子节点。
 * Insert a sibling after nodeId; if nodeId is root, fall back to adding a child.
 */
export function addSibling(root: MindmapNode, nodeId: string, text = '新节点', newId?: string): MindmapNode {
  if (root.id === nodeId) return addChild(root, root.id, text, newId);
  const newNode = createNode(text, newId);
  const recur = (node: MindmapNode): MindmapNode => {
    const idx = node.children.findIndex((c) => c.id === nodeId);
    if (idx !== -1) {
      const children = [...node.children];
      children.splice(idx + 1, 0, newNode);
      return { ...node, children };
    }
    return { ...node, children: node.children.map(recur) };
  };
  return recur(root);
}

/** 删除节点（禁止删根，删根时原样返回） / Delete node (root protected) */
export function deleteNode(root: MindmapNode, nodeId: string): MindmapNode {
  if (root.id === nodeId) return root;
  const recur = (node: MindmapNode): MindmapNode => ({
    ...node,
    children: node.children.filter((c) => c.id !== nodeId).map(recur),
  });
  return recur(root);
}

/** 更新节点文本 / Update node text */
export function updateText(root: MindmapNode, nodeId: string, text: string): MindmapNode {
  const recur = (node: MindmapNode): MindmapNode => {
    if (node.id === nodeId) return { ...node, text };
    return { ...node, children: node.children.map(recur) };
  };
  return recur(root);
}

/** 切换折叠状态 / Toggle collapsed flag */
export function toggleCollapse(root: MindmapNode, nodeId: string): MindmapNode {
  const recur = (node: MindmapNode): MindmapNode => {
    if (node.id === nodeId) return { ...node, collapsed: !node.collapsed };
    return { ...node, children: node.children.map(recur) };
  };
  return recur(root);
}

/** 运行时判别：content 是否为导图 JSON / Runtime guard for mindmap JSON */
export function isMindmapData(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as { type?: unknown; root?: unknown };
    return parsed?.type === 'mindmap' && !!parsed?.root;
  } catch {
    return false;
  }
}

/** 安全解析导图数据（失败返回 null） / Safe parse (null on failure) */
export function parseMindmapData(content: string): MindmapData | null {
  try {
    const parsed = JSON.parse(content) as MindmapData;
    if (parsed?.type === 'mindmap' && parsed?.root) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** 默认导图（中心主题 + 三个分支） / Default mindmap (center + 3 branches) */
export function createDefaultMindmap(centerText = '中心主题'): MindmapData {
  return {
    type: 'mindmap',
    version: 1,
    root: {
      id: crypto.randomUUID(),
      text: centerText,
      children: ['分支一', '分支二', '分支三'].map((t) => createNode(t)),
    },
  };
}
