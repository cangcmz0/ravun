import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Star,
  Settings,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'Ravun Atölye',
    email: 'yonetim@ravun.com',
    avatar: '',
  },
  teams: [
    {
      name: 'Ravun',
      logo: Package,
      plan: 'Yönetim Paneli',
    },
  ],
  navGroups: [
    {
      title: 'Genel',
      items: [
        {
          title: 'Panel',
          url: '/',
          icon: LayoutDashboard,
        },
        {
          title: 'Ürünler',
          url: '/products',
          icon: Package,
        },
        {
          title: 'Siparişler',
          url: '/orders',
          icon: ShoppingBag,
        },
        {
          title: 'Yorumlar',
          url: '/reviews',
          icon: Star,
        },
      ],
    },
    {
      title: 'Site',
      items: [
        {
          title: 'Site ayarları',
          url: '/settings',
          icon: Settings,
        },
      ],
    },
  ],
}
