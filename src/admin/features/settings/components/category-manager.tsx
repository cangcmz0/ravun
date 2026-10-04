import { useRef, useState } from 'react'
import { toast } from 'sonner'
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
import { ChevronDown, GripVertical, ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react'
import { CATEGORY_DETAILS, categoryKey, compressImageFile } from '@/lib/ravun-data'
import { errorMessage, uploadImage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// Kategori yönetimi: ekle, yeniden adlandır, sürükleyerek sırala, (boşsa) sil.
// Her kategorinin koleksiyon sayfasında görünen başlık/açıklama/görseli de burada.

export type CategoryTexts = { eyebrow: string; title: string; desc: string; image: string }
export type CategoryRow = {
  uid: string
  label: string
  original: string | null // kayıtlı ad (yeni eklenen için null) — yeniden adlandırmayı bulmak için
  texts: CategoryTexts
}

let seq = 0
export const categoryUid = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`

export function defaultTexts(label: string): CategoryTexts {
  const base = CATEGORY_DETAILS[categoryKey(label)]
  return base
    ? { ...base }
    : { eyebrow: label.toLocaleUpperCase('tr-TR'), title: label, desc: '', image: CATEGORY_DETAILS.tum.image }
}

type Props = {
  rows: CategoryRow[]
  onChange: (rows: CategoryRow[]) => void
  counts: Record<string, number>
}

export function CategoryManager({ rows, onChange, counts }: Props) {
  const [newName, setNewName] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const update = (uid: string, patch: Partial<CategoryRow>) =>
    onChange(rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = rows.findIndex((r) => r.uid === active.id)
    const to = rows.findIndex((r) => r.uid === over.id)
    if (from >= 0 && to >= 0) onChange(arrayMove(rows, from, to))
  }

  const add = () => {
    const label = newName.trim().replace(/\s+/g, ' ')
    if (!label) return
    const key = categoryKey(label)
    if (!key || key === 'tum') return toast.error('Bu ad kullanılamaz.')
    if (rows.some((r) => categoryKey(r.label) === key)) return toast.error(`"${label}" zaten var.`)
    if (rows.length >= 30) return toast.error('En fazla 30 kategori eklenebilir.')
    const row = { uid: categoryUid(), label, original: null, texts: defaultTexts(label) }
    onChange([...rows, row])
    setNewName('')
    setOpen(row.uid)
  }

  return (
    <div className='space-y-3'>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rows.map((r) => r.uid)} strategy={verticalListSortingStrategy}>
          <div className='divide-y rounded-xl border'>
            {rows.map((row) => {
              // Sayım kayıtlı ada göre: ad değiştirilirken ürünler hâlâ eski addadır.
              const count = counts[categoryKey(row.original ?? row.label)] || 0
              return (
                <CategoryItem
                  key={row.uid}
                  row={row}
                  count={count}
                  canDelete={count === 0 && rows.length > 1}
                  expanded={open === row.uid}
                  onToggle={() => setOpen((o) => (o === row.uid ? null : row.uid))}
                  onChange={(patch) => update(row.uid, patch)}
                  onDelete={() => onChange(rows.filter((r) => r.uid !== row.uid))}
                  duplicate={rows.some((r) => r.uid !== row.uid && categoryKey(r.label) === categoryKey(row.label))}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      <div className='flex gap-2'>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder='Yeni kategori adı (örn. Saksı)'
          maxLength={40}
        />
        <Button type='button' variant='outline' onClick={add} disabled={!newName.trim()}>
          <Plus className='size-4' /> Ekle
        </Button>
      </div>
    </div>
  )
}

function CategoryItem({
  row,
  count,
  canDelete,
  expanded,
  onToggle,
  onChange,
  onDelete,
  duplicate,
}: {
  row: CategoryRow
  count: number
  canDelete: boolean
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<CategoryRow>) => void
  onDelete: () => void
  duplicate: boolean
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.uid })
  const renamed = row.original !== null && row.original !== row.label.trim()
  const setText = (k: keyof CategoryTexts) => (v: string) => onChange({ texts: { ...row.texts, [k]: v } })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('bg-card p-2 first:rounded-t-xl last:rounded-b-xl sm:p-3', isDragging && 'relative z-10 shadow-xl')}
    >
      <div className='flex items-center gap-2'>
        <button
          type='button'
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className='text-muted-foreground hover:bg-muted grid size-8 flex-none cursor-grab touch-none place-items-center rounded-md active:cursor-grabbing'
          aria-label={`${row.label}: sıralamak için sürükleyin`}
        >
          <GripVertical className='size-4' />
        </button>
        <Input
          value={row.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className={cn('h-9 min-w-0 flex-1', duplicate && 'border-destructive')}
          maxLength={40}
          aria-label='Kategori adı'
        />
        <Badge variant='secondary' className='hidden flex-none sm:inline-flex'>{count} ürün</Badge>
        <Button type='button' variant='ghost' size='icon' onClick={onToggle} aria-label='Sayfa metinleri' aria-expanded={expanded} title='Koleksiyon sayfası metinleri'>
          <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={onDelete}
          disabled={!canDelete}
          aria-label='Kategoriyi sil'
          title={canDelete ? 'Kategoriyi sil' : count > 0 ? 'Önce bu kategorideki ürünleri başka kategoriye taşıyın' : 'En az bir kategori kalmalı'}
        >
          <Trash2 className='text-destructive size-4' />
        </Button>
      </div>
      <div className='ms-10 mt-1 flex flex-wrap gap-x-3 text-xs'>
        <span className='text-muted-foreground sm:hidden'>{count} ürün</span>
        {duplicate && <span className='text-destructive'>Bu ad başka bir kategoriyle aynı.</span>}
        {renamed && !duplicate && (
          <span className='text-amber-700 dark:text-amber-400'>
            "{row.original}" → "{row.label.trim()}" · kaydedince {count} ürün de güncellenecek
          </span>
        )}
        {row.original === null && <span className='text-emerald-700 dark:text-emerald-400'>Yeni · kaydedince eklenecek</span>}
      </div>
      {expanded && <TextsEditor texts={row.texts} setText={setText} />}
    </div>
  )
}

export function TextsEditor({ texts, setText }: { texts: CategoryTexts; setText: (k: keyof CategoryTexts) => (v: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const upload = async (file?: File) => {
    if (!file) return
    setUploading(true)
    try {
      setText('image')(await uploadImage(await compressImageFile(file, { pad: false })))
    } catch (err) {
      toast.error(`Görsel yüklenemedi: ${errorMessage(err)}`)
    } finally {
      setUploading(false)
    }
  }
  return (
    <div className='mt-3 grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_auto]'>
      <div className='grid gap-3'>
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='grid gap-1.5'>
            <Label className='text-xs'>Üst etiket</Label>
            <Input value={texts.eyebrow} onChange={(e) => setText('eyebrow')(e.target.value)} maxLength={60} />
          </div>
          <div className='grid gap-1.5'>
            <Label className='text-xs'>Başlık</Label>
            <Input value={texts.title} onChange={(e) => setText('title')(e.target.value)} maxLength={120} />
          </div>
        </div>
        <div className='grid gap-1.5'>
          <Label className='text-xs'>Açıklama</Label>
          <Textarea rows={2} value={texts.desc} onChange={(e) => setText('desc')(e.target.value)} maxLength={280} />
        </div>
      </div>
      <div className='grid content-start justify-items-start gap-1.5'>
        <Label className='text-xs'>Görsel</Label>
        <div className='bg-muted h-20 w-32 overflow-hidden rounded-md border'>
          {texts.image && <img key={texts.image} src={texts.image} alt='' className='size-full object-cover' />}
        </div>
        <input ref={fileRef} type='file' accept='image/*' className='hidden' onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }} />
        <Button type='button' variant='outline' size='sm' onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className='size-4 animate-spin' /> : <ImagePlus className='size-4' />} Değiştir
        </Button>
      </div>
    </div>
  )
}
