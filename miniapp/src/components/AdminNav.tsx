import { ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './AdminNav.scss'

export type AdminKey = 'items' | 'categories' | 'users' | 'logs' | 'status'

const NAV_ITEMS: { key: AdminKey; label: string; url: string }[] = [
  { key: 'items', label: '物品', url: '/pages/admin/items/index' },
  { key: 'categories', label: '分类', url: '/pages/admin/categories/index' },
  { key: 'users', label: '账号', url: '/pages/admin/users/index' },
  { key: 'logs', label: '流水', url: '/pages/admin/logs/index' },
  { key: 'status', label: '状态', url: '/pages/admin/status/index' }
]

export default function AdminNav({ current }: { current: AdminKey }) {
  return (
    <ScrollView scrollX className="adminnav" scrollWithAnimation>
      <View className="adminnav__inner">
        {NAV_ITEMS.map((item) => (
          <View
            key={item.key}
            className={`adminnav__item${current === item.key ? ' adminnav__item--active' : ''}`}
            onClick={() => {
              if (current !== item.key) Taro.redirectTo({ url: item.url })
            }}
          >
            <Text className="adminnav__label">{item.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}
