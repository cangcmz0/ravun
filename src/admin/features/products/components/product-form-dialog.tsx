import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Plus, Star, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  CATEGORIES,
  PRODUCT_STATUS,
  certificateNo as buildCertificateNo,
  compressImageFile,
} from '@/lib/ravun-data'
import { cn } from '@/lib/utils'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

/* Durum seçenekleri — value'lar bilerek PRODUCT_STATUS[key].label ile aynı
   tutuluyor. site/admin'deki normalizeProductStatus() anahtar kelime eşleşmesi
   yapıyor (örn. "arşiv" -> similar, "satıldı" -> sold); bu etiketler o eşleşmeyi
   doğru tetikleyecek şekilde seçildi, sakın rastgele metinle değiştirme. */
const STATUS_OPTIONS = (['available', 'single', 'draft', 'sold', 'similar'] as const).map(
  (key) => ({ key, label: PRODUCT_STATUS[key].label as string })
)
/* loadProducts() zaten normalize edilmiş anahtarı (örn. "similar") döndürür,
   ama <Select> seçenekleri etiket (örn. "Arşiv") değeriyle çalışıyor. İkisini
   birbirine çevirmezsek: bir ürünü düzenleyip durumu hiç değiştirmeden
   kaydetmek, form.status'u ham anahtar olarak geri gönderir — "similar" ise
   normalizeProductStatus onu bir daha "arşiv/archive" olarak tanımadığından
   bir sonraki yüklemede sessizce "Satışta"ya döner. */
function keyToStatusLabel(value?: string) {
  const found = STATUS_OPTIONS.find((s) => s.key === value)
  return found ? found.label : value || ''
}

type ColorRow = { hex: string; name: string }

function toColorRows(colors?: string[], names?: string[]): ColorRow[] {
  const c = Array.isArray(colors) && colors.length ? colors : ['#1a6b4a']
  const n = Array.isArray(names) && names.length ? names : ['Zümrüt']
  return c.map((hex, i) => ({ hex, name: n[i] || '' }))
}

function emptyForm(nextId: number, nextSortOrder: number) {
  return {
    id: nextId,
    title: '',
    category: CATEGORIES[1],
    tag: 'ATÖLYE',
    price: 0,
    status: '',
    stock: 'Sipariş üzerine',
    delivery: '2–3 hafta',
    dimensions: '',
    weight: '',
    materials: [] as string[],
    sizes: ['Standart'] as string[],
    colorRows: [{ hex: '#1a6b4a', name: 'Zümrüt' }] as ColorRow[],
    gallery: [] as string[],
    desc: '',
    longDesc: '',
    story: '',
    craftTime: '',
    finish: 'Doğal yağ bitiş',
    repeatable: 'Aynı desen tekrarlanmaz',
    certificateNo: '',
    materialNote: '',
    careSummary: '',
    careTips: [] as string[],
    packageNote: '',
    visible: true,
    homeVisible: false,
    featured: false,
    giftEligible: true,
    sortOrder: nextSortOrder,
  }
}

type ProductFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: any | null // null = yeni ürün
  nextId: number
  nextSortOrder: number
  onSave: (product: any) => void
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  nextId,
  nextSortOrder,
  onSave,
}: ProductFormDialogProps) {
  const [form, setForm] = useState(() => emptyForm(nextId, nextSortOrder))
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const isEdit = Boolean(product)

  useEffect(() => {
    if (!open) return
    if (product) {
      setForm({
        id: product.id,
        title: product.title || '',
        category: product.category || CATEGORIES[1],
        tag: product.tag || 'ATÖLYE',
        price: Number(product.price) || 0,
        status: keyToStatusLabel(product.status),
        stock: product.stock || 'Sipariş üzerine',
        delivery: product.delivery || '2–3 hafta',
        dimensions: product.dimensions || '',
        weight: product.weight || '',
        materials: Array.isArray(product.materials) ? product.materials : [],
        sizes: Array.isArray(product.sizes) && product.sizes.length ? product.sizes : ['Standart'],
        colorRows: toColorRows(product.colors, product.colorNames),
        gallery: Array.isArray(product.gallery) && product.gallery.length ? product.gallery : (product.image ? [product.image] : []),
        desc: product.desc || '',
        longDesc: product.longDesc || '',
        story: product.story || '',
        craftTime: product.craftTime || '',
        finish: product.finish || 'Doğal yağ bitiş',
        repeatable: product.repeatable || 'Aynı desen tekrarlanmaz',
        certificateNo: product.certificateNo || '',
        materialNote: product.materialNote || '',
        careSummary: product.careSummary || '',
        careTips: Array.isArray(product.careTips) ? product.careTips : [],
        packageNote: product.packageNote || '',
        visible: product.visible !== false,
        homeVisible: Boolean(product.homeVisible),
        featured: Boolean(product.featured),
        giftEligible: product.giftEligible !== false,
        sortOrder: Number(product.sortOrder) || nextSortOrder,
      })
    } else {
      setForm(emptyForm(nextId, nextSortOrder))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product])

  const set = <K extends string>(key: K) => (value: any) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return
    setUploading(true)
    try {
      const compressed: string[] = []
      for (const file of Array.from(files).slice(0, 12)) {
        if (!file.type.startsWith('image/')) continue
        try {
          compressed.push(await compressImageFile(file))
        } catch {
          toast.error(`${file.name} işlenemedi, atlandı.`)
        }
      }
      if (compressed.length) {
        setForm((f) => ({ ...f, gallery: [...f.gallery, ...compressed] }))
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeImage = (idx: number) =>
    setForm((f) => ({ ...f, gallery: f.gallery.filter((_, i) => i !== idx) }))
  const makeCover = (idx: number) =>
    setForm((f) => {
      const g = [...f.gallery]
      const [img] = g.splice(idx, 1)
      g.unshift(img)
      return { ...f, gallery: g }
    })
  const moveImage = (idx: number, dir: -1 | 1) =>
    setForm((f) => {
      const g = [...f.gallery]
      const j = idx + dir
      if (j < 0 || j >= g.length) return f
      ;[g[idx], g[j]] = [g[j], g[idx]]
      return { ...f, gallery: g }
    })

  const setColorRow = (idx: number, patch: Partial<ColorRow>) =>
    setForm((f) => ({
      ...f,
      colorRows: f.colorRows.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    }))
  const addColorRow = () =>
    setForm((f) => ({ ...f, colorRows: [...f.colorRows, { hex: '#1a6b4a', name: '' }] }))
  const removeColorRow = (idx: number) =>
    setForm((f) => ({ ...f, colorRows: f.colorRows.filter((_, i) => i !== idx) }))

  const handleSubmit = () => {
    const title = form.title.trim()
    if (!title) {
      toast.error('Ürün adı zorunlu.')
      return
    }
    if (!form.gallery.length) {
      toast.error('En az bir görsel ekleyin.')
      return
    }
    const cleanColors = form.colorRows.filter((r) => r.hex)
    const materials = form.materials.filter(Boolean)
    const sizes = form.sizes.filter(Boolean)
    const careTips = form.careTips.filter(Boolean)
    const finalProduct = {
      ...(product || {}),
      id: form.id,
      title,
      category: form.category,
      tag: form.tag.trim() || 'ATÖLYE',
      price: Number(form.price) || 0,
      status: form.status,
      stock: form.stock.trim(),
      delivery: form.delivery.trim(),
      dimensions: form.dimensions.trim(),
      weight: form.weight.trim(),
      materials,
      sizes: sizes.length ? sizes : ['Standart'],
      colors: cleanColors.length ? cleanColors.map((r) => r.hex) : ['#1a6b4a'],
      colorNames: cleanColors.length ? cleanColors.map((r) => r.name || '') : ['Zümrüt'],
      gallery: form.gallery,
      image: form.gallery[0],
      desc: form.desc.trim(),
      longDesc: form.longDesc.trim() || form.desc.trim(),
      story: form.story.trim(),
      craftTime: form.craftTime.trim(),
      finish: form.finish.trim(),
      repeatable: form.repeatable.trim(),
      certificateNo: form.certificateNo.trim() || buildCertificateNo({ id: form.id }),
      materialNote: form.materialNote.trim(),
      careSummary: form.careSummary.trim(),
      careTips,
      packageNote: form.packageNote.trim(),
      visible: form.visible,
      homeVisible: form.homeVisible,
      featured: form.featured,
      giftEligible: form.giftEligible,
      sortOrder: form.sortOrder,
    }
    onSave(finalProduct)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[90vh] flex-col sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Ürünü Düzenle' : 'Yeni Ürün'}</DialogTitle>
          <DialogDescription>
            {isEdit ? `${form.title || 'Ürün'} bilgilerini güncelle.` : 'Yeni bir atölye parçası ekle.'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue='temel' className='flex-1 overflow-hidden'>
          <TabsList className='w-full flex-wrap justify-start'>
            <TabsTrigger value='temel'>Temel</TabsTrigger>
            <TabsTrigger value='secenekler'>Seçenekler</TabsTrigger>
            <TabsTrigger value='gorseller'>
              Görseller {form.gallery.length > 0 && `(${form.gallery.length})`}
            </TabsTrigger>
            <TabsTrigger value='detay'>Açıklama & Bakım</TabsTrigger>
            <TabsTrigger value='gorunurluk'>Görünürlük</TabsTrigger>
          </TabsList>

          <div className='mt-4 max-h-[55vh] overflow-y-auto pe-1'>
            <TabsContent value='temel' className='mt-0 space-y-4'>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='grid gap-1.5 sm:col-span-2'>
                  <Label htmlFor='pf-title'>Ürün adı *</Label>
                  <Input id='pf-title' value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder='Örn. Yeşim Raf' />
                </div>
                <div className='grid gap-1.5'>
                  <Label>Kategori</Label>
                  <Select value={form.category} onValueChange={set('category')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.slice(1).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='grid gap-1.5'>
                  <Label>Durum</Label>
                  <Select value={form.status} onValueChange={set('status')}>
                    <SelectTrigger><SelectValue placeholder='Satışta (varsayılan)' /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.key} value={s.label}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='pf-price'>Fiyat (TL)</Label>
                  <Input id='pf-price' type='number' min={0} value={form.price} onChange={(e) => set('price')(e.target.value)} />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='pf-tag'>Etiket</Label>
                  <Input id='pf-tag' value={form.tag} onChange={(e) => set('tag')(e.target.value)} placeholder='ATÖLYE' />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='pf-stock'>Stok notu</Label>
                  <Input id='pf-stock' value={form.stock} onChange={(e) => set('stock')(e.target.value)} placeholder='Sipariş üzerine' />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='pf-delivery'>Teslim süresi</Label>
                  <Input id='pf-delivery' value={form.delivery} onChange={(e) => set('delivery')(e.target.value)} placeholder='2–3 hafta' />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='pf-dimensions'>Ölçü</Label>
                  <Input id='pf-dimensions' value={form.dimensions} onChange={(e) => set('dimensions')(e.target.value)} placeholder='40 x 20 x 4 cm' />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='pf-weight'>Ağırlık</Label>
                  <Input id='pf-weight' value={form.weight} onChange={(e) => set('weight')(e.target.value)} placeholder='1.2 kg' />
                </div>
                <div className='grid gap-1.5 sm:col-span-2'>
                  <Label htmlFor='pf-materials'>Malzemeler <span className='text-muted-foreground'>(her satıra bir tane)</span></Label>
                  <Textarea id='pf-materials' rows={3} value={form.materials.join('\n')} onChange={(e) => set('materials')(e.target.value.split('\n'))} placeholder={'Ceviz ahşap\nEpoksi reçine'} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value='secenekler' className='mt-0 space-y-5'>
              <div className='grid gap-1.5'>
                <Label htmlFor='pf-sizes'>Boyut seçenekleri <span className='text-muted-foreground'>(virgülle ayır)</span></Label>
                <Input id='pf-sizes' value={form.sizes.join(', ')} onChange={(e) => set('sizes')(e.target.value.split(',').map((s) => s.trim()))} placeholder='Standart, Büyük' />
              </div>
              <div className='space-y-2'>
                <Label>Renk seçenekleri</Label>
                <div className='space-y-2'>
                  {form.colorRows.map((row, i) => (
                    <div key={i} className='flex items-center gap-2'>
                      <input
                        type='color'
                        value={row.hex}
                        onChange={(e) => setColorRow(i, { hex: e.target.value })}
                        className='h-9 w-10 shrink-0 cursor-pointer rounded-md border'
                        aria-label='Renk seç'
                      />
                      <Input value={row.name} onChange={(e) => setColorRow(i, { name: e.target.value })} placeholder='Renk adı (ör. Zümrüt)' />
                      <Button type='button' variant='ghost' size='icon' onClick={() => removeColorRow(i)} disabled={form.colorRows.length <= 1} aria-label='Rengi sil'>
                        <Trash2 className='size-4' />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type='button' variant='outline' size='sm' onClick={addColorRow}>
                  <Plus className='size-4' /> Renk ekle
                </Button>
              </div>
            </TabsContent>

            <TabsContent value='gorseller' className='mt-0 space-y-3'>
              <input
                ref={fileInputRef}
                type='file'
                accept='image/*'
                multiple
                className='hidden'
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button type='button' variant='outline' onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <ImagePlus className='size-4' /> {uploading ? 'Yükleniyor…' : 'Görsel ekle'}
              </Button>
              <p className='text-xs text-muted-foreground'>
                İlk görsel kapak fotoğrafı olarak kullanılır. Yüklenen görseller otomatik sıkıştırılır.
              </p>
              {form.gallery.length === 0 ? (
                <div className='rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground'>
                  Henüz görsel eklenmedi.
                </div>
              ) : (
                <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                  {form.gallery.map((src, i) => (
                    <div key={i} className={cn('group relative overflow-hidden rounded-md border', i === 0 && 'ring-2 ring-primary')}>
                      <img src={src} alt={`Görsel ${i + 1}`} className='aspect-square w-full object-cover' />
                      {i === 0 && (
                        <span className='absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground'>Kapak</span>
                      )}
                      <div className='absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 p-1'>
                        <button type='button' onClick={() => moveImage(i, -1)} disabled={i === 0} className='rounded px-1 text-xs text-white disabled:opacity-30' aria-label='Sola taşı'>‹</button>
                        {i !== 0 && (
                          <button type='button' onClick={() => makeCover(i)} className='rounded p-0.5 text-white' aria-label='Kapak yap' title='Kapak yap'>
                            <Star className='size-3.5' />
                          </button>
                        )}
                        <button type='button' onClick={() => moveImage(i, 1)} disabled={i === form.gallery.length - 1} className='rounded px-1 text-xs text-white disabled:opacity-30' aria-label='Sağa taşı'>›</button>
                        <button type='button' onClick={() => removeImage(i)} className='rounded p-0.5 text-white' aria-label='Görseli sil' title='Sil'>
                          <X className='size-3.5' />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value='detay' className='mt-0 space-y-4'>
              <div className='grid gap-1.5'>
                <Label htmlFor='pf-desc'>Kısa açıklama</Label>
                <Textarea id='pf-desc' rows={2} value={form.desc} onChange={(e) => set('desc')(e.target.value)} placeholder='Ürün kartlarında görünen kısa açıklama' />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='pf-longDesc'>Uzun açıklama</Label>
                <Textarea id='pf-longDesc' rows={3} value={form.longDesc} onChange={(e) => set('longDesc')(e.target.value)} placeholder='Ürün detay sayfasındaki açıklama' />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='pf-story'>Hikaye</Label>
                <Textarea id='pf-story' rows={3} value={form.story} onChange={(e) => set('story')(e.target.value)} placeholder='Bu parçanın hikayesi bölümünde görünür' />
              </div>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='grid gap-1.5'>
                  <Label htmlFor='pf-craftTime'>Üretim süresi</Label>
                  <Input id='pf-craftTime' value={form.craftTime} onChange={(e) => set('craftTime')(e.target.value)} placeholder='7-10 gün' />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='pf-finish'>Yüzey bitişi</Label>
                  <Input id='pf-finish' value={form.finish} onChange={(e) => set('finish')(e.target.value)} />
                </div>
                <div className='grid gap-1.5 sm:col-span-2'>
                  <Label htmlFor='pf-repeatable'>Tekrar durumu</Label>
                  <Input id='pf-repeatable' value={form.repeatable} onChange={(e) => set('repeatable')(e.target.value)} placeholder='Aynı desen tekrarlanmaz' />
                </div>
                <div className='grid gap-1.5 sm:col-span-2'>
                  <Label htmlFor='pf-certNo'>Sertifika no <span className='text-muted-foreground'>(boş bırakılırsa otomatik)</span></Label>
                  <Input id='pf-certNo' value={form.certificateNo} onChange={(e) => set('certificateNo')(e.target.value)} placeholder={`RVN-${String(form.id).padStart(3, '0')}`} />
                </div>
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='pf-materialNote'>Malzeme notu</Label>
                <Textarea id='pf-materialNote' rows={2} value={form.materialNote} onChange={(e) => set('materialNote')(e.target.value)} />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='pf-careSummary'>Bakım özeti</Label>
                <Textarea id='pf-careSummary' rows={2} value={form.careSummary} onChange={(e) => set('careSummary')(e.target.value)} />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='pf-careTips'>Bakım önerileri <span className='text-muted-foreground'>(her satıra bir tane)</span></Label>
                <Textarea id='pf-careTips' rows={3} value={form.careTips.join('\n')} onChange={(e) => set('careTips')(e.target.value.split('\n'))} />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='pf-packageNote'>Paketleme notu</Label>
                <Textarea id='pf-packageNote' rows={2} value={form.packageNote} onChange={(e) => set('packageNote')(e.target.value)} />
              </div>
            </TabsContent>

            <TabsContent value='gorunurluk' className='mt-0 space-y-4'>
              <div className='flex items-center justify-between rounded-md border p-3'>
                <div>
                  <p className='text-sm font-medium'>Sitede görünür</p>
                  <p className='text-xs text-muted-foreground'>Kapalıysa ürün koleksiyonda ve aramada görünmez.</p>
                </div>
                <Switch checked={form.visible} onCheckedChange={set('visible')} />
              </div>
              <div className='flex items-center justify-between rounded-md border p-3'>
                <div>
                  <p className='text-sm font-medium'>Ana sayfada göster</p>
                  <p className='text-xs text-muted-foreground'>Ana sayfadaki öne çıkan ürünler bölümünde görünür.</p>
                </div>
                <Switch checked={form.homeVisible} onCheckedChange={set('homeVisible')} />
              </div>
              <div className='flex items-center justify-between rounded-md border p-3'>
                <div>
                  <p className='text-sm font-medium'>Öne çıkan</p>
                  <p className='text-xs text-muted-foreground'>Koleksiyon sıralamasında öne alınır.</p>
                </div>
                <Switch checked={form.featured} onCheckedChange={set('featured')} />
              </div>
              <div className='flex items-center justify-between rounded-md border p-3'>
                <div>
                  <p className='text-sm font-medium'>Hediye paketine uygun</p>
                  <p className='text-xs text-muted-foreground'>Ürün detayında hediye paketi seçeneği gösterilir.</p>
                </div>
                <Switch checked={form.giftEligible} onCheckedChange={set('giftEligible')} />
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>Vazgeç</Button>
          <Button type='button' onClick={handleSubmit}>{isEdit ? 'Kaydet' : 'Ürünü Ekle'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
