import { Image, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import TabNav from '../../components/TabNav'
import { fetchMe, logoutRemote, removeAvatar as removeMyAvatar, updateProfile } from '../../services/api'
import { assetUrl, uploadAvatar } from '../../services/request'
import { clearAuth, getStoredUser, getToken, setStoredUser } from '../../services/storage'
import type { AuthUser } from '../../services/types'
import { errorMessage } from '../../utils/format'
import './index.scss'

export default function ProfilePage() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser())
  const [refreshing, setRefreshing] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [nicknameInput, setNicknameInput] = useState('')
  const [nicknameBusy, setNicknameBusy] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [oldPasswordInput, setOldPasswordInput] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)

  useEffect(() => {
    if (!getToken()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    // 有 token 但本地用户缓存丢失（被清理等）时补拉一次，避免页面停在「未登录」；
    // token 已失效会由请求层统一清理并跳转登录页
    if (!getStoredUser()) {
      fetchMe()
        .then(applyUser)
        .catch(() => {})
    }
  }, [])

  function applyUser(latest: AuthUser) {
    setStoredUser(latest)
    setUser(latest)
  }

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      const latest = await fetchMe()
      applyUser(latest)
      Taro.showToast({ title: '账号信息已更新', icon: 'none' })
    } catch (e) {
      Taro.showToast({ title: errorMessage(e), icon: 'none' })
    } finally {
      setRefreshing(false)
    }
  }

  async function changeAvatar() {
    if (avatarBusy) return
    let filePath = ''
    try {
      const res = await Taro.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed']
      })
      filePath = res.tempFiles?.[0]?.tempFilePath || ''
    } catch (e) {
      const msg = String((e as { errMsg?: string })?.errMsg || '')
      if (msg.includes('cancel')) return
      Taro.showToast({ title: '选择图片失败', icon: 'none' })
      return
    }
    if (!filePath) return

    setAvatarBusy(true)
    try {
      const latest = await uploadAvatar(filePath)
      applyUser(latest)
      Taro.showToast({ title: '头像已更新', icon: 'success' })
    } catch (e) {
      Taro.showToast({ title: errorMessage(e), icon: 'none' })
    } finally {
      setAvatarBusy(false)
    }
  }

  async function removeAvatar() {
    if (avatarBusy) return
    const res = await Taro.showModal({
      title: '删除头像',
      content: '确定删除当前头像吗？',
      confirmText: '删除',
      confirmColor: '#dc2626'
    })
    if (!res.confirm) return
    setAvatarBusy(true)
    try {
      const latest = await removeMyAvatar()
      applyUser(latest)
      Taro.showToast({ title: '头像已删除', icon: 'success' })
    } catch (e) {
      Taro.showToast({ title: errorMessage(e), icon: 'none' })
    } finally {
      setAvatarBusy(false)
    }
  }

  async function saveNickname() {
    if (nicknameBusy) return
    const name = nicknameInput.trim()
    if (name === (user?.nickname ?? '')) {
      Taro.showToast({ title: '昵称没有变化', icon: 'none' })
      return
    }
    setNicknameBusy(true)
    try {
      // 空字符串表示清除昵称，界面回退显示账号
      const latest = await updateProfile({ nickname: name })
      applyUser(latest)
      setNicknameInput('')
      Taro.showToast({ title: name ? '昵称已更新' : '昵称已清除', icon: 'success' })
    } catch (e) {
      Taro.showToast({ title: errorMessage(e), icon: 'none' })
    } finally {
      setNicknameBusy(false)
    }
  }

  async function savePassword() {
    if (passwordBusy) return
    if (!oldPasswordInput) {
      Taro.showToast({ title: '请输入原密码', icon: 'none' })
      return
    }
    if (passwordInput.length < 6 || passwordInput.length > 72) {
      Taro.showToast({ title: '密码长度需为 6-72 位', icon: 'none' })
      return
    }
    setPasswordBusy(true)
    try {
      await updateProfile({ password: passwordInput, oldPassword: oldPasswordInput })
      setPasswordInput('')
      setOldPasswordInput('')
      // 改密后服务端会话版本已更换，旧 token 立即失效，必须重新登录
      Taro.showToast({ title: '密码已更新，请重新登录', icon: 'none' })
      clearAuth()
      Taro.reLaunch({ url: '/pages/login/index' })
    } catch (e) {
      Taro.showToast({ title: errorMessage(e), icon: 'none' })
    } finally {
      setPasswordBusy(false)
    }
  }

  async function logout() {
    const res = await Taro.showModal({
      title: '退出登录',
      content: '确认退出当前账号？',
      confirmText: '退出',
      confirmColor: '#dc2626'
    })
    if (!res.confirm) return
    await logoutRemote()
    clearAuth()
    Taro.reLaunch({ url: '/pages/login/index' })
  }

  const isAdmin = user?.role === 'ADMIN'
  const displayName = user?.nickname?.trim() || user?.username || '未登录'

  return (
    <View className="page">
      <View className="profile-card">
        <View className="profile-card__avatar" onClick={() => void changeAvatar()}>
          {user?.avatar ? (
            <Image
              className="profile-card__avatar-img"
              src={assetUrl(user.avatar)}
              mode="aspectFill"
            />
          ) : (
            <Text className="profile-card__avatar-text">
              {user ? displayName.slice(0, 1).toUpperCase() : '?'}
            </Text>
          )}
          <View className="profile-card__avatar-badge">
            <Text className="profile-card__avatar-badge-text">{avatarBusy ? '…' : '改'}</Text>
          </View>
        </View>
        <View className="profile-card__info">
          <View className="row">
            <Text className="profile-card__name">{displayName}</Text>
            <View className={`tag ${isAdmin ? 'tag--admin' : 'tag--user'} profile-card__tag`}>
              {isAdmin ? '管理员' : '普通用户'}
            </View>
          </View>
          {user?.nickname ? (
            <Text className="profile-card__id">
              账号：{user.username}（需修改请联系管理员）
            </Text>
          ) : null}
          <Text className="profile-card__id">ID：{user?.id || '-'}</Text>
          <Text className="profile-card__hint">
            {user?.avatar ? '点击头像可更换' : '点击头像可上传'}
          </Text>
          {user?.avatar ? (
            <Text className="profile-card__remove" onClick={() => void removeAvatar()}>
              删除头像
            </Text>
          ) : null}
        </View>
      </View>

      <View className="card">
        <Text className="profile-form__title">修改昵称</Text>
        <Text className="profile-form__hint">留空并保存可清除昵称，界面回退显示账号</Text>
        <View className="profile-form__row">
          <Input
            className="input profile-form__input"
            value={nicknameInput}
            placeholder={`当前：${user?.nickname || '未设置'}`}
            maxlength={30}
            onInput={(e) => setNicknameInput(e.detail.value)}
          />
          <View
            className={`btn btn--sm${nicknameBusy ? ' btn--disabled' : ''}`}
            onClick={() => void saveNickname()}
          >
            <Text>{nicknameBusy ? '保存中' : '保存'}</Text>
          </View>
        </View>
      </View>

      <View className="card">
        <Text className="profile-form__title">修改密码</Text>
        <View className="profile-form__row">
          <Input
            className="input profile-form__input"
            password
            value={oldPasswordInput}
            placeholder="原密码"
            maxlength={72}
            onInput={(e) => setOldPasswordInput(e.detail.value)}
          />
        </View>
        <View className="profile-form__row">
          <Input
            className="input profile-form__input"
            password
            value={passwordInput}
            placeholder="新密码，6-72 位"
            maxlength={72}
            onInput={(e) => setPasswordInput(e.detail.value)}
          />
          <View
            className={`btn btn--sm${passwordBusy ? ' btn--disabled' : ''}`}
            onClick={() => void savePassword()}
          >
            <Text>{passwordBusy ? '保存中' : '保存'}</Text>
          </View>
        </View>
      </View>

      <View className="card">
        <View className="kv">
          <Text className="kv__key">账号权限</Text>
          <Text className="kv__value">{isAdmin ? '可管理物品、分类、账号' : '仅可查询物品'}</Text>
        </View>
        <View className="divider" />
        <View className="kv">
          <Text className="kv__key">服务地址</Text>
          <Text className="kv__value profile-card__base">
            {process.env.TARO_ENV === 'h5' ? '开发代理' : '远程服务'}
          </Text>
        </View>
      </View>

      <View className="card">
        <View
          className={`btn btn--block${refreshing ? ' btn--disabled' : ''}`}
          onClick={() => {
            void refresh()
          }}
        >
          <Text>{refreshing ? '同步中…' : '同步最新账号信息'}</Text>
        </View>

        <View className="btn btn--danger btn--block profile-card__action" onClick={() => void logout()}>
          <Text>退出登录</Text>
        </View>
      </View>

      <TabNav current="profile" />
    </View>
  )
}
