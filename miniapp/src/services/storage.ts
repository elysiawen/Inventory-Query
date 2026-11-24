import Taro from '@tarojs/taro'
import type { AuthUser } from './types'

const TOKEN_KEY = 'inv_token'
const USER_KEY = 'inv_user'

export function getToken(): string {
  const value = Taro.getStorageSync(TOKEN_KEY)
  return typeof value === 'string' ? value : ''
}

export function setToken(token: string) {
  Taro.setStorageSync(TOKEN_KEY, token)
}

export function getStoredUser(): AuthUser | null {
  const value = Taro.getStorageSync(USER_KEY)
  if (!value || typeof value !== 'object') return null
  return value as AuthUser
}

export function setStoredUser(user: AuthUser) {
  Taro.setStorageSync(USER_KEY, user)
}

export function isAdmin(): boolean {
  return getStoredUser()?.role === 'ADMIN'
}

export function clearAuth() {
  Taro.removeStorageSync(TOKEN_KEY)
  Taro.removeStorageSync(USER_KEY)
}
