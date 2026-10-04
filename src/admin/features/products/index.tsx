import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy, ExternalLink, Eye, EyeOff, GripVertical, ImageOff, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  PRODUCT_STATUS,
  categoryKey,
  categoryList,
  money,
  normalizeProductStatus,
  setCategoryLabels,
} from '@/lib/ravun-data'
import { errorMessage, fetchProducts, fetchSettings, saveProducts } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfigDrawer } from '@/components/config-drawer'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ThemeSwitch } from '@/components/theme-switch'
import { ProductFormDialog } from './components/product-form-dialog'

/* eslint-disable @typescript-eslint/no-explicit-any */

const TONE_CLASS: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  single: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  sold: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
}

export function Products() {
  const [products, setProducts] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('Tümü')
  const [selected, setSelected] = useState<number[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [duplicateOf, setDuplicateOf] = useState<any>(null)
  const [categories, setCategories] = useState<string[]>(() => categoryList(null))
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    // Kategori listesi Site ayarları → Kategoriler'den gelir. Ürünler etiketleri
    // bu listeye göre gösterdiği için önce ayar, sonra ürünler yüklenir.
    fetchSettings()
      .then((st: any) => { setCategoryLabels(st.categories); setCategories(categoryList(st)) })
      .catch(() => {})
      .then(() => fetchProducts())
      .then((list) => setProducts(list || []))
      .catch((err) => setLoadError(errorMessage(err, 'Ürünler yüklenemedi.')))
      .finally(() => setLoaded(true))
  }, [])

  // Değişiklik ekranda hemen görünür, ardından sunucuya kaydedilir; kayıt
  // başarısız olursa önceki hale geri dönülür.
  const persist = async (next: any[]) => {
    const prev = products
    setProducts(next)
    try {
      setProducts(await saveProducts(next))
      return true
    } catch (err) {
      setProducts(prev)
      toast.error(`Kaydedilemedi: ${errorMessage(err)}`)
      return false
    }
  }

  const sorted = useMemo(
    () => [...products].sort((a, b) => (Number(a.sortOrder) || Number(a.id) || 0) - (Number(b.sortOrder) || Number(b.id) || 0)),
    [products]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    return sorted
      .filter((p) => categoryFilter === 'Tümü' || categoryKey(p.category) === categoryKey(categoryFilter))
      .filter((p) => !q || p.title?.toLocaleLowerCase('tr-TR').includes(q) || String(p.certificateNo || '').toLocaleLowerCase('tr-TR').includes(q))
  }, [sorted, query, categoryFilter])

  const nextId = products.length ? Math.max(...products.map((p) => Number(p.id) || 0)) + 1 : 1
  const nextSortOrder = products.length ? Math.max(...products.map((p) => Number(p.sortOrder) || 0)) + 10 : 10

  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selected.includes(p.id))
  const toggleSelectAll = () => {
    if (allVisibleSelected) setSelected((s) => s.filter((id) => !filtered.some((p) => p.id === id)))
    else setSelected((s) => [...new Set([...s, ...filtered.map((p) => p.id)])])
  }
  const toggleSelect = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const openAdd = () => { setEditing(null); setDuplicateOf(null); setDialogOpen(true) }
  const openEdit = (p: any) => { setEditing(p); setDuplicateOf(null); setDialogOpen(true) }
  // Kopya formda açılır; kaydedilene kadar hiçbir şey değişmez. Kopya gizli başlar.
  const openDuplicate = (p: any) => { setEditing(null); setDuplicateOf(p); setDialogOpen(true) }
  // Ürünün sitedeki sayfası (yalnızca görünür ürünler sitede açılır)
  const siteUrl = (p: any) => `${window.location.origin}/urun/${p.id}`

  const handleSave = async (payload: any) => {
    const isEdit = products.some((p) => p.id === payload.id)
    const next = isEdit ? products.map((p) => (p.id === payload.id ? payload : p)) : [...products, payload]
    const ok = await persist(next)
    if (ok) {
      toast.success(isEdit ? `${payload.title} güncellendi` : duplicateOf ? `${payload.title} kopyalandı (gizli)` : `${payload.title} eklendi`)
      setEditing(null)
      setDuplicateOf(null)
    }
    return ok
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    if (!(await persist(products.filter((p) => p.id !== target.id)))) return
    toast.success(`${target.title} silindi`)
    setSelected((s) => s.filter((id) => id !== target.id))
  }

  const handleBulkDelete = async () => {
    setBulkDeleteOpen(false)
    if (!(await persist(products.filter((p) => !selected.includes(p.id))))) return
    toast.success(`${selected.length} ürün silindi`)
    setSelected([])
  }

  const handleBulkVisibility = async (visible: boolean) => {
    if (!(await persist(products.map((p) => (selected.includes(p.id) ? { ...p, visible } : p))))) return
    toast.success(visible ? 'Seçilenler görünür yapıldı' : 'Seçilenler gizlendi')
  }

  const toggleVisible = (p: any) => persist(products.map((x) => (x.id === p.id ? { ...x, visible: !x.visible } : x)))
  const toggleHome = (p: any) => persist(products.map((x) => (x.id === p.id ? { ...x, homeVisible: !x.homeVisible } : x)))

  // ── Sürükle-bırak sıralama ──
  // Filtre açıkken listenin bir kısmı gizli olduğundan sıralama yalnızca tüm
  // ürünler görünürken yapılır. Bırakınca sıra 10, 20, 30… olarak yeniden yazılır.
  const canReorder = !query.trim() && categoryFilter === 'Tümü'
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!canReorder || !over || active.id === over.id) return
    const from = sorted.findIndex((x) => x.id === active.id)
    const to = sorted.findIndex((x) => x.id === over.id)
    if (from < 0 || to < 0) return
    const order = new Map(arrayMove(sorted, from, to).map((x, i) => [x.id, (i + 1) * 10]))
    if (await persist(products.map((x) => ({ ...x, sortOrder: order.get(x.id) ?? x.sortOrder })))) {
      toast.success('Sıralama kaydedildi')
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
            <h1 className='text-2xl font-bold tracking-tight'>Ürünler</h1>
            <p className='text-muted-foreground text-sm'>{products.length} ürün · değişiklikler sitede yaklaşık 30 sn içinde görünür</p>
          </div>
          <Button onClick={openAdd}><Plus className='me-1 size-4' /> Yeni Ürün</Button>
        </div>

        <div className='mb-4 flex flex-wrap items-center gap-2'>
          <div className='relative w-full max-w-xs'>
            <Search className='text-muted-foreground absolute start-2.5 top-2.5 size-4' />
            <Input placeholder='Ürün veya parça no ara…' value={query} onChange={(e) => setQuery(e.target.value)} className='ps-8' />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className='w-48'><SelectValue /></SelectTrigger>
            <SelectContent>
              {['Tümü', ...categories].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          {selected.length > 0 && (
            <div className='ms-auto flex items-center gap-2'>
              <span className='text-muted-foreground text-sm'>{selected.length} seçili</span>
              <Button variant='outline' size='sm' onClick={() => handleBulkVisibility(true)}><Eye className='me-1 size-4' />Görünür yap</Button>
              <Button variant='outline' size='sm' onClick={() => handleBulkVisibility(false)}><EyeOff className='me-1 size-4' />Gizle</Button>
              <Button variant='destructive' size='sm' onClick={() => setBulkDeleteOpen(true)}><Trash2 className='me-1 size-4' />Sil</Button>
            </div>
          )}
        </div>

        <p className='text-muted-foreground mb-3 text-xs'>
          {canReorder
            ? 'Sıralamayı değiştirmek için ürünü soldaki tutamaçtan (⋮⋮) tutup sürükleyin; sitedeki sıra da değişir.'
            : 'Sıralamayı değiştirmek için arama ve kategori filtresini kaldırın.'}
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={filtered.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        {/* ── Mobil: kart listesi ── */}
        <div className='grid gap-3 md:hidden'>
          {!loaded ? (
            <p className='text-muted-foreground py-10 text-center text-sm'>Yükleniyor…</p>
          ) : loadError ? (
            <p className='text-destructive py-10 text-center text-sm'>{loadError}</p>
          ) : filtered.length === 0 ? (
            <p className='text-muted-foreground py-10 text-center text-sm'>Ürün bulunamadı.</p>
          ) : filtered.map((p, i) => {
            const meta = PRODUCT_STATUS[normalizeProductStatus(p.status, p)]
            return (
              <SortableItem key={p.id} id={p.id} disabled={!canReorder} className={`rounded-lg border bg-card p-3 ${selected.includes(p.id) ? 'ring-2 ring-primary' : ''}`}>
                {(handle) => (<>
                <div className='flex gap-3'>
                  <DragHandle handle={handle} disabled={!canReorder} className='-ms-1 self-center' />
                  {p.image ? (
                    <img src={p.image} alt={p.title} className='size-16 shrink-0 rounded-md border object-cover' />
                  ) : (
                    <div className='bg-muted flex size-16 shrink-0 items-center justify-center rounded-md border'><ImageOff className='text-muted-foreground size-5' /></div>
                  )}
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-start justify-between gap-2'>
                      <div className='min-w-0'>
                        <p className='truncate font-medium'>{p.title}</p>
                        <p className='text-muted-foreground text-xs'>{p.certificateNo} · {p.category}</p>
                      </div>
                      <Checkbox checked={selected.includes(p.id)} onCheckedChange={() => toggleSelect(p.id)} aria-label={`${p.title} seç`} />
                    </div>
                    <div className='mt-1 flex flex-wrap items-center gap-2'>
                      <span className='font-semibold'>{money(p.price)}</span>
                      <Badge variant='secondary' className={TONE_CLASS[meta.tone] || TONE_CLASS.available}>{meta.label}</Badge>
                      {p.archiveVisible && <Badge variant='outline'>Arşiv</Badge>}
                    </div>
                  </div>
                </div>
                <div className='mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3'>
                  <div className='flex items-center gap-4 text-sm'>
                    <label className='flex items-center gap-2'><Switch checked={p.visible !== false} onCheckedChange={() => toggleVisible(p)} aria-label='Sitede görünür' />Görünür</label>
                    <label className='flex items-center gap-2'><Switch checked={!!p.homeVisible} onCheckedChange={() => toggleHome(p)} aria-label='Ana sayfada göster' />Ana sayfa</label>
                  </div>
                  <div className='flex items-center gap-1'>
                    <SiteLink p={p} url={siteUrl(p)} />
                    <Button variant='ghost' size='icon' onClick={() => openDuplicate(p)} aria-label='Kopyala' title='Kopyasını oluştur'><Copy className='size-4' /></Button>
                    <Button variant='ghost' size='icon' onClick={() => openEdit(p)} aria-label='Düzenle'><Pencil className='size-4' /></Button>
                    <Button variant='ghost' size='icon' onClick={() => setDeleteTarget(p)} aria-label='Sil'><Trash2 className='text-destructive size-4' /></Button>
                  </div>
                </div>
                </>)}
              </SortableItem>
            )
          })}
        </div>

        {/* ── Masaüstü: tablo ── */}
        <div className='hidden overflow-x-auto rounded-md border md:block'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-8' aria-label='Sırala' />
                <TableHead className='w-10'>
                  <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} aria-label='Tümünü seç' />
                </TableHead>
                <TableHead>Ürün</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Fiyat</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className='text-center'>Görünür</TableHead>
                <TableHead className='text-center'>Ana Sayfa</TableHead>

                <TableHead className='text-end'>İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loaded ? (
                <TableRow><TableCell colSpan={9} className='text-muted-foreground py-10 text-center'>Yükleniyor…</TableCell></TableRow>
              ) : loadError ? (
                <TableRow><TableCell colSpan={9} className='text-destructive py-10 text-center'>{loadError}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className='text-muted-foreground py-10 text-center'>Ürün bulunamadı.</TableCell></TableRow>
              ) : filtered.map((p, i) => {
                const key = normalizeProductStatus(p.status, p)
                const meta = PRODUCT_STATUS[key]
                return (
                  <SortableItem as='tr' key={p.id} id={p.id} disabled={!canReorder} className='hover:bg-muted/50 border-b transition-colors data-[state=selected]:bg-muted' dataState={selected.includes(p.id) ? 'selected' : undefined}>
                    {(handle) => (<>
                    <TableCell className='w-8 pe-0'><DragHandle handle={handle} disabled={!canReorder} /></TableCell>
                    <TableCell><Checkbox checked={selected.includes(p.id)} onCheckedChange={() => toggleSelect(p.id)} aria-label={`${p.title} seç`} /></TableCell>
                    <TableCell>
                      <div className='flex items-center gap-3'>
                        {p.image ? (
                          <img src={p.image} alt={p.title} className='size-10 rounded-md border object-cover' />
                        ) : (
                          <div className='bg-muted flex size-10 items-center justify-center rounded-md border'><ImageOff className='text-muted-foreground size-4' /></div>
                        )}
                        <div>
                          <div className='font-medium'>{p.title}</div>
                          <div className='text-muted-foreground text-xs'>{p.certificateNo}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{p.category}</TableCell>
                    <TableCell>{money(p.price)}</TableCell>
                    <TableCell>
                      <Badge variant='secondary' className={TONE_CLASS[meta.tone] || TONE_CLASS.available}>{meta.label}</Badge>
                      {p.archiveVisible && <Badge variant='outline' className='ms-1'>Arşiv</Badge>}
                    </TableCell>
                    <TableCell className='text-center'><Switch checked={p.visible !== false} onCheckedChange={() => toggleVisible(p)} aria-label='Sitede görünür' /></TableCell>
                    <TableCell className='text-center'><Switch checked={!!p.homeVisible} onCheckedChange={() => toggleHome(p)} aria-label='Ana sayfada göster' /></TableCell>
                    <TableCell className='text-end'>
                      <div className='flex items-center justify-end gap-0.5'>
                        <SiteLink p={p} url={siteUrl(p)} />
                        <Button variant='ghost' size='icon' onClick={() => openDuplicate(p)} aria-label='Kopyala' title='Kopyasını oluştur'><Copy className='size-4' /></Button>
                        <Button variant='ghost' size='icon' onClick={() => openEdit(p)} aria-label='Düzenle'><Pencil className='size-4' /></Button>
                        <Button variant='ghost' size='icon' onClick={() => setDeleteTarget(p)} aria-label='Sil'><Trash2 className='text-destructive size-4' /></Button>
                      </div>
                    </TableCell>
                    </>)}
                  </SortableItem>
                )
              })}
            </TableBody>
          </Table>
        </div>
        </SortableContext>
        </DndContext>
      </Main>

      <ProductFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editing}
        duplicateOf={duplicateOf}
        categories={categories}
        nextId={nextId}
        nextSortOrder={nextSortOrder}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title='Ürünü sil'
        desc={`"${deleteTarget?.title}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`}
        destructive
        confirmText='Sil'
        cancelBtnText='Vazgeç'
        handleConfirm={handleDelete}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title='Seçilen ürünleri sil'
        desc={`${selected.length} ürün kalıcı olarak silinecek. Bu işlem geri alınamaz.`}
        destructive
        confirmText='Sil'
        cancelBtnText='Vazgeç'
        handleConfirm={handleBulkDelete}
      />
    </>
  )
}

