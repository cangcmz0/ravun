import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, ImageOff, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import {
  CATEGORIES,
  PRODUCT_STATUS,
  loadProducts,
  money,
  normalizeProductStatus,
  saveProducts,
} from '@/lib/ravun-data'
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
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  useEffect(() => {
    setProducts(loadProducts())
    setLoaded(true)
  }, [])

  const persist = (next: any[]) => {
    setProducts(next)
    const ok = saveProducts(next)
    if (!ok) {
      toast.error('Kaydedilemedi: depolama alanı doldu. Bazı ürünlerdeki görselleri azaltıp tekrar deneyin.')
    }
    return ok
  }

  const sorted = useMemo(
    () => [...products].sort((a, b) => (Number(a.sortOrder) || Number(a.id) || 0) - (Number(b.sortOrder) || Number(b.id) || 0)),
    [products]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    return sorted
      .filter((p) => categoryFilter === 'Tümü' || p.category === categoryFilter)
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

  const openAdd = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (p: any) => { setEditing(p); setDialogOpen(true) }

  const handleSave = (payload: any) => {
    const isEdit = products.some((p) => p.id === payload.id)
    const next = isEdit ? products.map((p) => (p.id === payload.id ? payload : p)) : [...products, payload]
    const ok = persist(next)
    if (ok) {
      toast.success(isEdit ? `${payload.title} güncellendi` : `${payload.title} eklendi`)
      setEditing(null)
    }
    return ok
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    persist(products.filter((p) => p.id !== deleteTarget.id))
    toast.success(`${deleteTarget.title} silindi`)
    setSelected((s) => s.filter((id) => id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  const handleBulkDelete = () => {
    persist(products.filter((p) => !selected.includes(p.id)))
    toast.success(`${selected.length} ürün silindi`)
    setSelected([])
    setBulkDeleteOpen(false)
  }

  const handleBulkVisibility = (visible: boolean) => {
    persist(products.map((p) => (selected.includes(p.id) ? { ...p, visible } : p)))
    toast.success(visible ? 'Seçilenler görünür yapıldı' : 'Seçilenler gizlendi')
  }

  const toggleVisible = (p: any) => persist(products.map((x) => (x.id === p.id ? { ...x, visible: !x.visible } : x)))
  const toggleHome = (p: any) => persist(products.map((x) => (x.id === p.id ? { ...x, homeVisible: !x.homeVisible } : x)))

  const moveSort = (p: any, dir: -1 | 1) => {
    const idx = sorted.findIndex((x) => x.id === p.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const a = sorted[idx]
    const b = sorted[swapIdx]
    const aOrder = Number(a.sortOrder) || Number(a.id) || 0
    const bOrder = Number(b.sortOrder) || Number(b.id) || 0
    persist(products.map((x) => {
      if (x.id === a.id) return { ...x, sortOrder: bOrder }
      if (x.id === b.id) return { ...x, sortOrder: aOrder }
      return x
    }))
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
            <p className='text-muted-foreground text-sm'>{products.length} ürün · site ile aynı veriyi kullanır</p>
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
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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

        <div className='overflow-x-auto rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-10'>
                  <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} aria-label='Tümünü seç' />
                </TableHead>
                <TableHead>Ürün</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Fiyat</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className='text-center'>Görünür</TableHead>
                <TableHead className='text-center'>Ana Sayfa</TableHead>
                <TableHead className='text-center'>Sıra</TableHead>
                <TableHead className='text-end'>İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loaded ? (
                <TableRow><TableCell colSpan={9} className='text-muted-foreground py-10 text-center'>Yükleniyor…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className='text-muted-foreground py-10 text-center'>Ürün bulunamadı.</TableCell></TableRow>
              ) : filtered.map((p, i) => {
                const key = normalizeProductStatus(p.status, p)
                const meta = PRODUCT_STATUS[key]
                return (
                  <TableRow key={p.id} data-state={selected.includes(p.id) ? 'selected' : undefined}>
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
                    <TableCell className='text-center'>
                      <div className='flex items-center justify-center gap-0.5'>
                        <Button variant='ghost' size='icon' className='size-6' disabled={i === 0} onClick={() => moveSort(p, -1)}>↑</Button>
                        <Button variant='ghost' size='icon' className='size-6' disabled={i === filtered.length - 1} onClick={() => moveSort(p, 1)}>↓</Button>
                      </div>
                    </TableCell>
                    <TableCell className='text-end'>
                      <div className='flex items-center justify-end gap-1'>
                        <Button variant='ghost' size='icon' onClick={() => openEdit(p)} aria-label='Düzenle'><Pencil className='size-4' /></Button>
                        <Button variant='ghost' size='icon' onClick={() => setDeleteTarget(p)} aria-label='Sil'><Trash2 className='text-destructive size-4' /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Main>

      <ProductFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editing}
        nextId={nextId}
        nextSortOrder={nextSortOrder}
        onSave={handleSave}
        allProducts={products}
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
