import { useState } from 'react'
import { toast } from 'sonner'
import {
  DEFAULT_CATEGORY_SETTINGS,
  categoryLabelFromKey,
  loadSiteSettings,
  saveSiteSettings,
} from '@/lib/ravun-data'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ThemeSwitch } from '@/components/theme-switch'

/* eslint-disable @typescript-eslint/no-explicit-any */

const CATEGORY_KEYS = Object.keys(DEFAULT_CATEGORY_SETTINGS)

const REAL_VISIBILITY_SWITCHES: [string, string, string][] = [
  ['showStoryPreview', 'Hikaye önizlemesi', 'Ana sayfada Hikaye önizlemesini gösterir.'],
  ['showCta', 'Alt CTA bölümü', 'Ana sayfa altındaki CTA (harekete geçirme) bölümünü gösterir.'],
]

const INACTIVE_VISIBILITY_SWITCHES: [string, string][] = [
  ['showAtelierFeature', 'Atölye Öne Çıkan'],
  ['showEditions', 'Sınırlı Seri'],
  ['showArchive', 'Arşiv'],
  ['showPromise', 'Söz / Garanti'],
  ['showProcess', 'Üretim Süreci'],
  ['showTrustFlow', 'Güven Akışı'],
  ['showBrandExperience', 'Marka Deneyimi'],
  ['showJournal', 'Günlük / Blog'],
]

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className='space-y-1.5'>
      <Label>{label}</Label>
      {children}
      {hint ? <p className='text-muted-foreground text-xs'>{hint}</p> : null}
    </div>
  )
}

