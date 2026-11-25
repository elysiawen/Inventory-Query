import { Image, Text, View } from '@tarojs/components'
import type { ReactNode } from 'react'
import { assetUrl } from '../services/request'
import type { ItemRow } from '../services/types'
import { formatPrice } from '../utils/format'
import './ItemCard.scss'

export default function ItemCard({ item, footer }: { item: ItemRow; footer?: ReactNode }) {
  return (
    <View className="item-card">
      <View className="item-card__head">
        {item.image ? (
          <Image className="item-card__img" src={assetUrl(item.image)} mode="aspectFill" />
        ) : (
          <View className="item-card__img item-card__img--empty">
            <Text className="item-card__img-text">无图</Text>
          </View>
        )}
        <View className="item-card__main">
          <View className="row-between">
            <Text className="item-card__name">{item.name}</Text>
            <Text className="item-card__qty">库存 {item.quantity}</Text>
          </View>
          <Text className="item-card__sub">
            型号 {item.model}
            {item.supplier ? ` ｜ ${item.supplier}` : ''}
          </Text>
          <Text className="item-card__sub">
            {item.category?.name || '未分类'} ｜ ¥{formatPrice(item.price)}
          </Text>
        </View>
      </View>

      <View className="item-card__dims">
        <View className="item-card__dim">
          <Text className="item-card__dim-label">内径/柄径 (mm)</Text>
          <Text className="item-card__dim-value">{item.innerDiameter}</Text>
        </View>
        <View className="item-card__dim">
          <Text className="item-card__dim-label">外径 (mm)</Text>
          <Text className="item-card__dim-value">{item.outerDiameter}</Text>
        </View>
        <View className="item-card__dim">
          <Text className="item-card__dim-label">高度/总长 (mm)</Text>
          <Text className="item-card__dim-value">{item.height}</Text>
        </View>
      </View>

      {item.remark ? <Text className="item-card__remark">备注：{item.remark}</Text> : null}

      {footer ? <View className="item-card__footer">{footer}</View> : null}
    </View>
  )
}
