import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import AdminNav from '../../../components/AdminNav'
import { ErrorState, Loading } from '../../../components/Feedback'
import TabNav from '../../../components/TabNav'
import { fetchSystemStatus } from '../../../services/api'
import { isAdmin } from '../../../services/storage'
import type { SystemStatus } from '../../../services/types'
import { errorMessage, formatDateTime, formatUptime } from '../../../utils/format'
import './index.scss'

const toast = (title: string) => Taro.showToast({ title, icon: 'none' })

export default function AdminStatusPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

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
    fetchSystemStatus()
      .then((data) => setStatus(data))
      .catch((e) => {
        const msg = errorMessage(e)
        setError(msg)
        toast(msg)
      })
      .finally(() => setLoading(false))
  }, [refreshKey])

  const counts = status?.counts

  return (
    <View className="page">
      <AdminNav current="status" />

      {loading && !status ? <Loading /> : null}
      {!loading && !status ? (
        <ErrorState text={error || '加载失败'} onRetry={() => setRefreshKey((key) => key + 1)} />
      ) : null}

      {status ? (
        <>
          <View className="card">
            <View className="row-between">
              <Text className="section-title">数据库</Text>
              <View className={`tag ${status.db.ok ? 'tag--on' : 'tag--out'}`}>
                {status.db.ok ? '连接正常' : '连接异常'}
              </View>
            </View>
            <View className="kv">
              <Text className="kv__key">查询延迟</Text>
              <Text className="kv__value">{status.db.latencyMs} ms</Text>
            </View>
          </View>

          <View className="card">
            <Text className="section-title">数据概览</Text>
            <View className="stat-grid">
              <View className="stat">
                <Text className="stat__value">{counts?.items ?? 0}</Text>
                <Text className="stat__label">物品</Text>
              </View>
              <View className="stat">
                <Text className="stat__value">{counts?.stockQuantity ?? 0}</Text>
                <Text className="stat__label">库存总量</Text>
              </View>
              <View className="stat">
                <Text className="stat__value">{counts?.logs ?? 0}</Text>
                <Text className="stat__label">流水</Text>
              </View>
              <View className="stat">
                <Text className="stat__value">{counts?.categories ?? 0}</Text>
                <Text className="stat__label">分类</Text>
              </View>
              <View className="stat">
                <Text className="stat__value">{counts?.users ?? 0}</Text>
                <Text className="stat__label">账号</Text>
              </View>
            </View>
          </View>

          <View className="card">
            <Text className="section-title">运行信息</Text>
            <View className="kv">
              <Text className="kv__key">Node 版本</Text>
              <Text className="kv__value">{status.runtime.node}</Text>
            </View>
            <View className="kv">
              <Text className="kv__key">运行环境</Text>
              <Text className="kv__value">{status.runtime.env}</Text>
            </View>
            <View className="kv">
              <Text className="kv__key">已运行</Text>
              <Text className="kv__value">{formatUptime(status.runtime.uptimeSec)}</Text>
            </View>
            <View className="kv">
              <Text className="kv__key">服务器时间</Text>
              <Text className="kv__value">{formatDateTime(status.runtime.serverTime)}</Text>
            </View>
            <View className="kv">
              <Text className="kv__key">当前操作人</Text>
              <Text className="kv__value">{status.operator}</Text>
            </View>
          </View>

          <View
            className={`btn btn--primary btn--block status-refresh-btn${loading ? ' btn--disabled' : ''}`}
            onClick={() => {
              if (!loading) setRefreshKey((key) => key + 1)
            }}
          >
            <Text className="status-refresh">{loading ? '刷新中…' : '刷新状态'}</Text>
          </View>
        </>
      ) : null}

      <TabNav current="admin" />
    </View>
  )
}
