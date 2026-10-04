import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, DatabaseBackup, Download, KeyRound, Loader2, RotateCcw, Upload } from 'lucide-react'
import {
  type PinInfo,
  changePin,
  errorMessage,
  fetchBackup,
  fetchPinInfo,
  resetPanelPin,
  restoreBackup,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'

/* eslint-disable @typescript-eslint/no-explicit-any */

const CONFIRM_WORD = 'GERİ YÜKLE'

function saveJson(data: any, name: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

const countsOf = (b: any) => ({
  products: b?.products?.length || 0,
  orders: b?.orders?.length || 0,
  reviews: b?.reviews?.length || 0,
  messages: b?.messages?.length || 0,
})

export function Security() {
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
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Güvenlik & Yedek</h1>
          <p className='text-muted-foreground text-sm'>Yönetici PIN'ini değiştirin, verilerinizin yedeğini alın ya da yedekten geri yükleyin.</p>
        </div>
        <div className='grid gap-4 lg:grid-cols-2'>
          <PinCard />
          <BackupCard />
        </div>
      </Main>
    </>
  )
}

function PinCard() {
  const [info, setInfo] = useState<PinInfo | null>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState<'' | 'change' | 'reset'>('')

  useEffect(() => {
    fetchPinInfo().then(setInfo).catch(() => {})
  }, [])

  const digitsOnly = (v: string) => v.replace(/\D/g, '').slice(0, 12)
  const mismatch = again.length > 0 && next !== again

  const submit = async () => {
    if (busy) return
    if (!current) return toast.error('Mevcut PIN\'i yazın.')
    if (next.length < 6) return toast.error('Yeni PIN en az 6 haneli olmalı.')
    if (next !== again) return toast.error('Yeni PIN\'ler eşleşmiyor.')
    setBusy('change')
    try {
      setInfo(await changePin(current, next))
      setCurrent(''); setNext(''); setAgain('')
      toast.success('PIN değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  const reset = async () => {
    if (busy) return
    if (!current) return toast.error('Onay için mevcut PIN\'i yazın.')
    setBusy('reset')
    try {
      setInfo(await resetPanelPin(current))
      setCurrent('')
      toast.success('Sunucudaki PIN yeniden geçerli.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='flex items-center gap-2'><KeyRound className='size-5' /> Yönetici PIN'i</CardTitle>
          {info && (
            <Badge variant='secondary'>
              {info.source === 'panel' ? 'Panelden belirlendi' : 'Sunucu PIN\'i'}
            </Badge>
          )}
        </div>
        <CardDescription>
          {info?.source === 'panel' && info.updatedAt
            ? `Son değişiklik: ${new Date(info.updatedAt).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })}`
            : 'Şu an sunucu ayarlarındaki (ADMIN_PIN) PIN kullanılıyor.'}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <form className='space-y-3' onSubmit={(e) => { e.preventDefault(); submit() }}>
          <div className='grid gap-1.5'>
            <Label htmlFor='pin-current'>Mevcut PIN</Label>
            <Input id='pin-current' type='password' inputMode='numeric' autoComplete='current-password' value={current} onChange={(e) => setCurrent(digitsOnly(e.target.value))} />
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='grid gap-1.5'>
              <Label htmlFor='pin-next'>Yeni PIN</Label>
              <Input id='pin-next' type='password' inputMode='numeric' autoComplete='new-password' value={next} onChange={(e) => setNext(digitsOnly(e.target.value))} placeholder='6–12 rakam' />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='pin-again'>Yeni PIN (tekrar)</Label>
              <Input id='pin-again' type='password' inputMode='numeric' autoComplete='new-password' value={again} onChange={(e) => setAgain(digitsOnly(e.target.value))} aria-invalid={mismatch} className={mismatch ? 'border-destructive' : ''} />
            </div>
          </div>
          {mismatch && <p className='text-destructive text-xs'>PIN'ler eşleşmiyor.</p>}
          <ul className='text-muted-foreground list-disc space-y-0.5 ps-5 text-xs'>
            <li>123456, 000000 gibi kolay tahmin edilen PIN'ler kabul edilmez.</li>
            <li>Değiştirdiğinizde diğer cihazlardaki açık oturumlar kapanır; bu cihazda devam edersiniz.</li>
            <li>PIN'i unutursanız: veritabanında (Neon) <code>settings</code> tablosundaki <code>admin_auth</code> satırını silin; sunucudaki PIN yeniden geçerli olur.</li>
          </ul>
          <div className='flex flex-wrap gap-2'>
            <Button type='submit' disabled={!!busy}>
              {busy === 'change' && <Loader2 className='size-4 animate-spin' />} PIN'i değiştir
            </Button>
            {info?.source === 'panel' && info.envAvailable && (
              <Button type='button' variant='ghost' onClick={reset} disabled={!!busy} title='Mevcut PIN ile onaylanır'>
                {busy === 'reset' ? <Loader2 className='size-4 animate-spin' /> : <RotateCcw className='size-4' />} Sunucu PIN'ine dön
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function BackupCard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'' | 'download' | 'restore'>('')
  const [pending, setPending] = useState<{ name: string; backup: any } | null>(null)
  const [confirm, setConfirm] = useState('')

  const download = async () => {
    if (busy) return
    setBusy('download')
    try {
      const backup = await fetchBackup()
      saveJson(backup, `ravun-yedek-${stamp()}.json`)
      const c = countsOf(backup)
      toast.success(`Yedek indirildi · ${c.products} ürün, ${c.orders} sipariş, ${c.reviews} yorum, ${c.messages} mesaj`)
    } catch (err) {
      toast.error(`Yedek alınamadı: ${errorMessage(err)}`)
    } finally {
      setBusy('')
    }
  }

  const pickFile = async (file?: File) => {
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      const backup = data?.format === 'ravun-backup' ? data : data?.backup
      if (backup?.format !== 'ravun-backup') throw new Error('Bu dosya bir Ravun yedeği değil.')
      if (file.size > 4 * 1024 * 1024) throw new Error('Yedek dosyası 4 MB sınırını aşıyor; sunucu taşırken pg_dump kullanın.')
      setPending({ name: file.name, backup })
      setConfirm('')
    } catch (err) {
      toast.error(err instanceof SyntaxError ? 'Dosya okunamadı (geçerli bir JSON değil).' : errorMessage(err))
    }
  }

  const restore = async () => {
    if (!pending || busy || confirm.trim().toLocaleUpperCase('tr-TR') !== CONFIRM_WORD) return
    setBusy('restore')
    try {
      // Güvenlik ağı: geri yüklemeden önce mevcut veriler indirilir.
      saveJson(await fetchBackup(), `ravun-yedek-geri-yukleme-oncesi-${stamp()}.json`)
      const r = await restoreBackup(pending.backup)
      toast.success(`Geri yüklendi · ${r.products} ürün, ${r.orders} sipariş, ${r.reviews} yorum, ${r.messages} mesaj`)
      setPending(null)
      setConfirm('')
    } catch (err) {
      toast.error(`Geri yüklenemedi: ${errorMessage(err)}`)
    } finally {
      setBusy('')
    }
  }

  const c = countsOf(pending?.backup)

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'><DatabaseBackup className='size-5' /> Yedek</CardTitle>
        <CardDescription>
          Ürünler, site ayarları, siparişler, yorumlar ve mesajlar tek dosyada. Ayda bir yedek alıp bilgisayarınızda saklamanız önerilir.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <div className='space-y-2'>
          <Button onClick={download} disabled={!!busy}>
            {busy === 'download' ? <Loader2 className='size-4 animate-spin' /> : <Download className='size-4' />} Yedeği indir
          </Button>
          <p className='text-muted-foreground text-xs'>
            Fotoğrafların kendisi dosyaya eklenmez (veritabanında kalır). Telegram token'ı ve PIN güvenlik için yedeğe yazılmaz.
          </p>
        </div>

        <div className='space-y-3 rounded-lg border border-dashed p-3'>
          <p className='text-sm font-medium'>Yedekten geri yükle</p>
          <input ref={fileRef} type='file' accept='application/json,.json' className='hidden' onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
          {!pending ? (
            <Button variant='outline' onClick={() => fileRef.current?.click()} disabled={!!busy}>
              <Upload className='size-4' /> Yedek dosyası seç
            </Button>
          ) : (
            <div className='space-y-3'>
              <div className='bg-muted/50 rounded-md border p-3 text-sm'>
                <p className='font-medium'>{pending.name}</p>
                <p className='text-muted-foreground text-xs'>
                  {pending.backup.createdAt ? new Date(pending.backup.createdAt).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' }) : 'Tarih yok'}
                  {' · '}{c.products} ürün · {c.orders} sipariş · {c.reviews} yorum · {c.messages} mesaj
                </p>
              </div>
              <div className='flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'>
                <AlertTriangle className='size-4 flex-none' />
                <span>
                  Sitedeki tüm ürünler, siparişler, yorumlar, mesajlar ve site ayarları bu dosyadakilerle <b>değiştirilecek</b>.
                  Başlamadan önce mevcut veriler otomatik olarak indirilir.
                </span>
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='restore-confirm'>Onaylamak için <b>{CONFIRM_WORD}</b> yazın</Label>
                <Input id='restore-confirm' value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete='off' />
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button variant='destructive' onClick={restore} disabled={!!busy || confirm.trim().toLocaleUpperCase('tr-TR') !== CONFIRM_WORD}>
                  {busy === 'restore' && <Loader2 className='size-4 animate-spin' />} Geri yükle
                </Button>
                <Button variant='ghost' onClick={() => { setPending(null); setConfirm('') }} disabled={!!busy}>Vazgeç</Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
