import { useEffect, useMemo, useState } from 'react'
import { Clock, Package, ShoppingBag, Star, Wallet } from 'lucide-react'
import {
  loadOrders,
  loadProducts,
  loadReviews,
  money,
  orderTotal,
} from '@/lib/ravun-data'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { TopNav } from '@/components/layout/top-nav'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Overview } from './components/overview'
import { RecentSales } from './components/recent-sales'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function Dashboard() {
  const [products, setProducts] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [reviews, setReviews] = useState<Record<string, any[]>>({})

  useEffect(() => {
    setProducts(loadProducts())
    setOrders(loadOrders())
    setReviews(loadReviews())
  }, [])

  const visibleProducts = useMemo(
    () => products.filter((p) => p.visible !== false).length,
    [products]
  )
  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === 'pending').length,
    [orders]
  )
  const totalRevenue = useMemo(
    () => orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + orderTotal(o), 0),
    [orders]
  )
  const reviewStats = useMemo(() => {
    const flat = Object.values(reviews).flat() as any[]
    const total = flat.length
    const avg = total ? flat.reduce((s, r) => s + (Number(r.rating) || 0), 0) / total : 0
    return { total, avg }
  }, [reviews])

  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <TopNav links={topNav} className='me-auto' />
        <Search />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      {/* ===== Main ===== */}
      <Main>
        <div className='mb-2 flex items-center justify-between space-y-2'>
          <h1 className='text-2xl font-bold tracking-tight'>Panel</h1>
        </div>
        <Tabs
          orientation='vertical'
          defaultValue='overview'
          className='space-y-4'
        >
          <div className='w-full overflow-x-auto pb-2'>
            <TabsList>
              <TabsTrigger value='overview'>Genel Bakış</TabsTrigger>
              <TabsTrigger value='reports' disabled>
                Raporlar
              </TabsTrigger>
              <TabsTrigger value='notifications' disabled>
                Bildirimler
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value='overview' className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>
                    Toplam Ürün
                  </CardTitle>
                  <Package className='text-muted-foreground h-4 w-4' />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>{products.length}</div>
                  <p className='text-muted-foreground text-xs'>
                    {visibleProducts} sitede görünür
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>
                    Bekleyen Sipariş
                  </CardTitle>
                  <Clock className='text-muted-foreground h-4 w-4' />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>{pendingOrders}</div>
                  <p className='text-muted-foreground text-xs'>
                    {orders.length} toplam sipariş
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>
                    Toplam Ciro
                  </CardTitle>
                  <Wallet className='text-muted-foreground h-4 w-4' />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>{money(totalRevenue)}</div>
                  <p className='text-muted-foreground text-xs'>
                    Tüm siparişler · iptaller hariç
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>
                    Ortalama Puan
                  </CardTitle>
                  <Star className='text-muted-foreground h-4 w-4' />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>
                    {reviewStats.total ? reviewStats.avg.toFixed(1) : '—'}
                  </div>
                  <p className='text-muted-foreground text-xs'>
                    {reviewStats.total} yorum
                  </p>
                </CardContent>
              </Card>
            </div>
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
              <Card className='col-span-1 lg:col-span-4'>
                <CardHeader>
                  <CardTitle>Aylık Ciro</CardTitle>
                </CardHeader>
                <CardContent className='ps-2'>
                  <Overview />
                </CardContent>
              </Card>
              <Card className='col-span-1 lg:col-span-3'>
                <CardHeader>
                  <CardTitle>Son Siparişler</CardTitle>
                  <CardDescription>
                    {orders.length === 0
                      ? 'Henüz sipariş yok.'
                      : `Toplam ${orders.length} siparişten en son ${Math.min(orders.length, 5)} tanesi.`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RecentSales />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </Main>
    </>
  )
}

const topNav = [
  {
    title: 'Genel Bakış',
    href: 'dashboard/overview',
    isActive: true,
    disabled: false,
  },
  {
    title: 'Müşteriler',
    href: 'dashboard/customers',
    isActive: false,
    disabled: true,
  },
  {
    title: 'Ürünler',
    href: 'dashboard/products',
    isActive: false,
    disabled: true,
  },
  {
    title: 'Ayarlar',
    href: 'dashboard/settings',
    isActive: false,
    disabled: true,
  },
]
