import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { categoryKey, categoryList, heroSlidesFrom, setCategoryLabels } from '@/lib/ravun-data'
import { errorMessage, fetchProducts, fetchSettings, saveSettings } from '@/lib/api'
import { type EditableSlide, HeroSlidesEditor, slideUid } from './components/hero-slides-editor'
import { type CategoryRow, CategoryManager, TextsEditor, categoryUid, defaultTexts } from './components/category-manager'
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

// Sitede gerçekten bir bölümü açıp kapatan iki anahtar (bkz. main.jsx ~2467-2468)
// Her anahtar ana sayfada bir bölümü açıp kapatır (sıra, sitedeki sırayla aynı).
const VISIBILITY_SWITCHES = [
  ['showAtelierFeature', 'Atölye öne çıkan bölümü', 'Ürünlerin üstünde, üç görselli "Atölyeden" tanıtımı.'],
  ['showEditions', 'Ravun sistemi', 'Signature / Hediye / Arşiv / Özel sipariş kartları.'],
  ['showArchive', 'Arşiv önizlemesi', 'Satıldı veya Arşiv durumundaki ürünleri gösterir (böyle ürün yoksa hiç görünmez).'],
  ['showStoryPreview', 'Hikaye önizlemesi', 'Hikaye sayfasına yönlendiren görselli bölüm.'],
  ['showProcess', 'Üretim süreci', 'Tasarım → Döküm → Cilalama → Teslim adımları.'],
  ['showPromise', 'Kısa vaatler', 'Üç kısa güven maddesi.'],
  ['showTrustFlow', 'Sipariş akışı', 'Sipariş verme adımlarını anlatan bölüm.'],
  ['showBrandExperience', 'Marka deneyimi', 'Atölye, paketleme, malzeme ve ürün hikayesi kartları.'],
  ['showJournal', 'Atölye günlüğü', 'Kısa üretim notları.'],
  ['showCta', 'Alt çağrı (CTA) bölümü', 'Sayfa sonundaki "Bize yazın" bandı.'],
] as const

const LEGAL_FIELDS: [string, string, string, boolean?][] = [
  ['sellerName', 'Unvan (şahıs şirketinde ad soyad)', 'Örn. Ad Soyad – Ravun Atölye', true],
  ['sellerAddress', 'Açık adres', 'Mahalle, cadde, no, ilçe / il', true],
  ['sellerTax', 'Vergi dairesi / vergi no (veya T.C. kimlik no)', 'Örn. Beykoz VD / 1234567890'],
  ['sellerPhone', 'Telefon', '+90 5xx xxx xx xx'],
  ['sellerEmail', 'E-posta', 'atolye@ravun.com.tr'],
  ['sellerKep', 'KEP adresi (varsa)', 'ornek@hs01.kep.tr'],
  ['sellerMersis', 'MERSİS no (varsa)', ''],
  ['shippingNote', 'Kargo ücreti bilgisi', 'Örn. Türkiye geneli kargo ücretsizdir.', true],
]

