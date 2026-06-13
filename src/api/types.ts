// ============================================================================
// Shared API Type Definitions
// ============================================================================

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface PaginatedResult<T> {
  list: T[]
  total: number
}

export interface AuthorBrief {
  id: number
  username: string
  avatar: string
}

export interface SearchHighlight {
  [key: string]: string[]
}

export interface Tag {
  id: number
  name: string
}
