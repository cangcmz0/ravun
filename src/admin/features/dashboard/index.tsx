import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Clock, Mail, MessageSquare, Package, Star, Wallet } from 'lucide-react'
import { money, orderTotal } from '@/lib/ravun-data'
import { errorMessage, fetchMessages, fetchOrders, fetchProducts, fetchReviews } from '@/lib/api'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { LegacyImportCard } from './components/legacy-import-card'
import { Overview } from './components/overview'
import { RecentSales } from './components/recent-sales'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function Dashboard() {
  const [products, setProducts] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [reviews, setReviews] = useState<Record<string, any[]>>({})
  const [messages, setMessages] = useState<any[]>([])
  const [loadError, setLoadError] = useState('')

  const load = () => {
    Promise.all([fetchProducts(), fetchOrders(), fetchReviews(), fetchMessages()])
      .then(([p, o, r, m]) => { setProducts(p); setOrders(o); setReviews(r); setMessages(m); setLoadError('') })
      .catch((err) => setLoadError(errorMessage(err, 'Panel verileri yüklenemedi.')))
  }
  useEffect(load, [])

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
    const approved = flat.filter((r) => r.approved)
    const total = approved.length
    const avg = total ? approved.reduce((s, r) => s + (Number(r.rating) || 0), 0) / total : 0
    return { total, avg, pending: flat.length - approved.length }
  }, [reviews])
  const unreadMessages = useMemo(() => messages.filter((m) => !m.read).length, [messages])

  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <div className='ms-auto flex items-center gap-2'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      {/* ===== Main ===== */}
      <Main>
        <div className='mb-2 flex items-center justify-between space-y-2'>
          <h1 className='text-2xl font-bold tracking-tight'>Panel</h1>
        </div>
        {loadError && (
          <p className='mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'>{loadError}</p>
        )}
        <LegacyImportCard onImported={load} />
        {(reviewStats.pending > 0 || unreadMessages > 0) && (
          <div className='mb-4 flex flex-wrap gap-2'>
            {reviewStats.pending > 0 && (
              <Link to='/reviews' className='inline-flex items-center gap-2 rounded-md border bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200'>
                <MessageSquare className='size-4' /> {reviewStats.pending} yorum onay bekliyor
              </Link>
            )}
            {unreadMessages > 0 && (
              <Link to='/messages' className='inline-flex items-center gap-2 rounded-md border bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-blue-900/30 dark:text-blue-200'>
                <Mail className='size-4' /> {unreadMessages} okunmamış mesaj
              </Link>
            )}
          </div>
        )}
        <div className='space-y-4'>
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
                    {reviewStats.total} yayında yorum
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
                  <Overview orders={orders} />
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
                  <RecentSales orders={orders} />
                </CardContent>
              </Card>
            </div>
        </div>
      </Main>
    </>
  )
}
