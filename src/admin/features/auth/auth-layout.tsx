import { RavunLogo } from '@/assets/ravun-logo'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className='container grid h-svh max-w-none items-center justify-center'>
      <div className='mx-auto flex w-full flex-col justify-center space-y-2 py-8 sm:p-8'>
        <div className='mb-4 flex flex-col items-center justify-center gap-1'>
          <RavunLogo />
          <p className='text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase'>Yönetim Paneli</p>
        </div>
        {children}
      </div>
    </div>
  )
}
