// File: components/ui/input.tsx
import { cn } from "@/utils/cn"
import React from "react"

type Props = React.InputHTMLAttributes<HTMLInputElement>
export const Input = React.forwardRef<HTMLInputElement, Props>(function Input({className, ...props}, ref){
  return <input ref={ref} className={cn("w-full px-3 py-2 rounded-xl border border-[var(--color-soft)] outline-none focus:ring-2 focus:ring-[var(--color-accent-gold)]", className)} {...props} />
})
