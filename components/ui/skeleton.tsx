import { cn } from "@/utils/cn"
import React from "react"

export function Skeleton({className}: {className?: string}){
  return <div className={cn("animate-pulse bg-[var(--color-light)] rounded", className)} />
}
