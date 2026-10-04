import { Link } from '@tanstack/react-router'
import { CheckCircle2, ChevronRight, Hammer, Mail, MessageSquare, PackageCheck, ShoppingBag } from 'lucide-react'

/* eslint-disable @typescript-eslint/no-explicit-any */

// "Atölye defteri" karşılaması: günün selamı ve yapılacaklar listesi.
function greeting(h: number) {
  if (h < 5) return 'İyi geceler'
  if (h < 12) return 'Günaydın'
  if (h < 18) return 'İyi günler'
  return 'İyi akşamlar'
}

type Props = { orders: any[]; pendingReviews: number; unreadMessages: number }

export function WorkshopGreeting({ orders, pendingReviews, unreadMessages }: Props) {
  const now = new Date()
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000
  const fresh = orders.filter((o) => new Date(o.createdAt || 0).getTime() >= dayAgo).length
  const count = (st: string) => orders.filter((o) => o.status === st).length
  const todo = [
    { n: count('pending'), text: 'sipariş onay bekliyor', to: '/orders', icon: ShoppingBag },
    { n: count('approved') + count('production'), text: 'sipariş üretimde', to: '/orders', icon: Hammer },
    { n: count('packing'), text: 'sipariş kargoya hazırlanacak', to: '/orders', icon: PackageCheck },
    { n: pendingReviews, text: 'yorum onay bekliyor', to: '/reviews', icon: MessageSquare },
    { n: unreadMessages, text: 'okunmamış mesaj', to: '/messages', icon: Mail },
  ].filter((t) => t.n > 0)

  return (
    <section
      className='relative mb-4 overflow-hidden rounded-xl border p-5 text-[#F6F1E7] sm:p-6'
      style={{
        background:
          'repeating-linear-gradient(96deg,rgba(255,235,200,.045) 0 2px,transparent 2px 10px),linear-gradient(135deg,#3A2716 0%,#291D11 55%,#1E150C 100%)',
      }}
    >
      <div className='pointer-events-none absolute -end-10 -top-16 size-56 rounded-full bg-[#2C8262]/25 blur-3xl' />
      <p className='text-[11px] font-semibold tracking-[0.25em] text-[#F6F1E7]/60 uppercase'>
        {now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
      <h1 className="mt-1 font-['Cormorant_Garamond',Georgia,serif] text-3xl leading-tight sm:text-4xl">
        {greeting(now.getHours())}, <em className='text-[#7FD3B6]'>atölye.</em>
      </h1>
      <p className='mt-1 text-sm text-[#F6F1E7]/75'>
        {fresh > 0 ? `Son 24 saatte ${fresh} yeni sipariş geldi.` : 'Son 24 saatte yeni sipariş yok.'}
      </p>
      <div className='mt-4 flex flex-wrap gap-2'>
        {todo.length === 0 ? (
          <span className='inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm'>
            <CheckCircle2 className='size-4 text-[#7FD3B6]' /> Bekleyen iş yok, her şey yolunda.
          </span>
        ) : (
          todo.map((t) => (
            <Link
              key={t.text}
              to={t.to}
              className='inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20'
            >
              <t.icon className='size-4 text-[#7FD3B6]' />
              <b className='font-semibold'>{t.n}</b> {t.text}
              <ChevronRight className='size-3.5 opacity-60' />
            </Link>
          ))
        )}
      </div>
    </section>
  )
}
