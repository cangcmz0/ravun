import { useEffect, useState } from 'react'
import { MessageCircle, Phone } from 'lucide-react'
import { ORDER_STATUSES, money, orderStatusLabel, orderTotal } from '@/lib/ravun-data'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

/* eslint-disable @typescript-eslint/no-explicit-any */

function waLink(phone?: string) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  return `https://wa.me/${digits}`
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: any
  onSave: (payload: any) => void
}

export function OrderDetailDialog({ open, onOpenChange, order, onSave }: Props) {
  const [status, setStatus] = useState('pending')
  const [cargoCode, setCargoCode] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (order) {
      setStatus(order.status || 'pending')
      setCargoCode(order.cargoCode || '')
      setNote(order.note || '')
    }
  }, [order])

  if (!order) return null

  const handleSave = () => {
    onSave({ ...order, status, cargoCode: cargoCode.trim(), note: note.trim(), updatedAt: new Date().toISOString() })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{order.orderNo}</DialogTitle>
          <DialogDescription>
            {order.createdAt ? new Date(order.createdAt).toLocaleString('tr-TR') : ''} · {money(orderTotal(order))}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-5'>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label>Müşteri</Label>
              <div className='rounded-md border px-3 py-2 text-sm'>{order.customerName || '—'}</div>
            </div>
            <div className='space-y-1.5'>
              <Label>Telefon</Label>
              <div className='flex items-center gap-2'>
                <div className='flex-1 rounded-md border px-3 py-2 text-sm'>{order.customerPhone || '—'}</div>
                {order.customerPhone && (
                  <>
                    <Button variant='outline' size='icon' asChild>
                      <a href={`tel:${order.customerPhone}`} aria-label='Ara'><Phone className='size-4' /></a>
                    </Button>
                    <Button variant='outline' size='icon' asChild>
                      <a href={waLink(order.customerPhone)} target='_blank' rel='noreferrer' aria-label='WhatsApp'>
                        <MessageCircle className='size-4' />
                      </a>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className='space-y-1.5'>
            <Label>Ürünler</Label>
            <div className='divide-y rounded-md border'>
              {(order.items || []).map((item: any, i: number) => (
                <div key={i} className='flex items-center gap-3 p-3'>
                  {item.image ? (
                    <img src={item.image} alt={item.title} className='size-12 rounded-md border object-cover' />
                  ) : (
                    <div className='bg-muted size-12 rounded-md border' />
                  )}
                  <div className='flex-1'>
                    <div className='text-sm font-medium'>{item.title}</div>
                    <div className='text-muted-foreground text-xs'>
                      {[item.selectedSize, item.selectedColor].filter(Boolean).join(' · ')}
                      {item.giftWrap ? ' · Hediye paketi' : ''}
                    </div>
                    {item.giftNote && <div className='text-muted-foreground text-xs italic'>"{item.giftNote}"</div>}
                  </div>
                  <div className='text-end text-sm whitespace-nowrap'>
                    {item.qty} × {money(item.price)}
                  </div>
                </div>
              ))}
              {!(order.items || []).length && (
                <div className='text-muted-foreground p-3 text-sm'>Ürün bilgisi yok.</div>
              )}
            </div>
            <div className='text-end text-sm font-medium'>Toplam: {money(orderTotal(order))}</div>
          </div>

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label>Durum</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <Label>Kargo takip kodu</Label>
              <Input value={cargoCode} onChange={(e) => setCargoCode(e.target.value)} placeholder='Örn. 123456789TR' />
            </div>
          </div>

          <div className='space-y-1.5'>
            <Label>Sipariş notu</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder='Müşteriden gelen not ya da bu sipariş için eklenen not…' />
          </div>

          <div className='text-muted-foreground text-xs'>
            Şu anki durum: <Badge variant='secondary'>{orderStatusLabel(order.status)}</Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>Kapat</Button>
          <Button onClick={handleSave}>Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
