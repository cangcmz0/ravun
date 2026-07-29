import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Lock, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import {
  getLockedUntil,
  getLoginAttempts,
  registerFailedAttempt,
  clearLoginAttempts,
  MAX_LOGIN_ATTEMPTS,
} from '@/lib/ravun-data'
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
  const [lockedUntil, setLockedUntil] = useState(() => getLockedUntil())
  const [now, setNow] = useState(() => Date.now())
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  useEffect(() => {
    if (!lockedUntil) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [lockedUntil])

  const locked = lockedUntil > now
  const remaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000))
  const attempts = getLoginAttempts()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (locked || isLoading) return
    if (!pin.trim()) {
      toast.error('Lütfen PIN girin.')
      return
    }
    setIsLoading(true)
    const ok = await login(pin)
    setIsLoading(false)
    if (ok) {
      clearLoginAttempts()
      toast.success('Giriş başarılı, hoş geldiniz.')
      navigate({ to: redirectTo || '/', replace: true })
    } else {
      const { attempts: n, lockedUntil: until } = registerFailedAttempt()
      setPin('')
      if (until) {
        setLockedUntil(until)
        toast.error('Çok fazla hatalı deneme. Bir süre bekleyin.')
      } else {
        toast.error(`Hatalı PIN. Kalan deneme: ${MAX_LOGIN_ATTEMPTS - n}`)
      }
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
          autoComplete='off'
          placeholder='••••••'
          value={pin}
          disabled={locked || isLoading}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
        />
      </div>

      {locked ? (
        <p className='flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'>
          <Lock className='size-4 shrink-0' />
          Çok fazla hatalı deneme yapıldı. {remaining} saniye sonra tekrar deneyin.
        </p>
      ) : attempts > 0 ? (
        <p className='text-sm text-muted-foreground'>
          Kalan deneme hakkı: {MAX_LOGIN_ATTEMPTS - attempts}
        </p>
      ) : null}

      <Button className='mt-1' disabled={locked || isLoading}>
        {isLoading ? <Loader2 className='animate-spin' /> : <LogIn />}
        Giriş yap
      </Button>
    </form>
  )
}
