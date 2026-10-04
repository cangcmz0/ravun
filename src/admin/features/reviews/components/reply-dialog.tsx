import { useEffect, useState } from 'react'
import { Loader2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Atölyenin yoruma yanıtı: sitede yorumun altında "Ravun Atölye" adıyla görünür.
const QUICK_REPLIES = [
  (n: string) => `Güzel yorumunuz için çok teşekkür ederiz${n ? ` ${n}` : ''}! Parçanızı keyifle kullanmanızı dileriz.`,
  (n: string) => `Bizi tercih ettiğiniz için teşekkürler${n ? ` ${n}` : ''}. Ahşabın bakımıyla ilgili her sorunuzda buradayız.`,
  () => 'Geri bildiriminiz için teşekkür ederiz. Yaşadığınız durumu çözmek için size en kısa sürede ulaşacağız.',
]

type Props = {
  review: any | null
  onOpenChange: (open: boolean) => void
  onSave: (reply: string, approve: boolean) => Promise<boolean>
}

export function ReplyDialog({ review, onOpenChange, onSave }: Props) {
  const [text, setText] = useState('')
  const [approve, setApprove] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (review) {
      setText(review.reply || '')
      setApprove(true)
    }
  }, [review])

  if (!review) return null
  const firstName = String(review.name || '').trim().split(/\s+/)[0] || ''
  const pending = review.approved === false

  const submit = async (value: string) => {
    setSaving(true)
    const ok = await onSave(value, pending && approve && Boolean(value.trim()))
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={!!review} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Yoruma yanıt ver</DialogTitle>
          <DialogDescription>Yanıtınız sitede yorumun altında "Ravun Atölye" adıyla görünür.</DialogDescription>
        </DialogHeader>
        <div className='bg-muted/50 rounded-lg border p-3'>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-sm font-medium'>{review.name}</span>
            <span className='flex items-center gap-0.5'>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={n <= review.rating ? 'size-3.5 fill-amber-400 text-amber-400' : 'text-muted-foreground size-3.5'} />
              ))}
            </span>
          </div>
          <p className='text-muted-foreground text-xs'>{review.productTitle}</p>
          <p className='mt-1.5 text-sm whitespace-pre-line'>{review.text}</p>
        </div>
        <div className='space-y-2'>
          <Label htmlFor='review-reply'>Yanıtınız</Label>
          <div className='flex flex-wrap gap-1.5'>
            {QUICK_REPLIES.map((fn, i) => (
              <button
                key={i}
                type='button'
                onClick={() => setText(fn(firstName))}
                className='hover:bg-muted rounded-full border px-2.5 py-1 text-xs'
              >
                {['Teşekkür', 'Bakım desteği', 'Sorun çözümü'][i]}
              </button>
            ))}
          </div>
          <Textarea id='review-reply' rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder='Teşekkür ederiz…' />
          {pending && (
            <label className='flex items-center gap-2 text-sm'>
              <Checkbox checked={approve} onCheckedChange={(v) => setApprove(v === true)} />
              Yorumu da onaylayıp yayınla (şu an onay bekliyor)
            </label>
          )}
        </div>
        <DialogFooter className='gap-2 sm:justify-between'>
          {review.reply ? (
            <Button variant='ghost' className='text-destructive' onClick={() => submit('')} disabled={saving}>Yanıtı kaldır</Button>
          ) : <span />}
          <div className='flex flex-col-reverse gap-2 sm:flex-row'>
            <Button variant='outline' onClick={() => onOpenChange(false)}>Vazgeç</Button>
            <Button onClick={() => submit(text)} disabled={saving || !text.trim()}>
              {saving && <Loader2 className='size-4 animate-spin' />} Yanıtı kaydet
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
