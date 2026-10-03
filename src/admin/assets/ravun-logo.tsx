import { type ImgHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// Sitedeki logo dosyası 344×351; yalnızca ortadaki ~260×82'lik alan dolu.
// Kutuyu o alana göre kırparak gösterir.
export function RavunLogo({
  className,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src='/assets/ravun-logo.webp'
      alt='Ravun'
      className={cn('h-12 w-40 object-cover object-[center_53%]', className)}
      {...props}
    />
  )
}