export function Settings() {
  const [form, setForm] = useState<any>(null)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [slides, setSlides] = useState<EditableSlide[]>([])
  const [catRows, setCatRows] = useState<CategoryRow[]>([])
  const [products, setProducts] = useState<any[]>([])

  // Sunucudan gelen ayarı forma ve slayt/kategori düzenleyicilerine dağıtır.
  const applySettings = (settings: any) => {
    setForm(settings)
    setCategoryLabels(settings.categories)
    setSlides(heroSlidesFrom(settings).map((sl) => ({ ...sl, _uid: slideUid() })))
    setCatRows(categoryList(settings).map((label) => ({
      uid: categoryUid(),
      label,
      original: label,
      texts: { ...defaultTexts(label), ...(settings.categorySettings?.[categoryKey(label)] || {}) },
    })))
  }

  useEffect(() => {
    fetchSettings()
      .then(applySettings)
      .catch((err) => setLoadError(errorMessage(err, 'Ayarlar yüklenemedi.')))
    // Kategori ürün sayıları ve slayt → ürün bağlantısı için
    fetchProducts().then(setProducts).catch(() => {})
  }, [])

  const categoryCounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const p of products) out[categoryKey(p.category)] = (out[categoryKey(p.category)] || 0) + 1
    return out
  }, [products])
  const productOptions = useMemo(
    () => [...products].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)).map((p) => ({ id: Number(p.id), title: p.title })),
    [products]
  )

  const set = (key: string) => (value: any) => setForm((f: any) => ({ ...f, [key]: value }))
  const setCat = (key: string, field: string) => (value: any) =>
    setForm((f: any) => ({
      ...f,
      categorySettings: {
        ...f.categorySettings,
        [key]: { ...f.categorySettings[key], [field]: value },
      },
    }))

  const legalMissing = Boolean(form) && !(form.sellerName && form.sellerAddress && form.sellerTax)

  const handleSave = async () => {
    if (!form || saving) return
    // Kategori adları boş olamaz ve birbirinden farklı olmalı.
    const labels = catRows.map((r) => r.label.trim().replace(/\s+/g, ' '))
    if (labels.some((l) => !l)) return toast.error('Kategori adı boş bırakılamaz.')
    const keys = labels.map(categoryKey)
    if (keys.some((k) => k === 'tum')) return toast.error('"Tümü" kategori adı olarak kullanılamaz.')
    if (new Set(keys).size !== keys.length) return toast.error('İki kategorinin adı aynı olamaz.')
    if (!slides.length) return toast.error('En az bir slayt olmalı.')
    const renames = catRows
      .map((r, i) => ({ from: r.original, to: labels[i] }))
      .filter((r): r is { from: string; to: string } => Boolean(r.from) && r.from !== r.to)
    const payload = {
      ...form,
      categories: labels,
      categorySettings: {
        tum: form.categorySettings?.tum,
        ...Object.fromEntries(catRows.map((r, i) => [keys[i], r.texts])),
      },
      heroSlides: slides.map(({ _uid, ...sl }) => sl),
    }
    setSaving(true)
    try {
      applySettings(await saveSettings(payload, renames))
      if (renames.length) fetchProducts().then(setProducts).catch(() => {})
      toast.success('Site ayarları kaydedildi · sitede yaklaşık 30 sn içinde görünür')
    } catch (err) {
      toast.error(`Kaydedilemedi: ${errorMessage(err)}`)
    } finally {
      setSaving(false)
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
        <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Site Ayarları</h1>
            <p className='text-muted-foreground text-sm'>
              Ana sayfa metinleri, kategori kartları ve görünürlük ayarlarını buradan yönetin.
            </p>
          </div>
          <Button onClick={handleSave} disabled={!form || saving}>
            <Save className='size-4' /> {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>

        {!form ? (
          <p className={`py-10 text-center text-sm ${loadError ? 'text-destructive' : 'text-muted-foreground'}`}>
            {loadError || 'Yükleniyor…'}
          </p>
        ) : (

        <Tabs defaultValue='hero'>
          <TabsList className='w-full justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&>button]:flex-none'>
            <TabsTrigger value='hero'>Hero</TabsTrigger>
            <TabsTrigger value='koleksiyon'>Koleksiyon & Atölye</TabsTrigger>
            <TabsTrigger value='kategoriler'>Kategoriler</TabsTrigger>
            <TabsTrigger value='paketleme'>Paketleme & Hediye</TabsTrigger>
            <TabsTrigger value='sosyal'>Instagram & Footer</TabsTrigger>
            <TabsTrigger value='gorunurluk'>Görünürlük</TabsTrigger>
            <TabsTrigger value='yasal'>Yasal bilgiler{legalMissing ? ' •' : ''}</TabsTrigger>
          </TabsList>

          {/* ── HERO ── */}
          <TabsContent value='hero' className='mt-4 space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Ana sayfa slaytları</CardTitle>
                <CardDescription>
                  Sitenin en üstünde sırayla dönen görseller. Sürükleyerek sıralayın; odak noktasıyla telefonda görünen kısmı ayarlayın.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <HeroSlidesEditor slides={slides} onChange={setSlides} products={productOptions} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Butonlar ve duyuru</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2'>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-heroCta'>Birincil buton metni</Label>
                  <Input id='st-heroCta' value={form.heroCta} onChange={(e) => set('heroCta')(e.target.value)} />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-heroSecondCta'>İkincil buton metni</Label>
                  <Input id='st-heroSecondCta' value={form.heroSecondCta} onChange={(e) => set('heroSecondCta')(e.target.value)} />
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
            <Card>
              <CardHeader>
                <CardTitle>Kategoriler</CardTitle>
                <CardDescription>
                  Sürükleyerek sıralayın (sitedeki filtre sırası). Adını değiştirdiğiniz kategorideki ürünler kaydedince otomatik güncellenir.
                  İçinde ürün olan kategori silinemez. Satırdaki ok simgesiyle kategorinin koleksiyon sayfası metinlerini düzenleyebilirsiniz.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CategoryManager rows={catRows} onChange={setCatRows} counts={categoryCounts} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tüm koleksiyon sayfası</CardTitle>
                <CardDescription>Koleksiyon sayfasında "Tümü" seçiliyken görünen başlık alanı.</CardDescription>
              </CardHeader>
              <CardContent>
                <TextsEditor
                  texts={form.categorySettings?.tum || defaultTexts('Tümü')}
                  setText={(k) => (v) => setCat('tum', k)(v)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── YASAL BİLGİLER ── */}
          <TabsContent value='yasal' className='mt-4 space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Satıcı bilgileri</CardTitle>
                <CardDescription>
                  Mesafeli satış sözleşmesi, ön bilgilendirme formu, KVKK aydınlatma metni ve iade koşulları bu bilgilerle otomatik doldurulur
                  (sitede alt kısımdaki bağlantılar). Metinler genel şablondur; bir avukata kontrol ettirmeniz önerilir.
                </CardDescription>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2'>
                {legalMissing && (
                  <p className='rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:col-span-2 dark:bg-amber-900/30 dark:text-amber-200'>
                    Unvan, adres ve vergi bilgisi yasal olarak zorunludur. Boş alanlar sitede gösterilmez.
                  </p>
                )}
                {LEGAL_FIELDS.map(([key, label, placeholder, full]) => (
                  <div key={key} className={`grid gap-1.5 ${full ? 'sm:col-span-2' : ''}`}>
                    <Label htmlFor={`st-${key}`}>{label}</Label>
                    <Input id={`st-${key}`} value={form[key] || ''} onChange={(e) => set(key)(e.target.value)} placeholder={placeholder} />
                  </div>
                ))}
                <div className='grid gap-1.5'>
                  <Label htmlFor='st-returnDays'>Cayma (iade) süresi — gün</Label>
                  <Input id='st-returnDays' type='number' min={14} max={365} value={form.returnDays ?? 14} onChange={(e) => set('returnDays')(Number(e.target.value))} />
                  <p className='text-muted-foreground text-xs'>Yasal en az süre 14 gündür.</p>
                </div>
              </CardContent>
            </Card>
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
                <CardTitle>Ana sayfa bölümleri</CardTitle>
                <CardDescription>Açık olan bölümler ana sayfada aşağıdaki sırayla gösterilir.</CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                {VISIBILITY_SWITCHES.map(([key, label, desc]) => (
                  <div key={key} className='flex items-center justify-between gap-4 rounded-md border p-3'>
                    <div>
                      <p className='text-sm font-medium'>{label}</p>
                      <p className='text-muted-foreground text-xs'>{desc}</p>
                    </div>
                    <Switch checked={Boolean(form[key])} onCheckedChange={set(key)} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        )}
      </Main>
    </>
  )
}
