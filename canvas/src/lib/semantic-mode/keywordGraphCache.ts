import { LRUCache } from '@/lib/cache/LRUCache'
import type { GraphData } from '@/lib/graph/types'

export const KEYWORD_GRAPH_ALGO_VERSION = 8

export type KeywordGraphResult = {
  graph: GraphData
  nodeCountsById: Map<string, number>
}

export const keywordGraphCache = new LRUCache<string, KeywordGraphResult>(12)
