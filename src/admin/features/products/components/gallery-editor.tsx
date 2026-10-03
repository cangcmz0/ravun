import { useRef, useState } from 'react'
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, ImagePlus, Loader2, Star, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Ürün fotoğrafları düzenleyicisi:
// • Dosyaları kutuya sürükleyip bırakarak ya da tıklayıp seçerek yükleme
// • Fotoğrafları tutup sürükleyerek sıralama (fare + dokunmatik + klavye)
// • Tek tıkla kapak yapma ve kaldırma
// İlk sıradaki fotoğraf her zaman kapaktır.

interface GalleryEditorProps {
  images: string[]
  onChange: (images: string[]) => void
  onFiles: (files: File[]) => void
  pending: number
}

export function GalleryEditor({ images, onChange, onFiles, pending }: GalleryEditorProps) {
  // Güvenlik: kimlikler benzersiz olsun (aynı adres iki kez gelirse tekini göster)
  images = [...new Set(images)]
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Telefonda kısa basılı tutunca sürükleme başlar; normal kaydırma bozulmaz.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const pickFiles = (list: FileList | null) => {
    const files = Array.from(list || []).filter((f) => f.type.startsWith('image/'))
    if (files.length) onFiles(files)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = images.indexOf(String(active.id))
    const to = images.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onChange(arrayMove(images, from, to))
  }

  const makeCover = (src: string) => onChange([src, ...images.filter((x) => x !== src)])
  const remove = (src: string) => onChange(images.filter((x) => x !== src))

  return (
    <div className='space-y-3'>
      <input
        ref={inputRef}
        type='file'
        accept='image/*'
        multiple
        className='hidden'
        onChange={(e) => {
          pickFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <button
        type='button'
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes('Files')) {
            e.preventDefault()
            setDragOver(true)
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          pickFiles(e.dataTransfer.files)
        }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
          dragOver ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
        )}
      >
        <ImagePlus className='size-7 text-muted-foreground' />
        <span className='text-sm font-medium'>
          <span className='hidden sm:inline'>Fotoğrafları buraya sürükleyip bırakın ya da </span>
          <span className='hidden text-primary underline underline-offset-2 sm:inline'>seçmek için tıklayın</span>
          <span className='text-primary sm:hidden'>Fotoğraf eklemek için dokunun</span>
        </span>
        <span className='text-xs text-muted-foreground'>Birden fazla fotoğraf seçebilirsiniz · JPG, PNG, WebP</span>
      </button>

      {images.length === 0 && pending === 0 ? (
        <p className='text-center text-sm text-muted-foreground'>Henüz fotoğraf yok.</p>
      ) : (
        <>
          <p className='text-xs text-muted-foreground'>
            Sıralamak için fotoğrafı tutup sürükleyin (telefonda kısa basılı tutun). İlk fotoğraf kapaktır.
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={images} strategy={rectSortingStrategy}>
              <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                {images.map((src, i) => (
                  <SortableImage
                    key={src}
                    src={src}
                    index={i}
                    onCover={() => makeCover(src)}
                    onRemove={() => remove(src)}
                  />
                ))}
                {Array.from({ length: pending }).map((_, i) => (
                  <div key={`p${i}`} className='flex aspect-square items-center justify-center rounded-lg border bg-muted/40'>
                    <Loader2 className='size-6 animate-spin text-muted-foreground' />
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  )
}

function SortableImage({ src, index, onCover, onRemove }: { src: string; index: number; onCover: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: src })
  const isCover = index === 0
  // Butonlara basınca sürükleme başlamasın
  const stop = (e: React.PointerEvent | React.KeyboardEvent) => e.stopPropagation()
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, touchAction: 'manipulation' }}
      className={cn(
        'group relative aspect-square cursor-grab overflow-hidden rounded-lg border bg-muted select-none active:cursor-grabbing',
        isCover && 'ring-2 ring-primary',
        isDragging && 'z-10 opacity-80 shadow-xl'
      )}
      {...attributes}
      {...listeners}
      aria-label={`Fotoğraf ${index + 1}${isCover ? ' (kapak)' : ''}. Sıralamak için sürükleyin.`}
    >
      <img src={src} alt='' draggable={false} className='pointer-events-none absolute inset-0 size-full object-cover' />
      <span className='absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white'>
        <GripVertical className='size-3' />
        {isCover ? 'Kapak' : index + 1}
      </span>
      <button
        type='button'
        onPointerDown={stop}
        onKeyDown={stop}
        onClick={onRemove}
        className='absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white hover:bg-red-600'
        aria-label='Fotoğrafı kaldır'
        title='Kaldır'
      >
        <X className='size-4' />
      </button>
      {!isCover && (
        <button
          type='button'
          onPointerDown={stop}
          onKeyDown={stop}
          onClick={onCover}
          className='absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1 rounded-md bg-black/60 py-1 text-[11px] font-medium text-white opacity-100 hover:bg-black/75 sm:opacity-0 sm:group-hover:opacity-100'
        >
          <Star className='size-3' /> Kapak yap
        </button>
      )}
    </div>
  )
}
