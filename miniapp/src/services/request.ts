import Taro from '@tarojs/taro'
import { clearAuth, getToken, setToken } from './storage'
import type { AuthUser, ImportReport, UserRow } from './types'

/** 后端服务地址：由 config/index.ts 的 defineConstants 在构建期注入（来源 .env 的 TARO_APP_API_BASE） */
declare const __API_BASE__: string

export const API_BASE = __API_BASE__

const IS_H5 = process.env.TARO_ENV === 'h5'
/** H5 预览走 devServer 代理避免跨域，小程序端必须使用完整地址 */
export const REQUEST_BASE = IS_H5 ? '' : API_BASE

export type Query = Record<string, string | number | boolean | undefined | null>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: unknown
  query?: Query
}

function buildUrl(path: string, query?: Query) {
  let url = `${REQUEST_BASE}${path}`
  if (!query) return url
  const parts = Object.keys(query)
    .filter((key) => {
      const value = query[key]
      return value !== undefined && value !== null && value !== ''
    })
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`)
  if (parts.length) url += `${url.includes('?') ? '&' : '?'}${parts.join('&')}`
  return url
}

function handleUnauthorized() {
  clearAuth()
  Taro.reLaunch({ url: '/pages/login/index' })
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken()
  let res: { statusCode: number; data: unknown }
  try {
    res = await Taro.request({
      url: buildUrl(path, options.query),
      method: options.method || 'GET',
      data: options.data as Record<string, unknown> | undefined,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      timeout: 20000
    })
  } catch (e) {
    const detail = (e as { errMsg?: string })?.errMsg
    throw new Error(detail ? `网络请求失败：${detail}` : '网络请求失败，请确认服务已启动')
  }

  // 仅登录接口的 401 表示账号密码错误，其余 401 表示登录态失效
  if (res.statusCode === 401 && path !== '/api/auth/login') {
    handleUnauthorized()
    throw new Error('未登录或登录已过期')
  }

  const body = res.data as { error?: string } | null
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(body?.error || `请求失败 (${res.statusCode})`)
  }
  return res.data as T
}

/** 图片等静态资源地址：小程序需要完整域名，H5 走代理用相对路径 */
export function assetUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return `${IS_H5 ? '' : API_BASE}${path}`
}

/** 上传文件并解析 JSON 响应，统一处理 401 与网络错误 */
async function uploadJson<T extends { error?: string }>(
  path: string,
  filePath: string,
  failMessage: string,
  formData?: Record<string, string>
): Promise<T> {
  const token = getToken()
  let res: { statusCode: number; data: string }
  try {
    res = await Taro.uploadFile({
      url: `${REQUEST_BASE}${path}`,
      filePath,
      name: 'file',
      formData,
      header: token ? { Authorization: `Bearer ${token}` } : {}
    })
  } catch {
    throw new Error(`${failMessage}，请检查网络`)
  }

  if (res.statusCode === 401) {
    handleUnauthorized()
    throw new Error('未登录或登录已过期')
  }

  let data: T
  try {
    data = JSON.parse(res.data) as T
  } catch {
    throw new Error(failMessage)
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(data.error || failMessage)
  }
  return data
}

export async function uploadImage(filePath: string): Promise<string> {
  const data = await uploadJson<{ url?: string; error?: string }>(
    '/api/upload',
    filePath,
    '图片上传失败'
  )
  if (!data.url) throw new Error('图片上传失败')
  return data.url
}

/** 上传并替换当前登录用户的头像，返回更新后的账号信息 */
export async function uploadAvatar(filePath: string): Promise<AuthUser> {
  const data = await uploadJson<AuthUser & { error?: string }>(
    '/api/auth/avatar',
    filePath,
    '头像上传失败'
  )
  if (!data.avatar) throw new Error('头像上传失败')
  return data
}

/** 管理员为指定账号更换头像 */
export async function uploadUserAvatar(userId: string, filePath: string): Promise<UserRow> {
  const data = await uploadJson<UserRow & { error?: string }>(
    `/api/users/${userId}/avatar`,
    filePath,
    '头像上传失败'
  )
  if (!data.id) throw new Error('头像上传失败')
  return data
}

export interface ImportUploadResponse {
  report?: ImportReport
  created?: number
  updated?: number
  skipped?: number
  newCategories?: string[]
  error?: string
}

/** Excel 批量导入：dryRun=1 只返回预览报告，dryRun=0 按选项写入 */
export async function uploadItemImport(
  filePath: string,
  formData: Record<string, string>
): Promise<ImportUploadResponse> {
  return uploadJson<ImportUploadResponse>('/api/items/import', filePath, '导入失败', formData)
}

/** 用当前 token 换取新 token，实现活跃续期；失败静默，不打断用户操作 */
export async function refreshSessionToken(): Promise<void> {
  if (!getToken()) return
  try {
    const data = await request<{ token?: string }>('/api/auth/refresh', { method: 'POST' })
    if (data?.token) setToken(data.token)
  } catch {
    // 续期失败交给后续业务请求的 401 统一处理
  }
}
