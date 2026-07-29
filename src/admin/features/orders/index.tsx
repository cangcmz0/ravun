import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Eye, PackageSearch, Search, Trash2 } from 'lucide-react'
import {
  ORDER_STATUSES,
  loadOrders,
  money,
  orderStatusLabel,
  orderTotal,
  saveOrders,
} from '@/lib/ravun-data'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfigDrawer } from '@/components/config-drawer'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ThemeSwitch } from '@/components/theme-switch'
import { OrderDetailDialog } from './components/order-detail-dialog'

/* eslint-disable @typescript-eslint/no-explicit-any */

const TONE_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  production: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  packing: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  cargo: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
}

export function Orders() {
  const [orders, setOrders] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('Tümü')
  const [detailTarget, setDetailTarget] = useState<any>(null)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)

  useEffect(() => {
    setOrders(loadOrders())
    setLoaded(true)
  }, [])

  const persist = (next: any[]) => {
    setOrders(next)
    saveOrders(next)
  }

  const sorted = useMemo(
    () => [...orders].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime() || (Number(b.id) || 0) - (Number(a.id) || 0)),
    [orders]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    return sorted
      .filter((o) => statusFilter === 'Tümü' || o.status === statusFilter)
      .filter((o) => !q ||
        String(o.orderNo || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(o.customerName || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(o.customerPhone || '').toLocaleLowerCase('tr-TR').includes(q)
      )
  }, [sorted, query, statusFilter])

  const totalRevenue = useMemo(
    () => orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + orderTotal(o), 0),
    [orders]
  )
  const pendingCount = useMemo(() => orders.filter((o) => o.status === 'pending').length, [orders])

  const handleStatusChange = (order: any, status: string) => {
    persist(orders.map((o) => (o.id === order.id ? { ...o, status, updatedAt: new Date().toISOString() } : o)))
    toast.success(`${order.orderNo} durumu güncellendi`)
  }

  const handleSaveDetail = (payload: any) => {
    persist(orders.map((o) => (o.id === payload.id ? payload : o)))
    toast.success(`${payload.orderNo} kaydedildi`)
    setDetailTarget(null)
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    persist(orders.filter((o) => o.id !== deleteTarget.id))
    toast.success(`${deleteTarget.orderNo} silindi`)
    setDeleteTarget(null)
  }

  return (
    <>
      <Header>
        <div className='ms-auto flex items-center gap-2'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Siparişler</h1>
            <p className='text-muted-foreground text-sm'>
              {orders.length} sipariş · {pendingCount} beklemede · toplam {money(totalRevenue)}
            </p>
          </div>
        </div>

        <div className='mb-4 flex flex-wrap items-center gap-2'>
          <div className='relative w-full max-w-xs'>
            <Search className='text-muted-foreground absolute start-2.5 top-2.5 size-4' />
            <Input placeholder='Sipariş no, müşteri veya telefon ara…' value={query} onChange={(e) => setQuery(e.target.value)} className='ps-8' />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className='w-48'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='Tümü'>Tüm durumlar</SelectItem>
              {ORDER_STATUSES.map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='overflow-x-auto rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sipariş No</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Ürünler</TableHead>
                <TableHead>Tutar</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Kargo Kodu</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className='text-end'>İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loaded ? (
                <TableRow><TableCell colSpan={8} className='text-muted-foreground py-10 text-center'>Yükleniyor…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className='text-muted-foreground py-10 text-center'>
                    <div className='flex flex-col items-center gap-2'>
                      <PackageSearch className='size-6' />
                      {orders.length === 0 ? 'Henüz sipariş yok.' : 'Sipariş bulunamadı.'}
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className='font-medium'>{o.orderNo}</TableCell>
                  <TableCell>
                    <div>{o.customerName || '—'}</div>
                    <div className='text-muted-foreground text-xs'>{o.customerPhone}</div>
                  </TableCell>
                  <TableCell>
                    <div className='text-sm'>{(o.items || [])[0]?.title || '—'}</div>
                    {(o.items || []).length > 1 && (
                      <div className='text-muted-foreground text-xs'>+{o.items.length - 1} ürün daha</div>
                    )}
                  </TableCell>
                  <TableCell>{money(orderTotal(o))}</TableCell>
                  <TableCell>
                    <Select value={o.status || 'pending'} onValueChange={(v) => handleStatusChange(o, v)}>
                      <SelectTrigger className='h-8 w-[150px]'>
                        <Badge variant='secondary' className={TONE_CLASS[o.status] || TONE_CLASS.pending}>{orderStatusLabel(o.status)}</Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className='text-muted-foreground text-xs'>{o.cargoCode || '—'}</TableCell>
                  <TableCell className='text-muted-foreground text-xs whitespace-nowrap'>
                    {o.createdAt ? new Date(o.createdAt).toLocaleDateString('tr-TR') : '—'}
                  </TableCell>
                  <TableCell className='text-end'>
                    <div className='flex items-center justify-end gap-1'>
                      <Button variant='ghost' size='icon' onClick={() => setDetailTarget(o)} aria-label='Detay'><Eye className='size-4' /></Button>
                      <Button variant='ghost' size='icon' onClick={() => setDeleteTarget(o)} aria-label='Sil'><Trash2 className='text-destructive size-4' /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Main>

      <OrderDetailDialog
        open={!!detailTarget}
        onOpenChange={(o) => !o && setDetailTarget(null)}
        order={detailTarget}
        onSave={handleSaveDetail}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title='Siparişi sil'
        desc={`"${deleteTarget?.orderNo}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`}
        destructive
        confirmText='Sil'
        cancelBtnText='Vazgeç'
        handleConfirm={handleDelete}
      />
    </>
  )
}
