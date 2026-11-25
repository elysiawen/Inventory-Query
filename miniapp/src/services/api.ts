import { request } from './request'
import type {
  AuthUser,
  CategoryRow,
  ItemPayload,
  ItemRow,
  PageResult,
  StockLogRow,
  SystemStatus,
  UserRow
} from './types'

export interface LoginResult {
  token: string
  user: AuthUser
}

export const login = (username: string, password: string) =>
  request<LoginResult>('/api/auth/login', {
    method: 'POST',
    data: { username, password }
  })

export const fetchMe = () => request<AuthUser>('/api/auth/me')

/** 删除自己的头像 */
export const removeAvatar = () => request<AuthUser>('/api/auth/avatar', { method: 'DELETE' })

/** 修改自己的昵称 / 用户名 / 密码（改密码需带原密码） */
export const updateProfile = (data: {
  nickname?: string
  username?: string
  password?: string
  oldPassword?: string
}) => request<AuthUser>('/api/auth/profile', { method: 'PUT', data })

export interface ItemSearchParams {
  keyword?: string
  categoryId?: string
  innerExact?: string
  innerMin?: string
  innerMax?: string
  outerExact?: string
  outerMin?: string
  outerMax?: string
  heightExact?: string
  heightMin?: string
  heightMax?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export const searchItems = (params: ItemSearchParams) =>
  request<PageResult<ItemRow>>('/api/items/search', { query: { ...params } })

export const fetchAdminItems = (params: {
  keyword?: string
  categoryId?: string
  page?: number
  pageSize?: number
}) => request<PageResult<ItemRow>>('/api/items', { query: { ...params } })

export const createItem = (payload: ItemPayload) =>
  request<ItemRow>('/api/items', { method: 'POST', data: payload })

export const updateItem = (id: string, payload: Partial<ItemPayload>) =>
  request<ItemRow>(`/api/items/${id}`, { method: 'PUT', data: payload })

export const deleteItem = (id: string) =>
  request<{ success: boolean }>(`/api/items/${id}`, { method: 'DELETE' })

export const stockIn = (id: string, quantity: number, remark: string) =>
  request<{ success: boolean }>(`/api/items/${id}/stock-in`, {
    method: 'POST',
    data: { quantity, remark }
  })

export const stockOut = (id: string, quantity: number, remark: string) =>
  request<{ success: boolean }>(`/api/items/${id}/stock-out`, {
    method: 'POST',
    data: { quantity, remark }
  })

export const fetchCategories = () => request<CategoryRow[]>('/api/categories')

export const createCategory = (name: string) =>
  request<CategoryRow>('/api/categories', { method: 'POST', data: { name } })

export const renameCategory = (id: string, name: string) =>
  request<CategoryRow>(`/api/categories/${id}`, { method: 'PUT', data: { name } })

export const deleteCategory = (id: string) =>
  request<{ success: boolean }>(`/api/categories/${id}`, { method: 'DELETE' })

export const fetchUsers = () => request<UserRow[]>('/api/users')

export const createUser = (payload: {
  username: string
  nickname?: string
  password: string
  role: 'ADMIN' | 'USER'
}) => request<UserRow>('/api/users', { method: 'POST', data: payload })

export const updateUser = (
  id: string,
  payload: {
    username?: string
    nickname?: string
    password?: string
    role?: 'ADMIN' | 'USER'
    active?: boolean
  }
) => request<UserRow>(`/api/users/${id}`, { method: 'PUT', data: payload })

export const deleteUser = (id: string) =>
  request<{ success: boolean }>(`/api/users/${id}`, { method: 'DELETE' })

export const fetchStockLogs = (params: {
  itemId?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}) => request<PageResult<StockLogRow>>('/api/stock-logs', { query: { ...params } })

export const fetchSystemStatus = () => request<SystemStatus>('/api/system/status')
