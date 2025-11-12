import { cn } from "@/utils/cn"
import React from "react"

import React from "react"
export function Tabs({tabs, value, onChange}:{tabs:string[], value:string, onChange:(v:string)=>void}){
  return <div className="flex gap-2">
    {tabs.map(t => <button key={t} onClick={()=>onChange(t)} className={cn("px-3 py-2 rounded-xl",
      value===t ? "bg-[var(--color-accent-gold)] text-[var(--color-text-dark)]" : "bg-[var(--color-light)]")}>{t}</button>)}
  </div>
}
