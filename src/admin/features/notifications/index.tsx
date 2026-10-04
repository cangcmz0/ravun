import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BellRing, CheckCircle2, ExternalLink, Loader2, Save, Search, Send, Truck, Unplug } from 'lucide-react'
import {
  type NotifySettings,
  detectTelegramChats,
  errorMessage,
  fetchNotify,
  saveNotify,
  testTelegram,
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ThemeSwitch } from '@/components/theme-switch'

const EVENTS = [
  ['orders', 'Yeni sipariş', 'Ürünler, tutar, müşteri adı ve telefonuyla.'],
  ['reviews', 'Yeni yorum', 'Onay bekleyen müşteri yorumları.'],
  ['messages', 'Yeni iletişim mesajı', 'İletişim formundan gelenler.'],
] as const

// Sık kullanılan kargo firmalarının gönderi sorgulama adresleri.
// {kod} yerine siparişteki takip kodu yazılır. Firma adresini değiştirirse
// buradan düzeltilebilir.
const CARGO_PRESETS = [
  ['Yurtiçi Kargo', 'https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code={kod}'],
  ['Aras Kargo', 'https://kargotakip.araskargo.com.tr/mainpage.aspx?code={kod}'],
  ['PTT Kargo', 'https://gonderitakip.ptt.gov.tr/Track/Verify?q={kod}'],
] as const

