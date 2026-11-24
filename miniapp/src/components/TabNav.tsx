import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { isAdmin } from '../services/storage'
import './TabNav.scss'

export type TabKey = 'search' | 'admin' | 'profile'

const BASE_TABS: { key: TabKey; label: string; url: string }[] = [
  { key: 'search', label: '查询', url: '/pages/search/index' },
  { key: 'admin', label: '管理', url: '/pages/admin/items/index' },
  { key: 'profile', label: '我的', url: '/pages/profile/index' }
]

export default function TabNav({ current }: { current: TabKey }) {
  const tabs = BASE_TABS.filter((tab) => tab.key !== 'admin' || isAdmin())

  return (
    <View className="tabnav">
      {tabs.map((tab) => (
        <View
          key={tab.key}
          className={`tabnav__item${current === tab.key ? ' tabnav__item--active' : ''}`}
          onClick={() => {
            if (current !== tab.key) Taro.reLaunch({ url: tab.url })
          }}
        >
          <Text className="tabnav__label">{tab.label}</Text>
          <View className="tabnav__dot" />
        </View>
      ))}
    </View>
  )
}
