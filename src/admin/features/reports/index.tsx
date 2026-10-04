import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Download, Gift, Package, ShoppingBag, TrendingUp, XCircle } from 'lucide-react'
import {
  ORDER_STATUSES,
  categoryKey,
  categoryLabelFromKey,
  money,
  orderStatusLabel,
  orderTotal,
  setCategoryLabels,
} from '@/lib/ravun-data'
import { errorMessage, fetchOrders, fetchProducts, fetchSettings } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'

/* eslint-disable @typescript-eslint/no-explicit-any */

const DAY = 24 * 60 * 60 * 1000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

type Range = { key: string; label: string; from: Date | null; to: Date }

function ranges(): Range[] {
  const now = new Date()
  const today = startOfDay(now)
  const tomorrow = new Date(today.getTime() + DAY)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  return [
    { key: '7', label: 'Son 7 gün', from: new Date(tomorrow.getTime() - 7 * DAY), to: tomorrow },
    { key: '30', label: 'Son 30 gün', from: new Date(tomorrow.getTime() - 30 * DAY), to: tomorrow },
    { key: 'month', label: 'Bu ay', from: monthStart, to: tomorrow },
    { key: 'prevMonth', label: 'Geçen ay', from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: monthStart },
    { key: '90', label: 'Son 90 gün', from: new Date(tomorrow.getTime() - 90 * DAY), to: tomorrow },
    { key: 'year', label: 'Bu yıl', from: new Date(now.getFullYear(), 0, 1), to: tomorrow },
    { key: 'all', label: 'Tümü', from: null, to: tomorrow },
  ]
}

const created = (o: any) => new Date(o.createdAt || 0)
const inRange = (o: any, from: Date | null, to: Date) => {
  const t = created(o).getTime()
  return (!from || t >= from.getTime()) && t < to.getTime()
}

function summarize(list: any[]) {
  const live = list.filter((o) => o.status !== 'cancelled')
  const revenue = live.reduce((s, o) => s + orderTotal(o), 0)
  const pendingRevenue = live.filter((o) => o.status === 'pending').reduce((s, o) => s + orderTotal(o), 0)
  return {
    count: live.length,
    revenue,
    pendingRevenue,
    avg: live.length ? revenue / live.length : 0,
    cancelRate: list.length ? (list.length - live.length) / list.length : 0,
    giftRate: live.length ? live.filter((o) => (o.items || []).some((i: any) => i.giftWrap)).length / live.length : 0,
  }
}

function change(cur: number, prev: number) {
  if (!prev) return cur ? null : 0
  return (cur - prev) / prev
}

