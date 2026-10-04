import { useEffect, useState } from 'react'
import { Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Telefonda paneli ana ekrana ekleme önerisi. Uygulama gibi açılmışsa ya da
// kapatıldıysa bir daha gösterilmez.
const KEY = 'ravun:installHintClosed'

export function InstallHint() {
  const [show, setShow] = useState(false)
  const [prompt, setPrompt] = useState<any>(null)
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)

  useEffect(() => {
    let closed = false
    try { closed = localStorage.getItem(KEY) === '1' } catch { /* gizli sekme */ }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone
    const mobile = window.matchMedia('(max-width: 820px)').matches
    if (!closed && !standalone && mobile) setShow(true)
    const onPrompt = (e: any) => { e.preventDefault(); setPrompt(e) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const close = () => {
    setShow(false)
    try { localStorage.setItem(KEY, '1') } catch { /* gizli sekme */ }
  }

  if (!show) return null
  return (
    <div className='bg-card mb-4 flex items-start gap-3 rounded-xl border p-3'>
      <img src='/admin-icon-192.png' alt='' className='size-11 flex-none rounded-lg border' />
      <div className='min-w-0 flex-1 text-sm'>
        <p className='flex items-center gap-1.5 font-medium'><Smartphone className='size-4' /> Paneli ana ekrana ekleyin</p>
        <p className='text-muted-foreground text-xs'>
          {prompt
            ? 'Tek dokunuşla uygulama gibi açılır.'
            : ios
              ? 'Safari\'de Paylaş simgesine, ardından "Ana Ekrana Ekle"ye dokunun.'
              : 'Tarayıcı menüsünden (⋮) "Ana ekrana ekle"yi seçin.'}
        </p>
        {prompt && (
          <Button size='sm' className='mt-2' onClick={async () => { prompt.prompt(); await prompt.userChoice.catch(() => null); close() }}>
            Ana ekrana ekle
          </Button>
        )}
      </div>
      <Button variant='ghost' size='icon' className='-me-1 -mt-1 size-8' onClick={close} aria-label='Kapat'><X className='size-4' /></Button>
    </div>
  )
}
