import { Image, Input, Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import AdminNav from '../../../components/AdminNav'
import { Empty, ErrorState, Loading } from '../../../components/Feedback'
import ItemCard from '../../../components/ItemCard'
import Modal from '../../../components/Modal'
import Pager from '../../../components/Pager'
import TabNav from '../../../components/TabNav'
import {
  createItem,
  deleteItem,
  fetchAdminItems,
  fetchCategories,
  stockIn,
  stockOut,
  updateItem
} from '../../../services/api'
import { assetUrl, uploadImage } from '../../../services/request'
import { isAdmin } from '../../../services/storage'
import type { CategoryRow, ItemPayload, ItemRow, PageResult } from '../../../services/types'
import { errorMessage } from '../../../utils/format'
import './index.scss'

const PAGE_SIZES = [10, 30, 50]

interface ItemForm {
  name: string
  model: string
  categoryId: string
  price: string
  innerDiameter: string
  outerDiameter: string
  height: string
  quantity: string
  supplier: string
  remark: string
  image: string
}

const EMPTY_FORM: ItemForm = {
  name: '',
  model: '',
  categoryId: '',
  price: '',
  innerDiameter: '',
  outerDiameter: '',
  height: '',
  quantity: '',
  supplier: '',
  remark: '',
  image: ''
}

const toast = (title: string) => Taro.showToast({ title, icon: 'none' })

export default function AdminItemsPage() {
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const [result, setResult] = useState<PageResult<ItemRow> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [deletingId, setDeletingId] = useState('')
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const seq = useRef(0)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ItemRow | null>(null)
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [stockOpen, setStockOpen] = useState(false)
  const [stockType, setStockType] = useState<'IN' | 'OUT'>('IN')
  const [stockTarget, setStockTarget] = useState<ItemRow | null>(null)
  const [stockQty, setStockQty] = useState('')
  const [stockRemark, setStockRemark] = useState('')
  const [stockBusy, setStockBusy] = useState(false)

  const admin = isAdmin()

  useEffect(() => {
    if (!isAdmin()) {
      Taro.reLaunch({ url: '/pages/search/index' })
      return
    }
    fetchCategories()
      .then((list) => setCategories(list))
      .catch((e) => toast(errorMessage(e)))
  }, [])

  useEffect(() => {
    if (!isAdmin()) return
    const my = ++seq.current
    setLoading(true)
    setError('')
    fetchAdminItems({ keyword: appliedKeyword, categoryId, page, pageSize })
      .then((res) => {
        if (my === seq.current) setResult(res)
      })
      .catch((e) => {
        if (my === seq.current) {
          const msg = errorMessage(e)
          setError(msg)
          toast(msg)
        }
      })
      .finally(() => {
        if (my === seq.current) setLoading(false)
      })
  }, [appliedKeyword, categoryId, page, pageSize, refreshKey])

  function reload() {
    setRefreshKey((key) => key + 1)
  }

  function applySearch() {
    setPage(1)
    setAppliedKeyword(keyword.trim())
  }

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, categoryId: categories[0]?.id || '' })
    setFormOpen(true)
  }

  function openEdit(item: ItemRow) {
    setEditing(item)
    setForm({
      name: item.name,
      model: item.model,
      categoryId: item.categoryId,
      price: String(item.price),
      innerDiameter: String(item.innerDiameter),
      outerDiameter: String(item.outerDiameter),
      height: String(item.height),
      quantity: String(item.quantity),
      supplier: item.supplier || '',
      remark: item.remark || '',
      image: item.image || ''
    })
    setFormOpen(true)
  }

  async function pickImage() {
    if (uploading) return
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })
      const filePath = res.tempFilePaths[0]
      if (!filePath) return
      setUploading(true)
      const url = await uploadImage(filePath)
      setForm((prev) => ({ ...prev, image: url }))
    } catch (e) {
      const message = errorMessage(e)
      if (!message.includes('cancel')) toast(message)
    } finally {
      setUploading(false)
    }
  }

  async function saveForm() {
    if (saving || uploading) return
    if (!form.name.trim()) return toast('请输入物品名称')
    if (!form.model.trim()) return toast('请输入型号')
    if (!form.categoryId) return toast('请选择分类')

    const numeric = [
      ['单价', form.price],
      ['内径', form.innerDiameter],
      ['外径', form.outerDiameter],
      ['高度', form.height]
    ] as const
    for (const [label, value] of numeric) {
      if (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        return toast(`${label}必须是非负数字`)
      }
    }
    const quantity = form.quantity === '' ? 0 : Number(form.quantity)
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000000000) {
      return toast('数量必须是 0 到 1000000000 的整数')
    }

    const payload: ItemPayload = {
      name: form.name.trim(),
      model: form.model.trim(),
      categoryId: form.categoryId,
      price: Number(form.price || 0),
      innerDiameter: Number(form.innerDiameter || 0),
      outerDiameter: Number(form.outerDiameter || 0),
      height: Number(form.height || 0),
      supplier: form.supplier.trim() || null,
      remark: form.remark.trim() || null,
      image: form.image || null
    }

    setSaving(true)
    try {
      if (editing) {
        await updateItem(editing.id, payload)
        toast('已保存修改')
        setFormOpen(false)
        reload()
      } else {
        await createItem({ ...payload, quantity })
        toast('上架成功')
        setFormOpen(false)
        // 新增后回到第 1 页，最新上架的物品按更新时间倒序排在首位
        if (page !== 1) setPage(1)
        else reload()
      }
    } catch (e) {
      toast(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  function openStock(item: ItemRow, type: 'IN' | 'OUT') {
    setStockTarget(item)
    setStockType(type)
    setStockQty('')
    setStockRemark('')
    setStockOpen(true)
  }

  async function submitStock() {
    if (!stockTarget || stockBusy) return
    const quantity = Number(stockQty)
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return toast('数量必须是大于 0 的整数')
    }
    setStockBusy(true)
    try {
      if (stockType === 'IN') {
        await stockIn(stockTarget.id, quantity, stockRemark.trim())
        toast('入库成功')
      } else {
        await stockOut(stockTarget.id, quantity, stockRemark.trim())
        toast('出库成功')
      }
      setStockOpen(false)
      reload()
    } catch (e) {
      toast(errorMessage(e))
    } finally {
      setStockBusy(false)
    }
  }

  async function confirmDelete(item: ItemRow) {
    if (deletingId) return
    const res = await Taro.showModal({
      title: '删除物品',
      content: `确认删除「${item.name}（${item.model}）」？`,
      confirmText: '删除',
      confirmColor: '#dc2626'
    })
    if (!res.confirm) return
    setDeletingId(item.id)
    try {
      await deleteItem(item.id)
      toast('已删除')
      reload()
    } catch (e) {
      toast(errorMessage(e))
    } finally {
      setDeletingId('')
    }
  }

  const items = result?.data || []
  const categoryIndex = Math.max(
    0,
    categories.findIndex((category) => category.id === form.categoryId)
  )
  const pageSizeIndex = Math.max(0, PAGE_SIZES.indexOf(pageSize))

  return (
    <View className="page">
      <AdminNav current="items" />

      <View className="search-bar">
        <Input
          className="input search-bar__input"
          value={keyword}
          placeholder="搜索物品名称或型号"
          confirmType="search"
          onInput={(e) => setKeyword(e.detail.value)}
          onConfirm={applySearch}
        />
        <View className="btn btn--primary search-bar__btn" onClick={applySearch}>
          <Text className="search-bar__btn-text">搜索</Text>
        </View>
      </View>

      <ScrollView scrollX className="chips">
        <View className="chips__inner">
          <View
            className={`chip${categoryId === '' ? ' chip--active' : ''}`}
            onClick={() => {
              setCategoryId('')
              setPage(1)
            }}
          >
            全部分类
          </View>
          {categories.map((category) => (
            <View
              key={category.id}
              className={`chip${categoryId === category.id ? ' chip--active' : ''}`}
              onClick={() => {
                setCategoryId(category.id)
                setPage(1)
              }}
            >
              {category.name}
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="list-head">
        <Text className="list-head__total">共 {result?.total ?? 0} 个物品</Text>
        <View className="btn btn--sm btn--primary" onClick={openCreate}>
          <Text className="list-head__btn-text">＋ 上架物品</Text>
        </View>
      </View>

      {loading && !result ? <Loading /> : null}
      {!loading && !result && error ? (
        <ErrorState text={error} onRetry={() => setRefreshKey((key) => key + 1)} />
      ) : null}
      {!loading && result && items.length === 0 ? <Empty text="暂无物品" /> : null}

      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          footer={
            <>
              <View className="btn btn--sm" onClick={() => openEdit(item)}>
                <Text>编辑</Text>
              </View>
              <View className="btn btn--sm btn--ghost" onClick={() => openStock(item, 'IN')}>
                <Text>入库</Text>
              </View>
              <View className="btn btn--sm btn--ghost" onClick={() => openStock(item, 'OUT')}>
                <Text>出库</Text>
              </View>
              <View className="btn btn--sm btn--danger" onClick={() => void confirmDelete(item)}>
                <Text>删除</Text>
              </View>
            </>
          }
        />
      ))}

      <View className="pager-bar">
        <Picker
          mode="selector"
          range={PAGE_SIZES.map((size) => `${size} 条/页`)}
          value={pageSizeIndex}
          onChange={(e) => {
            setPageSize(PAGE_SIZES[Number(e.detail.value)])
            setPage(1)
          }}
        >
          <View className="pager-bar__size">
            <Text className="pager-bar__size-text">每页 {pageSize} 条</Text>
          </View>
        </Picker>
        {result && result.total > 0 ? (
          <Pager
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
            loading={loading}
            onChange={setPage}
          />
        ) : null}
      </View>

      <Modal
        visible={formOpen}
        title={editing ? '编辑物品' : '上架物品'}
        onClose={() => {
          if (!saving && !uploading) setFormOpen(false)
        }}
        footer={
          <>
            <View
              className="btn btn--block modal-btn"
              onClick={() => {
                if (!saving && !uploading) setFormOpen(false)
              }}
            >
              <Text>取消</Text>
            </View>
            <View
              className={`btn btn--primary btn--block modal-btn${saving || uploading ? ' btn--disabled' : ''}`}
              onClick={() => {
                void saveForm()
              }}
            >
              <Text className="modal-btn__primary-text">{saving ? '保存中…' : '保存'}</Text>
            </View>
          </>
        }
      >
        <View className="field">
          <Text className="field__label">物品名称</Text>
          <Input
            className="input"
            value={form.name}
            placeholder="请输入物品名称"
            onInput={(e) => setForm({ ...form, name: e.detail.value })}
          />
        </View>

        <View className="field">
          <Text className="field__label">型号</Text>
          <Input
            className="input"
            value={form.model}
            placeholder="请输入型号"
            onInput={(e) => setForm({ ...form, model: e.detail.value })}
          />
        </View>

        <View className="field">
          <Text className="field__label">分类</Text>
          <Picker
            mode="selector"
            range={categories.map((category) => category.name)}
            value={categoryIndex}
            onChange={(e) => {
              const target = categories[Number(e.detail.value)]
              if (target) setForm({ ...form, categoryId: target.id })
            }}
          >
            <View className="input picker-value">
              <Text className={form.categoryId ? 'picker-value__text' : 'picker-value__placeholder'}>
                {categories.find((category) => category.id === form.categoryId)?.name || '请选择分类'}
              </Text>
            </View>
          </Picker>
        </View>

        <View className="field">
          <Text className="field__label">尺寸（mm）</Text>
          <View className="dim-row">
            <Input
              className="input dim-row__input"
              type="digit"
              value={form.innerDiameter}
              placeholder="内径"
              onInput={(e) => setForm({ ...form, innerDiameter: e.detail.value })}
            />
            <Text className="dim-row__sep">×</Text>
            <Input
              className="input dim-row__input"
              type="digit"
              value={form.outerDiameter}
              placeholder="外径"
              onInput={(e) => setForm({ ...form, outerDiameter: e.detail.value })}
            />
            <Text className="dim-row__sep">×</Text>
            <Input
              className="input dim-row__input"
              type="digit"
              value={form.height}
              placeholder="高度"
              onInput={(e) => setForm({ ...form, height: e.detail.value })}
            />
          </View>
        </View>

        <View className="form-grid">
          <View className="field form-grid__cell">
            <Text className="field__label">单价（元）</Text>
            <Input
              className="input"
              type="digit"
              value={form.price}
              placeholder="0.00"
              onInput={(e) => setForm({ ...form, price: e.detail.value })}
            />
          </View>
          <View className="field form-grid__cell">
            <Text className="field__label">{editing ? '当前库存' : '初始数量'}</Text>
            <Input
              className="input"
              type="number"
              disabled={!!editing}
              value={form.quantity}
              placeholder={editing ? '请通过出入库调整' : '0'}
              onInput={(e) => setForm({ ...form, quantity: e.detail.value })}
            />
          </View>
        </View>

        <View className="field">
          <Text className="field__label">供应商</Text>
          <Input
            className="input"
            value={form.supplier}
            placeholder="选填"
            onInput={(e) => setForm({ ...form, supplier: e.detail.value })}
          />
        </View>

        <View className="field">
          <Text className="field__label">备注</Text>
          <Input
            className="input"
            value={form.remark}
            placeholder="选填"
            onInput={(e) => setForm({ ...form, remark: e.detail.value })}
          />
        </View>

        <View className="field">
          <Text className="field__label">图片</Text>
          {form.image ? (
            <View className="img-upload">
              <Image className="img-upload__preview" src={assetUrl(form.image)} mode="aspectFill" />
              <View className="img-upload__actions">
                <View
                  className={`btn btn--sm${uploading ? ' btn--disabled' : ''}`}
                  onClick={() => void pickImage()}
                >
                  <Text>{uploading ? '上传中…' : '更换图片'}</Text>
                </View>
                <View
                  className="btn btn--sm btn--danger"
                  onClick={() => setForm({ ...form, image: '' })}
                >
                  <Text>移除</Text>
                </View>
              </View>
            </View>
          ) : (
            <View
              className={`img-upload__empty${uploading ? ' btn--disabled' : ''}`}
              onClick={() => void pickImage()}
            >
              <Text className="img-upload__empty-text">
                {uploading ? '图片上传中…' : '拍照或从相册选择'}
              </Text>
            </View>
          )}
        </View>
      </Modal>

      <Modal
        visible={stockOpen}
        title={stockType === 'IN' ? '入库' : '出库'}
        onClose={() => {
          if (!stockBusy) setStockOpen(false)
        }}
        footer={
          <>
            <View
              className="btn btn--block modal-btn"
              onClick={() => {
                if (!stockBusy) setStockOpen(false)
              }}
            >
              <Text>取消</Text>
            </View>
            <View
              className={`btn btn--primary btn--block modal-btn${stockBusy ? ' btn--disabled' : ''}`}
              onClick={() => {
                void submitStock()
              }}
            >
              <Text className="modal-btn__primary-text">
                {stockBusy ? '提交中…' : `确认${stockType === 'IN' ? '入库' : '出库'}`}
              </Text>
            </View>
          </>
        }
      >
        <View className="stock-target">
          <Text className="stock-target__name">{stockTarget?.name}</Text>
          <Text className="stock-target__meta">
            {stockTarget?.model} ｜ 当前库存 {stockTarget?.quantity}
          </Text>
        </View>
        <View className="field">
          <Text className="field__label">数量</Text>
          <Input
            className="input"
            type="number"
            value={stockQty}
            placeholder="请输入数量"
            onInput={(e) => setStockQty(e.detail.value)}
          />
        </View>
        <View className="field">
          <Text className="field__label">备注</Text>
          <Input
            className="input"
            value={stockRemark}
            placeholder="选填，例如采购单号"
            onInput={(e) => setStockRemark(e.detail.value)}
          />
        </View>
      </Modal>

      <TabNav current={admin ? 'admin' : 'search'} />
    </View>
  )
}
