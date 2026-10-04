import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ExternalLink, MessageCircle, Phone, Printer, Send } from 'lucide-react'
import { ORDER_STATUSES, money, orderStatusLabel, orderTotal } from '@/lib/ravun-data'
import { cn } from '@/lib/utils'
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
import {
  type MessageConfig,
  TEMPLATE_FOR_STATUS,
  WA_TEMPLATES,
  buildMessage,
  cargoLink,
  normalizeTrPhone,
  printOrder,
  trackingLink,
  whatsappUrl,
} from '../order-tools'

/* eslint-disable @typescript-eslint/no-explicit-any */

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: any
  onSave: (payload: any) => void
  msgConfig?: MessageConfig | null
}

export function OrderDetailDialog({ open, onOpenChange, order, onSave, msgConfig }: Props) {
  const [status, setStatus] = useState('pending')
  const [cargoCode, setCargoCode] = useState('')
  const [note, setNote] = useState('')
  const [tplKey, setTplKey] = useState('received')
  const [message, setMessage] = useState('')
  const [edited, setEdited] = useState(false)

  useEffect(() => {
    if (order) {
      setStatus(order.status || 'pending')
      setCargoCode(order.cargoCode || '')
      setNote(order.note || '')
      setTplKey(TEMPLATE_FOR_STATUS[order.status] || 'received')
      setEdited(false)
    }
  }, [order])

  // Durum seçimi değişince uygun hazır mesaj önerilir.
  const pickStatus = (value: string) => {
    setStatus(value)
    setTplKey(TEMPLATE_FOR_STATUS[value] || tplKey)
    setEdited(false)
  }

  // Mesaj, elle düzenlenmediği sürece şablondan ve güncel form değerlerinden üretilir.
  const generated = useMemo(
    () => (order ? buildMessage(tplKey, order, cargoCode.trim(), msgConfig || undefined) : ''),
    [order, tplKey, cargoCode, msgConfig]
  )
  useEffect(() => {
    if (!edited) setMessage(generated)
  }, [generated, edited])

  if (!order) return null

  const phone = normalizeTrPhone(order.customerPhone)
  const dirty = status !== (order.status || 'pending') || cargoCode.trim() !== (order.cargoCode || '') || note.trim() !== (order.note || '')
  const template = WA_TEMPLATES.find((t) => t.key === tplKey)
  const cargoMissing = Boolean(template?.needsCargo && !cargoCode.trim())
  const cargoUrl = cargoLink(cargoCode.trim(), msgConfig || undefined)

  const handleSave = () => {
    onSave({ ...order, status, cargoCode: cargoCode.trim(), note: note.trim(), updatedAt: new Date().toISOString() })
  }

  const sendWhatsApp = () => {
    // Pencere, tarayıcı açılır pencere engelleyicisine takılmasın diye
    // kaydetmeden ÖNCE (tıklama anında) açılır.
    window.open(whatsappUrl(phone, message), '_blank', 'noopener,noreferrer')
    if (dirty) handleSave()
  }

  const handlePrint = () => {
    if (!printOrder({ ...order, status, cargoCode: cargoCode.trim(), note: note.trim() })) {
      toast.error('Yazdırma penceresi açılamadı. Tarayıcının açılır pencere iznini kontrol edin.')
    }
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
                      <a href={`https://wa.me/${phone}`} target='_blank' rel='noreferrer' aria-label='WhatsApp'>
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
              <Select value={status} onValueChange={pickStatus}>
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

          <div className='text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
            <span>Şu anki durum: <Badge variant='secondary'>{orderStatusLabel(order.status)}</Badge></span>
            <a className='text-primary inline-flex items-center gap-1 underline underline-offset-2' href={trackingLink(order.orderNo)} target='_blank' rel='noreferrer'>
              Müşterinin takip sayfası <ExternalLink className='size-3' />
            </a>
            {cargoUrl && (
              <a className='text-primary inline-flex items-center gap-1 underline underline-offset-2' href={cargoUrl} target='_blank' rel='noreferrer'>
                Kargo takibi <ExternalLink className='size-3' />
              </a>
            )}
          </div>

          {phone && (
            <div className='space-y-2 rounded-lg border p-3'>
              <Label className='flex items-center gap-1.5'><MessageCircle className='size-4' /> Müşteriye WhatsApp mesajı</Label>
              <div className='flex flex-wrap gap-1.5'>
                {WA_TEMPLATES.map((t) => (
                  <button
                    key={t.key}
                    type='button'
                    onClick={() => { setTplKey(t.key); setEdited(false) }}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      tplKey === t.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {cargoMissing && (
                <p className='flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400'>
                  <AlertTriangle className='size-3.5' /> Kargo takip kodu boş. Yukarıya yazın, mesaja otomatik eklenir.
                </p>
              )}
              <Textarea
                value={message}
                onChange={(e) => { setMessage(e.target.value); setEdited(true) }}
                rows={7}
                className='text-sm'
                aria-label='Gönderilecek mesaj'
              />
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <p className='text-muted-foreground text-xs'>
                  {edited ? 'Mesajı elle düzenlediniz.' : 'Mesajı gönderebilir ya da önce düzenleyebilirsiniz.'}
                  {!msgConfig?.paymentInfo && tplKey === 'payment' ? ' Ödeme bilgisini Bildirimler sayfasından ekleyin.' : ''}
                </p>
                <Button type='button' size='sm' className='bg-[#25D366] text-white hover:bg-[#1ebe5a]' onClick={sendWhatsApp} disabled={!message.trim()}>
                  <Send className='size-4' /> {dirty ? 'Kaydet ve WhatsApp\'ta gönder' : 'WhatsApp\'ta gönder'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className='gap-2 sm:justify-between'>
          <Button variant='outline' onClick={handlePrint}><Printer className='size-4' /> Yazdır</Button>
          <div className='flex flex-col-reverse gap-2 sm:flex-row'>
            <Button variant='outline' onClick={() => onOpenChange(false)}>Kapat</Button>
            <Button onClick={handleSave}>Kaydet</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