export function Reports() {
  const [orders, setOrders] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [rangeKey, setRangeKey] = useState('30')

  useEffect(() => {
    Promise.all([
      fetchOrders(),
      fetchProducts().catch(() => []),
      fetchSettings().then((st: any) => setCategoryLabels(st.categories)).catch(() => {}),
    ])
      .then(([o, p]) => { setOrders(o); setProducts(p) })
      .catch((err) => setError(errorMessage(err, 'Siparişler yüklenemedi.')))
      .finally(() => setLoaded(true))
  }, [])

  const allRanges = useMemo(ranges, [])
  const range = allRanges.find((r) => r.key === rangeKey) || allRanges[1]
  const current = useMemo(() => orders.filter((o) => inRange(o, range.from, range.to)), [orders, range])
  // Karşılaştırma: hemen önceki eşit uzunluktaki dönem ("Tümü" için yok)
  const previous = useMemo(() => {
    if (!range.from) return null
    const len = range.to.getTime() - range.from.getTime()
    const pf = new Date(range.from.getTime() - len)
    return orders.filter((o) => inRange(o, pf, range.from as Date))
  }, [orders, range])

  const s = summarize(current)
  const p = previous ? summarize(previous) : null

  // Zaman grafiği: kısa aralıkta günlük, orta aralıkta haftalık, uzun aralıkta aylık
  const chart = useMemo(() => {
    const live = current.filter((o) => o.status !== 'cancelled')
    const first = range.from || (live.length ? startOfDay(new Date(Math.min(...live.map((o) => created(o).getTime())))) : startOfDay(new Date()))
    const spanDays = Math.max(1, Math.round((range.to.getTime() - first.getTime()) / DAY))
    const unit = spanDays <= 31 ? 'day' : spanDays <= 120 ? 'week' : 'month'
    const buckets: { key: string; name: string; total: number; count: number }[] = []
    const keyOf = (d: Date) => {
      if (unit === 'day') return startOfDay(d).toISOString()
      if (unit === 'week') {
        const idx = Math.floor((startOfDay(d).getTime() - first.getTime()) / (7 * DAY))
        return `w${idx}`
      }
      return `${d.getFullYear()}-${d.getMonth()}`
    }
    if (unit === 'day') {
      for (let t = first.getTime(); t < range.to.getTime(); t += DAY) {
        const d = new Date(t)
        buckets.push({ key: keyOf(d), name: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), total: 0, count: 0 })
      }
    } else if (unit === 'week') {
      for (let i = 0; first.getTime() + i * 7 * DAY < range.to.getTime(); i++) {
        const d = new Date(first.getTime() + i * 7 * DAY)
        buckets.push({ key: `w${i}`, name: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), total: 0, count: 0 })
      }
    } else {
      const d = new Date(first.getFullYear(), first.getMonth(), 1)
      while (d < range.to) {
        buckets.push({ key: keyOf(d), name: d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }), total: 0, count: 0 })
        d.setMonth(d.getMonth() + 1)
      }
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]))
    for (const o of live) {
      const b = byKey.get(keyOf(created(o)))
      if (b) { b.total += orderTotal(o); b.count++ }
    }
    return { unit, data: buckets }
  }, [current, range])

  const productIndex = useMemo(() => new Map(products.map((x) => [Number(x.id), x])), [products])

  const topProducts = useMemo(() => {
    const map = new Map<string, { title: string; image: string; qty: number; revenue: number }>()
    for (const o of current) {
      if (o.status === 'cancelled') continue
      for (const it of o.items || []) {
        const k = String(it.baseId ?? it.title)
        const prod = productIndex.get(Number(it.baseId))
        const row = map.get(k) || { title: prod?.title || it.title || 'Ürün', image: prod?.image || it.image || '', qty: 0, revenue: 0 }
        row.qty += Number(it.qty) || 1
        row.revenue += (Number(it.price) || 0) * (Number(it.qty) || 1)
        map.set(k, row)
      }
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue)
  }, [current, productIndex])

  const categories = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of current) {
      if (o.status === 'cancelled') continue
      for (const it of o.items || []) {
        const prod = productIndex.get(Number(it.baseId))
        const key = prod ? categoryKey(prod.category) : 'diger'
        map.set(key, (map.get(key) || 0) + (Number(it.price) || 0) * (Number(it.qty) || 1))
      }
    }
    const total = [...map.values()].reduce((a, b) => a + b, 0)
    return [...map.entries()]
      .map(([key, revenue]) => ({ label: key === 'diger' ? 'Silinmiş ürünler' : categoryLabelFromKey(key), revenue, share: total ? revenue / total : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [current, productIndex])

  const statusCounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const o of current) out[o.status || 'pending'] = (out[o.status || 'pending'] || 0) + 1
    return out
  }, [current])

  const exportCsv = () => {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [
      ['Sipariş no', 'Tarih', 'Durum', 'Müşteri', 'Telefon', 'Ürünler', 'Tutar (TL)', 'Kargo kodu', 'Not'],
      ...[...current].sort((a, b) => created(a).getTime() - created(b).getTime()).map((o) => [
        o.orderNo,
        created(o).toLocaleString('tr-TR'),
        orderStatusLabel(o.status),
        o.customerName,
        o.customerPhone,
        (o.items || []).map((i: any) => `${i.qty}× ${i.title}`).join(', '),
        orderTotal(o),
        o.cargoCode,
        o.note,
      ]),
    ]
    // Excel (Türkçe) için ; ayırıcı ve UTF-8 BOM
    const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `ravun-siparisler-${range.key}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
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
        <div className='mb-4 flex flex-wrap items-end justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Satış Raporları</h1>
            <p className='text-muted-foreground text-sm'>İptal edilen siparişler ciroya dahil edilmez.</p>
          </div>
          <Button variant='outline' onClick={exportCsv} disabled={!current.length}>
            <Download className='size-4' /> Excel'e aktar (CSV)
          </Button>
        </div>

        <div className='mb-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]'>
          {allRanges.map((r) => (
            <button
              key={r.key}
              type='button'
              onClick={() => setRangeKey(r.key)}
              className={cn(
                'flex-none rounded-full border px-3 py-1.5 text-sm transition-colors',
                rangeKey === r.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {!loaded ? (
          <p className='text-muted-foreground py-10 text-center text-sm'>Yükleniyor…</p>
        ) : error ? (
          <p className='text-destructive py-10 text-center text-sm'>{error}</p>
        ) : (
          <div className='space-y-4'>
            <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
              <Kpi icon={TrendingUp} title='Ciro' value={money(Math.round(s.revenue))} delta={p ? change(s.revenue, p.revenue) : undefined}
                note={s.pendingRevenue ? `${money(Math.round(s.pendingRevenue))} onay bekliyor` : undefined} />
              <Kpi icon={ShoppingBag} title='Sipariş' value={String(s.count)} delta={p ? change(s.count, p.count) : undefined} />
              <Kpi icon={Package} title='Ortalama sepet' value={money(Math.round(s.avg))} delta={p ? change(s.avg, p.avg) : undefined} />
              <Kpi icon={XCircle} title='İptal oranı' value={`%${Math.round(s.cancelRate * 100)}`} invert
                delta={p ? (p.cancelRate || s.cancelRate ? s.cancelRate - p.cancelRate : 0) : undefined} points
                note={<span className='inline-flex items-center gap-1'><Gift className='size-3' /> Hediye paketi: %{Math.round(s.giftRate * 100)}</span>} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Ciro</CardTitle>
                <CardDescription>{chart.unit === 'day' ? 'Günlük' : chart.unit === 'week' ? 'Haftalık' : 'Aylık'} · {range.label}</CardDescription>
              </CardHeader>
              <CardContent className='ps-1'>
                {s.revenue > 0 ? (
                  <ResponsiveContainer width='100%' height={280}>
                    <BarChart data={chart.data}>
                      <CartesianGrid vertical={false} strokeOpacity={0.15} />
                      <XAxis dataKey='name' stroke='#888888' fontSize={11} tickLine={false} axisLine={false} interval='preserveStartEnd' minTickGap={12} />
                      <YAxis stroke='#888888' fontSize={11} tickLine={false} axisLine={false} width={64}
                        tickFormatter={(v) => (v >= 1000 ? `₺${Math.round(v / 1000)}b` : `₺${v}`)} />
                      <Tooltip
                        cursor={{ fillOpacity: 0.08 }}
                        formatter={(v: any, _n: any, item: any) => [`${money(Math.round(Number(v)))} · ${item?.payload?.count} sipariş`, 'Ciro']}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      />
                      <Bar dataKey='total' radius={[4, 4, 0, 0]} className='fill-primary' fill='currentColor' />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className='text-muted-foreground py-16 text-center text-sm'>Bu dönemde satış yok.</p>
                )}
              </CardContent>
            </Card>

            <div className='grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'>
              <Card>
                <CardHeader>
                  <CardTitle>En çok satan ürünler</CardTitle>
                  <CardDescription>Ciroya göre</CardDescription>
                </CardHeader>
                <CardContent>
                  {topProducts.length === 0 ? (
                    <p className='text-muted-foreground py-6 text-center text-sm'>Veri yok.</p>
                  ) : (
                    <ol className='space-y-3'>
                      {topProducts.slice(0, 8).map((row, i) => (
                        <li key={row.title + i} className='flex items-center gap-3'>
                          <span className='text-muted-foreground w-4 text-sm tabular-nums'>{i + 1}</span>
                          {row.image ? <img src={row.image} alt='' className='size-10 flex-none rounded-md border object-cover' /> : <span className='bg-muted size-10 flex-none rounded-md border' />}
                          <div className='min-w-0 flex-1'>
                            <p className='truncate text-sm font-medium'>{row.title}</p>
                            <div className='bg-muted mt-1 h-1.5 overflow-hidden rounded-full'>
                              <div className='bg-primary h-full rounded-full' style={{ width: `${Math.max(4, (row.revenue / topProducts[0].revenue) * 100)}%` }} />
                            </div>
                          </div>
                          <div className='text-end'>
                            <p className='text-sm font-semibold whitespace-nowrap'>{money(Math.round(row.revenue))}</p>
                            <p className='text-muted-foreground text-xs'>{row.qty} adet</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>

              <div className='space-y-4'>
                <Card>
                  <CardHeader>
                    <CardTitle>Kategoriler</CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-3'>
                    {categories.length === 0 ? (
                      <p className='text-muted-foreground py-4 text-center text-sm'>Veri yok.</p>
                    ) : categories.map((c) => (
                      <div key={c.label}>
                        <div className='flex justify-between text-sm'>
                          <span>{c.label}</span>
                          <span className='text-muted-foreground'>%{Math.round(c.share * 100)} · {money(Math.round(c.revenue))}</span>
                        </div>
                        <div className='bg-muted mt-1 h-2 overflow-hidden rounded-full'>
                          <div className='bg-primary/80 h-full rounded-full' style={{ width: `${Math.max(3, c.share * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Sipariş durumları</CardTitle>
                    <CardDescription>{current.length} sipariş · {range.label}</CardDescription>
                  </CardHeader>
                  <CardContent className='flex flex-wrap gap-2'>
                    {ORDER_STATUSES.map(([key, label]) => (
                      <span key={key} className={cn('rounded-full border px-2.5 py-1 text-xs', !statusCounts[key] && 'opacity-50')}>
                        {label} <b className='ms-1'>{statusCounts[key] || 0}</b>
                      </span>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </Main>
    </>
  )
}

function Kpi({ icon: Icon, title, value, delta, note, invert, points }: {
  icon: any
  title: string
  value: string
  delta?: number | null
  note?: React.ReactNode
  invert?: boolean // düşüş iyi (iptal oranı)
  points?: boolean // fark yüzde puan olarak
}) {
  const good = delta != null && (invert ? delta < 0 : delta > 0)
  const bad = delta != null && (invert ? delta > 0 : delta < 0)
  return (
    <Card className='gap-2 py-4'>
      <CardHeader className='flex flex-row items-center justify-between px-4'>
        <CardTitle className='text-muted-foreground text-sm font-medium'>{title}</CardTitle>
        <Icon className='text-muted-foreground size-4' />
      </CardHeader>
      <CardContent className='px-4'>
        <div className='text-xl font-bold sm:text-2xl'>{value}</div>
        {delta !== undefined && (
          <p className={cn('mt-0.5 flex items-center gap-0.5 text-xs', good && 'text-emerald-600 dark:text-emerald-400', bad && 'text-red-600 dark:text-red-400', !good && !bad && 'text-muted-foreground')}>
            {delta === null ? 'Önceki dönemde yok' : (
              <>
                {delta > 0 ? <ArrowUpRight className='size-3' /> : delta < 0 ? <ArrowDownRight className='size-3' /> : null}
                {points ? `${delta > 0 ? '+' : ''}${Math.round(delta * 100)} puan` : `%${Math.abs(Math.round(delta * 100))}`} önceki döneme göre
              </>
            )}
          </p>
        )}
        {note && <p className='text-muted-foreground mt-0.5 text-xs'>{note}</p>}
      </CardContent>
    </Card>
  )
}
