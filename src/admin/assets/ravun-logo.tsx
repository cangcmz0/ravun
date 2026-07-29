import { type ImgHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function RavunLogo({
  className,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src='/images/ravun-logo.webp'
      alt='Ravun'
      className={cn('object-contain', className)}
      {...props}
    />
  )
}
