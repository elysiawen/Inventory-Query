import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { login } from '../../services/api'
import { getStoredUser, getToken, setStoredUser, setToken } from '../../services/storage'
import { errorMessage } from '../../utils/format'
import './index.scss'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (getToken() && getStoredUser()) {
      Taro.reLaunch({ url: '/pages/search/index' })
    }
  }, [])

  async function submit() {
    if (loading) return
    if (!username.trim() || !password) {
      Taro.showToast({ title: '请输入账号和密码', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const res = await login(username.trim(), password)
      setToken(res.token)
      setStoredUser(res.user)
      Taro.reLaunch({ url: '/pages/search/index' })
    } catch (e) {
      Taro.showToast({ title: errorMessage(e), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className="login">
      <View className="login__brand">
        <View className="login__logo">
          <Text className="login__logo-text">库</Text>
        </View>
        <Text className="login__title">库存物资管理</Text>
        <Text className="login__subtitle">使用系统账号登录后使用</Text>
      </View>

      <View className="login__card">
        <View className="field">
          <Text className="field__label">账号</Text>
          <Input
            className="input"
            value={username}
            placeholder="请输入账号"
            onInput={(e) => setUsername(e.detail.value)}
          />
        </View>
        <View className="field">
          <Text className="field__label">密码</Text>
          <Input
            className="input"
            password
            value={password}
            placeholder="请输入密码"
            onInput={(e) => setPassword(e.detail.value)}
            onConfirm={() => {
              void submit()
            }}
          />
        </View>
        <View
          className={`login__submit${loading ? ' login__submit--disabled' : ''}`}
          onClick={() => {
            void submit()
          }}
        >
          <Text className="login__submit-text">{loading ? '登录中…' : '登录'}</Text>
        </View>
      </View>

      <Text className="login__tip">账号由管理员在后台创建，连续输错会被临时锁定</Text>
    </View>
  )
}