export function Notifications() {
  const [cfg, setCfg] = useState<NotifySettings | null>(null)
  const [loadError, setLoadError] = useState('')
  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [events, setEvents] = useState({ orders: true, reviews: true, messages: true })
  const [chats, setChats] = useState<{ id: string; name: string; type: string }[] | null>(null)
  const [busy, setBusy] = useState<'' | 'save' | 'detect' | 'test' | 'remove' | 'order'>('')
  const [order, setOrder] = useState({ cargoCompany: '', cargoTrackUrl: '', paymentInfo: '' })

  const apply = (n: NotifySettings) => {
    setCfg(n)
    setChatId(n.telegramChatId)
    setEvents(n.events)
    setOrder({ cargoCompany: n.cargoCompany, cargoTrackUrl: n.cargoTrackUrl, paymentInfo: n.paymentInfo })
    setToken('')
  }

  useEffect(() => {
    fetchNotify().then(apply).catch((err) => setLoadError(errorMessage(err, 'Ayarlar yüklenemedi.')))
  }, [])

  const run = async (kind: typeof busy, fn: () => Promise<void>) => {
    if (busy) return
    setBusy(kind)
    try {
      await fn()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  const detect = () =>
    run('detect', async () => {
      const list = await detectTelegramChats(token.trim())
      setChats(list)
      if (list.length === 1) setChatId(list[0].id)
      if (!list.length) toast.info('Henüz sohbet yok. Telegram\'da botunuza bir mesaj yazıp tekrar deneyin.')
    })

  const saveTelegram = () =>
    run('save', async () => {
      apply(await saveNotify({ ...(token.trim() ? { telegramToken: token.trim() } : {}), telegramChatId: chatId.trim(), events }))
      setChats(null)
      toast.success('Bildirim ayarları kaydedildi')
    })

  const sendTest = () =>
    run('test', async () => {
      await testTelegram()
      toast.success('Deneme mesajı gönderildi. Telegram\'ı kontrol edin.')
    })

  const removeTelegram = () =>
    run('remove', async () => {
      apply(await saveNotify({ telegramToken: '', telegramChatId: '' }))
      setChats(null)
      toast.success('Telegram bağlantısı kaldırıldı')
    })

  const saveOrder = () =>
    run('order', async () => {
      const url = order.cargoTrackUrl.trim()
      if (url && !/^https:\/\//i.test(url)) throw new Error('Takip adresi https:// ile başlamalı.')
      apply(await saveNotify({ cargoCompany: order.cargoCompany.trim(), cargoTrackUrl: url, paymentInfo: order.paymentInfo.trim() }))
      toast.success('Sipariş mesaj ayarları kaydedildi')
    })

  const connected = Boolean(cfg?.hasToken && cfg?.telegramChatId)

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
          <h1 className='text-2xl font-bold tracking-tight'>Bildirimler</h1>
          <p className='text-muted-foreground text-sm'>
            Yeni sipariş, yorum ve mesajları telefonunuza anında getirin; müşteriye giden hazır mesajları ayarlayın.
          </p>
        </div>

        {!cfg ? (
          <p className={`py-10 text-center text-sm ${loadError ? 'text-destructive' : 'text-muted-foreground'}`}>
            {loadError || 'Yükleniyor…'}
          </p>
        ) : (
          <div className='grid gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <div className='flex items-center justify-between gap-2'>
                  <CardTitle className='flex items-center gap-2'><BellRing className='size-5' /> Telegram bildirimleri</CardTitle>
                  {connected ? (
                    <Badge className='bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'>
                      <CheckCircle2 className='size-3.5' /> Bağlı
                    </Badge>
                  ) : (
                    <Badge variant='secondary'>Kurulmadı</Badge>
                  )}
                </div>
                <CardDescription>Ücretsizdir. Bildirimler kendi Telegram botunuz üzerinden size gelir.</CardDescription>
              </CardHeader>
              <CardContent className='space-y-5'>
                <ol className='text-muted-foreground list-decimal space-y-1 ps-5 text-sm'>
                  <li>Telegram'da <b className='text-foreground'>@BotFather</b>'ı açın, <code>/newbot</code> yazın ve bota bir ad verin.</li>
                  <li>BotFather'ın verdiği <b className='text-foreground'>token</b>'ı aşağıya yapıştırın.</li>
                  <li>Yeni botunuzu açıp <b className='text-foreground'>Başlat</b>'a basın (ya da "merhaba" yazın).</li>
                  <li><b className='text-foreground'>Sohbeti bul</b>'a basın, kaydedin ve deneme mesajı gönderin.</li>
                </ol>

                <div className='space-y-1.5'>
                  <Label htmlFor='tg-token'>Bot token</Label>
                  <Input
                    id='tg-token'
                    type='password'
                    autoComplete='off'
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={cfg.hasToken ? `Kayıtlı (${cfg.tokenHint}) · değiştirmek için yenisini yapıştırın` : '123456789:AA…'}
                  />
                  {cfg.tokenFromEnv && <p className='text-muted-foreground text-xs'>Token sunucu ortam değişkeninden (TELEGRAM_BOT_TOKEN) geliyor.</p>}
                </div>

                <div className='space-y-1.5'>
                  <Label htmlFor='tg-chat'>Sohbet kimliği</Label>
                  <div className='flex gap-2'>
                    <Input id='tg-chat' value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder='Sohbeti bul ile otomatik dolar' />
                    <Button type='button' variant='outline' onClick={detect} disabled={!!busy || (!token.trim() && !cfg.hasToken)}>
                      {busy === 'detect' ? <Loader2 className='size-4 animate-spin' /> : <Search className='size-4' />} Sohbeti bul
                    </Button>
                  </div>
                  {chats && chats.length > 0 && (
                    <div className='flex flex-wrap gap-2 pt-1'>
                      {chats.map((c) => (
                        <Button key={c.id} type='button' size='sm' variant={chatId === c.id ? 'default' : 'outline'} onClick={() => setChatId(c.id)}>
                          {c.name} <span className='opacity-60'>({c.type === 'private' ? 'kişi' : 'grup'})</span>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                <div className='space-y-3'>
                  <Label>Hangi durumlarda bildirim gelsin?</Label>
                  {EVENTS.map(([key, title, desc]) => (
                    <div key={key} className='flex items-center justify-between gap-4 rounded-lg border p-3'>
                      <div>
                        <p className='text-sm font-medium'>{title}</p>
                        <p className='text-muted-foreground text-xs'>{desc}</p>
                      </div>
                      <Switch checked={events[key]} onCheckedChange={(v) => setEvents((e) => ({ ...e, [key]: v }))} />
                    </div>
                  ))}
                </div>

                <div className='flex flex-wrap gap-2'>
                  <Button onClick={saveTelegram} disabled={!!busy}>
                    {busy === 'save' ? <Loader2 className='size-4 animate-spin' /> : <Save className='size-4' />} Kaydet
                  </Button>
                  <Button variant='outline' onClick={sendTest} disabled={!!busy || !connected}>
                    {busy === 'test' ? <Loader2 className='size-4 animate-spin' /> : <Send className='size-4' />} Deneme mesajı gönder
                  </Button>
                  {cfg.hasToken && !cfg.tokenFromEnv && (
                    <Button variant='ghost' className='text-destructive' onClick={removeTelegram} disabled={!!busy}>
                      <Unplug className='size-4' /> Bağlantıyı kaldır
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'><Truck className='size-5' /> Müşteri mesajları</CardTitle>
                <CardDescription>
                  Sipariş detayındaki hazır WhatsApp mesajları ve müşterinin sipariş takip sayfası bu bilgileri kullanır.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-5'>
                <div className='space-y-1.5'>
                  <Label htmlFor='cargo-company'>Kargo firması</Label>
                  <Input id='cargo-company' value={order.cargoCompany} onChange={(e) => setOrder((o) => ({ ...o, cargoCompany: e.target.value }))} placeholder='Örn. Yurtiçi Kargo' />
                  <div className='flex flex-wrap gap-1.5 pt-1'>
                    {CARGO_PRESETS.map(([name, url]) => (
                      <Button key={name} type='button' size='sm' variant='outline' onClick={() => setOrder((o) => ({ ...o, cargoCompany: name, cargoTrackUrl: url }))}>
                        {name}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='cargo-url'>Kargo takip adresi</Label>
                  <Input id='cargo-url' value={order.cargoTrackUrl} onChange={(e) => setOrder((o) => ({ ...o, cargoTrackUrl: e.target.value }))} placeholder='https://…?code={kod}' />
                  <p className='text-muted-foreground text-xs'>
                    Takip kodunun geleceği yere <code>{'{kod}'}</code> yazın. Boş bırakılırsa müşteriye yalnızca takip kodu gösterilir.
                    {order.cargoTrackUrl.startsWith('https://') && (
                      <>
                        {' '}
                        <a className='text-primary inline-flex items-center gap-0.5 underline underline-offset-2' href={order.cargoTrackUrl.replace(/\{kod\}/g, '123456789')} target='_blank' rel='noreferrer'>
                          Adresi dene <ExternalLink className='size-3' />
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='payment-info'>Ödeme bilgisi</Label>
                  <Textarea
                    id='payment-info'
                    rows={4}
                    value={order.paymentInfo}
                    onChange={(e) => setOrder((o) => ({ ...o, paymentInfo: e.target.value }))}
                    placeholder={'IBAN: TR00 0000 0000 0000 0000 0000 00\nAlıcı: Ad Soyad\nAçıklamaya sipariş numaranızı yazmayı unutmayın.'}
                  />
                  <p className='text-muted-foreground text-xs'>"Ödeme bilgisi" hazır mesajına eklenir. Sitede görünmez.</p>
                </div>
                <Button onClick={saveOrder} disabled={!!busy}>
                  {busy === 'order' ? <Loader2 className='size-4 animate-spin' /> : <Save className='size-4' />} Kaydet
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </Main>
    </>
  )
}
