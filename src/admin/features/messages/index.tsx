import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Mail, MailOpen, Trash2 } from 'lucide-react'
import { deleteMessage, errorMessage, fetchMessages, setMessageRead } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfigDrawer } from '@/components/config-drawer'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'

/* eslint-disable @typescript-eslint/no-explicit-any */

const WA_NUMBER_RE = /\D/g

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export function Messages() {
  const [messages, setMessages] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<any>(null)

  useEffect(() => {
    fetchMessages()
      .then(setMessages)
      .catch((err) => setLoadError(errorMessage(err, 'Mesajlar yüklenemedi.')))
      .finally(() => setLoaded(true))
  }, [])

  const unread = useMemo(() => messages.filter((m) => !m.read).length, [messages])

  const toggleRead = async (m: any) => {
    try {
      await setMessageRead(m.id, !m.read)
      setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, read: !m.read } : x)))
    } catch (err) {
      toast.error(`Güncellenemedi: ${errorMessage(err)}`)
    }
  }

  const handleDelete = async () => {
    const target = deleteTarget
    setDeleteTarget(null)
    if (!target) return
    try {
      await deleteMessage(target.id)
      setMessages((list) => list.filter((x) => x.id !== target.id))
      toast.success('Mesaj silindi')
    } catch (err) {
      toast.error(`Silinemedi: ${errorMessage(err)}`)
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
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Mesajlar</h1>
          <p className='text-muted-foreground text-sm'>
            Sitedeki iletişim formundan gelenler · {messages.length} mesaj{unread ? `, ${unread} okunmamış` : ''}
          </p>
        </div>
        {!loaded ? (
          <p className='text-muted-foreground py-10 text-center text-sm'>Yükleniyor…</p>
        ) : loadError ? (
          <p className='text-destructive py-10 text-center text-sm'>{loadError}</p>
        ) : messages.length === 0 ? (
          <p className='text-muted-foreground py-10 text-center text-sm'>Henüz mesaj yok.</p>
        ) : (
          <div className='grid gap-3'>
            {messages.map((m) => {
              const phone = String(m.telefon || '').replace(WA_NUMBER_RE, '')
              return (
                <div key={m.id} className={`rounded-md border p-4 ${m.read ? '' : 'border-primary/50 bg-primary/5'}`}>
                  <div className='flex flex-wrap items-center gap-2'>
                    <strong>{m.isim}</strong>
                    {!m.read && <Badge>Yeni</Badge>}
                    {m.parca && <Badge variant='outline'>{m.parca}</Badge>}
                    <span className='text-muted-foreground ms-auto text-xs'>{formatDate(m.createdAt)}</span>
                  </div>
                  <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-4 text-sm'>
                    <a href={`mailto:${m.eposta}`} className='hover:underline'>{m.eposta}</a>
                    {m.telefon && <a href={`tel:${m.telefon}`} className='hover:underline'>{m.telefon}</a>}
                    {phone.length >= 10 && (
                      <a href={`https://wa.me/${phone.startsWith('0') ? `9${phone}` : phone}`} target='_blank' rel='noreferrer' className='hover:underline'>WhatsApp</a>
                    )}
                  </div>
                  {m.mesaj && <p className='mt-2 whitespace-pre-line text-sm'>{m.mesaj}</p>}
                  <div className='mt-3 flex gap-2'>
                    <Button variant='outline' size='sm' onClick={() => toggleRead(m)}>
                      {m.read ? <><Mail className='me-1 size-4' />Okunmadı yap</> : <><MailOpen className='me-1 size-4' />Okundu yap</>}
                    </Button>
                    <Button variant='ghost' size='sm' onClick={() => setDeleteTarget(m)}>
                      <Trash2 className='text-destructive me-1 size-4' />Sil
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Main>
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title='Mesajı sil'
        desc={`${deleteTarget?.isim || ''} adlı kişinin mesajı kalıcı olarak silinecek.`}
        destructive
        confirmText='Sil'
        cancelBtnText='Vazgeç'
        handleConfirm={handleDelete}
      />
    </>
  )
}
