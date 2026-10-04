import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, MessageSquareOff, Reply, Search, Star, Trash2 } from 'lucide-react'
import { deleteReview, errorMessage, fetchProducts, fetchReviews, setReviewApproved, setReviewReply } from '@/lib/api'
import { ReplyDialog } from './components/reply-dialog'
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
  const [replyTarget, setReplyTarget] = useState<FlatReview | null>(null)

  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    Promise.all([fetchReviews(), fetchProducts()])
      .then(([r, products]) => {
        setReviews(r)
        setProductMap(Object.fromEntries(products.map((p: any) => [String(p.id), p])))
      })
      .catch((err) => setLoadError(errorMessage(err, 'Yorumlar yüklenemedi.')))
      .finally(() => setLoaded(true))
  }, [])

  // Sunucu işlemi başarılı olunca yerel listeyi günceller.
  const applyLocal = (ids: Set<string>, fn: (r: any) => any | null) =>
    setReviews((prev) => {
      const next: Record<string, any[]> = {}
      for (const [pid, list] of Object.entries(prev)) {
        next[pid] = (list || []).map((r) => (ids.has(`${pid}:${r.id}`) ? fn(r) : r)).filter(Boolean)
      }
      return next
    })

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

  const toggleApproved = async (r: FlatReview) => {
    try {
      await setReviewApproved(Number(r.id), !r.approved)
      applyLocal(new Set([key(r)]), (x) => ({ ...x, approved: !x.approved }))
    } catch (err) {
      toast.error(`Güncellenemedi: ${errorMessage(err)}`)
    }
  }

  const handleReply = async (reply: string, approve: boolean) => {
    if (!replyTarget) return false
    const target = replyTarget
    try {
      const saved = await setReviewReply(Number(target.id), reply)
      if (approve) await setReviewApproved(Number(target.id), true)
      applyLocal(new Set([key(target)]), (x) => ({ ...x, reply: saved.reply, replyAt: saved.replyAt, approved: approve ? true : x.approved }))
      toast.success(reply.trim() ? (approve ? 'Yanıt kaydedildi, yorum yayında' : 'Yanıt kaydedildi') : 'Yanıt kaldırıldı')
      return true
    } catch (err) {
      toast.error(`Kaydedilemedi: ${errorMessage(err)}`)
      return false
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    try {
      await deleteReview(Number(target.id))
      applyLocal(new Set([key(target)]), () => null)
      setSelected((s) => s.filter((k) => k !== key(target)))
      toast.success('Yorum silindi')
    } catch (err) {
      toast.error(`Silinemedi: ${errorMessage(err)}`)
    }
  }

  const runBulk = async (op: (id: number) => Promise<void>) => {
    const ids = new Set(selected)
    const done = new Set<string>()
    for (const k of ids) {
      try { await op(Number(k.split(':')[1])); done.add(k) } catch { /* aşağıda raporlanır */ }
    }
    if (done.size < ids.size) toast.error(`${ids.size - done.size} yorum işlenemedi.`)
    return done
  }

  const handleBulkVisibility = async (approved: boolean) => {
    const done = await runBulk((id) => setReviewApproved(id, approved))
    applyLocal(done, (r) => ({ ...r, approved }))
    if (done.size) toast.success(approved ? 'Seçilenler onaylandı' : 'Seçilenler gizlendi')
  }

  const handleBulkDelete = async () => {
    setBulkDeleteOpen(false)
    const done = await runBulk((id) => deleteReview(id))
    applyLocal(done, () => null)
    if (done.size) toast.success(`${done.size} yorum silindi`)
    setSelected((s) => s.filter((k) => !done.has(k)))
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
            <p className='text-muted-foreground text-sm'>{flat.length} yorum</p>
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
              <SelectItem value='beklemede'>Onay bekleyen / gizli</SelectItem>
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

        {/* ── Mobil: kart listesi ── */}
        <div className='grid gap-3 md:hidden'>
          {!loaded ? (
            <p className='text-muted-foreground py-10 text-center text-sm'>Yükleniyor…</p>
          ) : loadError ? (
            <p className='text-destructive py-10 text-center text-sm'>{loadError}</p>
          ) : filtered.length === 0 ? (
            <p className='text-muted-foreground py-10 text-center text-sm'>{flat.length === 0 ? 'Henüz yorum yok.' : 'Yorum bulunamadı.'}</p>
          ) : filtered.map((r) => {
            const k = key(r)
            return (
              <div key={k} className={`rounded-lg border bg-card p-3 ${r.approved === false ? 'border-amber-300 dark:border-amber-800' : ''} ${selected.includes(k) ? 'ring-2 ring-primary' : ''}`}>
                <div className='flex items-start justify-between gap-2'>
                  <div className='flex min-w-0 items-center gap-2'>
                    {r.productImage && <img src={r.productImage} alt='' className='size-9 shrink-0 rounded-md border object-cover' />}
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium'>{r.name}</p>
                      <p className='text-muted-foreground truncate text-xs'>{r.productTitle} · {r.date}</p>
                    </div>
                  </div>
                  <Checkbox checked={selected.includes(k)} onCheckedChange={() => toggleSelect(k)} aria-label={`${r.name} seç`} />
                </div>
                <div className='mt-2'><Stars rating={r.rating} /></div>
                <p className='mt-1 text-sm whitespace-pre-line'>{r.text}</p>
                {Array.isArray(r.photos) && r.photos.length > 0 && (
                  <div className='mt-2 flex gap-2'>
                    {r.photos.map((u: string) => (
                      <a key={u} href={u} target='_blank' rel='noreferrer' title='Fotoğrafı büyük aç'>
                        <img src={u} alt='Müşteri fotoğrafı' loading='lazy' className='size-16 rounded-md border object-cover' />
                      </a>
                    ))}
                  </div>
                )}
                {r.reply && (
                  <div className='bg-muted/60 mt-2 rounded-md border-s-2 border-primary px-2.5 py-1.5 text-xs'>
                    <span className='font-semibold'>Ravun Atölye:</span> {r.reply}
                  </div>
                )}
                <div className='mt-3 flex items-center justify-between gap-2 border-t pt-3'>
                  <label className='flex items-center gap-2 text-sm'>
                    <Switch checked={r.approved !== false} onCheckedChange={() => toggleApproved(r)} aria-label='Onaylı' />
                    {r.approved !== false ? 'Yayında' : 'Onay bekliyor'}
                  </label>
                  <div className='flex items-center gap-1'>
                    <Button variant='outline' size='sm' onClick={() => setReplyTarget(r)}><Reply className='size-4' />{r.reply ? 'Yanıtı düzenle' : 'Yanıtla'}</Button>
                    <Button variant='ghost' size='icon' onClick={() => setDeleteTarget(r)} aria-label='Sil'><Trash2 className='text-destructive size-4' /></Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Masaüstü: tablo ── */}
        <div className='hidden overflow-x-auto rounded-md border md:block'>
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
              ) : loadError ? (
                <TableRow><TableCell colSpan={9} className='text-destructive py-10 text-center'>{loadError}</TableCell></TableRow>
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
                      {r.reply && <p className='text-muted-foreground truncate text-xs' title={r.reply}>↳ Ravun Atölye: {r.reply}</p>}
                    </TableCell>
                    <TableCell className='text-center text-sm'>{r.helpful || 0}</TableCell>
                    <TableCell className='text-muted-foreground text-xs whitespace-nowrap'>{r.date}</TableCell>
                    <TableCell className='text-center'>
                      <Switch checked={r.approved !== false} onCheckedChange={() => toggleApproved(r)} aria-label='Onaylı' />
                    </TableCell>
                    <TableCell className='text-end'>
                      <div className='flex items-center justify-end gap-0.5'>
                        <Button variant='ghost' size='icon' onClick={() => setReplyTarget(r)} aria-label='Yanıtla' title={r.reply ? 'Yanıtı düzenle' : 'Yanıtla'}>
                          <Reply className={r.reply ? 'text-primary size-4' : 'size-4'} />
                        </Button>
                        <Button variant='ghost' size='icon' onClick={() => setDeleteTarget(r)} aria-label='Sil'><Trash2 className='text-destructive size-4' /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Main>

      <ReplyDialog review={replyTarget} onOpenChange={(o) => !o && setReplyTarget(null)} onSave={handleReply} />

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
