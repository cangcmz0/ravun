import { useState } from 'react'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { categoryLabelFromKey, loadSiteSettings, saveSiteSettings } from '@/lib/ravun-data'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ThemeSwitch } from '@/components/theme-switch'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Sıra DEFAULT_CATEGORY_SETTINGS ile birebir aynı — bkz. lib/ravun-data.ts
const CATEGORY_KEYS = ['tum', 'duvar-rafi', 'bicak-standi', 'masaustu', 'sunum-tahtasi', 'paketleme']

// Sitede gerçekten bir bölümü açıp kapatan iki anahtar (bkz. main.jsx ~2467-2468)
const ACTIVE_VISIBILITY_SWITCHES = [
  ['showStoryPreview', 'Hikaye önizlemesi', 'Ana sayfada Hikaye önizlemesini gösterir.'],
  ['showCta', 'Alt CTA bölümü', 'Ana sayfa altındaki CTA bölümünü gösterir.'],
] as const

// Şemada duran ama şu an sitede karşılığı olmayan (hiçbir komponente bağlı
// olmayan veya hiç kullanılmayan komponentlere bağlı) anahtarlar
const RESERVED_VISIBILITY_SWITCHES = [
  ['showAtelierFeature', 'Atölye öne çıkan bölümü'],
  ['showEditions', 'Sınırlı seri bölümü'],
  ['showArchive', 'Arşiv önizlemesi'],
  ['showPromise', 'Güven / vaat bölümü'],
  ['showProcess', 'Süreç bölümü'],
  ['showTrustFlow', 'Güven akışı bölümü'],
  ['showBrandExperience', 'Marka deneyimi bölümü'],
  ['showJournal', 'Günlük / blog bölümü'],
] as const

