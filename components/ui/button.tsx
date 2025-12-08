// File: components/ui/button.tsx
import { cn } from "@/utils/cn"
import React from "react"

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default"|"ghost"|"outline" }
export const Button = React.forwardRef<HTMLButtonElement, Props>(function Button({className, variant="default", ...props}, ref){
  const v = {
    default: "bg-[var(--color-accent-red)] text-white hover:opacity-90",
    ghost: "bg-transparent text-[var(--color-text-dark)]",
    outline: "border border-[var(--color-soft)] text-[var(--color-text-dark)]"
  }[variant]
  return <button ref={ref} className={cn("px-4 py-2 rounded-xl transition-colors disabled:opacity-50", v, className)} {...props} />
})
