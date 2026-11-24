import { Text, View } from '@tarojs/components'
import './Feedback.scss'

export function Loading({ text = '加载中' }: { text?: string }) {
  return (
    <View className="feedback">
      <View className="feedback__spinner" />
      <Text className="feedback__text">{text}</Text>
    </View>
  )
}

export function Empty({ text = '暂无数据' }: { text?: string }) {
  return (
    <View className="feedback">
      <View className="feedback__empty-icon" />
      <Text className="feedback__text">{text}</Text>
    </View>
  )
}

export function ErrorState({ text = '加载失败', onRetry }: { text?: string; onRetry?: () => void }) {
  return (
    <View className="feedback">
      <Text className="feedback__text">{text}</Text>
      {onRetry ? (
        <View className="btn btn--sm feedback__retry" onClick={onRetry}>
          <Text>重试</Text>
        </View>
      ) : null}
    </View>
  )
}
