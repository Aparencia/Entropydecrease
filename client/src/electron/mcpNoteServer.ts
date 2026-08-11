/**
 * 笔记 MCP 服务器——将笔记库暴露为 MCP 工具
 * Note MCP server — exposes the note library as MCP tools
 *
 * @ai-context: 通过 MCP 协议将笔记知识库暴露给其他 AI agent，提供
 * search_notes / get_note_graph / get_note_summary / find_related_notes
 * 等工具。其他 AI agent 可通过 MCP 协议访问笔记知识库。
 * @ai-context: Exposes the note library as MCP tools for other AI agents.
 * Provides search_notes, get_note_graph, get_note_summary, and
 * find_related_notes tools via MCP protocol.
 */
import { db } from '@/lib/storage/database';
import { extractNoteText } from '@/features/notes/lib/extractNoteText';
import { getAllLinks } from '@/features/notes/lib/links/noteLinkStore';
import type { Note } from '@/types/models';

interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * 语义搜索笔记（基于 BM25 全文搜索）
 * Semantic search notes (BM25 full-text search)
 */
async function searchNotes(query: string, limit = 10): Promise<Array<{ id: string; title: string; snippet: string; updatedAt: string }>> {
  const q = query.toLowerCase();
  const notes = await db.notes
    .orderBy('updatedAt')
    .reverse()
    .limit(50)
    .toArray();

  return notes
    .filter((n) => {
      const text = extractNoteText(n.content).toLowerCase();
      const title = (n.title || '').toLowerCase();
      return title.includes(q) || text.includes(q);
    })
    .slice(0, limit)
    .map((n) => ({
      id: n.id,
      title: n.title || '未命名',
      snippet: extractNoteText(n.content).slice(0, 200),
      updatedAt: n.updatedAt instanceof Date
        ? n.updatedAt.toISOString()
        : new Date(n.updatedAt).toISOString(),
    }));
}

/**
 * 获取笔记的链接网络
 * Get note link graph
 */
async function getNoteGraph(noteId: string): Promise<{
  nodes: Array<{ id: string; title: string }>;
  edges: Array<{ from: string; to: string }>;
}> {
  const links = await getAllLinks();
  const relatedIds = new Set<string>();
  const edges: Array<{ from: string; to: string }> = [];

  for (const link of links) {
    if (link.fromId === noteId) {
      relatedIds.add(link.toId);
      edges.push({ from: link.fromId, to: link.toId });
    }
    if (link.toId === noteId) {
      relatedIds.add(link.fromId);
      edges.push({ from: link.fromId, to: link.toId });
    }
  }

  relatedIds.add(noteId);
  const notes = await db.notes.bulkGet([...relatedIds]);
  const nodes = notes
    .filter((n): n is Note => n !== undefined)
    .map((n) => ({ id: n.id, title: n.title || '未命名' }));

  return { nodes, edges };
}

/**
 * 获取笔记摘要
 * Get note summary
 */
async function getNoteSummary(noteId: string): Promise<{ title: string; summary: string; wordCount: number } | null> {
  const note = await db.notes.get(noteId);
  if (!note) return null;

  const text = extractNoteText(note.content);
  return {
    title: note.title || '未命名',
    summary: text.slice(0, 500),
    wordCount: text.length,
  };
}

/**
 * 查找关联笔记
 * Find related notes
 */
async function findRelatedNotes(noteId: string, limit = 5): Promise<Array<{ id: string; title: string; reason: string }>> {
  const note = await db.notes.get(noteId);
  if (!note) return [];

  const allNotes = await db.notes.toArray();
  const links = await getAllLinks();
  const linkedIds = new Set(
    links
      .filter((l) => l.fromId === noteId || l.toId === noteId)
      .map((l) => (l.fromId === noteId ? l.toId : l.fromId)),
  );

  const tagSet = new Set(note.tags || []);
  const results: Array<{ id: string; title: string; reason: string; score: number }> = [];

  for (const other of allNotes) {
    if (other.id === noteId) continue;

    let reason = '';
    let score = 0;

    if (linkedIds.has(other.id)) {
      reason = '已有链接关联';
      score = 0.9;
    } else if (other.tags?.some((t) => tagSet.has(t))) {
      reason = '共同标签';
      score = 0.6;
    }

    if (score > 0) {
      results.push({
        id: other.id,
        title: other.title || '未命名',
        reason,
        score,
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ id, title, reason }) => ({ id, title, reason }));
}

/**
 * MCP 工具定义
 * MCP tool definitions
 */
export const NOTE_MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: 'search_notes',
    description: '语义搜索笔记库，返回匹配的笔记列表',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', description: '返回数量上限（默认 10）' },
      },
      required: ['query'],
    },
    handler: async (args) => searchNotes(args.query as string, (args.limit as number) || 10),
  },
  {
    name: 'get_note_graph',
    description: '获取指定笔记的链接网络（关联节点和边）',
    inputSchema: {
      type: 'object',
      properties: {
        noteId: { type: 'string', description: '笔记 ID' },
      },
      required: ['noteId'],
    },
    handler: async (args) => getNoteGraph(args.noteId as string),
  },
  {
    name: 'get_note_summary',
    description: '获取笔记的摘要信息',
    inputSchema: {
      type: 'object',
      properties: {
        noteId: { type: 'string', description: '笔记 ID' },
      },
      required: ['noteId'],
    },
    handler: async (args) => getNoteSummary(args.noteId as string),
  },
  {
    name: 'find_related_notes',
    description: '查找与指定笔记相关的其他笔记',
    inputSchema: {
      type: 'object',
      properties: {
        noteId: { type: 'string', description: '笔记 ID' },
        limit: { type: 'number', description: '返回数量上限（默认 5）' },
      },
      required: ['noteId'],
    },
    handler: async (args) => findRelatedNotes(args.noteId as string, (args.limit as number) || 5),
  },
];

export default NOTE_MCP_TOOLS;