export function Settings() {
  const [form, setForm] = useState<any>(() => loadSiteSettings())

  const update = (key: string, value: any) =>
    setForm((prev: any) => ({ ...prev, [key]: value }))

  const updateCategory = (key: string, field: string, value: any) =>
    setForm((prev: any) => ({
      ...prev,
      categorySettings: {
        ...prev.categorySettings,
        [key]: { ...prev.categorySettings?.[key], [field]: value },
      },
    }))

  const handleSave = () => {
    saveSiteSettings(form)
    toast.success('Site ayarları kaydedildi')
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
        <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Site Ayarları</h1>
            <p className='text-muted-foreground text-sm'>
              Ana sitedeki metin, kategori ve görünürlük ayarlarını buradan yönet.
            </p>
          </div>
          <Button onClick={handleSave}>Kaydet</Button>
        </div>

        <Tabs defaultValue='hero' className='space-y-4'>
          <TabsList className='flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0'>
            <TabsTrigger value='hero'>Hero</TabsTrigger>
            <TabsTrigger value='collection'>Koleksiyon &amp; Atölye</TabsTrigger>
            <TabsTrigger value='categories'>Kategoriler</TabsTrigger>
            <TabsTrigger value='package'>Paketleme &amp; Hediye</TabsTrigger>
            <TabsTrigger value='social'>Instagram &amp; Footer</TabsTrigger>
            <TabsTrigger value='visibility'>Görünürlük</TabsTrigger>
          </TabsList>

          {/* ── HERO ── */}
          <TabsContent value='hero'>
            <Card>
              <CardHeader>
                <CardTitle>Hero bölümü</CardTitle>
                <CardDescription>
                  Ana sayfanın en üstünde görünen başlık ve butonlar.
                </CardDescription>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2'>
                <Field label='Üst etiket (ör. SİPARİŞ ÜZERİNE)'>
                  <Input value={form.heroTag} onChange={(e) => update('heroTag', e.target.value)} />
                </Field>
                <div />
                <Field label='Başlık — 1. satır'>
                  <Input value={form.heroLine1} onChange={(e) => update('heroLine1', e.target.value)} />
                </Field>
                <Field label='Başlık — 2. satır'>
                  <Input value={form.heroLine2} onChange={(e) => update('heroLine2', e.target.value)} />
                </Field>
                <Field label='Birincil buton metni'>
                  <Input value={form.heroCta} onChange={(e) => update('heroCta', e.target.value)} />
                </Field>
                <Field label='İkincil buton metni'>
                  <Input value={form.heroSecondCta} onChange={(e) => update('heroSecondCta', e.target.value)} />
                </Field>
                <Field
                  label='Üst duyuru şeridi'
                  hint='Boş bırakılırsa sitede duyuru şeridi hiç gösterilmez.'
                >
                  <Input value={form.announcement} onChange={(e) => update('announcement', e.target.value)} placeholder='Örn: Kargo bu hafta 2 gün içinde' />
                </Field>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── KOLEKSİYON & ATÖLYE ── */}
          <TabsContent value='collection'>
            <Card>
              <CardHeader>
                <CardTitle>Koleksiyon &amp; Atölye</CardTitle>
                <CardDescription>
                  Koleksiyon, Atölye ve Hikaye bölümlerinin metinleri.
                </CardDescription>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2'>
                <Field label='Koleksiyon — üst etiket'>
                  <Input value={form.collectionEyebrow} onChange={(e) => update('collectionEyebrow', e.target.value)} />
                </Field>
                <div />
                <Field
                  label='Koleksiyon — başlık'
                  hint='İki satır için Enter kullan (ilk satırdan sonra yeni satıra geç).'
                >
                  <Textarea rows={2} value={form.collectionTitle} onChange={(e) => update('collectionTitle', e.target.value)} />
                </Field>
                <Field label='Koleksiyon — açıklama'>
                  <Textarea rows={2} value={form.collectionDesc} onChange={(e) => update('collectionDesc', e.target.value)} />
                </Field>
                <Field label='Atölye — üst etiket'>
                  <Input value={form.atelierEyebrow} onChange={(e) => update('atelierEyebrow', e.target.value)} />
                </Field>
                <div />
                <Field
                  label='Atölye — başlık'
                  hint='İki satır için Enter kullan (ilk satırdan sonra yeni satıra geç).'
                >
                  <Textarea rows={2} value={form.atelierTitle} onChange={(e) => update('atelierTitle', e.target.value)} />
                </Field>
                <Field label='Atölye — açıklama'>
                  <Textarea rows={2} value={form.atelierDesc} onChange={(e) => update('atelierDesc', e.target.value)} />
                </Field>
                <Field label='Hikaye — başlık'>
                  <Textarea rows={2} value={form.storyTitle} onChange={(e) => update('storyTitle', e.target.value)} />
                </Field>
                <Field label='Hikaye — açıklama'>
                  <Textarea rows={2} value={form.storyDesc} onChange={(e) => update('storyDesc', e.target.value)} />
                </Field>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── KATEGORİLER ── */}
          <TabsContent value='categories'>
            <div className='grid gap-4 lg:grid-cols-2'>
              {CATEGORY_KEYS.map((key) => {
                const cat = form.categorySettings?.[key] || {}
                return (
                  <Card key={key}>
                    <CardHeader>
                      <CardTitle className='text-base'>{categoryLabelFromKey(key)}</CardTitle>
                    </CardHeader>
                    <CardContent className='space-y-3'>
                      <Field label='Üst etiket'>
                        <Input value={cat.eyebrow || ''} onChange={(e) => updateCategory(key, 'eyebrow', e.target.value)} />
                      </Field>
                      <Field label='Başlık'>
                        <Input value={cat.title || ''} onChange={(e) => updateCategory(key, 'title', e.target.value)} />
                      </Field>
                      <Field label='Açıklama'>
                        <Textarea rows={2} value={cat.desc || ''} onChange={(e) => updateCategory(key, 'desc', e.target.value)} />
                      </Field>
                      <Field label='Görsel (path veya URL)'>
                        <Input value={cat.image || ''} onChange={(e) => updateCategory(key, 'image', e.target.value)} placeholder='/assets/...' />
                      </Field>
                      {cat.image ? (
                        <img
                          src={cat.image}
                          alt=''
                          className='h-20 w-32 rounded-md border object-cover'
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : null}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>

          {/* ── PAKETLEME & HEDİYE ── */}
          <TabsContent value='package'>
            <Card>
              <CardHeader>
                <CardTitle>Paketleme &amp; Hediye</CardTitle>
                <CardDescription>
                  Paketleme bölümü metni ve hediye seçeneği bilgileri.
                </CardDescription>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2'>
                <Field label='Paketleme — başlık'>
                  <Textarea rows={2} value={form.packageTitle} onChange={(e) => update('packageTitle', e.target.value)} />
                </Field>
                <Field label='Paketleme — açıklama'>
                  <Textarea rows={2} value={form.packageDesc} onChange={(e) => update('packageDesc', e.target.value)} />
                </Field>
                <Field label='Hediye — başlık'>
                  <Input value={form.giftTitle} onChange={(e) => update('giftTitle', e.target.value)} />
                </Field>
                <Field label='Hediye — fiyat (TL)'>
                  <Input
                    type='number'
                    min={0}
                    value={form.giftPrice}
                    onChange={(e) => update('giftPrice', Number(e.target.value))}
                  />
                </Field>
                <Field label='Hediye — açıklama' hint='Kraft kutu, kart vb. detayları buraya yaz.'>
                  <Textarea rows={2} value={form.giftDesc} onChange={(e) => update('giftDesc', e.target.value)} />
                </Field>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── INSTAGRAM & FOOTER ── */}
          <TabsContent value='social'>
            <Card>
              <CardHeader>
                <CardTitle>Instagram &amp; Footer</CardTitle>
                <CardDescription>Sosyal medya ve alt bilgi (footer) alanları.</CardDescription>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2'>
                <Field label='Instagram kullanıcı adı'>
                  <Input value={form.instagram} onChange={(e) => update('instagram', e.target.value)} placeholder='@kullaniciadi' />
                </Field>
                <Field label='Instagram linki'>
                  <Input value={form.instagramUrl} onChange={(e) => update('instagramUrl', e.target.value)} placeholder='https://instagram.com/...' />
                </Field>
                <Field label='Pinterest etiketi'>
                  <Input value={form.pinterestLabel} onChange={(e) => update('pinterestLabel', e.target.value)} />
                </Field>
                <div />
                <Field label='Footer — açıklama'>
                  <Textarea rows={2} value={form.footerDesc} onChange={(e) => update('footerDesc', e.target.value)} />
                </Field>
                <Field label='Footer — konum'>
                  <Input value={form.footerLocation} onChange={(e) => update('footerLocation', e.target.value)} />
                </Field>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── GÖRÜNÜRLÜK ── */}
          <TabsContent value='visibility'>
            <div className='space-y-4'>
              <Card>
                <CardHeader>
                  <CardTitle>Görünürlük</CardTitle>
                  <CardDescription>
                    Bu anahtarlar sitedeki ilgili bölümleri açıp kapatır.
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-4'>
                  {REAL_VISIBILITY_SWITCHES.map(([key, label, desc]) => (
                    <div key={key} className='flex items-center justify-between gap-4 rounded-lg border p-3'>
                      <div>
                        <p className='text-sm font-medium'>{label}</p>
                        <p className='text-muted-foreground text-xs'>{desc}</p>
                      </div>
                      <Switch checked={Boolean(form[key])} onCheckedChange={(v) => update(key, v)} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Henüz sitede karşılığı olmayan anahtarlar</CardTitle>
                  <CardDescription>
                    Bu anahtarların şu an sitede karşılığı yok, ileride kullanılmak üzere duruyor. Değerleri kaydedilir ama görünümde bir etkisi olmaz.
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-4'>
                  {INACTIVE_VISIBILITY_SWITCHES.map(([key, label]) => (
                    <div key={key} className='flex items-center justify-between gap-4 rounded-lg border p-3 opacity-70'>
                      <p className='text-sm font-medium'>{label}</p>
                      <Switch checked={Boolean(form[key])} onCheckedChange={(v) => update(key, v)} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <Separator className='my-6' />
        <div className='flex justify-end'>
          <Button onClick={handleSave}>Kaydet</Button>
        </div>
      </Main>
    </>
  )
}
