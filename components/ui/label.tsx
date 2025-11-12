import { cn } from "@/utils/cn"
import React from "react"

export function Label(props: React.LabelHTMLAttributes<HTMLLabelElement>){
  return <label {...props} className={cn("text-sm text-[var(--color-text-muted)]", props.className)} />
}
