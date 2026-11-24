import { useEffect } from 'react'
import { Text, View } from '@tarojs/components'
import './Pager.scss'

interface PagerProps {
  page: number
  totalPages: number
  total: number
  loading?: boolean
  onChange: (page: number) => void
}

export default function Pager({ page, totalPages, total, loading, onChange }: PagerProps) {
  const maxPage = Math.max(1, totalPages)

  // 删除最后一页仅剩的数据后，页码可能超出总页数，自动回退
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) onChange(totalPages)
  }, [page, totalPages, onChange])

  return (
    <View className="pager">
      <View
        className={`pager__btn${page <= 1 || loading ? ' pager__btn--disabled' : ''}`}
        onClick={() => {
          if (!loading && page > 1) onChange(page - 1)
        }}
      >
        <Text className="pager__btn-text">上一页</Text>
      </View>
      <View className="pager__info">
        <Text className="pager__page">
          {page} / {maxPage} 页
        </Text>
        <Text className="pager__total">共 {total} 条</Text>
      </View>
      <View
        className={`pager__btn${page >= maxPage || loading ? ' pager__btn--disabled' : ''}`}
        onClick={() => {
          if (!loading && page < maxPage) onChange(page + 1)
        }}
      >
        <Text className="pager__btn-text">下一页</Text>
      </View>
    </View>
  )
}
