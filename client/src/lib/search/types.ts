/**
 * 搜索引擎接口与配置类型
 * v0.9.0: 全文搜索功能基础类型定义
 * v1.2.0: 全局统一搜索，支持多实体类型
 */

import type { SearchEntityType } from '@/types/models';

/** 搜索选项 */
export interface SearchOptions {
  /** 搜索关键词（原始查询字符串） */
  query: string;
  /** 返回结果数量上限，默认 20 */
  limit?: number;
  /** 结果偏移量（用于分页），默认 0 */
  offset?: number;
  /** 是否启用模糊匹配，默认 false */
  fuzzy?: boolean;
  /** 限定搜索的笔记 ID 范围（空数组表示不限） */
  noteIds?: string[];
  /** 限定搜索的标签范围 */
  tags?: string[];
  /** v1.2.0: 限定搜索的实体类型（空数组或不传表示搜索全部） */
  entityTypes?: SearchEntityType[];
}

/** 单条搜索结果 */
export interface SearchResultItem {
  /** 笔记 ID（向后兼容，值等于 entityId） */
  noteId: string;
  /** v1.2.0: 实体唯一标识 */
  entityId: string;
  /** v1.2.0: 实体类型 */
  entityType: SearchEntityType;
  /** 标题 */
  title: string;
  /** 匹配片段（含高亮标记） */
  snippet: string;
  /** 相关度得分 0-1 */
  score: number;
  /** 匹配的 token 列表 */
  matchedTokens: string[];
  /** 最后更新时间 */
  updatedAt: number;
}

/** 搜索结果集 */
export interface SearchResult {
  /** 结果列表 */
  items: SearchResultItem[];
  /** 总命中数（不受 limit 限制） */
  totalCount: number;
  /** 本次搜索耗时（毫秒） */
  elapsedMs: number;
  /** 实际使用的查询 token 列表（分词后） */
  queryTokens: string[];
}

/**
 * 搜索引擎接口
 * 所有搜索引擎实现（内存索引 / IndexedDB / 远程）均需实现此接口
 */
export interface ISearchEngine {
  /** 初始化搜索引擎（构建/加载索引） */
  init(): Promise<void>;

  /** 执行搜索 */
  search(options: SearchOptions): Promise<SearchResult>;

  /**
   * 添加或更新一条索引
   * v1.2.0 扩展签名：支持多实体类型
   */
  upsert(
    entityId: string,
    entityType: SearchEntityType,
    title: string,
    content: string,
    updatedAt: number,
  ): Promise<void>;

  /** 删除一条索引 */
  remove(entityId: string, entityType?: SearchEntityType): Promise<void>;

  /** 重建全部索引 */
  rebuildIndex(): Promise<void>;

  /** 释放资源 */
  dispose(): void;
}
