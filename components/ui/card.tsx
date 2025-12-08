// File: components/ui/card.tsx
import { cn } from "@/utils/cn"
import React from "react"

export function Card({className, ...props}: React.HTMLAttributes<HTMLDivElement>){
  return <div className={cn("rounded-xl border border-[var(--color-soft)] bg-white", className)} {...props} />
}
export function CardContent({className, ...props}: React.HTMLAttributes<HTMLDivElement>){
  return <div className={cn("p-4", className)} {...props} />
}
export function CardHeader({className, ...props}: React.HTMLAttributes<HTMLDivElement>){
  return <div className={cn("p-4 border-b border-[var(--color-soft)]", className)} {...props} />
}
export function CardTitle({className, ...props}: React.HTMLAttributes<HTMLHeadingElement>){
  return <h3 className={cn("text-lg font-semibold", className)} {...props} />
}
