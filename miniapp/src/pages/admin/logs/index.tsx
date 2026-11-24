import { Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import AdminNav from '../../../components/AdminNav'
import { Empty, ErrorState, Loading } from '../../../components/Feedback'
import Modal from '../../../components/Modal'
import Pager from '../../../components/Pager'
import TabNav from '../../../components/TabNav'
import { fetchAdminItems, fetchStockLogs } from '../../../services/api'
import { isAdmin } from '../../../services/storage'
import type { ItemRow, PageResult, StockLogRow } from '../../../services/types'
import { errorMessage, formatDateTime } from '../../../utils/format'
import './index.scss'

const PAGE_SIZES = [10, 30, 50]
const toast = (title: string) => Taro.showToast({ title, icon: 'none' })

export default function AdminLogsPage() {
  const [itemFilter, setItemFilter] = useState<{ id: string; name: string } | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const [result, setResult] = useState<PageResult<StockLogRow> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const seq = useRef(0)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerKeyword, setPickerKeyword] = useState('')
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerOptions, setPickerOptions] = useState<ItemRow[]>([])
  const pickerSeq = useRef(0)

  useEffect(() => {
    if (!isAdmin()) {
      Taro.reLaunch({ url: '/pages/search/index' })
    }
  }, [])

  useEffect(() => {
    if (!isAdmin()) return
    const my = ++seq.current
    setLoading(true)
    setError('')
    fetchStockLogs({ itemId: itemFilter?.id, from, to, page, pageSize })
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
  }, [itemFilter?.id, from, to, page, pageSize, reloadKey])

  function loadOptions(keyword: string) {
    const my = ++pickerSeq.current
    setPickerLoading(true)
    fetchAdminItems({ keyword, pageSize: 20 })
      .then((res) => {
        if (my === pickerSeq.current) setPickerOptions(res.data)
      })
      .catch((e) => {
        if (my === pickerSeq.current) toast(errorMessage(e))
      })
      .finally(() => {
        if (my === pickerSeq.current) setPickerLoading(false)
      })
  }

  function openPicker() {
    setPickerOpen(true)
    setPickerKeyword('')
    loadOptions('')
  }

  function resetFilters() {
    setItemFilter(null)
    setFrom('')
    setTo('')
    setPage(1)
  }

  const logs = result?.data || []
  const pageSizeIndex = Math.max(0, PAGE_SIZES.indexOf(pageSize))

  return (
    <View className="page">
      <AdminNav current="logs" />

      <View className="card filter-card">
        <View className="filter-card__row">
          <Text className="filter-card__label">物品</Text>
          <View className="btn btn--sm btn--ghost" onClick={openPicker}>
            <Text>{itemFilter ? itemFilter.name : '全部物品'}</Text>
          </View>
          {itemFilter ? (
            <View
              className="btn btn--sm"
              onClick={() => {
                setItemFilter(null)
                setPage(1)
              }}
            >
              <Text>清除</Text>
            </View>
          ) : null}
        </View>
        <View className="filter-card__row">
          <Text className="filter-card__label">开始日期</Text>
          <Picker
            mode="date"
            value={from}
            onChange={(e) => {
              const value = String(e.detail.value)
              if (to && value > to) return toast('开始日期不能晚于结束日期')
              setFrom(value)
              setPage(1)
            }}
          >
            <View className="btn btn--sm">{from || '不限'}</View>
          </Picker>
          <Text className="filter-card__label">结束日期</Text>
          <Picker
            mode="date"
            value={to}
            onChange={(e) => {
              const value = String(e.detail.value)
              if (from && value < from) return toast('结束日期不能早于开始日期')
              setTo(value)
              setPage(1)
            }}
          >
            <View className="btn btn--sm">{to || '不限'}</View>
          </Picker>
        </View>
        <View className="filter-card__row">
          <Text className="filter-card__summary">共 {result?.total ?? 0} 条流水</Text>
          <View className="btn btn--sm" onClick={resetFilters}>
            <Text>重置筛选</Text>
          </View>
        </View>
      </View>

      {loading && !result ? <Loading /> : null}
      {!loading && !result && error ? (
        <ErrorState text={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : null}
      {!loading && result && logs.length === 0 ? <Empty text="暂无流水记录" /> : null}

      {logs.map((log) => (
        <View className="card log-card" key={log.id}>
          <View className="row-between">
            <View className="log-card__title">
              <View className={`tag ${log.type === 'IN' ? 'tag--in' : 'tag--out'}`}>
                {log.type === 'IN' ? '入库' : '出库'}
              </View>
              <Text className="log-card__item">{log.item.name}</Text>
            </View>
            <Text className={`log-card__qty ${log.type === 'IN' ? 'log-card__qty--in' : ''}`}>
              {log.type === 'IN' ? '+' : '-'}
              {log.quantity}
            </Text>
          </View>
          <Text className="log-card__meta">型号 {log.item.model}</Text>
          <Text className="log-card__meta">
            操作人 {log.operator.username} ｜ {formatDateTime(log.createdAt)}
          </Text>
          {log.remark ? <Text className="log-card__remark">备注：{log.remark}</Text> : null}
        </View>
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
        visible={pickerOpen}
        title="选择物品"
        onClose={() => setPickerOpen(false)}
        footer={
          <View
            className="btn btn--block modal-btn"
            onClick={() => {
              setItemFilter(null)
              setPage(1)
              setPickerOpen(false)
            }}
          >
            <Text>清除物品筛选</Text>
          </View>
        }
      >
        <View className="picker-search">
          <Input
            className="input picker-search__input"
            value={pickerKeyword}
            placeholder="输入名称或型号搜索"
            confirmType="search"
            onInput={(e) => {
              setPickerKeyword(e.detail.value)
            }}
            onConfirm={() => loadOptions(pickerKeyword.trim())}
          />
          <View className="btn btn--sm btn--primary" onClick={() => loadOptions(pickerKeyword.trim())}>
            <Text className="list-head__btn-text">搜索</Text>
          </View>
        </View>

        {pickerLoading ? <Loading text="搜索中" /> : null}
        {!pickerLoading && pickerOptions.length === 0 ? <Empty text="没有匹配的物品" /> : null}
        {pickerOptions.map((item) => (
          <View
            className="picker-option"
            key={item.id}
            onClick={() => {
              setItemFilter({ id: item.id, name: item.name })
              setPage(1)
              setPickerOpen(false)
            }}
          >
            <Text className="picker-option__name">{item.name}</Text>
            <Text className="picker-option__model">{item.model}</Text>
          </View>
        ))}
        {!pickerLoading && pickerOptions.length === 20 ? (
          <Text className="picker-search__hint">仅显示前 20 条，可继续输入关键字缩小范围</Text>
        ) : null}
      </Modal>

      <TabNav current="admin" />
    </View>
  )
}
