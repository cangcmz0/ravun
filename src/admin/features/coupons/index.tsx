import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Loader2, Plus, Save, TicketPercent, Trash2 } from 'lucide-react'
import { type Coupon, errorMessage, fetchCoupons, saveCoupons } from '@/lib/api'
import { money } from '@/lib/ravun-data'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Switch } from '@/components/ui/switch'
import { ThemeSwitch } from '@/components/theme-switch'

const blank = (): Coupon => ({
  code: '', type: 'percent', value: 10, minTotal: 0, maxUses: 0, used: 0, expiresAt: '', active: true, note: '',
})

function status(c: Coupon) {
  if (!c.active) return { label: 'Pasif', tone: 'secondary' as const }
  if (c.expiresAt && new Date() > new Date(`${c.expiresAt}T23:59:59+03:00`)) return { label: 'Süresi doldu', tone: 'secondary' as const }
  if (c.maxUses && c.used >= c.maxUses) return { label: 'Hakkı doldu', tone: 'secondary' as const }
  return { label: 'Geçerli', tone: 'default' as const }
}

export function Coupons() {
  const [list, setList] = useState<Coupon[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchCoupons().then(setList).catch((err) => setLoadError(errorMessage(err, 'Kuponlar yüklenemedi.')))
  }, [])

  const edit = (i: number, patch: Partial<Coupon>) => {
    setList((l) => (l || []).map((c, j) => (j === i ? { ...c, ...patch } : c)))
    setDirty(true)
  }
  const remove = (i: number) => {
    setList((l) => (l || []).filter((_, j) => j !== i))
    setDirty(true)
  }

  const save = async () => {
    if (!list || busy) return
    const codes = list.map((c) => c.code.trim().toUpperCase())
    if (codes.some((c) => c.length < 3)) return toast.error('Her kuponun en az 3 karakterlik bir kodu olmalı.')
    if (new Set(codes).size !== codes.length) return toast.error('Aynı kod iki kez kullanılamaz.')
    setBusy(true)
    try {
      const saved = await saveCoupons(list)
      setList(saved)
      setDirty(false)
      toast.success('Kuponlar kaydedildi.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
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
            <h1 className='text-2xl font-bold tracking-tight'>İndirim kuponları</h1>
            <p className='text-muted-foreground text-sm'>
              Instagram kampanyası, sadık müşteri ya da özel gün için kod oluşturun. Müşteri kodu sepette yazar; indirim sunucuda hesaplanır.
            </p>
          </div>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={() => { setList((l) => [blank(), ...(l || [])]); setDirty(true) }} disabled={!list}>
              <Plus className='size-4' /> Yeni kupon
            </Button>
            <Button onClick={save} disabled={!list || busy || !dirty}>
              {busy ? <Loader2 className='size-4 animate-spin' /> : <Save className='size-4' />} Kaydet
            </Button>
          </div>
        </div>

        {!list ? (
          <p className={`py-10 text-center text-sm ${loadError ? 'text-destructive' : 'text-muted-foreground'}`}>{loadError || 'Yükleniyor…'}</p>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className='flex flex-col items-center gap-3 py-12 text-center'>
              <TicketPercent className='text-muted-foreground size-10' />
              <p className='text-muted-foreground text-sm'>Henüz kupon yok. Örneğin <b>HOSGELDIN10</b> ile ilk siparişe %10 indirim verebilirsiniz.</p>
              <Button onClick={() => { setList([{ ...blank(), code: 'HOSGELDIN10' }]); setDirty(true) }}>
                <Plus className='size-4' /> İlk kuponu oluştur
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className='grid gap-4 lg:grid-cols-2'>
            {list.map((c, i) => {
              const st = status(c)
              return (
                <Card key={i} className={c.active ? '' : 'opacity-75'}>
                  <CardHeader className='pb-3'>
                    <div className='flex items-center justify-between gap-2'>
                      <CardTitle className='flex items-center gap-2 font-mono text-lg tracking-wide'>
                        {c.code || 'YENİ KUPON'}
                        {c.code && (
                          <Button size='icon' variant='ghost' className='size-7' aria-label='Kodu kopyala'
                            onClick={() => navigator.clipboard?.writeText(c.code).then(() => toast.success('Kod kopyalandı.'))}>
                            <Copy className='size-3.5' />
                          </Button>
                        )}
                      </CardTitle>
                      <div className='flex items-center gap-2'>
                        <Badge variant={st.tone}>{st.label}</Badge>
                        <Switch checked={c.active} onCheckedChange={(v) => edit(i, { active: v })} aria-label='Kupon açık' />
                      </div>
                    </div>
                    <CardDescription>
                      {c.used} kez kullanıldı{c.maxUses ? ` / ${c.maxUses}` : ''}
                      {c.minTotal ? ` · en az ${money(c.minTotal)}` : ''}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='grid grid-cols-2 gap-3'>
                    <div className='col-span-2 space-y-1.5 sm:col-span-1'>
                      <Label htmlFor={`code-${i}`}>Kod</Label>
                      <Input id={`code-${i}`} value={c.code} maxLength={24} className='font-mono uppercase'
                        onChange={(e) => edit(i, { code: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder='YAZ10' />
                    </div>
                    <div className='col-span-2 space-y-1.5 sm:col-span-1'>
                      <Label>İndirim</Label>
                      <div className='flex gap-2'>
                        <Input type='number' min={1} value={c.value} className='min-w-0 flex-1' onChange={(e) => edit(i, { value: Number(e.target.value) })} />
                        <div className='flex shrink-0 overflow-hidden rounded-md border'>
                          {(['percent', 'amount'] as const).map((t) => (
                            <button key={t} type='button' onClick={() => edit(i, { type: t })}
                              className={`w-9 text-sm ${c.type === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                              {t === 'percent' ? '%' : '₺'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className='space-y-1.5'>
                      <Label htmlFor={`min-${i}`}>En az sepet (₺)</Label>
                      <Input id={`min-${i}`} type='number' min={0} value={c.minTotal || ''} placeholder='Yok'
                        onChange={(e) => edit(i, { minTotal: Number(e.target.value) || 0 })} />
                    </div>
                    <div className='space-y-1.5'>
                      <Label htmlFor={`max-${i}`}>Kullanım sınırı</Label>
                      <Input id={`max-${i}`} type='number' min={0} value={c.maxUses || ''} placeholder='Sınırsız'
                        onChange={(e) => edit(i, { maxUses: Number(e.target.value) || 0 })} />
                    </div>
                    <div className='space-y-1.5'>
                      <Label htmlFor={`exp-${i}`}>Son gün</Label>
                      <Input id={`exp-${i}`} type='date' value={c.expiresAt} onChange={(e) => edit(i, { expiresAt: e.target.value })} />
                    </div>
                    <div className='space-y-1.5'>
                      <Label htmlFor={`note-${i}`}>Not (yalnızca sizin için)</Label>
                      <Input id={`note-${i}`} value={c.note} maxLength={120} placeholder='Instagram çekilişi'
                        onChange={(e) => edit(i, { note: e.target.value })} />
                    </div>
                    <div className='col-span-2 flex justify-end'>
                      <Button variant='ghost' size='sm' className='text-destructive' onClick={() => remove(i)}>
                        <Trash2 className='size-4' /> Sil
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
        {dirty && <p className='text-muted-foreground mt-4 text-sm'>Kaydedilmemiş değişiklikler var.</p>}
      </Main>
    </>
  )
}