// Sürüklenebilir satır/kart sarmalayıcı: tutamaç özelliklerini (handle) çocuğa verir.
function SortableItem({ id, disabled, className, as = 'div', dataState, children }: {
  id: number
  disabled?: boolean
  className?: string
  as?: 'div' | 'tr'
  dataState?: string
  children: (handle: Record<string, any>) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 20 : undefined,
    boxShadow: isDragging ? '0 12px 30px rgba(0,0,0,.18)' : undefined,
    background: isDragging ? 'var(--card)' : undefined,
  }
  const Tag = as as any
  return (
    <Tag ref={setNodeRef} style={style} className={className} data-state={dataState}>
      {children({ ...attributes, ...listeners })}
    </Tag>
  )
}

function DragHandle({ handle, disabled, className = '' }: { handle: Record<string, any>; disabled?: boolean; className?: string }) {
  return (
    <button
      type='button'
      {...handle}
      disabled={disabled}
      aria-label='Sıralamak için sürükleyin'
      title={disabled ? 'Sıralamak için filtreyi kaldırın' : 'Sıralamak için sürükleyin'}
      className={`text-muted-foreground hover:bg-muted grid size-8 shrink-0 place-items-center rounded-md touch-none ${disabled ? 'cursor-not-allowed opacity-30' : 'cursor-grab active:cursor-grabbing'} ${className}`}
    >
      <GripVertical className='size-4' />
    </button>
  )
}

// "Sitede gör": gizli ürünler sitede açılmadığı için pasif gösterilir.
function SiteLink({ p, url }: { p: any; url: string }) {
  if (p.visible === false) {
    return (
      <Button variant='ghost' size='icon' disabled aria-label='Sitede gör' title='Gizli ürün sitede görünmez'>
        <ExternalLink className='size-4' />
      </Button>
    )
  }
  return (
    <Button variant='ghost' size='icon' asChild>
      <a href={url} target='_blank' rel='noreferrer' aria-label='Sitede gör' title='Sitede gör'><ExternalLink className='size-4' /></a>
    </Button>
  )
}
