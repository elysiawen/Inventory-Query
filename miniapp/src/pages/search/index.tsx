import { Input, Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { Empty, ErrorState, Loading } from '../../components/Feedback'
import ItemCard from '../../components/ItemCard'
import Modal from '../../components/Modal'
import Pager from '../../components/Pager'
import TabNav from '../../components/TabNav'
import { fetchCategories, fetchMe, searchItems, stockIn, stockOut, type ItemSearchParams } from '../../services/api'
import { getToken, setStoredUser } from '../../services/storage'
import type { CategoryRow, ItemRow, PageResult } from '../../services/types'
import { errorMessage } from '../../utils/format'
import './index.scss'

const PAGE_SIZE = 15

const SORT_OPTIONS = [
  { key: 'updatedAt', label: '最近更新' },
  { key: 'name', label: '名称' },
  { key: 'price', label: '单价' },
  { key: 'quantity', label: '库存' },
  { key: 'innerDiameter', label: '内径/柄径' },
  { key: 'outerDiameter', label: '外径' },
  { key: 'height', label: '高度/总长' }
]

type DimKey = 'inner' | 'outer' | 'height'
type DimMode = 'exact' | 'range'

interface DimValue {
  mode: DimMode
  exact: string
  min: string
  max: string
}

type DimState = Record<DimKey, DimValue>

const DIM_FIELDS: { key: DimKey; label: string }[] = [
  { key: 'inner', label: '内径/柄径' },
  { key: 'outer', label: '外径' },
  { key: 'height', label: '高度/总长' }
]

function emptyDims(): DimState {
  return {
    inner: { mode: 'exact', exact: '', min: '', max: '' },
    outer: { mode: 'exact', exact: '', min: '', max: '' },
    height: { mode: 'exact', exact: '', min: '', max: '' }
  }
}

export default function SearchPage() {
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [dimInput, setDimInput] = useState<DimState>(emptyDims)
  const [dims, setDims] = useState<DimState>(emptyDims)
  const [sortIndex, setSortIndex] = useState(0)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<PageResult<ItemRow> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  // 结果卡片上的出入库弹窗
  const [stockTarget, setStockTarget] = useState<{ item: ItemRow; type: 'IN' | 'OUT' } | null>(null)
  const [stockQty, setStockQty] = useState('1')
  const [stockRemark, setStockRemark] = useState('')
  const [stockBusy, setStockBusy] = useState(false)
  // 出入库入口仅管理员可见：默认隐藏，拿到服务端最新角色后再显示
  const [canStock, setCanStock] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (!getToken()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    // 每次进入都按服务端最新角色判定出入库入口，避免本地缓存的角色过期
    fetchMe()
      .then((u) => {
        setStoredUser(u)
        setCanStock(u.role === 'ADMIN')
      })
      .catch(() => {})
    fetchCategories()
      .then((list) => setCategories(list))
      .catch((e) => Taro.showToast({ title: errorMessage(e), icon: 'none' }))
  }, [])

  useEffect(() => {
    const my = ++seq.current
    setLoading(true)
    setError('')
    const params: ItemSearchParams = {
      keyword: appliedKeyword,
      categoryId,
      sortBy: SORT_OPTIONS[sortIndex].key,
      sortOrder,
      page,
      pageSize: PAGE_SIZE
    }
    // 每个尺寸独立选择精确或范围
    if (dims.inner.mode === 'exact') params.innerExact = dims.inner.exact
    else {
      params.innerMin = dims.inner.min
      params.innerMax = dims.inner.max
    }
    if (dims.outer.mode === 'exact') params.outerExact = dims.outer.exact
    else {
      params.outerMin = dims.outer.min
      params.outerMax = dims.outer.max
    }
    if (dims.height.mode === 'exact') params.heightExact = dims.height.exact
    else {
      params.heightMin = dims.height.min
      params.heightMax = dims.height.max
    }
    searchItems(params)
      .then((res) => {
        if (my === seq.current) setResult(res)
      })
      .catch((e) => {
        if (my === seq.current) {
          const msg = errorMessage(e)
          setError(msg)
          Taro.showToast({ title: msg, icon: 'none' })
        }
      })
      .finally(() => {
        if (my === seq.current) setLoading(false)
      })
  }, [appliedKeyword, categoryId, dims, sortIndex, sortOrder, page, reloadKey])

  function applySearch() {
    setPage(1)
    setAppliedKeyword(keyword.trim())
    // 条件没变时也要重新查询，避免点「搜索」没反应
    setReloadKey((k) => k + 1)
  }

  function applyDims() {
    for (const field of DIM_FIELDS) {
      const value = dimInput[field.key]
      if (
        value.mode === 'range' &&
        value.min !== '' &&
        value.max !== '' &&
        Number(value.min) > Number(value.max)
      ) {
        Taro.showToast({ title: `${field.label}最小值不能大于最大值`, icon: 'none' })
        return
      }
    }
    setDims({ ...dimInput })
    setPage(1)
    setShowFilter(false)
  }

  function resetDims() {
    setDimInput(emptyDims())
    setDims(emptyDims())
    setPage(1)
  }

  function toggleFilter() {
    setShowFilter(!showFilter)
  }

  function openStock(item: ItemRow, type: 'IN' | 'OUT') {
    setStockTarget({ item, type })
    setStockQty('1')
    setStockRemark('')
  }

  async function submitStock() {
    if (!stockTarget || stockBusy) return
    const quantity = Number(stockQty)
    if (!Number.isInteger(quantity) || quantity <= 0) {
      Taro.showToast({ title: '请输入大于 0 的整数数量', icon: 'none' })
      return
    }
    if (stockTarget.type === 'OUT' && quantity > stockTarget.item.quantity) {
      Taro.showToast({
        title: `出库数量不能超过当前库存 ${stockTarget.item.quantity}`,
        icon: 'none'
      })
      return
    }
    setStockBusy(true)
    try {
      if (stockTarget.type === 'IN') {
        await stockIn(stockTarget.item.id, quantity, stockRemark.trim())
      } else {
        await stockOut(stockTarget.item.id, quantity, stockRemark.trim())
      }
      Taro.showToast({ title: stockTarget.type === 'IN' ? '入库成功' : '出库成功', icon: 'success' })
      setStockTarget(null)
      setReloadKey((k) => k + 1)
    } catch (e) {
      Taro.showToast({ title: errorMessage(e), icon: 'none' })
    } finally {
      setStockBusy(false)
    }
  }

  const items = result?.data || []

  return (
    <View className="page">
      {/* 搜索条吸顶，下滑时始终可见；分类与尺寸都收进「高级」面板 */}
      <View className="search-sticky">
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
          <View
            className={`search-bar__more${showFilter ? ' search-bar__more--active' : ''}`}
            onClick={toggleFilter}
          >
            <Text className="search-bar__more-text">高级</Text>
          </View>
        </View>
      </View>

      <View className="toolbar">
        <View className="toolbar__cell toolbar__cell--wide">
          <Picker
            mode="selector"
            range={SORT_OPTIONS.map((item) => item.label)}
            value={sortIndex}
            onChange={(e) => {
              setSortIndex(Number(e.detail.value))
              setPage(1)
            }}
          >
            <View className="toolbar__item">
              <Text className="toolbar__text">排序：{SORT_OPTIONS[sortIndex].label}</Text>
            </View>
          </Picker>
        </View>
        <View className="toolbar__cell">
          <View
            className="toolbar__item"
            onClick={() => {
              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
              setPage(1)
            }}
          >
            <Text className="toolbar__text">{sortOrder === 'desc' ? '降序' : '升序'}</Text>
          </View>
        </View>
      </View>

      {/* 高级筛选浮层：覆盖在页面上方，点击遮罩收起 */}
      {showFilter ? (
        <View className="filter-mask" onClick={() => setShowFilter(false)} />
      ) : null}

      {showFilter ? (
        <View className="card filter-panel">
          <Text className="filter-panel__title">分类</Text>
          <ScrollView scrollX className="chips chips--panel">
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

          <Text className="filter-panel__title filter-panel__title--gap">尺寸筛选（mm）</Text>
          {DIM_FIELDS.map((field) => {
            const value = dimInput[field.key]
            const update = (patch: Partial<DimValue>) =>
              setDimInput((prev) => ({ ...prev, [field.key]: { ...prev[field.key], ...patch } }))
            return (
              <View key={field.key} className="dim-row">
                <View className="dim-row__head">
                  <Text className="dim-row__label">{field.label}</Text>
                  <View className="seg">
                    <View
                      className={`seg__item${value.mode === 'exact' ? ' seg__item--active' : ''}`}
                      onClick={() => update({ mode: 'exact' })}
                    >
                      <Text className="seg__text">精确</Text>
                    </View>
                    <View
                      className={`seg__item${value.mode === 'range' ? ' seg__item--active' : ''}`}
                      onClick={() => update({ mode: 'range' })}
                    >
                      <Text className="seg__text">范围</Text>
                    </View>
                  </View>
                </View>
                {value.mode === 'exact' ? (
                  <Input
                    className="input"
                    type="digit"
                    value={value.exact}
                    placeholder="精确值"
                    onInput={(e) => update({ exact: e.detail.value })}
                  />
                ) : (
                  <View className="dim-row__range">
                    <Input
                      className="input dim-row__range-input"
                      type="digit"
                      value={value.min}
                      placeholder="最小"
                      onInput={(e) => update({ min: e.detail.value })}
                    />
                    <Text className="dim-row__tilde">~</Text>
                    <Input
                      className="input dim-row__range-input"
                      type="digit"
                      value={value.max}
                      placeholder="最大"
                      onInput={(e) => update({ max: e.detail.value })}
                    />
                  </View>
                )}
              </View>
            )
          })}
          <View className="filter-panel__actions">
            <View className="btn btn--sm filter-panel__action" onClick={resetDims}>
              <Text>重置</Text>
            </View>
            <View className="btn btn--sm btn--primary filter-panel__action" onClick={applyDims}>
              <Text className="filter-panel__action-text">应用</Text>
            </View>
          </View>
        </View>
      ) : null}

      <View className="result-meta">
        <Text className="result-meta__text">共 {result?.total ?? 0} 条结果</Text>
      </View>

      {loading && !result ? <Loading /> : null}
      {!loading && !result && error ? (
        <ErrorState text={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : null}
      {!loading && result && items.length === 0 ? <Empty text="没有符合条件的物品" /> : null}

      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          footer={
            canStock ? (
              <>
                <View
                  className="btn btn--sm item-card__stock-btn item-card__stock-btn--in"
                  onClick={() => openStock(item, 'IN')}
                >
                  <Text>入库</Text>
                </View>
                <View
                  className={`btn btn--sm btn--danger item-card__stock-btn${
                    item.quantity <= 0 ? ' btn--disabled' : ''
                  }`}
                  onClick={() => {
                    if (item.quantity > 0) openStock(item, 'OUT')
                  }}
                >
                  <Text>出库</Text>
                </View>
              </>
            ) : undefined
          }
        />
      ))}

      {result && result.total > 0 ? (
        <Pager
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          loading={loading}
          onChange={setPage}
        />
      ) : null}

      <Modal
        visible={!!stockTarget}
        title={stockTarget?.type === 'IN' ? '入库' : '出库'}
        onClose={() => {
          if (!stockBusy) setStockTarget(null)
        }}
        footer={
          <>
            <View
              className="btn btn--block modal-btn"
              onClick={() => {
                if (!stockBusy) setStockTarget(null)
              }}
            >
              <Text>取消</Text>
            </View>
            <View
              className={`btn btn--primary btn--block modal-btn${stockBusy ? ' btn--disabled' : ''}`}
              onClick={() => void submitStock()}
            >
              <Text className="modal-btn__primary-text">{stockBusy ? '提交中…' : '确认'}</Text>
            </View>
          </>
        }
      >
        <View className="stock-info">
          <Text className="stock-info__name">{stockTarget?.item.name}</Text>
          <Text className="stock-info__meta">
            型号 {stockTarget?.item.model} ｜ 当前库存 {stockTarget?.item.quantity}
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
          <Text className="field__label">备注（可选）</Text>
          <Input
            className="input"
            value={stockRemark}
            maxlength={100}
            placeholder="选填，例如用途、领用人"
            onInput={(e) => setStockRemark(e.detail.value)}
          />
        </View>
      </Modal>

      <TabNav current="search" />
    </View>
  )
}
