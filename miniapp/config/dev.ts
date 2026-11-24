import type { UserConfigExport } from '@tarojs/cli'

const devConfig = {
  logger: {
    quiet: false,
    stats: true
  },
  mini: {},
  h5: {
    // H5 预览通过 devServer 代理访问本地 Next 服务，避免跨域
    devServer: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true
        },
        '/uploads': {
          target: 'http://localhost:3000',
          changeOrigin: true
        }
      }
    }
  }
} as UserConfigExport<'webpack5'>

export default devConfig