export function Settings() {
  const [form, setForm] = useState<any>(() => loadSiteSettings())

  const set = (key: string) => (value: any) => setForm((f: any) => ({ ...f, [key]: value }))
  const setCat = (key: string, field: string) => (value: any) =>
    setForm((f: any) => ({
      ...f,
      categorySettings: {
        ...f.categorySettings,
        [key]: { ...f.categorySettings[key], [field]: value },
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
              Ana sayfa metinleri, kategori kartları ve görünürlük ayarlarını buradan yönetin.
            </p>
          </div>
          <Button onClick={handleSave}>
            <Save className='size-4' /> Kaydet
          </Button>
        </div>

        <Tabs defaultValue='hero'>
          <TabsList className='w-full flex-wrap justify-start'>
            <TabsTrigger value='hero'>Hero</TabsTrigger>
            <TabsTrigger value='koleksiyon'>Koleksiyon & Atölye</TabsTrigger>
            <TabsTrigger value='kategoriler'>Kategoriler</TabsTrigger>
            <TabsTrigger value='paketleme'>Paketleme & Hediye</TabsTrigger>
            <TabsTrigger value='sosyal'>Instagram & Footer</TabsTrigger>
            <TabsTrigger value='gorunurluk'>Görünürlük</TabsTrigger>
          </TabsList>

          {/* ── HERO ── */}
          <TabsContent value='hero' className='mt-4'>
            <Card>
              <CardHeader>
                <CardTitle>Ana sayfa hero</CardTitle>
                <CardDescription>Sitenin en üstündeki karşılama alanı.</CardDescription>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2'>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-heroTag'>Üst etiket</Label>
                  <Input id='st-heroTag' value={form.heroTag} onChange={(e) => set('heroTag')(e.target.value)} />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-heroCta'>Birincil buton metni</Label>
                  <Input id='st-heroCta' value={form.heroCta} onChange={(e) => set('heroCta')(e.target.value)} />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-heroLine1'>Başlık — 1. satır</Label>
                  <Input id='st-heroLine1' value={form.heroLine1} onChange={(e) => set('heroLine1')(e.target.value)} />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-heroSecondCta'>İkincil buton metni</Label>
                  <Input id='st-heroSecondCta' value={form.heroSecondCta} onChange={(e) => set('heroSecondCta')(e.target.value)} />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-heroLine2'>Başlık — 2. satır</Label>
                  <Input id='st-heroLine2' value={form.heroLine2} onChange={(e) => set('heroLine2')(e.target.value)} />
                </div>
                <div className='grid gap-1.5 sm:col-span-2'>
                  <Label htmlFor='st-announcement'>
                    Üst duyuru şeridi <span className='text-muted-foreground'>(boş bırakılırsa site hiç göstermez)</span>
                  </Label>
                  <Input
                    id='st-announcement'
                    value={form.announcement}
                    onChange={(e) => set('announcement')(e.target.value)}
                    placeholder='Örn. Kargo bedava — 500₺ üzeri siparişlerde'
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── KOLEKSİYON & ATÖLYE ── */}
          <TabsContent value='koleksiyon' className='mt-4 space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Koleksiyon bölümü</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2'>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-collectionEyebrow'>Üst etiket</Label>
                  <Input id='st-collectionEyebrow' value={form.collectionEyebrow} onChange={(e) => set('collectionEyebrow')(e.target.value)} />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-collectionDesc'>Açıklama</Label>
                  <Input id='st-collectionDesc' value={form.collectionDesc} onChange={(e) => set('collectionDesc')(e.target.value)} />
                </div>
                <div className='grid gap-1.5 sm:col-span-2'>
                  <Label htmlFor='st-collectionTitle'>
                    Başlık <span className='text-muted-foreground'>(2. satır için Enter'a basın)</span>
                  </Label>
                  <Textarea id='st-collectionTitle' rows={2} value={form.collectionTitle} onChange={(e) => set('collectionTitle')(e.target.value)} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Atölye bölümü</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2'>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-atelierEyebrow'>Üst etiket</Label>
                  <Input id='st-atelierEyebrow' value={form.atelierEyebrow} onChange={(e) => set('atelierEyebrow')(e.target.value)} />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-atelierDesc'>Açıklama</Label>
                  <Input id='st-atelierDesc' value={form.atelierDesc} onChange={(e) => set('atelierDesc')(e.target.value)} />
                </div>
                <div className='grid gap-1.5 sm:col-span-2'>
                  <Label htmlFor='st-atelierTitle'>
                    Başlık <span className='text-muted-foreground'>(2. satır için Enter'a basın)</span>
                  </Label>
                  <Textarea id='st-atelierTitle' rows={2} value={form.atelierTitle} onChange={(e) => set('atelierTitle')(e.target.value)} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Hikaye bölümü</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4'>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-storyTitle'>Başlık</Label>
                  <Input id='st-storyTitle' value={form.storyTitle} onChange={(e) => set('storyTitle')(e.target.value)} />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-storyDesc'>Açıklama</Label>
                  <Textarea id='st-storyDesc' rows={2} value={form.storyDesc} onChange={(e) => set('storyDesc')(e.target.value)} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── KATEGORİLER ── */}
          <TabsContent value='kategoriler' className='mt-4 space-y-4'>
            {CATEGORY_KEYS.map((key) => {
              const cat = form.categorySettings?.[key] || { eyebrow: '', title: '', desc: '', image: '' }
              return (
                <Card key={key}>
                  <CardHeader>
                    <CardTitle>{categoryLabelFromKey(key)}</CardTitle>
                  </CardHeader>
                  <CardContent className='grid gap-4 sm:grid-cols-[1fr_1fr_auto]'>
                    <div className='grid gap-1.5'>
                      <Label htmlFor={`st-cat-${key}-eyebrow`}>Üst etiket</Label>
                      <Input id={`st-cat-${key}-eyebrow`} value={cat.eyebrow} onChange={(e) => setCat(key, 'eyebrow')(e.target.value)} />
                    </div>
                    <div className='grid gap-1.5'>
                      <Label htmlFor={`st-cat-${key}-title`}>Başlık</Label>
                      <Input id={`st-cat-${key}-title`} value={cat.title} onChange={(e) => setCat(key, 'title')(e.target.value)} />
                    </div>
                    <div className='row-span-2 grid gap-1.5 justify-items-start'>
                      <Label>Önizleme</Label>
                      <div className='bg-muted h-20 w-32 overflow-hidden rounded-md border'>
                        <img
                          key={cat.image}
                          src={cat.image}
                          alt=''
                          className='h-full w-full object-cover'
                          onError={(e) => {
                            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      </div>
                    </div>
                    <div className='grid gap-1.5 sm:col-span-2'>
                      <Label htmlFor={`st-cat-${key}-desc`}>Açıklama</Label>
                      <Textarea id={`st-cat-${key}-desc`} rows={2} value={cat.desc} onChange={(e) => setCat(key, 'desc')(e.target.value)} />
                    </div>
                    <div className='grid gap-1.5 sm:col-span-3'>
                      <Label htmlFor={`st-cat-${key}-image`}>Görsel yolu / URL</Label>
                      <Input
                        id={`st-cat-${key}-image`}
                        value={cat.image}
                        onChange={(e) => setCat(key, 'image')(e.target.value)}
                        placeholder='/assets/products_hero-1.webp'
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </TabsContent>

          {/* ── PAKETLEME & HEDİYE ── */}
          <TabsContent value='paketleme' className='mt-4 space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Paketleme</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4'>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-packageTitle'>Başlık</Label>
                  <Input id='st-packageTitle' value={form.packageTitle} onChange={(e) => set('packageTitle')(e.target.value)} />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-packageDesc'>Açıklama</Label>
                  <Textarea id='st-packageDesc' rows={2} value={form.packageDesc} onChange={(e) => set('packageDesc')(e.target.value)} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Hediye paketi</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2'>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-giftTitle'>Başlık</Label>
                  <Input id='st-giftTitle' value={form.giftTitle} onChange={(e) => set('giftTitle')(e.target.value)} />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-giftPrice'>Fiyat (₺)</Label>
                  <Input
                    id='st-giftPrice'
                    type='number'
                    min={0}
                    value={form.giftPrice}
                    onChange={(e) => set('giftPrice')(Number(e.target.value) || 0)}
                  />
                </div>
                <div className='grid gap-1.5 sm:col-span-2'>
                  <Label htmlFor='st-giftDesc'>Açıklama</Label>
                  <Textarea id='st-giftDesc' rows={2} value={form.giftDesc} onChange={(e) => set('giftDesc')(e.target.value)} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── INSTAGRAM & FOOTER ── */}
          <TabsContent value='sosyal' className='mt-4 space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Instagram & Pinterest</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2'>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-instagram'>Kullanıcı adı</Label>
                  <Input id='st-instagram' value={form.instagram} onChange={(e) => set('instagram')(e.target.value)} placeholder='@ravun.atolye' />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-instagramUrl'>Instagram bağlantısı</Label>
                  <Input id='st-instagramUrl' value={form.instagramUrl} onChange={(e) => set('instagramUrl')(e.target.value)} />
                </div>
                <div className='grid gap-1.5 sm:col-span-2'>
                  <Label htmlFor='st-pinterestLabel'>Pinterest etiketi</Label>
                  <Input id='st-pinterestLabel' value={form.pinterestLabel} onChange={(e) => set('pinterestLabel')(e.target.value)} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Footer</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4'>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-footerDesc'>Footer açıklaması</Label>
                  <Textarea id='st-footerDesc' rows={2} value={form.footerDesc} onChange={(e) => set('footerDesc')(e.target.value)} />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-footerLocation'>Konum / kuruluş yılı</Label>
                  <Input id='st-footerLocation' value={form.footerLocation} onChange={(e) => set('footerLocation')(e.target.value)} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── GÖRÜNÜRLÜK ── */}
          <TabsContent value='gorunurluk' className='mt-4 space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Aktif bölümler</CardTitle>
                <CardDescription>Bu anahtarlar şu anki sitede gerçekten bir bölümü açıp kapatıyor.</CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                {ACTIVE_VISIBILITY_SWITCHES.map(([key, label, desc]) => (
                  <div key={key} className='flex items-center justify-between rounded-md border p-3'>
                    <div>
                      <p className='text-sm font-medium'>{label}</p>
                      <p className='text-muted-foreground text-xs'>{desc}</p>
                    </div>
                    <Switch checked={Boolean(form[key])} onCheckedChange={set(key)} />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Ayrılmış anahtarlar</CardTitle>
                <CardDescription>
                  Bu anahtarların şu an sitede karşılığı yok — ileride kullanılmak üzere burada duruyor, değiştirilmesi sitede görsel bir etki yapmaz.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                {RESERVED_VISIBILITY_SWITCHES.map(([key, label]) => (
                  <div key={key} className='flex items-center justify-between rounded-md border p-3'>
                    <p className='text-sm font-medium'>{label}</p>
                    <Switch checked={Boolean(form[key])} onCheckedChange={set(key)} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Main>
    </>
  )
}
