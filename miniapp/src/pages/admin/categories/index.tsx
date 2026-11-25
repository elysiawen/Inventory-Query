import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import AdminNav from '../../../components/AdminNav'
import { Empty, ErrorState, Loading } from '../../../components/Feedback'
import Modal from '../../../components/Modal'
import TabNav from '../../../components/TabNav'
import { createCategory, deleteCategory, fetchCategories, renameCategory } from '../../../services/api'
import { isAdmin } from '../../../services/storage'
import type { CategoryRow } from '../../../services/types'
import { errorMessage, formatDateTime } from '../../../utils/format'
import './index.scss'

const toast = (title: string) => Taro.showToast({ title, icon: 'none' })

export default function AdminCategoriesPage() {
  const [list, setList] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryRow | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  // 正在删除的分类 id：防止重复点击导致第二次请求 404
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin()) {
      Taro.reLaunch({ url: '/pages/search/index' })
      return
    }
  }, [])

  useEffect(() => {
    if (!isAdmin()) return
    setLoading(true)
    setError('')
    fetchCategories()
      .then((data) => setList(data))
      .catch((e) => {
        const msg = errorMessage(e)
        setError(msg)
        toast(msg)
      })
      .finally(() => setLoading(false))
  }, [refreshKey])

  function reload() {
    setRefreshKey((key) => key + 1)
  }

  function openCreate() {
    setEditing(null)
    setName('')
    setModalOpen(true)
  }

  function openEdit(category: CategoryRow) {
    setEditing(category)
    setName(category.name)
    setModalOpen(true)
  }

  async function save() {
    const value = name.trim()
    if (!value) return toast('请输入分类名称')
    if (saving) return
    setSaving(true)
    try {
      if (editing) {
        await renameCategory(editing.id, value)
        toast('已更新')
      } else {
        await createCategory(value)
        toast('已新增')
      }
      setModalOpen(false)
      reload()
    } catch (e) {
      toast(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete(category: CategoryRow) {
    if (deletingId) return
    const res = await Taro.showModal({
      title: '删除分类',
      content: `确认删除「${category.name}」？分类下还有物品时无法删除。`,
      confirmText: '删除',
      confirmColor: '#dc2626'
    })
    if (!res.confirm) return
    setDeletingId(category.id)
    try {
      await deleteCategory(category.id)
      toast('已删除')
      reload()
    } catch (e) {
      toast(errorMessage(e))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <View className="page">
      <AdminNav current="categories" />

      <View className="list-head">
        <Text className="list-head__total">共 {list.length} 个分类</Text>
        <View className="btn btn--sm btn--primary" onClick={openCreate}>
          <Text className="list-head__btn-text">＋ 新增分类</Text>
        </View>
      </View>

      {loading ? <Loading /> : null}
      {!loading && error ? (
        <ErrorState text={error} onRetry={() => setRefreshKey((key) => key + 1)} />
      ) : null}
      {!loading && !error && list.length === 0 ? <Empty text="暂无分类，先新增一个" /> : null}

      {list.map((category) => (
        <View className="card category-card" key={category.id}>
          <View className="row-between">
            <Text className="category-card__name">{category.name}</Text>
            <View className="tag tag--user">{category._count?.items ?? 0} 个物品</View>
          </View>
          <Text className="category-card__time">创建于 {formatDateTime(category.createdAt)}</Text>
          <View className="category-card__actions">
            <View className="btn btn--sm" onClick={() => openEdit(category)}>
              <Text>重命名</Text>
            </View>
            <View className="btn btn--sm btn--danger" onClick={() => void confirmDelete(category)}>
              <Text>删除</Text>
            </View>
          </View>
        </View>
      ))}

      <Modal
        visible={modalOpen}
        title={editing ? '重命名分类' : '新增分类'}
        onClose={() => {
          if (!saving) setModalOpen(false)
        }}
        footer={
          <>
            <View
              className="btn btn--block modal-btn"
              onClick={() => {
                if (!saving) setModalOpen(false)
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
          <Text className="field__label">分类名称</Text>
          <Input
            className="input"
            value={name}
            placeholder="请输入分类名称"
            onInput={(e) => setName(e.detail.value)}
          />
        </View>
      </Modal>

      <TabNav current="admin" />
    </View>
  )
}
