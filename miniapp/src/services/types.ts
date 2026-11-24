export type Role = 'ADMIN' | 'USER'

export interface AuthUser {
  id: string
  username: string
  role: Role
  avatar?: string | null
}

export interface CategorySummary {
  id: string
  name: string
}

export interface CategoryRow extends CategorySummary {
  createdAt: string
  _count?: { items: number }
}

export interface ItemRow {
  id: string
  name: string
  model: string
  categoryId: string
  category?: CategorySummary
  image: string | null
  price: number
  remark: string | null
  supplier: string | null
  innerDiameter: number
  outerDiameter: number
  height: number
  quantity: number
  createdAt?: string
  updatedAt?: string
}

export interface UserRow {
  id: string
  username: string
  role: Role
  active: boolean
  avatar?: string | null
  createdAt: string
}

export interface StockLogRow {
  id: string
  type: 'IN' | 'OUT'
  quantity: number
  remark: string | null
  createdAt: string
  item: { id: string; name: string; model: string }
  operator: { id: string; username: string }
}

export interface PageResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface SystemStatus {
  db: { ok: boolean; latencyMs: number }
  counts: {
    users: number
    categories: number
    items: number
    logs: number
    stockQuantity: number
  } | null
  runtime: {
    node: string
    env: string
    uptimeSec: number
    serverTime: string
  }
  operator: string
}

export interface ItemPayload {
  name: string
  model: string
  categoryId: string
  price: number
  innerDiameter: number
  outerDiameter: number
  height: number
  supplier: string | null
  remark: string | null
  image: string | null
  quantity?: number
}
