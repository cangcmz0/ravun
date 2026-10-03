import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DatabaseBackup, Loader2 } from 'lucide-react'
import { clearLegacyData, readLegacyData } from '@/lib/ravun-data'
import { errorMessage, importLegacy } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Sunucuya geçmeden önce panelde yapılan değişiklikler bu tarayıcının
// localStorage'ında kalmış olabilir. Bu kart onları bir kez sunucuya aktarır.
export function LegacyImportCard({ onImported }: { onImported: () => void }) {
  const [legacy, setLegacy] = useState(() => readLegacyData())
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState({ products: true, orders: true, reviews: true, settings: false })

  const counts = useMemo(() => ({
    products: legacy.products?.length || 0,
    orders: legacy.orders?.length || 0,
    reviews: legacy.reviews ? Object.values(legacy.reviews).flat().length : 0,
    settings: Boolean(legacy.settings),
  }), [legacy])

  if (!legacy.has) return null

  const run = async () => {
    setBusy(true)
    try {
      const { imported } = await importLegacy({
        products: pick.products ? legacy.products : undefined,
        orders: pick.orders ? legacy.orders : undefined,
        reviews: pick.reviews ? legacy.reviews : undefined,
        settings: pick.settings ? legacy.settings : undefined,
      })
      clearLegacyData()
      setLegacy(readLegacyData())
      toast.success(`Aktarıldı: ${imported.products} ürün, ${imported.orders} sipariş, ${imported.reviews} yorum${imported.settings ? ', site ayarları' : ''}.`)
      onImported()
    } catch (err) {
      toast.error(`Aktarılamadı: ${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const dismiss = () => {
    clearLegacyData()
    setLegacy(readLegacyData())
  }

  const row = (key: keyof typeof pick, label: string, count: number | boolean) => (
    <div className='flex items-center gap-2'>
      <Checkbox id={`legacy-${key}`} checked={pick[key]} disabled={!count} onCheckedChange={(v) => setPick((p) => ({ ...p, [key]: Boolean(v) }))} />
      <Label htmlFor={`legacy-${key}`} className='font-normal'>
        {label} {typeof count === 'number' ? `(${count})` : count ? '' : '(yok)'}
      </Label>
    </div>
  )

  return (
    <div className='mb-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'>
      <div className='flex items-start gap-3'>
        <DatabaseBackup className='mt-0.5 size-5 shrink-0' />
        <div className='flex-1 space-y-3'>
          <div>
            <p className='font-medium'>Bu tarayıcıda eski kayıtlar bulundu</p>
            <p className='text-sm opacity-80'>
              Panel artık verileri sunucuda tutuyor. Daha önce bu tarayıcıda yaptığınız değişiklikleri
              sunucuya aktarabilirsiniz. Aynı ID'li ürünler güncellenir, aynı numaralı siparişler tekrar eklenmez.
              Site ayarlarını aktarırsanız sunucudaki ayarların üzerine yazılır.
            </p>
          </div>
          <div className='grid gap-2 sm:grid-cols-2'>
            {row('products', 'Ürünler', counts.products)}
            {row('orders', 'Siparişler', counts.orders)}
            {row('reviews', 'Yorumlar', counts.reviews)}
            {row('settings', 'Site ayarları', counts.settings)}
          </div>
          <div className='flex gap-2'>
            <Button size='sm' onClick={run} disabled={busy}>
              {busy && <Loader2 className='me-1 size-4 animate-spin' />}Sunucuya aktar
            </Button>
            <Button size='sm' variant='ghost' onClick={dismiss} disabled={busy}>Yoksay ve temizle</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
