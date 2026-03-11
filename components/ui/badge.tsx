import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[#00d4aa] text-[#0a0a0f]',
        secondary: 'border-transparent bg-[#1a1a24] text-[#a0a0b0]',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-[#a0a0b0] border-[#222233]',
        warm: 'border-transparent bg-[#00d4aa]/20 text-[#00d4aa] border-[#00d4aa]/30',
        engaged: 'border-transparent bg-orange-500/20 text-orange-400 border-orange-500/30',
        warming: 'border-transparent bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        cold: 'border-transparent bg-[#222233] text-[#555566]',
        new: 'border-transparent bg-blue-500/20 text-blue-400 border-blue-500/30',
        enriched: 'border-transparent bg-[#00d4aa]/20 text-[#00d4aa] border-[#00d4aa]/30',
        contacted: 'border-transparent bg-purple-500/20 text-purple-400 border-purple-500/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
