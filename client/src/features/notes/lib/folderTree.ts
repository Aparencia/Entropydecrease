/**
 * 分组树工具：递归收集分组及其全部子孙分组 id
 *
 * @ai-context: 数据层 NoteFolder 支持 parentId 嵌套，但 UI 仅渲染一级。
 * 删除分组必须整树处理——否则子分组的 parentId 悬挂（指向已删分组），
 * 且子分组下的笔记成为孤儿。此函数供 store 执行与页面计数共用，单一来源。
 * @ai-context: Folder tree utilities. UI renders one level only, but deletion
 * must handle the whole subtree to avoid dangling parentId references.
 */
export function collectFolderTreeIds(
  folders: Array<{ id: string; parentId?: string }>,
  rootId: string,
): string[] {
  const result: string[] = [rootId];
  const walk = (pid: string) => {
    for (const f of folders) {
      if (f.parentId === pid) {
        result.push(f.id);
        walk(f.id);
      }
    }
  };
  walk(rootId);
  return result;
}
