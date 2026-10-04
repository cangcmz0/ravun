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
import { GripVertical, ImagePlus, Loader2, Monitor, Plus, Smartphone, Trash2 } from 'lucide-react'
import { type HeroSlide, compressImageFile } from '@/lib/ravun-data'
import { errorMessage, uploadImage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Ana sayfa slaytları: görsel, metinler, görselin odak noktası ve (isteğe bağlı)
// "Bu Parçayı Gör" butonunun açacağı ürün. Sürükleyerek sıralanır.

export type EditableSlide = HeroSlide & { _uid: string }
export const MAX_SLIDES = 6

let uidSeq = 0
export const slideUid = () => `s${Date.now().toString(36)}${(uidSeq++).toString(36)}`

type Props = {
  slides: EditableSlide[]
  onChange: (slides: EditableSlide[]) => void
  products: { id: number; title: string }[]
}

async function pickAndUpload(file: File) {
  // Hero tam ekran gösterildiği için biraz daha büyük boyut korunur.
  return uploadImage(await compressImageFile(file, { maxDim: 2400, quality: 0.86, pad: false }))
}

export function HeroSlidesEditor({ slides, onChange, products }: Props) {
  const addInput = useRef<HTMLInputElement>(null)
  const [adding, setAdding] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const update = (uid: string, patch: Partial<HeroSlide>) =>
    onChange(slides.map((s) => (s._uid === uid ? { ...s, ...patch } : s)))
  const remove = (uid: string) => onChange(slides.filter((s) => s._uid !== uid))

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = slides.findIndex((s) => s._uid === active.id)
    const to = slides.findIndex((s) => s._uid === over.id)
    if (from >= 0 && to >= 0) onChange(arrayMove(slides, from, to))
  }

  const addSlide = async (file?: File) => {
    if (!file) return
    setAdding(true)
    try {
      const image = await pickAndUpload(file)
      onChange([...slides, { _uid: slideUid(), image, tag: 'RAVUN ATÖLYE', line1: '', line2: '', pos: 50, productId: 0 }])
    } catch (err) {
      toast.error(`Görsel yüklenemedi: ${errorMessage(err)}`)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className='space-y-4'>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={slides.map((s) => s._uid)} strategy={verticalListSortingStrategy}>
          {slides.map((slide, i) => (
            <SlideCard
              key={slide._uid}
              slide={slide}
              index={i}
              canRemove={slides.length > 1}
              products={products}
              onChange={(patch) => update(slide._uid, patch)}
              onRemove={() => remove(slide._uid)}
            />
          ))}
        </SortableContext>
      </DndContext>

      <input
        ref={addInput}
        type='file'
        accept='image/*'
        className='hidden'
        onChange={(e) => {
          addSlide(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <Button
        type='button'
        variant='outline'
        className='w-full border-dashed'
        disabled={adding || slides.length >= MAX_SLIDES}
        onClick={() => addInput.current?.click()}
      >
        {adding ? <Loader2 className='size-4 animate-spin' /> : <Plus className='size-4' />}
        {slides.length >= MAX_SLIDES ? `En fazla ${MAX_SLIDES} slayt` : 'Slayt ekle (görsel seçin)'}
      </Button>
    </div>
  )
}

function SlideCard({
  slide,
  index,
  canRemove,
  products,
  onChange,
  onRemove,
}: {
  slide: EditableSlide
  index: number
  canRemove: boolean
  products: { id: number; title: string }[]
  onChange: (patch: Partial<HeroSlide>) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: slide._uid })
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const objectPosition = `${slide.pos}% center`

  const replaceImage = async (file?: File) => {
    if (!file) return
    setUploading(true)
    try {
      onChange({ image: await pickAndUpload(file) })
    } catch (err) {
      toast.error(`Görsel yüklenemedi: ${errorMessage(err)}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('bg-card rounded-xl border p-3 sm:p-4', isDragging && 'relative z-10 shadow-xl')}
    >
      <div className='mb-3 flex items-center gap-2'>
        <button
          type='button'
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className='text-muted-foreground hover:bg-muted grid size-8 cursor-grab touch-none place-items-center rounded-md active:cursor-grabbing'
          aria-label={`Slayt ${index + 1}: sıralamak için sürükleyin`}
        >
          <GripVertical className='size-4' />
        </button>
        <span className='text-sm font-semibold'>Slayt {index + 1}</span>
        {index === 0 && <span className='text-muted-foreground text-xs'>· site açılınca ilk görünen</span>}
        <Button type='button' variant='ghost' size='icon' className='ms-auto' onClick={onRemove} disabled={!canRemove} aria-label='Slaytı sil' title={canRemove ? 'Slaytı sil' : 'En az bir slayt kalmalı'}>
          <Trash2 className='text-destructive size-4' />
        </Button>
      </div>

      <div className='grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]'>
        <div className='space-y-3'>
          {/* Önizleme: masaüstünde geniş, telefonda dar kırpılır — odak noktası ikisini de etkiler. */}
          <div className='flex items-end gap-3'>
            <div className='min-w-0 flex-1'>
              <p className='text-muted-foreground mb-1 flex items-center gap-1 text-[11px]'><Monitor className='size-3' /> Bilgisayar</p>
              <Preview slide={slide} objectPosition={objectPosition} className='aspect-video' />
            </div>
            <div className='w-[72px] flex-none sm:w-[84px]'>
              <p className='text-muted-foreground mb-1 flex items-center gap-1 text-[11px]'><Smartphone className='size-3' /> Telefon</p>
              <Preview slide={slide} objectPosition={objectPosition} className='aspect-[9/16]' compact />
            </div>
          </div>
          <div className='space-y-1'>
            <div className='flex items-center justify-between'>
              <Label htmlFor={`pos-${slide._uid}`} className='text-xs'>Görselin odak noktası</Label>
              <span className='text-muted-foreground text-xs'>{slide.pos < 34 ? 'Sol' : slide.pos > 66 ? 'Sağ' : 'Orta'} · %{slide.pos}</span>
            </div>
            <input
              id={`pos-${slide._uid}`}
              type='range'
              min={0}
              max={100}
              value={slide.pos}
              onChange={(e) => onChange({ pos: Number(e.target.value) })}
              className='accent-primary w-full'
            />
            <p className='text-muted-foreground text-[11px]'>Telefonda görselin hangi kısmının görüneceğini seçin.</p>
          </div>
          <input
            ref={fileRef}
            type='file'
            accept='image/*'
            className='hidden'
            onChange={(e) => {
              replaceImage(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <Button type='button' variant='outline' size='sm' onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className='size-4 animate-spin' /> : <ImagePlus className='size-4' />} Görseli değiştir
          </Button>
        </div>

        <div className='grid content-start gap-3'>
          <div className='grid gap-1.5'>
            <Label htmlFor={`tag-${slide._uid}`}>Üst etiket</Label>
            <Input id={`tag-${slide._uid}`} value={slide.tag} onChange={(e) => onChange({ tag: e.target.value })} placeholder='Örn. SİPARİŞ ÜZERİNE' />
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='grid gap-1.5'>
              <Label htmlFor={`l1-${slide._uid}`}>Başlık — 1. satır</Label>
              <Input id={`l1-${slide._uid}`} value={slide.line1} onChange={(e) => onChange({ line1: e.target.value })} placeholder='Örn. Atölyeden' />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor={`l2-${slide._uid}`}>Başlık — 2. satır (italik)</Label>
              <Input id={`l2-${slide._uid}`} value={slide.line2} onChange={(e) => onChange({ line2: e.target.value })} placeholder='Örn. masanıza.' />
            </div>
          </div>
          <div className='grid gap-1.5'>
            <Label>Birincil buton nereye gitsin?</Label>
            <Select value={String(slide.productId || 0)} onValueChange={(v) => onChange({ productId: Number(v) })}>
              <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='0'>Koleksiyon sayfası</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>Ürün: {p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className='text-muted-foreground text-[11px]'>Slayttaki ürünü seçerseniz "Bu Parçayı Gör" doğrudan o ürünü açar.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Preview({ slide, objectPosition, className, compact }: { slide: HeroSlide; objectPosition: string; className: string; compact?: boolean }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg border bg-neutral-900', className)}>
      <img src={slide.image} alt='' className='absolute inset-0 size-full object-cover' style={{ objectPosition }} />
      <div className='absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent' />
      {!compact && (
        <div className='absolute bottom-2 left-3 right-3 text-white'>
          <p className='text-[9px] font-semibold tracking-[0.2em] opacity-80'>· {slide.tag}</p>
          <p className='font-serif text-lg leading-tight'>
            {slide.line1} <em className='opacity-90'>{slide.line2}</em>
          </p>
        </div>
      )}
    </div>
  )
}
