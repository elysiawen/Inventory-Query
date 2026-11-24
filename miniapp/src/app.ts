import { PropsWithChildren } from 'react'
import { useDidShow, useLaunch } from '@tarojs/taro'

import { refreshSessionToken } from './services/request'
import './app.scss'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    console.log('App launched.')
  })

  // 每次进入前台都用当前 token 续期，避免长期使用后突然过期
  useDidShow(() => {
    void refreshSessionToken()
  })

  // children 是将要会渲染的页面
  return children
}
  


export default App
