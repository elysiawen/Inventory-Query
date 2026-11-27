import { Image, Input, Picker, Switch, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import AdminNav from '../../../components/AdminNav'
import { Empty, Loading } from '../../../components/Feedback'
import Modal from '../../../components/Modal'
import TabNav from '../../../components/TabNav'
import {
  createUser,
  deleteUser,
  fetchUsers,
  updateUser
} from '../../../services/api'
import { assetUrl, uploadUserAvatar } from '../../../services/request'
import { clearAuth, getStoredUser, isAdmin, setStoredUser } from '../../../services/storage'
import type { UserRow } from '../../../services/types'
import { errorMessage, formatDateTime } from '../../../utils/format'
import './index.scss'

const toast = (title: string) => Taro.showToast({ title, icon: 'none' })
const ROLE_LABELS = ['普通用户', '管理员']

export default function AdminUsersPage() {
  const [list, setList] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'USER' | 'ADMIN'>('USER')
  const [active, setActive] = useState(true)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')

  const me = getStoredUser()
  const isSelf = (user: UserRow) => user.id === me?.id

  useEffect(() => {
    if (!isAdmin()) {
      Taro.reLaunch({ url: '/pages/search/index' })
      return
    }
  }, [])

  useEffect(() => {
    if (!isAdmin()) return
    setLoading(true)
    fetchUsers()
      .then((data) => setList(data))
      .catch((e) => toast(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [refreshKey])

  function reload() {
    setRefreshKey((key) => key + 1)
  }

  function openCreate() {
    setEditing(null)
    setUsername('')
    setNickname('')
    setPassword('')
    setRole('USER')
    setActive(true)
    setModalOpen(true)
  }

  function openEdit(user: UserRow) {
    setEditing(user)
    setUsername(user.username)
    setNickname(user.nickname ?? '')
    setPassword('')
    setRole(user.role)
    setActive(user.active)
    setModalOpen(true)
  }

  async function save() {
    if (saving) return
    const name = username.trim()
    if (!name) return toast('请输入账号')
    if (!/^\S{1,50}$/.test(name)) return toast('账号需为 1-50 个非空白字符')
    if (!editing && !password) return toast('请输入初始密码')
    if (password && (password.length < 6 || password.length > 72)) {
      return toast('密码长度需为 6-72 位')
    }
    if (nickname.trim().length > 30) return toast('昵称最多 30 个字符')
    setSaving(true)
    try {
      if (editing) {
        const payload: {
          username: string
          nickname: string
          password?: string
          role?: 'USER' | 'ADMIN'
          active?: boolean
        } = { username: name, nickname: nickname.trim() }
        if (password) payload.password = password
        if (!isSelf(editing)) {
          payload.role = role
          payload.active = active
        }
        const updated = await updateUser(editing.id, payload)
        // 改自己的密码会作废全部会话，直接回登录页，避免后续请求 401 被动跳转
        if (isSelf(updated) && password) {
          toast('密码已更新，请重新登录')
          clearAuth()
          setModalOpen(false)
          Taro.reLaunch({ url: '/pages/login/index' })
          return
        }
        // 改的是当前登录账号时同步本地缓存，避免“我的”页仍显示旧账号
        if (isSelf(updated)) {
          setStoredUser({
            id: updated.id,
            username: updated.username,
            nickname: updated.nickname ?? null,
            role: updated.role,
            avatar: updated.avatar
          })
        }
        toast('已保存')
      } else {
        await createUser({ username: name, nickname: nickname.trim(), password, role })
        toast('账号已创建')
      }
      setModalOpen(false)
      reload()
    } catch (e) {
      toast(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function changeAvatar() {
    if (!editing || avatarBusy) return
    const targetId = editing.id
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
      return toast('选择图片失败')
    }
    if (!filePath) return

    setAvatarBusy(true)
    try {
      const updated = await uploadUserAvatar(targetId, filePath)
      setList((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      // 只写回仍是同一账号的编辑表单，避免上传期间切换账号导致头像错位
      setEditing((prev) => (prev && prev.id === targetId ? updated : prev))
      if (isSelf(updated)) {
        setStoredUser({
          id: updated.id,
          username: updated.username,
          nickname: updated.nickname ?? null,
          role: updated.role,
          avatar: updated.avatar
        })
      }
      toast('头像已更新')
    } catch (e) {
      toast(errorMessage(e))
    } finally {
      setAvatarBusy(false)
    }
  }

  async function confirmDelete(user: UserRow) {
    if (isSelf(user)) return toast('不能删除当前登录的自己')
    if (deletingId) return
    const res = await Taro.showModal({
      title: '删除账号',
      content: `确认删除「${user.username}」？存在流水的账号无法删除。`,
      confirmText: '删除',
      confirmColor: '#dc2626'
    })
    if (!res.confirm) return
    setDeletingId(user.id)
    try {
      await deleteUser(user.id)
      toast('已删除')
      reload()
    } catch (e) {
      toast(errorMessage(e))
    } finally {
      setDeletingId('')
    }
  }

  const roleIndex = role === 'ADMIN' ? 1 : 0

  return (
    <View className="page">
      <AdminNav current="users" />

      <View className="list-head">
        <Text className="list-head__total">共 {list.length} 个账号</Text>
        <View className="btn btn--sm btn--primary" onClick={openCreate}>
          <Text className="list-head__btn-text">＋ 新增账号</Text>
        </View>
      </View>

      {loading ? <Loading /> : null}
      {!loading && list.length === 0 ? <Empty text="暂无账号" /> : null}

      {list.map((user) => (
        <View className="card user-card" key={user.id}>
          <View className="row-between">
            <View className="user-card__title">
              <Text className="user-card__name">{user.nickname?.trim() || user.username}</Text>
              {user.nickname ? (
                <Text className="user-card__self">@{user.username}</Text>
              ) : null}
              {isSelf(user) ? <Text className="user-card__self">（当前账号）</Text> : null}
            </View>
            <View className={`tag ${user.role === 'ADMIN' ? 'tag--admin' : 'tag--user'}`}>
              {user.role === 'ADMIN' ? '管理员' : '普通用户'}
            </View>
          </View>
          <View className="user-card__meta">
            <Text className={`tag ${user.active ? 'tag--on' : 'tag--off'}`}>
              {user.active ? '启用中' : '已禁用'}
            </Text>
            <Text className="user-card__time">创建于 {formatDateTime(user.createdAt)}</Text>
          </View>
          <View className="user-card__actions">
            <View className="btn btn--sm" onClick={() => openEdit(user)}>
              <Text>编辑</Text>
            </View>
            <View className="btn btn--sm btn--danger" onClick={() => void confirmDelete(user)}>
              <Text>删除</Text>
            </View>
          </View>
        </View>
      ))}

      <Modal
        visible={modalOpen}
        title={editing ? '编辑账号' : '新增账号'}
        onClose={() => {
          if (!saving && !avatarBusy) setModalOpen(false)
        }}
        footer={
          <>
            <View
              className="btn btn--block modal-btn"
              onClick={() => {
                if (!saving && !avatarBusy) setModalOpen(false)
              }}
            >
              <Text>取消</Text>
            </View>
            <View
              className={`btn btn--primary btn--block modal-btn${saving ? ' btn--disabled' : ''}`}
              onClick={() => {
                void save()
              }}
            >
              <Text className="modal-btn__primary-text">{saving ? '保存中…' : '保存'}</Text>
            </View>
          </>
        }
      >
        <View className="field">
          <Text className="field__label">账号</Text>
          <Input
            className="input"
            value={username}
            placeholder="1-50 个非空白字符"
            onInput={(e) => setUsername(e.detail.value)}
          />
        </View>
        <View className="field">
          <Text className="field__label">昵称</Text>
          <Input
            className="input"
            value={nickname}
            maxlength={30}
            placeholder="选填，留空则显示账号"
            onInput={(e) => setNickname(e.detail.value)}
          />
        </View>

        {editing ? (
          <View className="field">
            <Text className="field__label">头像</Text>
            <View className="user-avatar-row" onClick={() => void changeAvatar()}>
              {editing.avatar ? (
                <Image
                  className="user-avatar"
                  src={assetUrl(editing.avatar)}
                  mode="aspectFill"
                />
              ) : (
                <View className="user-avatar user-avatar--empty">
                  <Text>{editing.username.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <Text className="user-avatar__hint">
                {avatarBusy ? '上传中…' : '点击更换头像'}
              </Text>
            </View>
          </View>
        ) : null}

        <View className="field">
          <Text className="field__label">{editing ? '重置密码' : '初始密码'}</Text>
          <Input
            className="input"
            password
            value={password}
            placeholder={editing ? '留空则不修改密码' : '6-72 位'}
            onInput={(e) => setPassword(e.detail.value)}
          />
        </View>

        {!editing || !isSelf(editing) ? (
          <View className="field">
            <Text className="field__label">角色</Text>
            <Picker
              mode="selector"
              range={ROLE_LABELS}
              value={roleIndex}
              onChange={(e) => setRole(Number(e.detail.value) === 1 ? 'ADMIN' : 'USER')}
            >
              <View className="input picker-value">
                <Text className="picker-value__text">{ROLE_LABELS[roleIndex]}</Text>
              </View>
            </Picker>
            {editing ? (
              <Text className="field__hint">管理员可管理全部物品、分类、账号与流水</Text>
            ) : null}
          </View>
        ) : (
          <View className="field__hint">不能修改自己的角色，请由其他管理员操作</View>
        )}

        {editing ? (
          <View className="field">
            <Text className="field__label">启用状态</Text>
            <View className="switch-row">
              <Switch
                checked={active}
                disabled={isSelf(editing)}
                color="#2563eb"
                onChange={(e) => setActive(e.detail.value)}
              />
              <Text className="switch-row__text">{active ? '启用中' : '已禁用'}</Text>
              {isSelf(editing) ? (
                <Text className="switch-row__hint">不能修改自己的启用状态</Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </Modal>

      <TabNav current="admin" />
    </View>
  )
}
