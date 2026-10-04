import { RavunLogo } from '@/assets/ravun-logo'

type AuthLayoutProps = {
  children: React.ReactNode
}

// Giriş ekranı: geniş ekranda solda atölye fotoğrafı, sağda form.
// Telefonda yalnızca form; arkada çok hafif ahşap damarı dokusu.
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className='grid min-h-svh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]'>
      <div className='relative hidden overflow-hidden bg-[#291D11] lg:block'>
        <img src='/assets/products_hero-3.webp' alt='' className='absolute inset-0 size-full object-cover opacity-80' />
        <div className='absolute inset-0 bg-gradient-to-t from-[#1d140b] via-[#1d140b]/40 to-transparent' />
        <div className='absolute inset-x-10 bottom-10 text-[#F6F1E7]'>
          <p className='text-[11px] font-semibold tracking-[0.3em] text-[#F6F1E7]/70 uppercase'>Ravun Atölye · Beykoz</p>
          <p className="mt-3 font-['Cormorant_Garamond',Georgia,serif] text-5xl leading-tight">
            Her parça, <em className='text-[#7FD3B6]'>tek.</em>
          </p>
          <p className='mt-2 max-w-sm text-sm text-[#F6F1E7]/75'>Siparişler, ürünler ve müşteri yorumları tek defterde.</p>
        </div>
      </div>
      <div className='relative flex items-center justify-center px-4 py-10 [background:repeating-linear-gradient(97deg,rgb(120_80_40/0.035)_0_2px,transparent_2px_11px),var(--background)]'>
        <div className='mx-auto flex w-full max-w-sm flex-col justify-center space-y-2'>
          <div className='mb-4 flex flex-col items-center justify-center gap-1'>
            <RavunLogo />
            <p className='text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase'>Atölye paneli</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
