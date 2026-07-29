import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, MessageSquareOff, Search, Star, Trash2 } from 'lucide-react'
import { loadProducts, loadReviews, saveReviews } from '@/lib/ravun-data'
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

/* eslint-disable @typescript-eslint/no-explicit-any */

type FlatReview = {
  productId: string
  productTitle: string
  productImage: string
} & Record<string, any>

function Stars({ rating }: { rating: number }) {
  return (
    <div className='flex items-center gap-0.5'>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={n <= rating ? 'fill-amber-400 text-amber-400 size-3.5' : 'text-muted-foreground size-3.5'} />
      ))}
    </div>
  )
}

export function Reviews() {
  const [reviews, setReviews] = useState<Record<string, any[]>>({})
  const [productMap, setProductMap] = useState<Record<string, any>>({})
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [productFilter, setProductFilter] = useState('Tümü')
  const [statusFilter, setStatusFilter] = useState('Tümü')
  const [selected, setSelected] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<FlatReview | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  useEffect(() => {
    setReviews(loadReviews())
    const products = loadProducts()
    setProductMap(Object.fromEntries(products.map((p: any) => [String(p.id), p])))
    setLoaded(true)
  }, [])

  const persist = (next: Record<string, any[]>) => {
    setReviews(next)
    saveReviews(next)
  }

  const flat = useMemo<FlatReview[]>(() => {
    const rows: FlatReview[] = []
    Object.entries(reviews).forEach(([productId, list]) => {
      const product = productMap[productId]
      ;(list || []).forEach((r) => rows.push({
        ...r,
        productId,
        productTitle: product?.title || `Ürün #${productId}`,
        productImage: product?.image || '',
      }))
    })
    return rows.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
  }, [reviews, productMap])

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    return flat
      .filter((r) => productFilter === 'Tümü' || r.productId === productFilter)
      .filter((r) => statusFilter === 'Tümü' || (statusFilter === 'onayli' ? r.approved : !r.approved))
      .filter((r) => !q ||
        String(r.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        String(r.text || '').toLocaleLowerCase('tr-TR').includes(q)
      )
  }, [flat, query, productFilter, statusFilter])

  const key = (r: FlatReview) => `${r.productId}:${r.id}`

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.includes(key(r)))
  const toggleSelectAll = () => {
    if (allVisibleSelected) setSelected((s) => s.filter((k) => !filtered.some((r) => key(r) === k)))
    else setSelected((s) => [...new Set([...s, ...filtered.map(key)])])
  }
  const toggleSelect = (k: string) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))

  const toggleApproved = (r: FlatReview) => {
    persist({
      ...reviews,
      [r.productId]: (reviews[r.productId] || []).map((x) => (x.id === r.id ? { ...x, approved: !x.approved } : x)),
    })
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    persist({
      ...reviews,
      [deleteTarget.productId]: (reviews[deleteTarget.productId] || []).filter((x) => x.id !== deleteTarget.id),
    })
    toast.success('Yorum silindi')
    setSelected((s) => s.filter((k) => k !== key(deleteTarget)))
    setDeleteTarget(null)
  }

  const handleBulkVisibility = (approved: boolean) => {
    const next = { ...reviews }
    Object.keys(next).forEach((pid) => {
      next[pid] = (next[pid] || []).map((r) => (selected.includes(`${pid}:${r.id}`) ? { ...r, approved } : r))
    })
    persist(next)
    toast.success(approved ? 'Seçilenler onaylandı' : 'Seçilenler gizlendi')
  }

  const handleBulkDelete = () => {
    const next = { ...reviews }
    Object.keys(next).forEach((pid) => {
      next[pid] = (next[pid] || []).filter((r) => !selected.includes(`${pid}:${r.id}`))
    })
    persist(next)
    toast.success(`${selected.length} yorum silindi`)
    setSelected([])
    setBulkDeleteOpen(false)
  }

  const productOptions = useMemo(
    () => Object.entries(productMap).map(([id, p]: any) => ({ id, title: p.title })),
    [productMap]
  )

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
            <h1 className='text-2xl font-bold tracking-tight'>Yorumlar</h1>
            <p className='text-muted-foreground text-sm'>{flat.length} yorum · site ile aynı veriyi kullanır</p>
          </div>
        </div>

        <div className='mb-4 flex flex-wrap items-center gap-2'>
          <div className='relative w-full max-w-xs'>
            <Search className='text-muted-foreground absolute start-2.5 top-2.5 size-4' />
            <Input placeholder='İsim veya yorum metni ara…' value={query} onChange={(e) => setQuery(e.target.value)} className='ps-8' />
          </div>
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className='w-56'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='Tümü'>Tüm ürünler</SelectItem>
              {productOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className='w-40'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='Tümü'>Tüm durumlar</SelectItem>
              <SelectItem value='onayli'>Onaylı</SelectItem>
              <SelectItem value='beklemede'>Gizli</SelectItem>
            </SelectContent>
          </Select>
          {selected.length > 0 && (
            <div className='ms-auto flex items-center gap-2'>
              <span className='text-muted-foreground text-sm'>{selected.length} seçili</span>
              <Button variant='outline' size='sm' onClick={() => handleBulkVisibility(true)}><Eye className='me-1 size-4' />Onayla</Button>
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
                <TableHead>Yazan</TableHead>
                <TableHead>Puan</TableHead>
                <TableHead>Yorum</TableHead>
                <TableHead className='text-center'>Beğeni</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className='text-center'>Onaylı</TableHead>
                <TableHead className='text-end'>İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loaded ? (
                <TableRow><TableCell colSpan={9} className='text-muted-foreground py-10 text-center'>Yükleniyor…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className='text-muted-foreground py-10 text-center'>
                    <div className='flex flex-col items-center gap-2'>
                      <MessageSquareOff className='size-6' />
                      {flat.length === 0 ? 'Henüz yorum yok.' : 'Yorum bulunamadı.'}
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.map((r) => {
                const k = key(r)
                return (
                  <TableRow key={k} data-state={selected.includes(k) ? 'selected' : undefined}>
                    <TableCell><Checkbox checked={selected.includes(k)} onCheckedChange={() => toggleSelect(k)} aria-label={`${r.name} seç`} /></TableCell>
                    <TableCell>
                      <div className='flex items-center gap-2'>
                        {r.productImage && <img src={r.productImage} alt='' className='size-8 rounded-md border object-cover' />}
                        <span className='max-w-[140px] truncate text-sm'>{r.productTitle}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className='font-medium'>{r.name}</div>
                    </TableCell>
                    <TableCell><Stars rating={r.rating} /></TableCell>
                    <TableCell className='max-w-[280px]'>
                      <p className='truncate text-sm' title={r.text}>{r.text}</p>
                    </TableCell>
                    <TableCell className='text-center text-sm'>{r.helpful || 0}</TableCell>
                    <TableCell className='text-muted-foreground text-xs whitespace-nowrap'>{r.date}</TableCell>
                    <TableCell className='text-center'>
                      <Switch checked={r.approved !== false} onCheckedChange={() => toggleApproved(r)} aria-label='Onaylı' />
                    </TableCell>
                    <TableCell className='text-end'>
                      <Button variant='ghost' size='icon' onClick={() => setDeleteTarget(r)} aria-label='Sil'><Trash2 className='text-destructive size-4' /></Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Main>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title='Yorumu sil'
        desc={`"${deleteTarget?.name}" adlı kullanıcının yorumu kalıcı olarak silinecek. Bu işlem geri alınamaz.`}
        destructive
        confirmText='Sil'
        cancelBtnText='Vazgeç'
        handleConfirm={handleDelete}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title='Seçilen yorumları sil'
        desc={`${selected.length} yorum kalıcı olarak silinecek. Bu işlem geri alınamaz.`}
        destructive
        confirmText='Sil'
        cancelBtnText='Vazgeç'
        handleConfirm={handleBulkDelete}
      />
    </>
  )
}
