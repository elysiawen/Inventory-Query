export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/search/index',
    'pages/profile/index',
    'pages/admin/items/index',
    'pages/admin/categories/index',
    'pages/admin/users/index',
    'pages/admin/logs/index',
    'pages/admin/status/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '库存物资管理',
    navigationBarTextStyle: 'black'
  }
})
