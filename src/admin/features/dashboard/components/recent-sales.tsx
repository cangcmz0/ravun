import { useEffect, useMemo, useState } from 'react'
import { PackageSearch } from 'lucide-react'
import { loadOrders, money, orderStatusLabel, orderTotal } from '@/lib/ravun-data'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

/* eslint-disable @typescript-eslint/no-explicit-any */

function initials(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  return parts.slice(0, 2).map((p) => p[0]?.toLocaleUpperCase('tr-TR')).join('')
}

export function RecentSales() {
  const [orders, setOrders] = useState<any[]>([])

  useEffect(() => {
    setOrders(loadOrders())
  }, [])

  const recent = useMemo(
    () =>
      [...orders]
        .sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime() ||
            (Number(b.id) || 0) - (Number(a.id) || 0)
        )
        .slice(0, 5),
    [orders]
  )

  if (!recent.length) {
    return (
      <div className='text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm'>
        <PackageSearch className='size-6' />
        Henüz sipariş yok.
      </div>
    )
  }

  return (
    <div className='space-y-8'>
      {recent.map((order) => (
        <div key={order.id} className='flex items-center gap-4'>
          <Avatar className='h-9 w-9'>
            <AvatarFallback>{initials(order.customerName)}</AvatarFallback>
          </Avatar>
          <div className='flex flex-1 flex-wrap items-center justify-between'>
            <div className='space-y-1'>
              <p className='text-sm leading-none font-medium'>
                {order.customerName || 'Müşteri'}
              </p>
              <p className='text-muted-foreground text-sm'>
                {order.orderNo} · {orderStatusLabel(order.status)}
              </p>
            </div>
            <div className='font-medium'>+{money(orderTotal(order))}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
