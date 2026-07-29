import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { loadOrders, orderTotal } from '@/lib/ravun-data'

/* eslint-disable @typescript-eslint/no-explicit-any */

function monthLabel(monthIndex: number) {
  return new Date(2000, monthIndex, 1).toLocaleDateString('tr-TR', { month: 'short' })
}

export function Overview() {
  const [orders, setOrders] = useState<any[]>([])

  useEffect(() => {
    setOrders(loadOrders())
  }, [])

  const data = useMemo(() => {
    const year = new Date().getFullYear()
    const totals = Array.from({ length: 12 }, () => 0)
    orders
      .filter((o) => o.status !== 'cancelled')
      .forEach((o) => {
        const created = new Date(o.createdAt || 0)
        if (Number.isNaN(created.getTime()) || created.getFullYear() !== year) return
        totals[created.getMonth()] += orderTotal(o)
      })
    return totals.map((total, i) => ({ name: monthLabel(i), total }))
  }, [orders])

  const hasRevenue = data.some((d) => d.total > 0)

  if (!hasRevenue) {
    return (
      <div className='text-muted-foreground flex h-[350px] items-center justify-center text-sm'>
        {new Date().getFullYear()} yılında henüz sipariş cirosu yok.
      </div>
    )
  }

  return (
    <ResponsiveContainer width='100%' height={350}>
      <BarChart data={data}>
        <XAxis
          dataKey='name'
          stroke='#888888'
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          direction='ltr'
          stroke='#888888'
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `₺${value}`}
        />
        <Bar
          dataKey='total'
          fill='currentColor'
          radius={[4, 4, 0, 0]}
          className='fill-primary'
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
