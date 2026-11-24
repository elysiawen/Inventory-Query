import { ScrollView, Text, View } from '@tarojs/components'
import type { ReactNode } from 'react'
import './Modal.scss'

interface ModalProps {
  visible: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export default function Modal({ visible, title, onClose, children, footer }: ModalProps) {
  if (!visible) return null

  return (
    <View className="modal">
      <View className="modal__mask" onClick={onClose} />
      <View className="modal__panel">
        <View className="modal__header">
          <Text className="modal__title">{title}</Text>
          <View className="modal__close" onClick={onClose}>
            <Text className="modal__close-icon">×</Text>
          </View>
        </View>
        <ScrollView scrollY className="modal__body">
          {children}
        </ScrollView>
        {footer ? <View className="modal__footer">{footer}</View> : null}
      </View>
    </View>
  )
}
