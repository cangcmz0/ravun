import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Lock, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, getSession } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

export function UserAuthForm({ className, redirectTo, ...props }: UserAuthFormProps) {
  const [pin, setPin] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [remainingTries, setRemainingTries] = useState<number | null>(null)
  const [configured, setConfigured] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  useEffect(() => {
    getSession().then((s) => setConfigured(s.configured)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!lockedUntil) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [lockedUntil])

  const locked = lockedUntil > now
  const remaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (locked || isLoading) return
    if (!pin.trim()) {
      toast.error('Lütfen PIN girin.')
      return
    }
    setIsLoading(true)
    try {
      await login(pin)
      toast.success('Giriş başarılı, hoş geldiniz.')
      navigate({ to: redirectTo || '/', replace: true })
    } catch (err) {
      setPin('')
      if (err instanceof ApiError && err.status === 429) {
        setLockedUntil(Date.now() + (Number(err.data?.retryAfter) || 60) * 1000)
        setNow(Date.now())
        toast.error('Çok fazla hatalı deneme. Bir süre bekleyin.')
      } else if (err instanceof ApiError && err.status === 401) {
        setRemainingTries(Number(err.data?.remaining ?? 0))
        toast.error(`Hatalı PIN. Kalan deneme: ${err.data?.remaining ?? 0}`)
      } else {
        toast.error(err instanceof Error ? err.message : 'Giriş yapılamadı.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className={cn('grid gap-4', className)} {...props}>
      <div className='grid gap-2'>
        <Label htmlFor='pin'>Yönetici PIN</Label>
        <Input
          id='pin'
          type='password'
          inputMode='numeric'
          autoComplete='current-password'
          placeholder='••••••'
          value={pin}
          disabled={locked || isLoading || !configured}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
        />
      </div>

      {!configured ? (
        <p className='rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'>
          Sunucuda yönetici PIN'i tanımlı değil. Vercel ortam değişkenlerine <code>ADMIN_PIN</code> ekleyip yeniden dağıtın.
        </p>
      ) : locked ? (
        <p className='flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'>
          <Lock className='size-4 shrink-0' />
          Çok fazla hatalı deneme yapıldı. {Math.ceil(remaining / 60)} dakika sonra tekrar deneyin.
        </p>
      ) : remainingTries !== null ? (
        <p className='text-sm text-muted-foreground'>Kalan deneme hakkı: {remainingTries}</p>
      ) : null}

      <Button className='mt-1' disabled={locked || isLoading || !configured}>
        {isLoading ? <Loader2 className='animate-spin' /> : <LogIn />}
        Giriş yap
      </Button>
    </form>
  )
}
